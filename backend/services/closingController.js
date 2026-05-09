// ACTION 7 - Point de contrôle closing

const { getFlag } = require('./envFlags');
const { logClosingTriggerReal, logRealError } = require('./realValidationLogger');
const { addRealStep } = require('./realTraceManager');
const { getLeadsByTenant } = require('./tenantIsolationSafe');
const { getUserPlan, getPlanFeatures } = require('./stripeService');

// Contrôleur de closing (SAFE - monitoring et validation)
class ClosingController {
  constructor() {
    this.testModeEnabled = getFlag('AGENT_TEST_MODE');
    this.realValidationEnabled = getFlag('AGENT_REAL_VALIDATION_MODE');
    this.stats = {
      closingAttempts: 0,
      successfulClosings: 0,
      failedClosings: 0,
      byStatus: new Map(),
      byScore: new Map(),
      byIntent: new Map()
    };
    
    console.log('[CLOSING_CONTROLLER_INITIALIZED]', {
      testModeEnabled: this.testModeEnabled,
      realValidationEnabled: this.realValidationEnabled
    });
  }
  
  // Obtenir l'environnement actuel
  getEnvironment() {
    if (this.realValidationEnabled) {
      return 'real';
    } else if (this.testModeEnabled) {
      return 'test';
    } else {
      return 'production';
    }
  }
  
  // Point de contrôle closing
  closingControlPoint(phone, tenant_id, lead_id, closingData) {
    if (!this.testModeEnabled && !this.realValidationEnabled) {
      return { allowed: true, reason: 'validation_disabled' };
    }
    
    this.stats.closingAttempts++;
    
    try {
      // Obtenir les données complètes du lead
      const lead = this.getLeadData(phone, tenant_id, lead_id);
      
      if (!lead) {
        console.log('[CLOSING_CONTROL_LEAD_NOT_FOUND]', {
          phone: this.maskPhone(phone),
          tenant_id,
          lead_id
        });
        
        return {
          allowed: false,
          reason: 'lead_not_found',
          environment: this.getEnvironment()
        };
      }
      
      // SAFE: Plan gating check (ADDITIVE ONLY)
      const plan = getUserPlan(lead.user) || "starter";
      const features = getPlanFeatures(plan);
      
      if (!features.canUseClosing) {
        console.warn('[CLOSING BLOCKED - PLAN]', { plan });
        return {
          allowed: false,
          reason: 'plan_not_allowed',
          plan,
          environment: this.getEnvironment()
        };
      }
      
      if (!lead) {
        console.log('[CLOSING_CONTROL_LEAD_NOT_FOUND]', {
          phone: this.maskPhone(phone),
          tenant_id,
          lead_id
        });
        
        return {
          allowed: false,
          reason: 'lead_not_found',
          environment: this.getEnvironment()
        };
      }
      
      // Valider les conditions de closing
      const validation = this.validateClosingConditions(lead, closingData);
      
      // Logger le point de contrôle
      if (this.realValidationEnabled) {
        logClosingTriggerReal(phone, tenant_id, lead_id, {
          status: lead.status,
          score: lead.score,
          intent: closingData.intent || 'unknown',
          confidence: closingData.confidence || 0,
          validation,
          environment: this.getEnvironment()
        });
      }
      
      // Ajouter l'étape à la trace
      if (closingData.traceId) {
        addRealStep(closingData.traceId, 'closing_control_point', {
          phone: this.maskPhone(phone),
          status: lead.status,
          score: lead.score,
          intent: closingData.intent,
          confidence: closingData.confidence,
          validation,
          environment: this.getEnvironment()
        });
      }
      
      // Mettre à jour les stats
      this.updateStats(lead, closingData, validation);
      
      // Logger le résultat
      console.log('[CLOSING_CONTROL_POINT_PROCESSED]', {
        phone: this.maskPhone(phone),
        tenant_id,
        lead_id,
        status: lead.status,
        score: lead.score,
        intent: closingData.intent,
        validation,
        allowed: validation.allowed,
        environment: this.getEnvironment()
      });
      
      return {
        allowed: validation.allowed,
        reason: validation.reason,
        validation,
        lead: {
          id: lead.id,
          status: lead.status,
          score: lead.score
        },
        environment: this.getEnvironment()
      };
      
    } catch (error) {
      console.log('[CLOSING_CONTROL_ERROR]', {
        phone: this.maskPhone(phone),
        tenant_id,
        lead_id,
        error: error.message
      });
      
      // Logger l'erreur
      if (this.realValidationEnabled) {
        logRealError('closing_control_point', phone, tenant_id, lead_id, error, {
          environment: this.getEnvironment()
        });
      }
      
      return {
        allowed: false,
        reason: 'control_error',
        error: error.message,
        environment: this.getEnvironment()
      };
    }
  }
  
