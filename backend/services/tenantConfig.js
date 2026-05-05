// ACTION 4 - Configuration par tenant (fallback ENV global)

const { getTenant } = require('./tenantManager');
const BusinessLogger = require('./businessLogger');

// Configuration par tenant avec fallback ENV global
class TenantConfig {
  constructor() {
    this.enabled = process.env.SAAS_ENABLED === 'true';
    this.globalDefaults = {
      outbound_enabled: process.env.AGENT_OUTBOUND_ENABLED === 'true',
      followup_enabled: process.env.FOLLOWUP_ENABLED === 'true',
      ai_enabled: process.env.AI_ENABLED === 'true',
      max_per_run: parseInt(process.env.MAX_PER_RUN) || 3,
      cooldown_hours: parseInt(process.env.COOLDOWN_HOURS) || 24,
      ai_advanced_enabled: process.env.AI_ADVANCED_ENABLED === 'true',
      multi_agent_enabled: process.env.MULTI_AGENT_ENABLED === 'true',
      queue_enabled: process.env.QUEUE_ENABLED === 'true',
      auto_regulation_enabled: process.env.AUTO_REGULATION_ENABLED === 'true'
    };
    
    this.configCache = new Map(); // tenant_id -> config cache
    this.cacheTimeout = 60000; // 1 minute cache
  }
  
  // Obtenir configuration pour tenant (avec fallback ENV)
  getConfig(tenant_id, key) {
    if (!this.enabled) {
      // Fallback: ENV global
      return this.globalDefaults[key];
    }
    
    // Vérifier cache
    const cacheKey = `${tenant_id}:${key}`;
    const cached = this.configCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
      return cached.value;
    }
    
    // Obtenir tenant
    const tenant = getTenant(tenant_id);
    
    if (!tenant || tenant.tenant_id === 'DEFAULT') {
      // Fallback: ENV global
      const value = this.globalDefaults[key];
      
      // Mettre en cache
      this.configCache.set(cacheKey, {
        value,
        timestamp: Date.now(),
        source: 'global_env'
      });
      
      return value;
    }
    
    // Prioriser config tenant, puis ENV global
    const tenantValue = tenant.config[key];
    const globalValue = this.globalDefaults[key];
    const finalValue = tenantValue !== undefined ? tenantValue : globalValue;
    
    // Mettre en cache
    this.configCache.set(cacheKey, {
      value: finalValue,
      timestamp: Date.now(),
      source: tenantValue !== undefined ? 'tenant_config' : 'global_env'
    });
    
    console.log('[TENANT_CONFIG_RESOLVED]', {
      tenant_id,
      key,
      value: finalValue,
      source: tenantValue !== undefined ? 'tenant_config' : 'global_env'
    });
    
