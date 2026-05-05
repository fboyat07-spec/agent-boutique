// ACTION 13 - Dashboard business

const express = require('express');
const router = express.Router();

// Import des modules de paiement réel
const { getRealPaymentWrapperStats, getRealPaymentWrapperReport } = require('../services/realPaymentWrapper');
const { getRealPaymentWebhookStats, getRealPaymentWebhookReport } = require('../services/realPaymentWebhook');
const { getDoublePaymentProtectionStats, getDoublePaymentProtectionReport } = require('../services/doublePaymentProtection');
const { getRealPaymentPhasesStats, getRealPaymentPhasesReport } = require('../services/realPaymentPhases');
const { getRevenueReport, getRevenueMonitoringStats } = require('../services/revenueMonitoring');
const { getConversionReport, getConversionTrackingStats } = require('../services/conversionTracking');
const { getPaymentFailureDetectorStats, getPaymentFailureDetectorReport } = require('../services/paymentFailureDetector');
const { getStripeSecurityStats, getStripeSecurityReport } = require('../services/stripeSecurityValidator');
const { getBusinessOverloadProtectionStats, getBusinessOverloadProtectionReport } = require('../services/businessOverloadProtection');
const { getPaymentFallbackStats, getPaymentFallbackReport } = require('../services/paymentFallbackManager');
const { getFlag } = require('../services/envFlags');

// GET /api/debug/business-health - Dashboard business complet
router.get('/business-health', async (req, res) => {
  try {
    console.log('[BUSINESS_HEALTH_DASHBOARD_REQUESTED]');
    
    // Vérifier si le paiement réel est activé
    const realPaymentEnabled = getFlag('AGENT_REAL_PAYMENT_ENABLED');
    const realValidationEnabled = getFlag('AGENT_REAL_VALIDATION_MODE');
    
    if (!realPaymentEnabled || !realValidationEnabled) {
      return res.json({
        enabled: false,
        message: 'Real payment system not enabled',
        environment: realValidationEnabled ? 'real_validation' : 'disabled',
        recommendations: [
          {
            type: 'info',
            message: 'Enable AGENT_REAL_PAYMENT_ENABLED and AGENT_REAL_VALIDATION_MODE',
            action: 'Set environment variables to enable real payment system',
            priority: 'high'
          }
        ]
      });
    }
    
    // Collecter toutes les statistiques
    const [
      paymentWrapperStats,
      webhookStats,
      protectionStats,
      phasesStats,
      revenueStats,
      conversionStats,
      failureDetectorStats,
      securityStats,
      overloadStats,
      fallbackStats
    ] = await Promise.all([
      getRealPaymentWrapperStats(),
      getRealPaymentWebhookStats(),
      getDoublePaymentProtectionStats(),
      getRealPaymentPhasesStats(),
      getRevenueMonitoringStats(),
      getConversionTrackingStats(),
      getPaymentFailureDetectorStats(),
      getStripeSecurityStats(),
      getBusinessOverloadProtectionStats(),
      getPaymentFallbackStats()
    ]);
    
    // Calculer les métriques globales
    const globalMetrics = calculateGlobalMetrics({
      paymentWrapperStats,
      webhookStats,
      protectionStats,
      phasesStats,
      revenueStats,
      conversionStats,
      failureDetectorStats,
      securityStats,
      overloadStats,
      fallbackStats
    });
    
    // Générer le statut de santé global
    const healthStatus = calculateHealthStatus(globalMetrics);
    
    // Générer des recommandations globales
    const globalRecommendations = generateGlobalRecommendations(globalMetrics, healthStatus);
    
    const dashboard = {
      enabled: true,
      environment: realPaymentEnabled ? 'real_payment' : 'real_validation',
      timestamp: new Date(),
      health: {
        status: healthStatus.status,
        score: healthStatus.score,
        issues: healthStatus.issues,
        strengths: healthStatus.strengths
      },
      metrics: globalMetrics,
      modules: {
        paymentWrapper: paymentWrapperStats,
        webhook: webhookStats,
        protection: protectionStats,
        phases: phasesStats,
        revenue: revenueStats,
        conversion: conversionStats,
        failureDetector: failureDetectorStats,
        security: securityStats,
        overload: overloadStats,
        fallback: fallbackStats
      },
      recommendations: globalRecommendations,
      alerts: generateActiveAlerts(globalMetrics),
      performance: calculatePerformanceMetrics(globalMetrics)
    };
    
    console.log('[BUSINESS_HEALTH_DASHBOARD_GENERATED]', {
      healthStatus: dashboard.health.status,
      totalRevenue: dashboard.metrics.revenue?.totalRevenue || 0,
      conversionRate: dashboard.metrics.conversion?.conversionRate || 0
    });
    
    res.json(dashboard);
    
  } catch (error) {
    console.error('[BUSINESS_HEALTH_DASHBOARD_ERROR]', error);
    res.status(500).json({
      error: 'Error generating business health dashboard',
      details: error.message
    });
  }
});

