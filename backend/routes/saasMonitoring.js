// ACTION 9 - Monitoring SaaS

const express = require('express');
const {
  getTenantManagerStats,
  getTenantStats,
  listTenants
} = require('../services/tenantManager');
const {
  getIsolationStats,
  isolationHealthCheck
} = require('../services/tenantIsolationSafe');
const {
  getRoutingStats,
  routingHealthCheck
} = require('../services/instanceRouter');
const {
  getLockStats,
  lockHealthCheck
} = require('../services/leadLock');
const {
  getGlobalQuotaStats,
  quotaHealthCheck
} = require('../services/tenantQuotas');
const {
  getGlobalBillingStats,
  billingHealthCheck
} = require('../services/tenantBilling');
const {
  getConfigStats,
  configHealthCheck
} = require('../services/tenantConfig');

const router = express.Router();

// GET /api/agent/stats?tenant_id= - Monitoring SaaS étendu
router.get('/stats', async (req, res) => {
  try {
    const { tenant_id } = req.query;
    
    console.log('[SAAS_STATS_REQUESTED]', { tenant_id, timestamp: new Date() });
    
    if (tenant_id) {
      // Stats spécifiques tenant
      const tenantStats = getTenantStats(tenant_id);
      const isolationStats = getIsolationStats();
      const quotaStats = getTenantQuotaStats(tenant_id);
      const billingStats = getTenantBillingStats(tenant_id);
      const configStats = getFullTenantConfig(tenant_id);
      
      const stats = {
        tenant_id,
        overview: {
          status: tenantStats?.status || 'unknown',
          created_at: tenantStats?.created_at,
          usage_count: tenantStats?.usage_count || 0
        },
        leads: {
          total: isolationStats.tenantStats.find(t => t.tenant_id === tenant_id)?.leadCount || 0,
          operations: isolationStats.tenantStats.find(t => t.tenant_id === tenant_id)?.operations || 0
        },
        quotas: quotaStats.hasQuotas ? {
          daily: quotaStats.daily,
          status: quotaStats.daily?.usageStatus || 'unknown'
        } : { hasQuotas: false },
        billing: billingStats.hasBilling ? {
          usage: billingStats.usage,
          revenue: billingStats.usage?.revenue || 0
        } : { hasBilling: false },
        configuration: {
          outbound_enabled: configStats.outbound_enabled,
          followup_enabled: configStats.followup_enabled,
          ai_enabled: configStats.ai_enabled,
          max_per_run: configStats.max_per_run,
          cooldown_hours: configStats.cooldown_hours
        },
        health: {
          isolation: isolationStats.enabled,
          quotas: quotaStats.hasQuotas,
          billing: billingStats.hasBilling
        },
        metadata: {
          generated_at: new Date(),
          saas_enabled: true
        }
      };
      
      console.log('[SAAS_TENANT_STATS_GENERATED]', {
        tenant_id,
        status: stats.overview.status,
        leads: stats.leads.total,
        revenue: stats.billing.revenue
      });
      
      res.json(stats);
      
    } else {
      // Stats globales SaaS
      const managerStats = getTenantManagerStats();
      const isolationStats = getIsolationStats();
      const routingStats = getRoutingStats();
      const lockStats = getLockStats();
      const quotaStats = getGlobalQuotaStats();
      const billingStats = getGlobalBillingStats();
      const configStats = getConfigStats();
      
      const stats = {
        overview: {
          totalTenants: managerStats.totalTenants,
          activeTenants: managerStats.activeTenants,
          pausedTenants: managerStats.pausedTenants,
          totalUsage: managerStats.totalUsage,
          totalDailyActions: managerStats.totalDailyActions,
          uptime: process.uptime()
        },
        tenants: {
          distribution: managerStats.tenantsByStatus,
          list: listTenants().slice(0, 10) // Top 10
        },
        leads: {
          total: isolationStats.totalLeads,
          byTenant: isolationStats.tenantStats.slice(0, 5) // Top 5
        },
        quotas: {
          enabled: quotaStats.enabled,
          globalUsageRate: quotaStats.globalUsageRate,
          distribution: quotaStats.usageDistribution,
          nextReset: quotaStats.nextReset
        },
        billing: {
          enabled: billingStats.enabled,
          totalRevenue: billingStats.totalRevenue,
          totalUsage: billingStats.totalUsage,
          revenueByTenant: billingStats.revenueByTenant.slice(0, 5), // Top 5
          pricing: billingStats.pricing
        },
        multi_instance: {
          enabled: routingStats.enabled,
          instanceId: routingStats.instanceId,
          instanceCount: routingStats.instanceCount,
          processingRate: routingStats.processingRate,
          efficiency: routingStats.efficiency
        },
        locks: {
          enabled: lockStats.enabled,
          activeLocks: lockStats.activeLocks,
          conflictRate: lockStats.conflictRate,
          successRate: lockStats.successRate
        },
        configuration: {
          enabled: configStats.enabled,
          cacheSize: configStats.cacheSize,
          tenantConfigs: configStats.tenantConfigs.length
        },
        health: {
          isolation: isolationHealthCheck(),
          routing: routingHealthCheck(),
          locks: lockHealthCheck(),
          quotas: quotaHealthCheck(),
          billing: billingHealthCheck(),
          configuration: configHealthCheck()
        },
        metadata: {
          generated_at: new Date(),
          saas_enabled: true,
          environment: process.env.NODE_ENV || 'development'
        }
      };
      
      console.log('[SAAS_GLOBAL_STATS_GENERATED]', {
        totalTenants: stats.overview.totalTenants,
        activeTenants: stats.overview.activeTenants,
        totalRevenue: stats.billing.totalRevenue,
        leads: stats.leads.total
      });
      
      res.json(stats);
    }
    
  } catch (error) {
    console.log('[SAAS_STATS_ERROR]', error.message);
    
    res.status(500).json({
      error: 'stats_generation_error',
      message: 'Failed to generate SaaS stats',
      details: error.message
    });
  }
});

