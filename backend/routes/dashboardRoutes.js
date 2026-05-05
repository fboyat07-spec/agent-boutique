// ACTION 1 - Dashboard UI client (non couplé)

const express = require('express');
const { getTenantStats, listTenants } = require('../services/tenantManager');
const { getLeadsByTenant } = require('../services/tenantIsolationSafe');
const { getTenantBillingStats } = require('../services/tenantBilling');
const { getTenantQuotaStats } = require('../services/tenantQuotas');
const { getFullTenantConfig } = require('../services/tenantConfig');
const { getPauseStats } = require('../services/tenantPause');
const { optionalAuthenticate, validateTenant } = require('../middleware/tenantAuth');

const router = express.Router();

// GET /api/dashboard/summary?tenant_id= - Vue d'ensemble dashboard
router.get('/summary', optionalAuthenticate, async (req, res) => {
  try {
    const { tenant_id } = req.query;
    
    console.log('[DASHBOARD_SUMMARY_REQUESTED]', { tenant_id, timestamp: new Date() });
    
    if (!tenant_id) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'tenant_id parameter required'
      });
    }
    
    // Stats tenant
    const tenantStats = getTenantStats(tenant_id);
    const billingStats = getTenantBillingStats(tenant_id);
    const quotaStats = getTenantQuotaStats(tenant_id);
    const config = getFullTenantConfig(tenant_id);
    
    // Leads du tenant
    const leads = getLeadsByTenant(tenant_id);
    
    // Calculer stats principales
    const totalLeads = leads.length;
    const activeLeads = leads.filter(l => l.status !== 'WON' && l.status !== 'LOST').length;
    const wonLeads = leads.filter(l => l.status === 'WON').length;
    const lostLeads = leads.filter(l => l.status === 'LOST').length;
    
    const conversionRate = totalLeads > 0 ? (wonLeads / totalLeads) * 100 : 0;
    
    // Stats par statut
    const statusDistribution = {};
    for (const lead of leads) {
      statusDistribution[lead.status] = (statusDistribution[lead.status] || 0) + 1;
    }
    
    const summary = {
      tenant_id,
      overview: {
        totalLeads,
        activeLeads,
        wonLeads,
        lostLeads,
        conversionRate: Math.round(conversionRate * 100) / 100,
        status: tenantStats?.status || 'unknown'
      },
      performance: {
        conversionRate: Math.round(conversionRate * 100) / 100,
        avgScore: leads.length > 0 ? 
          Math.round(leads.reduce((sum, l) => sum + (l.score || 0), 0) / leads.length * 100) / 100 : 0,
        statusDistribution
      },
      billing: billingStats.hasBilling ? {
        usage: billingStats.usage?.totalActions || 0,
        revenue: billingStats.usage?.revenue || 0,
        estimatedCosts: billingStats.usage?.estimatedCosts || {}
      } : { hasBilling: false },
      quotas: quotaStats.hasQuotas ? {
        daily: quotaStats.daily,
        status: quotaStats.daily?.usageStatus || 'unknown'
      } : { hasQuotas: false },
      configuration: {
        outbound_enabled: config.outbound_enabled,
        followup_enabled: config.followup_enabled,
        ai_enabled: config.ai_enabled,
        max_per_run: config.max_per_run,
        cooldown_hours: config.cooldown_hours
      },
      health: {
        billing: billingStats.hasBilling,
        quotas: quotaStats.hasQuotas,
        active: tenantStats?.status === 'ACTIVE'
      },
      metadata: {
        generated_at: new Date(),
        dashboard_version: 'v1.0'
      }
    };
    
    console.log('[DASHBOARD_SUMMARY_GENERATED]', {
      tenant_id,
      totalLeads: summary.overview.totalLeads,
      conversionRate: summary.performance.conversionRate,
      revenue: summary.billing.revenue
    });
    
    res.json(summary);
    
  } catch (error) {
    console.log('[DASHBOARD_SUMMARY_ERROR]', error.message);
    
    res.status(500).json({
      error: 'summary_error',
      message: 'Failed to generate dashboard summary',
      details: error.message
    });
  }
});

