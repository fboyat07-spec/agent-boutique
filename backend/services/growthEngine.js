// ACTION 3 - Growth Engine (optimisation)

const { getLeadsByTenant } = require('./tenantIsolationSafe');
const { getFullTenantConfig } = require('./tenantConfig');
const BusinessLogger = require('./businessLogger');

// Engine d'optimisation growth (SAFE - recommandations uniquement)
class GrowthEngine {
  constructor() {
    this.enabled = process.env.GROWTH_ENGINE_ENABLED === 'true';
    this.suggestions = new Map(); // tenant_id -> suggestions
    this.maxSuggestions = 50; // Max 50 suggestions par tenant
    this.stats = {
      totalAnalyses: 0,
      totalSuggestions: 0,
      appliedSuggestions: 0,
      errors: 0
    };
    
    console.log('[GROWTH_ENGINE_INITIALIZED]', {
      enabled: this.enabled,
      maxSuggestions: this.maxSuggestions
    });
  }
  
  // Analyser conversion et suggérer actions
  async analyzeConversion(tenant_id) {
    if (!this.enabled) {
      return { enabled: false, reason: 'growth_engine_disabled' };
    }
    
    console.log('[GROWTH_ANALYSIS_STARTED]', { tenant_id });
    
    try {
      this.stats.totalAnalyses++;
      
      // Obtenir données du tenant
      const leads = getLeadsByTenant(tenant_id);
      const config = getFullTenantConfig(tenant_id);
      
      if (leads.length === 0) {
        return {
          tenant_id,
          analysis: {
            status: 'no_data',
            message: 'No leads to analyze'
          },
          suggestions: []
        };
      }
      
      // Calculer métriques de conversion
      const conversionMetrics = this.calculateConversionMetrics(leads);
      
      // Analyser patterns
      const patterns = this.analyzePatterns(leads, config);
      
      // Générer suggestions
      const suggestions = this.generateSuggestions(conversionMetrics, patterns, config);
      
      // Stocker suggestions
      this.storeSuggestions(tenant_id, suggestions);
      
      console.log('[GROWTH_ANALYSIS_COMPLETED]', {
        tenant_id,
        conversionRate: conversionMetrics.overallRate,
        suggestionsGenerated: suggestions.length
      });
      
      return {
        tenant_id,
        analysis: {
          conversionMetrics,
          patterns,
          analyzedAt: new Date()
        },
        suggestions,
        metadata: {
          totalLeads: leads.length,
          analysisId: `analysis_${Date.now()}`
        }
      };
      
    } catch (error) {
      this.stats.errors++;
      
      console.log('[GROWTH_ANALYSIS_ERROR]', {
        tenant_id,
        error: error.message
      });
      
      return {
        tenant_id,
        error: error.message,
        analysis: null,
        suggestions: []
      };
    }
  }
  
  // Calculer métriques de conversion
  calculateConversionMetrics(leads) {
    const totalLeads = leads.length;
    const wonLeads = leads.filter(l => l.status === 'WON').length;
    const lostLeads = leads.filter(l => l.status === 'LOST').length;
    const activeLeads = leads.filter(l => l.status !== 'WON' && l.status !== 'LOST').length;
    
    const overallRate = totalLeads > 0 ? (wonLeads / totalLeads) * 100 : 0;
    
    // Funnel analysis
    const funnel = {
      NEW: leads.filter(l => l.status === 'NEW').length,
      CONTACTED: leads.filter(l => l.status === 'CONTACTED').length,
      ENGAGED: leads.filter(l => l.status === 'ENGAGED').length,
      INTERESTED: leads.filter(l => l.status === 'INTERESTED').length,
      CLOSING: leads.filter(l => l.status === 'CLOSING').length,
      PAYMENT_SENT: leads.filter(l => l.status === 'PAYMENT_SENT').length,
      WON: wonLeads,
      LOST: lostLeads
    };
    
    // Taux de conversion par étape
    const conversionRates = {};
    let previousCount = funnel.NEW;
    
    for (const [stage, count] of Object.entries(funnel)) {
      if (previousCount > 0) {
        conversionRates[stage] = (count / previousCount) * 100;
      } else {
        conversionRates[stage] = 0;
      }
      previousCount = count;
    }
    
    // Temps moyen de conversion
    const convertedLeads = leads.filter(l => l.status === 'WON' && l.createdAt && l.lastContactAt);
    let avgConversionTime = 0;
    
    if (convertedLeads.length > 0) {
      const totalTime = convertedLeads.reduce((sum, lead) => {
        const created = new Date(lead.createdAt);
        const converted = new Date(lead.lastContactAt);
        return sum + (converted - created);
      }, 0);
      
      avgConversionTime = totalTime / convertedLeads.length / (1000 * 60 * 60); // en heures
    }
    
    return {
      totalLeads,
      wonLeads,
      lostLeads,
      activeLeads,
      overallRate: Math.round(overallRate * 100) / 100,
      funnel,
      conversionRates,
      avgConversionTime: Math.round(avgConversionTime * 100) / 100
    };
  }
  
