// ACTION 9 - Tableau validation réelle

const express = require('express');
const { getFlag } = require('../services/envFlags');
const { getRealValidationStats, getRecentRealLogs } = require('../services/realValidationLogger');
const { getMarkerStats, getValidationReport } = require('../services/leadValidationMarker');
const { getRealTraceStats, getConversationMetrics } = require('../services/realTraceManager');
const { getWhatsAppWrapperStats } = require('../services/whatsappWrapper');
const { getUXValidatorStats, getUXValidationReport } = require('../services/conversationUXValidator');
const { getClosingControllerStats, getClosingReport } = require('../services/closingController');
const { getFrictionDetectorStats, getFrictionReport } = require('../services/frictionDetector');

const router = express.Router();

// GET /api/debug/real-validation-report - Tableau validation réelle
router.get('/real-validation-report', async (req, res) => {
  try {
    console.log('[REAL_VALIDATION_REPORT_REQUESTED]');
    
    if (!getFlag('AGENT_REAL_VALIDATION_MODE') && !getFlag('AGENT_TEST_MODE')) {
      return res.status(403).json({
        error: 'validation_mode_disabled',
        message: 'Real validation report only available in validation or test mode'
      });
    }
    
    // Collecter les stats de tous les modules de validation réelle
    const realValidationStats = getRealValidationStats();
    const markerStats = getMarkerStats();
    const traceStats = getRealTraceStats();
    const whatsappStats = getWhatsAppWrapperStats();
    const uxStats = getUXValidatorStats();
    const closingStats = getClosingControllerStats();
    const frictionStats = getFrictionDetectorStats();
    
    // Calculer les métriques globales
    const globalMetrics = {
      realLeads: realValidationStats.stats?.inboundReal || 0,
      engaged: realValidationStats.stats?.userReplyReal || 0,
      closingAttempts: closingStats.stats?.closingAttempts || 0,
      dropOff: frictionStats.stats?.frictionPoints || 0,
      avgMessages: traceStats.messages?.avgMessagesPerConversation || 0,
      avgResponseTime: traceStats.latency?.avg || 0,
      frictionPoints: frictionStats.stats?.frictionPoints || 0
    };
    
    // Calculer le statut global
    let overallStatus = 'healthy';
    const issues = [];
    
    if (globalMetrics.realLeads === 0) {
      overallStatus = 'warning';
      issues.push('No real leads processed yet');
    }
    
    if (globalMetrics.avgResponseTime > 300000) { // > 5 minutes
      overallStatus = 'warning';
      issues.push('Slow average response time');
    }
    
    if (globalMetrics.frictionPoints > globalMetrics.realLeads * 0.5) {
      overallStatus = 'warning';
      issues.push('High friction points ratio');
    }
    
    if (globalMetrics.engaged === 0 && globalMetrics.realLeads > 0) {
      overallStatus = 'warning';
      issues.push('No user engagement detected');
    }
    
    console.log('[REAL_VALIDATION_REPORT_GENERATED]', {
      overallStatus,
      realLeads: globalMetrics.realLeads,
      engaged: globalMetrics.engaged,
      closingAttempts: globalMetrics.closingAttempts
    });
    
    res.json({
      overall: {
        status: overallStatus,
        metrics: globalMetrics,
        issues,
        environment: realValidationStats.environment
      },
      modules: {
        realValidationLogger: realValidationStats,
        leadValidationMarker: markerStats,
        realTraceManager: traceStats,
        whatsappWrapper: whatsappStats,
        conversationUXValidator: uxStats,
        closingController: closingStats,
        frictionDetector: frictionStats
      },
      recommendations: generateRealValidationRecommendations(globalMetrics, {
        realValidationStats,
        markerStats,
        traceStats,
        whatsappStats,
        uxStats,
        closingStats,
        frictionStats
      }),
      metadata: {
        generated_at: new Date(),
        validation_mode: 'real_validation'
      }
    });
    
  } catch (error) {
    console.log('[REAL_VALIDATION_REPORT_ERROR]', error.message);
    
    res.status(500).json({
      error: 'real_validation_report_error',
      message: 'Failed to generate real validation report',
      details: error.message
    });
  }
});

