// ACTION 10 - Mode pause client

const { getTenant, updateTenantStatus } = require('./tenantManager');
const BusinessLogger = require('./businessLogger');

// Mode pause client avec effets contrôlés
class TenantPause {
  constructor() {
    this.enabled = process.env.SAAS_ENABLED === 'true';
    this.pausedTenants = new Set(); // tenant_ids en pause
    this.pauseReasons = new Map(); // tenant_id -> reason
    this.pauseHistory = []; // Historique des pauses
    this.stats = {
      totalPauses: 0,
      totalResumes: 0,
      manualPauses: 0,
      autoPauses: 0,
      quotaPauses: 0
    };
    
    console.log('[TENANT_PAUSE_INITIALIZED]', {
      enabled: this.enabled
    });
  }
  
  // Mettre en pause tenant
  pauseTenant(tenant_id, reason = 'manual_pause', duration = null) {
    if (!this.enabled) {
      return { success: false, error: 'Pause mode disabled' };
    }
    
    const tenant = getTenant(tenant_id);
    
    if (!tenant || tenant.tenant_id === 'DEFAULT') {
      console.log('[TENANT_PAUSE_ERROR]', {
        tenant_id,
        reason: 'not_found_or_default'
      });
      
      return { success: false, error: 'Tenant not found or cannot pause default' };
    }
    
    // Vérifier si déjà en pause
    if (this.pausedTenants.has(tenant_id)) {
      console.log('[TENANT_PAUSE_ALREADY]', {
        tenant_id,
        currentReason: this.pauseReasons.get(tenant_id)
      });
      
      return { 
        success: false, 
        error: 'Tenant already paused',
        currentReason: this.pauseReasons.get(tenant_id)
      };
    }
    
    // Mettre à jour statut tenant
    const updateResult = updateTenantStatus(tenant_id, 'PAUSED');
    
    if (!updateResult.success) {
      console.log('[TENANT_PAUSE_UPDATE_FAILED]', {
        tenant_id,
        error: updateResult.error
      });
      
      return updateResult;
    }
    
    // Ajouter au tracking
    this.pausedTenants.add(tenant_id);
    this.pauseReasons.set(tenant_id, reason);
    
    // Historique
    const pauseRecord = {
      tenant_id,
      reason,
      paused_at: Date.now(),
      duration,
      type: this.classifyPauseType(reason)
    };
    
    this.pauseHistory.push(pauseRecord);
    
    // Stats
    this.stats.totalPauses++;
    if (reason === 'manual_pause') this.stats.manualPauses++;
    else if (reason.startsWith('auto_')) this.stats.autoPauses++;
    else if (reason.startsWith('quota_')) this.stats.quotaPauses++;
    
    // Auto-resume si durée spécifiée
    if (duration) {
      setTimeout(() => {
        this.resumeTenant(tenant_id, 'auto_resume_duration');
      }, duration);
    }
    
    console.log('[TENANT_PAUSED]', {
      tenant_id,
      reason,
      duration,
      paused_at: new Date(pauseRecord.paused_at),
      effects: this.getPauseEffects(tenant_id)
    });
    
    BusinessLogger.logWebhookReceived('tenant_paused', tenant_id);
    
    return { 
      success: true, 
      tenant: updateResult.tenant,
      reason,
      paused_at: pauseRecord.paused_at,
      effects: this.getPauseEffects(tenant_id)
    };
  }
  
  // Reprendre tenant
  resumeTenant(tenant_id, reason = 'manual_resume') {
    if (!this.enabled) {
      return { success: false, error: 'Pause mode disabled' };
    }
    
    // Vérifier si en pause
    if (!this.pausedTenants.has(tenant_id)) {
      console.log('[TENANT_RESUME_NOT_PAUSED]', {
        tenant_id
      });
      
      return { 
        success: false, 
        error: 'Tenant not paused'
      };
    }
    
    // Mettre à jour statut tenant
    const updateResult = updateTenantStatus(tenant_id, 'ACTIVE');
    
    if (!updateResult.success) {
      console.log('[TENANT_RESUME_UPDATE_FAILED]', {
        tenant_id,
        error: updateResult.error
      });
      
      return updateResult;
    }
    
    // Retirer du tracking
    this.pausedTenants.delete(tenant_id);
    const pauseReason = this.pauseReasons.get(tenant_id);
    this.pauseReasons.delete(tenant_id);
    
    // Stats
    this.stats.totalResumes++;
    
    // Historique
    const resumeRecord = {
      tenant_id,
      reason,
      resumed_at: Date.now(),
      previous_pause_reason: pauseReason
    };
    
    this.pauseHistory.push(resumeRecord);
    
    console.log('[TENANT_RESUMED]', {
      tenant_id,
      reason,
      previous_pause_reason: pauseReason,
      resumed_at: new Date(resumeRecord.resumed_at),
      effects: this.getResumeEffects(tenant_id)
    });
    
    BusinessLogger.logWebhookReceived('tenant_resumed', tenant_id);
    
    return { 
      success: true, 
      tenant: updateResult.tenant,
      reason,
      resumed_at: resumeRecord.resumed_at,
      effects: this.getResumeEffects(tenant_id)
    };
  }
  