  // Analyser patterns
  analyzePatterns(leads, config) {
    const patterns = {
      outboundEffectiveness: this.analyzeOutboundEffectiveness(leads, config),
      timingPatterns: this.analyzeTimingPatterns(leads),
      scorePatterns: this.analyzeScorePatterns(leads),
      messagePatterns: this.analyzeMessagePatterns(leads)
    };
    
    return patterns;
  }
  
  // Analyser efficacité outbound
  analyzeOutboundEffectiveness(leads, config) {
    if (!config.outbound_enabled) {
      return {
        enabled: false,
        reason: 'outbound_disabled'
      };
    }
    
    const leadsWithOutbound = leads.filter(l => l.lastContactAt);
    const conversionWithOutbound = leadsWithOutbound.filter(l => l.status === 'WON').length;
    
    const outboundRate = leadsWithOutbound.length > 0 ? 
      (conversionWithOutbound / leadsWithOutbound.length) * 100 : 0;
    
    return {
      enabled: true,
      leadsProcessed: leadsWithOutbound.length,
      conversionRate: Math.round(outboundRate * 100) / 100,
      effectiveness: outboundRate > 10 ? 'high' : outboundRate > 5 ? 'medium' : 'low'
    };
  }
  
  // Analyser patterns temporels
  analyzeTimingPatterns(leads) {
    const leadsWithTiming = leads.filter(l => l.createdAt && l.lastContactAt);
    
    if (leadsWithTiming.length === 0) {
      return { hasData: false };
    }
    
    const responseTimes = leadsWithTiming.map(lead => {
      const created = new Date(lead.createdAt);
      const contacted = new Date(lead.lastContactAt);
      return (contacted - created) / (1000 * 60 * 60); // en heures
    });
    
    const avgResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
    const fastResponses = responseTimes.filter(time => time <= 1).length; // <= 1 heure
    
    return {
      hasData: true,
      avgResponseTime: Math.round(avgResponseTime * 100) / 100,
      fastResponseRate: (fastResponses / responseTimes.length) * 100,
      recommendations: avgResponseTime > 24 ? 'slow' : avgResponseTime > 6 ? 'normal' : 'fast'
    };
  }
  
