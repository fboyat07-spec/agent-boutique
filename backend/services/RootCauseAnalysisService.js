const SkillGraph = require('../models/SkillGraph');
const StudentService = require('./StudentService');
const { chat } = require('./openaiService');

/**
 * Root Cause Analysis Engine
 * Identifies fundamental learning gaps and provides targeted interventions
 */
class RootCauseAnalysisService {
  constructor() {
    this.skillGraph = new SkillGraph();
    this.confidenceThreshold = 0.7;
    this.analysisDepth = 3; // How deep to trace dependencies
  }

  async analyzeRootCauses(studentId, options = {}) {
    try {
      const student = await StudentService.getStudent(studentId);
      
      const analysis = {
        analysis_id: require('uuid').v4(),
        student_id: studentId,
        timestamp: new Date().toISOString(),
        weak_skills: [],
        root_causes: [],
        intervention_plan: [],
        confidence_scores: {},
        learning_patterns: this.analyzeLearningPatterns(student),
        recommendations: []
      };

      // Identify weak skills
      analysis.weak_skills = this.identifyWeakSkills(student);
      
      // Find root causes
      analysis.root_causes = await this.findRootCauses(analysis.weak_skills, student);
      
      // Generate intervention plan
      analysis.intervention_plan = this.generateInterventionPlan(analysis.root_causes, student);
      
      // Calculate confidence scores
      analysis.confidence_scores = this.calculateConfidenceScores(analysis);
      
      // Generate recommendations
      analysis.recommendations = await this.generateRecommendations(analysis, student);

      return analysis;
    } catch (error) {
      throw new Error(`Erreur analyse causes profondes: ${error.message}`);
    }
  }

  identifyWeakSkills(student) {
    const weakSkills = [];
    
    Object.entries(student.mastery).forEach(([skillId, mastery]) => {
      if (mastery < 0.4) {
        const skill = this.skillGraph.getSkill(skillId);
        const recentPerformance = this.getRecentSkillPerformance(student, skillId);
        
        weakSkills.push({
          skill_id: skillId,
          skill_name: skill?.name || skillId,
          category: skill?.category || 'unknown',
          mastery: mastery,
          recent_accuracy: recentPerformance.accuracy,
          recent_attempts: recentPerformance.attempts,
          trend: this.calculateSkillTrend(student, skillId),
          priority: this.calculateSkillPriority(skillId, mastery, student)
        });
      }
    });

    return weakSkills.sort((a, b) => b.priority - a.priority);
  }

  getRecentSkillPerformance(student, skillId) {
    const recentExercises = student.history.slice(-15);
    const skillExercises = recentExercises.filter(ex => ex.skill === skillId);
    
    return {
      accuracy: skillExercises.length > 0 ? 
        skillExercises.filter(ex => ex.correct).length / skillExercises.length : 0,
      attempts: skillExercises.length,
      avg_time: skillExercises.length > 0 ? 
        skillExercises.reduce((sum, ex) => sum + (ex.time_taken || 0), 0) / skillExercises.length : 0
    };
  }

  calculateSkillTrend(student, skillId) {
    const recentExercises = student.history.slice(-10);
    const skillExercises = recentExercises.filter(ex => ex.skill === skillId);
    
    if (skillExercises.length < 5) return 'insufficient_data';
    
    const firstHalf = skillExercises.slice(0, Math.floor(skillExercises.length / 2));
    const secondHalf = skillExercises.slice(Math.floor(skillExercises.length / 2));
    
    const firstAccuracy = firstHalf.filter(ex => ex.correct).length / firstHalf.length;
    const secondAccuracy = secondHalf.filter(ex => ex.correct).length / secondHalf.length;
    
    const improvement = secondAccuracy - firstAccuracy;
    
    if (improvement > 0.1) return 'improving';
    if (improvement < -0.1) return 'declining';
    return 'stable';
  }

  calculateSkillPriority(skillId, mastery, student) {
    let priority = 1;
    
    // Lower mastery = higher priority
    priority *= (1.1 - mastery);
    
    // Foundational skills get higher priority
    const foundationalSkills = ['counting', 'number_recognition', 'addition_concept'];
    if (foundationalSkills.includes(skillId)) {
      priority *= 2;
    }
    
    // Recent struggles increase priority
    const recentPerformance = this.getRecentSkillPerformance(student, skillId);
    if (recentPerformance.accuracy < 0.3) {
      priority *= 1.5;
    }
    
    return priority;
  }

