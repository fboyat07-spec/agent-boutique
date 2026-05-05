// ACTION 2 - Logs complets pipeline

const BusinessLogger = require('./businessLogger');
const { getFlag } = require('./envFlags');

// Logger spécialisé pour mode test (SAFE - logs supplémentaires uniquement)
class TestModeLogger {
  constructor() {
    this.enabled = getFlag('AGENT_TEST_MODE');
    this.traceMap = new Map(); // phone -> traceId
    this.pipelineLogs = new Map(); // traceId -> logs
    this.stats = {
      totalLogs: 0,
      steps: {},
      errors: 0
    };
    
    console.log('[TEST_MODE_LOGGER_INITIALIZED]', {
      enabled: this.enabled
    });
  }
  
  // Générer ou récupérer trace ID pour un lead
  getTraceId(phone) {
    if (!this.enabled) {
      return null;
    }
    
    if (!this.traceMap.has(phone)) {
      const traceId = `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      this.traceMap.set(phone, traceId);
      this.pipelineLogs.set(traceId, []);
      
      console.log('[TEST_MODE_TRACE_CREATED]', {
        phone: this.maskPhone(phone),
        traceId
      });
    }
    
    return this.traceMap.get(phone);
  }
  
  // Logger une étape du pipeline
  logPipelineStep(step, leadData, additionalData = {}) {
    if (!this.enabled) {
      return;
    }
    
    const {
      phone,
      lead_id,
      tenant_id,
      status,
      timestamp = new Date()
    } = leadData;
    
    const traceId = this.getTraceId(phone);
    
    if (!traceId) {
      return;
    }
    
    const logEntry = {
      step,
      traceId,
      lead_id,
      tenant_id,
      phone: this.maskPhone(phone),
      status,
      timestamp,
      ...additionalData
    };
    
    // Ajouter au pipeline logs
    const traceLogs = this.pipelineLogs.get(traceId);
    traceLogs.push(logEntry);
    
    // Stats
    this.stats.totalLogs++;
    this.stats.steps[step] = (this.stats.steps[step] || 0) + 1;
    
    // Log business logger
    BusinessLogger.logWithContext('info', `test_${step}`, tenant_id, lead_id, {
      traceId,
      step,
      status,
      ...additionalData
    });
    
    console.log(`[TEST_MODE_PIPELINE_${step.toUpperCase()}]`, {
      traceId,
      lead_id,
      tenant_id,
      phone: this.maskPhone(phone),
      status,
      timestamp
    });
  }
  
  // Logger réception inbound
  logInboundReceived(phone, tenant_id, webhookData) {
    this.logPipelineStep('inbound_received', {
      phone,
      tenant_id,
      status: 'INCOMING',
      timestamp: new Date()
    }, {
      webhookSize: JSON.stringify(webhookData).length,
      source: 'webhook'
    });
  }
  
  // Logger création lead
  logLeadCreated(lead) {
    this.logPipelineStep('lead_created', {
      phone: lead.phone,
      lead_id: lead.id,
      tenant_id: lead.tenant_id,
      status: lead.status,
      timestamp: lead.createdAt
    }, {
      score: lead.score,
      source: lead.source || 'webhook'
    });
  }
  
  // Logger lead trouvé (doublon)
  logLeadFound(lead) {
    this.logPipelineStep('lead_found', {
      phone: lead.phone,
      lead_id: lead.id,
      tenant_id: lead.tenant_id,
      status: lead.status,
      timestamp: new Date()
    }, {
      existingSince: lead.createdAt,
      currentScore: lead.score
    });
  }
  
  // Logger détection intent
  logIntentDetected(phone, tenant_id, lead_id, intent, confidence) {
    this.logPipelineStep('intent_detected', {
      phone,
      lead_id,
      tenant_id,
      status: 'PROCESSING',
      timestamp: new Date()
    }, {
      intent,
      confidence
    });
  }
  
  // Logger changement de statut
  logStatusChange(phone, tenant_id, lead_id, oldStatus, newStatus, reason) {
    this.logPipelineStep('status_changed', {
      phone,
      lead_id,
      tenant_id,
      status: newStatus,
      timestamp: new Date()
    }, {
      oldStatus,
      newStatus,
      reason
    });
  }
  
  // Logger envoi message
  logMessageSent(phone, tenant_id, lead_id, messageType, content) {
    this.logPipelineStep('message_sent', {
      phone,
      lead_id,
      tenant_id,
      status: 'CONTACTED',
      timestamp: new Date()
    }, {
      messageType,
      contentLength: content ? content.length : 0,
      contentPreview: content ? content.substring(0, 100) : null
    });
  }
  
  // Logger envoi lien paiement
  logPaymentLinkSent(phone, tenant_id, lead_id, paymentLink, amount) {
    this.logPipelineStep('payment_link_sent', {
      phone,
      lead_id,
      tenant_id,
      status: 'PAYMENT_SENT',
      timestamp: new Date()
    }, {
      paymentLink: this.maskUrl(paymentLink),
      amount,
      currency: 'EUR'
    });
  }
  
  // Logger blocage paiement
  logPaymentBlocked(phone, tenant_id, lead_id, reason) {
    this.logPipelineStep('payment_blocked', {
      phone,
      lead_id,
      tenant_id,
      status: 'PAYMENT_BLOCKED',
      timestamp: new Date()
    }, {
      reason
    });
  }
  
  // Logger doublon détecté
  logDuplicateDetected(phone, tenant_id, existingLeadId, newLeadId) {
    this.logPipelineStep('duplicate_detected', {
      phone,
      tenant_id,
      status: 'DUPLICATE',
      timestamp: new Date()
    }, {
      existingLeadId,
      newLeadId,
      action: 'skipped'
    });
  }
  
  // Logger erreur
  logError(step, phone, tenant_id, lead_id, error, context = {}) {
    this.stats.errors++;
    
    this.logPipelineStep(`error_${step}`, {
      phone,
      lead_id,
      tenant_id,
      status: 'ERROR',
      timestamp: new Date()
    }, {
      error: error.message,
      stack: error.stack,
      context
    });
    
    console.log(`[TEST_MODE_ERROR_${step.toUpperCase()}]`, {
      phone: this.maskPhone(phone),
      tenant_id,
      lead_id,
      error: error.message
    });
  }
  
  // Obtenir l'historique complet d'un trace
  getTraceHistory(traceId) {
    if (!this.enabled) {
      return { enabled: false };
    }
    
    const logs = this.pipelineLogs.get(traceId);
    
    if (!logs) {
      return { error: 'Trace not found' };
    }
    
    return {
      traceId,
      logs,
      stepCount: logs.length,
      duration: logs.length > 1 ? {
        start: logs[0].timestamp,
        end: logs[logs.length - 1].timestamp,
        totalMs: new Date(logs[logs.length - 1].timestamp) - new Date(logs[0].timestamp)
      } : null
    };
  }
  
  // Obtenir l'historique par téléphone
  getPhoneHistory(phone) {
    const traceId = this.getTraceId(phone);
    
    if (!traceId) {
      return { error: 'No trace found for phone' };
    }
    
    return this.getTraceHistory(traceId);
  }
  
  // Obtenir les stats du logger
  getTestModeStats() {
    return {
      enabled: this.enabled,
      stats: {
        totalLogs: this.stats.totalLogs,
        errors: this.stats.errors,
        activeTraces: this.traceMap.size,
        steps: this.stats.steps
      },
      recentTraces: this.getRecentTraces(10),
      uptime: process.uptime()
    };
  }
  
  // Obtenir les traces récentes
  getRecentTraces(limit = 10) {
    const traces = [];
    
    for (const [phone, traceId] of this.traceMap.entries()) {
      const logs = this.pipelineLogs.get(traceId);
      
      if (logs && logs.length > 0) {
        traces.push({
          phone: this.maskPhone(phone),
          traceId,
          stepCount: logs.length,
          lastStep: logs[logs.length - 1].step,
          lastStatus: logs[logs.length - 1].status,
          lastUpdate: logs[logs.length - 1].timestamp
        });
      }
    }
    
    // Trier par dernière activité
    traces.sort((a, b) => new Date(b.lastUpdate) - new Date(a.lastUpdate));
    
    return traces.slice(0, limit);
  }
  
  // Nettoyer les anciennes traces
  cleanup(maxAge = 24 * 60 * 60 * 1000) { // 24 heures
    const cutoff = Date.now() - maxAge;
    let cleaned = 0;
    
    for (const [phone, traceId] of this.traceMap.entries()) {
      const logs = this.pipelineLogs.get(traceId);
      
      if (logs && logs.length > 0) {
        const lastUpdate = new Date(logs[logs.length - 1].timestamp).getTime();
        
        if (lastUpdate < cutoff) {
          this.traceMap.delete(phone);
          this.pipelineLogs.delete(traceId);
          cleaned++;
        }
      }
    }
    
    if (cleaned > 0) {
      console.log('[TEST_MODE_LOGGER_CLEANUP]', {
        cleaned,
        remaining: this.traceMap.size
      });
    }
    
    return cleaned;
  }
  
  // Réinitialiser
  reset() {
    this.traceMap.clear();
    this.pipelineLogs.clear();
    this.stats = {
      totalLogs: 0,
      steps: {},
      errors: 0
    };
    
    console.log('[TEST_MODE_LOGGER_RESET]');
  }
  
  // Masquer téléphone pour logs
  maskPhone(phone) {
    if (!phone || typeof phone !== 'string') return 'unknown';
    return phone.slice(0, -4) + '****';
  }
  
  // Masquer URL pour logs
  maskUrl(url) {
    if (!url || typeof url !== 'string') return 'unknown';
    return url.substring(0, 50) + '****';
  }
}

// Instance globale du logger test mode
if (!global.testModeLogger) {
  global.testModeLogger = new TestModeLogger();
}

// Fonctions principales
function logInboundReceived(phone, tenant_id, webhookData) {
  return global.testModeLogger.logInboundReceived(phone, tenant_id, webhookData);
}

function logLeadCreated(lead) {
  return global.testModeLogger.logLeadCreated(lead);
}

function logLeadFound(lead) {
  return global.testModeLogger.logLeadFound(lead);
}

function logIntentDetected(phone, tenant_id, lead_id, intent, confidence) {
  return global.testModeLogger.logIntentDetected(phone, tenant_id, lead_id, intent, confidence);
}

function logStatusChange(phone, tenant_id, lead_id, oldStatus, newStatus, reason) {
  return global.testModeLogger.logStatusChange(phone, tenant_id, lead_id, oldStatus, newStatus, reason);
}

function logMessageSent(phone, tenant_id, lead_id, messageType, content) {
  return global.testModeLogger.logMessageSent(phone, tenant_id, lead_id, messageType, content);
}

function logPaymentLinkSent(phone, tenant_id, lead_id, paymentLink, amount) {
  return global.testModeLogger.logPaymentLinkSent(phone, tenant_id, lead_id, paymentLink, amount);
}

function logPaymentBlocked(phone, tenant_id, lead_id, reason) {
  return global.testModeLogger.logPaymentBlocked(phone, tenant_id, lead_id, reason);
}

function logDuplicateDetected(phone, tenant_id, existingLeadId, newLeadId) {
  return global.testModeLogger.logDuplicateDetected(phone, tenant_id, existingLeadId, newLeadId);
}

function logError(step, phone, tenant_id, lead_id, error, context) {
  return global.testModeLogger.logError(step, phone, tenant_id, lead_id, error, context);
}

// Debug et monitoring
function getTraceHistory(traceId) {
  return global.testModeLogger.getTraceHistory(traceId);
}

function getPhoneHistory(phone) {
  return global.testModeLogger.getPhoneHistory(phone);
}

function getTestModeStats() {
  return global.testModeLogger.getTestModeStats();
}

// Administration
function cleanupTestLogs(maxAge) {
  return global.testModeLogger.cleanup(maxAge);
}

function resetTestModeLogger() {
  return global.testModeLogger.reset();
}

module.exports = {
  logInboundReceived,
  logLeadCreated,
  logLeadFound,
  logIntentDetected,
  logStatusChange,
  logMessageSent,
  logPaymentLinkSent,
  logPaymentBlocked,
  logDuplicateDetected,
  logError,
  getTraceHistory,
  getPhoneHistory,
  getTestModeStats,
  cleanupTestLogs,
  resetTestModeLogger,
  TestModeLogger
};