// GET /api/debug/real-logs - Logs récents réels
router.get('/real-logs', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    console.log('[REAL_LOGS_REQUESTED]', { limit });
    
    if (!getFlag('AGENT_REAL_VALIDATION_MODE') && !getFlag('AGENT_TEST_MODE')) {
      return res.status(403).json({
        error: 'validation_mode_disabled',
        message: 'Real logs only available in validation or test mode'
      });
    }
    
    const recentLogs = getRecentRealLogs(parseInt(limit));
    
    console.log('[REAL_LOGS_GENERATED]', {
      count: recentLogs.count || 0,
      limit
    });
    
    res.json({
      logs: recentLogs.logs || [],
      count: recentLogs.count || 0,
      environment: recentLogs.environment,
      metadata: {
        generated_at: new Date(),
        limit
      }
    });
    
  } catch (error) {
    console.log('[REAL_LOGS_ERROR]', error.message);
    
    res.status(500).json({
      error: 'real_logs_error',
      message: 'Failed to get real logs',
      details: error.message
    });
  }
});

// GET /api/debug/real-traces - Traces réelles
router.get('/real-traces', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    console.log('[REAL_TRACES_REQUESTED]', { limit });
    
    if (!getFlag('AGENT_REAL_VALIDATION_MODE') && !getFlag('AGENT_TEST_MODE')) {
      return res.status(403).json({
        error: 'validation_mode_disabled',
        message: 'Real traces only available in validation or test mode'
      });
    }
    
    const realTraces = getRealTraceStats();
    
    console.log('[REAL_TRACES_GENERATED]', {
      tracesCreated: realTraces.stats?.realTracesCreated || 0
    });
    
    res.json({
      traces: realTraces.stats || {},
      latency: realTraces.latency || {},
      messages: realTraces.messages || {},
      environment: realTraces.environment,
      metadata: {
        generated_at: new Date(),
        limit
      }
    });
    
  } catch (error) {
    console.log('[REAL_TRACES_ERROR]', error.message);
    
    res.status(500).json({
      error: 'real_traces_error',
      message: 'Failed to get real traces',
      details: error.message
    });
  }
});

// GET /api/debug/real-conversations - Conversations réelles analysées
router.get('/real-conversations', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    console.log('[REAL_CONVERSATIONS_REQUESTED]', { limit });
    
    if (!getFlag('AGENT_REAL_VALIDATION_MODE') && !getFlag('AGENT_TEST_MODE')) {
      return res.status(403).json({
        error: 'validation_mode_disabled',
        message: 'Real conversations only available in validation or test mode'
      });
    }
    
    const uxStats = getUXValidatorStats();
    const uxReport = getUXValidationReport();
    
    console.log('[REAL_CONVERSATIONS_GENERATED]', {
      conversationsAnalyzed: uxStats.stats?.conversationsAnalyzed || 0
    });
    
    res.json({
      stats: uxStats.stats || {},
      recommendations: uxReport.recommendations || [],
      environment: uxStats.environment,
      metadata: {
        generated_at: new Date(),
        limit
      }
    });
    
  } catch (error) {
    console.log('[REAL_CONVERSATIONS_ERROR]', error.message);
    
    res.status(500).json({
      error: 'real_conversations_error',
      message: 'Failed to get real conversations',
      details: error.message
    });
  }
});

// GET /api/debug/real-closing - Closing réel
router.get('/real-closing', async (req, res) => {
  try {
    console.log('[REAL_CLOSING_REQUESTED]');
    
    if (!getFlag('AGENT_REAL_VALIDATION_MODE') && !getFlag('AGENT_TEST_MODE')) {
      return res.status(403).json({
        error: 'validation_mode_disabled',
        message: 'Real closing only available in validation or test mode'
      });
    }
    
    const closingStats = getClosingControllerStats();
    const closingReport = getClosingReport();
    
    console.log('[REAL_CLOSING_GENERATED]', {
      closingAttempts: closingStats.stats?.closingAttempts || 0,
      successRate: closingStats.stats?.successRate || 0
    });
    
    res.json({
      stats: closingStats.stats || {},
      patterns: closingReport.patterns || {},
      recommendations: closingReport.recommendations || [],
      environment: closingStats.environment,
      metadata: {
        generated_at: new Date()
      }
    });
    
  } catch (error) {
    console.log('[REAL_CLOSING_ERROR]', error.message);
    
    res.status(500).json({
      error: 'real_closing_error',
      message: 'Failed to get real closing',
      details: error.message
    });
  }
});

