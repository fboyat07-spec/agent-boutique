// ACTION 3 - Auto-régulation (anti surcharge)

const { isEnabled } = require('./envFlags');
const BusinessLogger = require('./businessLogger');
const { getUserPlan, getPlanFeatures } = require('./stripeService');

// Régulateur automatique pour prévenir surcharge
class AgentRegulator {
  constructor() {
    this.enabled = isEnabled('AUTO_REGULATION_ENABLED');
    this.metrics = {
      actionsPerMinute: 0,
      errorsPerMinute: 0,
      conversionRate: 0,
      lastReset: Date.now()
    };
    this.limits = {
      maxActionsPerMinute: parseInt(process.env.REGULATOR_MAX_ACTIONS_PER_MIN) || 30,
      maxErrorsPerMinute: parseInt(process.env.REGULATOR_MAX_ERRORS_PER_MIN) || 5,
      minConversionRate: parseFloat(process.env.REGULATOR_MIN_CONVERSION_RATE) || 0.05
    };
    this.status = {
      throttled: false,
      paused: false,
      reason: null
    };
    this.history = [];
    this.maxHistorySize = 100;
  }
  
  // Enregistrer une action
  recordAction(success = true, conversion = false, user = null) {
    if (!this.enabled) {
      return;
    }
    
    const now = Date.now();
    
    // Reset metrics chaque minute
    if (now - this.metrics.lastReset > 60000) {
      this.resetMetrics();
    }
    
    // SAFE: Get plan features (ADDITIVE ONLY)
    const plan = user ? getUserPlan(user) : "starter";
    const features = getPlanFeatures(plan);
    
    // SAFE: Non-blocking plan limit check (ADDITIVE ONLY)
    if (this.metrics.actionsPerMinute >= features.maxActionsPerMinute) {
      console.warn('[PLAN LIMIT ACTION]', { plan });
      return; // skip action, no crash
    }
    
    this.metrics.actionsPerMinute++;
    
    if (!success) {
      this.metrics.errorsPerMinute++;
    }
    
    if (conversion) {
      // Mettre à jour taux de conversion (moyenne mobile)
      this.metrics.conversionRate = (this.metrics.conversionRate * 0.9) + (1 * 0.1);
    }
    
    // SAFE: Plan usage logging (ADDITIVE ONLY)
    console.log('[PLAN_USED]', { 
      plan, 
      action: 'regulator_action',
      count: this.metrics.actionsPerMinute 
    });

    // SAFE: Plan features logging (ADDITIVE ONLY)
    console.log('[PLAN_FEATURES]', {
      plan,
      features
    });
    
    // Vérifier limites et réguler
    this.checkAndRegulate();
    
    // Logger
    this.logMetrics();
  }
  
  // Reset metrics
  resetMetrics() {
    // Sauvegarder dans historique
    this.history.push({
      timestamp: this.metrics.lastReset,
      actionsPerMinute: this.metrics.actionsPerMinute,
      errorsPerMinute: this.metrics.errorsPerMinute,
      conversionRate: this.metrics.conversionRate,
      status: { ...this.status }
    });
    
    // Limiter taille historique
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
    
    // Reset
    this.metrics = {
      actionsPerMinute: 0,
      errorsPerMinute: 0,
      conversionRate: this.metrics.conversionRate, // Conserver taux de conversion
      lastReset: Date.now()
    };
    
    console.log('[REGULATOR_METRICS_RESET]');
  }
  
  // Mettre à jour taux de conversion
  updateConversionRate(conversion) {
    const alpha = 0.1; // Facteur de lissage
    const newRate = conversion ? 1 : 0;
    
    this.metrics.conversionRate = (alpha * newRate) + ((1 - alpha) * this.metrics.conversionRate);
  }
  
