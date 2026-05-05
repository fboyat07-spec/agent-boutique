// ACTION 8 - Billing basique (safe)

const { getTenant, updateTenantConfig } = require('./tenantManager');
const BusinessLogger = require('./businessLogger');

// Billing basique pour tracking usage tenant
class TenantBilling {
  constructor() {
    this.enabled = process.env.BILLING_ENABLED === 'true';
    this.pricing = {
      per_action: 0.01,    // €0.01 par action
      per_lead: 0.05,      // €0.05 par lead créé
      per_conversion: 1.00  // €1.00 par conversion
    };
    this.stats = {
      totalUsage: 0,
      totalRevenue: 0,
      billingEvents: 0,
      errors: 0
    };
    
    console.log('[TENANT_BILLING_INITIALIZED]', {
      enabled: this.enabled,
      pricing: this.pricing
    });
  }
  
  // Incrémenter usage pour action
  incrementUsage(tenant_id, actionType = 'general', metadata = {}) {
    if (!this.enabled) {
      return { billed: false, reason: 'billing_disabled' };
    }
    
    const tenant = getTenant(tenant_id);
    
    if (!tenant || tenant.tenant_id === 'DEFAULT') {
      // Tenant DEFAULT: pas de billing
      return { billed: false, reason: 'default_tenant' };
    }
    
    // Déterminer coût
    let cost = this.pricing.per_action;
    let billingType = 'action';
    
    switch (actionType) {
      case 'lead_created':
        cost = this.pricing.per_lead;
        billingType = 'lead';
        break;
      case 'conversion':
        cost = this.pricing.per_conversion;
        billingType = 'conversion';
        break;
      default:
        cost = this.pricing.per_action;
        billingType = 'action';
    }
    
    // Incrémenter usage_count existant
    const oldUsage = tenant.usage_count || 0;
    const newUsage = oldUsage + 1;
    
    // Mettre à jour usage_count
    const { updateTenantConfig } = require('./tenantManager');
    const updateResult = updateTenantConfig(tenant_id, {
      usage_count: newUsage
    });
    
    if (updateResult.success) {
      this.stats.totalUsage++;
      this.stats.totalRevenue += cost;
      this.stats.billingEvents++;
      
      console.log('[TENANT_BILLING_USAGE_RECORDED]', {
        tenant_id,
        actionType,
        billingType,
        cost,
        oldUsage,
        newUsage,
        totalRevenue: this.stats.totalRevenue
      });
      
      return { 
        billed: true, 
        cost,
        billingType,
        usageCount: newUsage,
        totalTenantRevenue: this.calculateTenantRevenue(tenant_id)
      };
    }
    
    this.stats.errors++;
    
    console.log('[TENANT_BILLING_USAGE_ERROR]', {
      tenant_id,
      actionType,
      error: 'Failed to update usage count'
    });
    
    return { billed: false, reason: 'update_failed' };
  }
  
  // Calculer revenue pour tenant
  calculateTenantRevenue(tenant_id) {
    const tenant = getTenant(tenant_id);
    
    if (!tenant || tenant.tenant_id === 'DEFAULT') {
      return 0;
    }
    
    // Simple: usage_count * prix moyen
    const usageCount = tenant.usage_count || 0;
    const avgCostPerAction = this.pricing.per_action;
    
    return usageCount * avgCostPerAction;
  }
  
  // Obtenir stats billing pour tenant
  getTenantBillingStats(tenant_id) {
    const tenant = getTenant(tenant_id);
    
    if (!tenant || tenant.tenant_id === 'DEFAULT') {
      return {
        tenant_id,
        hasBilling: false,
        reason: 'default_or_not_found'
      };
    }
    
    const usageCount = tenant.usage_count || 0;
    const revenue = this.calculateTenantRevenue(tenant_id);
    
    // Estimer répartition par type (simplifié)
    const estimatedBreakdown = {
      actions: Math.floor(usageCount * 0.8),
      leads: Math.floor(usageCount * 0.15),
      conversions: Math.floor(usageCount * 0.05)
    };
    
    const estimatedCosts = {
      actions: estimatedBreakdown.actions * this.pricing.per_action,
      leads: estimatedBreakdown.leads * this.pricing.per_lead,
      conversions: estimatedBreakdown.conversions * this.pricing.per_conversion
    };
    
    return {
      tenant_id,
      hasBilling: true,
      usage: {
        totalActions: usageCount,
        estimatedBreakdown,
        revenue: Math.round(revenue * 100) / 100,
        estimatedCosts: {
          actions: Math.round(estimatedCosts.actions * 100) / 100,
          leads: Math.round(estimatedCosts.leads * 100) / 100,
          conversions: Math.round(estimatedCosts.conversions * 100) / 100,
          total: Math.round(Object.values(estimatedCosts).reduce((sum, cost) => sum + cost, 0) * 100) / 100
        }
      },
      created_at: tenant.created_at,
      last_updated: new Date()
    };
  }
  