// GET /api/debug/real-friction - Friction réelle
router.get('/real-friction', async (req, res) => {
  try {
    console.log('[REAL_FRICTION_REQUESTED]');
    
    if (!getFlag('AGENT_REAL_VALIDATION_MODE') && !getFlag('AGENT_TEST_MODE')) {
      return res.status(403).json({
        error: 'validation_mode_disabled',
        message: 'Real friction only available in validation or test mode'
      });
    }
    
    const frictionStats = getFrictionDetectorStats();
    const frictionReport = getFrictionReport();
    
    console.log('[REAL_FRICTION_GENERATED]', {
      frictionPoints: frictionStats.stats?.frictionPoints || 0,
      totalDetections: frictionStats.stats?.totalDetections || 0
    });
    
    res.json({
      stats: frictionStats.stats || {},
      patterns: frictionReport.patterns || {},
      recommendations: frictionReport.recommendations || [],
      environment: frictionStats.environment,
      metadata: {
        generated_at: new Date()
      }
    });
    
  } catch (error) {
    console.log('[REAL_FRICTION_ERROR]', error.message);
    
    res.status(500).json({
      error: 'real_friction_error',
      message: 'Failed to get real friction',
      details: error.message
    });
  }
});

// GET /api/debug/real-whatsapp - WhatsApp réel
router.get('/real-whatsapp', async (req, res) => {
  try {
    console.log('[REAL_WHATSAPP_REQUESTED]');
    
    if (!getFlag('AGENT_REAL_VALIDATION_MODE') && !getFlag('AGENT_TEST_MODE')) {
      return res.status(403).json({
        error: 'validation_mode_disabled',
        message: 'Real WhatsApp only available in validation or test mode'
      });
    }
    
    const whatsappStats = getWhatsAppWrapperStats();
    
    console.log('[REAL_WHATSAPP_GENERATED]', {
      successfulSends: whatsappStats.stats?.successfulSends || 0,
      successRate: whatsappStats.stats?.successRate || 0
    });
    
    res.json({
      stats: whatsappStats.stats || {},
      byType: whatsappStats.byType || {},
      environment: whatsappStats.environment,
      metadata: {
        generated_at: new Date()
      }
    });
    
  } catch (error) {
    console.log('[REAL_WHATSAPP_ERROR]', error.message);
    
    res.status(500).json({
      error: 'real_whatsapp_error',
      message: 'Failed to get real WhatsApp',
      details: error.message
    });
  }
});

// Fonction pour générer des recommandations
function generateRealValidationRecommendations(globalMetrics, moduleStats) {
  const recommendations = [];
  
  // Recommandations basées sur les métriques globales
  if (globalMetrics.realLeads === 0) {
    recommendations.push({
      type: 'critical',
      message: 'No real leads processed yet',
      action: 'Enable real validation mode and test with real WhatsApp users',
      priority: 'high'
    });
  }
  
  if (globalMetrics.engaged === 0 && globalMetrics.realLeads > 0) {
    recommendations.push({
      type: 'warning',
      message: 'No user engagement detected',
      action: 'Review initial message content and timing',
      priority: 'high'
    });
  }
  
  if (globalMetrics.avgResponseTime > 300000) { // > 5 minutes
    recommendations.push({
      type: 'warning',
      message: `Slow average response time (${Math.round(globalMetrics.avgResponseTime / 1000 / 60)} minutes)`,
      action: 'Optimize response times or implement automated responses',
      priority: 'medium'
    });
  }
  
  if (globalMetrics.frictionPoints > globalMetrics.realLeads * 0.5) {
    recommendations.push({
      type: 'warning',
      message: 'High friction points ratio detected',
      action: 'Review conversation flow and identify friction sources',
      priority: 'medium'
    });
  }
  
  if (globalMetrics.closingAttempts === 0 && globalMetrics.engaged > 0) {
    recommendations.push({
      type: 'info',
      message: 'No closing attempts despite engagement',
      action: 'Implement closing triggers for engaged users',
      priority: 'medium'
    });
  }
  
  // Recommandations basées sur les stats des modules
  if (moduleStats.whatsappStats.stats?.successRate < 80) {
    recommendations.push({
      type: 'warning',
      message: 'Low WhatsApp success rate',
      action: 'Check WhatsApp API configuration and message content',
      priority: 'high'
    });
  }
  
  if (moduleStats.frictionStats.stats?.totalDetections > 0) {
    recommendations.push({
      type: 'info',
      message: 'Friction points detected',
      action: 'Analyze friction patterns and optimize conversation flow',
      priority: 'medium'
    });
  }
  
  if (moduleStats.closingStats.stats?.successRate < 50) {
    recommendations.push({
      type: 'warning',
      message: 'Low closing success rate',
      action: 'Review closing criteria and improve lead qualification',
      priority: 'high'
    });
  }
  
  // Recommandation générale si tout va bien
  if (recommendations.length === 0) {
    recommendations.push({
      type: 'success',
      message: 'Real validation looks good',
      action: 'Continue monitoring and gradually increase real user testing',
      priority: 'low'
    });
  }
  
  return recommendations;
}

module.exports = router;