  // Analyser patterns de score
  analyzeScorePatterns(leads) {
    const leadsWithScore = leads.filter(l => l.score !== undefined && l.score !== null);
    
    if (leadsWithScore.length === 0) {
      return { hasData: false };
    }
    
    const scores = leadsWithScore.map(l => l.score);
    const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    
    const conversionByScore = {};
    const scoreRanges = [0, 25, 50, 75, 100];
    
    for (let i = 0; i < scoreRanges.length - 1; i++) {
      const minScore = scoreRanges[i];
      const maxScore = scoreRanges[i + 1];
      
      const leadsInRange = leadsWithScore.filter(l => 
        l.score >= minScore && (i === scoreRanges.length - 2 ? l.score <= maxScore : l.score < maxScore)
      );
      
      const conversions = leadsInRange.filter(l => l.status === 'WON').length;
      const rate = leadsInRange.length > 0 ? (conversions / leadsInRange.length) * 100 : 0;
      
      conversionByScore[`${minScore}-${maxScore}`] = {
        count: leadsInRange.length,
        conversions,
        rate: Math.round(rate * 100) / 100
      };
    }
    
    return {
      hasData: true,
      avgScore: Math.round(avgScore * 100) / 100,
      conversionByScore,
      scoreEffectiveness: avgScore > 60 ? 'high' : avgScore > 40 ? 'medium' : 'low'
    };
  }
  
  // Analyser patterns de messages (simulation)
  analyzeMessagePatterns(leads) {
    // Simulation d'analyse de patterns de messages
    // En production, analyserait les contenus réels des messages
    
    const leadsWithMessages = leads.filter(l => l.lastContactAt);
    
    return {
      hasData: leadsWithMessages.length > 0,
      messagesAnalyzed: leadsWithMessages.length,
      patterns: {
        shortMessages: Math.round(Math.random() * 100), // Simulation
        longMessages: Math.round(Math.random() * 100),
        questionsAsked: Math.round(Math.random() * 100)
      }
    };
  }
  
  // Générer suggestions
  generateSuggestions(metrics, patterns, config) {
    const suggestions = [];
    
    // Suggestion basée sur taux de conversion global
    if (metrics.overallRate < 5) {
      suggestions.push({
        type: 'conversion_optimization',
        priority: 'high',
        title: 'Taux de conversion très faible',
        description: 'Le taux de conversion est inférieur à 5%. Considérez réduire le volume et améliorer la qualité.',
        actions: [
          'Réduire max_per_run à 3-5 leads',
          'Activer IA pour personnaliser les messages',
          'Augmenter cooldown_hours à 48h'
        ],
        expectedImpact: '+15-25% conversion',
        effort: 'medium'
      });
    } else if (metrics.overallRate < 15) {
      suggestions.push({
        type: 'conversion_optimization',
        priority: 'medium',
        title: 'Taux de conversion à améliorer',
        description: 'Le taux de conversion peut être optimisé avec quelques ajustements.',
        actions: [
          'Tester variantes de messages (A/B testing)',
          'Ajuster timing des messages',
          'Activer followup plus fréquent'
        ],
        expectedImpact: '+5-15% conversion',
        effort: 'low'
      });
    }
    
    // Suggestion basée sur outbound
    if (patterns.outboundEffectiveness.enabled) {
      if (patterns.outboundEffectiveness.effectiveness === 'low') {
        suggestions.push({
          type: 'outbound_optimization',
          priority: 'high',
          title: 'Efficacité outbound faible',
          description: 'Les messages outbound ont une faible conversion.',
          actions: [
            'Désactiver outbound temporairement',
            'Revoir le contenu des messages',
            'Tester différents horaires d\'envoi'
          ],
          expectedImpact: '+10-20% conversion',
          effort: 'medium'
        });
      } else if (patterns.outboundEffectiveness.effectiveness === 'high') {
        suggestions.push({
          type: 'outbound_scaling',
          priority: 'low',
          title: 'Opportunité de scaling outbound',
          description: 'L\'outbound performe bien, envisagez d\'augmenter le volume.',
          actions: [
            'Augmenter max_per_run de 20%',
            'Réduire cooldown_hours',
            'Activer multi-agent si disponible'
          ],
          expectedImpact: '+20-30% volume',
          effort: 'low'
        });
      }
    }
    
    // Suggestion basée sur timing
    if (patterns.timingPatterns.hasData && patterns.timingPatterns.recommendations === 'slow') {
      suggestions.push({
        type: 'timing_optimization',
        priority: 'medium',
        title: 'Temps de réponse lent',
        description: 'Le temps de réponse moyen est supérieur à 24h.',
        actions: [
          'Réduire cooldown_hours',
          'Activer queue pour traitement plus rapide',
          'Prioriser leads avec score élevé'
        ],
        expectedImpact: '+10% conversion',
        effort: 'low'
      });
    }
    
    // Suggestion basée sur scores
    if (patterns.scorePatterns.hasData && patterns.scorePatterns.scoreEffectiveness === 'low') {
      suggestions.push({
        type: 'scoring_optimization',
        priority: 'medium',
        title: 'Scores faibles peu convertis',
        description: 'Les leads avec scores faibles convertissent mal.',
        actions: [
          'Augmenter le seuil de score minimum',
          'Activer IA pour améliorer scoring',
          'Filtrer leads par score avant outbound'
        ],
        expectedImpact: '+5-10% conversion',
        effort: 'medium'
      });
    }
    
    // Suggestion basée sur configuration actuelle
    if (!config.ai_enabled && metrics.overallRate < 20) {
      suggestions.push({
        type: 'ai_activation',
        priority: 'medium',
        title: 'Activer l\'IA pour améliorer la conversion',
        description: 'L\'IA peut aider à personnaliser les messages et améliorer les réponses.',
        actions: [
          'Activer ai_enabled',
          'Tester avec ai_advanced_enabled',
          'Monitorer les performances'
        ],
        expectedImpact: '+10-25% conversion',
        effort: 'medium'
      });
    }
    
    // Trier par priorité
    suggestions.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
    
    return suggestions.slice(0, 10); // Max 10 suggestions
  }
  
