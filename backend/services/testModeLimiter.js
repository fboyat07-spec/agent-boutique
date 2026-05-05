// ACTION 6 - Limitation forte actions

const { getFlag } = require('./envFlags');

// Limiteur d'actions pour mode test (SAFE - limitation uniquement)
class TestModeLimiter {
  constructor() {
    this.enabled = getFlag('AGENT_TEST_MODE');
    this.limits = {
      maxPerRun: 1,              // Max 1 lead par run
      maxFollowups: 0,           // Pas de follow-up en test
      maxOutboundDaily: 5,       // Max 5 outbound/jour
      maxMessagesPerHour: 2,     // Max 2 messages/heure
      cooldownMinutes: 30        // 30 minutes entre actions
    };
    this.counters = {
      daily: {
        outbound: 0,
        lastReset: new Date().toDateString()
      },
      hourly: {
        messages: 0,
        lastReset: new Date().getHours()
      },
      lastAction: null,
      actionsToday: 0
    };
    
    console.log('[TEST_MODE_LIMITER_INITIALIZED]', {
      enabled: this.enabled,
      limits: this.limits
    });
  }
  
  // Vérifier si une action est autorisée
  checkActionAllowed(actionType, context = {}) {
    // BYPASS: Real validation mode bypasses ALL test limits
    if (getFlag('AGENT_REAL_VALIDATION_MODE')) {
      console.log('[LIMITER BYPASSED - REAL MODE]');
      console.log({
        event: 'limiter_bypass',
        mode: 'real_validation',
        timestamp: Date.now()
      });
      return { allowed: true, reason: 'real_mode' };
    }
    
    if (!this.enabled) {
      return { allowed: true, reason: 'test_mode_disabled' };
    }
    
    try {
      // Reset compteurs si nécessaire
      this.resetCountersIfNeeded();
      
      // Vérifier selon le type d'action
      switch (actionType) {
        case 'run':
          return this.checkRunAllowed();
        case 'followup':
          return this.checkFollowupAllowed();
        case 'outbound':
          return this.checkOutboundAllowed();
        case 'message':
          return this.checkMessageAllowed();
        case 'any':
          return this.checkAnyActionAllowed();
        default:
          return { allowed: true, reason: 'unknown_action_type' };
      }
      
    } catch (error) {
      console.log('[TEST_MODE_LIMITER_ERROR]', {
        actionType,
        error: error.message
      });
      
      // En cas d'erreur, autoriser pour éviter de bloquer
      return { allowed: true, reason: 'error_fallback' };
    }
  }
  
  // Vérifier si un run est autorisé
  checkRunAllowed() {
    // En mode test, limiter à maxPerRun leads
    return {
      allowed: true,
      maxLeads: this.limits.maxPerRun,
      reason: 'test_mode_limit'
    };
  }
  
  // Vérifier si un follow-up est autorisé
  checkFollowupAllowed() {
    if (this.limits.maxFollowups === 0) {
      return {
        allowed: false,
        reason: 'followup_disabled_in_test',
        limit: this.limits.maxFollowups
      };
    }
    
    return {
      allowed: true,
      reason: 'followup_allowed'
    };
  }
  
  // Vérifier si un outbound est autorisé
  checkOutboundAllowed() {
    // Vérifier limite journalière
    if (this.counters.daily.outbound >= this.limits.maxOutboundDaily) {
      return {
        allowed: false,
        reason: 'daily_outbound_limit_exceeded',
        current: this.counters.daily.outbound,
        limit: this.limits.maxOutboundDaily
      };
    }
    
    return {
      allowed: true,
      reason: 'outbound_allowed'
    };
  }
  
