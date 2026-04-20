const StudentService = require('./StudentService');
const SkillGraph = require('../models/SkillGraph');
const { chat } = require('./openaiService');
const { v4: uuidv4 } = require('uuid');

/**
 * AI Tutor Service
 * Provides intelligent tutoring with text and voice capabilities
 */
class AITutorService {
  constructor() {
    this.skillGraph = new SkillGraph();
    this.tutoringModes = {
      explanatory: 'Expliquer les concepts',
      practice: 'Guider la pratique',
      remediation: 'Rattraper les lacunes',
      challenge: 'Proposer des défis',
      motivational: 'Motiver et encourager'
    };
    this.voiceSettings = {
      enabled: true,
      speed: 'normal', // 'slow', 'normal', 'fast'
      language: 'fr-FR',
      voice: 'female' // 'male', 'female', 'child'
    };
  }

  async startTutoringSession(studentId, options = {}) {
    try {
      const student = await StudentService.getStudent(studentId);
      
      const session = {
        session_id: uuidv4(),
        student_id: studentId,
        start_time: new Date().toISOString(),
        end_time: null,
        mode: options.mode || 'practice',
        focus_skills: options.focus_skills || [],
        context: {
          current_mastery: student.mastery,
          recent_performance: this.getRecentPerformance(student),
          learning_style: student.preferences?.learning_style || 'visual',
          mood: options.mood || 'neutral',
          goals: options.goals || student.goals
        },
        conversation: [],
        interventions: [],
        progress_tracking: {
          concepts_covered: [],
          skills_practiced: [],
          improvements_made: [],
          difficulties_encountered: []
        },
        voice_enabled: options.voice_enabled !== false && student.preferences?.voice_enabled !== false
      };

      // Generate initial greeting and assessment
      const initialMessage = await this.generateInitialMessage(session, student);
      session.conversation.push({
        type: 'tutor',
        timestamp: new Date().toISOString(),
        content: initialMessage.text,
        audio_url: session.voice_enabled ? await this.generateSpeech(initialMessage.text) : null,
        metadata: {
          purpose: 'greeting',
          tone: initialMessage.tone,
          suggested_actions: initialMessage.actions
        }
      });

      return session;
    } catch (error) {
      throw new Error(`Erreur démarrage session tuteur: ${error.message}`);
    }
  }

  async processStudentMessage(sessionId, studentMessage, messageType = 'text') {
    try {
      const session = await this.getTutoringSession(sessionId);
      const student = await StudentService.getStudent(session.student_id);
      
      // Add student message to conversation
      session.conversation.push({
        type: 'student',
        timestamp: new Date().toISOString(),
        content: studentMessage,
        message_type: messageType,
        metadata: {
          sentiment: await this.analyzeSentiment(studentMessage),
          topic: await this.identifyTopic(studentMessage),
          urgency: this.assessUrgency(studentMessage)
        }
      });

      // Generate tutor response
      const tutorResponse = await this.generateTutorResponse(session, student, studentMessage);
      
      // Add tutor response to conversation
      const responseEntry = {
        type: 'tutor',
        timestamp: new Date().toISOString(),
        content: tutorResponse.text,
        audio_url: session.voice_enabled ? await this.generateSpeech(tutorResponse.text) : null,
        metadata: {
          purpose: tutorResponse.purpose,
          tone: tutorResponse.tone,
          teaching_strategy: tutorResponse.strategy,
          suggested_actions: tutorResponse.actions,
          follow_up_questions: tutorResponse.follow_up_questions,
          skill_focus: tutorResponse.skill_focus
        }
      };

      session.conversation.push(responseEntry);

      // Update progress tracking
      if (tutorResponse.skill_focus) {
        session.progress_tracking.skills_practiced.push(tutorResponse.skill_focus);
      }

      // Check if intervention is needed
      const intervention = this.checkForIntervention(session, student);
      if (intervention) {
        session.interventions.push(intervention);
      }

      return {
        response: responseEntry,
        session_progress: this.calculateSessionProgress(session),
        suggested_next_steps: tutorResponse.actions,
        intervention_needed: !!intervention
      };
    } catch (error) {
      throw new Error(`Erreur traitement message: ${error.message}`);
    }
  }

