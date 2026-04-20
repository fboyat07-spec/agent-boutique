const SkillGraph = require('../models/SkillGraph');
const StudentService = require('./StudentService');
const { chat } = require('./openaiService');

/**
 * Advanced Adaptive Learning Engine
 * Real-time adaptation with root cause analysis and skill graph traversal
 */
class AdvancedAdaptiveEngine {
  constructor() {
    this.skillGraph = new SkillGraph();
    this.difficultyThresholds = {
      too_easy: 0.8,    // 80% correct -> increase difficulty
      optimal: 0.6,      // 60-80% correct -> maintain difficulty
      too_hard: 0.4     // <40% correct -> decrease difficulty
    };
    this.recentPerformanceWindow = 10;
    this.learningVelocityWindow = 5;
  }

  async generateNextExercise(studentId, context = {}) {
    try {
      const student = await StudentService.getStudent(studentId);
      
      // Get comprehensive adaptive recommendations
      const recommendations = await this.getAdaptiveRecommendations(studentId);
      
      // Select optimal skill to practice
      const selectedSkill = this.selectOptimalSkill(recommendations, context, student);
      
      if (!selectedSkill) {
        throw new Error('Aucune compétence appropriée trouvée');
      }
      
      // Generate exercise with adaptive difficulty and personalization
      const exercise = await this.generatePersonalizedExercise(selectedSkill, student, context);
      
      // Update learning context
      const learningContext = this.updateLearningContext(student, selectedSkill, exercise);
      
      return {
        exercise,
        learning_context: learningContext,
        recommendations: recommendations,
        adaptive_adjustments: this.getAdaptiveAdjustments(student, selectedSkill),
        root_cause_insights: this.getRootCauseInsights(student, selectedSkill)
      };
    } catch (error) {
      throw new Error(`Erreur génération exercice: ${error.message}`);
    }
  }

  async getAdaptiveRecommendations(studentId) {
    const student = await StudentService.getStudent(studentId);
    
    // Get recommended skills based on current mastery and grade
    const recommendations = this.skillGraph.getRecommendedSkills(student.mastery, student.grade);
    
    // Find root causes for weak skills
    const weakSkills = student.getWeakSkills().map(ws => ws.skill);
    const rootCauses = this.skillGraph.findRootCauses(weakSkills, student.mastery);
    
    // Analyze learning patterns
    const learningPatterns = this.analyzeLearningPatterns(student);
    
    // Generate next exercise recommendations
    const nextExercises = this.generateExerciseRecommendations(student, recommendations, rootCauses, learningPatterns);
    
    return {
      recommendations: nextExercises.slice(0, 5),
      weak_skills: student.getWeakSkills(),
      strong_skills: student.getStrongSkills(),
      root_causes: rootCauses,
      learning_patterns: learningPatterns,
      session_stats: student.getSessionStats(),
      skill_mastery: student.mastery
    };
  }

  selectOptimalSkill(recommendations, context, student) {
    const { preferred_skill, force_review = false, session_type = 'learning' } = context;
    
    // If specific skill requested
    if (preferred_skill) {
      const skill = recommendations.recommendations.find(r => r.skill === preferred_skill);
      if (skill) return skill;
    }
    
    // Force review mode - focus on weak skills and root causes
    if (force_review || session_type === 'remediation') {
      const weakSkills = recommendations.recommendations.filter(r => r.priority === 'high');
      if (weakSkills.length > 0) {
        return weakSkills[0];
      }
    }
    
    // Normal adaptive selection with multiple factors
    const availableSkills = recommendations.recommendations.filter(skill => {
      // Avoid repeating same skill too much
      const recentFrequency = this.getRecentSkillFrequency(student, skill.skill);
      return recentFrequency < 0.6;
    });
    
    if (availableSkills.length === 0) {
      return recommendations.recommendations[0];
    }
    
    // Advanced weighted selection
    return this.advancedSkillSelection(availableSkills, student, recommendations);
  }

  advancedSkillSelection(skills, student, recommendations) {
    const weights = skills.map(skill => {
      let weight = 1;
      
      // Priority weighting
      if (skill.priority === 'high') weight *= 3;
      else if (skill.priority === 'medium') weight *= 2;
      
      // Mastery gap weighting
      weight *= (1 - skill.mastery);
      
      // Root cause weighting
      if (skill.reason === 'root_cause') weight *= 2.5;
      
      // Learning velocity adjustment
      const velocity = this.calculateLearningVelocity(student, skill.skill);
      if (velocity < 0) weight *= 1.5; // Boost struggling skills
      else if (velocity > 0.2) weight *= 0.8; // Slow down rapidly improving skills
      
      // Motivation factor
      const motivation = this.calculateMotivationLevel(student);
      if (motivation < 0.3 && skill.mastery > 0.5) weight *= 1.5; // Boost confidence-building
      
      // Time of day adjustment
      const timeFactor = this.getTimeOfDayFactor();
      weight *= timeFactor;
      
      return weight;
    });
    
    return this.weightedRandomSelection(skills, weights);
  }

