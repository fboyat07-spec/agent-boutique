// ACTION 3 - Analytics avancées (sans DB complexe)

const express = require('express');
const {
  getTenantAnalytics,
  getDetailedTenantAnalytics,
  getConversionFunnel,
  getWeeklyTrends,
  clearAnalyticsCache,
  getAnalyticsServiceStats,
  analyticsHealthCheck
} = require('../services/dashboardAnalytics');
const { optionalAuthenticate } = require('../middleware/tenantAuth');

const router = express.Router();

// GET /api/analytics?tenant_id= - Analytics principales
router.get('/', optionalAuthenticate, async (req, res) => {
  try {
    const { tenant_id, refresh = 'false' } = req.query;
    
    console.log('[ANALYTICS_REQUESTED]', { tenant_id, refresh });
    
    if (!tenant_id) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'tenant_id parameter required'
      });
    }
    
    const forceRefresh = refresh === 'true';
    const analytics = getTenantAnalytics(tenant_id, forceRefresh);
    
    if (analytics.error) {
      return res.status(500).json({
        error: 'analytics_error',
        message: 'Failed to calculate analytics',
        details: analytics.message
      });
    }
    
    console.log('[ANALYTICS_GENERATED]', {
      tenant_id,
      totalLeads: analytics.funnel.totalLeads,
      conversionRate: analytics.funnel.rates.WON || 0,
      revenue: analytics.revenue.total
    });
    
    res.json({
      tenant_id,
      analytics,
      metadata: {
        generated_at: new Date(),
        cache_bypassed: forceRefresh,
        analytics_version: 'v1.0'
      }
    });
    
  } catch (error) {
    console.log('[ANALYTICS_ERROR]', error.message);
    
    res.status(500).json({
      error: 'analytics_error',
      message: 'Failed to get analytics',
      details: error.message
    });
  }
});

// GET /api/analytics/detailed?tenant_id= - Analytics détaillées
router.get('/detailed', optionalAuthenticate, async (req, res) => {
  try {
    const { tenant_id } = req.query;
    
    console.log('[DETAILED_ANALYTICS_REQUESTED]', { tenant_id });
    
    if (!tenant_id) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'tenant_id parameter required'
      });
    }
    
    const analytics = getDetailedTenantAnalytics(tenant_id);
    
    if (analytics.error) {
      return res.status(500).json({
        error: 'detailed_analytics_error',
        message: 'Failed to calculate detailed analytics',
        details: analytics.message
      });
    }
    
    console.log('[DETAILED_ANALYTICS_GENERATED]', {
      tenant_id,
      hasTrends: !!analytics.trends,
      hasStatusDistribution: !!analytics.statusDistribution
    });
    
    res.json({
      tenant_id,
      analytics,
      metadata: {
        generated_at: new Date(),
        analytics_version: 'v1.0'
      }
    });
    
  } catch (error) {
    console.log('[DETAILED_ANALYTICS_ERROR]', error.message);
    
    res.status(500).json({
      error: 'detailed_analytics_error',
      message: 'Failed to get detailed analytics',
      details: error.message
    });
  }
});

// GET /api/analytics/funnel?tenant_id= - Funnel de conversion
router.get('/funnel', optionalAuthenticate, async (req, res) => {
  try {
    const { tenant_id } = req.query;
    
    console.log('[FUNNEL_ANALYTICS_REQUESTED]', { tenant_id });
    
    if (!tenant_id) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'tenant_id parameter required'
      });
    }
    
    const funnel = getConversionFunnel(tenant_id);
    
    console.log('[FUNNEL_ANALYTICS_GENERATED]', {
      tenant_id,
      totalLeads: funnel.totalLeads,
      conversionRate: funnel.rates.WON || 0
    });
    
    res.json({
      tenant_id,
      funnel,
      metadata: {
        generated_at: new Date()
      }
    });
    
  } catch (error) {
    console.log('[FUNNEL_ANALYTICS_ERROR]', error.message);
    
    res.status(500).json({
      error: 'funnel_error',
      message: 'Failed to get funnel analytics',
      details: error.message
    });
  }
});

// GET /api/analytics/trends?tenant_id= - Trends hebdomadaires
router.get('/trends', optionalAuthenticate, async (req, res) => {
  try {
    const { tenant_id } = req.query;
    
    console.log('[TRENDS_ANALYTICS_REQUESTED]', { tenant_id });
    
    if (!tenant_id) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'tenant_id parameter required'
      });
    }
    
    const trends = getWeeklyTrends(tenant_id);
    
    console.log('[TRENDS_ANALYTICS_GENERATED]', {
      tenant_id,
      days: trends.length
    });
    
    res.json({
      tenant_id,
      trends,
      metadata: {
        generated_at: new Date(),
        period: '7_days'
      }
    });
    
  } catch (error) {
    console.log('[TRENDS_ANALYTICS_ERROR]', error.message);
    
    res.status(500).json({
      error: 'trends_error',
      message: 'Failed to get trends analytics',
      details: error.message
    });
  }
});

// DELETE /api/analytics/cache?tenant_id= - Vider cache analytics
router.delete('/cache', optionalAuthenticate, async (req, res) => {
  try {
    const { tenant_id } = req.query;
    
    console.log('[ANALYTICS_CACHE_CLEAR_REQUESTED]', { tenant_id });
    
    clearAnalyticsCache(tenant_id || null);
    
    console.log('[ANALYTICS_CACHE_CLEARED]', { tenant_id: tenant_id || 'all' });
    
    res.json({
      success: true,
      message: tenant_id ? `Cache cleared for tenant ${tenant_id}` : 'All analytics cache cleared',
      cleared_at: new Date()
    });
    
  } catch (error) {
    console.log('[ANALYTICS_CACHE_CLEAR_ERROR]', error.message);
    
    res.status(500).json({
      error: 'cache_clear_error',
      message: 'Failed to clear analytics cache',
      details: error.message
    });
  }
});

// GET /api/analytics/stats - Stats du service analytics
router.get('/stats', optionalAuthenticate, async (req, res) => {
  try {
    console.log('[ANALYTICS_SERVICE_STATS_REQUESTED]');
    
    const stats = getAnalyticsServiceStats();
    
    console.log('[ANALYTICS_SERVICE_STATS_GENERATED]', {
      enabled: stats.enabled,
      cacheSize: stats.cache.size,
      calculations: stats.stats.calculations
    });
    
    res.json({
      service: 'analytics',
      stats,
      metadata: {
        generated_at: new Date()
      }
    });
    
  } catch (error) {
    console.log('[ANALYTICS_SERVICE_STATS_ERROR]', error.message);
    
    res.status(500).json({
      error: 'service_stats_error',
      message: 'Failed to get analytics service stats',
      details: error.message
    });
  }
});

// GET /api/analytics/health - Health check analytics
router.get('/health', optionalAuthenticate, async (req, res) => {
  try {
    console.log('[ANALYTICS_HEALTH_CHECK_REQUESTED]');
    
    const health = analyticsHealthCheck();
    
    console.log('[ANALYTICS_HEALTH_CHECK_GENERATED]', {
      status: health.status,
      issues: health.issues.length,
      enabled: health.enabled
    });
    
    res.json({
      service: 'analytics',
      health,
      metadata: {
        checked_at: new Date()
      }
    });
    
  } catch (error) {
    console.log('[ANALYTICS_HEALTH_CHECK_ERROR]', error.message);
    
    res.status(500).json({
      error: 'health_check_error',
      message: 'Failed to perform analytics health check',
      details: error.message
    });
  }
});

module.exports = router;