  async generateInitialMessage(session, student) {
    const systemPrompt = `Tu es un tuteur IA bienveillant et expert pour enfants de ${student.age} ans (${student.grade}).
Adapte ton langage à l'âge de l'élève. Sois encourageant, patient et clair.`;

    const contextInfo = this.buildContextInfo(session, student);
    
    const userPrompt = `
Élève: ${student.first_name}, ${student.age} ans
Niveau actuel: ${this.calculateOverallLevel(student.mastery)}
Style d'apprentissage: ${student.preferences?.learning_style || 'visuel'}
Objectifs: ${JSON.stringify(student.goals)}
Contexte: ${contextInfo}

Mode de tutorat: ${session.mode}
Compétences focus: ${session.focus_skills.join(', ') || 'général'}

Génère un message d'accueil chaleureux en JSON:
{
  "text": "message d'accueil personnalisé",
  "tone": "encourageant|neutre|motivant",
  "actions": ["action1", "action2"],
  "question": "question d'entrée pour engager la conversation"
}`;

    const result = await chat(systemPrompt, userPrompt, true, { 
      timeoutMs: 4000, 
      maxAttempts: 2 
    });

    return {
      text: result.text || `Bonjour ${student.first_name} ! Je suis ton tuteur IA. Prêt à apprendre quelque chose de nouveau aujourd'hui ?`,
      tone: result.tone || 'encourageant',
      actions: result.actions || ['commencer_exercice', 'voir_progression'],
      question: result.question || 'Par quoi veux-tu commencer aujourd\'hui ?'
    };
  }

  async generateTutorResponse(session, student, studentMessage) {
    const systemPrompt = `Tu es un tuteur IA expert et bienveillant pour enfants de ${student.age} ans.
Analyse le message de l'élève et réponds de manière pédagogique, encourageante et adaptée.
Utilise un langage simple, des exemples concrets et sois toujours positif.`;

    const conversationContext = this.buildConversationContext(session);
    const studentContext = this.buildStudentContext(student);
    
    const userPrompt = `
Message de l'élève: "${studentMessage}"
Conversation récente: ${conversationContext}
Contexte élève: ${studentContext}
Mode actuel: ${session.mode}

Génère une réponse pédagogique en JSON:
{
  "text": "réponse complète et encourageante",
  "purpose": "expliquer|guider|motiver|corriger",
  "tone": "encourageant|patient|enthousiaste",
  "strategy": "démonstration|questionnement|analogie|étapes",
  "actions": ["action1", "action2"],
  "follow_up_questions": ["question1", "question2"],
  "skill_focus": "compétence concernée si applicable",
  "explanation_needed": true/false,
  "practice_suggested": true/false
}`;

    const result = await chat(systemPrompt, userPrompt, true, { 
      timeoutMs: 5000, 
      maxAttempts: 2 
    });

    return {
      text: result.text || 'Continue tes efforts ! Tu es sur la bonne voie.',
      purpose: result.purpose || 'encourager',
      tone: result.tone || 'encourageant',
      strategy: result.strategy || 'questionnement',
      actions: result.actions || ['continuer_pratique'],
      follow_up_questions: result.follow_up_questions || [],
      skill_focus: result.skill_focus,
      explanation_needed: result.explanation_needed || false,
      practice_suggested: result.practice_suggested || false
    };
  }

  async provideExplanation(studentId, skillId, difficulty = 'medium', context = {}) {
    try {
      const student = await StudentService.getStudent(studentId);
      const skill = this.skillGraph.getSkill(skillId);
      
      const systemPrompt = `Tu es un professeur expert qui explique les concepts mathématiques aux enfants de ${student.age} ans.
Utilise un langage simple, des exemples concrets et des analogies adaptées à l'âge.`;

      const userPrompt = `
Compétence à expliquer: ${skill.name} (${skill.id})
Difficulté: ${difficulty}
Niveau de maîtrise actuel: ${student.mastery[skillId] || 0}
Style d'apprentissage: ${student.preferences?.learning_style || 'visuel'}
Contexte: ${JSON.stringify(context)}

Génère une explication complète en JSON:
{
  "explanation": "explication détaillée et simple",
  "examples": ["exemple1", "exemple2", "exemple3"],
  "visual_aids": ["aide_visuelle1", "aide_visuelle2"],
  "common_mistakes": ["erreur1", "erreur2"],
  "tips": ["conseil1", "conseil2"],
  "practice_suggestions": ["suggestion1", "suggestion2"],
  "difficulty_check": "question pour vérifier la compréhension"
}`;

      const result = await chat(systemPrompt, userPrompt, true, { 
        timeoutMs: 6000, 
        maxAttempts: 2 
      });

      return {
        skill_id: skillId,
        skill_name: skill.name,
        explanation: result.explanation || this.generateFallbackExplanation(skill, student),
        examples: result.examples || [],
        visual_aids: result.visual_aids || [],
        common_mistakes: result.common_mistakes || [],
        tips: result.tips || [],
        practice_suggestions: result.practice_suggestions || [],
        difficulty_check: result.difficulty_check || 'As-tu compris ?',
        audio_explanation: await this.generateSpeech(result.explanation || this.generateFallbackExplanation(skill, student))
      };
    } catch (error) {
      throw new Error(`Erreur explication: ${error.message}`);
    }
  }

