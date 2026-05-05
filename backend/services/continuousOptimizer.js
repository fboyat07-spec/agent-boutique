// ACTION 8 - Pipeline optimisation continue

const { analyzeConversion } = require('./growthEngine');
const { getVariantStats } = require('./messageVariants');
const { getEnhancerStats } = require('./closingEnhancer');
const { getScoringStats } = require('./predictiveScore');
const { getDetectorStats } = require('./hotLeadDetector');
const { getGeneratorStats } = require('./autoLeadGenerator');
const BusinessLogger = require('./businessLogger');

// Pipeline d'optimisation continue (SAFE - suggestions uniquement)
class ContinuousOptimizer {
  constructor() {
    this.enabled = process.env.CONTINUOUS_OPTIMIZER_ENABLED === 'true';
    this.frequency = parseInt(process.env.OPTIMIZER_FREQUENCY_HOURS) || 24; // heures
    this.suggestions = new Map(); // tenant_id -> suggestions
    this.maxSuggestions = 20;
    this.stats = {
      totalOptimizations: 0,
      totalSuggestions: 0,
      appliedSuggestions: 0,
      errors: 0,
      lastOptimization: null
    };
    
    this.intervalId = null;
    this.isRunning = false;
    
    console.log('[CONTINUOUS_OPTIMIZER_INITIALIZED]', {
      enabled: this.enabled,
      frequency: this.frequency,
      maxSuggestions: this.maxSuggestions
    });
    
    // Démarrer automatiquement si activé
    if (this.enabled) {
      this.start();
    }
  }
  
  // Démarrer l'optimiseur
  start() {
    if (!this.enabled) {
      console.log('[CONTINUOUS_OPTIMIZER_START_DISABLED]');
      return false;
    }
    
    if (this.isRunning) {
      console.log('[CONTINUOUS_OPTIMIZER_ALREADY_RUNNING]');
      return false;
    }
    
    const frequencyMs = this.frequency * 60 * 60 * 1000; // Convertir en ms
    
    this.intervalId = setInterval(() => {
      this.runOptimizationCycle();
    }, frequencyMs);
    
    this.isRunning = true;
    
    console.log('[CONTINUOUS_OPTIMIZER_STARTED]', {
      frequency: this.frequency,
      nextRun: new Date(Date.now() + frequencyMs)
    });
    
    BusinessLogger.logSystemEvent('continuous_optimizer_started', null, {
      frequency: this.frequency
    });
    
    return true;
  }
  
  // Arrêter l'optimiseur
  stop() {
    if (!this.isRunning) {
      console.log('[CONTINUOUS_OPTIMIZER_ALREADY_STOPPED]');
      return false;
    }
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    this.isRunning = false;
    
    console.log('[CONTINUOUS_OPTIMIZER_STOPPED]');
    
    BusinessLogger.logSystemEvent('continuous_optimizer_stopped', null, {
      totalOptimizations: this.stats.totalOptimizations,
      totalSuggestions: this.stats.totalSuggestions
    });
    
    return true;
  }
  
  // Cycle d'optimisation principal
  async runOptimizationCycle() {
    if (!this.enabled || !this.isRunning) {
      return;
    }
    
    const cycleId = `opt_cycle_${Date.now()}`;
    const startTime = Date.now();
    
    console.log('[CONTINUOUS_OPTIMIZATION_CYCLE_STARTED]', {
      cycleId,
      timestamp: new Date()
    });
    
    try {
      this.stats.totalOptimizations++;
      this.stats.lastOptimization = new Date();
      
      // Collecter les stats de tous les modules
      const moduleStats = await this.collectModuleStats();
      
      // Analyser les tendances et patterns
      const analysis = this.analyzeTrends(moduleStats);
      
      // Générer des suggestions d'optimisation
      const suggestions = this.generateOptimizationSuggestions(analysis);
      
      // Stocker les suggestions
      this.storeSuggestions(suggestions);
      
      const duration = Date.now() - startTime;
      
      console.log('[CONTINUOUS_OPTIMIZATION_CYCLE_COMPLETED]', {
        cycleId,
        duration,
        suggestionsGenerated: suggestions.length
      });
      
      BusinessLogger.logSystemEvent('optimization_cycle_completed', null, {
        cycleId,
        duration,
        suggestionsGenerated: suggestions.length
      });
      
    } catch (error) {
      this.stats.errors++;
      
      console.log('[CONTINUOUS_OPTIMIZATION_CYCLE_ERROR]', {
        cycleId,
        error: error.message
      });
      
      BusinessLogger.logSystemEvent('optimization_cycle_error', null, {
        cycleId,
        error: error.message
      });
    }
  }
  