  // Vérifier si tenant est en pause
  isTenantPaused(tenant_id) {
    if (!this.enabled) {
      return { paused: false, reason: 'pause_mode_disabled' };
    }
    
    const isPaused = this.pausedTenants.has(tenant_id);
    
    if (isPaused) {
      return { 
        paused: true, 
        reason: this.pauseReasons.get(tenant_id),
        paused_at: this.getPauseTime(tenant_id)
      };
    }
    
    return { paused: false };
  }
  
  // Obtenir temps de pause
  getPauseTime(tenant_id) {
    for (const record of this.pauseHistory) {
      if (record.tenant_id === tenant_id && record.paused_at && !record.resumed_at) {
        return record.paused_at;
      }
    }
    return null;
  }
  
  // Classifier type de pause
  classifyPauseType(reason) {
    if (reason === 'manual_pause') return 'manual';
    if (reason.startsWith('quota_')) return 'quota';
    if (reason.startsWith('auto_')) return 'automatic';
    if (reason.startsWith('billing_')) return 'billing';
    return 'other';
  }
  
  // Obtenir effets de la pause
  getPauseEffects(tenant_id) {
    return {
      outbound: 'stopped',
      followup: 'stopped',
      ai_processing: 'stopped',
      billing: 'paused',
      monitoring: 'active',
      inbound: 'active'
    };
  }
  
  // Obtenir effets de la reprise
  getResumeEffects(tenant_id) {
    return {
      outbound: 'resumed',
      followup: 'resumed',
      ai_processing: 'resumed',
      billing: 'active',
      monitoring: 'active',
      inbound: 'active'
    };
  }
  
  // Auto-pause pour quota dépassé
  autoPauseForQuota(tenant_id, quotaInfo) {
    const reason = `quota_exceeded_${Date.now()}`;
    const duration = 3600000; // 1 heure
    
    return this.pauseTenant(tenant_id, reason, duration);
  }
  
  // Auto-pause pour billing
  autoPauseForBilling(tenant_id, billingInfo) {
    const reason = `billing_issue_${Date.now()}`;
    const duration = 1800000; // 30 minutes
    
    return this.pauseTenant(tenant_id, reason, duration);
  }
  