  async generatePracticeExercise(studentId, skillId, difficulty = 'medium', focusArea = null) {
    try {
      const student = await StudentService.getStudent(studentId);
      const skill = this.skillGraph.getSkill(skillId);
      
      const systemPrompt = `Tu es un tuteur IA qui crée des exercices de pratique adaptés.
Génère un exercice qui aide l'élève à progresser sans le décourager.`;

      const userPrompt = `
Compétence: ${skill.name} (${skill.id})
Difficulté: ${difficulty}
Niveau actuel: ${student.mastery[skillId] || 0}
Zone de focus: ${focusArea || 'général'}
Style d'apprentissage: ${student.preferences?.learning_style || 'visuel'}

Génère un exercice de pratique en JSON:
{
  "exercise": "exercice complet avec instructions",
  "steps": ["étape1", "étape2", "étape3"],
  "hints": ["indice1", "indice2"],
  "solution": "solution détaillée étape par étape",
  "verification": "comment vérifier la réponse",
  "next_level": "suggestion pour passer au niveau supérieur"
}`;

      const result = await chat(systemPrompt, userPrompt, true, { 
        timeoutMs: 5000, 
        maxAttempts: 2 
      });

      return {
        skill_id: skillId,
        skill_name: skill.name,
        exercise: result.exercise || this.generateFallbackExercise(skill, difficulty),
        steps: result.steps || [],
        hints: result.hints || [],
        solution: result.solution || 'Solution à détailler',
        verification: result.verification || 'Vérifie ta réponse',
        next_level: result.next_level || 'Essaie un exercice plus difficile',
        audio_instructions: await this.generateSpeech(result.exercise || this.generateFallbackExercise(skill, difficulty))
      };
    } catch (error) {
      throw new Error(`Erreur exercice pratique: ${error.message}`);
    }
  }

  async correctMistake(studentId, exerciseData, studentAnswer, errorPattern = null) {
    try {
      const student = await StudentService.getStudent(studentId);
      const skill = this.skillGraph.getSkill(exerciseData.skill_id);
      
      const systemPrompt = `Tu es un tuteur IA bienveillant qui corrige les erreurs de manière constructive.
Ne dis jamais "c'est faux" mais plutôt "presque !" ou "approche-toit de cette façon...".
Concentre-toi sur l'apprentissage plutôt que sur l'erreur.`;

      const userPrompt = `
Exercice: ${exerciseData.question}
Réponse correcte: ${exerciseData.correct_answer}
Réponse de l'élève: ${studentAnswer}
Compétence: ${skill.name}
Pattern d'erreur identifié: ${errorPattern || 'non identifié'}
Niveau de maîtrise: ${student.mastery[exerciseData.skill_id] || 0}

Génère une correction constructive en JSON:
{
  "correction": "correction bienveillante et constructive",
  "explanation": "explication de pourquoi la réponse est différente",
  "misconception": "concept erroné possible",
  "right_approach": "la bonne approche à suivre",
  "practice_tip": "conseil pour éviter l'erreur à l'avenir",
  "encouragement": "message encourageant"
}`;

      const result = await chat(systemPrompt, userPrompt, true, { 
        timeoutMs: 5000, 
        maxAttempts: 2 
      });

      return {
        correction: result.correction || 'Presque ! Essayons ensemble.',
        explanation: result.explanation || 'Voici la bonne façon de procéder.',
        misconception: result.misconception || 'Concept à revoir',
        right_approach: result.right_approach || 'Approche recommandée',
        practice_tip: result.practice_tip || 'Conseil pratique',
        encouragement: result.encouragement || 'Continue comme ça !',
        audio_correction: await this.generateSpeech(result.correction || 'Presque ! Essayons ensemble.')
      };
    } catch (error) {
      throw new Error(`Erreur correction: ${error.message}`);
    }
  }

