// ACTION 3 - Analytics avancées (sans DB complexe)

const { getLeadsByTenant } = require('./tenantIsolationSafe');
const { getTenantBillingStats } = require('./tenantBilling');
const BusinessLogger = require('./businessLogger');

// Analytics service sans base de données complexe
class DashboardAnalytics {
  constructor() {
    this.enabled = process.env.ANALYTICS_ENABLED === 'true';
    this.cache = new Map(); // tenant_id -> cached analytics
    this.cacheTimeout = 30000; // 30 secondes
    this.stats = {
      calculations: 0,
      cacheHits: 0,
      errors: 0
    };
    
    console.log('[DASHBOARD_ANALYTICS_INITIALIZED]', {
      enabled: this.enabled,
      cacheTimeout: this.cacheTimeout
    });
  }
  
  // Calculer funnel de conversion
  calculateConversionFunnel(tenant_id) {
    const leads = getLeadsByTenant(tenant_id);
    
    const funnel = {
      NEW: 0,
      CONTACTED: 0,
      ENGAGED: 0,
      INTERESTED: 0,
      CLOSING: 0,
      PAYMENT_SENT: 0,
      WON: 0,
      LOST: 0
    };
    
    // Compter par statut
    for (const lead of leads) {
      if (funnel[lead.status] !== undefined) {
        funnel[lead.status]++;
      }
    }
    
    // Calculer taux de conversion par étape
    const conversionRates = {};
    let previousCount = funnel.NEW;
    
    for (const [stage, count] of Object.entries(funnel)) {
      if (previousCount > 0) {
        conversionRates[stage] = Math.round((count / previousCount) * 10000) / 100; // 2 décimales
      } else {
        conversionRates[stage] = 0;
      }
      previousCount = count;
    }
    
    return {
      counts: funnel,
      rates: conversionRates,
      totalLeads: leads.length
    };
  }
  
  // Calculer temps moyen de conversion
  calculateAverageConversionTime(tenant_id) {
    const leads = getLeadsByTenant(tenant_id);
    const convertedLeads = leads.filter(lead => lead.status === 'WON');
    
    if (convertedLeads.length === 0) {
      return {
        avgHours: 0,
        avgDays: 0,
        sampleSize: 0
      };
    }
    
    let totalHours = 0;
    let validSamples = 0;
    
    for (const lead of convertedLeads) {
      if (lead.createdAt && lead.lastContactAt) {
        const created = new Date(lead.createdAt);
        const converted = new Date(lead.lastContactAt);
        const hoursDiff = (converted - created) / (1000 * 60 * 60);
        
        if (hoursDiff >= 0 && hoursDiff <= 8760) { // Max 1 an
          totalHours += hoursDiff;
          validSamples++;
        }
      }
    }
    
    const avgHours = validSamples > 0 ? Math.round(totalHours / validSamples * 100) / 100 : 0;
    const avgDays = avgHours / 24;
    
    return {
      avgHours,
      avgDays: Math.round(avgDays * 100) / 100,
      sampleSize: validSamples
    };
  }
  
  // Calculer taux de réponse
  calculateResponseRate(tenant_id) {
    const leads = getLeadsByTenant(tenant_id);
    
    if (leads.length === 0) {
      return { rate: 0, responded: 0, total: 0 };
    }
    
    const respondedLeads = leads.filter(lead => lead.lastContactAt);
    const rate = Math.round((respondedLeads.length / leads.length) * 10000) / 100;
    
    return {
      rate,
      responded: respondedLeads.length,
      total: leads.length
    };
  }
  
  // Calculer revenus générés
  calculateRevenue(tenant_id) {
    const billingStats = getTenantBillingStats(tenant_id);
    
    if (!billingStats.hasBilling) {
      return {
        total: 0,
        perLead: 0,
        perConversion: 0,
        hasBilling: false
      };
    }
    
    const leads = getLeadsByTenant(tenant_id);
    const convertedLeads = leads.filter(lead => lead.status === 'WON');
    
    const total = billingStats.usage?.revenue || 0;
    const perLead = leads.length > 0 ? Math.round(total / leads.length * 100) / 100 : 0;
    const perConversion = convertedLeads.length > 0 ? Math.round(total / convertedLeads.length * 100) / 100 : 0;
    
    return {
      total,
      perLead,
      perConversion,
      hasBilling: true
    };
  }
  
