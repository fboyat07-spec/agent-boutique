// ACTION 7 - Détection leads chauds

const { getLeadsByTenant } = require('./tenantIsolationSafe');
const { calculatePredictiveScore } = require('./predictiveScore');
const BusinessLogger = require('./businessLogger');
const { trackEvent } = require('./eventTracker');

// Détecteur de leads chauds (priorisation sans modifier scheduler)
class HotLeadDetector {
  constructor() {
    this.enabled = process.env.HOT_LEAD_DETECTION_ENABLED === 'true';
    this.criteria = {
      minScore: 70,           // Score minimum
      minPredictiveBoost: 10, // Boost prédictif minimum
      maxRecencyHours: 24,    // Récence maximum en heures
      requiredStatus: ['INTERESTED', 'ENGAGED', 'CLOSING'], // Statuts requis
      minMessageCount: 2      // Messages minimum
    };
    this.stats = {
      totalDetections: 0,
      hotLeadsFound: 0,
      byTenant: new Map(),
      errors: 0
    };
    
    console.log('[HOT_LEAD_DETECTOR_INITIALIZED]', {
      enabled: this.enabled,
      criteria: this.criteria
    });
  }
  
  // Détecter les leads chauds pour un tenant
  detectHotLeads(tenant_id) {
    if (!this.enabled) {
      return { enabled: false, reason: 'hot_lead_detection_disabled' };
    }
    
    try {
      console.log('[HOT_LEAD_DETECTION_STARTED]', { tenant_id });
      
      const leads = getLeadsByTenant(tenant_id);
      const hotLeads = [];
      
      for (const lead of leads) {
        const isHot = this.evaluateHotLead(lead, tenant_id);
        
        if (isHot.hot) {
          hotLeads.push({
            ...lead,
            hotLeadData: isHot,
            phone: this.maskPhone(lead.phone) // Masquer pour sécurité
          });
          
          // Tracker l'événement
          trackEvent('hot_lead_detected', {
            tenant_id,
            lead_id: lead.id,
            score: lead.score,
            boost: isHot.predictiveBoost,
            reasons: isHot.reasons
          });
        }
      }
      
      // Trier par "chaleur" (score + boost)
      hotLeads.sort((a, b) => {
        const aHeat = (a.score || 0) + (a.hotLeadData.predictiveBoost || 0);
        const bHeat = (b.score || 0) + (b.hotLeadData.predictiveBoost || 0);
        return bHeat - aHeat;
      });
      
      // Stats
      this.stats.totalDetections++;
      this.stats.hotLeadsFound += hotLeads.length;
      this.stats.byTenant.set(tenant_id, hotLeads.length);
      
      console.log('[HOT_LEAD_DETECTION_COMPLETED]', {
        tenant_id,
        totalLeads: leads.length,
        hotLeadsFound: hotLeads.length,
        topScore: hotLeads.length > 0 ? (hotLeads[0].score || 0) + (hotLeads[0].hotLeadData.predictiveBoost || 0) : 0
      });
      
      BusinessLogger.logTenantEvent('hot_leads_detected', tenant_id, {
        totalLeads: leads.length,
        hotLeadsFound: hotLeads.length,
        topScore: hotLeads.length > 0 ? (hotLeads[0].score || 0) + (hotLeads[0].hotLeadData.predictiveBoost || 0) : 0
      });
      
      return {
        enabled: true,
        tenant_id,
        totalLeads: leads.length,
        hotLeadsFound: hotLeads.length,
        hotLeads: hotLeads.slice(0, 20), // Top 20 max
        metadata: {
          detectedAt: new Date(),
          criteria: this.criteria
        }
      };
      
    } catch (error) {
      this.stats.errors++;
      
      console.log('[HOT_LEAD_DETECTION_ERROR]', {
        tenant_id,
        error: error.message
      });
      
      return {
        enabled: false,
        reason: 'detection_error',
        error: error.message
      };
    }
  }
  
