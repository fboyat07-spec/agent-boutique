// ACTION 6 - Scoring prédictif simple

const { getLeadsByTenant } = require('./tenantIsolationSafe');
const BusinessLogger = require('./businessLogger');
const { trackEvent } = require('./eventTracker');

// Système de scoring prédictif simple (additif, non remplaçant)
class PredictiveScore {
  constructor() {
    this.enabled = process.env.PREDICTIVE_SCORE_ENABLED === 'true';
    this.maxBoost = 30; // Boost maximum de +30 points
    this.weights = {
      responseTiming: 0.3,    // 30% poids timing des réponses
      engagementLevel: 0.4,   // 40% poids engagement
      conversationDepth: 0.2,  // 20% poids profondeur conversation
      recentActivity: 0.1     // 10% poids activité récente
    };
    this.stats = {
      totalScores: 0,
      totalBoosts: 0,
      avgBoost: 0,
      errors: 0
    };
    
    console.log('[PREDICTIVE_SCORE_INITIALIZED]', {
      enabled: this.enabled,
      maxBoost: this.maxBoost,
      weights: this.weights
    });
  }
  
  // Calculer le score prédictif pour un lead
  calculatePredictiveScore(lead, tenant_id = null) {
    if (!this.enabled) {
      return { 
        enabled: false, 
        reason: 'predictive_score_disabled',
        originalScore: lead.score || 0,
        boostedScore: lead.score || 0
      };
    }
    
    try {
      this.stats.totalScores++;
      
      const originalScore = lead.score || 0;
      
      // Analyser les facteurs prédictifs
      const factors = this.analyzePredictiveFactors(lead);
      
      // Calculer le boost
      const boost = this.calculateBoost(factors);
      
      // Appliquer le boost (additif)
      const boostedScore = Math.min(100, originalScore + boost);
      
      console.log('[PREDICTIVE_SCORE_CALCULATED]', {
        tenant_id,
        phone: this.maskPhone(lead.phone),
        originalScore,
        boost,
        boostedScore,
        factors: Object.keys(factors).length
      });
      
      // Stats
      this.stats.totalBoosts += boost;
      this.stats.avgBoost = this.stats.totalBoosts / this.stats.totalScores;
      
      // Tracker l'événement
      trackEvent('predictive_score_calculated', {
        tenant_id,
        lead_id: lead.id,
        originalScore,
        boost,
        boostedScore
      });
      
      return {
        enabled: true,
        originalScore,
        boostedScore,
        boost,
        factors,
        metadata: {
          calculatedAt: new Date(),
          confidence: this.calculateConfidence(factors)
        }
      };
      
    } catch (error) {
      this.stats.errors++;
      
      console.log('[PREDICTIVE_SCORE_ERROR]', {
        tenant_id,
        phone: lead.phone,
        error: error.message
      });
      
      return {
        enabled: false,
        reason: 'calculation_error',
        originalScore: lead.score || 0,
        boostedScore: lead.score || 0,
        error: error.message
      };
    }
  }
  
  // Analyser les facteurs prédictifs
  analyzePredictiveFactors(lead) {
    const factors = {};
    
    // Facteur 1: Timing des réponses
    factors.responseTiming = this.analyzeResponseTiming(lead);
    
    // Facteur 2: Niveau d'engagement
    factors.engagementLevel = this.analyzeEngagementLevel(lead);
    
    // Facteur 3: Profondeur de conversation
    factors.conversationDepth = this.analyzeConversationDepth(lead);
    
    // Facteur 4: Activité récente
    factors.recentActivity = this.analyzeRecentActivity(lead);
    
    return factors;
  }
  