  async generatePersonalizedExercise(skillInfo, student, context) {
    const skill = this.skillGraph.getSkill(skillInfo.skill);
    const difficulty = this.calculateOptimalDifficulty(skillInfo.mastery, student, skillInfo.skill);
    
    const exercise = {
      exercise_id: require('uuid').v4(),
      skill: skillInfo.skill,
      skill_name: skill.name,
      difficulty: difficulty,
      question: await this.generatePersonalizedQuestion(skill, difficulty, student, context),
      correct_answer: null,
      explanation_template: this.generatePersonalizedExplanation(skill, student),
      hints: this.generatePersonalizedHints(skill, difficulty, student),
      estimated_time: skill.estimated_time,
      xp_value: this.calculateAdaptiveXPValue(skillInfo, difficulty, student),
      coin_value: this.calculateAdaptiveCoinValue(skillInfo, difficulty, student),
      adaptive_features: {
        root_cause_focus: skillInfo.reason === 'root_cause',
        mastery_gap: 1 - skillInfo.mastery,
        confidence_level: this.calculateConfidence(student, skillInfo.skill),
        learning_velocity: this.calculateLearningVelocity(student, skillInfo.skill),
        motivation_factor: this.calculateMotivationLevel(student),
        personalization_level: this.calculatePersonalizationLevel(student)
      }
    };
    
    // Generate actual question and answer
    const questionData = await this.generateQuestionData(skill, difficulty, student, context);
    exercise.question = questionData.question;
    exercise.correct_answer = questionData.answer;
    exercise.options = questionData.options;
    exercise.media_url = questionData.media_url;
    
    return exercise;
  }

  async generatePersonalizedQuestion(skill, difficulty, student, context) {
    // Use AI to generate personalized questions
    const personalizationContext = this.buildPersonalizationContext(student, skill, context);
    
    const systemPrompt = `Tu es un professeur expert pour enfants de ${student.age} ans (${student.grade}).
Génère une question engageante et personnalisée pour la compétence "${skill.name}".
Contexte de l'élève: ${personalizationContext}
Réponds UNIQUEMENT en JSON valide, sans markdown.`;

    const userPrompt = `
Compétence: ${skill.name} (${skill.id})
Difficulté: ${difficulty}
Âge: ${student.age} ans
Classe: ${student.grade}
Niveau de maîtrise actuel: ${student.mastery[skill.id] || 0}

Génère une question JSON:
{
  "question": "question personnalisée engageante",
  "answer": "réponse correcte",
  "options": ["option1", "option2", "option3", "option4"],
  "explanation": "explication adaptée",
  "media_url": "URL optionnelle d'image/audio",
  "context": "contexte utilisé pour la personnalisation"
}`;

    try {
      const result = await chat(systemPrompt, userPrompt, true, { 
        timeoutMs: 5000, 
        maxAttempts: 2 
      });
      
      if (result.question && !result.demo) {
        return result.question;
      }
    } catch (error) {
      console.log('AI generation failed, using fallback');
    }
    
    // Fallback to template-based generation
    return this.generateTemplateQuestion(skill, difficulty, student);
  }

  buildPersonalizationContext(student, skill, context) {
    const interests = student.preferences?.favorite_subjects || [];
    const recentTopics = this.getRecentTopics(student);
    const learningStyle = student.preferences?.learning_style || 'visual';
    
    return `
Intérêts: ${interests.join(', ') || 'non spécifiés'}
Style d'apprentissage: ${learningStyle}
Sujets récents: ${recentTopics.join(', ') || 'aucun'}
Niveau: ${student.level} (XP: ${student.xp})
Série actuelle: ${student.streak} jours
Objectifs: ${JSON.stringify(student.goals)}
`;
  }