// GET /api/agent/usage - Usage endpoint
router.get('/usage', async (req, res) => {
  try {
    const { tenant_id, period = 'current' } = req.query;
    
    console.log('[SAAS_USAGE_REQUESTED]', { tenant_id, period });
    
    if (tenant_id) {
      // Usage spécifique tenant
      const billingStats = getTenantBillingStats(tenant_id);
      const quotaStats = getTenantQuotaStats(tenant_id);
      
      const usage = {
        tenant_id,
        period,
        billing: billingStats.hasBilling ? {
          usage_count: billingStats.usage?.totalActions || 0,
          revenue: billingStats.usage?.revenue || 0,
          breakdown: billingStats.usage?.estimatedBreakdown || {}
        } : { hasBilling: false },
        quotas: quotaStats.hasQuotas ? {
          daily: quotaStats.daily,
          status: quotaStats.daily?.usageStatus || 'unknown'
        } : { hasQuotas: false },
        metadata: {
          generated_at: new Date(),
          period
        }
      };
      
      res.json(usage);
      
    } else {
      // Usage global
      const billingStats = getGlobalBillingStats();
      const quotaStats = getGlobalQuotaStats();
      
      const usage = {
        period,
        global: {
          totalUsage: billingStats.totalUsage,
          totalRevenue: billingStats.totalRevenue,
          totalTenants: billingStats.totalTenants
        },
        quotas: {
          enabled: quotaStats.enabled,
          globalUsageRate: quotaStats.globalUsageRate,
          distribution: quotaStats.usageDistribution
        },
        topTenants: billingStats.revenueByTenant.slice(0, 10),
        metadata: {
          generated_at: new Date(),
          period
        }
      };
      
      res.json(usage);
    }
    
  } catch (error) {
    console.log('[SAAS_USAGE_ERROR]', error.message);
    
    res.status(500).json({
      error: 'usage_error',
      message: 'Failed to get usage data',
      details: error.message
    });
  }
});

// GET /api/agent/health - Health check SaaS complet
router.get('/health', async (req, res) => {
  try {
    const healthChecks = {
      tenantManager: { status: 'healthy' },
      isolation: isolationHealthCheck(),
      routing: routingHealthCheck(),
      locks: lockHealthCheck(),
      quotas: quotaHealthCheck(),
      billing: billingHealthCheck(),
      configuration: configHealthCheck()
    };
    
    // Calculer statut global
    const issues = [];
    const warnings = [];
    
    for (const [service, check] of Object.entries(healthChecks)) {
      if (check.status === 'critical') {
        issues.push(`${service}: critical`);
      } else if (check.status === 'warning') {
        warnings.push(`${service}: warning`);
      }
    }
    
    const globalStatus = issues.length > 0 ? 'critical' : 
                      warnings.length > 0 ? 'warning' : 'healthy';
    
    const health = {
      status: globalStatus,
      services: healthChecks,
      summary: {
        healthy: Object.values(healthChecks).filter(c => c.status === 'healthy').length,
        warnings: warnings.length,
        critical: issues.length
      },
      issues,
      recommendations: [],
      metadata: {
        checked_at: new Date(),
        uptime: process.uptime()
      }
    };
    
    // Recommandations
    if (issues.length > 0) {
      health.recommendations.push('Address critical issues immediately');
    }
    
    if (warnings.length > 0) {
      health.recommendations.push('Review warnings for potential issues');
    }
    
    if (health.summary.healthy === Object.keys(healthChecks).length) {
      health.recommendations.push('All systems operating normally');
    }
    
    console.log('[SAAS_HEALTH_CHECK]', {
      status: health.status,
      healthy: health.summary.healthy,
      warnings: health.summary.warnings,
      critical: health.summary.critical
    });
    
    res.json(health);
    
  } catch (error) {
    console.log('[SAAS_HEALTH_ERROR]', error.message);
    
    res.status(500).json({
      error: 'health_check_error',
      message: 'Failed to perform health check',
      details: error.message
    });
  }
});