  // Valider les conditions de closing
  validateClosingConditions(lead, closingData) {
    const validation = {
      allowed: false,
      reason: '',
      checks: {},
      score: 0
    };
    
    // Check 1: Statut du lead
    const statusCheck = this.validateLeadStatus(lead.status);
    validation.checks.status = statusCheck;
    validation.score += statusCheck.score;
    
    // Check 2: Score du lead
    const scoreCheck = this.validateLeadScore(lead.score);
    validation.checks.score = scoreCheck;
    validation.score += scoreCheck.score;
    
    // Check 3: Intention détectée
    const intentCheck = this.validateClosingIntent(closingData.intent, closingData.confidence);
    validation.checks.intent = intentCheck;
    validation.score += intentCheck.score;
    
    // Check 4: Timing (récence des interactions)
    const timingCheck = this.validateClosingTiming(lead, closingData);
    validation.checks.timing = timingCheck;
    validation.score += timingCheck.score;
    
    // Check 5: Historique de conversation
    const historyCheck = this.validateConversationHistory(lead, closingData);
    validation.checks.history = historyCheck;
    validation.score += historyCheck.score;
    
    // Déterminer si le closing est autorisé
    const minScore = this.getMinClosingScore();
    validation.allowed = validation.score >= minScore;
    
    if (!validation.allowed) {
      validation.reason = `Insufficient closing score (${validation.score} < ${minScore})`;
    } else {
      validation.reason = `Closing allowed (score: ${validation.score})`;
    }
    
    return validation;
  }
  
  // Valider le statut du lead
  validateLeadStatus(status) {
    const validStatuses = ['ENGAGED', 'INTERESTED', 'QUALIFIED'];
    const score = validStatuses.includes(status) ? 20 : 0;
    
    return {
      valid: validStatuses.includes(status),
      status,
      score,
      reason: validStatuses.includes(status) ? 
        'Lead status is appropriate for closing' : 
        'Lead status not ready for closing'
    };
  }
  
  // Valider le score du lead
  validateLeadScore(score) {
    let scoreCheck = { score: 0 };
    
    if (score >= 80) {
      scoreCheck = {
        valid: true,
        score: 25,
        level: 'high',
        reason: 'High lead score (>80)'
      };
    } else if (score >= 60) {
      scoreCheck = {
        valid: true,
        score: 15,
        level: 'medium',
        reason: 'Medium lead score (60-79)'
      };
    } else if (score >= 40) {
      scoreCheck = {
        valid: true,
        score: 10,
        level: 'low',
        reason: 'Low lead score (40-59)'
      };
    } else {
      scoreCheck = {
        valid: false,
        score: 0,
        level: 'very_low',
        reason: 'Very low lead score (<40)'
      };
    }
    
    return scoreCheck;
  }
  
  // Valider l'intention de closing
  validateClosingIntent(intent, confidence = 0) {
    const validIntents = ['buy', 'purchase', 'ready', 'interested', 'closing'];
    let score = 0;
    
    // Score basé sur l'intention
    if (validIntents.includes(intent)) {
      score += 20;
    }
    
    // Score basé sur la confiance
    if (confidence >= 0.8) {
      score += 15;
    } else if (confidence >= 0.6) {
      score += 10;
    } else if (confidence >= 0.4) {
      score += 5;
    }
    
    return {
      valid: validIntents.includes(intent) && confidence >= 0.4,
      intent,
      confidence,
      score,
      reason: validIntents.includes(intent) ? 
        `Valid closing intent with ${Math.round(confidence * 100)}% confidence` :
        'Invalid or unclear closing intent'
    };
  }
  
