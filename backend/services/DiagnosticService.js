const SkillGraph = require('../models/SkillGraph');
const StudentService = require('./StudentService');
const { chat } = require('./openaiService');
const { v4: uuidv4 } = require('uuid');

/**
 * Adaptive Diagnostic Service
 * Intelligent assessment system that adapts in real-time
 */
class DiagnosticService {
  constructor() {
    this.skillGraph = new SkillGraph();
    this.minQuestionsPerSkill = 3;
    this.maxDiagnosticQuestions = 15;
    this.confidenceThreshold = 0.7;
    this.adaptiveThresholds = {
      mastery: 0.8,
      struggling: 0.4,
      unknown: 0.1
    };
  }

  async startDiagnostic(studentId, options = {}) {
    try {
      const student = await StudentService.getStudent(studentId);
      
      const diagnostic = {
        diagnostic_id: uuidv4(),
        student_id: studentId,
        grade: student.grade,
        age: student.age,
        start_time: new Date().toISOString(),
        end_time: null,
        status: 'in_progress',
        questions_asked: [],
        answers: [],
        current_mastery: { ...student.mastery },
        estimated_mastery: {},
        confidence_scores: {},
        adaptive_path: [],
        root_cause_analysis: null,
        recommendations: [],
        final_assessment: null,
        options: {
          focus_areas: options.focus_areas || [], // Specific skills to focus on
          difficulty_mode: options.difficulty_mode || 'adaptive', // 'easy', 'medium', 'hard', 'adaptive'
          max_questions: options.max_questions || this.maxDiagnosticQuestions,
          time_limit: options.time_limit || null, // minutes
          include_voice: options.include_voice || false
        }
      };

      // Generate initial diagnostic path
      diagnostic.adaptive_path = await this.generateInitialDiagnosticPath(student, diagnostic.options);
      
      return diagnostic;
    } catch (error) {
      throw new Error(`Erreur démarrage diagnostic: ${error.message}`);
    }
  }

  async generateInitialDiagnosticPath(student, options) {
    const gradeSkills = this.skillGraph.getSkillsByGrade(student.grade);
    let skillsToAssess = gradeSkills;

    // Filter by focus areas if specified
    if (options.focus_areas.length > 0) {
      skillsToAssess = gradeSkills.filter(skill => 
        options.focus_areas.includes(skill.id) || 
        options.focus_areas.includes(skill.category)
      );
    }

    // Prioritize foundational skills
    const prioritizedSkills = skillsToAssess
      .map(skill => ({
        skill,
        priority: this.calculateSkillPriority(skill, student),
        current_mastery: student.mastery[skill.id] || 0
      }))
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 12); // Limit to 12 skills for initial assessment

    // Create adaptive path with question counts
    const adaptivePath = [];
    prioritizedSkills.forEach(({ skill, priority, current_mastery }) => {
      const questionCount = this.calculateQuestionCount(current_mastery, priority);
      
      adaptivePath.push({
        skill_id: skill.id,
        skill_name: skill.name,
        category: skill.category,
        priority,
        questions_needed: questionCount,
        questions_asked: 0,
        correct_answers: 0,
        current_mastery,
        estimated_mastery: null,
        confidence: 0,
        status: 'pending' // 'pending' | 'in_progress' | 'completed'
      });
    });