  // Calculer score moyen
  calculateAverageScore(tenant_id) {
    const leads = getLeadsByTenant(tenant_id);
    
    if (leads.length === 0) {
      return { avgScore: 0, maxScore: 0, minScore: 0, sampleSize: 0 };
    }
    
    const scores = leads.map(lead => lead.score || 0).filter(score => score > 0);
    
    if (scores.length === 0) {
      return { avgScore: 0, maxScore: 0, minScore: 0, sampleSize: 0 };
    }
    
    const avgScore = Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length * 100) / 100;
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    
    return {
      avgScore,
      maxScore,
      minScore,
      sampleSize: scores.length
    };
  }
  
  // Calculer distribution par statut
  calculateStatusDistribution(tenant_id) {
    const leads = getLeadsByTenant(tenant_id);
    
    const distribution = {};
    
    for (const lead of leads) {
      const status = lead.status || 'UNKNOWN';
      distribution[status] = (distribution[status] || 0) + 1;
    }
    
    // Calculer pourcentages
    const total = leads.length;
    const percentages = {};
    
    for (const [status, count] of Object.entries(distribution)) {
      percentages[status] = Math.round((count / total) * 10000) / 100;
    }
    
    return {
      counts: distribution,
      percentages,
      total
    };
  }
  
  // Calculer trends sur 7 jours (simulation)
  calculateWeeklyTrends(tenant_id) {
    const leads = getLeadsByTenant(tenant_id);
    const now = new Date();
    const trends = [];
    
    // Générer données pour les 7 derniers jours
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      
      // Compter leads créés ce jour
      const dayLeads = leads.filter(lead => {
        if (!lead.createdAt) return false;
        const leadDate = new Date(lead.createdAt);
        return leadDate >= date && leadDate < nextDate;
      });
      
      const newLeads = dayLeads.length;
      const conversions = dayLeads.filter(lead => lead.status === 'WON').length;
      
      trends.push({
        date: date.toISOString().split('T')[0],
        newLeads,
        conversions,
        conversionRate: newLeads > 0 ? Math.round((conversions / newLeads) * 10000) / 100 : 0
      });
    }
    
    return trends;
  }
  
  // Calculer KPIs principaux
  calculateKPIs(tenant_id) {
    const funnel = this.calculateConversionFunnel(tenant_id);
    const conversionTime = this.calculateAverageConversionTime(tenant_id);
    const responseRate = this.calculateResponseRate(tenant_id);
    const revenue = this.calculateRevenue(tenant_id);
    const avgScore = this.calculateAverageScore(tenant_id);
    
    return {
      tenant_id,
      funnel,
      conversionTime,
      responseRate,
      revenue,
      avgScore,
      calculated_at: new Date().toISOString()
    };
  }
  
  // Obtenir analytics avec cache
  getAnalytics(tenant_id, forceRefresh = false) {
    if (!this.enabled) {
      return { enabled: false, reason: 'analytics_disabled' };
    }
    
    this.stats.calculations++;
    
    // Vérifier cache
    const cacheKey = tenant_id;
    const cached = this.cache.get(cacheKey);
    
    if (!forceRefresh && cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
      this.stats.cacheHits++;
      return cached.data;
    }
    
    try {
      // Calculer analytics
      const analytics = this.calculateKPIs(tenant_id);
      
      // Mettre en cache
      this.cache.set(cacheKey, {
        data: analytics,
        timestamp: Date.now()
      });
      
      console.log('[DASHBOARD_ANALYTICS_CALCULATED]', {
        tenant_id,
        funnel_total: analytics.funnel.totalLeads,
        conversion_rate: analytics.funnel.rates.WON || 0,
        revenue: analytics.revenue.total
      });
      
      return analytics;
      
    } catch (error) {
      this.stats.errors++;
      
      console.log('[DASHBOARD_ANALYTICS_ERROR]', {
        tenant_id,
        error: error.message
      });
      
      return {
        error: 'calculation_failed',
        message: error.message,
        tenant_id
      };
    }
  }
  
  // Obtenir analytics détaillées
  getDetailedAnalytics(tenant_id) {
    if (!this.enabled) {
      return { enabled: false, reason: 'analytics_disabled' };
    }
    
    try {
      const analytics = this.getAnalytics(tenant_id);
      const trends = this.calculateWeeklyTrends(tenant_id);
      const statusDistribution = this.calculateStatusDistribution(tenant_id);
      
      return {
        ...analytics,
        trends,
        statusDistribution,
        metadata: {
          cache_enabled: true,
          cache_timeout: this.cacheTimeout,
          calculated_at: new Date()
        }
      };
      
    } catch (error) {
      console.log('[DASHBOARD_DETAILED_ANALYTICS_ERROR]', error.message);
      
      return {
        error: 'detailed_calculation_failed',
        message: error.message,
        tenant_id
      };
    }
  }
  
  // Nettoyer cache
  clearCache(tenant_id = null) {
    if (tenant_id) {
      this.cache.delete(tenant_id);
      console.log('[DASHBOARD_ANALYTICS_CACHE_CLEARED]', { tenant_id });
    } else {
      this.cache.clear();
      console.log('[DASHBOARD_ANALYTICS_CACHE_CLEARED_ALL]');
    }
  }
  
  // Obtenir stats du service
  getServiceStats() {
    const hitRate = this.stats.calculations > 0 ? 
      (this.stats.cacheHits / this.stats.calculations) * 100 : 0;
    
    return {
      enabled: this.enabled,
      cache: {
        size: this.cache.size,
        timeout: this.cacheTimeout,
        hitRate: Math.round(hitRate * 100) / 100
      },
      stats: this.stats,
      uptime: process.uptime()
    };
  }
  
  // Health check
  healthCheck() {
    const stats = this.getServiceStats();
    
    const health = {
      status: 'healthy',
      enabled: stats.enabled,
      issues: [],
      recommendations: []
    };
    
    // Vérifier taux d'erreur
    const errorRate = this.stats.calculations > 0 ? 
      (this.stats.errors / this.stats.calculations) * 100 : 0;
    
    if (errorRate > 10) {
      health.issues.push('High error rate');
      health.recommendations.push('Check data sources and calculations');
    }
    
    // Vérifier cache size
    if (stats.cache.size > 1000) {
      health.issues.push('Cache size too large');
      health.recommendations.push('Consider reducing cache timeout');
    }
    
    if (health.issues.length > 0) {
      health.status = 'warning';
    }
    
    return {
      ...health,
      stats: {
        calculations: this.stats.calculations,
        cacheHits: this.stats.cacheHits,
        errors: this.stats.errors,
        errorRate: Math.round(errorRate * 100) / 100
      }
    };
  }
  
  // Réinitialiser stats
  resetStats() {
    this.stats = {
      calculations: 0,
      cacheHits: 0,
      errors: 0
    };
    
    console.log('[DASHBOARD_ANALYTICS_STATS_RESET]');
  }
}