  // Valider le timing du closing
  validateClosingTiming(lead, closingData) {
    let score = 0;
    let timingInfo = { score: 0 };
    
    // Vérifier la récence de la dernière interaction
    if (lead.lastInteraction) {
      const lastInteractionTime = new Date(lead.lastInteraction);
      const timeSinceLastInteraction = Date.now() - lastInteractionTime.getTime();
      const hoursSinceLastInteraction = timeSinceLastInteraction / (1000 * 60 * 60);
      
      if (hoursSinceLastInteraction <= 1) {
        score += 15;
        timingInfo = {
          valid: true,
          score: 15,
          hoursSinceLastInteraction: Math.round(hoursSinceLastInteraction * 100) / 100,
          level: 'excellent',
          reason: 'Recent interaction (< 1 hour)'
        };
      } else if (hoursSinceLastInteraction <= 6) {
        score += 10;
        timingInfo = {
          valid: true,
          score: 10,
          hoursSinceLastInteraction: Math.round(hoursSinceLastInteraction * 100) / 100,
          level: 'good',
          reason: 'Recent interaction (1-6 hours)'
        };
      } else if (hoursSinceLastInteraction <= 24) {
        score += 5;
        timingInfo = {
          valid: true,
          score: 5,
          hoursSinceLastInteraction: Math.round(hoursSinceLastInteraction * 100) / 100,
          level: 'acceptable',
          reason: 'Recent interaction (6-24 hours)'
        };
      } else {
        timingInfo = {
          valid: false,
          score: 0,
          hoursSinceLastInteraction: Math.round(hoursSinceLastInteraction * 100) / 100,
          level: 'poor',
          reason: 'Old interaction (> 24 hours)'
        };
      }
    } else {
      timingInfo = {
        valid: false,
        score: 0,
        reason: 'No interaction timing available'
      };
    }
    
    return timingInfo;
  }
  
  // Valider l'historique de conversation
  validateConversationHistory(lead, closingData) {
    let score = 0;
    let historyInfo = { score: 0 };
    
    // Vérifier le nombre de messages échangés
    const messageCount = lead.messageCount || 0;
    
    if (messageCount >= 3) {
      score += 10;
      historyInfo = {
        valid: true,
        score: 10,
        messageCount,
        level: 'good',
        reason: 'Adequate conversation history (3+ messages)'
      };
    } else if (messageCount >= 2) {
      score += 5;
      historyInfo = {
        valid: true,
        score: 5,
        messageCount,
        level: 'minimal',
        reason: 'Minimal conversation history (2 messages)'
      };
    } else {
      historyInfo = {
        valid: false,
        score: 0,
        messageCount,
        level: 'insufficient',
        reason: 'Insufficient conversation history (< 2 messages)'
      };
    }
    
    return historyInfo;
  }
  
  // Obtenir le score minimum pour closing
  getMinClosingScore() {
    if (this.realValidationEnabled) {
      return 60; // Plus strict en mode réel
    } else if (this.testModeEnabled) {
      return 40; // Plus permissif en mode test
    } else {
      return 50; // Standard en production
    }
  }
  
  // Obtenir les données du lead
  getLeadData(phone, tenant_id, lead_id) {
    // Simulation - en production, utiliserait la vraie base de données
    const leads = getLeadsByTenant(tenant_id);
    
    if (lead_id) {
      return leads.find(l => l.id === lead_id);
    } else {
      return leads.find(l => l.phone === phone);
    }
  }
  
  // Mettre à jour les statistiques
  updateStats(lead, closingData, validation) {
    // Stats par statut
    const statusKey = lead.status || 'unknown';
    this.stats.byStatus.set(statusKey, (this.stats.byStatus.get(statusKey) || 0) + 1);
    
    // Stats par score
    const scoreRange = this.getScoreRange(lead.score);
    this.stats.byScore.set(scoreRange, (this.stats.byScore.get(scoreRange) || 0) + 1);
    
    // Stats par intention
    const intentKey = closingData.intent || 'unknown';
    this.stats.byIntent.set(intentKey, (this.stats.byIntent.get(intentKey) || 0) + 1);
    
    // Stats de succès/échec
    if (validation.allowed) {
      this.stats.successfulClosings++;
    } else {
      this.stats.failedClosings++;
    }
  }
  
  // Obtenir la plage de score
  getScoreRange(score) {
    if (score >= 80) return '80-100';
    if (score >= 60) return '60-79';
    if (score >= 40) return '40-59';
    return '0-39';
  }
  
  // Obtenir les statistiques du contrôleur
  getControllerStats() {
    if (!this.testModeEnabled && !this.realValidationEnabled) {
      return { enabled: false };
    }
    
    const totalAttempts = this.stats.closingAttempts;
    const successRate = totalAttempts > 0 ? 
      (this.stats.successfulClosings / totalAttempts) * 100 : 0;
    
    return {
      enabled: true,
      environment: this.getEnvironment(),
      stats: {
        closingAttempts: this.stats.closingAttempts,
        successfulClosings: this.stats.successfulClosings,
        failedClosings: this.stats.failedClosings,
        successRate: Math.round(successRate * 100) / 100
      },
      byStatus: Object.fromEntries(this.stats.byStatus),
      byScore: Object.fromEntries(this.stats.byScore),
      byIntent: Object.fromEntries(this.stats.byIntent),
      minClosingScore: this.getMinClosingScore(),
      uptime: process.uptime()
    };
  }
  
