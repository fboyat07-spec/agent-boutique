// ACTION 11 - Protection anti-boucle

const BusinessLogger = require('./businessLogger');

// Protection anti-boucle pour éviter actions infinies sur un lead
class LoopProtection {
  constructor() {
    this.leadCounters = new Map(); // phone:tenant_id -> counter
    this.globalCounters = {
      totalActions: 0,
      errors: 0,
      lastReset: Date.now()
    };
    this.thresholds = {
      maxActionsPerLead: parseInt(process.env.LOOP_PROTECTION_MAX_ACTIONS_PER_LEAD) || 10,
      maxGlobalActions: parseInt(process.env.LOOP_PROTECTION_MAX_GLOBAL_ACTIONS) || 1000,
      maxErrorRate: parseFloat(process.env.LOOP_PROTECTION_MAX_ERROR_RATE) || 0.3, // 30%
      resetInterval: parseInt(process.env.LOOP_PROTECTION_RESET_INTERVAL) || 3600000 // 1 heure
    };
    this.blockedLeads = new Set(); // Leads temporairement bloqués
    this.anomalies = []; // Anomalies détectées
  }
  
  // Obtenir clé pour lead
  getLeadKey(phone, tenant_id) {
    return `${phone}:${tenant_id}`;
  }
  
  // Vérifier si action est permise pour ce lead
  canExecuteAction(phone, tenant_id, actionType = 'general') {
    const leadKey = this.getLeadKey(phone, tenant_id);
    
    // Vérifier si lead est bloqué
    if (this.blockedLeads.has(leadKey)) {
      console.log('[LOOP_PROTECTION_LEAD_BLOCKED]', {
        phone: phone.substring(0, -4) + '****',
        tenant_id,
        actionType
      });
      
      return {
        allowed: false,
        reason: 'lead_blocked',
        leadKey,
        actionType
      };
    }
    
    // Vérifier compteur lead
    const leadCounter = this.leadCounters.get(leadKey) || {
      count: 0,
      lastAction: Date.now(),
      errors: 0,
      actionTypes: {}
    };
    
    // Reset si trop ancien
    const now = Date.now();
    if (now - leadCounter.lastAction > this.thresholds.resetInterval) {
      leadCounter.count = 0;
      leadCounter.errors = 0;
      leadCounter.actionTypes = {};
      console.log('[LOOP_PROTECTION_LEAD_RESET]', {
        phone: phone.substring(0, -4) + '****',
        tenant_id
      });
    }
    
    // Vérifier seuil d'actions par lead
    if (leadCounter.count >= this.thresholds.maxActionsPerLead) {
      console.log('[LOOP_PROTECTION_THRESHOLD_EXCEEDED]', {
        phone: phone.substring(0, -4) + '****',
        tenant_id,
        currentCount: leadCounter.count,
        threshold: this.thresholds.maxActionsPerLead,
        actionType
      });
      
      // Bloquer lead temporairement
      this.blockLeadTemporarily(leadKey, 'too_many_actions');
      
      // Enregistrer anomalie
      this.recordAnomaly({
        type: 'lead_action_threshold',
        phone,
        tenant_id,
        count: leadCounter.count,
        threshold: this.thresholds.maxActionsPerLead,
        actionType,
        timestamp: now
      });
      
      return {
        allowed: false,
        reason: 'action_threshold_exceeded',
        leadKey,
        currentCount: leadCounter.count,
        threshold: this.thresholds.maxActionsPerLead
      };
    }
    
    // Vérifier taux d'erreur
    if (leadCounter.count > 5 && leadCounter.errors / leadCounter.count > this.thresholds.maxErrorRate) {
      console.log('[LOOP_PROTECTION_ERROR_RATE_HIGH]', {
        phone: phone.substring(0, -4) + '****',
        tenant_id,
        errorRate: (leadCounter.errors / leadCounter.count) * 100,
        threshold: this.thresholds.maxErrorRate * 100
      });
      
      // Bloquer lead temporairement
      this.blockLeadTemporarily(leadKey, 'high_error_rate');
      
      // Enregistrer anomalie
      this.recordAnomaly({
        type: 'high_error_rate',
        phone,
        tenant_id,
        errorRate: leadCounter.errors / leadCounter.count,
        threshold: this.thresholds.maxErrorRate,
        timestamp: now
      });
      
      return {
        allowed: false,
        reason: 'high_error_rate',
        leadKey,
        errorRate: (leadCounter.errors / leadCounter.count) * 100
      };
    }
    
    // Vérifier seuil global
    if (this.globalCounters.totalActions >= this.thresholds.maxGlobalActions) {
      console.log('[LOOP_PROTECTION_GLOBAL_THRESHOLD_EXCEEDED]', {
        currentGlobal: this.globalCounters.totalActions,
        threshold: this.thresholds.maxGlobalActions
      });
      
      // Enregistrer anomalie globale
      this.recordAnomaly({
        type: 'global_action_threshold',
        globalCount: this.globalCounters.totalActions,
        threshold: this.thresholds.maxGlobalActions,
        timestamp: now
      });
      
      return {
        allowed: false,
        reason: 'global_threshold_exceeded',
        globalCount: this.globalCounters.totalActions,
        threshold: this.thresholds.maxGlobalActions
      };
    }
    
    // Vérifier pattern suspect (même type d'action répété)
    const actionCount = leadCounter.actionTypes[actionType] || 0;
    if (leadCounter.count > 3 && actionCount / leadCounter.count > 0.8) {
      console.log('[LOOP_PROTECTION_SUSPICIOUS_PATTERN]', {
        phone: phone.substring(0, -4) + '****',
        tenant_id,
        actionType,
        actionCount,
        totalActions: leadCounter.count,
        ratio: (actionCount / leadCounter.count) * 100
      });
      
      // Bloquer lead temporairement
      this.blockLeadTemporarily(leadKey, 'suspicious_pattern');
      
      // Enregistrer anomalie
      this.recordAnomaly({
        type: 'suspicious_pattern',
        phone,
        tenant_id,
        actionType,
        actionCount,
        totalActions: leadCounter.count,
        ratio: actionCount / leadCounter.count,
        timestamp: now
      });
      
      return {
        allowed: false,
        reason: 'suspicious_pattern',
        leadKey,
        actionType,
        ratio: (actionCount / leadCounter.count) * 100
      };
    }
    
    return {
      allowed: true,
      leadKey,
      currentCount: leadCounter.count
    };
  }
  