    return finalValue;
  }
  
  // Obtenir toute la configuration tenant
  getFullConfig(tenant_id) {
    if (!this.enabled) {
      return this.globalDefaults;
    }
    
    const tenant = getTenant(tenant_id);
    
    if (!tenant || tenant.tenant_id === 'DEFAULT') {
      return this.globalDefaults;
    }
    
    // Fusionner config tenant avec defaults
    const fullConfig = { ...this.globalDefaults };
    
    // Override avec config tenant
    for (const [key, value] of Object.entries(tenant.config)) {
      if (value !== undefined) {
        fullConfig[key] = value;
      }
    }
    
    return fullConfig;
  }
  
  // Vérifier si fonctionnalité est activée pour tenant
  isFeatureEnabled(tenant_id, feature) {
    const value = this.getConfig(tenant_id, feature);
    return Boolean(value);
  }
  
  // Obtenir configuration numérique avec validation
  getNumericConfig(tenant_id, key, min = 0, max = Infinity) {
    const value = this.getConfig(tenant_id, key);
    const numValue = parseInt(value) || 0;
    
    const clampedValue = Math.max(min, Math.min(max, numValue));
    
    if (clampedValue !== numValue) {
      console.log('[TENANT_CONFIG_CLAMPED]', {
        tenant_id,
        key,
        original: numValue,
        clamped: clampedValue,
        min,
        max
      });
    }
    
    return clampedValue;
  }
  
  // Mettre à jour configuration tenant
  updateConfig(tenant_id, updates) {
    if (!this.enabled) {
      console.log('[TENANT_CONFIG_DISABLED] Cannot update - SAAS disabled');
      return { success: false, error: 'SAAS mode disabled' };
    }
    
    const { updateTenantConfig } = require('./tenantManager');
    const result = updateTenantConfig(tenant_id, updates);
    
    if (result.success) {
      // Invalider cache pour ce tenant
      this.invalidateCache(tenant_id);
      
      console.log('[TENANT_CONFIG_UPDATED]', {
        tenant_id,
        updates: Object.keys(updates)
      });
    }
    
    return result;
  }
  
  // Invalider cache pour tenant
  invalidateCache(tenant_id) {
    const keysToDelete = [];
    
    for (const [key, cached] of this.configCache.entries()) {
      if (key.startsWith(`${tenant_id}:`)) {
        keysToDelete.push(key);
      }
    }
    
    for (const key of keysToDelete) {
      this.configCache.delete(key);
    }
    
    console.log('[TENANT_CONFIG_CACHE_INVALIDATED]', {
      tenant_id,
      deletedKeys: keysToDelete.length
    });
  }
  
  // Obtenir configuration pour outbound
  getOutboundConfig(tenant_id) {
    return {
      enabled: this.isFeatureEnabled(tenant_id, 'outbound_enabled'),
      maxPerRun: this.getNumericConfig(tenant_id, 'max_per_run', 1, 10),
      cooldownHours: this.getNumericConfig(tenant_id, 'cooldown_hours', 1, 168), // 1h à 7j
      useQueue: this.isFeatureEnabled(tenant_id, 'queue_enabled'),
      useMultiAgent: this.isFeatureEnabled(tenant_id, 'multi_agent_enabled')
    };
  }
  
  // Obtenir configuration pour follow-up
  getFollowUpConfig(tenant_id) {
    return {
      enabled: this.isFeatureEnabled(tenant_id, 'followup_enabled'),
      cooldownHours: this.getNumericConfig(tenant_id, 'cooldown_hours', 1, 168),
      maxRelances: 2, // Fixe pour l'instant
      useIntelligent: true // Fixe pour l'instant
    };
  }
  
  // Obtenir configuration pour IA
  getAIConfig(tenant_id) {
    return {
      enabled: this.isFeatureEnabled(tenant_id, 'ai_enabled'),
      advancedEnabled: this.isFeatureEnabled(tenant_id, 'ai_advanced_enabled'),
      useAdvanced: this.isFeatureEnabled(tenant_id, 'ai_advanced_enabled')
    };
  }
  
  // Obtenir configuration pour régulation
  getRegulationConfig(tenant_id) {
    return {
      enabled: this.isFeatureEnabled(tenant_id, 'auto_regulation_enabled'),
      maxActionsPerMinute: 30, // Fixe pour l'instant
      maxErrorsPerMinute: 5,   // Fixe pour l'instant
      minConversionRate: 0.05  // Fixe pour l'instant
    };
  }
  
  // Obtenir configuration pour monitoring
  getMonitoringConfig(tenant_id) {
    return {
      enabled: process.env.AGENT_MONITORING_ENABLED === 'true',
      detailed: this.isFeatureEnabled(tenant_id, 'monitoring_detailed')
    };
  }
  
  // Obtenir configuration pour quotas
  getQuotaConfig(tenant_id) {
    const tenant = getTenant(tenant_id);
    
    return {
      maxDailyActions: tenant?.limits?.max_daily_actions || 1000,
      currentDailyActions: tenant?.limits?.daily_actions || 0,
      canAct: (tenant?.limits?.daily_actions || 0) < (tenant?.limits?.max_daily_actions || 1000)
    };
  }
  
  // Valider configuration tenant
  validateConfig(tenant_id, config) {
    const errors = [];
    const warnings = [];
    
    // Valider types
    if (config.max_per_run !== undefined) {
      const maxRun = parseInt(config.max_per_run);
      if (isNaN(maxRun) || maxRun < 1 || maxRun > 10) {
        errors.push('max_per_run must be between 1 and 10');
      }
    }
    
    if (config.cooldown_hours !== undefined) {
      const cooldown = parseInt(config.cooldown_hours);
      if (isNaN(cooldown) || cooldown < 1 || cooldown > 168) {
        errors.push('cooldown_hours must be between 1 and 168 (7 days)');
      }
    }
    
    if (config.max_daily_actions !== undefined) {
      const maxDaily = parseInt(config.max_daily_actions);
      if (isNaN(maxDaily) || maxDaily < 10 || maxDaily > 10000) {
        errors.push('max_daily_actions must be between 10 and 10000');
      }
    }
    
    // Avertissements
    if (config.outbound_enabled === true && config.max_per_run > 5) {
      warnings.push('High max_per_run may cause rate limiting');
    }
    
    if (config.ai_enabled === true && config.ai_advanced_enabled === false) {
      warnings.push('Basic AI enabled but advanced AI disabled');
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  // Obtenir stats de configuration
  getConfigStats() {
    const stats = {
      enabled: this.enabled,
      cacheSize: this.configCache.size,
      cacheTimeout: this.cacheTimeout,
      globalDefaults: this.globalDefaults,
      tenantConfigs: []
    };
    
    if (this.enabled) {
      const { listTenants } = require('./tenantManager');
      const tenants = listTenants();
      
      for (const tenant of tenants) {
        if (tenant.tenant_id === 'DEFAULT') continue;
        
        const config = this.getFullConfig(tenant.tenant_id);
        
        stats.tenantConfigs.push({
          tenant_id: tenant.tenant_id,
          status: tenant.status,
          config: {
            outbound_enabled: config.outbound_enabled,
            followup_enabled: config.followup_enabled,
            ai_enabled: config.ai_enabled,
            max_per_run: config.max_per_run,
            cooldown_hours: config.cooldown_hours
          }
        });
      }
    }
    
    return stats;
  }
  
  // Health check configuration
  healthCheck() {
    const stats = this.getConfigStats();
    
    const health = {
      status: 'healthy',
      enabled: stats.enabled,
      cacheSize: stats.cacheSize,
      issues: [],
      recommendations: []
    };
    
    // Vérifier cache size
    if (stats.cacheSize > 1000) {
      health.issues.push('Cache size too large');
      health.recommendations.push('Consider reducing cache timeout');
    }
    
    // Vérifier tenants sans config
    if (stats.enabled && stats.tenantConfigs.length === 0) {
      health.issues.push('No tenant configurations found');
      health.recommendations.push('Register tenants or check SAAS mode');
    }
    
    if (health.issues.length > 0) {
      health.status = 'warning';
    }
    
    return health;
  }
  
  // Nettoyer cache
  clearCache() {
    const cleared = this.configCache.size;
    this.configCache.clear();
    
    console.log('[TENANT_CONFIG_CACHE_CLEARED]', { cleared });
    
    return cleared;
  }
  
  // Réinitialiser
  reset() {
    this.configCache.clear();
    
    console.log('[TENANT_CONFIG_RESET]');
  }
}

// Instance globale de configuration
if (!global.tenantConfig) {
  global.tenantConfig = new TenantConfig();
}

// Fonctions principales
function getTenantConfig(tenant_id, key) {
  return global.tenantConfig.getConfig(tenant_id, key);
}

function getFullTenantConfig(tenant_id) {
  return global.tenantConfig.getFullConfig(tenant_id);
}

function isTenantFeatureEnabled(tenant_id, feature) {
  return global.tenantConfig.isFeatureEnabled(tenant_id, feature);
}

function updateTenantConfig(tenant_id, updates) {
  return global.tenantConfig.updateConfig(tenant_id, updates);
}

// Configurations spécialisées
function getOutboundConfig(tenant_id) {
  return global.tenantConfig.getOutboundConfig(tenant_id);
}

function getFollowUpConfig(tenant_id) {
  return global.tenantConfig.getFollowUpConfig(tenant_id);
}

function getAIConfig(tenant_id) {
  return global.tenantConfig.getAIConfig(tenant_id);
}

function getRegulationConfig(tenant_id) {
  return global.tenantConfig.getRegulationConfig(tenant_id);
}

function getMonitoringConfig(tenant_id) {
  return global.tenantConfig.getMonitoringConfig(tenant_id);
}

function getQuotaConfig(tenant_id) {
  return global.tenantConfig.getQuotaConfig(tenant_id);
}

// Stats et monitoring
function getConfigStats() {
  return global.tenantConfig.getConfigStats();
}

function configHealthCheck() {
  return global.tenantConfig.healthCheck();
}

// Administration
function clearConfigCache() {
  return global.tenantConfig.clearCache();
}

function resetTenantConfig() {
  return global.tenantConfig.reset();
}

module.exports = {
  getTenantConfig,
  getFullTenantConfig,
  isTenantFeatureEnabled,
  updateTenantConfig,
  getOutboundConfig,
  getFollowUpConfig,
  getAIConfig,
  getRegulationConfig,
  getMonitoringConfig,
  getQuotaConfig,
  getConfigStats,
  configHealthCheck,
  clearConfigCache,
  resetTenantConfig,
  TenantConfig
};