  // Vérifier si un message est autorisé
  checkMessageAllowed() {
    // Vérifier limite horaire
    if (this.counters.hourly.messages >= this.limits.maxMessagesPerHour) {
      return {
        allowed: false,
        reason: 'hourly_message_limit_exceeded',
        current: this.counters.hourly.messages,
        limit: this.limits.maxMessagesPerHour
      };
    }
    
    // Vérifier cooldown
    if (this.counters.lastAction) {
      const timeSinceLastAction = Date.now() - this.counters.lastAction;
      const cooldownMs = this.limits.cooldownMinutes * 60 * 1000;
      
      if (timeSinceLastAction < cooldownMs) {
        const remainingCooldown = Math.ceil((cooldownMs - timeSinceLastAction) / 1000 / 60);
        
        return {
          allowed: false,
          reason: 'cooldown_not_respected',
          remainingCooldown,
          cooldownPeriod: this.limits.cooldownMinutes
        };
      }
    }
    
    return {
      allowed: true,
      reason: 'message_allowed'
    };
  }
  
  // Vérifier si une action quelconque est autorisée
  checkAnyActionAllowed() {
    // Vérifier cooldown global
    if (this.counters.lastAction) {
      const timeSinceLastAction = Date.now() - this.counters.lastAction;
      const cooldownMs = this.limits.cooldownMinutes * 60 * 1000;
      
      if (timeSinceLastAction < cooldownMs) {
        const remainingCooldown = Math.ceil((cooldownMs - timeSinceLastAction) / 1000 / 60);
        
        return {
          allowed: false,
          reason: 'global_cooldown_not_respected',
          remainingCooldown,
          cooldownPeriod: this.limits.cooldownMinutes
        };
      }
    }
    
    return {
      allowed: true,
      reason: 'action_allowed'
    };
  }
  
  // Enregistrer une action
  recordAction(actionType, context = {}) {
    if (!this.enabled) {
      return;
    }
    
    this.counters.lastAction = Date.now();
    this.counters.actionsToday++;
    
    // Mettre à jour les compteurs spécifiques
    switch (actionType) {
      case 'outbound':
        this.counters.daily.outbound++;
        break;
      case 'message':
        this.counters.hourly.messages++;
        break;
    }
    
    console.log('[TEST_MODE_LIMITER_ACTION_RECORDED]', {
      actionType,
      context,
      counters: {
        dailyOutbound: this.counters.daily.outbound,
        hourlyMessages: this.counters.hourly.messages,
        actionsToday: this.counters.actionsToday
      }
    });
  }
  
  // Obtenir les limites actuelles
  getCurrentLimits() {
    if (!this.enabled) {
      return { enabled: false };
    }
    
    // Reset compteurs si nécessaire
    this.resetCountersIfNeeded();
    
    return {
      enabled: this.enabled,
      limits: this.limits,
      counters: this.counters,
      remaining: {
        dailyOutbound: Math.max(0, this.limits.maxOutboundDaily - this.counters.daily.outbound),
        hourlyMessages: Math.max(0, this.limits.maxMessagesPerHour - this.counters.hourly.messages),
        nextActionAvailable: this.counters.lastAction ? 
          new Date(this.counters.lastAction + (this.limits.cooldownMinutes * 60 * 1000)) : null
      }
    };
  }
  
  // Réinitialiser les compteurs si nécessaire
  resetCountersIfNeeded() {
    const now = new Date();
    const today = now.toDateString();
    const currentHour = now.getHours();
    
    // Reset journalier
    if (this.counters.daily.lastReset !== today) {
      console.log('[TEST_MODE_LIMITER_DAILY_RESET]', {
        previousDay: this.counters.daily.lastReset,
        newDay: today,
        outboundYesterday: this.counters.daily.outbound
      });
      
      this.counters.daily = {
        outbound: 0,
        lastReset: today
      };
      this.counters.actionsToday = 0;
    }
    
    // Reset horaire
    if (this.counters.hourly.lastReset !== currentHour) {
      console.log('[TEST_MODE_LIMITER_HOURLY_RESET]', {
        previousHour: this.counters.hourly.lastReset,
        newHour: currentHour,
        messagesLastHour: this.counters.hourly.messages
      });
      
      this.counters.hourly = {
        messages: 0,
        lastReset: currentHour
      };
    }
  }
  