  // Stocker suggestions
  storeSuggestions(tenant_id, suggestions) {
    if (!this.suggestions.has(tenant_id)) {
      this.suggestions.set(tenant_id, []);
    }
    
    const tenantSuggestions = this.suggestions.get(tenant_id);
    
    // Ajouter timestamp
    const suggestionsWithTimestamp = suggestions.map(suggestion => ({
      ...suggestion,
      generatedAt: new Date(),
      status: 'pending'
    }));
    
    // Ajouter aux suggestions existantes
    tenantSuggestions.push(...suggestionsWithTimestamp);
    
    // Limiter le nombre de suggestions
    if (tenantSuggestions.length > this.maxSuggestions) {
      this.suggestions.set(tenant_id, tenantSuggestions.slice(-this.maxSuggestions));
    }
    
    this.stats.totalSuggestions += suggestions.length;
  }
  
  // Obtenir suggestions pour un tenant
  getSuggestions(tenant_id, status = null) {
    const tenantSuggestions = this.suggestions.get(tenant_id) || [];
    
    if (status) {
      return tenantSuggestions.filter(s => s.status === status);
    }
    
    return tenantSuggestions;
  }
  
  // Marquer suggestion comme appliquée
  markSuggestionApplied(tenant_id, suggestionIndex) {
    const tenantSuggestions = this.suggestions.get(tenant_id);
    
    if (!tenantSuggestions || !tenantSuggestions[suggestionIndex]) {
      return false;
    }
    
    tenantSuggestions[suggestionIndex].status = 'applied';
    tenantSuggestions[suggestionIndex].appliedAt = new Date();
    
    this.stats.appliedSuggestions++;
    
    console.log('[GROWTH_SUGGESTION_APPLIED]', {
      tenant_id,
      suggestionIndex,
      type: tenantSuggestions[suggestionIndex].type
    });
    
    return true;
  }
  