// GET /api/agent/tenants - Lister tous les tenants avec stats
router.get('/tenants', async (req, res) => {
  try {
    const { limit = 50, status } = req.query;
    
    console.log('[SAAS_TENANTS_REQUESTED]', { limit, status });
    
    const tenants = listTenants();
    let filteredTenants = tenants;
    
    // Filtrer par statut si spécifié
    if (status) {
      filteredTenants = tenants.filter(t => t.status === status);
    }
    
    // Limiter résultats
    const limitedTenants = filteredTenants.slice(0, parseInt(limit));
    
    // Ajouter stats supplémentaires
    const tenantsWithStats = limitedTenants.map(tenant => {
      const quotaStats = getTenantQuotaStats(tenant.tenant_id);
      const billingStats = getTenantBillingStats(tenant.tenant_id);
      
      return {
        ...tenant,
        quotas: quotaStats.hasQuotas ? {
          daily: quotaStats.daily,
          status: quotaStats.daily?.usageStatus
        } : { hasQuotas: false },
        billing: billingStats.hasBilling ? {
          revenue: billingStats.usage?.revenue || 0,
          usage: billingStats.usage?.totalActions || 0
        } : { hasBilling: false }
      };
    });
    
    const response = {
      tenants: tenantsWithStats,
      pagination: {
        total: filteredTenants.length,
        returned: tenantsWithStats.length,
        limit: parseInt(limit)
      },
      filters: {
        status: status || 'all'
      },
      metadata: {
        generated_at: new Date()
      }
    };
    
    res.json(response);
    
  } catch (error) {
    console.log('[SAAS_TENANTS_ERROR]', error.message);
    
    res.status(500).json({
      error: 'tenants_error',
      message: 'Failed to list tenants',
      details: error.message
    });
  }
});

// GET /api/agent/system - Information système SaaS
router.get('/system', async (req, res) => {
  try {
    const system = {
      saas: {
        enabled: process.env.SAAS_ENABLED === 'true',
        multi_instance: process.env.MULTI_INSTANCE_ENABLED === 'true',
        tenant_quotas: process.env.TENANT_QUOTA_ENABLED === 'true',
        billing: process.env.BILLING_ENABLED === 'true'
      },
      instance: {
        id: process.env.INSTANCE_ID || 'unknown',
        count: parseInt(process.env.INSTANCE_COUNT) || 1,
        uptime: process.uptime()
      },
      configuration: {
        tenant_count: getTenantManagerStats().totalTenants,
        active_tenants: getTenantManagerStats().activeTenants,
        total_usage: getTenantManagerStats().totalUsage
      },
      features: {
        multi_agent: process.env.MULTI_AGENT_ENABLED === 'true',
        ai_advanced: process.env.AI_ADVANCED_ENABLED === 'true',
        auto_regulation: process.env.AUTO_REGULATION_ENABLED === 'true',
        queue: process.env.QUEUE_ENABLED === 'true'
      },
      environment: {
        node_version: process.version,
        platform: process.platform,
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
        }
      },
      metadata: {
        generated_at: new Date(),
        version: 'saas-v1.0'
      }
    };
    
    console.log('[SAAS_SYSTEM_INFO]', {
      saas_enabled: system.saas.enabled,
      tenant_count: system.configuration.tenant_count,
      instance_id: system.instance.id
    });
    
    res.json(system);
    
  } catch (error) {
    console.log('[SAAS_SYSTEM_ERROR]', error.message);
    
    res.status(500).json({
      error: 'system_info_error',
      message: 'Failed to get system information',
      details: error.message
    });
  }
});

module.exports = router;