// GET /api/debug/revenue-report - Rapport revenue détaillé
router.get('/revenue-report', async (req, res) => {
  try {
    console.log('[REVENUE_REPORT_REQUESTED]');
    
    const revenueReport = getRevenueReport();
    
    console.log('[REVENUE_REPORT_GENERATED]', {
      totalRevenue: revenueReport.summary?.totalRevenue || 0,
      conversionRate: revenueReport.summary?.conversionRate || 0
    });
    
    res.json(revenueReport);
    
  } catch (error) {
    console.error('[REVENUE_REPORT_ERROR]', error);
    res.status(500).json({
      error: 'Error generating revenue report',
      details: error.message
    });
  }
});

// GET /api/debug/conversion-report - Rapport conversion détaillé
router.get('/conversion-report', async (req, res) => {
  try {
    console.log('[CONVERSION_REPORT_REQUESTED]');
    
    const conversionReport = getConversionReport();
    
    console.log('[CONVERSION_REPORT_GENERATED]', {
      totalConversions: conversionReport.summary?.totalConversions || 0,
      conversionRate: conversionReport.summary?.conversionRate || 0
    });
    
    res.json(conversionReport);
    
  } catch (error) {
    console.error('[CONVERSION_REPORT_ERROR]', error);
    res.status(500).json({
      error: 'Error generating conversion report',
      details: error.message
    });
  }
});

// GET /api/debug/payment-protection-report - Rapport protection paiement
router.get('/payment-protection-report', async (req, res) => {
  try {
    console.log('[PAYMENT_PROTECTION_REPORT_REQUESTED]');
    
    const protectionReport = getDoublePaymentProtectionReport();
    
    console.log('[PAYMENT_PROTECTION_REPORT_GENERATED]', {
      enabled: protectionReport.enabled,
      blockRate: protectionReport.stats?.blockRate || 0
    });
    
    res.json(protectionReport);
    
  } catch (error) {
    console.error('[PAYMENT_PROTECTION_REPORT_ERROR]', error);
    res.status(500).json({
      error: 'Error generating payment protection report',
      details: error.message
    });
  }
});

// GET /api/debug/payment-failure-report - Rapport échecs paiement
router.get('/payment-failure-report', async (req, res) => {
  try {
    console.log('[PAYMENT_FAILURE_REPORT_REQUESTED]');
    
    const failureReport = getPaymentFailureDetectorReport();
    
    console.log('[PAYMENT_FAILURE_REPORT_GENERATED]', {
      enabled: failureReport.enabled,
      totalDetections: failureReport.stats?.totalDetections || 0
    });
    
    res.json(failureReport);
    
  } catch (error) {
    console.error('[PAYMENT_FAILURE_REPORT_ERROR]', error);
    res.status(500).json({
      error: 'Error generating payment failure report',
      details: error.message
    });
  }
});

// GET /api/debug/security-report - Rapport sécurité Stripe
router.get('/security-report', async (req, res) => {
  try {
    console.log('[SECURITY_REPORT_REQUESTED]');
    
    const securityReport = getStripeSecurityReport();
    
    console.log('[SECURITY_REPORT_GENERATED]', {
      enabled: securityReport.enabled,
      passRate: securityReport.stats?.passRate || 0
    });
    
    res.json(securityReport);
    
  } catch (error) {
    console.error('[SECURITY_REPORT_ERROR]', error);
    res.status(500).json({
      error: 'Error generating security report',
      details: error.message
    });
  }
});

