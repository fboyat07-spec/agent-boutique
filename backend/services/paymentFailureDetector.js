// ACTION 9 - Détection échec paiement

const { getFlag } = require('./envFlags');
const { logRealError } = require('./realValidationLogger');
const { addRealStep } = require('./realTraceManager');
const { trackConversionAbandoned } = require('./conversionTracking');

// Détecteur d'échec paiement (SAFE - analyse patterns, tagging, alerting)
class PaymentFailureDetector {
  constructor() {
    this.testModeEnabled = getFlag('AGENT_TEST_MODE');
    this.realValidationEnabled = getFlag('AGENT_REAL_VALIDATION_MODE');
    this.realPaymentEnabled = getFlag('AGENT_REAL_PAYMENT_ENABLED');
    this.stats = {
      totalDetections: 0,
      paymentDropoffs: 0,
      abandonedAfterEngagement: 0,
      technicalFailures: 0,
      userRefused: 0,
      byReason: new Map(),
      byTenant: new Map()
    };
    
    console.log('[PAYMENT_FAILURE_DETECTOR_INITIALIZED]', {
      testModeEnabled: this.testModeEnabled,
      realValidationEnabled: this.realValidationEnabled,
      realPaymentEnabled: this.realPaymentEnabled
    });
  }
  
  // Obtenir l'environnement actuel
  getEnvironment() {
    if (this.realPaymentEnabled && this.realValidationEnabled) {
      return 'real_payment';
    } else if (this.realValidationEnabled) {
      return 'real_validation';
    } else if (this.testModeEnabled) {
      return 'test';
    } else {
      return 'production';
    }
  }
  
  // Vérifier si la détection d'échec est activée
  isPaymentFailureDetectionEnabled() {
    return this.realPaymentEnabled && this.realValidationEnabled;
  }
  
  // Détecter les échecs de paiement pour un lead
  async detectPaymentFailures(lead, paymentContext = {}) {
    if (!this.isPaymentFailureDetectionEnabled()) {
      return { enabled: false };
    }
    
    this.stats.totalDetections++;
    
    try {
      console.log('[PAYMENT_FAILURE_DETECTION_START]', {
        leadId: lead.id,
        tenant_id: lead.tenant_id,
        phone: this.maskPhone(lead.phone),
        paymentLinkSentAt: lead.paymentLinkSentAt,
        environment: this.getEnvironment()
      });
      
      const failures = [];
      
      // Détection 1: Lien envoyé mais jamais payé (dropoff)
      const dropoffDetection = await this.detectPaymentDropoff(lead);
      if (dropoffDetection.isDropoff) {
        failures.push(dropoffDetection);
      }
      
      // Détection 2: Abandon après engagement
      const abandonmentDetection = await this.detectAbandonmentAfterEngagement(lead);
      if (abandonmentDetection.isAbandonment) {
        failures.push(abandonmentDetection);
      }
      
      // Détection 3: Échecs techniques répétés
      const technicalFailureDetection = await this.detectTechnicalFailures(lead);
      if (technicalFailureDetection.hasTechnicalFailures) {
        failures.push(technicalFailureDetection);
      }
      
      // Détection 4: Refus utilisateur explicite
      const userRefusalDetection = await this.detectUserRefusal(lead);
      if (userRefusalDetection.isUserRefusal) {
        failures.push(userRefusalDetection);
      }
      
      // Analyser les échecs détectés
      const analysis = this.analyzeDetectedFailures(lead, failures);
      
      // Mettre à jour les stats
      this.updateStats(failures, lead);
      
      // Logger les détections
      this.logDetectionResults(lead, failures, analysis);
      
      // Ajouter les étapes à la trace
      if (paymentContext.traceId) {
        this.addTraceSteps(paymentContext.traceId, failures, analysis);
      }
      
      console.log('[PAYMENT_FAILURE_DETECTION_COMPLETED]', {
        leadId: lead.id,
        failuresCount: failures.length,
        failureTypes: failures.map(f => f.type),
        environment: this.getEnvironment()
      });
      
      return {
        success: true,
        leadId: lead.id,
        failures,
        analysis,
        metadata: {
          detectedAt: new Date(),
          environment: this.getEnvironment()
        }
      };
      
    } catch (error) {
      console.log('[PAYMENT_FAILURE_DETECTION_ERROR]', {
        leadId: lead.id,
        error: error.message,
        environment: this.getEnvironment()
      });
      
      return {
        success: false,
        error: error.message,
        environment: this.getEnvironment()
      };
    }
  }
  