  // Évaluer si un lead est chaud
  evaluateHotLead(lead, tenant_id) {
    const reasons = [];
    let score = 0;
    let maxScore = 0;
    
    // Critère 1: Score de base
    const baseScore = lead.score || 0;
    maxScore += 25;
    
    if (baseScore >= this.criteria.minScore) {
      score += 25;
      reasons.push('high_base_score');
    } else if (baseScore >= 50) {
      score += 15;
      reasons.push('moderate_base_score');
    }
    
    // Critère 2: Boost prédictif
    const predictiveResult = calculatePredictiveScore(lead, tenant_id);
    const predictiveBoost = predictiveResult.boost || 0;
    maxScore += 25;
    
    if (predictiveBoost >= this.criteria.minPredictiveBoost) {
      score += 25;
      reasons.push('high_predictive_boost');
    } else if (predictiveBoost >= 5) {
      score += 15;
      reasons.push('moderate_predictive_boost');
    }
    
    // Critère 3: Récence de l'activité
    const recencyScore = this.evaluateRecency(lead);
    maxScore += 20;
    score += recencyScore.score;
    if (recencyScore.reason) {
      reasons.push(recencyScore.reason);
    }
    
    // Critère 4: Statut approprié
    const statusScore = this.evaluateStatus(lead.status);
    maxScore += 15;
    score += statusScore.score;
    if (statusScore.reason) {
      reasons.push(statusScore.reason);
    }
    
    // Critère 5: Engagement (nombre de messages)
    const engagementScore = this.evaluateEngagement(lead);
    maxScore += 15;
    score += engagementScore.score;
    if (engagementScore.reason) {
      reasons.push(engagementScore.reason);
    }
    
    // Calculer le score final (pourcentage)
    const finalScore = maxScore > 0 ? (score / maxScore) * 100 : 0;
    
    // Déterminer si le lead est chaud (score >= 70%)
    const isHot = finalScore >= 70;
    
    return {
      hot: isHot,
      score: Math.round(finalScore),
      baseScore,
      predictiveBoost,
      recencyScore: recencyScore.score,
      statusScore: statusScore.score,
      engagementScore: engagementScore.score,
      reasons,
      metadata: {
        evaluatedAt: new Date(),
        maxScore,
        threshold: 70
      }
    };
  }
  
  // Évaluer la récence
  evaluateRecency(lead) {
    if (!lead.lastContactAt) {
      return { score: 0, reason: 'no_recent_activity' };
    }
    
    const now = Date.now();
    const lastContactTime = new Date(lead.lastContactAt).getTime();
    const hoursSinceLastContact = (now - lastContactTime) / (1000 * 60 * 60);
    
    if (hoursSinceLastContact <= this.criteria.maxRecencyHours) {
      return { score: 20, reason: 'very_recent_activity' };
    } else if (hoursSinceLastContact <= 48) {
      return { score: 15, reason: 'recent_activity' };
    } else if (hoursSinceLastContact <= 72) {
      return { score: 10, reason: 'moderate_activity' };
    } else {
      return { score: 5, reason: 'old_activity' };
    }
  }
  
  // Évaluer le statut
  evaluateStatus(status) {
    if (!status) {
      return { score: 0, reason: 'no_status' };
    }
    
    if (this.criteria.requiredStatus.includes(status)) {
      if (status === 'CLOSING') {
        return { score: 15, reason: 'closing_status' };
      } else if (status === 'INTERESTED') {
        return { score: 12, reason: 'interested_status' };
      } else if (status === 'ENGAGED') {
        return { score: 10, reason: 'engaged_status' };
      }
    } else if (status === 'CONTACTED') {
      return { score: 5, reason: 'contacted_status' };
    } else if (status === 'NEW') {
      return { score: 2, reason: 'new_status' };
    }
    
    return { score: 0, reason: 'other_status' };
  }
  
  // Évaluer l'engagement
  evaluateEngagement(lead) {
    const metadata = lead.metadata || {};
    const messageCount = metadata.messageCount || 1;
    
    if (messageCount >= this.criteria.minMessageCount) {
      if (messageCount >= 5) {
        return { score: 15, reason: 'high_engagement' };
      } else if (messageCount >= 3) {
        return { score: 12, reason: 'moderate_engagement' };
      } else {
        return { score: 10, reason: 'minimum_engagement' };
      }
    } else {
      return { score: 5, reason: 'low_engagement' };
    }
  }
  