  async findRootCauses(weakSkills, student) {
    const rootCauses = [];
    
    for (const weakSkill of weakSkills) {
      const skillDependencies = this.skillGraph.getPrerequisites(weakSkill.skill_id);
      const weakDependencies = skillDependencies.filter(dep => 
        (student.mastery[dep] || 0) < 0.6
      );
      
      if (weakDependencies.length > 0) {
        const rootCause = {
          observed_gap: weakSkill.skill_id,
          observed_gap_name: weakSkill.skill_name,
          root_cause_skills: weakDependencies,
          confidence: this.calculateRootCauseConfidence(weakDependencies, student),
          impact_assessment: this.assessImpact(weakSkill.skill_id, weakDependencies, student),
          intervention_priority: this.calculateInterventionPriority(weakSkill, weakDependencies)
        };
        
        // Generate AI-powered analysis
        try {
          const aiAnalysis = await this.generateAIAnalysis(rootCause, student);
          rootCause.ai_insights = aiAnalysis;
        } catch (error) {
          console.log('AI analysis failed, using rule-based');
          rootCause.ai_insights = this.generateRuleBasedAnalysis(rootCause);
        }
        
        rootCauses.push(rootCause);
      }
    }
    
    return rootCauses.sort((a, b) => b.intervention_priority - a.intervention_priority);
  }

  calculateRootCauseConfidence(rootCauseSkills, student) {
    if (rootCauseSkills.length === 0) return 0;
    
    const avgMasteryGap = rootCauseSkills.reduce((sum, skill) => 
      sum + (1 - (student.mastery[skill] || 0)), 0) / rootCauseSkills.length;
    
    return Math.min(0.95, avgMasteryGap * 1.2);
  }

  assessImpact(observedGap, rootCauseSkills, student) {
    // How much fixing the root causes would improve the observed gap
    const rootCauseImprovement = rootCauseSkills.reduce((sum, skill) => {
      const currentMastery = student.mastery[skill] || 0;
      return sum + (0.8 - currentMastery); // Target 80% mastery
    }, 0);
    
    const maxPossibleImprovement = rootCauseSkills.length * 0.8;
    const impactRatio = rootCauseImprovement / maxPossibleImprovement;
    
    return {
      impact_score: impactRatio,
      estimated_improvement: impactRatio * 0.6, // 60% of gap could be resolved
      effort_required: this.estimateEffort(rootCauseSkills, student)
    };
  }

  calculateInterventionPriority(weakSkill, rootCauseSkills) {
    let priority = weakSkill.priority;
    
    // More root causes = higher priority
    priority *= (1 + rootCauseSkills.length * 0.2);
    
    // Higher impact = higher priority
    priority *= (1 + this.assessImpact(weakSkill.skill_id, rootCauseSkills, {}).impact_score);
    
    return priority;
  }

  async generateAIAnalysis(rootCause, student) {
    const systemPrompt = `Tu es un expert en pédagogie cognitive. Analyse les causes profondes des difficultés d'apprentissage.`;
    
    const userPrompt = `
Élève: ${student.first_name}, ${student.age} ans (${student.grade})
Compétence problématique: ${rootCause.observed_gap_name}
Causes profondes identifiées: ${rootCause.root_cause_skills.join(', ')}
Confiance: ${rootCause.confidence}

Analyse en JSON:
{
  "explanation": "explication claire des causes profondes",
  "misconceptions": ["concept erroné 1", "concept erroné 2"],
  "learning_barriers": ["barrière 1", "barrière 2"],
  "teaching_strategy": "stratégie pédagogique recommandée",
  "intervention_approach": "approche d'intervention spécifique"
}`;

    const result = await chat(systemPrompt, userPrompt, true, { 
      timeoutMs: 5000, 
      maxAttempts: 2 
    });
    
    return result.explanation ? result : this.generateRuleBasedAnalysis(rootCause);
  }

  generateRuleBasedAnalysis(rootCause) {
    return {
      explanation: `Les difficultés avec ${rootCause.observed_gap_name} semblent provenir de lacunes fondamentales dans: ${rootCause.root_cause_skills.join(', ')}`,
      misconceptions: rootCause.root_cause_skills.map(skill => `Concept erroné dans ${skill}`),
      learning_barriers: ['Manque de pratique', 'Concepts non maîtrisés'],
      teaching_strategy: 'Retour aux bases avec manipulation concrète',
      intervention_approach: 'Renforcement progressif des prérequis'
    };
  }