    return adaptivePath;
  }

  calculateSkillPriority(skill, student) {
    let priority = 1;

    // Foundational skills get higher priority
    const foundationalSkills = ['counting', 'number_recognition', 'addition_concept'];
    if (foundationalSkills.includes(skill.id)) {
      priority *= 3;
    }

    // Skills with lower mastery get higher priority
    const currentMastery = student.mastery[skill.id] || 0;
    priority *= (1.1 - currentMastery);

    // Grade-appropriate skills
    const gradeOrder = ['CP', 'CE1', 'CE2', 'CM1', 'CM2', '6e'];
    const skillGradeIndex = gradeOrder.indexOf(skill.grade_min);
    const studentGradeIndex = gradeOrder.indexOf(student.grade);
    const gradeDiff = Math.abs(skillGradeIndex - studentGradeIndex);
    priority *= Math.max(0.5, 1 - gradeDiff * 0.2);

    // Category importance
    const importantCategories = ['operations', 'numbers'];
    if (importantCategories.includes(skill.category)) {
      priority *= 1.5;
    }

    return priority;
  }

  calculateQuestionCount(currentMastery, priority) {
    if (currentMastery === 0) return 5; // Unknown skill needs more questions
    if (currentMastery < 0.3) return 4; // Low mastery
    if (currentMastery < 0.7) return 3; // Medium mastery
    return 2; // High mastery - just confirm
  }

  async getNextDiagnosticQuestion(diagnosticId) {
    try {
      const diagnostic = await this.getDiagnostic(diagnosticId);
      
      if (diagnostic.status !== 'in_progress') {
        throw new Error('Diagnostic terminé ou non trouvé');
      }

      // Check if diagnostic should end
      if (this.shouldEndDiagnostic(diagnostic)) {
        return await this.completeDiagnostic(diagnosticId);
      }

      // Select next skill to assess
      const nextSkill = this.selectNextSkill(diagnostic);
      if (!nextSkill) {
        return await this.completeDiagnostic(diagnosticId);
      }

      // Generate question for selected skill
      const question = await this.generateDiagnosticQuestion(nextSkill, diagnostic);
      
      // Update diagnostic state
      nextSkill.status = 'in_progress';
      nextSkill.questions_asked += 1;
      
      diagnostic.questions_asked.push({
        question_id: question.question_id,
        skill_id: nextSkill.skill_id,
        timestamp: new Date().toISOString(),
        ...question
      });

      return {
        question,
        diagnostic_progress: this.calculateDiagnosticProgress(diagnostic),
        current_skill: nextSkill,
        estimated_remaining_questions: this.estimateRemainingQuestions(diagnostic)
      };
    } catch (error) {
      throw new Error(`Erreur génération question diagnostic: ${error.message}`);
    }
  }

  selectNextSkill(diagnostic) {
    // Find skills that still need questions
    const pendingSkills = diagnostic.adaptive_path.filter(skill => 
      skill.status === 'pending' || 
      (skill.status === 'in_progress' && skill.questions_asked < skill.questions_needed)
    );

    if (pendingSkills.length === 0) {
      return null;
    }

    // Prioritize based on confidence and importance
    const prioritizedSkills = pendingSkills.map(skill => ({
      ...skill,
      selection_priority: this.calculateSelectionPriority(skill, diagnostic)
    })).sort((a, b) => b.selection_priority - a.selection_priority);

    return prioritizedSkills[0];
  }

  calculateSelectionPriority(skill, diagnostic) {
    let priority = skill.priority;

    // Skills with low confidence get higher priority
    priority *= (1.1 - skill.confidence);

    // Skills that haven't been started yet get priority
    if (skill.status === 'pending') {
      priority *= 2;
    }

    // Foundational skills get boost
    const foundationalSkills = ['counting', 'addition_concept', 'subtraction_concept'];
    if (foundationalSkills.includes(skill.skill_id)) {
      priority *= 1.5;
    }

    // Adjust based on current performance
    if (skill.questions_asked > 0) {
      const accuracy = skill.correct_answers / skill.questions_asked;
      if (accuracy < 0.3) {
        priority *= 1.3; // Struggling skills need more attention
      } else if (accuracy > 0.8) {
        priority *= 0.7; // Mastered skills need less attention
      }
    }

    return priority;
  }

  async generateDiagnosticQuestion(skillInfo, diagnostic) {
    const skill = this.skillGraph.getSkill(skillInfo.skill_id);
    const difficulty = this.calculateDiagnosticDifficulty(skillInfo, diagnostic);
    
    const question = {
      question_id: uuidv4(),
      skill_id: skillInfo.skill_id,
      skill_name: skill.name,
      category: skill.category,
      difficulty: difficulty,
      question: await this.generateDiagnosticQuestionText(skill, difficulty, diagnostic),
      correct_answer: null,
      options: [],
      explanation: '',
      hints: [],
      time_limit: this.calculateTimeLimit(skill, difficulty),
      points: this.calculateDiagnosticPoints(skill, difficulty),
      adaptive_features: {
        diagnostic_mode: true,
        confidence_building: skillInfo.current_mastery < 0.3,
        mastery_confirmation: skillInfo.current_mastery > 0.7
      }
    };

    // Generate question data
    const questionData = await this.generateDiagnosticQuestionData(skill, difficulty, diagnostic);
    question.question = questionData.question;
    question.correct_answer = questionData.answer;
    question.options = questionData.options;
    question.explanation = questionData.explanation;

    return question;
  }

  calculateDiagnosticDifficulty(skillInfo, diagnostic) {
    const currentMastery = skillInfo.current_mastery;
    const questionsAsked = skillInfo.questions_asked;
    const correctAnswers = skillInfo.correct_answers;
    
    // Start with current mastery estimate
    if (questionsAsked === 0) {
      if (currentMastery === 0) return 'medium'; // Unknown skill
      if (currentMastery < 0.3) return 'easy';
      if (currentMastery < 0.7) return 'medium';
      return 'hard';
    }

    // Adapt based on performance
    const accuracy = correctAnswers / questionsAsked;
    
    if (accuracy > 0.8) {
      return 'hard'; // Increase difficulty
    } else if (accuracy < 0.4) {
      return 'easy'; // Decrease difficulty
    }
    
    return 'medium';
  }

  async generateDiagnosticQuestionText(skill, difficulty, diagnostic) {
    const student = await StudentService.getStudent(diagnostic.student_id);
    
    // Use AI for personalized question generation
    try {
      const systemPrompt = `Tu es un évaluateur expert pour enfants de ${student.age} ans (${student.grade}).
Génère une question de diagnostic précise pour évaluer la compétence "${skill.name}".
La question doit être claire, non ambiguë, et permettre d'évaluer précisément le niveau de maîtrise.
Réponds UNIQUEMENT en JSON valide, sans markdown.`;

      const userPrompt = `
Compétence: ${skill.name} (${skill.id})
Difficulté: ${difficulty}
Âge: ${student.age} ans
Classe: ${student.grade}
Maîtrise actuelle estimée: ${diagnostic.current_mastery[skill.id] || 0}

Génère une question de diagnostic JSON:
{
  "question": "question précise et non ambiguë",
  "answer": "réponse correcte exacte",
  "options": ["option1", "option2", "option3", "option4"],
  "explanation": "explication pédagogique claire",
  "validation_criteria": "critères spécifiques pour valider la compétence"
}`;

      const result = await chat(systemPrompt, userPrompt, true, { 
        timeoutMs: 4000, 
        maxAttempts: 2 
      });
      
      if (result.question && !result.demo) {
        return result.question;
      }
    } catch (error) {
      console.log('AI diagnostic question generation failed, using template');
    }

    // Fallback to template-based generation
    return this.generateDiagnosticQuestionTemplate(skill, difficulty, student);
  }

  generateDiagnosticQuestionTemplate(skill, difficulty, student) {
    const templates = {
      counting: {
        easy: `Compte précisément: ${this.getEmojisForCounting(6)}`,
        medium: `Combien y a-t-il d'objets dans cette collection ?`,
        hard: `Résous ce problème de comptage complexe: ${this.generateComplexCountingProblem()}`
      },
      addition: {
        easy: `${this.getRandomNumber(5, 15)} + ${this.getRandomNumber(5, 15)} = ?`,
        medium: `${this.getRandomNumber(25, 50)} + ${this.getRandomNumber(25, 50)} = ?`,
        hard: `${this.getRandomNumber(75, 150)} + ${this.getRandomNumber(75, 150)} = ?`
      },
      multiplication: {
        easy: `${this.getRandomNumber(2, 6)} × ${this.getRandomNumber(2, 6)} = ?`,
        medium: `${this.getRandomNumber(7, 12)} × ${this.getRandomNumber(7, 12)} = ?`,
        hard: `${this.getRandomNumber(13, 20)} × ${this.getRandomNumber(13, 20)} = ?`
      }
    };

    const skillTemplates = templates[skill.id];
    if (!skillTemplates) {
      return `Question de diagnostic pour ${skill.name} (niveau ${difficulty})`;
    }

    return skillTemplates[difficulty] || skillTemplates.medium;
  }

  async generateDiagnosticQuestionData(skill, difficulty, diagnostic) {
    const student = await StudentService.getStudent(diagnostic.student_id);
    
    // Try AI generation first
    try {
      const aiData = await this.generateAIDiagnosticQuestionData(skill, difficulty, student);
      if (aiData) return aiData;
    } catch (error) {
      console.log('AI diagnostic data generation failed, using template');
    }

    // Fallback to template
    return this.generateDiagnosticTemplateData(skill, difficulty, student);
  }

  async generateAIDiagnosticQuestionData(skill, difficulty, student) {
    const systemPrompt = `Tu es un expert en évaluation pédagogique. Génère des données de question de diagnostic précises et valides.`;
    
    const userPrompt = `
Compétence: ${skill.name} (${skill.id})
Difficulté: ${difficulty}
Élève: ${student.first_name}, ${student.age} ans

Génère des données JSON:
{
  "question": "question complète",
  "answer": "réponse correcte exacte",
  "options": ["option1", "option2", "option3", "option4"],
  "explanation": "explication pédagogique détaillée"
}`;

    const result = await chat(systemPrompt, userPrompt, true, { 
      timeoutMs: 3000, 
      maxAttempts: 1 
    });
    
    if (result.answer && !result.demo) {
      return result;
    }
    
    return null;
  }

  generateDiagnosticTemplateData(skill, difficulty, student) {
    switch (skill.id) {
      case 'counting':
        return this.generateDiagnosticCountingData(difficulty, student);
      case 'addition':
        return this.generateDiagnosticAdditionData(difficulty, student);
      case 'multiplication':
        return this.generateDiagnosticMultiplicationData(difficulty, student);
      default:
        return {
          question: this.generateDiagnosticQuestionTemplate(skill, difficulty, student),
          answer: '42',
          options: ['42', '24', '12', '48'],
          explanation: 'Solution expliquée étape par étape.'
        };
    }
  }

  generateDiagnosticCountingData(difficulty, student) {
    if (difficulty === 'easy') {
      const count = this.getRandomNumber(4, 8);
      return {
        question: `Compte précisément: ${this.getEmojisForCounting(count)}`,
        answer: count.toString(),
        options: this.generateOptions(count, [count-1, count+1, count+2]),
        explanation: `Il y a bien ${count} objets. Compte-les un par un: 1, 2, 3...`
      };
    }
    
    const a = this.getRandomNumber(8, 20);
    const b = this.getRandomNumber(5, 15);
    const answer = a + b;
    
    return {
      question: `Dans une boîte, il y a ${a} billes rouges et ${b} billes bleues. Combien y a-t-il de billes en tout ?`,
      answer: answer.toString(),
      options: this.generateOptions(answer, [answer-5, answer+5, answer+10]),
      explanation: `Additionne les deux quantités: ${a} + ${b} = ${answer} billes au total.`
    };
  }

  generateDiagnosticAdditionData(difficulty, student) {
    let max = difficulty === 'easy' ? 20 : (difficulty === 'medium' ? 50 : 100);
    const a = this.getRandomNumber(5, max);
    const b = this.getRandomNumber(5, max);
    const answer = a + b;
    
    return {
      question: `${a} + ${b} = ?`,
      answer: answer.toString(),
      options: this.generateOptions(answer, [answer-10, answer+10, answer+20]),
      explanation: `${a} + ${b} = ${answer}. Vérifie: ${answer} - ${a} = ${b}.`
    };
  }

  generateDiagnosticMultiplicationData(difficulty, student) {
    let max = difficulty === 'easy' ? 6 : (difficulty === 'medium' ? 12 : 15);
    const a = this.getRandomNumber(2, max);
    const b = this.getRandomNumber(2, max);
    const answer = a * b;
    
    return {
      question: `${a} × ${b} = ?`,
      answer: answer.toString(),
      options: this.generateOptions(answer, [answer-5, answer+5, answer*2]),
      explanation: `${a} × ${b} = ${answer}. C'est ${a} groupes de ${b} objets.`
    };
  }

  async submitDiagnosticAnswer(diagnosticId, questionId, answer, timeTaken = null) {
    try {
      const diagnostic = await this.getDiagnostic(diagnosticId);
      
      if (diagnostic.status !== 'in_progress') {
        throw new Error('Diagnostic terminé');
      }

      // Find the question
      const question = diagnostic.questions_asked.find(q => q.question_id === questionId);
      if (!question) {
        throw new Error('Question non trouvée');
      }

      // Record answer
      const answerRecord = {
        question_id: questionId,
        skill_id: question.skill_id,
        user_answer: answer,
        correct_answer: question.correct_answer,
        correct: answer === question.correct_answer,
        time_taken: timeTaken,
        timestamp: new Date().toISOString()
      };

      diagnostic.answers.push(answerRecord);

      // Update skill assessment
      const skillAssessment = diagnostic.adaptive_path.find(s => s.skill_id === question.skill_id);
      if (skillAssessment) {
        if (answerRecord.correct) {
          skillAssessment.correct_answers += 1;
        }
        
        // Update estimated mastery
        skillAssessment.estimated_mastery = this.calculateEstimatedMastery(skillAssessment);
        skillAssessment.confidence = this.calculateConfidence(skillAssessment);
        
        // Check if skill assessment is complete
        if (skillAssessment.questions_asked >= skillAssessment.questions_needed || 
            skillAssessment.confidence >= this.confidenceThreshold) {
          skillAssessment.status = 'completed';
        }
      }

      // Get next question or complete diagnostic
      const nextQuestion = await this.getNextDiagnosticQuestion(diagnosticId);
      
      return {
        answer_result: {
          correct: answerRecord.correct,
          correct_answer: question.correct_answer,
          explanation: question.explanation,
          points_earned: answerRecord.correct ? question.points : 0
        },
        skill_progress: skillAssessment,
        diagnostic_progress: this.calculateDiagnosticProgress(diagnostic),
        next_question: nextQuestion.question || null,
        diagnostic_complete: nextQuestion.diagnostic_complete || false
      };
    } catch (error) {
      throw new Error(`Erreur soumission réponse: ${error.message}`);
    }
  }

  calculateEstimatedMastery(skillAssessment) {
    if (skillAssessment.questions_asked === 0) {
      return skillAssessment.current_mastery;
    }

    const accuracy = skillAssessment.correct_answers / skillAssessment.questions_asked;
    
    // Weight new evidence more heavily
    const weight = Math.min(0.7, skillAssessment.questions_asked / 10);
    const newMastery = accuracy * weight + skillAssessment.current_mastery * (1 - weight);
    
    return Math.max(0, Math.min(1, newMastery));
  }

  calculateConfidence(skillAssessment) {
    if (skillAssessment.questions_asked === 0) {
      return 0;
    }

    // Confidence increases with more questions and consistent results
    const questionWeight = Math.min(1, skillAssessment.questions_asked / 5);
    const consistencyWeight = 1 - Math.abs(0.5 - (skillAssessment.correct_answers / skillAssessment.questions_asked)) * 2;
    
    return Math.min(1, questionWeight * consistencyWeight);
  }

  shouldEndDiagnostic(diagnostic) {
    // Check time limit
    if (diagnostic.options.time_limit) {
      const elapsed = (Date.now() - new Date(diagnostic.start_time)) / 1000 / 60; // minutes
      if (elapsed >= diagnostic.options.time_limit) {
        return true;
      }
    }

    // Check question limit
    if (diagnostic.questions_asked.length >= diagnostic.options.max_questions) {
      return true;
    }

    // Check if all skills are completed
    const completedSkills = diagnostic.adaptive_path.filter(s => s.status === 'completed');
    if (completedSkills.length === diagnostic.adaptive_path.length) {
      return true;
    }

    // Check if we have enough confidence
    const highConfidenceSkills = diagnostic.adaptive_path.filter(s => s.confidence >= this.confidenceThreshold);
    if (highConfidenceSkills.length >= Math.min(8, diagnostic.adaptive_path.length)) {
      return true;
    }

    return false;
  }

  async completeDiagnostic(diagnosticId) {
    try {
      const diagnostic = await this.getDiagnostic(diagnosticId);
      
      diagnostic.end_time = new Date().toISOString();
      diagnostic.status = 'completed';
      
      // Generate final assessment
      diagnostic.final_assessment = await this.generateFinalAssessment(diagnostic);
      
      // Update student mastery
      await this.updateStudentFromDiagnostic(diagnostic);
      
      return {
        diagnostic_complete: true,
        final_assessment: diagnostic.final_assessment,
        recommendations: diagnostic.final_assessment.recommendations
      };
    } catch (error) {
      throw new Error(`Erreur complétion diagnostic: ${error.message}`);
    }
  }

  async generateFinalAssessment(diagnostic) {
    const student = await StudentService.getStudent(diagnostic.student_id);
    
    // Calculate overall mastery
    const overallMastery = this.calculateOverallMastery(diagnostic);
    
    // Identify strengths and weaknesses
    const strengths = diagnostic.adaptive_path
      .filter(s => s.estimated_mastery >= 0.7 && s.confidence >= 0.6)
      .map(s => ({
        skill_id: s.skill_id,
        skill_name: s.skill_name,
        mastery: s.estimated_mastery,
        confidence: s.confidence
      }));
    
    const weaknesses = diagnostic.adaptive_path
      .filter(s => s.estimated_mastery <= 0.4 && s.confidence >= 0.5)
      .map(s => ({
        skill_id: s.skill_id,
        skill_name: s.skill_name,
        mastery: s.estimated_mastery,
        confidence: s.confidence
      }));
    
    // Root cause analysis
    const rootCauseAnalysis = this.skillGraph.findRootCauses(
      weaknesses.map(w => w.skill_id),
      Object.fromEntries(diagnostic.adaptive_path.map(s => [s.skill_id, s.estimated_mastery]))
    );
    
    // Generate recommendations
    const recommendations = await this.generateDiagnosticRecommendations(
      student, 
      strengths, 
      weaknesses, 
      rootCauseAnalysis
    );
    
    return {
      overall_mastery: overallMastery,
      mastery_level: this.getMasteryLevel(overallMastery),
      strengths,
      weaknesses,
      root_cause_analysis: rootCauseAnalysis,
      recommendations,
      estimated_grade_level: this.estimateGradeLevel(overallMastery),
      learning_velocity: this.calculateLearningVelocity(diagnostic),
      confidence_score: this.calculateOverallConfidence(diagnostic),
      next_steps: this.generateNextSteps(diagnostic)
    };
  }

  calculateOverallMastery(diagnostic) {
    const skills = diagnostic.adaptive_path.filter(s => s.confidence >= 0.5);
    if (skills.length === 0) return 0;
    
    const totalMastery = skills.reduce((sum, skill) => sum + skill.estimated_mastery, 0);
    return totalMastery / skills.length;
  }

  getMasteryLevel(mastery) {
    if (mastery >= 0.9) return 'expert';
    if (mastery >= 0.7) return 'advanced';
    if (mastery >= 0.5) return 'intermediate';
    if (mastery >= 0.3) return 'beginner';
    return 'novice';
  }

  async generateDiagnosticRecommendations(student, strengths, weaknesses, rootCauseAnalysis) {
    const recommendations = [];
    
    // Address root causes first
    if (rootCauseAnalysis.length > 0) {
      rootCauseAnalysis.forEach(cause => {
        recommendations.push({
          type: 'remediation',
          priority: 'high',
          title: `Renforcer les bases: ${cause.root_cause.join(', ')}`,
          description: `Les difficultés avec ${cause.observed_gap} viennent des lacunes dans: ${cause.root_cause.join(', ')}`,
          skills: cause.recommended_path,
          estimated_time: cause.recommended_path.length * 15, // minutes
          confidence: cause.confidence
        });
      });
    }
    
    // Strengthen weaknesses
    weaknesses.forEach(weakness => {
      recommendations.push({
        type: 'practice',
        priority: 'medium',
        title: `Pratiquer: ${weakness.skill_name}`,
        description: `Renforcer la compétence ${weakness.skill_name} avec des exercices adaptés`,
        skills: [weakness.skill_id],
        estimated_time: 20,
        confidence: weakness.confidence
      });
    });
    
    // Challenge strengths
    if (strengths.length > 0) {
      recommendations.push({
        type: 'challenge',
        priority: 'low',
        title: 'Défis avancés',
        description: 'Repousser tes limites avec des exercices plus complexes',
        skills: strengths.slice(0, 3).map(s => s.skill_id),
        estimated_time: 25,
        confidence: 0.8
      });
    }
    
    return recommendations;
  }

  async updateStudentFromDiagnostic(diagnostic) {
    const student = await StudentService.getStudent(diagnostic.student_id);
    
    // Update mastery estimates
    diagnostic.adaptive_path.forEach(skill => {
      if (skill.confidence >= 0.5) {
        student.mastery[skill.skill_id] = skill.estimated_mastery;
      }
    });
    
    // Update level estimate
    student.level_estimated = this.calculateOverallMastery(diagnostic);
    
    student.stats.updated_at = new Date().toISOString();
    
    return student;
  }

  // Utility methods
  calculateDiagnosticProgress(diagnostic) {
    const totalQuestions = diagnostic.adaptive_path.reduce((sum, skill) => sum + skill.questions_needed, 0);
    const askedQuestions = diagnostic.questions_asked.length;
    return Math.min(100, (askedQuestions / totalQuestions) * 100);
  }

  estimateRemainingQuestions(diagnostic) {
    const remaining = diagnostic.adaptive_path
      .filter(s => s.status !== 'completed')
      .reduce((sum, skill) => sum + Math.max(0, skill.questions_needed - skill.questions_asked), 0);
    
    return Math.min(remaining, diagnostic.options.max_questions - diagnostic.questions_asked.length);
  }

  calculateTimeLimit(skill, difficulty) {
    const baseTime = skill.estimated_time || 10; // minutes
    const difficultyMultiplier = { easy: 1.5, medium: 1, hard: 0.8 }[difficulty] || 1;
    return Math.round(baseTime * difficultyMultiplier);
  }

  calculateDiagnosticPoints(skill, difficulty) {
    const basePoints = 10;
    const difficultyMultiplier = { easy: 1, medium: 1.5, hard: 2 }[difficulty] || 1;
    return Math.round(basePoints * difficultyMultiplier);
  }

  estimateGradeLevel(mastery) {
    const gradeLevels = [
      { mastery: 0.1, grade: 'CP' },
      { mastery: 0.25, grade: 'CE1' },
      { mastery: 0.4, grade: 'CE2' },
      { mastery: 0.55, grade: 'CM1' },
      { mastery: 0.7, grade: 'CM2' },
      { mastery: 0.85, grade: '6e' }
    ];
    
    for (const level of gradeLevels) {
      if (mastery <= level.mastery) {
        return level.grade;
      }
    }
    
    return '6e+';
  }

  calculateLearningVelocity(diagnostic) {
    // Calculate how quickly the student is learning during diagnostic
    const skillsWithProgress = diagnostic.adaptive_path.filter(s => 
      s.questions_asked > 1 && s.estimated_mastery !== s.current_mastery
    );
    
    if (skillsWithProgress.length === 0) return 0;
    
    const totalProgress = skillsWithProgress.reduce((sum, skill) => 
      sum + Math.abs(skill.estimated_mastery - skill.current_mastery), 0
    );
    
    return totalProgress / skillsWithProgress.length;
  }

  calculateOverallConfidence(diagnostic) {
    const skills = diagnostic.adaptive_path.filter(s => s.questions_asked > 0);
    if (skills.length === 0) return 0;
    
    const totalConfidence = skills.reduce((sum, skill) => sum + skill.confidence, 0);
    return totalConfidence / skills.length;
  }

  generateNextSteps(diagnostic) {
    const steps = [];
    
    // Immediate next steps
    if (diagnostic.final_assessment.weaknesses.length > 0) {
      steps.push({
        action: 'start_remediation',
        title: 'Commencer les exercices de renforcement',
        description: 'Travailler sur les compétences identifiées comme faibles'
      });
    }
    
    steps.push({
      action: 'regular_practice',
      title: 'Pratique régulière',
      description: 'Faire 15-20 minutes d\'exercices chaque jour'
    });
    
    if (diagnostic.final_assessment.strengths.length > 0) {
      steps.push({
        action: 'explore_challenges',
        title: 'Explorer des défis',
        description: 'Utiliser les points forts pour relever de nouveaux défis'
      });
    }
    
    return steps;
  }

  // Helper methods
  getEmojisForCounting(count) {
    const emojis = ['🍎', '⭐', '🎈', '🎯', '🌟', '🍓', '🎨', '📚'];
    const emoji = emojis[Math.floor(Math.random() * emojis.length)];
    return emoji.repeat(count);
  }

  generateComplexCountingProblem() {
    const groups = this.getRandomNumber(2, 4);
    const objectsPerGroup = this.getRandomNumber(3, 8);
    return `${groups} groupes de ${objectsPerGroup} objets chacun`;
  }

  generateOptions(correct, wrongAnswers) {
    const options = [correct.toString(), ...wrongAnswers.map(w => w.toString())];
    return this.shuffleArray(options).slice(0, 4);
  }

  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  getRandomNumber(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  async getDiagnostic(diagnosticId) {
    // This would typically fetch from database
    // For now, return a placeholder
    throw new Error('Diagnostic storage not implemented');
  }
}

module.exports = new DiagnosticService();
