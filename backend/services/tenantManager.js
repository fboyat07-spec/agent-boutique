// ACTION 1 - Système tenant central (sans DB complexe)

const BusinessLogger = require('./businessLogger');

// Gestionnaire tenant central en mémoire (pas de DB complexe)
class TenantManager {
  constructor() {
    this.tenants = new Map(); // tenant_id -> tenant config
    this.defaultTenant = {
      tenant_id: 'DEFAULT',
      config: {
        outbound_enabled: false,
        followup_enabled: true,
        ai_enabled: false,
        max_per_run: 3,
        cooldown_hours: 24
      },
      limits: {
        daily_actions: 100,
        max_daily_actions: 1000
      },
      status: 'ACTIVE',
      created_at: new Date(),
      usage_count: 0
    };
    
    // Initialiser avec tenant DEFAULT
    this.tenants.set('DEFAULT', { ...this.defaultTenant });
    
    console.log('[TENANT_MANAGER_INITIALIZED]', {
      defaultTenant: 'DEFAULT',
      totalTenants: this.tenants.size
    });
  }
  
  // Enregistrer nouveau tenant
  registerTenant(config) {
    const { tenant_id, phone_number_id, stripe_account, agent_enabled } = config;
    
    if (!tenant_id) {
      console.log('[TENANT_REGISTER_ERROR] Missing tenant_id');
      return { success: false, error: 'tenant_id required' };
    }
    
    // Vérifier si tenant existe déjà
    if (this.tenants.has(tenant_id)) {
      console.log('[TENANT_REGISTER_EXISTS]', { tenant_id });
      return { success: false, error: 'tenant already exists' };
    }
    
    // Créer configuration tenant
    const tenantConfig = {
      tenant_id,
      config: {
        outbound_enabled: agent_enabled || false,
        followup_enabled: true,
        ai_enabled: false,
        max_per_run: config.max_per_run || 3,
        cooldown_hours: config.cooldown_hours || 24,
        phone_number_id: phone_number_id,
        stripe_account: stripe_account
      },
      limits: {
        daily_actions: 0,
        max_daily_actions: config.max_daily_actions || 1000
      },
      status: 'ACTIVE',
      created_at: new Date(),
      usage_count: 0,
      api_key: this.generateApiKey()
    };
    
    // Enregistrer tenant
    this.tenants.set(tenant_id, tenantConfig);
    
    console.log('[TENANT_REGISTERED]', {
      tenant_id,
      phone_number_id,
      status: tenantConfig.status,
      outbound_enabled: tenantConfig.config.outbound_enabled
    });
    
    BusinessLogger.logWebhookReceived('tenant_created', tenant_id);
    
    return { success: true, tenant: tenantConfig };
  }
  
  // Obtenir tenant
  getTenant(tenant_id) {
    if (!tenant_id) {
      console.log('[TENANT_GET_DEFAULT] No tenant_id provided');
      return this.tenants.get('DEFAULT');
    }
    
    const tenant = this.tenants.get(tenant_id);
    
    if (!tenant) {
      console.log('[TENANT_NOT_FOUND]', { tenant_id, fallback: 'DEFAULT' });
      return this.tenants.get('DEFAULT');
    }
    
    return tenant;
  }
  
  // Vérifier si tenant est actif
  isTenantActive(tenant_id) {
    const tenant = this.getTenant(tenant_id);
    
    if (!tenant) {
      return false;
    }
    
    return tenant.status === 'ACTIVE';
  }
  
  // Mettre à jour configuration tenant
  updateTenantConfig(tenant_id, updates) {
    const tenant = this.getTenant(tenant_id);
    
    if (!tenant || tenant.tenant_id === 'DEFAULT') {
      console.log('[TENANT_UPDATE_ERROR]', { tenant_id, reason: 'not_found_or_default' });
      return { success: false, error: 'tenant not found or cannot update default' };
    }
    
    // Mettre à jour config
    Object.assign(tenant.config, updates);
    
    console.log('[TENANT_CONFIG_UPDATED]', {
      tenant_id,
      updates: Object.keys(updates),
      newConfig: tenant.config
    });
    
    return { success: true, tenant };
  }
  