  // Enregistrer action exécutée
  recordAction(phone, tenant_id, actionType = 'general', success = true) {
    const leadKey = this.getLeadKey(phone, tenant_id);
    
    // Mettre à jour compteur lead
    if (!this.leadCounters.has(leadKey)) {
      this.leadCounters.set(leadKey, {
        count: 0,
        lastAction: Date.now(),
        errors: 0,
        actionTypes: {}
      });
    }
    
    const leadCounter = this.leadCounters.get(leadKey);
    leadCounter.count++;
    leadCounter.lastAction = Date.now();
    
    if (!success) {
      leadCounter.errors++;
      this.globalCounters.errors++;
    }
    
    // Compter par type d'action
    leadCounter.actionTypes[actionType] = (leadCounter.actionTypes[actionType] || 0) + 1;
    
    // Mettre à jour compteur global
    this.globalCounters.totalActions++;
    
    console.log('[LOOP_PROTECTION_ACTION_RECORDED]', {
      phone: phone.substring(0, -4) + '****',
      tenant_id,
      actionType,
      success,
      leadCount: leadCounter.count,
      leadErrors: leadCounter.errors,
      globalCount: this.globalCounters.totalActions
    });
  }
  
  // Bloquer lead temporairement
  blockLeadTemporarily(leadKey, reason) {
    this.blockedLeads.add(leadKey);
    
    // Débloquer après 30 minutes
    setTimeout(() => {
      this.blockedLeads.delete(leadKey);
      console.log('[LOOP_PROTECTION_LEAD_UNBLOCKED]', { leadKey, reason });
    }, 30 * 60 * 1000); // 30 minutes
    
    console.log('[LOOP_PROTECTION_LEAD_BLOCKED_TEMPORARILY]', {
      leadKey,
      reason,
      duration: '30 minutes'
    });
    
    BusinessLogger.logWebhookError('Lead temporarily blocked', {
      context: 'loop_protection',
      leadKey,
      reason
    });
  }
  
