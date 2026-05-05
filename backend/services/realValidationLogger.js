// ACTION 2 - Logs réels différenciés

const BusinessLogger = require('./businessLogger');
const { getFlag } = require('./envFlags');

// Logger spécialisé pour validation réelle (SAFE - logs différenciés)
class RealValidationLogger {
  constructor() {
    this.testModeEnabled = getFlag('AGENT_TEST_MODE');
    this.realValidationEnabled = getFlag('AGENT_REAL_VALIDATION_MODE');
    this.stats = {
      totalRealLogs: 0,
      inboundReal: 0,
      outboundReal: 0,
      userReplyReal: 0,
      closingTriggerReal: 0,
      errors: 0
    };
    
    console.log('[REAL_VALIDATION_LOGGER_INITIALIZED]', {
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
  
  // Logger inbound réel
  logInboundReal(phone, tenant_id, webhookData, additionalData = {}) {
    if (!this.realValidationEnabled && !this.testModeEnabled) {
      return;
    }
    
    this.stats.totalRealLogs++;
    this.stats.inboundReal++;
    
    const logEntry = {
      environment: this.getEnvironment(),
      step: 'inbound_real',
      phone: this.maskPhone(phone),
      tenant_id,
      timestamp: new Date(),
      source: 'whatsapp_real',
      webhookSize: JSON.stringify(webhookData).length,
      ...additionalData
    };
    
    // Log business logger
    BusinessLogger.logWithContext('info', 'inbound_real', tenant_id, null, {
      phone: this.maskPhone(phone),
      environment: logEntry.environment,
      source: logEntry.source
    });
    
    console.log('[REAL_VALIDATION_INBOUND]', {
      environment: logEntry.environment,
      phone: this.maskPhone(phone),
      tenant_id,
      source: logEntry.source
    });
  }
  
  // Logger outbound réel
  logOutboundReal(phone, tenant_id, lead_id, message, messageType, additionalData = {}) {
    if (!this.realValidationEnabled && !this.testModeEnabled) {
      return;
    }
    
    this.stats.totalRealLogs++;
    this.stats.outboundReal++;
    
    const logEntry = {
      environment: this.getEnvironment(),
      step: 'outbound_real',
      phone: this.maskPhone(phone),
      tenant_id,
      lead_id,
      timestamp: new Date(),
      messageType,
      messageLength: message ? message.length : 0,
      contentPreview: message ? message.substring(0, 100) : null,
      ...additionalData
    };
    
    // Log business logger
    BusinessLogger.logWithContext('info', 'outbound_real', tenant_id, lead_id, {
      phone: this.maskPhone(phone),
      environment: logEntry.environment,
      messageType,
      messageLength: logEntry.messageLength
    });
    
    console.log('[REAL_VALIDATION_OUTBOUND]', {
      environment: logEntry.environment,
      phone: this.maskPhone(phone),
      tenant_id,
      lead_id,
      messageType,
      messageLength: logEntry.messageLength
    });
  }
  
  // Logger réponse utilisateur réel
  logUserReplyReal(phone, tenant_id, lead_id, userMessage, additionalData = {}) {
    if (!this.realValidationEnabled && !this.testModeEnabled) {
      return;
    }
    
    this.stats.totalRealLogs++;
    this.stats.userReplyReal++;
    
    const logEntry = {
      environment: this.getEnvironment(),
      step: 'user_reply_real',
      phone: this.maskPhone(phone),
      tenant_id,
      lead_id,
      timestamp: new Date(),
      userMessageLength: userMessage ? userMessage.length : 0,
      userMessagePreview: userMessage ? userMessage.substring(0, 100) : null,
      ...additionalData
    };
    
    // Log business logger
    BusinessLogger.logWithContext('info', 'user_reply_real', tenant_id, lead_id, {
      phone: this.maskPhone(phone),
      environment: logEntry.environment,
      userMessageLength: logEntry.userMessageLength
    });
    
    console.log('[REAL_VALIDATION_USER_REPLY]', {
      environment: logEntry.environment,
      phone: this.maskPhone(phone),
      tenant_id,
      lead_id,
      userMessageLength: logEntry.userMessageLength
    });
  }
  
  // Logger trigger closing réel
  logClosingTriggerReal(phone, tenant_id, lead_id, closingData, additionalData = {}) {
    if (!this.realValidationEnabled && !this.testModeEnabled) {
      return;
    }
    
    this.stats.totalRealLogs++;
    this.stats.closingTriggerReal++;
    
    const logEntry = {
      environment: this.getEnvironment(),
      step: 'closing_trigger_real',
      phone: this.maskPhone(phone),
      tenant_id,
      lead_id,
      timestamp: new Date(),
      closingData: {
        status: closingData.status,
        score: closingData.score,
        intent: closingData.intent,
        confidence: closingData.confidence
      },
      ...additionalData
    };
    
    // Log business logger
    BusinessLogger.logWithContext('info', 'closing_trigger_real', tenant_id, lead_id, {
      phone: this.maskPhone(phone),
      environment: logEntry.environment,
      closingData: logEntry.closingData
    });
    
    console.log('[REAL_VALIDATION_CLOSING_TRIGGER]', {
      environment: logEntry.environment,
      phone: this.maskPhone(phone),
      tenant_id,
      lead_id,
      status: closingData.status,
      score: closingData.score,
      intent: closingData.intent
    });
  }
  
  // Logger erreur réelle
  logRealError(step, phone, tenant_id, lead_id, error, additionalData = {}) {
    if (!this.realValidationEnabled && !this.testModeEnabled) {
      return;
    }
    
    this.stats.totalRealLogs++;
    this.stats.errors++;
    
    const logEntry = {
      environment: this.getEnvironment(),
      step: `error_${step}`,
      phone: this.maskPhone(phone),
      tenant_id,
      lead_id,
      timestamp: new Date(),
      error: {
        message: error.message,
        stack: error.stack?.substring(0, 500) // Limiter la taille
      },
      ...additionalData
    };
    
    // Log business logger
    BusinessLogger.logWithContext('error', `real_error_${step}`, tenant_id, lead_id, {
      phone: this.maskPhone(phone),
      environment: logEntry.environment,
      errorMessage: error.message
    });
    
    console.log(`[REAL_VALIDATION_ERROR_${step.toUpperCase()}]`, {
      environment: logEntry.environment,
      phone: this.maskPhone(phone),
      tenant_id,
      lead_id,
      error: error.message
    });
  }
  
  // Logger friction point
  logFrictionPoint(phone, tenant_id, lead_id, frictionType, details = {}) {
    if (!this.realValidationEnabled && !this.testModeEnabled) {
      return;
    }
    
    this.stats.totalRealLogs++;
    
    const logEntry = {
      environment: this.getEnvironment(),
      step: 'friction_point',
      phone: this.maskPhone(phone),
      tenant_id,
      lead_id,
      timestamp: new Date(),
      frictionType,
      details,
      ...details
    };
    
    // Log business logger
    BusinessLogger.logWithContext('warning', 'friction_point', tenant_id, lead_id, {
      phone: this.maskPhone(phone),
      environment: logEntry.environment,
      frictionType,
      details
    });
    
    console.log('[REAL_VALIDATION_FRICTION_POINT]', {
      environment: logEntry.environment,
      phone: this.maskPhone(phone),
      tenant_id,
      lead_id,
      frictionType
    });
  }
  
  // Obtenir les stats de validation réelle
  getRealValidationStats() {
    const environment = this.getEnvironment();
    
    return {
      environment,
      enabled: this.realValidationEnabled || this.testModeEnabled,
      stats: {
        totalRealLogs: this.stats.totalRealLogs,
        inboundReal: this.stats.inboundReal,
        outboundReal: this.stats.outboundReal,
        userReplyReal: this.stats.userReplyReal,
        closingTriggerReal: this.stats.closingTriggerReal,
        errors: this.stats.errors
      },
      engagement: {
        replyRate: this.stats.outboundReal > 0 ? 
          (this.stats.userReplyReal / this.stats.outboundReal) * 100 : 0,
        closingRate: this.stats.userReplyReal > 0 ? 
          (this.stats.closingTriggerReal / this.stats.userReplyReal) * 100 : 0
      },
      uptime: process.uptime()
    };
  }
  
  // Obtenir les logs récents
  getRecentRealLogs(limit = 50) {
    // Simulation - en production, utiliserait une vraie base de logs
    return {
      environment: this.getEnvironment(),
      enabled: this.realValidationEnabled || this.testModeEnabled,
      logs: [], // À implémenter avec stockage réel si nécessaire
      count: 0,
      note: 'Real logs storage not implemented - using in-memory stats only'
    };
  }
  
  // Obtenir les logs par téléphone
  getRealLogsByPhone(phone, limit = 20) {
    // Simulation - en production, utiliserait une vraie base de logs
    return {
      environment: this.getEnvironment(),
      enabled: this.realValidationEnabled || this.testModeEnabled,
      phone: this.maskPhone(phone),
      logs: [], // À implémenter avec stockage réel si nécessaire
      count: 0,
      note: 'Real logs storage not implemented - using in-memory stats only'
    };
  }
  
  // Réinitialiser les stats
  resetStats() {
    this.stats = {
      totalRealLogs: 0,
      inboundReal: 0,
      outboundReal: 0,
      userReplyReal: 0,
      closingTriggerReal: 0,
      errors: 0
    };
    
    console.log('[REAL_VALIDATION_LOGGER_STATS_RESET]');
  }
  
  // Masquer téléphone pour logs
  maskPhone(phone) {
    if (!phone || typeof phone !== 'string') return 'unknown';
    return phone.slice(0, -4) + '****';
  }
}

// Instance globale du logger de validation réelle
if (!global.realValidationLogger) {
  global.realValidationLogger = new RealValidationLogger();
}

// Fonctions principales
function logInboundReal(phone, tenant_id, webhookData, additionalData) {
  return global.realValidationLogger.logInboundReal(phone, tenant_id, webhookData, additionalData);
}

function logOutboundReal(phone, tenant_id, lead_id, message, messageType, additionalData) {
  return global.realValidationLogger.logOutboundReal(phone, tenant_id, lead_id, message, messageType, additionalData);
}

function logUserReplyReal(phone, tenant_id, lead_id, userMessage, additionalData) {
  return global.realValidationLogger.logUserReplyReal(phone, tenant_id, lead_id, userMessage, additionalData);
}

function logClosingTriggerReal(phone, tenant_id, lead_id, closingData, additionalData) {
  return global.realValidationLogger.logClosingTriggerReal(phone, tenant_id, lead_id, closingData, additionalData);
}

function logRealError(step, phone, tenant_id, lead_id, error, additionalData) {
  return global.realValidationLogger.logRealError(step, phone, tenant_id, lead_id, error, additionalData);
}

function logFrictionPoint(phone, tenant_id, lead_id, frictionType, details) {
  return global.realValidationLogger.logFrictionPoint(phone, tenant_id, lead_id, frictionType, details);
}

// Stats et monitoring
function getRealValidationStats() {
  return global.realValidationLogger.getRealValidationStats();
}

function getRecentRealLogs(limit) {
  return global.realValidationLogger.getRecentRealLogs(limit);
}

function getRealLogsByPhone(phone, limit) {
  return global.realValidationLogger.getRealLogsByPhone(phone, limit);
}

// Administration
function resetRealValidationStats() {
  return global.realValidationLogger.resetStats();
}

module.exports = {
  logInboundReal,
  logOutboundReal,
  logUserReplyReal,
  logClosingTriggerReal,
  logRealError,
  logFrictionPoint,
  getRealValidationStats,
  getRecentRealLogs,
  getRealLogsByPhone,
  resetRealValidationStats,
  RealValidationLogger
};