  // Mettre à jour statut tenant
  updateTenantStatus(tenant_id, status) {
    const tenant = this.getTenant(tenant_id);
    
    if (!tenant || tenant.tenant_id === 'DEFAULT') {
      console.log('[TENANT_STATUS_UPDATE_ERROR]', { tenant_id, reason: 'not_found_or_default' });
      return { success: false, error: 'tenant not found or cannot update default' };
    }
    
    const oldStatus = tenant.status;
    tenant.status = status;
    
    console.log('[TENANT_STATUS_UPDATED]', {
      tenant_id,
      oldStatus,
      newStatus: status
    });
    
    BusinessLogger.logWebhookReceived('tenant_status_updated', tenant_id);
    
    return { success: true, tenant };
  }
  
  // Incrémenter usage
  incrementUsage(tenant_id) {
    const tenant = this.getTenant(tenant_id);
    
    if (!tenant) {
      return false;
    }
    
    tenant.usage_count++;
    tenant.limits.daily_actions++;
    
    return true;
  }
  
  // Vérifier quota journalier
  checkDailyQuota(tenant_id) {
    const tenant = this.getTenant(tenant_id);
    
    if (!tenant) {
      return { canAct: false, reason: 'tenant_not_found' };
    }
    
    const { daily_actions, max_daily_actions } = tenant.limits;
    
    if (daily_actions >= max_daily_actions) {
      console.log('[TENANT_QUOTA_EXCEEDED]', {
        tenant_id,
        current: daily_actions,
        limit: max_daily_actions
      });
      
      BusinessLogger.logWebhookError('Daily quota exceeded', {
        context: 'tenant_quota',
        tenant_id,
        daily_actions,
        max_daily_actions
      });
      
      return { 
        canAct: false, 
        reason: 'daily_quota_exceeded', 
        current: daily_actions, 
        limit: max_daily_actions 
      };
    }
    
    return { 
      canAct: true, 
      remaining: max_daily_actions - daily_actions 
    };
  }
  
  // Réinitialiser quotas journaliers
  resetDailyQuotas() {
    let resetCount = 0;
    
    for (const [tenant_id, tenant] of this.tenants.entries()) {
      const oldCount = tenant.limits.daily_actions;
      tenant.limits.daily_actions = 0;
      
      if (oldCount > 0) {
        resetCount++;
        console.log('[TENANT_QUOTA_RESET]', {
          tenant_id,
          oldCount,
          resetAt: new Date()
        });
      }
    }
    
    console.log('[TENANT_DAILY_QUOTAS_RESET]', {
      totalTenants: this.tenants.size,
      resetCount
    });
    
    return resetCount;
  }
  
  // Obtenir configuration pour tenant (avec fallback ENV)
  getTenantConfig(tenant_id, key) {
    const tenant = this.getTenant(tenant_id);
    
    if (!tenant) {
      // Fallback vers ENV global
      return process.env[key];
    }
    
    // Prioriser config tenant, puis ENV
    return tenant.config[key] !== undefined ? tenant.config[key] : process.env[key];
  }
  
  // Lister tous les tenants
  listTenants() {
    const tenants = [];
    
    for (const [tenant_id, tenant] of this.tenants.entries()) {
      tenants.push({
        tenant_id,
        status: tenant.status,
        outbound_enabled: tenant.config.outbound_enabled,
        followup_enabled: tenant.config.followup_enabled,
        ai_enabled: tenant.config.ai_enabled,
        usage_count: tenant.usage_count,
        daily_actions: tenant.limits.daily_actions,
        max_daily_actions: tenant.limits.max_daily_actions,
        created_at: tenant.created_at
      });
    }
    
    return tenants;
  }
  
  // Supprimer tenant
  deleteTenant(tenant_id) {
    if (!tenant_id || tenant_id === 'DEFAULT') {
      console.log('[TENANT_DELETE_ERROR]', { tenant_id, reason: 'invalid_or_default' });
      return { success: false, error: 'cannot delete default or invalid tenant' };
    }
    
    const tenant = this.tenants.get(tenant_id);
    
    if (!tenant) {
      console.log('[TENANT_DELETE_ERROR]', { tenant_id, reason: 'not_found' });
      return { success: false, error: 'tenant not found' };
    }
    
    this.tenants.delete(tenant_id);
    
    console.log('[TENANT_DELETED]', {
      tenant_id,
      usage_count: tenant.usage_count,
      deleted_at: new Date()
    });
    
    BusinessLogger.logWebhookReceived('tenant_deleted', tenant_id);
    
    return { success: true };
  }
  
