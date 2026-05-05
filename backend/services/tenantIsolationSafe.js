// ACTION 3 - Isolation forte par tenant (SAFE PATCH)

const { getTenant, isTenantActive } = require('./tenantManager');
const BusinessLogger = require('./businessLogger');

// Isolation forte par tenant sans modification structure existante
class TenantIsolationSafe {
  constructor() {
    this.enabled = process.env.SAAS_ENABLED === 'true';
    this.leadNamespaces = new Map(); // tenant_id -> Set<lead_keys>
    this.stats = {
      totalLeads: 0,
      leadsByTenant: new Map(),
      operationsByTenant: new Map()
    };
  }
  
  // Obtenir clé pour lead (phone:tenant_id)
  getLeadKey(phone, tenant_id) {
    return `${phone}:${tenant_id}`;
  }
  
  // Wrapper pour créer/get lead avec isolation
  createOrGetLeadWithTenant(phone, tenant_id) {
    if (!this.enabled) {
      // Fallback: comportement existant
      const { createOrGetLead } = require('./leadMemory');
      return createOrGetLead(phone, tenant_id);
    }
    
    // Vérifier tenant actif
    if (!isTenantActive(tenant_id)) {
      console.log('[TENANT_ISOLATION_INACTIVE]', { tenant_id, phone: phone.substring(0, -4) + '****' });
      return null;
    }
    
    const leadKey = this.getLeadKey(phone, tenant_id);
    
    // Ajouter au namespace tenant
    if (!this.leadNamespaces.has(tenant_id)) {
      this.leadNamespaces.set(tenant_id, new Set());
      this.stats.leadsByTenant.set(tenant_id, 0);
    }
    
    this.leadNamespaces.get(tenant_id).add(leadKey);
    
    // Compter leads par tenant
    const currentCount = this.stats.leadsByTenant.get(tenant_id) || 0;
    this.stats.leadsByTenant.set(tenant_id, currentCount + 1);
    this.stats.totalLeads++;
    
    // Utiliser leadMemory existant avec clé isolée
    const { createOrGetLead } = require('./leadMemory');
    const lead = createOrGetLead(phone, tenant_id);
    
    // Ajouter métadonnées tenant
    if (lead) {
      lead.tenant_namespace = leadKey;
      lead.isolated_tenant_id = tenant_id;
    }
    
    console.log('[TENANT_LEAD_ISOLATED]', {
      tenant_id,
      phone: phone.substring(0, -4) + '****',
      leadKey: leadKey.substring(0, -4) + '****',
      totalTenantLeads: this.stats.leadsByTenant.get(tenant_id)
    });
    
    return lead;
  }
  
  // Obtenir leads par tenant (sans mélanger)
  getLeadsByTenant(tenant_id) {
    if (!this.enabled) {
      // Fallback: tous les leads
      const { getMemoryStats } = require('./leadMemory');
      const stats = getMemoryStats();
      return Object.values(stats.leads || {});
    }
    
    const tenantLeads = [];
    const tenantNamespace = this.leadNamespaces.get(tenant_id);
    
    if (!tenantNamespace) {
      console.log('[TENANT_NO_LEADS]', { tenant_id });
      return tenantLeads;
    }
    
    // Parcourir tous les leads et filtrer par namespace
    const { getMemoryStats } = require('./leadMemory');
    const stats = getMemoryStats();
    
    for (const [key, lead] of Object.entries(stats.leads || {})) {
      if (lead.tenant_id === tenant_id) {
        tenantLeads.push(lead);
      }
    }
    
    console.log('[TENANT_LEADS_RETRIEVED]', {
      tenant_id,
      count: tenantLeads.length,
      namespaceSize: tenantNamespace.size
    });
    
    return tenantLeads;
  }
  
  // Wrapper pour update lead avec isolation
  updateLeadWithTenant(phone, tenant_id, updates) {
    if (!this.enabled) {
      // Fallback: comportement existant
      const { updateLead } = require('./leadMemory');
      return updateLead(phone, tenant_id, updates);
    }
    
    // Vérifier que lead appartient bien au tenant
    const leadKey = this.getLeadKey(phone, tenant_id);
    const tenantNamespace = this.leadNamespaces.get(tenant_id);
    
    if (!tenantNamespace || !tenantNamespace.has(leadKey)) {
      console.log('[TENANT_ISOLATION_VIOLATION]', {
        tenant_id,
        phone: phone.substring(0, -4) + '****',
        reason: 'lead_not_in_namespace'
      });
      
      BusinessLogger.logWebhookError('Tenant isolation violation', {
        context: 'tenant_isolation',
        tenant_id,
        phone: phone.substring(0, -4) + '****',
        reason: 'lead_not_in_namespace'
      });
      
      return false;
    }
    
    // Compter opération
    const currentOps = this.stats.operationsByTenant.get(tenant_id) || 0;
    this.stats.operationsByTenant.set(tenant_id, currentOps + 1);
    
    // Utiliser updateLead existant
    const { updateLead } = require('./leadMemory');
    const result = updateLead(phone, tenant_id, updates);
    
    console.log('[TENANT_LEAD_UPDATED]', {
      tenant_id,
      phone: phone.substring(0, -4) + '****',
      updates: Object.keys(updates)
    });
    
    return result;
  }
  
  // Vérifier si lead appartient au tenant
  isLeadInTenant(phone, tenant_id) {
    if (!this.enabled) {
      return true; // Fallback: pas d'isolation
    }
    
    const leadKey = this.getLeadKey(phone, tenant_id);
    const tenantNamespace = this.leadNamespaces.get(tenant_id);
    
    return tenantNamespace && tenantNamespace.has(leadKey);
  }
  