// GET /api/debug/overload-report - Rapport surcharge business
router.get('/overload-report', async (req, res) => {
  try {
    console.log('[OVERLOAD_REPORT_REQUESTED]');
    
    const overloadReport = getBusinessOverloadProtectionReport();
    
    console.log('[OVERLOAD_REPORT_GENERATED]', {
      enabled: overloadReport.enabled,
      blockRate: overloadReport.stats?.blockRate || 0
    });
    
    res.json(overloadReport);
    
  } catch (error) {
    console.error('[OVERLOAD_REPORT_ERROR]', error);
    res.status(500).json({
      error: 'Error generating overload report',
      details: error.message
    });
  }
});

// GET /api/debug/fallback-report - Rapport fallback paiement
router.get('/fallback-report', async (req, res) => {
  try {
    console.log('[FALLBACK_REPORT_REQUESTED]');
    
    const fallbackReport = getPaymentFallbackReport();
    
    console.log('[FALLBACK_REPORT_GENERATED]', {
      enabled: fallbackReport.enabled,
      successRate: fallbackReport.stats?.successRate || 0
    });
    
    res.json(fallbackReport);
    
  } catch (error) {
    console.error('[FALLBACK_REPORT_ERROR]', error);
    res.status(500).json({
      error: 'Error generating fallback report',
      details: error.message
    });
  }
});

// GET /api/debug/phases-report - Rapport phases activation
router.get('/phases-report', async (req, res) => {
  try {
    console.log('[PHASES_REPORT_REQUESTED]');
    
    const phasesReport = getRealPaymentPhasesReport();
    
    console.log('[PHASES_REPORT_GENERATED]', {
      enabled: phasesReport.enabled,
      currentPhase: phasesReport.currentPhase,
      maxRealLeadsActive: phasesReport.maxRealLeadsActive
    });
    
    res.json(phasesReport);
    
  } catch (error) {
    console.error('[PHASES_REPORT_ERROR]', error);
    res.status(500).json({
      error: 'Error generating phases report',
      details: error.message
    });
  }
});

// POST /api/debug/activate-phase1 - Activer phase 1
router.post('/activate-phase1', async (req, res) => {
  try {
    console.log('[ACTIVATE_PHASE1_REQUESTED]');
    
    const { activatePhase1 } = require('../services/realPaymentPhases');
    const result = await activatePhase1();
    
    console.log('[ACTIVATE_PHASE1_RESULT]', result);
    
    res.json(result);
    
  } catch (error) {
    console.error('[ACTIVATE_PHASE1_ERROR]', error);
    res.status(500).json({
      error: 'Error activating phase 1',
      details: error.message
    });
  }
});

// POST /api/debug/progress-phase - Progresser phase suivante
router.post('/progress-phase', async (req, res) => {
  try {
    console.log('[PROGRESS_PHASE_REQUESTED]');
    
    const { progressToNextPhase2Step } = require('../services/realPaymentPhases');
    const result = await progressToNextPhase2Step();
    
    console.log('[PROGRESS_PHASE_RESULT]', result);
    
    res.json(result);
    
  } catch (error) {
    console.error('[PROGRESS_PHASE_ERROR]', error);
    res.status(500).json({
      error: 'Error progressing to next phase',
      details: error.message
    });
  }
});

// GET /api/debug/system-status - Statut système global
router.get('/system-status', async (req, res) => {
  try {
    console.log('[SYSTEM_STATUS_REQUESTED]');
    
    const realPaymentEnabled = getFlag('AGENT_REAL_PAYMENT_ENABLED');
    const realValidationEnabled = getFlag('AGENT_REAL_VALIDATION_MODE');
    const testModeEnabled = getFlag('AGENT_TEST_MODE');
    
    const status = {
      environment: realPaymentEnabled ? 'real_payment' : 
                  realValidationEnabled ? 'real_validation' : 
                  testModeEnabled ? 'test' : 'production',
      flags: {
        AGENT_TEST_MODE: testModeEnabled,
        AGENT_REAL_VALIDATION_MODE: realValidationEnabled,
        AGENT_REAL_PAYMENT_ENABLED: realPaymentEnabled
      },
      modules: {
        paymentWrapper: getRealPaymentWrapperStats().enabled,
        webhook: getRealPaymentWebhookStats().enabled,
        protection: getDoublePaymentProtectionStats().enabled,
        phases: getRealPaymentPhasesStats().enabled,
        revenue: getRevenueMonitoringStats().enabled,
        conversion: getConversionTrackingStats().enabled,
        failureDetector: getPaymentFailureDetectorStats().enabled,
        security: getStripeSecurityStats().enabled,
        overload: getBusinessOverloadProtectionStats().enabled,
        fallback: getPaymentFallbackStats().enabled
      },
      timestamp: new Date(),
      uptime: process.uptime()
    };
    
    console.log('[SYSTEM_STATUS_GENERATED]', {
      environment: status.environment,
      modulesEnabled: Object.values(status.modules).filter(Boolean).length
    });
    
    res.json(status);
    
  } catch (error) {
    console.error('[SYSTEM_STATUS_ERROR]', error);
    res.status(500).json({
      error: 'Error generating system status',
      details: error.message
    });
  }
});