// Instance globale du service
if (!global.dashboardAnalytics) {
  global.dashboardAnalytics = new DashboardAnalytics();
}

// Fonctions principales
function getTenantAnalytics(tenant_id, forceRefresh) {
  return global.dashboardAnalytics.getAnalytics(tenant_id, forceRefresh);
}

function getDetailedTenantAnalytics(tenant_id) {
  return global.dashboardAnalytics.getDetailedAnalytics(tenant_id);
}

function getConversionFunnel(tenant_id) {
  return global.dashboardAnalytics.calculateConversionFunnel(tenant_id);
}

function getWeeklyTrends(tenant_id) {
  return global.dashboardAnalytics.calculateWeeklyTrends(tenant_id);
}

// Cache et stats
function clearAnalyticsCache(tenant_id) {
  return global.dashboardAnalytics.clearCache(tenant_id);
}

function getAnalyticsServiceStats() {
  return global.dashboardAnalytics.getServiceStats();
}

function analyticsHealthCheck() {
  return global.dashboardAnalytics.healthCheck();
}

// Administration
function resetAnalyticsStats() {
  return global.dashboardAnalytics.resetStats();
}

module.exports = {
  getTenantAnalytics,
  getDetailedTenantAnalytics,
  getConversionFunnel,
  getWeeklyTrends,
  clearAnalyticsCache,
  getAnalyticsServiceStats,
  analyticsHealthCheck,
  resetAnalyticsStats,
  DashboardAnalytics
};