  // Analyser le timing des réponses
  analyzeResponseTiming(lead) {
    if (!lead.createdAt || !lead.lastContactAt) {
      return { score: 0, reason: 'no_timing_data' };
    }
    
    const created = new Date(lead.createdAt);
    const lastContact = new Date(lead.lastContactAt);
    const responseTime = (lastContact - created) / (1000 * 60 * 60); // en heures
    
    let score = 0;
    let reason = '';
    
    if (responseTime <= 1) {
      score = 10; // Très rapide
      reason = 'response_within_1h';
    } else if (responseTime <= 6) {
      score = 7; // Rapide
      reason = 'response_within_6h';
    } else if (responseTime <= 24) {
      score = 5; // Normal
      reason = 'response_within_24h';
    } else if (responseTime <= 72) {
      score = 3; // Lent
      reason = 'response_within_72h';
    } else {
      score = 1; // Très lent
      reason = 'response_over_72h';
    }
    
    return { score, reason, responseTime: Math.round(responseTime * 100) / 100 };
  }
  
  // Analyser le niveau d'engagement
  analyzeEngagementLevel(lead) {
    // Simulation basée sur le statut et le score existant
    const status = lead.status || 'NEW';
    const existingScore = lead.score || 0;
    
    let score = 0;
    let reason = '';
    
    // Basé sur le statut
    switch (status) {
      case 'WON':
        score = 10;
        reason = 'converted';
        break;
      case 'PAYMENT_SENT':
        score = 9;
        reason = 'payment_sent';
        break;
      case 'CLOSING':
        score = 8;
        reason = 'closing_stage';
        break;
      case 'INTERESTED':
        score = 7;
        reason = 'interested';
        break;
      case 'ENGAGED':
        score = 6;
        reason = 'engaged';
        break;
      case 'CONTACTED':
        score = 4;
        reason = 'contacted';
        break;
      case 'NEW':
        score = 2;
        reason = 'new_lead';
        break;
      case 'LOST':
        score = 1;
        reason = 'lost';
        break;
      default:
        score = 3;
        reason = 'unknown_status';
    }
    
    // Ajuster basé sur le score existant
    if (existingScore > 70) {
      score += 2;
      reason += '_high_existing_score';
    } else if (existingScore < 30) {
      score -= 1;
      reason += '_low_existing_score';
    }
    
    return { 
      score: Math.max(0, Math.min(10, score)), 
      reason,
      status,
      existingScore 
    };
  }
  
  // Analyser la profondeur de conversation
  analyzeConversationDepth(lead) {
    // Simulation basée sur les métadonnées et l'historique
    const metadata = lead.metadata || {};
    const messageCount = metadata.messageCount || 1;
    const lastContactAt = lead.lastContactAt;
    
    let score = 0;
    let reason = '';
    
    // Basé sur le nombre de messages
    if (messageCount >= 5) {
      score = 8;
      reason = 'deep_conversation';
    } else if (messageCount >= 3) {
      score = 6;
      reason = 'medium_conversation';
    } else if (messageCount >= 2) {
      score = 4;
      reason = 'light_conversation';
    } else {
      score = 2;
      reason = 'single_message';
    }
    
    // Ajuster basé sur la récence du dernier contact
    if (lastContactAt) {
      const daysSinceLastContact = (Date.now() - new Date(lastContactAt).getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSinceLastContact <= 1) {
        score += 2;
        reason += '_very_recent';
      } else if (daysSinceLastContact <= 7) {
        score += 1;
        reason += '_recent';
      } else if (daysSinceLastContact > 30) {
        score -= 2;
        reason += '_old';
      }
    }
    
    return { 
      score: Math.max(0, Math.min(10, score)), 
      reason,
      messageCount,
      daysSinceLastContact: lastContactAt ? Math.round((Date.now() - new Date(lastContactAt).getTime()) / (1000 * 60 * 60 * 24)) : null
    };
  }
  