  generateTemplateQuestion(skill, difficulty, student) {
    const templates = {
      counting: {
        easy: `Compte les objets: ${this.getEmojisForCounting(5)}`,
        medium: `Combien y a-t-il de ${this.getPersonalizedObject(student)} dans cette collection ?`,
        hard: `Résous ce problème: ${this.generateCountingProblem(difficulty, student)}`
      },
      addition: {
        easy: `${this.getRandomNumber(1, 10)} + ${this.getRandomNumber(1, 10)} = ?`,
        medium: `${this.getStudentName(student)} a ${this.getRandomNumber(10, 50)} ${this.getPersonalizedObject(student)}. Il en gagne ${this.getRandomNumber(5, 20)}. Combien en a-t-il maintenant ?`,
        hard: `Calcule: ${this.getRandomNumber(50, 100)} + ${this.getRandomNumber(50, 100)} = ?`
      },
      multiplication: {
        easy: `${this.getRandomNumber(2, 5)} × ${this.getRandomNumber(2, 5)} = ?`,
        medium: `${this.getStudentName(student)} a ${this.getRandomNumber(3, 8)} boîtes de ${this.getRandomNumber(2, 6)} ${this.getPersonalizedObject(student)} chacune. Combien en a-t-il au total ?`,
        hard: `${this.getRandomNumber(11, 15)} × ${this.getRandomNumber(11, 15)} = ?`
      }
    };
    
    const skillTemplates = templates[skill.id];
    if (!skillTemplates) {
      return `Exercice de ${skill.name} (niveau ${difficulty}) pour ${student.first_name}`;
    }
    
    return skillTemplates[difficulty] || skillTemplates.medium;
  }

  async generateQuestionData(skill, difficulty, student, context) {
    // Try AI generation first
    try {
      const aiData = await this.generateAIQuestionData(skill, difficulty, student, context);
      if (aiData) return aiData;
    } catch (error) {
      console.log('AI question generation failed, using fallback');
    }
    
    // Fallback to template-based generation
    return this.generateTemplateQuestionData(skill, difficulty, student);
  }

