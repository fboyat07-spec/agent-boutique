// ACTION 6 - Monitoring conversion (endpoint stats)

const { getMemoryStats } = require('../services/leadMemory');
const { getDynamicScoringStats } = require('../services/dynamicScoring');
const { getIntelligentFollowUpStats } = require('../services/followUpSafe');
const { getPaymentStats } = require('../services/stripePaymentSafe');
const { getProtectionStats } = require('../services/finalStatusProtection');

// GET /api/agent/stats
async function getAgentStats(req, res) {
  try {
    // Vérifier flag monitoring
    if (process.env.AGENT_MONITORING_ENABLED !== 'true') {
      return res.status(403).json({
        error: 'Monitoring disabled',
        message: 'Set AGENT_MONITORING_ENABLED=true to enable'
      });
    }
    
    // Récupérer stats de tous les modules
    const memoryStats = getMemoryStats();
    const scoringStats = getDynamicScoringStats();
    const followUpStats = getIntelligentFollowUpStats();
    const paymentStats = getPaymentStats();
    const protectionStats = getProtectionStats();
    
    // ACTION 9 - Stats avancées supplémentaires
    const { getRegulatorStats } = require('../services/agentRegulator');
    const { getQueueStats } = require('../services/executionQueue');
    const { getRouterStats } = require('../services/agentRouter');
    const { getOrchestratorStats } = require('../services/aiOrchestrator');
    const { getConversationMemoryStats } = require('../services/conversationMemory');
    const { getDegradedModeStats } = require('../services/degradedMode');
    const { checkAllServicesHealth } = require('../services/degradedMode');
    
    const regulatorStats = getRegulatorStats();
    const queueStats = getQueueStats();
    const routerStats = getRouterStats();
    const orchestratorStats = getOrchestratorStats();
    const conversationStats = getConversationMemoryStats();
    const degradedStats = getDegradedModeStats();
    const servicesHealth = await checkAllServicesHealth();
    
    // Calculer stats de conversion
    const totalLeads = memoryStats.totalLeads || 0;
    const contacted = (memoryStats.byStatus?.ENGAGED || 0) + (memoryStats.byStatus?.INTERESTED || 0);
    const engaged = memoryStats.byStatus?.INTERESTED || 0;
    const closing = memoryStats.byStatus?.CLOSING || 0;
    const paymentSent = memoryStats.byStatus?.PAYMENT_SENT || 0;
    const won = memoryStats.byStatus?.WON || 0;
    const lost = memoryStats.byStatus?.LOST || 0;
    
    // Taux de conversion
    const conversionRate = totalLeads > 0 ? (won / totalLeads) : 0;
    const engagementRate = totalLeads > 0 ? (engaged / totalLeads) : 0;
    const closingRate = engaged > 0 ? (closing / engaged) : 0;
    const paymentRate = paymentSent > 0 ? (won / paymentSent) : 0;
    
    // ACTION 9 - Calculer métriques avancées
    const actionsPerHour = regulatorStats.metrics.actionsPerMinute * 60;
    const errorRate = regulatorStats.metrics.total > 0 ? (regulatorStats.metrics.errorsPerMinute / regulatorStats.metrics.actionsPerMinute) * 100 : 0;
    const avgResponseTime = queueStats.stats.avgWaitTime || 0;
    const revenueGenerated = won * 97; // Exemple: €97 par conversion
    
    // Stats combinées
    const stats = {
      // Stats principales
      totalLeads,
      contacted,
      engaged,
      closing,
      paymentSent,
      won,
      lost,
      
      // Taux de conversion
      conversionRate: Math.round(conversionRate * 100) / 100,
      engagementRate: Math.round(engagementRate * 100) / 100,
      closingRate: Math.round(closingRate * 100) / 100,
      paymentRate: Math.round(paymentRate * 100) / 100,
      
      // Distribution par statut
      statusDistribution: memoryStats.byStatus || {},
      
      // Stats scoring
      scoring: {
        averageScore: Math.round(scoringStats.averageScore * 100) / 100,
        highScoreLeads: scoringStats.highScoreLeads,
        mediumScoreLeads: scoringStats.mediumScoreLeads,
        lowScoreLeads: scoringStats.lowScoreLeads,
        scoreDistribution: scoringStats.scoreDistribution
      },
      
      // Stats follow-up
      followUp: {
        withFollowUp: followUpStats.withFollowUp,
        followUpCounts: followUpStats.followUpCounts,
        byStatus: followUpStats.byStatus
      },
      
      // Stats paiement
      payment: {
        paymentSent,
        won,
        conversionRate: Math.round(paymentStats.conversionRate * 100) / 100
      },
      
      // Stats protection
      protection: {
        finalStatusLeads: protectionStats.finalStatusLeads,
        activeLeads: protectionStats.activeLeads,
        isValid: protectionStats.isValid
      },
      
      // ACTION 9 - Monitoring avancé
      performance: {
        actionsPerHour: Math.round(actionsPerHour * 100) / 100,
        errorRate: Math.round(errorRate * 100) / 100,
        avgResponseTime: Math.round(avgResponseTime),
        queueSize: queueStats.queueSize,
        queueSuccessRate: Math.round(queueStats.successRate * 100) / 100,
        queueErrorRate: Math.round(queueStats.errorRate * 100) / 100
      },
      
      // Multi-agent et régulation
      multiAgent: {
        enabled: routerStats.enabled,
        tasksProcessed: routerStats.taskStats?.total || 0,
        tasksByAgent: routerStats.taskStats?.byAgent || {},
        taskErrorRate: routerStats.taskStats?.total > 0 ? (routerStats.taskStats.errors / routerStats.taskStats.total) * 100 : 0
      },
      
      regulation: {
        enabled: regulatorStats.enabled,
        currentStatus: regulatorStats.status,
        actionsPerMinute: regulatorStats.metrics.actionsPerMinute,
        errorsPerMinute: regulatorStats.metrics.errorsPerMinute,
        throttled: regulatorStats.status.throttled,
        paused: regulatorStats.status.paused
      },
      
      // IA et conversation
      ai: {
        advancedEnabled: orchestratorStats.enabled,
        enhancementRate: Math.round(orchestratorStats.enhancementRate * 100) / 100,
        fallbackRate: Math.round(orchestratorStats.fallbackRate * 100) / 100,
        aiErrorRate: Math.round(orchestratorStats.errorRate * 100) / 100
      },
      
      conversation: {
        totalConversations: conversationStats.totalConversations,
        totalMessages: conversationStats.totalMessages,
        avgMessagesPerConversation: Math.round(conversationStats.avgMessagesPerConversation * 100) / 100,
        memoryUsageKB: Math.round(conversationStats.memoryUsage / 1024)
      },
      
      // Services et mode dégradé
      services: {
        whatsapp: servicesHealth.whatsapp,
        stripe: servicesHealth.stripe,
        ai: servicesHealth.ai,
        global: servicesHealth.global
      },
      
      degradedMode: {
        status: degradedStats.status.global,
        fallbacksActive: Object.values(degradedStats.fallbacks).filter(f => f).length,
        lastChecks: degradedStats.lastChecks
      },
      
      // Business metrics
      business: {
        revenueGenerated: Math.round(revenueGenerated * 100) / 100,
        avgRevenuePerLead: won > 0 ? Math.round((revenueGenerated / won) * 100) / 100 : 0,
        conversionValue: Math.round(conversionRate * revenueGenerated * 100) / 100
      },
      
      // Méta-données
      metadata: {
        generatedAt: new Date().toISOString(),
        uptime: process.uptime(),
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || 'development',
        memoryUsage: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
        }
      }
    };
    
    console.log('[AGENT_STATS_GENERATED]', {
      totalLeads: stats.totalLeads,
      conversionRate: stats.conversionRate,
      won: stats.won,
      revenueGenerated: stats.business.revenueGenerated,
      actionsPerHour: stats.performance.actionsPerHour,
      errorRate: stats.performance.errorRate
    });
    
    res.json(stats);
    
  } catch (error) {
    console.log('[AGENT_STATS_ERROR]', error.message);
    res.status(500).json({
      error: 'Failed to generate stats',
      message: error.message
    });
  }
}

