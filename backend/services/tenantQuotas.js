// ACTION 7 - Quotas par tenant

const { getTenant, updateTenantConfig } = require('./tenantManager');
const BusinessLogger = require('./businessLogger');

// Gestion quotas par tenant avec tracking journalier
class TenantQuotas {
  constructor() {
    this.enabled = process.env.TENANT_QUOTA_ENABLED === 'true';
    this.quotas = new Map(); // tenant_id -> quota info
    this.dailyResetTime = this.calculateNextReset();
    this.stats = {
      totalChecks: 0,
      quotaExceeded: 0,
      quotaWarnings: 0,
      dailyResets: 0
    };
    
    // Reset quotidien automatique
    this.resetInterval = setInterval(() => {
      this.checkAndResetDaily();
    }, 60000); // Check toutes les minutes
    
    console.log('[TENANT_QUOTAS_INITIALIZED]', {
      enabled: this.enabled,
      nextReset: new Date(this.dailyResetTime)
    });
  }
  
  // Calculer prochain reset (minuit)
  calculateNextReset() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0); // Minuit
    
    return tomorrow.getTime();
  }
  
  // Vérifier et reset quotidien
  checkAndResetDaily() {
    const now = Date.now();
    
    if (now >= this.dailyResetTime) {
      this.performDailyReset();
      this.dailyResetTime = this.calculateNextReset();
    }
  }
  
  // Effectuer reset quotidien
  performDailyReset() {
    const { resetDailyQuotas } = require('./tenantManager');
    const resetCount = resetDailyQuotas();
    
    this.stats.dailyResets++;
    
    console.log('[TENANT_QUOTAS_DAILY_RESET]', {
      resetCount,
      resetTime: new Date(),
      nextReset: new Date(this.dailyResetTime)
    });
    
    BusinessLogger.logWebhookReceived('daily_quotas_reset', 'system');
  }
  
  // Vérifier quota pour action
  checkQuota(tenant_id, actionType = 'general', actionCost = 1) {
    if (!this.enabled) {
      return { canAct: true, reason: 'quotas_disabled' };
    }
    
    this.stats.totalChecks++;
    
    const tenant = getTenant(tenant_id);
    
    if (!tenant || tenant.tenant_id === 'DEFAULT') {
      // Tenant DEFAULT: pas de quota
      return { canAct: true, reason: 'default_tenant' };
    }
    
    // Vérifier statut tenant
    if (tenant.status !== 'ACTIVE') {
      console.log('[TENANT_QUOTA_INACTIVE]', {
        tenant_id,
        status: tenant.status,
        actionType
      });
      
      return { canAct: false, reason: 'tenant_inactive', status: tenant.status };
    }
    
    // Obtenir quotas
    const maxDaily = tenant.limits.max_daily_actions;
    const currentDaily = tenant.limits.daily_actions;
    
    // Vérifier quota journalier
    if (currentDaily + actionCost > maxDaily) {
      this.stats.quotaExceeded++;
      
      console.log('[TENANT_QUOTA_EXCEEDED]', {
        tenant_id,
        actionType,
        actionCost,
        current: currentDaily,
        max: maxDaily,
        remaining: Math.max(0, maxDaily - currentDaily)
      });
      
      BusinessLogger.logWebhookError('Daily quota exceeded', {
        context: 'tenant_quotas',
        tenant_id,
        actionType,
        currentDaily,
        maxDaily
      });
      
      return { 
        canAct: false, 
        reason: 'daily_quota_exceeded',
        current: currentDaily,
        max: maxDaily,
        remaining: Math.max(0, maxDaily - currentDaily)
      };
    }
    
    // Avertissement si proche de la limite
    const usageRate = currentDaily / maxDaily;
    if (usageRate > 0.8) {
      this.stats.quotaWarnings++;
      
      console.log('[TENANT_QUOTA_WARNING]', {
        tenant_id,
        actionType,
        usageRate: (usageRate * 100).toFixed(1) + '%',
        current: currentDaily,
        max: maxDaily,
        remaining: maxDaily - currentDaily
      });
    }
    
    return { 
      canAct: true, 
      remaining: maxDaily - currentDaily - actionCost,
      usageRate: (usageRate * 100).toFixed(1) + '%'
    };
  }
  
  // Consommer quota pour action
  consumeQuota(tenant_id, actionType = 'general', actionCost = 1) {
    if (!this.enabled) {
      return { consumed: true, reason: 'quotas_disabled' };
    }
    
    const quotaCheck = this.checkQuota(tenant_id, actionType, actionCost);
    
    if (!quotaCheck.canAct) {
      return quotaCheck;
    }
    
    const { incrementUsage } = require('./tenantManager');
    const success = incrementUsage(tenant_id);
    
    if (success) {
      console.log('[TENANT_QUOTA_CONSUMED]', {
        tenant_id,
        actionType,
        actionCost,
        remaining: quotaCheck.remaining
      });
      
      return { 
        consumed: true, 
        remaining: quotaCheck.remaining,
        usageRate: quotaCheck.usageRate
      };
    }
    
    return { consumed: false, reason: 'increment_failed' };
  }
  
  // Wrapper pour exécuter action avec quota
  async executeWithQuota(tenant_id, actionType, actionFunction, actionCost = 1) {
    const quotaCheck = this.checkQuota(tenant_id, actionType, actionCost);
    
    if (!quotaCheck.canAct) {
      console.log('[TENANT_QUOTA_ACTION_SKIPPED]', {
        tenant_id,
        actionType,
        reason: quotaCheck.reason
      });
      
      return { 
        success: false, 
        reason: quotaCheck.reason,
        skipped: true 
      };
    }
    
    const startTime = Date.now();
    
    try {
      console.log('[TENANT_QUOTA_ACTION_START]', {
        tenant_id,
        actionType,
        actionCost,
        remainingBefore: quotaCheck.remaining
      });
      
      // Exécuter action
      const result = await actionFunction();
      
      const duration = Date.now() - startTime;
      
      // Consommer quota seulement si succès
      const quotaResult = this.consumeQuota(tenant_id, actionType, actionCost);
      
      console.log('[TENANT_QUOTA_ACTION_SUCCESS]', {
        tenant_id,
        actionType,
        duration,
        quotaConsumed: quotaResult.consumed,
        remainingAfter: quotaResult.remaining
      });
      
      return { 
        success: true, 
        result, 
        duration,
        quotaConsumed: quotaResult.consumed,
        remaining: quotaResult.remaining
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      console.log('[TENANT_QUOTA_ACTION_ERROR]', {
        tenant_id,
        actionType,
        error: error.message,
        duration,
        quotaNotConsumed: true
      });
      
      BusinessLogger.logWebhookError(error.message, {
        context: 'tenant_quotas_execution',
        tenant_id,
        actionType
      });
      
      return { 
        success: false, 
        error: error.message, 
        duration,
        quotaConsumed: false
      };
    }
  }
  
  // Obtenir stats quotas pour tenant
  getTenantQuotaStats(tenant_id) {
    const tenant = getTenant(tenant_id);
    
    if (!tenant || tenant.tenant_id === 'DEFAULT') {
      return {
        tenant_id,
        hasQuotas: false,
        reason: 'default_or_not_found'
      };
    }
    
    const maxDaily = tenant.limits.max_daily_actions;
    const currentDaily = tenant.limits.daily_actions;
    const usageRate = maxDaily > 0 ? (currentDaily / maxDaily) * 100 : 0;
    
    return {
      tenant_id,
      status: tenant.status,
      hasQuotas: true,
      daily: {
        current: currentDaily,
        max: maxDaily,
        remaining: Math.max(0, maxDaily - currentDaily),
        usageRate: Math.round(usageRate * 100) / 100,
        usageStatus: this.getUsageStatus(usageRate)
      },
      usage_count: tenant.usage_count,
      created_at: tenant.created_at
    };
  }
  
  // Obtenir statut d'utilisation
  getUsageStatus(usageRate) {
    if (usageRate >= 100) return 'exceeded';
    if (usageRate >= 90) return 'critical';
    if (usageRate >= 75) return 'high';
    if (usageRate >= 50) return 'medium';
    if (usageRate >= 25) return 'low';
    return 'minimal';
  }
  
  // Obtenir stats globales quotas
  getGlobalQuotaStats() {
    const { listTenants } = require('./tenantManager');
    const tenants = listTenants();
    
    const stats = {
      enabled: this.enabled,
      totalTenants: 0,
      activeTenants: 0,
      totalDailyUsage: 0,
      totalDailyLimit: 0,
      usageDistribution: {
        minimal: 0,
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
        exceeded: 0
      },
      topConsumers: [],
      nextReset: new Date(this.dailyResetTime),
      systemStats: this.stats
    };
    
    for (const tenant of tenants) {
      if (tenant.tenant_id === 'DEFAULT') continue;
      
      stats.totalTenants++;
      
      if (tenant.status === 'ACTIVE') {
        stats.activeTenants++;
      }
      
      stats.totalDailyUsage += tenant.daily_actions;
      stats.totalDailyLimit += tenant.max_daily_actions;
      
      const usageRate = tenant.max_daily_actions > 0 ? 
        (tenant.daily_actions / tenant.max_daily_actions) * 100 : 0;
      
      const usageStatus = this.getUsageStatus(usageRate);
      stats.usageDistribution[usageStatus]++;
      
      // Top consumers
      stats.topConsumers.push({
        tenant_id: tenant.tenant_id,
        daily_actions: tenant.daily_actions,
        max_daily_actions: tenant.max_daily_actions,
        usageRate: Math.round(usageRate * 100) / 100
      });
    }
    
    // Trier top consumers
    stats.topConsumers.sort((a, b) => b.daily_actions - a.daily_actions);
    stats.topConsumers = stats.topConsumers.slice(0, 10);
    
    // Calculer taux global
    stats.globalUsageRate = stats.totalDailyLimit > 0 ? 
      (stats.totalDailyUsage / stats.totalDailyLimit) * 100 : 0;
    
    return stats;
  }
  
  // Ajuster quota pour tenant
  adjustQuota(tenant_id, newMaxDaily) {
    if (!this.enabled) {
      return { success: false, error: 'Quotas disabled' };
    }
    
    const tenant = getTenant(tenant_id);
    
    if (!tenant || tenant.tenant_id === 'DEFAULT') {
      return { success: false, error: 'Tenant not found or cannot modify default' };
    }
    
    const oldMax = tenant.limits.max_daily_actions;
    
    // Valider nouvelle valeur
    if (newMaxDaily < 10 || newMaxDaily > 100000) {
      return { success: false, error: 'Invalid quota value (must be 10-100000)' };
    }
    
    // Mettre à jour
    const result = updateTenantConfig(tenant_id, {
      max_daily_actions: newMaxDaily
    });
    
    if (result.success) {
      console.log('[TENANT_QUOTA_ADJUSTED]', {
        tenant_id,
        oldMax: oldMax,
        newMax: newMaxDaily,
        currentUsage: tenant.limits.daily_actions
      });
      
      BusinessLogger.logWebhookReceived('quota_adjusted', tenant_id);
    }
    
    return result;
  }
  
  // Health check quotas
  healthCheck() {
    const globalStats = this.getGlobalQuotaStats();
    
    const health = {
      status: 'healthy',
      enabled: this.enabled,
      totalTenants: globalStats.totalTenants,
      activeTenants: globalStats.activeTenants,
      issues: [],
      recommendations: []
    };
    
    // Taux d'utilisation global élevé
    if (globalStats.globalUsageRate > 80) {
      health.issues.push('High global usage rate');
      health.recommendations.push('Monitor tenant quotas and consider limits adjustment');
    }
    
    // Tenants en dépassement
    if (globalStats.usageDistribution.exceeded > 0) {
      health.issues.push('Tenants exceeded quotas');
      health.recommendations.push('Review exceeded tenants and adjust quotas');
    }
    
    // Taux d'erreur élevé
    const errorRate = this.stats.totalChecks > 0 ? 
      (this.stats.quotaExceeded / this.stats.totalChecks) * 100 : 0;
    
    if (errorRate > 20) {
      health.issues.push('High quota rejection rate');
      health.recommendations.push('Review tenant quotas and usage patterns');
    }
    
    if (health.issues.length > 0) {
      health.status = 'warning';
    }
    
    return {
      ...health,
      stats: {
        globalUsageRate: Math.round(globalStats.globalUsageRate * 100) / 100,
        quotaExceeded: globalStats.usageDistribution.exceeded,
        totalChecks: this.stats.totalChecks,
        errorRate: Math.round(errorRate * 100) / 100
      }
    };
  }
  
  // Réinitialiser stats
  resetStats() {
    this.stats = {
      totalChecks: 0,
      quotaExceeded: 0,
      quotaWarnings: 0,
      dailyResets: 0
    };
    
    console.log('[TENANT_QUOTAS_STATS_RESET]');
  }
  
  // Détruire
  destroy() {
    if (this.resetInterval) {
      clearInterval(this.resetInterval);
    }
    
    console.log('[TENANT_QUOTAS_DESTROYED]');
  }
}