  // Obtenir stats billing globales
  getGlobalBillingStats() {
    const { listTenants } = require('./tenantManager');
    const tenants = listTenants();
    
    const stats = {
      enabled: this.enabled,
      totalTenants: 0,
      totalUsage: 0,
      totalRevenue: 0,
      revenueByTenant: [],
      usageDistribution: {
        low: 0,      // < 100 actions
        medium: 0,   // 100-1000 actions
        high: 0,      // > 1000 actions
        enterprise: 0 // > 10000 actions
      },
      systemStats: this.stats,
      pricing: this.pricing
    };
    
    for (const tenant of tenants) {
      if (tenant.tenant_id === 'DEFAULT') continue;
      
      stats.totalTenants++;
      stats.totalUsage += tenant.usage_count || 0;
      
      const revenue = this.calculateTenantRevenue(tenant.tenant_id);
      stats.totalRevenue += revenue;
      
      stats.revenueByTenant.push({
        tenant_id: tenant.tenant_id,
        usage_count: tenant.usage_count || 0,
        revenue: Math.round(revenue * 100) / 100
      });
      
      // Distribution usage
      const usage = tenant.usage_count || 0;
      if (usage < 100) stats.usageDistribution.low++;
      else if (usage < 1000) stats.usageDistribution.medium++;
      else if (usage < 10000) stats.usageDistribution.high++;
      else stats.usageDistribution.enterprise++;
    }
    
    // Trier par revenue
    stats.revenueByTenant.sort((a, b) => b.revenue - a.revenue);
    stats.revenueByTenant = stats.revenueByTenant.slice(0, 20); // Top 20
    
    // Arrondir valeurs
    stats.totalRevenue = Math.round(stats.totalRevenue * 100) / 100;
    
    return stats;
  }
  
  // Obtenir usage pour période (simplifié - utilise stats actuelles)
  getUsageForPeriod(tenant_id, period = 'current') {
    if (period !== 'current') {
      return { error: 'Only current period supported' };
    }
    
    return this.getTenantBillingStats(tenant_id);
  }
  
  // Générer facture simplifiée
  generateInvoice(tenant_id, period = 'current') {
    const billingStats = this.getTenantBillingStats(tenant_id);
    
    if (!billingStats.hasBilling) {
      return { error: 'No billing data for tenant' };
    }
    
    const invoice = {
      tenant_id,
      invoice_id: `INV_${tenant_id}_${Date.now()}`,
      period: period,
      generated_at: new Date(),
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 jours
      currency: 'EUR',
      items: [],
      subtotal: 0,
      tax: 0,
      total: 0
    };
    
    // Actions
    if (billingStats.usage.estimatedBreakdown.actions > 0) {
      const actionsCost = billingStats.usage.estimatedCosts.actions;
      invoice.items.push({
        description: 'API Actions',
        quantity: billingStats.usage.estimatedBreakdown.actions,
        unit_price: this.pricing.per_action,
        total: actionsCost
      });
      invoice.subtotal += actionsCost;
    }
    
    // Leads
    if (billingStats.usage.estimatedBreakdown.leads > 0) {
      const leadsCost = billingStats.usage.estimatedCosts.leads;
      invoice.items.push({
        description: 'Lead Generation',
        quantity: billingStats.usage.estimatedBreakdown.leads,
        unit_price: this.pricing.per_lead,
        total: leadsCost
      });
      invoice.subtotal += leadsCost;
    }
    
    // Conversions
    if (billingStats.usage.estimatedBreakdown.conversions > 0) {
      const conversionsCost = billingStats.usage.estimatedCosts.conversions;
      invoice.items.push({
        description: 'Conversions',
        quantity: billingStats.usage.estimatedBreakdown.conversions,
        unit_price: this.pricing.per_conversion,
        total: conversionsCost
      });
      invoice.subtotal += conversionsCost;
    }
    
    // Calculer tax (20%)
    invoice.tax = Math.round(invoice.subtotal * 0.2 * 100) / 100;
    invoice.total = Math.round((invoice.subtotal + invoice.tax) * 100) / 100;
    
    console.log('[TENANT_BILLING_INVOICE_GENERATED]', {
      tenant_id,
      invoice_id: invoice.invoice_id,
      total: invoice.total,
      items_count: invoice.items.length
    });
    
    return invoice;
  }
  