  // Obtenir les leads chauds priorisés pour traitement
  getPrioritizedHotLeads(tenant_id, limit = 10) {
    const detection = this.detectHotLeads(tenant_id);
    
    if (!detection.enabled) {
      return detection;
    }
    
    // Retourner seulement les leads chauds avec priorité
    const prioritizedLeads = detection.hotLeads.map(lead => ({
      ...lead,
      priority: this.calculatePriority(lead),
      recommendedAction: this.recommendAction(lead)
    }));
    
    // Trier par priorité
    prioritizedLeads.sort((a, b) => b.priority - a.priority);
    
    return {
      ...detection,
      prioritizedLeads: prioritizedLeads.slice(0, limit),
      recommendations: this.generateGlobalRecommendations(prioritizedLeads)
    };
  }
  
  // Calculer la priorité d'un lead chaud
  calculatePriority(lead) {
    const heatScore = (lead.score || 0) + (lead.hotLeadData.predictiveBoost || 0);
    const statusWeight = this.getStatusWeight(lead.status);
    const recencyWeight = this.getRecencyWeight(lead.lastContactAt);
    
    return Math.round(heatScore * statusWeight * recencyWeight);
  }
  
  // Obtenir le poids du statut
  getStatusWeight(status) {
    const weights = {
      'CLOSING': 1.5,
      'INTERESTED': 1.3,
      'ENGAGED': 1.2,
      'CONTACTED': 1.0,
      'NEW': 0.8,
      'LOST': 0.5
    };
    
    return weights[status] || 1.0;
  }
  
  // Obtenir le poids de récence
  getRecencyWeight(lastContactAt) {
    if (!lastContactAt) {
      return 0.5;
    }
    
    const hoursSinceLastContact = (Date.now() - new Date(lastContactAt).getTime()) / (1000 * 60 * 60);
    
    if (hoursSinceLastContact <= 6) {
      return 1.5;
    } else if (hoursSinceLastContact <= 24) {
      return 1.3;
    } else if (hoursSinceLastContact <= 48) {
      return 1.1;
    } else {
      return 0.8;
    }
  }
  
  // Recommander une action pour un lead
  recommendAction(lead) {
    const status = lead.status;
    const score = (lead.score || 0) + (lead.hotLeadData.predictiveBoost || 0);
    
    if (status === 'CLOSING') {
      return 'immediate_followup';
    } else if (status === 'INTERESTED' && score > 85) {
      return 'accelerate_to_closing';
    } else if (status === 'ENGAGED' && score > 80) {
      return 'send_proposal';
    } else if (status === 'CONTACTED' && score > 75) {
      return 'personalized_followup';
    } else {
      return 'standard_nurturing';
    }
  }
  
  // Générer des recommandations globales
  generateGlobalRecommendations(hotLeads) {
    const recommendations = [];
    
    if (hotLeads.length === 0) {
      recommendations.push('No hot leads detected. Consider lead generation strategies.');
      return recommendations;
    }
    
    // Analyser la distribution des statuts
    const statusDistribution = {};
    for (const lead of hotLeads) {
      statusDistribution[lead.status] = (statusDistribution[lead.status] || 0) + 1;
    }
    
    // Recommandations basées sur la distribution
    if (statusDistribution['CLOSING'] > 0) {
      recommendations.push(`Prioritize ${statusDistribution['CLOSING']} leads in CLOSING stage - immediate conversion opportunity.`);
    }
    
    if (statusDistribution['INTERESTED'] > hotLeads.length * 0.5) {
      recommendations.push('High number of INTERESTED leads - consider accelerating to CLOSING stage.');
    }
    
    if (hotLeads.filter(l => l.hotLeadData.reasons.includes('high_predictive_boost')).length > hotLeads.length * 0.3) {
      recommendations.push('Many leads with high predictive scores - consider personalized outreach.');
    }
    
    // Recommandation basée sur le score moyen
    const avgScore = hotLeads.reduce((sum, lead) => sum + ((lead.score || 0) + (lead.hotLeadData.predictiveBoost || 0)), 0) / hotLeads.length;
    
    if (avgScore > 90) {
      recommendations.push('Very high average score - implement aggressive closing strategy.');
    } else if (avgScore > 80) {
      recommendations.push('High average score - focus on personalized follow-ups.');
    }
    
    return recommendations;
  }
  