// GET /api/dashboard/leads?tenant_id=&status=&limit= - Liste leads avec filtres
router.get('/leads', optionalAuthenticate, async (req, res) => {
  try {
    const { tenant_id, status, limit = 50, offset = 0 } = req.query;
    
    console.log('[DASHBOARD_LEADS_REQUESTED]', { tenant_id, status, limit, offset });
    
    if (!tenant_id) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'tenant_id parameter required'
      });
    }
    
    const leads = getLeadsByTenant(tenant_id);
    
    // Filtrer par statut si spécifié
    let filteredLeads = leads;
    if (status) {
      filteredLeads = leads.filter(lead => lead.status === status);
    }
    
    // Trier par date de création (plus récent d'abord)
    filteredLeads.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    
    // Paginer
    const startIndex = parseInt(offset);
    const endIndex = startIndex + parseInt(limit);
    const paginatedLeads = filteredLeads.slice(startIndex, endIndex);
    
    // Masquer téléphone pour sécurité
    const safeLeads = paginatedLeads.map(lead => ({
      ...lead,
      phone: lead.phone ? lead.phone.slice(0, -4) + '****' : 'unknown',
      lastContactAt: lead.lastContactAt ? new Date(lead.lastContactAt) : null,
      createdAt: lead.createdAt ? new Date(lead.createdAt) : null
    }));
    
    const response = {
      tenant_id,
      leads: safeLeads,
      pagination: {
        total: filteredLeads.length,
        returned: safeLeads.length,
        offset: startIndex,
        limit: parseInt(limit)
      },
      filters: {
        status: status || 'all'
      },
      metadata: {
        generated_at: new Date()
      }
    };
    
    console.log('[DASHBOARD_LEADS_GENERATED]', {
      tenant_id,
      total: response.pagination.total,
      returned: response.pagination.returned
    });
    
    res.json(response);
    
  } catch (error) {
    console.log('[DASHBOARD_LEADS_ERROR]', error.message);
    
    res.status(500).json({
      error: 'leads_error',
      message: 'Failed to get leads',
      details: error.message
    });
  }
});

// GET /api/dashboard/performance?tenant_id=&period= - Stats performance
router.get('/performance', optionalAuthenticate, async (req, res) => {
  try {
    const { tenant_id, period = 'current' } = req.query;
    
    console.log('[DASHBOARD_PERFORMANCE_REQUESTED]', { tenant_id, period });
    
    if (!tenant_id) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'tenant_id parameter required'
      });
    }
    
    const leads = getLeadsByTenant(tenant_id);
    const billingStats = getTenantBillingStats(tenant_id);
    const quotaStats = getTenantQuotaStats(tenant_id);
    
    // Calculer funnel de conversion
    const funnel = {
      NEW: leads.filter(l => l.status === 'NEW').length,
      CONTACTED: leads.filter(l => l.status === 'CONTACTED').length,
      ENGAGED: leads.filter(l => l.status === 'ENGAGED').length,
      INTERESTED: leads.filter(l => l.status === 'INTERESTED').length,
      CLOSING: leads.filter(l => l.status === 'CLOSING').length,
      PAYMENT_SENT: leads.filter(l => l.status === 'PAYMENT_SENT').length,
      WON: leads.filter(l => l.status === 'WON').length,
      LOST: leads.filter(l => l.status === 'LOST').length
    };
    
    // Calculer taux de conversion par étape
    const conversionRates = {};
    const previousStage = funnel.NEW;
    
    for (const [stage, count] of Object.entries(funnel)) {
      if (previousStage > 0) {
        conversionRates[stage] = Math.round((count / previousStage) * 100 * 100) / 100;
      } else {
        conversionRates[stage] = 0;
      }
    }
    
    // Temps moyen de conversion
    const convertedLeads = leads.filter(l => l.status === 'WON');
    const avgConversionTime = convertedLeads.length > 0 ? 
      Math.round(
        convertedLeads.reduce((sum, lead) => {
          if (lead.createdAt && lead.lastContactAt) {
            return sum + (new Date(lead.lastContactAt) - new Date(lead.createdAt));
          }
          return sum;
        }, 0) / convertedLeads.length / (1000 * 60 * 60) // en heures
      ) : 0;
    
    // Taux de réponse (estimation basée sur les leads avec lastContactAt)
    const leadsWithContact = leads.filter(l => l.lastContactAt);
    const responseRate = leads.length > 0 ? 
      Math.round((leadsWithContact.length / leads.length) * 100 * 100) / 100 : 0;
    
    // Score moyen
    const avgScore = leads.length > 0 ? 
      Math.round(leads.reduce((sum, l) => sum + (l.score || 0), 0) / leads.length * 100) / 100 : 0;
    
    const performance = {
      tenant_id,
      period,
      funnel,
      conversionRates,
      metrics: {
        totalLeads: leads.length,
        conversionRate: conversionRates.WON || 0,
        avgConversionTime: avgConversionTime, // en heures
        responseRate,
        avgScore
      },
      revenue: billingStats.hasBilling ? {
        total: billingStats.usage?.revenue || 0,
        perConversion: convertedLeads.length > 0 ? 
          Math.round((billingStats.usage?.revenue || 0) / convertedLeads.length * 100) / 100 : 0
      } : { hasBilling: false },
      quotas: quotaStats.hasQuotas ? {
        usageRate: quotaStats.daily?.usageRate || '0%',
        remaining: quotaStats.daily?.remaining || 0
      } : { hasQuotas: false },
      metadata: {
        generated_at: new Date()
      }
    };
    
    console.log('[DASHBOARD_PERFORMANCE_GENERATED]', {
      tenant_id,
      totalLeads: performance.metrics.totalLeads,
      conversionRate: performance.metrics.conversionRate,
      revenue: performance.revenue.total
    });
    
    res.json(performance);
    
  } catch (error) {
    console.log('[DASHBOARD_PERFORMANCE_ERROR]', error.message);
    
    res.status(500).json({
      error: 'performance_error',
      message: 'Failed to get performance data',
      details: error.message
    });
  }
});

