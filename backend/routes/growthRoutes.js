// ACTION 9 - Dashboard Growth

const express = require('express');
const { analyzeConversion } = require('../services/growthEngine');
const { getVariantStats, getAllTests } = require('../services/messageVariants');
const { getEnhancerStats } = require('../services/closingEnhancer');
const { getScoringStats, getTopBoostedLeads } = require('../services/predictiveScore');
const { detectHotLeads, getPrioritizedHotLeads } = require('../services/hotLeadDetector');
const { getGeneratorStats } = require('../services/autoLeadGenerator');
const { getOptimizerStats, getOptimizerSuggestions } = require('../services/continuousOptimizer');
const { optionalAuthenticate } = require('../middleware/tenantAuth');

const router = express.Router();

// GET /api/growth/insights?tenant_id= - Insights growth complètes
router.get('/insights', optionalAuthenticate, async (req, res) => {
  try {
    const { tenant_id } = req.query;
    
    console.log('[GROWTH_INSIGHTS_REQUESTED]', { tenant_id });
    
    if (!tenant_id) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'tenant_id parameter required'
      });
    }
    
    // Collecter toutes les données growth
    const insights = await this.collectGrowthInsights(tenant_id);
    
    console.log('[GROWTH_INSIGHTS_GENERATED]', {
      tenant_id,
      modules: Object.keys(insights).length
    });
    
    res.json({
      tenant_id,
      insights,
      metadata: {
        generated_at: new Date(),
        insights_version: 'v1.0'
      }
    });
    
  } catch (error) {
    console.log('[GROWTH_INSIGHTS_ERROR]', error.message);
    
    res.status(500).json({
      error: 'insights_error',
      message: 'Failed to get growth insights',
      details: error.message
    });
  }
});

// GET /api/growth/ab-tests - Stats A/B tests globaux
router.get('/ab-tests', optionalAuthenticate, async (req, res) => {
  try {
    console.log('[GROWTH_AB_TESTS_REQUESTED]');
    
    const variantStats = getVariantStats();
    const allTests = getAllTests();
    
    // Calculer le meilleur variant
    let bestVariant = null;
    let bestScore = -1;
    
    for (const test of allTests) {
      if (test.winner) {
        const testResults = variantStats.tests;
        const variantStats = testResults[test.testId];
        
        if (variantStats && variantStats[test.winner]) {
          const score = variantStats[test.winner].replyRate + (variantStats[test.winner].conversionRate * 2);
          
          if (score > bestScore) {
            bestScore = score;
            bestVariant = {
              testId: test.testId,
              variant: test.winner,
              score: score
            };
          }
        }
      }
    }
    
    console.log('[GROWTH_AB_TESTS_GENERATED]', {
      totalTests: allTests.length,
      withWinner: allTests.filter(t => t.winner).length,
      bestVariant: bestVariant?.testId
    });
    
    res.json({
      tests: allTests,
      stats: variantStats,
      bestVariant,
      metadata: {
        generated_at: new Date()
      }
    });
    
  } catch (error) {
    console.log('[GROWTH_AB_TESTS_ERROR]', error.message);
    
    res.status(500).json({
      error: 'ab_tests_error',
      message: 'Failed to get A/B test stats',
      details: error.message
    });
  }
});

// GET /api/growth/leads-boosted?tenant_id=&limit= - Leads avec meilleur boost prédictif
router.get('/leads-boosted', optionalAuthenticate, async (req, res) => {
  try {
    const { tenant_id, limit = 10 } = req.query;
    
    console.log('[GROWTH_BOOSTED_LEADS_REQUESTED]', { tenant_id, limit });
    
    if (!tenant_id) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'tenant_id parameter required'
      });
    }
    
    const topBoostedLeads = getTopBoostedLeads(tenant_id, parseInt(limit));
    
    if (!topBoostedLeads.enabled) {
      return res.status(400).json({
        error: 'not_available',
        message: topBoostedLeads.reason || 'Predictive scoring disabled'
      });
    }
    
    console.log('[GROWTH_BOOSTED_LEADS_GENERATED]', {
      tenant_id,
      totalLeads: topBoostedLeads.totalLeads,
      topBoosted: topBoostedLeads.topBoosted.length
    });
    
    res.json({
      tenant_id,
      leads: topBoostedLeads.topBoosted,
      metadata: {
        totalLeads: topBoostedLeads.totalLeads,
        avgBoost: topBoostedLeads.metadata.avgBoost,
        generated_at: new Date()
      }
    });
    
  } catch (error) {
    console.log('[GROWTH_BOOSTED_LEADS_ERROR]', error.message);
    
    res.status(500).json({
      error: 'boosted_leads_error',
      message: 'Failed to get boosted leads',
      details: error.message
    });
  }
});

