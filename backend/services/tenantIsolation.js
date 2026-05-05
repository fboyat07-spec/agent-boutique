// ACTION 10 - Isolation multi-tenant renforcée

const crypto = require('crypto');
const BusinessLogger = require('./businessLogger');

// Isolation stricte multi-tenant avec namespace mémoire et quotas
class TenantIsolation {
  constructor() {
    this.namespaces = new Map(); // namespace par tenant_id
    this.quotas = new Map(); // quotas par tenant_id
    this.stats = new Map(); // stats par tenant_id
    this.globalStats = {
      totalTenants: 0,
      totalLeads: 0,
      totalActions: 0
    };
  }
  
  // Obtenir ou créer namespace pour tenant
  getTenantNamespace(tenant_id) {
    if (!this.namespaces.has(tenant_id)) {
      this.namespaces.set(tenant_id, {
        tenant_id,
        leads: new Map(),
        actions: [],
        createdAt: Date.now(),
        lastActivity: Date.now(),
        memoryUsage: 0
      });
      
      // Initialiser stats
      this.stats.set(tenant_id, {
        leadsCreated: 0,
        actionsProcessed: 0,
        errorsCount: 0,
        memoryUsage: 0
      });
      
      this.globalStats.totalTenants++;
      
      console.log('[TENANT_NAMESPACE_CREATED]', { tenant_id });
    }
    
    return this.namespaces.get(tenant_id);
  }
  
  // Ajouter lead dans namespace tenant
  addLeadToTenant(tenant_id, lead) {
    const namespace = this.getTenantNamespace(tenant_id);
    
    // Vérifier quota
    const quota = this.getTenantQuota(tenant_id);
    if (namespace.leads.size >= quota.maxLeads) {
      console.log('[TENANT_QUOTA_EXCEEDED]', {
        tenant_id,
        current: namespace.leads.size,
        quota: quota.maxLeads
      });
      
      BusinessLogger.logWebhookError('Tenant quota exceeded', {
        context: 'tenant_isolation',
        tenant_id,
        quota: quota.maxLeads
      });
      
      return false;
    }
    
    // Ajouter lead
    const leadKey = this.generateLeadKey(lead.phone);
    namespace.leads.set(leadKey, lead);
    namespace.lastActivity = Date.now();
    
    // Mettre à jour stats
    const stats = this.stats.get(tenant_id);
    stats.leadsCreated++;
    this.globalStats.totalLeads++;
    
    // Estimer mémoire utilisée
    namespace.memoryUsage += JSON.stringify(lead).length;
    stats.memoryUsage = namespace.memoryUsage;
    
    console.log('[TENANT_LEAD_ADDED]', {
      tenant_id,
      phone: lead.phone.substring(0, -4) + '****',
      totalLeads: namespace.leads.size,
      quota: quota.maxLeads
    });
    
    return true;
  }
  
  // Obtenir lead depuis namespace tenant
  getLeadFromTenant(tenant_id, phone) {
    const namespace = this.namespaces.get(tenant_id);
    
    if (!namespace) {
      return null;
    }
    
    const leadKey = this.generateLeadKey(phone);
    return namespace.leads.get(leadKey) || null;
  }
  
  // Mettre à jour lead dans namespace tenant
  updateLeadInTenant(tenant_id, phone, updates) {
    const namespace = this.namespaces.get(tenant_id);
    
    if (!namespace) {
      return false;
    }
    
    const leadKey = this.generateLeadKey(phone);
    const lead = namespace.leads.get(leadKey);
    
    if (!lead) {
      return false;
    }
    
    // Mettre à jour
    Object.assign(lead, updates);
    namespace.lastActivity = Date.now();
    
    console.log('[TENANT_LEAD_UPDATED]', {
      tenant_id,
      phone: phone.substring(0, -4) + '****',
      updates: Object.keys(updates)
    });
    
    return true;
  }
  
  // Ajouter action dans namespace tenant
  addActionToTenant(tenant_id, action) {
    const namespace = this.getTenantNamespace(tenant_id);
    
    // Vérifier quota d'actions
    const quota = this.getTenantQuota(tenant_id);
    if (namespace.actions.length >= quota.maxActionsPerHour) {
      console.log('[TENANT_ACTION_QUOTA_EXCEEDED]', {
        tenant_id,
        current: namespace.actions.length,
        quota: quota.maxActionsPerHour
      });
      
      return false;
    }
    
    // Ajouter action
    const actionObj = {
      ...action,
      timestamp: Date.now(),
      id: this.generateActionId()
    };
    
    namespace.actions.push(actionObj);
    namespace.lastActivity = Date.now();
    
    // Nettoyer anciennes actions (garder seulement dernière heure)
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    namespace.actions = namespace.actions.filter(a => a.timestamp > oneHourAgo);
    
    // Mettre à jour stats
    const stats = this.stats.get(tenant_id);
    stats.actionsProcessed++;
    this.globalStats.totalActions++;
    
    console.log('[TENANT_ACTION_ADDED]', {
      tenant_id,
      actionType: action.type,
      totalActions: namespace.actions.length
    });
    
    return true;
  }
  