  generateInterventionPlan(rootCauses, student) {
    const plan = [];
    
    // Group related root causes
    const skillGroups = this.groupRelatedSkills(rootCauses);
    
    skillGroups.forEach(group => {
      const intervention = {
        group_id: require('uuid').v4(),
        focus_skills: group.skills,
        intervention_type: this.determineInterventionType(group),
        phases: this.generateInterventionPhases(group, student),
        estimated_duration: this.estimateInterventionDuration(group),
        success_criteria: this.defineSuccessCriteria(group),
        resources: this.suggestResources(group, student)
      };
      
      plan.push(intervention);
    });
    
    return plan.sort((a, b) => a.estimated_duration - b.estimated_duration);
  }

  groupRelatedSkills(rootCauses) {
    const groups = [];
    
    rootCauses.forEach(rootCause => {
      const existingGroup = groups.find(g => 
        g.skills.some(skill => rootCause.root_cause_skills.includes(skill))
      );
      
      if (existingGroup) {
        existingGroup.skills.push(...rootCause.root_cause_skills.filter(skill => 
          !existingGroup.skills.includes(skill)
        ));
        existingGroup.observed_gaps.push(rootCause.observed_gap);
      } else {
        groups.push({
          skills: [...rootCause.root_cause_skills],
          observed_gaps: [rootCause.observed_gap],
          priority: rootCause.intervention_priority
        });
      }
    });
    
    return groups;
  }

  determineInterventionType(group) {
    const skillCategories = group.skills.map(skillId => {
      const skill = this.skillGraph.getSkill(skillId);
      return skill?.category || 'unknown';
    });
    
    const uniqueCategories = [...new Set(skillCategories)];
    
    if (uniqueCategories.includes('numbers') || uniqueCategories.includes('operations')) {
      return 'foundational_math';
    } else if (uniqueCategories.includes('geometry')) {
      return 'visual_spatial';
    } else if (uniqueCategories.includes('measurement')) {
      return 'practical_application';
    }
    
    return 'general_remediation';
  }

  generateInterventionPhases(group, student) {
    const phases = [];
    
    // Phase 1: Assessment
    phases.push({
      phase: 1,
      name: 'Évaluation diagnostique',
      description: 'Évaluer le niveau actuel des compétences de base',
      activities: ['Tests rapides', 'Observation directe', 'Manipulation'],
      duration_days: 2,
      success_threshold: 0.7
    });
    
    // Phase 2: Direct Instruction
    phases.push({
      phase: 2,
      name: 'Instruction directe',
      description: 'Enseigner explicitement les concepts fondamentaux',
      activities: ['Leçon modélisée', 'Pratique guidée', 'Manipulation concrète'],
      duration_days: 5,
      success_threshold: 0.8
    });
    
    // Phase 3: Practice
    phases.push({
      phase: 3,
      name: 'Pratique autonome',
      description: 'Renforcer les acquis par la pratique',
      activities: ['Exercices adaptés', 'Jeux éducatifs', 'Problèmes contextualisés'],
      duration_days: 7,
      success_threshold: 0.8
    });
    
    // Phase 4: Application
    phases.push({
      phase: 4,
      name: 'Application',
      description: 'Appliquer les compétences dans des contextes variés',
      activities: ['Problèmes complexes', 'Projets', 'Évaluation finale'],
      duration_days: 3,
      success_threshold: 0.85
    });
    
    return phases;
  }

  estimateInterventionDuration(group) {
    const baseDuration = 15; // days
    const skillCount = group.skills.length;
    const complexity = this.calculateGroupComplexity(group);
    
    return Math.round(baseDuration * (1 + skillCount * 0.3) * complexity);
  }

  calculateGroupComplexity(group) {
    let complexity = 1;
    
    group.skills.forEach(skillId => {
      const skill = this.skillGraph.getSkill(skillId);
      if (skill?.category === 'operations') complexity *= 1.2;
      if (skill?.category === 'fractions') complexity *= 1.5;
    });
    
    return Math.min(2, complexity);
  }

  defineSuccessCriteria(group) {
    return {
      mastery_threshold: 0.8,
      consistency_threshold: 0.75,
      application_threshold: 0.7,
      retention_period: 7 // days
    };
  }

  suggestResources(group, student) {
    const resources = [];
    
    // Digital resources
    resources.push({
      type: 'digital',
      name: 'Exercices adaptatifs',
      description: 'Exercices personnalisés selon le niveau',
      url: '/adaptive-exercises'
    });
    
    // Manipulatives
    if (group.intervention_type === 'foundational_math') {
      resources.push({
        type: 'physical',
        name: 'Matériel de manipulation',
        description: 'Jetons, cubes, matériel de base 10',
        suggestions: ['Compter avec des objets', 'Représenter les opérations']
      });
    }
    
    // Visual aids
    resources.push({
      type: 'visual',
      name: 'Aides visuelles',
      description: 'Schémas, graphiques, tableaux',
      suggestions: ['Tableaux de nombres', 'Schémas de procédures']
    });
    
    return resources;
  }