  async provideMotivation(studentId, context = {}) {
    try {
      const student = await StudentService.getStudent(studentId);
      
      const systemPrompt = `Tu es un coach motivateur pour enfants. Sois authentique, énergique et positif.
Personnalise tes encouragements en fonction des progrès réels de l'élève.`;

      const userPrompt = `
Élève: ${student.first_name}
Niveau: ${student.level}
XP: ${student.xp}
Série actuelle: ${student.streak} jours
Progrès récents: ${this.getRecentProgressSummary(student)}
Contexte: ${JSON.stringify(context)}

Génère un message motivant en JSON:
{
  "message": "message motivant personnalisé",
  "achievements_highlighted": ["accomplissement1", "accomplissement2"],
  "next_goal": "prochain objectif suggéré",
  "encouragement_type": "célébration|persévérance|dépassement",
  "energy_level": "calme|enthousiaste|énergique"
}`;

      const result = await chat(systemPrompt, userPrompt, true, { 
        timeoutMs: 4000, 
        maxAttempts: 2 
      });

      return {
        message: result.message || `Super travail ${student.first_name} ! Continue comme ça !`,
        achievements_highlighted: result.achievements_highlighted || [],
        next_goal: result.next_goal || 'Continue ta série d\'exercices',
        encouragement_type: result.encouragement_type || 'célébration',
        energy_level: result.energy_level || 'enthousiaste',
        audio_message: await this.generateSpeech(result.message || `Super travail ${student.first_name} !`)
      };
    } catch (error) {
      throw new Error(`Erreur motivation: ${error.message}`);
    }
  }

  async generateSpeech(text) {
    try {
      // This would integrate with a text-to-speech service
      // For now, return a placeholder URL
      return `https://api.kidai.ai/speech/generate?text=${encodeURIComponent(text)}&voice=${this.voiceSettings.voice}`;
    } catch (error) {
      console.log('Speech generation failed:', error);
      return null;
    }
  }

  async processVoiceMessage(studentId, audioData) {
    try {
      // This would integrate with a speech-to-text service
      // For now, return a placeholder transcription
      const transcription = "Je ne comprends pas cet exercice";
      
      return {
        transcription,
        confidence: 0.85,
        processed_text: transcription
      };
    } catch (error) {
      throw new Error(`Erreur traitement vocal: ${error.message}`);
    }
  }

  // Helper methods
  buildContextInfo(session, student) {
    return `
Maîtrise actuelle: ${Object.entries(student.mastery).slice(0, 3).map(([skill, mastery]) => `${skill}: ${Math.round(mastery * 100)}%`).join(', ')}
Progrès récents: ${this.getRecentProgressSummary(student)}
Série actuelle: ${student.streak} jours
Niveau: ${student.level} (${student.xp} XP)
    `;
  }

  buildConversationContext(session) {
    const recentMessages = session.conversation.slice(-3);
    return recentMessages.map(msg => `${msg.type}: ${msg.content}`).join('\n');
  }

  buildStudentContext(student) {
    return `
Âge: ${student.age} ans
Classe: ${student.grade}
Style d'apprentissage: ${student.preferences?.learning_style || 'visuel'}
Préférences: ${JSON.stringify(student.preferences)}
Objectifs: ${JSON.stringify(student.goals)}
    `;
  }

  calculateOverallLevel(mastery) {
    const values = Object.values(mastery);
    if (values.length === 0) return 'débutant';
    
    const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
    
    if (avg < 0.3) return 'débutant';
    if (avg < 0.6) return 'intermédiaire';
    return 'avancé';
  }

  getRecentPerformance(student) {
    const recentExercises = student.history.slice(-10);
    if (recentExercises.length === 0) return { accuracy: 0, exercises: 0 };
    
    const accuracy = recentExercises.filter(ex => ex.correct).length / recentExercises.length;
    return { accuracy, exercises: recentExercises.length };
  }

  getRecentProgressSummary(student) {
    const recentExercises = student.history.slice(-5);
    const correct = recentExercises.filter(ex => ex.correct).length;
    return `${correct}/${recentExercises.length} exercices corrects récemment`;
  }