// GET /api/dashboard/settings?tenant_id= - Configuration actuelle
router.get('/settings', optionalAuthenticate, async (req, res) => {
  try {
    const { tenant_id } = req.query;
    
    console.log('[DASHBOARD_SETTINGS_REQUESTED]', { tenant_id });
    
    if (!tenant_id) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'tenant_id parameter required'
      });
    }
    
    const config = getFullTenantConfig(tenant_id);
    const tenantStats = getTenantStats(tenant_id);
    const billingStats = getTenantBillingStats(tenant_id);
    const quotaStats = getTenantQuotaStats(tenant_id);
    
    const settings = {
      tenant_id,
      configuration: {
        outbound: {
          enabled: config.outbound_enabled,
          maxPerRun: config.max_per_run,
          cooldownHours: config.cooldown_hours
        },
        followup: {
          enabled: config.followup_enabled,
          cooldownHours: config.cooldown_hours
        },
        ai: {
          enabled: config.ai_enabled,
          advancedEnabled: config.ai_advanced_enabled
        },
        multiAgent: {
          enabled: config.multi_agent_enabled
        },
        queue: {
          enabled: config.queue_enabled
        },
        regulation: {
          enabled: config.auto_regulation_enabled
        }
      },
      limits: {
        dailyActions: quotaStats.hasQuotas ? quotaStats.daily?.max || 1000 : null,
        currentUsage: quotaStats.hasQuotas ? quotaStats.daily?.current || 0 : null
      },
      billing: billingStats.hasBilling ? {
        enabled: true,
        usageCount: billingStats.usage?.totalActions || 0,
        revenue: billingStats.usage?.revenue || 0
      } : { enabled: false },
      status: {
        active: tenantStats?.status === 'ACTIVE',
        paused: tenantStats?.status === 'PAUSED',
        createdAt: tenantStats?.created_at
      },
      metadata: {
        generated_at: new Date(),
        configurable: true
      }
    };
    
    console.log('[DASHBOARD_SETTINGS_GENERATED]', {
      tenant_id,
      active: settings.status.active,
      outboundEnabled: settings.configuration.outbound.enabled
    });
    
    res.json(settings);
    
  } catch (error) {
    console.log('[DASHBOARD_SETTINGS_ERROR]', error.message);
    
    res.status(500).json({
      error: 'settings_error',
      message: 'Failed to get settings',
      details: error.message
    });
  }
});

// GET /api/dashboard/health?tenant_id= - Health check dashboard
router.get('/health', optionalAuthenticate, async (req, res) => {
  try {
    const { tenant_id } = req.query;
    
    console.log('[DASHBOARD_HEALTH_REQUESTED]', { tenant_id });
    
    if (!tenant_id) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'tenant_id parameter required'
      });
    }
    
    const tenantStats = getTenantStats(tenant_id);
    const billingStats = getTenantBillingStats(tenant_id);
    const quotaStats = getTenantQuotaStats(tenant_id);
    const pauseStats = getPauseStats();
    
    // Vérifier santé des composants
    const components = {
      tenant: {
        status: tenantStats ? 'healthy' : 'missing',
        active: tenantStats?.status === 'ACTIVE'
      },
      billing: {
        status: billingStats.hasBilling ? 'healthy' : 'disabled',
        enabled: billingStats.hasBilling
      },
      quotas: {
        status: quotaStats.hasQuotas ? 'healthy' : 'disabled',
        enabled: quotaStats.hasQuotas,
        usageStatus: quotaStats.daily?.usageStatus || 'unknown'
      },
      leads: {
        status: 'healthy', // Toujours car basé sur mémoire
        count: getLeadsByTenant(tenant_id).length
      }
    };
    
    // Calculer statut global
    const issues = [];
    const warnings = [];
    
    if (!tenantStats) {
      issues.push('Tenant not found');
    } else if (tenantStats.status !== 'ACTIVE') {
      warnings.push('Tenant not active');
    }
    
    if (quotaStats.hasQuotas && quotaStats.daily?.usageStatus === 'critical') {
      warnings.push('Quota usage critical');
    }
    
    const globalStatus = issues.length > 0 ? 'critical' : 
                      warnings.length > 0 ? 'warning' : 'healthy';
    
    const health = {
      tenant_id,
      status: globalStatus,
      components,
      issues,
      warnings,
      uptime: process.uptime(),
      metadata: {
        checked_at: new Date()
      }
    };
    
    console.log('[DASHBOARD_HEALTH_GENERATED]', {
      tenant_id,
      status: health.status,
      issues: health.issues.length,
      warnings: health.warnings.length
    });
    
    res.json(health);
    
  } catch (error) {
    console.log('[DASHBOARD_HEALTH_ERROR]', error.message);
    
    res.status(500).json({
      error: 'health_error',
      message: 'Failed to get health status',
      details: error.message
    });
  }
});

module.exports = router;