  // Valider API key
  validateApiKey(apiKey) {
    if (!apiKey) {
      return { valid: false, reason: 'no_api_key' };
    }
    
    for (const [tenant_id, tenant] of this.tenants.entries()) {
      if (tenant.api_key === apiKey) {
        return { valid: true, tenant_id };
      }
    }
    
    return { valid: false, reason: 'invalid_api_key' };
  }
  
  // Obtenir tenant par API key
  getTenantByApiKey(apiKey) {
    const validation = this.validateApiKey(apiKey);
    
    if (!validation.valid) {
      return null;
    }
    
    return this.getTenant(validation.tenant_id);
  }
  
  // Générer API key
  generateApiKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let apiKey = 'ak_';
    
    for (let i = 0; i < 32; i++) {
      apiKey += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return apiKey;
  }
  
  // Stats globales
  getGlobalStats() {
    const stats = {
      totalTenants: this.tenants.size - 1, // Exclure DEFAULT
      activeTenants: 0,
      pausedTenants: 0,
      totalUsage: 0,
      totalDailyActions: 0,
      tenantsByStatus: {}
    };
    
    for (const [tenant_id, tenant] of this.tenants.entries()) {
      if (tenant_id === 'DEFAULT') continue; // Skip DEFAULT
      
      stats.totalUsage += tenant.usage_count;
      stats.totalDailyActions += tenant.limits.daily_actions;
      
      if (tenant.status === 'ACTIVE') {
        stats.activeTenants++;
      } else if (tenant.status === 'PAUSED') {
        stats.pausedTenants++;
      }
      
      stats.tenantsByStatus[tenant.status] = (stats.tenantsByStatus[tenant.status] || 0) + 1;
    }
    
    return stats;
  }
  
  // Health check
  healthCheck() {
    const stats = this.getGlobalStats();
    
    return {
      status: 'healthy',
      totalTenants: this.tenants.size,
      activeTenants: stats.activeTenants,
      pausedTenants: stats.pausedTenants,
      defaultTenant: this.tenants.has('DEFAULT'),
      uptime: process.uptime()
    };
  }
}

// Instance globale du tenant manager
if (!global.tenantManager) {
  global.tenantManager = new TenantManager();
}

// Fonctions principales
function registerTenant(config) {
  return global.tenantManager.registerTenant(config);
}

function getTenant(tenant_id) {
  return global.tenantManager.getTenant(tenant_id);
}

function isTenantActive(tenant_id) {
  return global.tenantManager.isTenantActive(tenant_id);
}

function updateTenantConfig(tenant_id, updates) {
  return global.tenantManager.updateTenantConfig(tenant_id, updates);
}

function updateTenantStatus(tenant_id, status) {
  return global.tenantManager.updateTenantStatus(tenant_id, status);
}

function incrementUsage(tenant_id) {
  return global.tenantManager.incrementUsage(tenant_id);
}

function checkDailyQuota(tenant_id) {
  return global.tenantManager.checkDailyQuota(tenant_id);
}

function getTenantConfig(tenant_id, key) {
  return global.tenantManager.getTenantConfig(tenant_id, key);
}

// Stats et monitoring
function listTenants() {
  return global.tenantManager.listTenants();
}

function getTenantManagerStats() {
  return global.tenantManager.getGlobalStats();
}

function tenantManagerHealthCheck() {
  return global.tenantManager.healthCheck();
}

// Sécurité
function validateApiKey(apiKey) {
  return global.tenantManager.validateApiKey(apiKey);
}

function getTenantByApiKey(apiKey) {
  return global.tenantManager.getTenantByApiKey(apiKey);
}

// Administration
function deleteTenant(tenant_id) {
  return global.tenantManager.deleteTenant(tenant_id);
}

function resetDailyQuotas() {
  return global.tenantManager.resetDailyQuotas();
}

module.exports = {
  registerTenant,
  getTenant,
  isTenantActive,
  updateTenantConfig,
  updateTenantStatus,
  incrementUsage,
  checkDailyQuota,
  getTenantConfig,
  listTenants,
  getTenantManagerStats,
  tenantManagerHealthCheck,
  validateApiKey,
  getTenantByApiKey,
  deleteTenant,
  resetDailyQuotas,
  TenantManager
};