  calculateConfidenceScores(analysis) {
    const scores = {};
    
    // Overall confidence
    scores.overall = this.calculateOverallConfidence(analysis);
    
    // Per root cause confidence
    analysis.root_causes.forEach(rootCause => {
      scores[rootCause.observed_gap] = rootCause.confidence;
    });
    
    // Intervention plan confidence
    scores.intervention_plan = this.calculateInterventionConfidence(analysis);
    
    return scores;
  }

  calculateOverallConfidence(analysis) {
    if (analysis.root_causes.length === 0) return 0;
    
    const avgConfidence = analysis.root_causes.reduce((sum, rc) => sum + rc.confidence, 0) / analysis.root_causes.length;
    const dataQuality = this.assessDataQuality(analysis);
    
    return avgConfidence * dataQuality;
  }

  assessDataQuality(analysis) {
    let quality = 1;
    
    // Amount of data
    if (analysis.weak_skills.length < 2) quality *= 0.8;
    
    // Recency of data
    // This would check how recent the exercise data is
    
    // Consistency of data
    // This would check for inconsistencies in performance
    
    return quality;
  }

  calculateInterventionConfidence(analysis) {
    // Confidence that the intervention plan will work
    let confidence = 0.7; // Base confidence
    
    // Adjust based on number of root causes
    if (analysis.root_causes.length > 3) confidence *= 0.9;
    
    // Adjust based on student profile
    // Age, learning style, etc.
    
    return confidence;
  }

  async generateRecommendations(analysis, student) {
    const recommendations = [];
    
    // Immediate actions
    recommendations.push({
      type: 'immediate',
      priority: 'high',
      title: 'Commencer par les bases',
      description: 'Commencer l\'intervention sur les compétences fondamentales identifiées',
      actions: ['Démarrer la phase 1', 'Préparer le matériel', 'Planifier les sessions']
    });
    
    // Long-term strategies
    recommendations.push({
      type: 'strategic',
      priority: 'medium',
      title: 'Renforcement continu',
      description: 'Maintenir la pratique régulière pour consolider les acquis',
      actions: ['Pratique quotidienne de 15 minutes', 'Révision hebdomadaire', 'Évaluation mensuelle']
    });
    
    // Monitoring
    recommendations.push({
      type: 'monitoring',
      priority: 'medium',
      title: 'Suivi des progrès',
      description: 'Surveiller régulièrement les progrès et ajuster l\'approche',
      actions: ['Évaluation bi-hebdomadaire', 'Ajustement des difficultés', 'Communication avec l\'élève']
    });
    
    return recommendations;
  }

  analyzeLearningPatterns(student) {
    const recentExercises = student.history.slice(-20);
    
    return {
      best_time_of_day: this.getBestTimeOfDay(recentExercises),
      optimal_session_length: this.getOptimalSessionLength(recentExercises),
      preferred_difficulty: this.getPreferredDifficulty(recentExercises),
      error_patterns: this.identifyErrorPatterns(recentExercises),
      learning_velocity: this.calculateLearningVelocity(student),
      attention_span: this.calculateAttentionSpan(recentExercises)
    };
  }

  // Helper methods for pattern analysis
  getBestTimeOfDay(exercises) {
    // Analyze performance by time of day
    return 'morning'; // Placeholder
  }

  getOptimalSessionLength(exercises) {
    // Calculate optimal session length based on performance
    return 20; // Placeholder
  }

  getPreferredDifficulty(exercises) {
    // Determine preferred difficulty level
    return 'medium'; // Placeholder
  }

  identifyErrorPatterns(exercises) {
    // Identify common error patterns
    return []; // Placeholder
  }

  calculateLearningVelocity(student) {
    // Calculate how quickly student is learning
    return 0.1; // Placeholder
  }

  calculateAttentionSpan(exercises) {
    // Calculate attention span based on exercise duration
    return 15; // Placeholder
  }

  estimateEffort(rootCauseSkills, student) {
    // Estimate effort required to address root causes
    const skillCount = rootCauseSkills.length;
    const avgMasteryGap = rootCauseSkills.reduce((sum, skill) => 
      sum + (1 - (student.mastery[skill] || 0)), 0) / rootCauseSkills.length;
    
    return {
      effort_score: skillCount * avgMasteryGap,
      estimated_hours: Math.round(skillCount * avgMasteryGap * 10),
      difficulty_level: avgMasteryGap > 0.7 ? 'high' : avgMasteryGap > 0.4 ? 'medium' : 'low'
    };
  }
}

module.exports = new RootCauseAnalysisService();