  // Obtenir les stats du détecteur
  getDetectorStats() {
    const byTenantStats = {};
    
    for (const [tenant_id, count] of this.stats.byTenant.entries()) {
      byTenantStats[tenant_id] = count;
    }
    
    return {
      enabled: this.enabled,
      criteria: this.criteria,
      stats: {
        totalDetections: this.stats.totalDetections,
        hotLeadsFound: this.stats.hotLeadsFound,
        errors: this.stats.errors,
        avgHotLeadsPerDetection: this.stats.totalDetections > 0 ? 
          this.stats.hotLeadsFound / this.stats.totalDetections : 0
      },
      byTenant: byTenantStats,
      uptime: process.uptime()
    };
  }
  
  // Health check
  healthCheck() {
    const stats = this.getDetectorStats();
    
    const health = {
      status: 'healthy',
      enabled: stats.enabled,
      issues: [],
      recommendations: []
    };
    
    // Vérifier taux d'erreur
    const errorRate = this.stats.totalDetections > 0 ? 
      (this.stats.errors / this.stats.totalDetections) * 100 : 0;
    
    if (errorRate > 15) {
      health.issues.push('High error rate');
      health.recommendations.push('Check data sources and detection logic');
    }
    
    // Vérifier détection de leads chauds
    if (this.stats.totalDetections > 10 && stats.stats.avgHotLeadsPerDetection < 1) {
      health.issues.push('Very few hot leads detected');
      health.recommendations.push('Review detection criteria or lead quality');
    }
    
    // Vérifier critères
    if (this.criteria.minScore > 90) {
      health.issues.push('Score threshold too high');
      health.recommendations.push('Consider lowering minimum score criteria');
    }
    
    if (health.issues.length > 0) {
      health.status = 'warning';
    }
    
    return {
      ...health,
      stats: {
        totalDetections: this.stats.totalDetections,
        hotLeadsFound: this.stats.hotLeadsFound,
        avgHotLeadsPerDetection: Math.round(stats.stats.avgHotLeadsPerDetection * 100) / 100,
        errorRate: Math.round(errorRate * 100) / 100
      }
    };
  }
  
  // Réinitialiser stats
  resetStats() {
    this.stats = {
      totalDetections: 0,
      hotLeadsFound: 0,
      byTenant: new Map(),
      errors: 0
    };
    
    console.log('[HOT_LEAD_DETECTOR_STATS_RESET]');
  }
  
  // Masquer téléphone pour logs
  maskPhone(phone) {
    if (!phone || typeof phone !== 'string') return 'unknown';
    return phone.slice(0, -4) + '****';
  }
}

// Instance globale du détecteur
if (!global.hotLeadDetector) {
  global.hotLeadDetector = new HotLeadDetector();
}

// Fonctions principales
function detectHotLeads(tenant_id) {
  return global.hotLeadDetector.detectHotLeads(tenant_id);
}

function getPrioritizedHotLeads(tenant_id, limit) {
  return global.hotLeadDetector.getPrioritizedHotLeads(tenant_id, limit);
}

// Stats et monitoring
function getDetectorStats() {
  return global.hotLeadDetector.getDetectorStats();
}

function detectorHealthCheck() {
  return global.hotLeadDetector.healthCheck();
}

// Administration
function resetDetectorStats() {
  return global.hotLeadDetector.resetStats();
}

module.exports = {
  detectHotLeads,
  getPrioritizedHotLeads,
  getDetectorStats,
  detectorHealthCheck,
  resetDetectorStats,
  HotLeadDetector
};