  // Obtenir les stats du limiter
  getLimiterStats() {
    if (!this.enabled) {
      return { enabled: false };
    }
    
    this.resetCountersIfNeeded();
    
    const utilization = {
      dailyOutbound: this.limits.maxOutboundDaily > 0 ? 
        (this.counters.daily.outbound / this.limits.maxOutboundDaily) * 100 : 0,
      hourlyMessages: this.limits.maxMessagesPerHour > 0 ? 
        (this.counters.hourly.messages / this.limits.maxMessagesPerHour) * 100 : 0
    };
    
    return {
      enabled: this.enabled,
      limits: this.limits,
      counters: this.counters,
      utilization: {
        dailyOutbound: Math.round(utilization.dailyOutbound * 100) / 100,
        hourlyMessages: Math.round(utilization.hourlyMessages * 100) / 100
      },
      uptime: process.uptime()
    };
  }
  
  // Réinitialiser manuellement
  reset() {
    this.counters = {
      daily: {
        outbound: 0,
        lastReset: new Date().toDateString()
      },
      hourly: {
        messages: 0,
        lastReset: new Date().getHours()
      },
      lastAction: null,
      actionsToday: 0
    };
    
    console.log('[TEST_MODE_LIMITER_RESET]');
  }
  
  // Ajuster les limites (pour tests)
  adjustLimits(newLimits) {
    if (!this.enabled) {
      return { success: false, reason: 'test_mode_disabled' };
    }
    
    const oldLimits = { ...this.limits };
    
    // Appliquer les nouvelles limites avec validation
    if (newLimits.maxPerRun !== undefined && newLimits.maxPerRun >= 0) {
      this.limits.maxPerRun = Math.min(newLimits.maxPerRun, 5); // Max 5 même en test
    }
    
    if (newLimits.maxFollowups !== undefined && newLimits.maxFollowups >= 0) {
      this.limits.maxFollowups = Math.min(newLimits.maxFollowups, 2); // Max 2 en test
    }
    
    if (newLimits.maxOutboundDaily !== undefined && newLimits.maxOutboundDaily >= 0) {
      this.limits.maxOutboundDaily = Math.min(newLimits.maxOutboundDaily, 20); // Max 20 en test
    }
    
    if (newLimits.maxMessagesPerHour !== undefined && newLimits.maxMessagesPerHour >= 0) {
      this.limits.maxMessagesPerHour = Math.min(newLimits.maxMessagesPerHour, 10); // Max 10 en test
    }
    
    if (newLimits.cooldownMinutes !== undefined && newLimits.cooldownMinutes >= 0) {
      this.limits.cooldownMinutes = Math.max(newLimits.cooldownMinutes, 1); // Min 1 minute
    }
    
    console.log('[TEST_MODE_LIMITER_LIMITS_ADJUSTED]', {
      oldLimits,
      newLimits: this.limits
    });
    
    return {
      success: true,
      oldLimits,
      newLimits: this.limits
    };
  }
}

// Instance globale du limiter
if (!global.testModeLimiter) {
  global.testModeLimiter = new TestModeLimiter();
}

// Fonctions principales
function checkActionAllowed(actionType, context) {
  return global.testModeLimiter.checkActionAllowed(actionType, context);
}

function recordAction(actionType, context) {
  return global.testModeLimiter.recordAction(actionType, context);
}

function getCurrentLimits() {
  return global.testModeLimiter.getCurrentLimits();
}

// Stats et monitoring
function getLimiterStats() {
  return global.testModeLimiter.getLimiterStats();
}

// Administration
function resetLimiter() {
  return global.testModeLimiter.reset();
}

function adjustLimits(newLimits) {
  return global.testModeLimiter.adjustLimits(newLimits);
}

module.exports = {
  checkActionAllowed,
  recordAction,
  getCurrentLimits,
  getLimiterStats,
  resetLimiter,
  adjustLimits,
  TestModeLimiter
};