  // Détecter le dropoff de paiement (lien envoyé mais jamais payé)
  async detectPaymentDropoff(lead) {
    if (!lead.paymentLinkSentAt) {
      return {
        isDropoff: false,
        reason: 'no_payment_link_sent'
      };
    }
    
    const paymentLinkAge = Date.now() - new Date(lead.paymentLinkSentAt).getTime();
    const dropoffThreshold = 24 * 60 * 60 * 1000; // 24 heures
    
    if (paymentLinkAge > dropoffThreshold) {
      // Vérifier s'il y a eu des tentatives de paiement
      const hasPaymentAttempts = await this.hasPaymentAttempts(lead);
      
      if (!hasPaymentAttempts) {
        this.stats.paymentDropoffs++;
        
        return {
          isDropoff: true,
          type: 'payment_dropoff',
          severity: 'high',
          details: {
            paymentLinkSentAt: lead.paymentLinkSentAt,
            paymentLinkAge: Math.round(paymentLinkAge / (1000 * 60 * 60)), // en heures
            dropoffThreshold: 24,
            hasPaymentAttempts: false
          },
          recommendation: 'Follow up after 24h or simplify payment process'
        };
      }
    }
    
    return {
      isDropoff: false,
      reason: 'payment_link_recent_or_attempts_made'
    };
  }
  
  // Détecter l'abandon après engagement
  async detectAbandonmentAfterEngagement(lead) {
    // Vérifier si le lead était engagé
    const wasEngaged = await this.wasLeadEngaged(lead);
    
    if (!wasEngaged) {
      return {
        isAbandonment: false,
        reason: 'lead_never_engaged'
      };
    }
    
    // Vérifier s'il y a eu des interactions après engagement
    const hasPostEngagementActivity = await this.hasPostEngagementActivity(lead);
    
    if (!hasPostEngagementActivity) {
      this.stats.abandonedAfterEngagement++;
      
      return {
        isAbandonment: true,
        type: 'abandonment_after_engagement',
        severity: 'medium',
        details: {
          wasEngaged: true,
          lastEngagementTime: wasEngaged.lastEngagementTime,
          hasPostEngagementActivity: false
        },
        recommendation: 'Re-engage with different approach or timing'
      };
    }
    
    return {
      isAbandonment: false,
      reason: 'post_engagement_activity_detected'
    };
  }
  
  // Détecter les échecs techniques
  async detectTechnicalFailures(lead) {
    const technicalFailures = await this.getTechnicalFailures(lead);
    
    if (technicalFailures.length > 0) {
      this.stats.technicalFailures++;
      
      return {
        hasTechnicalFailures: true,
        type: 'technical_failures',
        severity: 'high',
        details: {
          failureCount: technicalFailures.length,
          failures: technicalFailures,
          lastFailureTime: technicalFailures[0]?.timestamp
        },
        recommendation: 'Fix technical issues and retry payment'
      };
    }
    
    return {
      hasTechnicalFailures: false,
      reason: 'no_technical_failures_detected'
    };
  }
  
  // Détecter le refus utilisateur
  async detectUserRefusal(lead) {
    const userRefusals = await this.getUserRefusals(lead);
    
    if (userRefusals.length > 0) {
      this.stats.userRefused++;
      
      return {
        isUserRefusal: true,
        type: 'user_refusal',
        severity: 'low',
        details: {
          refusalCount: userRefusals.length,
          refusals: userRefusals,
          lastRefusalTime: userRefusals[0]?.timestamp
        },
        recommendation: 'Respect user decision and follow up later if appropriate'
      };
    }
    
    return {
      isUserRefusal: false,
      reason: 'no_user_refusal_detected'
    };
  }
  
  // Vérifier s'il y a eu des tentatives de paiement
  async hasPaymentAttempts(lead) {
    // Simulation - en production, vérifierait dans la base de données
    return false; // Simulation
  }
  