// Fonctions utilitaires pour le dashboard

// Calculer les métriques globales
function calculateGlobalMetrics(stats) {
  const metrics = {
    revenue: {
      totalRevenue: stats.revenueStats.stats?.totalRevenue || 0,
      successfulPayments: stats.revenueStats.stats?.successfulPayments || 0,
      failedPayments: stats.revenueStats.stats?.failedPayments || 0,
      successRate: stats.revenueStats.stats?.successRate || 0,
      avgTimeToPay: stats.revenueStats.stats?.avgTimeToPay || 0
    },
    conversion: {
      totalConversions: stats.conversionStats.stats?.totalConversions || 0,
      successfulConversions: stats.conversionStats.stats?.successfulConversions || 0,
      conversionRate: stats.conversionStats.stats?.conversionRate || 0,
      avgTimeToConvert: stats.conversionStats.stats?.avgTimeToConvert || 0
    },
    protection: {
      totalChecks: stats.protectionStats.stats?.totalChecks || 0,
      blockedPayments: stats.protectionStats.stats?.blockedPayments || 0,
      blockRate: stats.protectionStats.stats?.blockRate || 0
    },
    security: {
      totalChecks: stats.securityStats.stats?.totalSecurityChecks || 0,
      securityPassed: stats.securityStats.stats?.securityPassed || 0,
      passRate: stats.securityStats.stats?.passRate || 0
    },
    performance: {
      totalFallbacks: stats.fallbackStats.stats?.totalFallbacks || 0,
      fallbackSuccessRate: stats.fallbackStats.stats?.successRate || 0,
      overloadBlockRate: stats.overloadStats.stats?.blockRate || 0
    },
    phases: {
      currentPhase: stats.phasesStats.currentPhase || 'disabled',
      maxRealLeadsActive: stats.phasesStats.maxRealLeadsActive || 0,
      totalActivations: stats.phasesStats.stats?.totalActivations || 0
    }
  };
  
  return metrics;
}

// Calculer le statut de santé global
function calculateHealthStatus(metrics) {
  let score = 100;
  const issues = [];
  const strengths = [];
  
  // Vérifier le revenue
  if (metrics.revenue.successRate < 70) {
    score -= 20;
    issues.push({
      type: 'revenue',
      severity: 'high',
      message: `Low payment success rate: ${metrics.revenue.successRate}%`
    });
  } else if (metrics.revenue.successRate >= 90) {
    strengths.push({
      type: 'revenue',
      message: `Excellent payment success rate: ${metrics.revenue.successRate}%`
    });
  }
  
  // Vérifier la conversion
  if (metrics.conversion.conversionRate < 20) {
    score -= 15;
    issues.push({
      type: 'conversion',
      severity: 'medium',
      message: `Low conversion rate: ${metrics.conversion.conversionRate}%`
    });
  } else if (metrics.conversion.conversionRate >= 50) {
    strengths.push({
      type: 'conversion',
      message: `Good conversion rate: ${metrics.conversion.conversionRate}%`
    });
  }
  
  // Vérifier la sécurité
  if (metrics.security.passRate < 95) {
    score -= 25;
    issues.push({
      type: 'security',
      severity: 'critical',
      message: `Security check failures: ${100 - metrics.security.passRate}%`
    });
  } else {
    strengths.push({
      type: 'security',
      message: 'Security checks passing successfully'
    });
  }
  
  // Vérifier la protection
  if (metrics.protection.blockRate > 30) {
    score -= 10;
    issues.push({
      type: 'protection',
      severity: 'medium',
      message: `High protection block rate: ${metrics.protection.blockRate}%`
    });
  } else if (metrics.protection.blockRate < 10) {
    strengths.push({
      type: 'protection',
      message: 'Protection system working optimally'
    });
  }
  
  // Vérifier les fallbacks
  if (metrics.performance.fallbackSuccessRate < 80) {
    score -= 10;
    issues.push({
      type: 'performance',
      severity: 'medium',
      message: `Low fallback success rate: ${metrics.performance.fallbackSuccessRate}%`
    });
  } else {
    strengths.push({
      type: 'performance',
      message: 'Fallback system working well'
    });
  }
  
  // Déterminer le statut
  let status = 'excellent';
  if (score < 50) status = 'critical';
  else if (score < 70) status = 'warning';
  else if (score < 85) status = 'good';
  
  return {
    status,
    score: Math.max(0, score),
    issues,
    strengths
  };
}