  // Enregistrer anomalie
  recordAnomaly(anomaly) {
    this.anomalies.push(anomaly);
    
    // Limiter taille des anomalies
    if (this.anomalies.length > 1000) {
      this.anomalies = this.anomalies.slice(-500);
    }
    
    console.log('[LOOP_PROTECTION_ANOMALY_RECORDED]', anomaly);
  }
  
  // Wrapper pour exécuter action avec protection
  async executeWithProtection(phone, tenant_id, actionType, actionFunction) {
    const canExecute = this.canExecuteAction(phone, tenant_id, actionType);
    
    if (!canExecute.allowed) {
      console.log('[LOOP_PROTECTION_ACTION_BLOCKED]', {
        phone: phone.substring(0, -4) + '****',
        tenant_id,
        actionType,
        reason: canExecute.reason
      });
      
      return {
        success: false,
        reason: canExecute.reason,
        protected: true
      };
    }
    
    const startTime = Date.now();
    
    try {
      // Enregistrer début d'action
      this.recordAction(phone, tenant_id, actionType, true);
      
      // Exécuter l'action
      const result = await actionFunction();
      
      const duration = Date.now() - startTime;
      
      console.log('[LOOP_PROTECTION_ACTION_SUCCESS]', {
        phone: phone.substring(0, -4) + '****',
        tenant_id,
        actionType,
        duration
      });
      
      return {
        success: true,
        result,
        duration,
        protected: false
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Enregistrer erreur
      this.recordAction(phone, tenant_id, actionType, false);
      
      console.log('[LOOP_PROTECTION_ACTION_ERROR]', {
        phone: phone.substring(0, -4) + '****',
        tenant_id,
        actionType,
        error: error.message,
        duration
      });
      
      return {
        success: false,
        error: error.message,
        duration,
        protected: false
      };
    }
  }
  
  // Obtenir stats de protection
  getStats() {
    const leadStats = [];
    
    for (const [leadKey, counter] of this.leadCounters.entries()) {
      const [phone, tenant_id] = leadKey.split(':');
      
      leadStats.push({
        phone: phone.substring(0, -4) + '****',
        tenant_id,
        count: counter.count,
        errors: counter.errors,
        errorRate: counter.count > 0 ? (counter.errors / counter.count) * 100 : 0,
        lastAction: new Date(counter.lastAction),
        actionTypes: counter.actionTypes,
        isBlocked: this.blockedLeads.has(leadKey)
      });
    }
    
    // Trier par nombre d'actions décroissant
    leadStats.sort((a, b) => b.count - a.count);
    
    return {
      thresholds: this.thresholds,
      globalCounters: this.globalCounters,
      totalLeads: this.leadCounters.size,
      blockedLeads: this.blockedLeads.size,
      leadStats: leadStats.slice(0, 10), // Top 10
      recentAnomalies: this.anomalies.slice(-10),
      uptime: process.uptime()
    };
  }
  
  // Health check de la protection
  healthCheck() {
    const stats = this.getStats();
    
    const health = {
      status: 'healthy',
      issues: [],
      recommendations: []
    };
    
    // Vérifier taux d'erreur global
    const globalErrorRate = stats.globalCounters.totalActions > 0 ? 
      (stats.globalCounters.errors / stats.globalCounters.totalActions) * 100 : 0;
    
    if (globalErrorRate > 20) {
      health.status = 'warning';
      health.issues.push('High global error rate');
      health.recommendations.push('Investigate system-wide errors');
    }
    
    // Vérifier nombre de leads bloqués
    if (stats.blockedLeads > stats.totalLeads * 0.1) {
      health.status = 'warning';
      health.issues.push('Many leads blocked');
      health.recommendations.push('Review action thresholds');
    }
    
    // Vérifier anomalies récentes
    const recentAnomalies = stats.recentAnomalies.filter(a => 
      Date.now() - a.timestamp < 3600000 // Dernière heure
    );
    
    if (recentAnomalies.length > 10) {
      health.status = 'warning';
      health.issues.push('High anomaly rate');
      health.recommendations.push('Investigate suspicious patterns');
    }
    
    // Vérifier utilisation mémoire
    if (stats.totalLeads > 10000) {
      health.status = 'warning';
      health.issues.push('High memory usage');
      health.recommendations.push('Consider cleanup of old data');
    }
    
    return {
      ...health,
      stats: {
        totalLeads: stats.totalLeads,
        blockedLeads: stats.blockedLeads,
        globalActions: stats.globalCounters.totalActions,
        globalErrorRate: Math.round(globalErrorRate * 100) / 100,
        recentAnomalies: recentAnomalies.length
      }
    };
  }
  
  // Nettoyer anciennes données
  cleanup() {
    const oneHourAgo = Date.now() - this.thresholds.resetInterval;
    let cleaned = 0;
    
    for (const [leadKey, counter] of this.leadCounters.entries()) {
      if (counter.lastAction < oneHourAgo) {
        this.leadCounters.delete(leadKey);
        this.blockedLeads.delete(leadKey);
        cleaned++;
      }
    }
    
    // Nettoyer anomalies anciennes (plus de 24 heures)
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    const oldAnomalies = this.anomalies.filter(a => a.timestamp < oneDayAgo);
    this.anomalies = this.anomalies.filter(a => a.timestamp >= oneDayAgo);
    
    console.log('[LOOP_PROTECTION_CLEANUP]', {
      cleanedLeads: cleaned,
      cleanedAnomalies: oldAnomalies.length,
      remainingLeads: this.leadCounters.size,
      remainingAnomalies: this.anomalies.length
    });
    
    return { cleanedLeads: cleaned, cleanedAnomalies: oldAnomalies.length };
  }
  
  // Réinitialiser manuellement
  reset() {
    this.leadCounters.clear();
    this.blockedLeads.clear();
    this.anomalies = [];
    this.globalCounters = {
      totalActions: 0,
      errors: 0,
      lastReset: Date.now()
    };
    
    console.log('[LOOP_PROTECTION_RESET]');
  }
}

// Instance globale de protection
if (!global.loopProtection) {
  global.loopProtection = new LoopProtection();
}

// Fonctions principales
async function executeWithLoopProtection(phone, tenant_id, actionType, actionFunction) {
  return await global.loopProtection.executeWithProtection(phone, tenant_id, actionType, actionFunction);
}

function canExecuteAction(phone, tenant_id, actionType) {
  return global.loopProtection.canExecuteAction(phone, tenant_id, actionType);
}

function recordAction(phone, tenant_id, actionType, success) {
  return global.loopProtection.recordAction(phone, tenant_id, actionType, success);
}

// Stats et monitoring
function getLoopProtectionStats() {
  return global.loopProtection.getStats();
}

function loopProtectionHealthCheck() {
  return global.loopProtection.healthCheck();
}

// Administration
function cleanupLoopProtection() {
  return global.loopProtection.cleanup();
}

function resetLoopProtection() {
  return global.loopProtection.reset();
}

module.exports = {
  executeWithLoopProtection,
  canExecuteAction,
  recordAction,
  getLoopProtectionStats,
  loopProtectionHealthCheck,
  cleanupLoopProtection,
  resetLoopProtection,
  LoopProtection
};