  // Analyser l'activité récente
  analyzeRecentActivity(lead) {
    const lastContactAt = lead.lastContactAt;
    const createdAt = lead.createdAt;
    
    if (!lastContactAt) {
      return { score: 0, reason: 'no_activity' };
    }
    
    const now = Date.now();
    const lastContactTime = new Date(lastContactAt).getTime();
    const daysSinceLastContact = (now - lastContactTime) / (1000 * 60 * 60 * 24);
    
    let score = 0;
    let reason = '';
    
    if (daysSinceLastContact <= 1) {
      score = 10;
      reason = 'very_recent_activity';
    } else if (daysSinceLastContact <= 3) {
      score = 8;
      reason = 'recent_activity';
    } else if (daysSinceLastContact <= 7) {
      score = 6;
      reason = 'moderate_activity';
    } else if (daysSinceLastContact <= 14) {
      score = 4;
      reason = 'old_activity';
    } else if (daysSinceLastContact <= 30) {
      score = 2;
      reason = 'very_old_activity';
    } else {
      score = 1;
      reason = 'inactive';
    }
    
    // Ajuster basé sur l'âge du lead
    if (createdAt) {
      const createdTime = new Date(createdAt).getTime();
      const ageInDays = (now - createdTime) / (1000 * 60 * 60 * 24);
      
      if (ageInDays <= 7) {
        score += 1;
        reason += '_new_lead';
      } else if (ageInDays > 90) {
        score -= 1;
        reason += '_old_lead';
      }
    }
    
    return { 
      score: Math.max(0, Math.min(10, score)), 
      reason,
      daysSinceLastContact: Math.round(daysSinceLastContact * 100) / 100
    };
  }
  
  // Calculer le boost basé sur les facteurs
  calculateBoost(factors) {
    let weightedScore = 0;
    
    // Calculer le score pondéré
    weightedScore += factors.responseTiming.score * this.weights.responseTiming;
    weightedScore += factors.engagementLevel.score * this.weights.engagementLevel;
    weightedScore += factors.conversationDepth.score * this.weights.conversationDepth;
    weightedScore += factors.recentActivity.score * this.weights.recentActivity;
    
    // Normaliser sur 10 et convertir en boost (max 30 points)
    const boost = Math.round((weightedScore / 10) * this.maxBoost);
    
    return Math.max(0, Math.min(this.maxBoost, boost));
  }
  
  // Calculer la confiance du score
  calculateConfidence(factors) {
    const factorsWithData = Object.values(factors).filter(f => f.score > 0).length;
    const totalFactors = Object.keys(factors).length;
    
    // Confiance basée sur la quantité de données disponibles
    const dataRatio = factorsWithData / totalFactors;
    
    // Ajuster basé sur la qualité des données
    let confidence = dataRatio * 0.8; // Base 80% max
    
    // Bonus si tous les facteurs ont des données
    if (factorsWithData === totalFactors) {
      confidence += 0.2;
    }
    
    return Math.min(1.0, Math.max(0.1, confidence));
  }
  
  // Calculer les scores prédictifs pour tous les leads d'un tenant
  calculateTenantScores(tenant_id) {
    if (!this.enabled) {
      return { enabled: false, reason: 'predictive_score_disabled' };
    }
    
    try {
      const leads = getLeadsByTenant(tenant_id);
      const results = [];
      
      for (const lead of leads) {
        const scoreResult = this.calculatePredictiveScore(lead, tenant_id);
        results.push({
          phone: this.maskPhone(lead.phone),
          lead_id: lead.id,
          ...scoreResult
        });
      }
      
      // Trier par boosted score (décroissant)
      results.sort((a, b) => b.boostedScore - a.boostedScore);
      
      console.log('[PREDICTIVE_SCORES_TENANT_CALCULATED]', {
        tenant_id,
        totalLeads: leads.length,
        avgBoost: results.reduce((sum, r) => sum + (r.boost || 0), 0) / results.length
      });
      
      return {
        enabled: true,
        tenant_id,
        totalLeads: leads.length,
        scores: results,
        metadata: {
          calculatedAt: new Date(),
          avgBoost: Math.round(results.reduce((sum, r) => sum + (r.boost || 0), 0) / results.length * 100) / 100
        }
      };
      
    } catch (error) {
      console.log('[PREDICTIVE_SCORES_TENANT_ERROR]', {
        tenant_id,
        error: error.message
      });
      
      return {
        enabled: false,
        reason: 'tenant_calculation_error',
        error: error.message
      };
    }
  }
  