  async generateAIQuestionData(skill, difficulty, student, context) {
    const personalizationContext = this.buildPersonalizationContext(student, skill, context);
    
    const systemPrompt = `Tu es un professeur expert. Génère des données d'exercice complètes et valides.`;
    
    const userPrompt = `
Compétence: ${skill.name} (${skill.id})
Difficulté: ${difficulty}
Élève: ${student.first_name}, ${student.age} ans, ${student.grade}
Contexte: ${personalizationContext}

Génère des données d'exercice JSON:
{
  "question": "question complète",
  "answer": "réponse correcte (nombre ou texte)",
  "options": ["option1", "option2", "option3", "option4"],
  "explanation": "explication claire",
  "media_url": "URL d'image si applicable"
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

  generateTemplateQuestionData(skill, difficulty, student) {
    switch (skill.id) {
      case 'counting':
        return this.generateCountingQuestionData(difficulty, student);
      case 'addition':
        return this.generateAdditionQuestionData(difficulty, student);
      case 'multiplication':
        return this.generateMultiplicationQuestionData(difficulty, student);
      default:
        return {
          question: this.generateTemplateQuestion(skill, difficulty, student),
          answer: '42',
          options: ['42', '24', '12', '48'],
          explanation: 'Réfléchis étape par étape.',
          media_url: null
        };
    }
  }

  generateCountingQuestionData(difficulty, student) {
    if (difficulty === 'easy') {
      const count = this.getRandomNumber(3, 8);
      const objects = this.getEmojisForCounting(count);
      return {
        question: `Compte les objets: ${objects}`,
        answer: count.toString(),
        options: this.generateOptions(count, [count-1, count+1, count+2]),
        explanation: `Il y a bien ${count} objets. Compte-les un par un: 1, 2, 3...`,
        media_url: null
      };
    }
    
    const a = this.getRandomNumber(5, 15);
    const b = this.getRandomNumber(3, 10);
    const answer = a + b;
    
    return {
      question: `${this.getStudentName(student)} a ${a} ${this.getPersonalizedObject(student)} et ${b} ${this.getPersonalizedObject(student, true)}. Combien en a-t-il au total ?`,
      answer: answer.toString(),
      options: this.generateOptions(answer, [answer-5, answer+5, answer+10]),
      explanation: `${a} + ${b} = ${answer}. Additionne les deux quantités.`,
      media_url: null
    };
  }

  generateAdditionQuestionData(difficulty, student) {
    let max = difficulty === 'easy' ? 10 : (difficulty === 'medium' ? 50 : 100);
    const a = this.getRandomNumber(1, max);
    const b = this.getRandomNumber(1, max);
    const answer = a + b;
    
    return {
      question: `${a} + ${b} = ?`,
      answer: answer.toString(),
      options: this.generateOptions(answer, [answer-10, answer+10, answer+20]),
      explanation: `${a} + ${b} = ${answer}. Additionne les unités, puis les dizaines.`,
      media_url: null
    };
  }

  generateMultiplicationQuestionData(difficulty, student) {
    let max = difficulty === 'easy' ? 5 : (difficulty === 'medium' ? 10 : 15);
    const a = this.getRandomNumber(2, max);
    const b = this.getRandomNumber(2, max);
    const answer = a * b;
    
    return {
      question: `${a} × ${b} = ?`,
      answer: answer.toString(),
      options: this.generateOptions(answer, [answer-5, answer+5, answer*2]),
      explanation: `${a} × ${b} = ${answer}. C'est comme additionner ${a} fois le nombre ${b}.`,
      media_url: null
    };
  }

  // Helper methods for personalization
  getStudentName(student) {
    return student.first_name || 'L\'élève';
  }

  getPersonalizedObject(student, plural = false) {
    const objects = ['livres', 'jeux', 'bonbons', 'stickers', 'crayons', 'billes', 'cartes'];
    const interests = student.preferences?.favorite_subjects || [];
    
    // Use interests if available
    if (interests.length > 0) {
      const interest = interests[Math.floor(Math.random() * interests.length)];
      if (interest.includes('sport')) return plural ? 'ballons' : 'ballon';
      if (interest.includes('musique')) return plural ? 'notes' : 'note';
      if (interest.includes('nature')) return plural ? 'feuilles' : 'feuille';
    }
    
    return objects[Math.floor(Math.random() * objects.length)];
  }

  getEmojisForCounting(count) {
    const emojis = ['🍎', '⭐', '🎈', '🎯', '🌟', '🍓', '🎨', '📚'];
    const emoji = emojis[Math.floor(Math.random() * emojis.length)];
    return emoji.repeat(count);
  }

  getRecentTopics(student) {
    const recentExercises = student.history.slice(-10);
    const topics = recentExercises.map(ex => ex.skill);
    return [...new Set(topics)];
  }

  calculateOptimalDifficulty(mastery, student, skillId) {
    const recentPerformance = this.getRecentSkillPerformance(student, skillId);
    const learningVelocity = this.calculateLearningVelocity(student, skillId);
    
    // Base difficulty on mastery
    let difficulty = mastery < 0.3 ? 'easy' : mastery < 0.7 ? 'medium' : 'hard';
    
    // Adjust based on recent performance
    if (recentPerformance > 0.8 && difficulty !== 'hard') {
      difficulty = difficulty === 'easy' ? 'medium' : 'hard';
    } else if (recentPerformance < 0.4 && difficulty !== 'easy') {
      difficulty = difficulty === 'hard' ? 'medium' : 'easy';
    }
    
    // Adjust based on learning velocity
    if (learningVelocity < -0.1 && difficulty !== 'easy') {
      difficulty = difficulty === 'hard' ? 'medium' : 'easy';
    }
    
    return difficulty;
  }

  getRecentSkillPerformance(student, skillId) {
    const recentExercises = student.history.slice(-this.recentPerformanceWindow);
    const skillExercises = recentExercises.filter(ex => ex.skill === skillId);
    
    if (skillExercises.length === 0) return 0.5;
    
    const correct = skillExercises.filter(ex => ex.correct).length;
    return correct / skillExercises.length;
  }

  calculateLearningVelocity(student, skillId) {
    const recentExercises = student.history.slice(-this.learningVelocityWindow * 2);
    const skillExercises = recentExercises.filter(ex => ex.skill === skillId);
    
    if (skillExercises.length < this.learningVelocityWindow) return 0;
    
    const firstHalf = skillExercises.slice(0, Math.floor(skillExercises.length / 2));
    const secondHalf = skillExercises.slice(Math.floor(skillExercises.length / 2));
    
    const firstAccuracy = firstHalf.filter(ex => ex.correct).length / firstHalf.length;
    const secondAccuracy = secondHalf.filter(ex => ex.correct).length / secondHalf.length;
    
    return secondAccuracy - firstAccuracy;
  }

  calculateAdaptiveXPValue(skillInfo, difficulty, student) {
    const baseXP = 10;
    const difficultyMultiplier = { easy: 1, medium: 1.5, hard: 2 }[difficulty] || 1;
    const masteryBonus = (1 - skillInfo.mastery) * 10;
    const streakBonus = Math.min(student.streak / 10, 0.5) * 5;
    const motivationBonus = this.calculateMotivationLevel(student) < 0.3 ? 5 : 0;
    
    return Math.round(baseXP * difficultyMultiplier + masteryBonus + streakBonus + motivationBonus);
  }

  calculateAdaptiveCoinValue(skillInfo, difficulty, student) {
    const baseCoins = 5;
    const difficultyMultiplier = { easy: 1, medium: 2, hard: 3 }[difficulty] || 1;
    const masteryBonus = (1 - skillInfo.mastery) * 5;
    
    return Math.round(baseCoins * difficultyMultiplier + masteryBonus);
  }

  // Additional advanced methods...
  analyzeLearningPatterns(student) {
    const recentExercises = student.history.slice(-20);
    
    return {
      best_time_of_day: this.getBestTimeOfDay(student),
      optimal_session_length: this.getOptimalSessionLength(student),
      preferred_difficulty: this.getPreferredDifficulty(student),
      learning_velocity: this.getOverallLearningVelocity(student),
      attention_span: this.calculateAttentionSpan(student),
      error_patterns: this.identifyErrorPatterns(student)
    };
  }

  generateExerciseRecommendations(student, recommendations, rootCauses, learningPatterns) {
    const nextExercises = [];
    
    // Prioritize root causes
    if (rootCauses.length > 0) {
      rootCauses.forEach(cause => {
        cause.recommended_path.forEach(skillId => {
          const skill = this.skillGraph.getSkill(skillId);
          const mastery = student.mastery[skillId] || 0;
          
          nextExercises.push({
            skill: skillId,
            skill_name: skill.name,
            priority: 'high',
            reason: 'root_cause',
            mastery,
            difficulty: this.calculateOptimalDifficulty(mastery, student, skillId),
            confidence: cause.confidence,
            estimated_success_rate: this.estimateSuccessRate(student, skillId)
          });
        });
      });
    }
    
    // Add regular recommendations
    recommendations.slice(0, 5).forEach(rec => {
      if (!nextExercises.find(ex => ex.skill === rec.skill.id)) {
        nextExercises.push({
          skill: rec.skill.id,
          skill_name: rec.skill.name,
          priority: rec.priority,
          reason: 'adaptive',
          mastery: rec.mastery,
          difficulty: this.calculateOptimalDifficulty(rec.mastery, student, rec.skill.id),
          confidence: 0.7,
          estimated_success_rate: this.estimateSuccessRate(student, rec.skill.id)
        });
      }
    });
    
    return nextExercises;
  }

  // Utility methods
  weightedRandomSelection(items, weights) {
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let random = Math.random() * totalWeight;
    
    for (let i = 0; i < items.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return items[i];
      }
    }
    
    return items[0];
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

  // Placeholder methods for full implementation
  updateLearningContext(student, selectedSkill, exercise) {
    return {
      current_mastery: student.mastery[selectedSkill.skill] || 0,
      target_mastery: Math.min(1.0, (student.mastery[selectedSkill.skill] || 0) + 0.1),
      learning_velocity: this.calculateLearningVelocity(student, selectedSkill.skill),
      confidence_level: this.calculateConfidence(student, selectedSkill.skill)
    };
  }

  getAdaptiveAdjustments(student, selectedSkill) {
    return {
      difficulty_suggestion: 'maintain',
      session_pacing: 'normal',
      intervention_needed: false
    };
  }

  getRootCauseInsights(student, selectedSkill) {
    return {
      has_root_cause: false,
      confidence: 0.5
    };
  }

  getRecentSkillFrequency(student, skillId) {
    return Math.random() * 0.8; // Placeholder
  }

  calculateConfidence(student, skillId) {
    return 0.7; // Placeholder
  }

  calculateMotivationLevel(student) {
    return 0.8; // Placeholder
  }

  getTimeOfDayFactor() {
    return 1.0; // Placeholder
  }

  generatePersonalizedExplanation(skill, student) {
    return `Continue à pratiquer ${skill.name} !`;
  }

  generatePersonalizedHints(skill, difficulty, student) {
    return ['Prends ton temps', 'Réfléchis étape par étape'];
  }

  calculatePersonalizationLevel(student) {
    return 'medium';
  }

  estimateSuccessRate(student, skillId) {
    return 0.6; // Placeholder
  }

  getBestTimeOfDay(student) {
    return 'morning'; // Placeholder
  }

  getOptimalSessionLength(student) {
    return 20; // Placeholder
  }

  getPreferredDifficulty(student) {
    return 'medium'; // Placeholder
  }

  getOverallLearningVelocity(student) {
    return 0.1; // Placeholder
  }

  calculateAttentionSpan(student) {
    return 15; // Placeholder
  }

  identifyErrorPatterns(student) {
    return []; // Placeholder
  }
}

module.exports = new AdvancedAdaptiveEngine();