  // Enregistrer erreur pour tenant
  recordErrorForTenant(tenant_id, error) {
    const namespace = this.namespaces.get(tenant_id);
    
    if (!namespace) {
      return;
    }
    
    const stats = this.stats.get(tenant_id);
    stats.errorsCount++;
    
    console.log('[TENANT_ERROR_RECORDED]', {
      tenant_id,
      error: error.message,
      totalErrors: stats.errorsCount
    });
  }
  
  // Obtenir quota pour tenant
  getTenantQuota(tenant_id) {
    if (!this.quotas.has(tenant_id)) {
      // Quotas par défaut
      const defaultQuota = {
        maxLeads: 1000,
        maxActionsPerHour: 100,
        maxMemoryMB: 10
      };
      
      // Surcharge depuis ENV si disponible
      const envQuota = this.getQuotaFromEnv(tenant_id);
      
      this.quotas.set(tenant_id, { ...defaultQuota, ...envQuota });
    }
    
    return this.quotas.get(tenant_id);
  }
  
  // Obtenir quota depuis variables d'environnement
  getQuotaFromEnv(tenant_id) {
    const quotaEnv = process.env[`TENANT_QUOTA_${tenant_id.toUpperCase()}`];
    
    if (!quotaEnv) {
      return {};
    }
    
    try {
      return JSON.parse(quotaEnv);
    } catch (error) {
      console.log('[TENANT_QUOTA_ENV_PARSE_ERROR]', {
        tenant_id,
        error: error.message
      });
      
      return {};
    }
  }
  
  // Nettoyer anciens données tenant (plus de 30 jours)
  cleanupOldTenantData() {
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    let cleanedTenants = 0;
    let cleanedLeads = 0;
    
    for (const [tenant_id, namespace] of this.namespaces.entries()) {
      if (namespace.lastActivity < thirtyDaysAgo) {
        // Supprimer namespace inactif
        this.namespaces.delete(tenant_id);
        this.stats.delete(tenant_id);
        this.quotas.delete(tenant_id);
        
        cleanedTenants++;
        cleanedLeads += namespace.leads.size;
        
        console.log('[TENANT_NAMESPACE_CLEANED]', {
          tenant_id,
          lastActivity: new Date(namespace.lastActivity),
          leadsCount: namespace.leads.size
        });
      }
    }
    
    if (cleanedTenants > 0) {
      this.globalStats.totalTenants -= cleanedTenants;
      this.globalStats.totalLeads -= cleanedLeads;
      
      console.log('[TENANT_CLEANUP_COMPLETED]', {
        cleanedTenants,
        cleanedLeads,
        remainingTenants: this.namespaces.size
      });
    }
    
    return { cleanedTenants, cleanedLeads };
  }
  
  // Obtenir stats tenant
  getTenantStats(tenant_id) {
    const namespace = this.namespaces.get(tenant_id);
    const stats = this.stats.get(tenant_id);
    const quota = this.getTenantQuota(tenant_id);
    
    if (!namespace || !stats) {
      return null;
    }
    
    return {
      tenant_id,
      leads: {
        count: namespace.leads.size,
        quota: quota.maxLeads,
        usage: (namespace.leads.size / quota.maxLeads) * 100
      },
      actions: {
        count: namespace.actions.length,
        quota: quota.maxActionsPerHour,
        usage: (namespace.actions.length / quota.maxActionsPerHour) * 100
      },
      memory: {
        usageKB: Math.round(namespace.memoryUsage / 1024),
        quota: quota.maxMemoryMB * 1024,
        usage: (namespace.memoryUsage / (quota.maxMemoryMB * 1024 * 1024)) * 100
      },
      performance: {
        leadsCreated: stats.leadsCreated,
        actionsProcessed: stats.actionsProcessed,
        errorsCount: stats.errorsCount,
        errorRate: stats.actionsProcessed > 0 ? (stats.errorsCount / stats.actionsProcessed) * 100 : 0
      },
      activity: {
        createdAt: new Date(namespace.createdAt),
        lastActivity: new Date(namespace.lastActivity),
        inactiveHours: (Date.now() - namespace.lastActivity) / (1000 * 60 * 60)
      }
    };
  }
  
  // Obtenir stats globales
  getGlobalStats() {
    const tenantStats = [];
    
    for (const tenant_id of this.namespaces.keys()) {
      const stats = this.getTenantStats(tenant_id);
      if (stats) {
        tenantStats.push(stats);
      }
    }
    
    return {
      global: this.globalStats,
      tenants: tenantStats,
      totalTenants: this.namespaces.size,
      totalLeads: Array.from(this.namespaces.values()).reduce((sum, ns) => sum + ns.leads.size, 0),
      totalActions: Array.from(this.namespaces.values()).reduce((sum, ns) => sum + ns.actions.length, 0),
      totalMemoryMB: Math.round(Array.from(this.namespaces.values()).reduce((sum, ns) => sum + ns.memoryUsage, 0) / (1024 * 1024))
    };
  }
  