  // Vérifier limites et réguler
  checkAndRegulate() {
    const { actionsPerMinute, errorsPerMinute, conversionRate } = this.metrics;
    const { maxActionsPerMinute, maxErrorsPerMinute, minConversionRate } = this.limits;
    
    let shouldThrottle = false;
    let shouldPause = false;
    let reason = null;
    
    // Trop d'actions par minute
    if (actionsPerMinute > maxActionsPerMinute) {
      shouldThrottle = true;
      reason = 'too_many_actions';
      
      console.log('[REGULATOR_TOO_MANY_ACTIONS]', {
        current: actionsPerMinute,
        limit: maxActionsPerMinute
      });
    }
    
    // Trop d'erreurs par minute
    if (errorsPerMinute > maxErrorsPerMinute) {
      shouldPause = true;
      reason = 'too_many_errors';
      
      console.log('[REGULATOR_TOO_MANY_ERRORS]', {
        current: errorsPerMinute,
        limit: maxErrorsPerMinute
      });
      
      BusinessLogger.logWebhookError('Too many errors per minute', {
        context: 'agent_regulator',
        errorsPerMinute,
        maxErrorsPerMinute
      });
    }
    
    // Taux de conversion trop bas
    if (conversionRate < minConversionRate && actionsPerMinute > 10) {
      shouldThrottle = true;
      reason = 'low_conversion_rate';
      
      console.log('[REGULATOR_LOW_CONVERSION]', {
        current: conversionRate,
        limit: minConversionRate,
        actionsPerMinute
      });
    }
    
    // Appliquer régulation
    if (shouldPause) {
      this.pause(reason);
    } else if (shouldThrottle) {
      this.throttle(reason);
    } else {
      this.resume();
    }
  }
  
  // Ralentir (throttle)
  throttle(reason) {
    if (this.status.throttled && this.status.reason === reason) {
      return; // Déjà throttled pour la même raison
    }
    
    this.status.throttled = true;
    this.status.paused = false;
    this.status.reason = reason;
    
    console.log('[REGULATOR_THROTTLED]', { reason });
    BusinessLogger.logWebhookError('System throttled', {
      context: 'agent_regulator',
      reason,
      metrics: this.metrics
    });
  }
  
  // Pause complète
  pause(reason) {
    if (this.status.paused && this.status.reason === reason) {
      return; // Déjà en pause pour la même raison
    }
    
    this.status.paused = true;
    this.status.throttled = false;
    this.status.reason = reason;
    
    console.log('[REGULATOR_PAUSED]', { reason });
    BusinessLogger.logWebhookError('System paused', {
      context: 'agent_regulator',
      reason,
      metrics: this.metrics
    });
  }
  
  // Reprendre activité normale
  resume() {
    if (!this.status.throttled && !this.status.paused) {
      return; // Déjà normal
    }
    
    const previousStatus = { ...this.status };
    
    this.status.throttled = false;
    this.status.paused = false;
    this.status.reason = null;
    
    console.log('[REGULATOR_RESUMED]', { 
      from: previousStatus.reason,
      metrics: this.metrics 
    });
  }
  
  // Logger metrics
  logMetrics() {
    if (Date.now() % 10000 < 1000) { // Log toutes les 10 secondes environ
      console.log('[REGULATOR_METRICS]', {
        ...this.metrics,
        status: this.status,
        limits: this.limits
      });
    }
  }
  
  // Vérifier si une action est permise
  canExecuteAction(priority = 'normal') {
    if (!this.enabled) {
      return { allowed: true, reason: 'regulator_disabled' };
    }
    
    if (this.status.paused) {
      return { allowed: false, reason: 'system_paused', details: this.status.reason };
    }
    
    if (this.status.throttled && priority !== 'high') {
      return { allowed: false, reason: 'system_throttled', details: this.status.reason };
    }
    
    return { allowed: true };
  }
  