  // Ajuster prix
  updatePricing(newPricing) {
    const oldPricing = { ...this.pricing };
    
    // Valider nouveaux prix
    for (const [key, value] of Object.entries(newPricing)) {
      if (typeof value === 'number' && value >= 0) {
        this.pricing[key] = value;
      }
    }
    
    console.log('[TENANT_BILLING_PRICING_UPDATED]', {
      old: oldPricing,
      new: this.pricing
    });
    
    return this.pricing;
  }
  
  // Health check billing
  healthCheck() {
    const globalStats = this.getGlobalBillingStats();
    
    const health = {
      status: 'healthy',
      enabled: this.enabled,
      totalTenants: globalStats.totalTenants,
      totalRevenue: globalStats.totalRevenue,
      issues: [],
      recommendations: []
    };
    
    // Vérifier erreurs
    const errorRate = this.stats.billingEvents > 0 ? 
      (this.stats.errors / this.stats.billingEvents) * 100 : 0;
    
    if (errorRate > 10) {
      health.issues.push('High billing error rate');
      health.recommendations.push('Check billing integration');
    }
    
    // Vérifier revenue anormalement basse
    if (globalStats.totalTenants > 0 && globalStats.totalRevenue < 1) {
      health.issues.push('Very low revenue');
      health.recommendations.push('Check pricing and tenant activity');
    }
    
    if (health.issues.length > 0) {
      health.status = 'warning';
    }
    
    return {
      ...health,
      stats: {
        totalUsage: globalStats.totalUsage,
        totalRevenue: globalStats.totalRevenue,
        billingEvents: this.stats.billingEvents,
        errorRate: Math.round(errorRate * 100) / 100
      }
    };
  }
  
  // Réinitialiser stats
  resetStats() {
    this.stats = {
      totalUsage: 0,
      totalRevenue: 0,
      billingEvents: 0,
      errors: 0
    };
    
    console.log('[TENANT_BILLING_STATS_RESET]');
  }
}

// Instance globale du billing
if (!global.tenantBilling) {
  global.tenantBilling = new TenantBilling();
}

// Fonctions principales
function incrementTenantUsage(tenant_id, actionType, metadata) {
  return global.tenantBilling.incrementUsage(tenant_id, actionType, metadata);
}

function getTenantBillingStats(tenant_id) {
  return global.tenantBilling.getTenantBillingStats(tenant_id);
}

function getGlobalBillingStats() {
  return global.tenantBilling.getGlobalBillingStats();
}

function getUsageForPeriod(tenant_id, period) {
  return global.tenantBilling.getUsageForPeriod(tenant_id, period);
}

function generateTenantInvoice(tenant_id, period) {
  return global.tenantBilling.generateInvoice(tenant_id, period);
}

// Administration
function updateBillingPricing(newPricing) {
  return global.tenantBilling.updatePricing(newPricing);
}

function billingHealthCheck() {
  return global.tenantBilling.healthCheck();
}

function resetBillingStats() {
  return global.tenantBilling.resetStats();
}

module.exports = {
  incrementTenantUsage,
  getTenantBillingStats,
  getGlobalBillingStats,
  getUsageForPeriod,
  generateTenantInvoice,
  updateBillingPricing,
  billingHealthCheck,
  resetBillingStats,
  TenantBilling
};