  async analyzeSentiment(message) {
    // Simple sentiment analysis
    const positive = ['super', 'génial', 'content', 'heureux', 'j\'aime', 'cool', 'top'];
    const negative = ['difficile', 'comprends pas', 'nul', 'pas', 'erreur', 'raté'];
    
    const lowerMessage = message.toLowerCase();
    
    if (positive.some(word => lowerMessage.includes(word))) return 'positive';
    if (negative.some(word => lowerMessage.includes(word))) return 'negative';
    return 'neutral';
  }

  async identifyTopic(message) {
    const topics = {
      'maths': ['maths', 'calcul', 'addition', 'soustraction', 'multiplication', 'division'],
      'comprendre': ['comprends', 'compris', 'explique', 'comment'],
      'aide': ['aide', 'aide-moi', 'bloqué', 'difficile'],
      'exercice': ['exercice', 'question', 'problème'],
      'progression': ['niveau', 'progresser', 'apprendre', 'maîtriser']
    };
    
    const lowerMessage = message.toLowerCase();
    
    for (const [topic, keywords] of Object.entries(topics)) {
      if (keywords.some(keyword => lowerMessage.includes(keyword))) {
        return topic;
      }
    }
    
    return 'general';
  }

  assessUrgency(message) {
    const urgentWords = ['aide', 'bloqué', 'urgence', 'comprends pas', 'perdu'];
    const lowerMessage = message.toLowerCase();
    
    return urgentWords.some(word => lowerMessage.includes(word)) ? 'high' : 'normal';
  }

  checkForIntervention(session, student) {
    // Check if student needs special intervention
    const recentMessages = session.conversation.slice(-5);
    const negativeMessages = recentMessages.filter(msg => 
      msg.type === 'student' && msg.metadata?.sentiment === 'negative'
    );
    
    if (negativeMessages.length >= 3) {
      return {
        type: 'motivation_boost',
        reason: 'multiple_negative_messages',
        suggested_action: 'provide_encouragement',
        timestamp: new Date().toISOString()
      };
    }
    
    return null;
  }

  calculateSessionProgress(session) {
    const skillsPracticed = [...new Set(session.progress_tracking.skills_practiced)];
    const conceptsCovered = session.progress_tracking.concepts_covered.length;
    
    return {
      duration_minutes: Math.round((Date.now() - new Date(session.start_time)) / 60000),
      skills_practiced: skillsPracticed.length,
      concepts_covered,
      message_count: session.conversation.length,
      interventions: session.interventions.length
    };
  }

  generateFallbackExplanation(skill, student) {
    return `Pour maîtriser ${skill.name}, il faut pratiquer régulièrement. Commence par des exercices simples et progresse graduellement.`;
  }

  generateFallbackExercise(skill, difficulty) {
    return `Voici un exercice pour pratiquer ${skill.name}. Prends ton temps et réfléchis étape par étape.`;
  }

  async getTutoringSession(sessionId) {
    // This would fetch from database
    // For now, return a placeholder
    throw new Error('Session storage not implemented');
  }

  async endTutoringSession(sessionId) {
    try {
      const session = await this.getTutoringSession(sessionId);
      session.end_time = new Date().toISOString();
      
      // Generate session summary
      const summary = await this.generateSessionSummary(session);
      
      return {
        session_completed: true,
        summary,
        recommendations: summary.recommendations
      };
    } catch (error) {
      throw new Error(`Erreur fin session: ${error.message}`);
    }
  }

  async generateSessionSummary(session) {
    const student = await StudentService.getStudent(session.student_id);
    
    return {
      duration: Math.round((Date.now() - new Date(session.start_time)) / 60000),
      skills_practiced: [...new Set(session.progress_tracking.skills_practiced)],
      concepts_covered: session.progress_tracking.concepts_covered,
      improvements_made: session.progress_tracking.improvements_made,
      recommendations: [
        'Continuer la pratique régulière',
        'Se concentrer sur les compétences identifiées',
        'Revenir demain pour une nouvelle session'
      ],
      next_session_focus: this.suggestNextSessionFocus(session, student)
    };
  }

  suggestNextSessionFocus(session, student) {
    const weakSkills = student.getWeakSkills().slice(0, 2);
    return weakSkills.map(skill => skill.skill);
  }
}

module.exports = new AITutorService();