  // Supprimer lead du namespace tenant
  removeLeadFromTenant(phone, tenant_id) {
    if (!this.enabled) {
      return true; // Fallback: pas d'isolation
    }
    
    const leadKey = this.getLeadKey(phone, tenant_id);
    const tenantNamespace = this.leadNamespaces.get(tenant_id);
    
    if (tenantNamespace && tenantNamespace.has(leadKey)) {
      tenantNamespace.delete(leadKey);
      
      // Mettre à jour stats
      const currentCount = this.stats.leadsByTenant.get(tenant_id) || 0;
      this.stats.leadsByTenant.set(tenant_id, Math.max(0, currentCount - 1));
      this.stats.totalLeads = Math.max(0, this.stats.totalLeads - 1);
      
      console.log('[TENANT_LEAD_REMOVED]', {
        tenant_id,
        phone: phone.substring(0, -4) + '****'
      });
    }
    
    return true;
  }
  
  // Nettoyer namespace tenant
  clearTenantNamespace(tenant_id) {
    if (!this.enabled) {
      return 0; // Fallback: pas d'isolation
    }
    
    const tenantNamespace = this.leadNamespaces.get(tenant_id);
    
    if (!tenantNamespace) {
      return 0;
    }
    
    const clearedCount = tenantNamespace.size;
    
    this.leadNamespaces.delete(tenant_id);
    this.stats.leadsByTenant.delete(tenant_id);
    this.stats.operationsByTenant.delete(tenant_id);
    
    this.stats.totalLeads = Math.max(0, this.stats.totalLeads - clearedCount);
    
    console.log('[TENANT_NAMESPACE_CLEARED]', {
      tenant_id,
      clearedCount
    });
    
    return clearedCount;
  }
  
  // Obtenir stats isolation
  getIsolationStats() {
    const tenantStats = [];
    
    for (const [tenant_id, namespace] of this.leadNamespaces.entries()) {
      tenantStats.push({
        tenant_id,
        leadCount: namespace.size,
        operations: this.stats.operationsByTenant.get(tenant_id) || 0,
        active: isTenantActive(tenant_id)
      });
    }
    
    return {
      enabled: this.enabled,
      totalLeads: this.stats.totalLeads,
      totalTenants: this.leadNamespaces.size,
      tenantStats: tenantStats.sort((a, b) => b.leadCount - a.leadCount)
    };
  }
  
  // Health check isolation
  healthCheck() {
    const stats = this.getIsolationStats();
    
    const health = {
      status: 'healthy',
      enabled: stats.enabled,
      totalTenants: stats.totalTenants,
      totalLeads: stats.totalLeads,
      issues: [],
      recommendations: []
    };
    
    // Vérifier leads sans tenant
    if (stats.enabled && stats.totalLeads === 0) {
      health.issues.push('No isolated leads found');
      health.recommendations.push('Check tenant registration and lead creation');
    }
    
    // Vérifier tenants inactifs avec leads
    const inactiveTenants = stats.tenantStats.filter(t => !t.active && t.leadCount > 0);
    if (inactiveTenants.length > 0) {
      health.issues.push('Inactive tenants with leads');
      health.recommendations.push('Review paused tenants');
    }
    
    if (health.issues.length > 0) {
      health.status = 'warning';
    }
    
    return health;
  }
  
  // Réinitialiser isolation
  reset() {
    this.leadNamespaces.clear();
    this.stats = {
      totalLeads: 0,
      leadsByTenant: new Map(),
      operationsByTenant: new Map()
    };
    
    console.log('[TENANT_ISOLATION_RESET]');
  }
}

// Instance globale d'isolation
if (!global.tenantIsolationSafe) {
  global.tenantIsolationSafe = new TenantIsolationSafe();
}

// Fonctions principales (wrappers SAFE)
function createOrGetLeadWithTenant(phone, tenant_id) {
  return global.tenantIsolationSafe.createOrGetLeadWithTenant(phone, tenant_id);
}

function getLeadsByTenant(tenant_id) {
  return global.tenantIsolationSafe.getLeadsByTenant(tenant_id);
}

function updateLeadWithTenant(phone, tenant_id, updates) {
  return global.tenantIsolationSafe.updateLeadWithTenant(phone, tenant_id, updates);
}

function isLeadInTenant(phone, tenant_id) {
  return global.tenantIsolationSafe.isLeadInTenant(phone, tenant_id);
}

function removeLeadFromTenant(phone, tenant_id) {
  return global.tenantIsolationSafe.removeLeadFromTenant(phone, tenant_id);
}

// Stats et monitoring
function getIsolationStats() {
  return global.tenantIsolationSafe.getIsolationStats();
}

function isolationHealthCheck() {
  return global.tenantIsolationSafe.healthCheck();
}

// Administration
function clearTenantNamespace(tenant_id) {
  return global.tenantIsolationSafe.clearTenantNamespace(tenant_id);
}

function resetIsolation() {
  return global.tenantIsolationSafe.reset();
}

module.exports = {
  createOrGetLeadWithTenant,
  getLeadsByTenant,
  updateLeadWithTenant,
  isLeadInTenant,
  removeLeadFromTenant,
  getIsolationStats,
  isolationHealthCheck,
  clearTenantNamespace,
  resetIsolation,
  TenantIsolationSafe
};