  // Wrapper pour exécuter action avec vérification pause
  async executeIfNotPaused(tenant_id, actionFunction, actionType = 'general') {
    const pauseStatus = this.isTenantPaused(tenant_id);
    
    if (pauseStatus.paused) {
      console.log('[TENANT_PAUSE_ACTION_BLOCKED]', {
        tenant_id,
        actionType,
        pauseReason: pauseStatus.reason,
        pausedAt: new Date(pauseStatus.paused_at)
      });
      
      return { 
        success: false, 
        reason: 'tenant_paused',
        pauseReason: pauseStatus.reason,
        blocked: true 
      };
    }
    
    const startTime = Date.now();
    
    try {
      console.log('[TENANT_PAUSE_ACTION_ALLOWED]', {
        tenant_id,
        actionType
      });
      
      const result = await actionFunction();
      
      const duration = Date.now() - startTime;
      
      return { 
        success: true, 
        result, 
        duration,
        allowed: true 
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      console.log('[TENANT_PAUSE_ACTION_ERROR]', {
        tenant_id,
        actionType,
        error: error.message,
        duration
      });
      
      return { 
        success: false, 
        error: error.message, 
        duration,
        allowed: true 
      };
    }
  }
  
  // Obtenir stats de pause
  getPauseStats() {
    const currentPauses = [];
    
    for (const tenant_id of this.pausedTenants) {
      const pauseTime = this.getPauseTime(tenant_id);
      const reason = this.pauseReasons.get(tenant_id);
      
      currentPauses.push({
        tenant_id,
        reason,
        paused_at: pauseTime ? new Date(pauseTime) : null,
        duration: pauseTime ? Date.now() - pauseTime : null,
        type: this.classifyPauseType(reason)
      });
    }
    
    // Trier par durée
    currentPauses.sort((a, b) => (b.duration || 0) - (a.duration || 0));
    
    return {
      enabled: this.enabled,
      stats: this.stats,
      currentPauses: {
        total: this.pausedTenants.size,
        details: currentPauses.slice(0, 10) // Top 10
      },
      pauseTypes: this.calculatePauseTypes(),
      avgPauseDuration: this.calculateAvgPauseDuration(),
      recentHistory: this.pauseHistory.slice(-20) // 20 derniers
    };
  }
  
  // Calculer types de pauses
  calculatePauseTypes() {
    const types = {};
    
    for (const record of this.pauseHistory) {
      if (record.paused_at) {
        const type = this.classifyPauseType(record.reason);
        types[type] = (types[type] || 0) + 1;
      }
    }
    
    return types;
  }
  
  // Calculer durée moyenne de pause
  calculateAvgPauseDuration() {
    const completedPauses = [];
    
    for (let i = 0; i < this.pauseHistory.length; i++) {
      const pause = this.pauseHistory[i];
      
      if (pause.paused_at && pause.resumed_at) {
        completedPauses.push(pause.resumed_at - pause.paused_at);
      }
    }
    
    if (completedPauses.length === 0) return 0;
    
    const total = completedPauses.reduce((sum, duration) => sum + duration, 0);
    return Math.round(total / completedPauses.length / 1000); // en secondes
  }
  
  // Nettoyer historique
  cleanupHistory(maxAge = 7 * 24 * 60 * 60 * 1000) { // 7 jours
    const cutoff = Date.now() - maxAge;
    const before = this.pauseHistory.length;
    
    this.pauseHistory = this.pauseHistory.filter(record => 
      record.paused_at > cutoff || record.resumed_at > cutoff
    );
    
    const cleaned = before - this.pauseHistory.length;
    
    if (cleaned > 0) {
      console.log('[TENANT_PAUSE_HISTORY_CLEANED]', {
        cleaned,
        remaining: this.pauseHistory.length,
        cutoff: new Date(cutoff)
      });
    }
    
    return cleaned;
  }
  
  // Health check pause
  healthCheck() {
    const stats = this.getPauseStats();
    
    const health = {
      status: 'healthy',
      enabled: stats.enabled,
      currentPauses: stats.currentPauses.total,
      issues: [],
      recommendations: []
    };
    
    // Trop de tenants en pause
    if (stats.currentPauses.total > stats.stats.totalPauses * 0.5) {
      health.issues.push('High ratio of paused tenants');
      health.recommendations.push('Review pause reasons and tenant health');
    }
    
    // Pauses automatiques fréquentes
    const autoPauseRate = stats.stats.totalPauses > 0 ? 
      (stats.stats.autoPauses / stats.stats.totalPauses) * 100 : 0;
    
    if (autoPauseRate > 30) {
      health.issues.push('High automatic pause rate');
      health.recommendations.push('Check quotas and system health');
    }
    
    // Longues durées de pause
    if (stats.avgPauseDuration > 3600) { // > 1 heure
      health.issues.push('Long average pause duration');
      health.recommendations.push('Review tenant recovery processes');
    }
    
    if (health.issues.length > 0) {
      health.status = 'warning';
    }
    
    return {
      ...health,
      stats: {
        currentPauses: stats.currentPauses.total,
        totalPauses: stats.stats.totalPauses,
        totalResumes: stats.stats.totalResumes,
        autoPauseRate: Math.round(autoPauseRate * 100) / 100,
        avgDuration: stats.avgPauseDuration
      }
    };
  }
  
  // Réinitialiser stats
  resetStats() {
    this.stats = {
      totalPauses: 0,
      totalResumes: 0,
      manualPauses: 0,
      autoPauses: 0,
      quotaPauses: 0
    };
    
    console.log('[TENANT_PAUSE_STATS_RESET]');
  }
}

// Instance globale de pause
if (!global.tenantPause) {
  global.tenantPause = new TenantPause();
}

// Fonctions principales
function pauseTenant(tenant_id, reason, duration) {
  return global.tenantPause.pauseTenant(tenant_id, reason, duration);
}

function resumeTenant(tenant_id, reason) {
  return global.tenantPause.resumeTenant(tenant_id, reason);
}

function isTenantPaused(tenant_id) {
  return global.tenantPause.isTenantPaused(tenant_id);
}

async function executeIfTenantNotPaused(tenant_id, actionFunction, actionType) {
  return await global.tenantPause.executeIfNotPaused(tenant_id, actionFunction, actionType);
}

// Auto-pauses
function autoPauseForQuota(tenant_id, quotaInfo) {
  return global.tenantPause.autoPauseForQuota(tenant_id, quotaInfo);
}

function autoPauseForBilling(tenant_id, billingInfo) {
  return global.tenantPause.autoPauseForBilling(tenant_id, billingInfo);
}

// Stats et monitoring
function getPauseStats() {
  return global.tenantPause.getPauseStats();
}

function pauseHealthCheck() {
  return global.tenantPause.healthCheck();
}

// Administration
function cleanupPauseHistory(maxAge) {
  return global.tenantPause.cleanupHistory(maxAge);
}

function resetPauseStats() {
  return global.tenantPause.resetStats();
}

module.exports = {
  pauseTenant,
  resumeTenant,
  isTenantPaused,
  executeIfTenantNotPaused,
  autoPauseForQuota,
  autoPauseForBilling,
  getPauseStats,
  pauseHealthCheck,
  cleanupPauseHistory,
  resetPauseStats,
  TenantPause
};