  // Collecter les stats de tous les modules
  async collectModuleStats() {
    const stats = {
      growthEngine: null,
      messageVariants: null,
      closingEnhancer: null,
      predictiveScore: null,
      hotLeadDetector: null,
      leadGenerator: null
    };
    
    try {
      stats.growthEngine = this.getGrowthEngineStats();
    } catch (error) {
      console.log('[MODULE_STATS_ERROR]', { module: 'growthEngine', error: error.message });
    }
    
    try {
      stats.messageVariants = getVariantStats();
    } catch (error) {
      console.log('[MODULE_STATS_ERROR]', { module: 'messageVariants', error: error.message });
    }
    
    try {
      stats.closingEnhancer = getEnhancerStats();
    } catch (error) {
      console.log('[MODULE_STATS_ERROR]', { module: 'closingEnhancer', error: error.message });
    }
    
    try {
      stats.predictiveScore = getScoringStats();
    } catch (error) {
      console.log('[MODULE_STATS_ERROR]', { module: 'predictiveScore', error: error.message });
    }
    
    try {
      stats.hotLeadDetector = getDetectorStats();
    } catch (error) {
      console.log('[MODULE_STATS_ERROR]', { module: 'hotLeadDetector', error: error.message });
    }
    
    try {
      stats.leadGenerator = getGeneratorStats();
    } catch (error) {
      console.log('[MODULE_STATS_ERROR]', { module: 'leadGenerator', error: error.message });
    }
    
    return stats;
  }
  
  // Obtenir les stats du growth engine
  async getGrowthEngineStats() {
    // Simulation - en production, appelerait le vrai growth engine
    return {
      enabled: true,
      totalAnalyses: 10,
      totalSuggestions: 25,
      appliedSuggestions: 8,
      avgConversionRate: 12.5
    };
  }
  
  // Analyser les tendances et patterns
  analyzeTrends(moduleStats) {
    const analysis = {
      overall: {
        healthyModules: 0,
        unhealthyModules: 0,
        totalModules: Object.keys(moduleStats).length
      },
      trends: {},
      patterns: {},
      recommendations: []
    };
    
    // Analyser chaque module
    for (const [moduleName, stats] of Object.entries(moduleStats)) {
      if (!stats) continue;
      
      const moduleAnalysis = this.analyzeModule(moduleName, stats);
      
      analysis.trends[moduleName] = moduleAnalysis.trend;
      analysis.patterns[moduleName] = moduleAnalysis.pattern;
      
      if (moduleAnalysis.health === 'healthy') {
        analysis.overall.healthyModules++;
      } else {
        analysis.overall.unhealthyModules++;
        analysis.recommendations.push(...moduleAnalysis.recommendations);
      }
    }
    
    // Analyser les patterns globaux
    analysis.globalPatterns = this.analyzeGlobalPatterns(moduleStats);
    
    return analysis;
  }
  
  // Analyser un module spécifique
  analyzeModule(moduleName, stats) {
    const analysis = {
      trend: 'stable',
      pattern: 'normal',
      health: 'healthy',
      recommendations: []
    };
    
    // Analyser selon le type de module
    switch (moduleName) {
      case 'growthEngine':
        analysis = this.analyzeGrowthEngine(stats, analysis);
        break;
      case 'messageVariants':
        analysis = this.analyzeMessageVariants(stats, analysis);
        break;
      case 'closingEnhancer':
        analysis = this.analyzeClosingEnhancer(stats, analysis);
        break;
      case 'predictiveScore':
        analysis = this.analyzePredictiveScore(stats, analysis);
        break;
      case 'hotLeadDetector':
        analysis = this.analyzeHotLeadDetector(stats, analysis);
        break;
      case 'leadGenerator':
        analysis = this.analyzeLeadGenerator(stats, analysis);
        break;
      default:
        analysis.recommendations.push('Unknown module type');
    }
    
    return analysis;
  }
  
  // Analyser le growth engine
  analyzeGrowthEngine(stats, analysis) {
    if (stats.appliedSuggestions < stats.totalSuggestions * 0.2) {
      analysis.trend = 'declining';
      analysis.health = 'warning';
      analysis.recommendations.push('Low suggestion application rate - review relevance');
    }
    
    if (stats.avgConversionRate < 5) {
      analysis.pattern = 'low_performance';
      analysis.health = 'warning';
      analysis.recommendations.push('Low conversion rate - consider strategy changes');
    }
    
    return analysis;
  }
  