  // Vérifier santé isolation tenant
  healthCheck() {
    const stats = this.getGlobalStats();
    const issues = [];
    
    // Vérifier quotas
    for (const tenantStat of stats.tenants) {
      if (tenantStat.leads.usage > 90) {
        issues.push({
          tenant_id: tenantStat.tenant_id,
          type: 'leads_quota_near_limit',
          usage: tenantStat.leads.usage
        });
      }
      
      if (tenantStat.actions.usage > 90) {
        issues.push({
          tenant_id: tenantStat.tenant_id,
          type: 'actions_quota_near_limit',
          usage: tenantStat.actions.usage
        });
      }
      
      if (tenantStat.memory.usage > 90) {
        issues.push({
          tenant_id: tenantStat.tenant_id,
          type: 'memory_quota_near_limit',
          usage: tenantStat.memory.usage
        });
      }
      
      if (tenantStat.performance.errorRate > 20) {
        issues.push({
          tenant_id: tenantStat.tenant_id,
          type: 'high_error_rate',
          errorRate: tenantStat.performance.errorRate
        });
      }
      
      if (tenantStat.activity.inactiveHours > 168) { // 7 jours
        issues.push({
          tenant_id: tenantStat.tenant_id,
          type: 'long_inactive',
          inactiveHours: tenantStat.activity.inactiveHours
        });
      }
    }
    
    return {
      healthy: issues.length === 0,
      stats,
      issues,
      recommendations: this.getRecommendations(issues)
    };
  }
  
  // Recommandations
  getRecommendations(issues) {
    const recommendations = [];
    
    const quotaIssues = issues.filter(i => i.type.includes('quota'));
    if (quotaIssues.length > 0) {
      recommendations.push('Consider increasing quotas for high-usage tenants');
    }
    
    const errorIssues = issues.filter(i => i.type === 'high_error_rate');
    if (errorIssues.length > 0) {
      recommendations.push('Investigate high error rates in affected tenants');
    }
    
    const inactiveIssues = issues.filter(i => i.type === 'long_inactive');
    if (inactiveIssues.length > 0) {
      recommendations.push('Consider cleaning up inactive tenant data');
    }
    
    return recommendations;
  }
  
  // Générer clé lead
  generateLeadKey(phone) {
    return crypto.createHash('sha256').update(phone).digest('hex').slice(0, 16);
  }
  
  // Générer ID action
  generateActionId() {
    return `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // Forcer nettoyage manuel
  forceCleanup() {
    return this.cleanupOldTenantData();
  }
  
  // Réinitialiser tenant (admin)
  resetTenant(tenant_id) {
    const namespace = this.namespaces.get(tenant_id);
    
    if (namespace) {
      const leadCount = namespace.leads.size;
      const actionCount = namespace.actions.length;
      
      this.namespaces.delete(tenant_id);
      this.stats.delete(tenant_id);
      this.quotas.delete(tenant_id);
      
      this.globalStats.totalTenants--;
      this.globalStats.totalLeads -= leadCount;
      
      console.log('[TENANT_RESET]', {
        tenant_id,
        clearedLeads: leadCount,
        clearedActions: actionCount
      });
      
      return { clearedLeads: leadCount, clearedActions: actionCount };
    }
    
    return null;
  }
}

// Instance globale d'isolation
if (!global.tenantIsolation) {
  global.tenantIsolation = new TenantIsolation();
}

// Fonctions principales
function addLeadToTenant(tenant_id, lead) {
  return global.tenantIsolation.addLeadToTenant(tenant_id, lead);
}

function getLeadFromTenant(tenant_id, phone) {
  return global.tenantIsolation.getLeadFromTenant(tenant_id, phone);
}

function updateLeadInTenant(tenant_id, phone, updates) {
  return global.tenantIsolation.updateLeadInTenant(tenant_id, phone, updates);
}

function addActionToTenant(tenant_id, action) {
  return global.tenantIsolation.addActionToTenant(tenant_id, action);
}

function recordErrorForTenant(tenant_id, error) {
  return global.tenantIsolation.recordErrorForTenant(tenant_id, error);
}

// Stats et monitoring
function getTenantStats(tenant_id) {
  return global.tenantIsolation.getTenantStats(tenant_id);
}

function getGlobalTenantStats() {
  return global.tenantIsolation.getGlobalStats();
}

function tenantIsolationHealthCheck() {
  return global.tenantIsolation.healthCheck();
}

// Administration
function cleanupTenantData() {
  return global.tenantIsolation.cleanupOldTenantData();
}

function resetTenant(tenant_id) {
  return global.tenantIsolation.resetTenant(tenant_id);
}

module.exports = {
  addLeadToTenant,
  getLeadFromTenant,
  updateLeadInTenant,
  addActionToTenant,
  recordErrorForTenant,
  getTenantStats,
  getGlobalTenantStats,
  tenantIsolationHealthCheck,
  cleanupTenantData,
  resetTenant,
  TenantIsolation
};