  // Obtenir le rapport de closing
  getClosingReport() {
    if (!this.testModeEnabled && !this.realValidationEnabled) {
      return { enabled: false };
    }
    
    const stats = this.getControllerStats();
    
    // Analyser les patterns
    const patterns = this.analyzeClosingPatterns();
    
    // Générer des recommandations
    const recommendations = this.generateClosingRecommendations(stats, patterns);
    
    return {
      enabled: true,
      environment: this.getEnvironment(),
      stats: stats.stats,
      patterns,
      recommendations,
      metadata: {
        generated_at: new Date(),
        min_closing_score: stats.minClosingScore
      }
    };
  }
  
  // Analyser les patterns de closing
  analyzeClosingPatterns() {
    const patterns = {
      mostSuccessfulStatus: null,
      mostSuccessfulScore: null,
      mostSuccessfulIntent: null,
      commonFailureReasons: []
    };
    
    // Trouver le statut le plus réussi
    let maxSuccessRate = 0;
    for (const [status, count] of this.stats.byStatus.entries()) {
      const successRate = this.calculateSuccessRateForStatus(status);
      if (successRate > maxSuccessRate) {
        maxSuccessRate = successRate;
        patterns.mostSuccessfulStatus = { status, successRate };
      }
    }
    
    // Trouver la plage de score la plus réussie
    maxSuccessRate = 0;
    for (const [scoreRange, count] of this.stats.byScore.entries()) {
      const successRate = this.calculateSuccessRateForScore(scoreRange);
      if (successRate > maxSuccessRate) {
        maxSuccessRate = successRate;
        patterns.mostSuccessfulScore = { scoreRange, successRate };
      }
    }
    
    // Trouver l'intention la plus réussie
    maxSuccessRate = 0;
    for (const [intent, count] of this.stats.byIntent.entries()) {
      const successRate = this.calculateSuccessRateForIntent(intent);
      if (successRate > maxSuccessRate) {
        maxSuccessRate = successRate;
        patterns.mostSuccessfulIntent = { intent, successRate };
      }
    }
    
    return patterns;
  }
  
  // Calculer le taux de succès par statut
  calculateSuccessRateForStatus(status) {
    // Simulation - en production, utiliserait les vraies données
    return Math.random() * 100; // Placeholder
  }
  
  // Calculer le taux de succès par score
  calculateSuccessRateForScore(scoreRange) {
    // Simulation - en production, utiliserait les vraies données
    return Math.random() * 100; // Placeholder
  }
  
  // Calculer le taux de succès par intention
  calculateSuccessRateForIntent(intent) {
    // Simulation - en production, utiliserait les vraies données
    return Math.random() * 100; // Placeholder
  }
  
  // Générer des recommandations
  generateClosingRecommendations(stats, patterns) {
    const recommendations = [];
    
    if (stats.stats.successRate < 50) {
      recommendations.push({
        type: 'warning',
        message: `Low closing success rate (${stats.stats.successRate}%)`,
        action: 'Review closing criteria and lead quality',
        priority: 'high'
      });
    }
    
    if (stats.stats.closingAttempts < 10) {
      recommendations.push({
        type: 'info',
        message: 'Low number of closing attempts',
        action: 'Increase lead engagement before closing',
        priority: 'medium'
      });
    }
    
    if (patterns.mostSuccessfulStatus) {
      recommendations.push({
        type: 'info',
        message: `Most successful status: ${patterns.mostSuccessfulStatus.status}`,
        action: 'Focus on leads with this status for closing',
        priority: 'low'
      });
    }
    
    return recommendations;
  }
  
  // Réinitialiser les stats
  resetStats() {
    this.stats = {
      closingAttempts: 0,
      successfulClosings: 0,
      failedClosings: 0,
      byStatus: new Map(),
      byScore: new Map(),
      byIntent: new Map()
    };
    
    console.log('[CLOSING_CONTROLLER_STATS_RESET]');
  }
  
  // Masquer téléphone pour logs
  maskPhone(phone) {
    if (!phone || typeof phone !== 'string') return 'unknown';
    return phone.slice(0, -4) + '****';
  }
}

// Instance globale du contrôleur
if (!global.closingController) {
  global.closingController = new ClosingController();
}

// Fonctions principales
function closingControlPoint(phone, tenant_id, lead_id, closingData) {
  return global.closingController.closingControlPoint(phone, tenant_id, lead_id, closingData);
}

// Stats et monitoring
function getClosingControllerStats() {
  return global.closingController.getControllerStats();
}

function getClosingReport() {
  return global.closingController.getClosingReport();
}

// Administration
function resetClosingControllerStats() {
  return global.closingController.resetStats();
}

module.exports = {
  closingControlPoint,
  getClosingControllerStats,
  getClosingReport,
  resetClosingControllerStats,
  ClosingController
};