  // Obtenir stats du growth engine
  getGrowthStats() {
    const allSuggestions = Array.from(this.suggestions.values()).flat();
    const pendingSuggestions = allSuggestions.filter(s => s.status === 'pending');
    const appliedSuggestions = allSuggestions.filter(s => s.status === 'applied');
    
    return {
      enabled: this.enabled,
      stats: {
        totalAnalyses: this.stats.totalAnalyses,
        totalSuggestions: this.stats.totalSuggestions,
        appliedSuggestions: this.stats.appliedSuggestions,
        errors: this.stats.errors
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
  
  // Grouper suggestions par type
  groupSuggestionsByType(suggestions) {
    const grouped = {};
    
    for (const suggestion of suggestions) {
      grouped[suggestion.type] = (grouped[suggestion.type] || 0) + 1;
    }
    
    return grouped;
  }
  
  // Health check
  healthCheck() {
    const stats = this.getGrowthStats();
    
    const health = {
      status: 'healthy',
      enabled: stats.enabled,
      issues: [],
      recommendations: []
    };
    
    // Vérifier taux d'erreur
    const errorRate = this.stats.totalAnalyses > 0 ? 
      (this.stats.errors / this.stats.totalAnalyses) * 100 : 0;
    
    if (errorRate > 15) {
      health.issues.push('High analysis error rate');
      health.recommendations.push('Check data sources and analysis logic');
    }
    
    // Vérifier suggestions appliquées
    const applicationRate = stats.suggestions.total > 0 ? 
      (stats.suggestions.applied / stats.suggestions.total) * 100 : 0;
    
    if (applicationRate < 10 && stats.suggestions.total > 10) {
      health.issues.push('Low suggestion application rate');
      health.recommendations.push('Review suggestion relevance and implementation process');
    }
    
    if (health.issues.length > 0) {
      health.status = 'warning';
    }
    
    return {
      ...health,
      stats: {
        totalAnalyses: this.stats.totalAnalyses,
        totalSuggestions: this.stats.totalSuggestions,
        errorRate: Math.round(errorRate * 100) / 100,
        applicationRate: Math.round(applicationRate * 100) / 100
      }
    };
  }
  
  // Réinitialiser stats
  resetStats() {
    this.stats = {
      totalAnalyses: 0,
      totalSuggestions: 0,
      appliedSuggestions: 0,
      errors: 0
    };
    
    console.log('[GROWTH_ENGINE_STATS_RESET]');
  }
  
  // Nettoyer anciennes suggestions
  cleanupSuggestions(maxAge = 30 * 24 * 60 * 60 * 1000) { // 30 jours
    const cutoff = Date.now() - maxAge;
    let totalCleaned = 0;
    
    for (const [tenant_id, suggestions] of this.suggestions.entries()) {
      const before = suggestions.length;
      
      // Garder seulement les suggestions récentes
      const recentSuggestions = suggestions.filter(s => 
        new Date(s.generatedAt).getTime() > cutoff
      );
      
      this.suggestions.set(tenant_id, recentSuggestions);
      
      totalCleaned += before - recentSuggestions.length;
    }
    
    if (totalCleaned > 0) {
      console.log('[GROWTH_ENGINE_CLEANUP]', {
        cleaned: totalCleaned,
        cutoff: new Date(cutoff)
      });
    }
    
    return totalCleaned;
  }
}

// Instance globale du growth engine
if (!global.growthEngine) {
  global.growthEngine = new GrowthEngine();
}

// Fonctions principales
async function analyzeConversion(tenant_id) {
  return await global.growthEngine.analyzeConversion(tenant_id);
}

function getSuggestions(tenant_id, status) {
  return global.growthEngine.getSuggestions(tenant_id, status);
}

function markSuggestionApplied(tenant_id, suggestionIndex) {
  return global.growthEngine.markSuggestionApplied(tenant_id, suggestionIndex);
}

// Stats et monitoring
function getGrowthStats() {
  return global.growthEngine.getGrowthStats();
}

function growthEngineHealthCheck() {
  return global.growthEngine.healthCheck();
}

// Administration
function resetGrowthStats() {
  return global.growthEngine.resetStats();
}

function cleanupSuggestions(maxAge) {
  return global.growthEngine.cleanupSuggestions(maxAge);
}

module.exports = {
  analyzeConversion,
  getSuggestions,
  markSuggestionApplied,
  getGrowthStats,
  growthEngineHealthCheck,
  resetGrowthStats,
  cleanupSuggestions,
  GrowthEngine
};