  // Analyser les variantes de messages
  analyzeMessageVariants(stats, analysis) {
    if (stats.performance.avgReplyRate < 10) {
      analysis.trend = 'declining';
      analysis.health = 'warning';
      analysis.recommendations.push('Low reply rate - improve message content');
    }
    
    if (stats.tests.withWinner === 0 && stats.tests.active > 2) {
      analysis.pattern = 'no_clear_winner';
      analysis.recommendations.push('No clear test winners - extend test duration or improve variants');
    }
    
    return analysis;
  }
  
  // Analyser l'enhancer de closing
  analyzeClosingEnhancer(stats, analysis) {
    if (stats.stats.successRate < 60) {
      analysis.trend = 'declining';
      analysis.health = 'warning';
      analysis.recommendations.push('Low enhancement success rate - review enhancement logic');
    }
    
    if (stats.stats.fallbacks > stats.stats.totalEnhancements * 0.4) {
      analysis.pattern = 'high_fallback';
      analysis.recommendations.push('High fallback rate - improve validation criteria');
    }
    
    return analysis;
  }
  
  // Analyser le scoring prédictif
  analyzePredictiveScore(stats, analysis) {
    if (stats.stats.avgBoost < 5) {
      analysis.trend = 'declining';
      analysis.health = 'warning';
      analysis.recommendations.push('Low average boost - adjust scoring weights');
    }
    
    if (stats.performance.errorRate > 10) {
      analysis.pattern = 'high_errors';
      analysis.health = 'warning';
      analysis.recommendations.push('High error rate - check data quality');
    }
    
    return analysis;
  }
  
  // Analyser le détecteur de leads chauds
  analyzeHotLeadDetector(stats, analysis) {
    if (stats.stats.avgHotLeadsPerDetection < 1) {
      analysis.trend = 'declining';
      analysis.health = 'warning';
      analysis.recommendations.push('Few hot leads detected - adjust detection criteria');
    }
    
    return analysis;
  }
  
  // Analyser le générateur de leads
  analyzeLeadGenerator(stats, analysis) {
    if (stats.enabled && stats.stats.totalGenerated === 0) {
      analysis.trend = 'inactive';
      analysis.health = 'warning';
      analysis.recommendations.push('Lead generator enabled but not generating leads');
    }
    
    if (stats.stats.totalErrors > stats.stats.totalGenerated * 0.2) {
      analysis.pattern = 'high_errors';
      analysis.recommendations.push('High generation error rate - check data sources');
    }
    
    return analysis;
  }
  
  // Analyser les patterns globaux
  analyzeGlobalPatterns(moduleStats) {
    const patterns = {
      overallHealth: 'healthy',
      synergy: 'normal',
      bottlenecks: [],
      opportunities: []
    };
    
    // Détecter les goulots d'étranglement
    const unhealthyModules = Object.entries(moduleStats)
      .filter(([name, stats]) => stats && this.isModuleUnhealthy(name, stats))
      .map(([name]) => name);
    
    if (unhealthyModules.length > 0) {
      patterns.bottlenecks = unhealthyModules;
      patterns.overallHealth = 'warning';
    }
    
    // Détecter les opportunités d'optimisation
    const opportunities = [];
    
    if (moduleStats.messageVariants && moduleStats.messageVariants.tests.active < 2) {
      opportunities.push('Start more A/B tests to optimize messaging');
    }
    
    if (moduleStats.predictiveScore && moduleStats.predictiveScore.stats.avgBoost > 15) {
      opportunities.push('High predictive scores - consider increasing lead volume');
    }
    
    if (moduleStats.hotLeadDetector && moduleStats.hotLeadDetector.stats.hotLeadsFound > 10) {
      opportunities.push('Many hot leads - implement priority processing');
    }
    
    patterns.opportunities = opportunities;
    
    return patterns;
  }
  
  // Vérifier si un module est unhealthy
  isModuleUnhealthy(moduleName, stats) {
    switch (moduleName) {
      case 'growthEngine':
        return stats.appliedSuggestions < stats.totalSuggestions * 0.2;
      case 'messageVariants':
        return stats.performance.avgReplyRate < 10;
      case 'closingEnhancer':
        return stats.stats.successRate < 60;
      case 'predictiveScore':
        return stats.stats.avgBoost < 5;
      case 'hotLeadDetector':
        return stats.stats.avgHotLeadsPerDetection < 1;
      case 'leadGenerator':
        return stats.enabled && stats.stats.totalErrors > stats.stats.totalGenerated * 0.2;
      default:
        return false;
    }
  }
  