// GET /api/agent/health (health check simple)
function getAgentHealth(req, res) {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
      },
      leads: {
        total: global.leadMemory ? global.leadMemory.size : 0
      },
      environment: process.env.NODE_ENV || 'development'
    };
    
    res.json(health);
    
  } catch (error) {
    console.log('[AGENT_HEALTH_ERROR]', error.message);
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
}

// GET /api/agent/config (configuration actuelle)
function getAgentConfig(req, res) {
  try {
    const config = {
      // Flags principaux
      flags: {
        AGENT_OUTBOUND_ENABLED: process.env.AGENT_OUTBOUND_ENABLED === 'true',
        AGENT_MONITORING_ENABLED: process.env.AGENT_MONITORING_ENABLED === 'true',
        FOLLOWUP_ENABLED: process.env.FOLLOWUP_ENABLED === 'true',
        STRIPE_WEBHOOK_ENABLED: process.env.STRIPE_WEBHOOK_ENABLED === 'true',
        AI_ENABLED: process.env.AI_ENABLED === 'true'
      },
      
      // Limites
      limits: {
        AGENT_MAX_PER_RUN: parseInt(process.env.AGENT_MAX_PER_RUN) || 3,
        AGENT_COOLDOWN_HOURS: parseInt(process.env.AGENT_COOLDOWN_HOURS) || 24,
        AGENT_DAILY_ACTION_LIMIT: parseInt(process.env.AGENT_DAILY_ACTION_LIMIT) || 100,
        AGENT_RUN_ACTION_LIMIT: parseInt(process.env.AGENT_RUN_ACTION_LIMIT) || 10
      },
      
      // Timing
      timing: {
        AGENT_FOLLOW_UP_DELAY: parseInt(process.env.AGENT_FOLLOW_UP_DELAY) || 3600000,
        AGENT_FOLLOW_UP_INTERVAL: parseInt(process.env.AGENT_FOLLOW_UP_INTERVAL) || 86400000
      },
      
      // Services actifs
      services: {
        leadMemory: !!global.leadMemory,
        messageTracker: !!global.messageTracker,
        actionCounters: !!global.actionCounters
      }
    };
    
    res.json(config);
    
  } catch (error) {
    console.log('[AGENT_CONFIG_ERROR]', error.message);
    res.status(500).json({
      error: 'Failed to get config',
      message: error.message
    });
  }
}

const router = require('express').Router();

// GET /api/agent/stats
router.get('/stats', getAgentStats);

// GET /api/agent/health
router.get('/health', getAgentHealth);

// GET /api/agent/config
router.get('/config', getAgentConfig);

module.exports = router;