// GET /api/growth/hot-leads?tenant_id=&limit= - Leads chauds priorisés
router.get('/hot-leads', optionalAuthenticate, async (req, res) => {
  try {
    const { tenant_id, limit = 10 } = req.query;
    
    console.log('[GROWTH_HOT_LEADS_REQUESTED]', { tenant_id, limit });
    
    if (!tenant_id) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'tenant_id parameter required'
      });
    }
    
    const prioritizedHotLeads = getPrioritizedHotLeads(tenant_id, parseInt(limit));
    
    if (!prioritizedHotLeads.enabled) {
      return res.status(400).json({
        error: 'not_available',
        message: prioritizedHotLeads.reason || 'Hot lead detection disabled'
      });
    }
    
    console.log('[GROWTH_HOT_LEADS_GENERATED]', {
      tenant_id,
      totalLeads: prioritizedHotLeads.totalLeads,
      hotLeadsFound: prioritizedHotLeads.hotLeadsFound
    });
    
    res.json({
      tenant_id,
      hotLeads: prioritizedHotLeads.prioritizedLeads,
      recommendations: prioritizedHotLeads.recommendations,
      metadata: {
        totalLeads: prioritizedHotLeads.totalLeads,
        hotLeadsFound: prioritizedHotLeads.hotLeadsFound,
        generated_at: new Date()
      }
    });
    
  } catch (error) {
    console.log('[GROWTH_HOT_LEADS_ERROR]', error.message);
    
    res.status(500).json({
      error: 'hot_leads_error',
      message: 'Failed to get hot leads',
      details: error.message
    });
  }
});

// GET /api/growth/conversion-analysis?tenant_id= - Analyse conversion détaillée
router.get('/conversion-analysis', optionalAuthenticate, async (req, res) => {
  try {
    const { tenant_id } = req.query;
    
    console.log('[GROWTH_CONVERSION_ANALYSIS_REQUESTED]', { tenant_id });
    
    if (!tenant_id) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'tenant_id parameter required'
      });
    }
    
    const conversionAnalysis = await analyzeConversion(tenant_id);
    
    if (conversionAnalysis.error) {
      return res.status(500).json({
        error: 'conversion_analysis_error',
        message: 'Failed to analyze conversion',
        details: conversionAnalysis.error
      });
    }
    
    console.log('[GROWTH_CONVERSION_ANALYSIS_GENERATED]', {
      tenant_id,
      suggestions: conversionAnalysis.suggestions.length
    });
    
    res.json({
      tenant_id,
      analysis: conversionAnalysis,
      metadata: {
        generated_at: new Date()
      }
    });
    
  } catch (error) {
    console.log('[GROWTH_CONVERSION_ANALYSIS_ERROR]', error.message);
    
    res.status(500).json({
      error: 'conversion_analysis_error',
      message: 'Failed to analyze conversion',
      details: error.message
    });
  }
});

// GET /api/growth/lead-generation - Stats génération leads
router.get('/lead-generation', optionalAuthenticate, async (req, res) => {
  try {
    console.log('[GROWTH_LEAD_GENERATION_REQUESTED]');
    
    const generatorStats = getGeneratorStats();
    
    console.log('[GROWTH_LEAD_GENERATION_GENERATED]', {
      enabled: generatorStats.enabled,
      totalGenerated: generatorStats.stats.totalGenerated
    });
    
    res.json({
      generator: generatorStats,
      metadata: {
        generated_at: new Date()
      }
    });
    
  } catch (error) {
    console.log('[GROWTH_LEAD_GENERATION_ERROR]', error.message);
    
    res.status(500).json({
      error: 'lead_generation_error',
      message: 'Failed to get lead generation stats',
      details: error.message
    });
  }
});

// GET /api/growth/optimizer-status - Statut optimiseur continue
router.get('/optimizer-status', optionalAuthenticate, async (req, res) => {
  try {
    console.log('[GROWTH_OPTIMIZER_STATUS_REQUESTED]');
    
    const optimizerStats = getOptimizerStats();
    const optimizerSuggestions = getOptimizerSuggestions('pending');
    
    console.log('[GROWTH_OPTIMIZER_STATUS_GENERATED]', {
      running: optimizerStats.running,
      totalOptimizations: optimizerStats.stats.totalOptimizations,
      pendingSuggestions: optimizerSuggestions.length
    });
    
    res.json({
      optimizer: optimizerStats,
      pendingSuggestions: optimizerSuggestions.slice(0, 10), // Top 10
      metadata: {
        generated_at: new Date()
      }
    });
    
  } catch (error) {
    console.log('[GROWTH_OPTIMIZER_STATUS_ERROR]', error.message);
    
    res.status(500).json({
      error: 'optimizer_status_error',
      message: 'Failed to get optimizer status',
      details: error.message
    });
  }
});