  // Générer des suggestions d'optimisation
  generateOptimizationSuggestions(analysis) {
    const suggestions = [];
    
    // Suggestions basées sur l'analyse globale
    if (analysis.overall.unhealthyModules > 0) {
      suggestions.push({
        type: 'system_health',
        priority: 'high',
        title: 'Modules Unhealthy Detected',
        description: `${analysis.overall.unhealthyModules} modules show warning signs`,
        actions: analysis.recommendations.slice(0, 3),
        expectedImpact: 'System stability',
        effort: 'medium'
      });
    }
    
    // Suggestions basées sur les patterns globaux
    if (analysis.globalPatterns.bottlenecks.length > 0) {
      suggestions.push({
        type: 'bottleneck_resolution',
        priority: 'high',
        title: 'Bottlenecks Identified',
        description: `Performance issues in: ${analysis.globalPatterns.bottlenecks.join(', ')}`,
        actions: [
          'Review module configurations',
          'Check data quality',
          'Optimize processing parameters'
        ],
        expectedImpact: 'Performance improvement',
        effort: 'high'
      });
    }
    
    // Suggestions basées sur les opportunités
    if (analysis.globalPatterns.opportunities.length > 0) {
      suggestions.push({
        type: 'opportunity',
        priority: 'medium',
        title: 'Optimization Opportunities',
        description: 'Potential areas for improvement detected',
        actions: analysis.globalPatterns.opportunities,
        expectedImpact: 'Performance boost',
        effort: 'low'
      });
    }
    
    // Suggestions basées sur les tendances spécifiques
    for (const [moduleName, trend] of Object.entries(analysis.trends)) {
      if (trend === 'declining') {
        suggestions.push({
          type: 'module_optimization',
          priority: 'medium',
          title: `${moduleName} Performance Declining`,
          description: `Module ${moduleName} shows declining performance`,
          actions: [
            `Review ${moduleName} configuration`,
            'Check recent changes',
            'Analyze error logs'
          ],
          expectedImpact: 'Module recovery',
          effort: 'medium'
        });
      }
    }
    
    // Trier par priorité
    suggestions.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
    
    return suggestions.slice(0, 10); // Max 10 suggestions
  }
  