// Générer des recommandations globales
function generateGlobalRecommendations(metrics, healthStatus) {
  const recommendations = [];
  
  // Recommandations basées sur les problèmes
  for (const issue of healthStatus.issues) {
    switch (issue.type) {
      case 'revenue':
        recommendations.push({
          type: 'critical',
          message: 'Improve payment success rate',
          action: 'Review payment process and fix technical issues',
          priority: 'high'
        });
        break;
        
      case 'conversion':
        recommendations.push({
          type: 'warning',
          message: 'Optimize conversion funnel',
          action: 'Analyze user journey and reduce friction points',
          priority: 'medium'
        });
        break;
        
      case 'security':
        recommendations.push({
          type: 'critical',
          message: 'Fix security configuration',
          action: 'Address security check failures immediately',
          priority: 'critical'
        });
        break;
        
      case 'protection':
        recommendations.push({
          type: 'info',
          message: 'Review protection settings',
          action: 'Adjust protection thresholds if too restrictive',
          priority: 'low'
        });
        break;
        
      case 'performance':
        recommendations.push({
          type: 'warning',
          message: 'Improve fallback mechanisms',
          action: 'Enhance error handling and retry strategies',
          priority: 'medium'
        });
        break;
    }
  }
  
  // Recommandations basées sur les forces
  if (healthStatus.strengths.length > 0) {
    recommendations.push({
      type: 'success',
      message: 'System performing well in key areas',
      action: 'Continue monitoring and maintain current configuration',
      priority: 'low'
    });
  }
  
  // Recommandations basées sur les phases
  if (metrics.phases.currentPhase === 'phase1_minimal') {
    recommendations.push({
      type: 'info',
      message: 'Consider progressing to Phase 2',
      action: 'Use progress-phase endpoint to scale up',
      priority: 'medium'
    });
  }
  
  return recommendations;
}

// Générer des alertes actives
function generateActiveAlerts(metrics) {
  const alerts = [];
  
  // Alertes critiques
  if (metrics.security.passRate < 95) {
    alerts.push({
      level: 'critical',
      type: 'security',
      message: 'Security check failures detected',
      action: 'Immediate attention required'
    });
  }
  
  if (metrics.revenue.successRate < 50) {
    alerts.push({
      level: 'critical',
      type: 'revenue',
      message: 'Very low payment success rate',
      action: 'Investigate payment system immediately'
    });
  }
  
  // Alertes warning
  if (metrics.conversion.conversionRate < 15) {
    alerts.push({
      level: 'warning',
      type: 'conversion',
      message: 'Low conversion rate',
      action: 'Review conversion funnel'
    });
  }
  
  if (metrics.performance.overloadBlockRate > 50) {
    alerts.push({
      level: 'warning',
      type: 'overload',
      message: 'High overload protection rate',
      action: 'Review business limits'
    });
  }
  
  return alerts;
}

// Calculer les métriques de performance
function calculatePerformanceMetrics(metrics) {
  return {
    overall: {
      score: calculateHealthStatus(metrics).score,
      status: calculateHealthStatus(metrics).status
    },
    efficiency: {
      paymentEfficiency: metrics.revenue.successRate,
      conversionEfficiency: metrics.conversion.conversionRate,
      protectionEfficiency: 100 - metrics.protection.blockRate
    },
    reliability: {
      securityReliability: metrics.security.passRate,
      fallbackReliability: metrics.performance.fallbackSuccessRate,
      systemUptime: process.uptime()
    },
    business: {
      totalRevenue: metrics.revenue.totalRevenue,
      avgTimeToPay: metrics.revenue.avgTimeToPay,
      avgTimeToConvert: metrics.conversion.avgTimeToConvert
    }
  };
}

module.exports = router;