// Instance globale des quotas
if (!global.tenantQuotas) {
  global.tenantQuotas = new TenantQuotas();
}

// Fonctions principales
function checkTenantQuota(tenant_id, actionType, actionCost) {
  return global.tenantQuotas.checkQuota(tenant_id, actionType, actionCost);
}

function consumeTenantQuota(tenant_id, actionType, actionCost) {
  return global.tenantQuotas.consumeQuota(tenant_id, actionType, actionCost);
}

async function executeWithTenantQuota(tenant_id, actionType, actionFunction, actionCost) {
  return await global.tenantQuotas.executeWithQuota(tenant_id, actionType, actionFunction, actionCost);
}

// Stats et monitoring
function getTenantQuotaStats(tenant_id) {
  return global.tenantQuotas.getTenantQuotaStats(tenant_id);
}

function getGlobalQuotaStats() {
  return global.tenantQuotas.getGlobalQuotaStats();
}

function quotaHealthCheck() {
  return global.tenantQuotas.healthCheck();
}

// Administration
function adjustTenantQuota(tenant_id, newMaxDaily) {
  return global.tenantQuotas.adjustQuota(tenant_id, newMaxDaily);
}

function resetQuotaStats() {
  return global.tenantQuotas.resetStats();
}

module.exports = {
  checkTenantQuota,
  consumeTenantQuota,
  executeWithTenantQuota,
  getTenantQuotaStats,
  getGlobalQuotaStats,
  quotaHealthCheck,
  adjustTenantQuota,
  resetQuotaStats,
  TenantQuotas
};