  // Stocker les suggestions
  storeSuggestions(suggestions) {
    for (const suggestion of suggestions) {
      suggestion.generatedAt = new Date();
      suggestion.status = 'pending';
      suggestion.id = `suggestion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    // Pour l'instant, stocker globalement (peut être étendu par tenant)
    if (!this.suggestions.has('global')) {
      this.suggestions.set('global', []);
    }
    
    const globalSuggestions = this.suggestions.get('global');
    globalSuggestions.push(...suggestions);
    
    // Limiter le nombre de suggestions
    if (globalSuggestions.length > this.maxSuggestions) {
      this.suggestions.set('global', globalSuggestions.slice(-this.maxSuggestions));
    }
    
    this.stats.totalSuggestions += suggestions.length;
    
    console.log('[CONTINUOUS_OPTIMIZER_SUGGESTIONS_STORED]', {
      suggestionsGenerated: suggestions.length,
      totalStored: globalSuggestions.length
    });
  }
  
  // Obtenir les suggestions
  getSuggestions(status = null) {
    const allSuggestions = [];
    
    for (const [key, suggestions] of this.suggestions.entries()) {
      allSuggestions.push(...suggestions);
    }
    
    if (status) {
      return allSuggestions.filter(s => s.status === status);
    }
    
    return allSuggestions;
  }
  
  // Marquer une suggestion comme appliquée
  markSuggestionApplied(suggestionId) {
    for (const [key, suggestions] of this.suggestions.entries()) {
      const suggestion = suggestions.find(s => s.id === suggestionId);
      
      if (suggestion) {
        suggestion.status = 'applied';
        suggestion.appliedAt = new Date();
        
        this.stats.appliedSuggestions++;
        
        console.log('[CONTINUOUS_OPTIMIZER_SUGGESTION_APPLIED]', {
          suggestionId,
          type: suggestion.type
        });
        
        return true;
      }
    }
    
    return false;
  }
  
  // Exécuter un cycle manuellement
  async runManualOptimization() {
    if (!this.enabled) {
      return { success: false, reason: 'optimizer_disabled' };
    }
    
    console.log('[CONTINUOUS_OPTIMIZER_MANUAL_STARTED]', {
      timestamp: new Date()
    });
    
    try {
      await this.runOptimizationCycle();
      
      return {
        success: true,
        message: 'Manual optimization completed',
        lastOptimization: this.stats.lastOptimization,
        totalSuggestions: this.getSuggestions().length
      };
      
    } catch (error) {
      console.log('[CONTINUOUS_OPTIMIZER_MANUAL_ERROR]', error.message);
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // Obtenir les stats de l'optimiseur
  getOptimizerStats() {
    const allSuggestions = this.getSuggestions();
    const pendingSuggestions = allSuggestions.filter(s => s.status === 'pending');
    const appliedSuggestions = allSuggestions.filter(s => s.status === 'applied');
    
    return {
      enabled: this.enabled,
      running: this.isRunning,
      config: {
        frequency: this.frequency,
        maxSuggestions: this.maxSuggestions
      },
      stats: {
        totalOptimizations: this.stats.totalOptimizations,
        totalSuggestions: this.stats.totalSuggestions,
        appliedSuggestions: this.stats.appliedSuggestions,
        errors: this.stats.errors,
        lastOptimization: this.stats.lastOptimization
      },
      suggestions: {
        total: allSuggestions.length,
        pending: pendingSuggestions.length,
        applied: appliedSuggestions.length,
        byType: this.groupSuggestionsByType(allSuggestions)
      },
      uptime: process.uptime()
    };
  }
  
  // Grouper les suggestions par type
  groupSuggestionsByType(suggestions) {
    const grouped = {};
    
    for (const suggestion of suggestions) {
      grouped[suggestion.type] = (grouped[suggestion.type] || 0) + 1;
    }
    
    return grouped;
  }
  
  // Health check
  healthCheck() {
    const stats = this.getOptimizerStats();
    
    const health = {
      status: 'healthy',
      enabled: stats.enabled,
      running: stats.running,
      issues: [],
      recommendations: []
    };
    
    // Vérifier si l'optimiseur tourne
    if (stats.enabled && !stats.running) {
      health.issues.push('Optimizer enabled but not running');
      health.recommendations.push('Check optimizer start process');
    }
    
    // Vérifier taux d'erreur
    const errorRate = this.stats.totalOptimizations > 0 ? 
      (this.stats.errors / this.stats.totalOptimizations) * 100 : 0;
    
    if (errorRate > 20) {
      health.issues.push('High error rate');
      health.recommendations.push('Check module dependencies and data sources');
    }
    
    // Vérifier dernière optimisation
    if (stats.stats.lastOptimization) {
      const timeSinceLastOpt = Date.now() - new Date(stats.stats.lastOptimization).getTime();
      const expectedInterval = this.frequency * 60 * 60 * 1000;
      
      if (timeSinceLastOpt > expectedInterval * 2) {
        health.issues.push('Optimizer appears stuck');
        health.recommendations.push('Check optimizer interval and execution');
      }
    }
    
    if (health.issues.length > 0) {
      health.status = 'warning';
    }
    
    return {
      ...health,
      stats: {
        running: stats.running,
        totalOptimizations: this.stats.totalOptimizations,
        errorRate: Math.round(errorRate * 100) / 100,
        lastOptimization: this.stats.lastOptimization
      }
    };
  }
  
  // Réinitialiser stats
  resetStats() {
    this.stats = {
      totalOptimizations: 0,
      totalSuggestions: 0,
      appliedSuggestions: 0,
      errors: 0,
      lastOptimization: null
    };
    
    console.log('[CONTINUOUS_OPTIMIZER_STATS_RESET]');
  }
  
  // Détruire
  destroy() {
    this.stop();
    
    console.log('[CONTINUOUS_OPTIMIZER_DESTROYED]');
  }
}

// Instance globale de l'optimiseur
if (!global.continuousOptimizer) {
  global.continuousOptimizer = new ContinuousOptimizer();
}

// Fonctions principales
function startOptimizer() {
  return global.continuousOptimizer.start();
}

function stopOptimizer() {
  return global.continuousOptimizer.stop();
}

async function runManualOptimization() {
  return await global.continuousOptimizer.runManualOptimization();
}

function getOptimizerSuggestions(status) {
  return global.continuousOptimizer.getSuggestions(status);
}

function markSuggestionApplied(suggestionId) {
  return global.continuousOptimizer.markSuggestionApplied(suggestionId);
}

// Stats et monitoring
function getOptimizerStats() {
  return global.continuousOptimizer.getOptimizerStats();
}

function optimizerHealthCheck() {
  return global.continuousOptimizer.healthCheck();
}

// Administration
function resetOptimizerStats() {
  return global.continuousOptimizer.resetStats();
}

module.exports = {
  startOptimizer,
  stopOptimizer,
  runManualOptimization,
  getOptimizerSuggestions,
  markSuggestionApplied,
  getOptimizerStats,
  optimizerHealthCheck,
  resetOptimizerStats,
  ContinuousOptimizer
};