// GET /api/growth/performance-matrix - Matrice performance globale
router.get('/performance-matrix', optionalAuthenticate, async (req, res) => {
  try {
    console.log('[GROWTH_PERFORMANCE_MATRIX_REQUESTED]');
    
    // Collecter les stats de tous les modules
    const matrix = {
      leadGeneration: getGeneratorStats(),
      predictiveScoring: getScoringStats(),
      hotLeadDetection: getDetectorStats(),
      messageVariants: getVariantStats(),
      closingEnhancement: getEnhancerStats(),
      continuousOptimizer: getOptimizerStats()
    };
    
    // Calculer des métriques globales
    const globalMetrics = this.calculateGlobalMetrics(matrix);
    
    // Calculer un score de performance global
    const performanceScore = this.calculatePerformanceScore(matrix);
    
    console.log('[GROWTH_PERFORMANCE_MATRIX_GENERATED]', {
      modules: Object.keys(matrix).length,
      performanceScore
    });
    
    res.json({
      modules: matrix,
      globalMetrics,
      performanceScore,
      metadata: {
        generated_at: new Date(),
        matrix_version: 'v1.0'
      }
    });
    
  } catch (error) {
    console.log('[GROWTH_PERFORMANCE_MATRIX_ERROR]', error.message);
    
    res.status(500).json({
      error: 'performance_matrix_error',
      message: 'Failed to get performance matrix',
      details: error.message
    });
  }
});

// POST /api/growth/optimize-manual - Déclencher optimisation manuelle
router.post('/optimize-manual', optionalAuthenticate, async (req, res) => {
  try {
    const { runManualOptimization } = require('../services/continuousOptimizer');
    
    console.log('[GROWTH_OPTIMIZE_MANUAL_REQUESTED]');
    
    const result = await runManualOptimization();
    
    if (!result.success) {
      return res.status(400).json({
        error: 'optimization_failed',
        message: 'Failed to run manual optimization',
        details: result.reason || result.error
      });
    }
    
    console.log('[GROWTH_OPTIMIZE_MANUAL_COMPLETED]', {
      lastOptimization: result.lastOptimization
    });
    
    res.json({
      success: true,
      message: 'Manual optimization completed successfully',
      result,
      metadata: {
        optimized_at: new Date()
      }
    });
    
  } catch (error) {
    console.log('[GROWTH_OPTIMIZE_MANUAL_ERROR]', error.message);
    
    res.status(500).json({
      error: 'optimize_manual_error',
      message: 'Failed to run manual optimization',
      details: error.message
    });
  }
});

// GET /api/growth/health - Health check growth
router.get('/health', optionalAuthenticate, async (req, res) => {
  try {
    console.log('[GROWTH_HEALTH_CHECK_REQUESTED]');
    
    // Health checks de tous les modules
    const healthChecks = {
      leadGenerator: getGeneratorStats(),
      predictiveScore: getScoringStats(),
      hotLeadDetector: getDetectorStats(),
      messageVariants: getVariantStats(),
      closingEnhancer: getEnhancerStats(),
      continuousOptimizer: getOptimizerStats()
    };
    
    // Calculer le statut global
    const globalHealth = this.calculateGlobalHealth(healthChecks);
    
    console.log('[GROWTH_HEALTH_CHECK_GENERATED]', {
      status: globalHealth.status,
      modules: Object.keys(healthChecks).length
    });
    
    res.json({
      growth: globalHealth,
      modules: healthChecks,
      metadata: {
        checked_at: new Date()
      }
    });
    
  } catch (error) {
    console.log('[GROWTH_HEALTH_CHECK_ERROR]', error.message);
    
    res.status(500).json({
      error: 'health_check_error',
      message: 'Failed to perform health check',
      details: error.message
    });
  }
});

// Fonctions utilitaires pour le dashboard
async function collectGrowthInsights(tenant_id) {
  const insights = {};
  
  try {
    // Conversion analysis
    insights.conversion = await analyzeConversion(tenant_id);
  } catch (error) {
    insights.conversion = { error: error.message };
  }
  
  try {
    // Hot leads
    insights.hotLeads = getPrioritizedHotLeads(tenant_id, 5);
  } catch (error) {
    insights.hotLeads = { error: error.message };
  }
  
  try {
    // Boosted leads
    insights.boostedLeads = getTopBoostedLeads(tenant_id, 5);
  } catch (error) {
    insights.boostedLeads = { error: error.message };
  }
  
  try {
    // A/B tests
    insights.abTests = getAllTests();
  } catch (error) {
    insights.abTests = { error: error.message };
  }
  
  try {
    // Optimizer suggestions
    insights.suggestions = getOptimizerSuggestions('pending').slice(0, 5);
  } catch (error) {
    insights.suggestions = { error: error.message };
  }
  
  return insights;
}