  // Wrapper pour exécuter action avec régulation
  async executeWithRegulation(action, priority = 'normal') {
    const canExecute = this.canExecuteAction(priority);
    
    if (!canExecute.allowed) {
      console.log('[REGULATOR_ACTION_BLOCKED]', {
        reason: canExecute.reason,
        details: canExecute.details,
        priority
      });
      
      return { success: false, reason: canExecute.reason, regulated: true };
    }
    
    const startTime = Date.now();
    
    try {
      const result = await action();
      
      const duration = Date.now() - startTime;
      
      // Enregistrer action réussie
      this.recordAction(true, result.conversion || false);
      
      return { success: true, result, duration, regulated: false };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Enregistrer action échouée
      this.recordAction(false, false);
      
      console.log('[REGULATOR_ACTION_ERROR]', {
        error: error.message,
        duration,
        priority
      });
      
      return { success: false, error: error.message, duration, regulated: false };
    }
  }
  
  // Obtenir stats du régulateur
  getStats() {
    return {
      enabled: this.enabled,
      metrics: this.metrics,
      limits: this.limits,
      status: this.status,
      historySize: this.history.length,
      uptime: process.uptime()
    };
  }
  
  // Obtenir historique
  getHistory(limit = 10) {
    return this.history.slice(-limit);
  }
  
  // Ajuster limites dynamiquement
  adjustLimits(adjustments) {
    const oldLimits = { ...this.limits };
    
    if (adjustments.maxActionsPerMinute) {
      this.limits.maxActionsPerMinute = Math.max(1, this.limits.maxActionsPerMinute + adjustments.maxActionsPerMinute);
    }
    
    if (adjustments.maxErrorsPerMinute) {
      this.limits.maxErrorsPerMinute = Math.max(0, this.limits.maxErrorsPerMinute + adjustments.maxErrorsPerMinute);
    }
    
    if (adjustments.minConversionRate) {
      this.limits.minConversionRate = Math.max(0, Math.min(1, this.limits.minConversionRate + adjustments.minConversionRate));
    }
    
    console.log('[REGULATOR_LIMITS_ADJUSTED]', {
      old: oldLimits,
      new: this.limits,
      adjustments
    });
    
    return this.limits;
  }
  
  // Health check
  healthCheck() {
    const stats = this.getStats();
    
    const health = {
      status: 'healthy',
      enabled: stats.enabled,
      metrics: stats.metrics,
      status: stats.status,
      recommendations: []
    };
    
    // Recommandations
    if (stats.status.paused) {
      health.status = 'paused';
      health.recommendations.push('System is paused - investigate errors');
    }
    
    if (stats.status.throttled) {
      health.status = 'throttled';
      health.recommendations.push('System is throttled - consider reducing load');
    }
    
    if (stats.metrics.errorsPerMinute > stats.limits.maxErrorsPerMinute * 0.8) {
      health.recommendations.push('Approaching error rate limit');
    }
    
    if (stats.metrics.conversionRate < stats.limits.minConversionRate * 1.5) {
      health.recommendations.push('Low conversion rate detected');
    }
    
    return health;
  }
  
  // Reset manuel
  reset() {
    this.metrics = {
      actionsPerMinute: 0,
      errorsPerMinute: 0,
      conversionRate: 0,
      lastReset: Date.now()
    };
    
    this.status = {
      throttled: false,
      paused: false,
      reason: null
    };
    
    this.history = [];
    
    console.log('[REGULATOR_RESET]');
  }
}

// Instance globale du régulateur
if (!global.agentRegulator) {
  global.agentRegulator = new AgentRegulator();
}

// Wrapper pour exécuter avec régulation
async function executeWithRegulation(action, priority = 'normal') {
  return await global.agentRegulator.executeWithRegulation(action, priority);
}

// Stats du régulateur
function getRegulatorStats() {
  return global.agentRegulator.getStats();
}

// Health check
function regulatorHealthCheck() {
  return global.agentRegulator.healthCheck();
}

// Contrôle manuel
function pauseRegulator(reason = 'manual') {
  global.agentRegulator.pause(reason);
}

function resumeRegulator() {
  global.agentRegulator.resume();
}

function adjustRegulatorLimits(adjustments) {
  return global.agentRegulator.adjustLimits(adjustments);
}

module.exports = {
  executeWithRegulation,
  getRegulatorStats,
  regulatorHealthCheck,
  pauseRegulator,
  resumeRegulator,
  adjustRegulatorLimits,
  AgentRegulator
};