  // Vérifier si le lead était engagé
  async wasLeadEngaged(lead) {
    // Simulation - en production, vérifierait les traces d'engagement
    const engagementThreshold = 2; // Au moins 2 messages échangés
    
    // Simulation - vérifier si le lead a répondu à des messages
    return {
      wasEngaged: Math.random() > 0.5, // Simulation
      lastEngagementTime: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000)
    };
  }
  
  // Vérifier s'il y a eu des activités après engagement
  async hasPostEngagementActivity(lead) {
    // Simulation - en production, vérifierait les activités après engagement
    return Math.random() > 0.7; // Simulation
  }
  
  // Obtenir les échecs techniques
  async getTechnicalFailures(lead) {
    // Simulation - en production, vérifierait les logs d'erreurs techniques
    const failures = [];
    
    // Simuler des échecs techniques aléatoires
    if (Math.random() > 0.8) {
      failures.push({
        type: 'stripe_error',
        error: 'Payment method declined',
        timestamp: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000)
      });
    }
    
    return failures;
  }
  
  // Obtenir les refus utilisateur
  async getUserRefusals(lead) {
    // Simulation - en production, vérifierait les messages de refus
    const refusals = [];
    
    // Simuler des refus utilisateur aléatoires
    if (Math.random() > 0.9) {
      refusals.push({
        type: 'explicit_refusal',
        message: 'Not interested right now',
        timestamp: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000)
      });
    }
    
    return refusals;
  }
  
  // Analyser les échecs détectés
  analyzeDetectedFailures(lead, failures) {
    const analysis = {
      totalFailures: failures.length,
      severity: 'low',
      primaryFailureType: null,
      needsIntervention: false,
      recommendedActions: []
    };
    
    // Déterminer la sévérité globale
    const severities = failures.map(f => f.severity || 'low');
    if (severities.includes('high')) {
      analysis.severity = 'high';
      analysis.needsIntervention = true;
    } else if (severities.includes('medium')) {
      analysis.severity = 'medium';
      analysis.needsIntervention = true;
    }
    
    // Déterminer le type d'échec principal
    if (failures.length > 0) {
      const failureTypes = failures.map(f => f.type);
      analysis.primaryFailureType = failureTypes[0]; // Prendre le premier
    }
    
    // Générer des actions recommandées
    for (const failure of failures) {
      if (failure.recommendation) {
        analysis.recommendedActions.push(failure.recommendation);
      }
    }
    
    // Ajouter des recommandations basées sur l'analyse
    if (analysis.severity === 'high') {
      analysis.recommendedActions.push('Immediate intervention required');
    }
    
    if (failures.some(f => f.type === 'payment_dropoff')) {
      analysis.recommendedActions.push('Consider simplifying payment process');
    }
    
    if (failures.some(f => f.type === 'technical_failures')) {
      analysis.recommendedActions.push('Fix technical issues before retry');
    }
    
    return analysis;
  }
  
  // Logger les résultats de détection
  logDetectionResults(lead, failures, analysis) {
    for (const failure of failures) {
      logRealError('payment_failure_detected', lead.phone, lead.tenant_id, lead.id, new Error(failure.type), {
        failureType: failure.type,
        severity: failure.severity,
        details: failure.details,
        environment: this.getEnvironment()
      });
    }
    
    // Logger l'analyse globale
    logRealError('payment_failure_analysis', lead.phone, lead.tenant_id, lead.id, new Error('Analysis completed'), {
      totalFailures: analysis.totalFailures,
      severity: analysis.severity,
      primaryFailureType: analysis.primaryFailureType,
      needsIntervention: analysis.needsIntervention,
      environment: this.getEnvironment()
    });
    
    // Si abandon, tracker dans conversion tracking
    if (failures.some(f => f.type === 'abandonment_after_engagement' || f.type === 'payment_dropoff')) {
      trackConversionAbandoned(lead, {
        abandonReason: analysis.primaryFailureType,
        lastStage: 'payment_link_sent',
        severity: analysis.severity
      });
    }
  }
  
  // Ajouter les étapes à la trace
  addTraceSteps(traceId, failures, analysis) {
    for (const failure of failures) {
      addRealStep(traceId, `payment_failure_${failure.type}`, {
        failureType: failure.type,
        severity: failure.severity,
        details: failure.details,
        environment: this.getEnvironment()
      });
    }
    
    // Ajouter l'étape d'analyse
    addRealStep(traceId, 'payment_failure_analysis', {
      totalFailures: analysis.totalFailures,
      severity: analysis.severity,
      primaryFailureType: analysis.primaryFailureType,
      needsIntervention: analysis.needsIntervention,
      recommendedActions: analysis.recommendedActions,
      environment: this.getEnvironment()
    });
  }
  
  // Mettre à jour les statistiques
  updateStats(failures, lead) {
    for (const failure of failures) {
      this.stats.byReason.set(failure.type, (this.stats.byReason.get(failure.type) || 0) + 1);
    }
    
    if (lead && lead.tenant_id) {
      this.stats.byTenant.set(lead.tenant_id, (this.stats.byTenant.get(lead.tenant_id) || 0) + 1);
    }
  }
  
  // Obtenir les statistiques de détection
  getDetectionStats() {
    if (!this.isPaymentFailureDetectionEnabled()) {
      return { enabled: false };
    }
    
    const totalDetections = this.stats.totalDetections;
    const detectionRate = totalDetections > 0 ? 
      ((this.stats.paymentDropoffs + this.stats.abandonedAfterEngagement + this.stats.technicalFailures + this.stats.userRefused) / totalDetections) * 100 : 0;
    
    return {
      enabled: true,
      environment: this.getEnvironment(),
      stats: {
        totalDetections: this.stats.totalDetections,
        paymentDropoffs: this.stats.paymentDropoffs,
        abandonedAfterEngagement: this.stats.abandonedAfterEngagement,
        technicalFailures: this.stats.technicalFailures,
        userRefused: this.stats.userRefused,
        detectionRate: Math.round(detectionRate * 100) / 100
      },
      byReason: Object.fromEntries(this.stats.byReason),
      byTenant: Object.fromEntries(this.stats.byTenant),
      uptime: process.uptime()
    };
  }
  
  // Obtenir le rapport de détection
  getDetectionReport() {
    if (!this.isPaymentFailureDetectionEnabled()) {
      return { enabled: false };
    }
    
    const stats = this.getDetectionStats();
    
    // Analyser les patterns d'échec
    const patterns = this.analyzeFailurePatterns(stats);
    
    // Générer des recommandations
    const recommendations = this.generateFailureRecommendations(stats, patterns);
    
    return {
      enabled: true,
      environment: stats.environment,
      stats: stats.stats,
      patterns,
      recommendations,
      metadata: {
        generated_at: new Date(),
        detection_type: 'payment_failure'
      }
    };
  }
  
  // Analyser les patterns d'échec
  analyzeFailurePatterns(stats) {
    const patterns = {
      mostCommonFailure: null,
      mostAffectedTenant: null,
      failureTrends: [],
      interventionRate: 0
    };
    
    // Échec le plus commun
    let maxCount = 0;
    for (const [reason, count] of Object.entries(stats.byReason)) {
      if (count > maxCount) {
        maxCount = count;
        patterns.mostCommonFailure = { reason, count };
      }
    }
    
    // Tenant le plus affecté
    maxCount = 0;
    for (const [tenant, count] of Object.entries(stats.byTenant)) {
      if (count > maxCount) {
        maxCount = count;
        patterns.mostAffectedTenant = { tenant, count };
      }
    }
    
    // Taux d'intervention requis
    const highSeverityFailures = (stats.stats.paymentDropoffs + stats.stats.technicalFailures);
    patterns.interventionRate = stats.stats.totalDetections > 0 ? 
      (highSeverityFailures / stats.stats.totalDetections) * 100 : 0;
    
    return patterns;
  }
  
  // Générer des recommandations
  generateFailureRecommendations(stats, patterns) {
    const recommendations = [];
    
    if (patterns.mostCommonFailure?.reason === 'payment_dropoff') {
      recommendations.push({
        type: 'critical',
        message: 'High payment dropoff rate detected',
        action: 'Simplify payment process and improve user experience',
        priority: 'high'
      });
    }
    
    if (patterns.mostCommonFailure?.reason === 'technical_failures') {
      recommendations.push({
        type: 'critical',
        message: 'Technical payment failures detected',
        action: 'Fix technical issues and improve error handling',
        priority: 'high'
      });
    }
    
    if (stats.stats.abandonedAfterEngagement > stats.stats.paymentDropoffs) {
      recommendations.push({
        type: 'warning',
        message: 'High abandonment after engagement',
        action: 'Review engagement strategy and timing',
        priority: 'medium'
      });
    }
    
    if (patterns.interventionRate > 50) {
      recommendations.push({
        type: 'critical',
        message: `High intervention rate (${Math.round(patterns.interventionRate)}%)`,
        action: 'Address systemic payment issues immediately',
        priority: 'critical'
      });
    }
    
    if (recommendations.length === 0) {
      recommendations.push({
        type: 'info',
        message: 'Payment failure detection operating normally',
        action: 'Continue monitoring and optimize based on data',
        priority: 'low'
      });
    }
    
    return recommendations;
  }
  
  // Masquer téléphone pour logs
  maskPhone(phone) {
    if (!phone || typeof phone !== 'string') return 'unknown';
    return phone.slice(0, -4) + '****';
  }
  
  // Réinitialiser les statistiques
  resetStats() {
    this.stats = {
      totalDetections: 0,
      paymentDropoffs: 0,
      abandonedAfterEngagement: 0,
      technicalFailures: 0,
      userRefused: 0,
      byReason: new Map(),
      byTenant: new Map()
    };
    
    console.log('[PAYMENT_FAILURE_DETECTOR_STATS_RESET]');
  }
}

// Instance globale du détecteur
if (!global.paymentFailureDetector) {
  global.paymentFailureDetector = new PaymentFailureDetector();
}

// Fonctions principales
async function detectPaymentFailures(lead, paymentContext) {
  return await global.paymentFailureDetector.detectPaymentFailures(lead, paymentContext);
}

// Stats et monitoring
function getPaymentFailureDetectorStats() {
  return global.paymentFailureDetector.getDetectionStats();
}

function getPaymentFailureDetectorReport() {
  return global.paymentFailureDetector.getDetectionReport();
}

// Administration
function resetPaymentFailureDetectorStats() {
  return global.paymentFailureDetector.resetStats();
}

module.exports = {
  detectPaymentFailures,
  getPaymentFailureDetectorStats,
  getPaymentFailureDetectorReport,
  resetPaymentFailureDetectorStats,
  PaymentFailureDetector
};