function calculateGlobalMetrics(matrix) {
  const metrics = {
    totalLeadsGenerated: matrix.leadGeneration.stats.totalGenerated,
    totalPredictiveBoosts: matrix.predictiveScoring.stats.totalBoosts,
    totalHotLeads: matrix.hotLeadDetector.stats.hotLeadsFound,
    totalMessageEnhancements: matrix.closingEnhancement.stats.successfulEnhancements,
    totalOptimizations: matrix.continuousOptimizer.stats.totalOptimizations,
    avgConversionRate: 0,
    avgEngagementRate: 0,
    overallPerformance: 0
  };
  
  // Calculer les moyennes
  const conversionRate = matrix.messageVariants.performance.avgConversionRate || 0;
  const replyRate = matrix.messageVariants.performance.avgReplyRate || 0;
  
  metrics.avgConversionRate = conversionRate;
  metrics.avgEngagementRate = replyRate;
  
  // Score de performance global (0-100)
  let score = 0;
  let factors = 0;
  
  if (matrix.leadGeneration.enabled) {
    score += metrics.totalLeadsGenerated > 0 ? 20 : 0;
    factors++;
  }
  
  if (matrix.predictiveScoring.enabled) {
    score += metrics.totalPredictiveBoosts > 0 ? 20 : 0;
    factors++;
  }
  
  if (matrix.hotLeadDetector.enabled) {
    score += metrics.totalHotLeads > 0 ? 20 : 0;
    factors++;
  }
  
  if (matrix.messageVariants.enabled) {
    score += metrics.avgConversionRate > 0 ? 20 : 0;
    factors++;
  }
  
  if (matrix.closingEnhancement.enabled) {
    score += metrics.totalMessageEnhancements > 0 ? 20 : 0;
    factors++;
  }
  
  metrics.overallPerformance = factors > 0 ? (score / factors) * 100 : 0;
  
  return metrics;
}

function calculatePerformanceScore(matrix) {
  let score = 0;
  let maxScore = 0;
  
  // Score par module
  const moduleScores = {};
  
  for (const [moduleName, stats] of Object.entries(matrix)) {
    let moduleScore = 0;
    let moduleMax = 0;
    
    if (stats.enabled) {
      moduleMax = 100;
      
      // Calculer le score du module
      switch (moduleName) {
        case 'leadGenerator':
          moduleScore = stats.stats.totalGenerated > 0 ? 80 : 20;
          break;
        case 'predictiveScoring':
          moduleScore = stats.stats.avgBoost > 10 ? 80 : 40;
          break;
        case 'hotLeadDetector':
          moduleScore = stats.stats.hotLeadsFound > 0 ? 80 : 20;
          break;
        case 'messageVariants':
          moduleScore = stats.performance.avgReplyRate > 10 ? 80 : 40;
          break;
        case 'closingEnhancer':
          moduleScore = stats.stats.successRate > 70 ? 80 : 40;
          break;
        case 'continuousOptimizer':
          moduleScore = stats.running ? 80 : 20;
          break;
        default:
          moduleScore = 50;
      }
    } else {
      moduleMax = 0;
      moduleScore = 0;
    }
    
    moduleScores[moduleName] = {
      score: moduleScore,
      maxScore: moduleMax,
      enabled: stats.enabled
    };
    
    score += moduleScore;
    maxScore += moduleMax;
  }
  
  return {
    overall: maxScore > 0 ? (score / maxScore) * 100 : 0,
    modules: moduleScores
  };
}

function calculateGlobalHealth(healthChecks) {
  let healthyModules = 0;
  let totalModules = Object.keys(healthChecks).length;
  let issues = [];
  
  for (const [moduleName, health] of Object.entries(healthChecks)) {
    // Simplifier le health check
    if (health.enabled && health.stats) {
      const errorRate = health.stats.errors > 0 ? 
        (health.stats.errors / (health.stats.totalGenerated || health.stats.totalEnhancements || 1)) * 100 : 0;
      
      if (errorRate < 10) {
        healthyModules++;
      } else {
        issues.push(`${moduleName}: High error rate`);
      }
    } else if (!health.enabled) {
      // Module désactivé = pas de problème
      healthyModules++;
    }
  }
  
  const healthRatio = totalModules > 0 ? (healthyModules / totalModules) * 100 : 0;
  
  let status = 'healthy';
  if (healthRatio < 70) {
    status = 'critical';
  } else if (healthRatio < 90) {
    status = 'warning';
  }
  
  return {
    status,
    healthyModules,
    totalModules,
    healthRatio: Math.round(healthRatio * 100) / 100,
    issues
  };
}

module.exports = router;