  // Obtenir les leads avec le plus haut boost
  getTopBoostedLeads(tenant_id, limit = 10) {
    const tenantScores = this.calculateTenantScores(tenant_id);
    
    if (!tenantScores.enabled) {
      return tenantScores;
    }
    
    // Filtrer les leads avec boost significatif
    const boostedLeads = tenantScores.scores.filter(score => score.boost > 5);
    
    return {
      ...tenantScores,
      topBoosted: boostedLeads.slice(0, limit),
      totalBoosted: boostedLeads.length
    };
  }
  
  // Obtenir les stats du système de scoring
  getScoringStats() {
    return {
      enabled: this.enabled,
      config: {
        maxBoost: this.maxBoost,
        weights: this.weights
      },
      stats: {
        totalScores: this.stats.totalScores,
        totalBoosts: this.stats.totalBoosts,
        avgBoost: Math.round(this.stats.avgBoost * 100) / 100,
        errors: this.stats.errors
      },
      performance: {
        avgBoostPerScore: this.stats.totalScores > 0 ? 
          this.stats.totalBoosts / this.stats.totalScores : 0,
        errorRate: this.stats.totalScores > 0 ? 
          (this.stats.errors / this.stats.totalScores) * 100 : 0
      },
      uptime: process.uptime()
    };
  }
  
  // Health check
  healthCheck() {
    const stats = this.getScoringStats();
    
    const health = {
      status: 'healthy',
      enabled: stats.enabled,
      issues: [],
      recommendations: []
    };
    
    // Vérifier taux d'erreur
    if (stats.performance.errorRate > 10) {
      health.issues.push('High error rate');
      health.recommendations.push('Check data sources and calculation logic');
    }
    
    // Vérifier boost moyen
    if (stats.stats.avgBoost < 5 && stats.stats.totalScores > 10) {
      health.issues.push('Low average boost');
      health.recommendations.push('Review scoring weights and factors');
    }
    
    // Vérifier distribution des poids
    const weightSum = Object.values(stats.config.weights).reduce((sum, w) => sum + w, 0);
    if (Math.abs(weightSum - 1.0) > 0.01) {
      health.issues.push('Weights do not sum to 1.0');
      health.recommendations.push('Fix weight distribution');
    }
    
    if (health.issues.length > 0) {
      health.status = 'warning';
    }
    
    return {
      ...health,
      stats: {
        totalScores: stats.stats.totalScores,
        avgBoost: stats.stats.avgBoost,
        errorRate: Math.round(stats.performance.errorRate * 100) / 100
      }
    };
  }
  
  // Réinitialiser stats
  resetStats() {
    this.stats = {
      totalScores: 0,
      totalBoosts: 0,
      avgBoost: 0,
      errors: 0
    };
    
    console.log('[PREDICTIVE_SCORE_STATS_RESET]');
  }
  
  // Masquer téléphone pour logs
  maskPhone(phone) {
    if (!phone || typeof phone !== 'string') return 'unknown';
    return phone.slice(0, -4) + '****';
  }
}

// Instance globale du scoring prédictif
if (!global.predictiveScore) {
  global.predictiveScore = new PredictiveScore();
}

// Fonctions principales
function calculatePredictiveScore(lead, tenant_id) {
  return global.predictiveScore.calculatePredictiveScore(lead, tenant_id);
}

function calculateTenantScores(tenant_id) {
  return global.predictiveScore.calculateTenantScores(tenant_id);
}

function getTopBoostedLeads(tenant_id, limit) {
  return global.predictiveScore.getTopBoostedLeads(tenant_id, limit);
}

// Stats et monitoring
function getScoringStats() {
  return global.predictiveScore.getScoringStats();
}

function scoringHealthCheck() {
  return global.predictiveScore.healthCheck();
}

// Administration
function resetScoringStats() {
  return global.predictiveScore.resetStats();
}

module.exports = {
  calculatePredictiveScore,
  calculateTenantScores,
  getTopBoostedLeads,
  getScoringStats,
  scoringHealthCheck,
  resetScoringStats,
  PredictiveScore
};
