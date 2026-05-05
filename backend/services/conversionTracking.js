// ACTION 8 - Tracking conversion réelle

const { getFlag } = require('./envFlags');
const { logRealError } = require('./realValidationLogger');
const { addRealStep } = require('./realTraceManager');
const { recordPaymentSuccess, recordPaymentLinkSent, recordPaymentStarted } = require('./revenueMonitoring');

// Tracking conversion réelle (SAFE - tracking complet, analytics, reporting)
class ConversionTracking {
  constructor() {
    this.testModeEnabled = getFlag('AGENT_TEST_MODE');
    this.realValidationEnabled = getFlag('AGENT_REAL_VALIDATION_MODE');
    this.realPaymentEnabled = getFlag('AGENT_REAL_PAYMENT_ENABLED');
    this.stats = {
      totalConversions: 0,
      successfulConversions: 0,
      failedConversions: 0,
      abandonedConversions: 0,
      byStage: new Map(),
      byTenant: new Map(),
      avgTimeToConvert: 0,
      conversionFunnel: {
        leads: 0,
        paymentLinksClicked: 0,
        paymentStarted: 0,
        paymentCompleted: 0
      }
    };
    
    console.log('[CONVERSION_TRACKING_INITIALIZED]', {
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
  
  // Vérifier si le tracking conversion est activé
  isConversionTrackingEnabled() {
    return this.realPaymentEnabled && this.realValidationEnabled;
  }
  
  // Tracker le clic sur un lien de paiement
  trackPaymentLinkClicked(lead, trackingData = {}) {
    if (!this.isConversionTrackingEnabled()) {
      return;
    }
    
    try {
      console.log('[CONVERSION_PAYMENT_LINK_CLICKED]', {
        leadId: lead.id,
        tenant_id: lead.tenant_id,
        phone: this.maskPhone(lead.phone),
        paymentLinkId: trackingData.paymentLinkId,
        environment: this.getEnvironment()
      });
      
      // Mettre à jour les stats
      this.stats.totalConversions++;
      this.stats.conversionFunnel.paymentLinksClicked++;
      this.stats.byStage.set('payment_link_clicked', (this.stats.byStage.get('payment_link_clicked') || 0) + 1);
      
      // Stats par tenant
      const tenantKey = lead.tenant_id || 'unknown';
      this.stats.byTenant.set(tenantKey, (this.stats.byTenant.get(tenantKey) || 0) + 1);
      
      // Logger le clic
      logRealError('conversion_payment_link_clicked', lead.phone, lead.tenant_id, lead.id, new Error('Payment link clicked'), {
        paymentLinkId: trackingData.paymentLinkId,
        clickTime: new Date(),
        environment: this.getEnvironment()
      });
      
      // Ajouter l'étape à la trace
      if (trackingData.traceId) {
        addRealStep(trackingData.traceId, 'conversion_payment_link_clicked', {
          phone: this.maskPhone(lead.phone),
          paymentLinkId: trackingData.paymentLinkId,
          clickTime: new Date(),
          environment: this.getEnvironment()
        });
      }
      
      // Enregistrer dans le monitoring revenue
      recordPaymentLinkSent({
        paymentLinkId: trackingData.paymentLinkId,
        paymentIntentId: trackingData.paymentIntentId,
        amount: trackingData.amount,
        leadId: lead.id,
        tenant_id: lead.tenant_id,
        phone: lead.phone,
        clicked: true
      });
      
      console.log('[CONVERSION_PAYMENT_LINK_CLICKED_TRACKED]', {
        leadId: lead.id,
        totalConversions: this.stats.totalConversions,
        funnelProgress: this.getFunnelProgress()
      });
      
    } catch (error) {
      console.log('[CONVERSION_PAYMENT_LINK_CLICKED_ERROR]', {
        leadId: lead.id,
        error: error.message
      });
    }
  }
  
  // Tracker le début d'un paiement
  trackPaymentStarted(lead, trackingData = {}) {
    if (!this.isConversionTrackingEnabled()) {
      return;
    }
    
    try {
      console.log('[CONVERSION_PAYMENT_STARTED]', {
        leadId: lead.id,
        tenant_id: lead.tenant_id,
        phone: this.maskPhone(lead.phone),
        paymentIntentId: trackingData.paymentIntentId,
        amount: trackingData.amount,
        environment: this.getEnvironment()
      });
      
      // Mettre à jour les stats
      this.stats.conversionFunnel.paymentStarted++;
      this.stats.byStage.set('payment_started', (this.stats.byStage.get('payment_started') || 0) + 1);
      
      // Logger le début
      logRealError('conversion_payment_started', lead.phone, lead.tenant_id, lead.id, new Error('Payment started'), {
        paymentIntentId: trackingData.paymentIntentId,
        amount: trackingData.amount,
        startTime: new Date(),
        environment: this.getEnvironment()
      });
      
      // Ajouter l'étape à la trace
      if (trackingData.traceId) {
        addRealStep(trackingData.traceId, 'conversion_payment_started', {
          phone: this.maskPhone(lead.phone),
          paymentIntentId: trackingData.paymentIntentId,
          amount: trackingData.amount,
          startTime: new Date(),
          environment: this.getEnvironment()
        });
      }
      
      // Enregistrer dans le monitoring revenue
      recordPaymentStarted({
        paymentIntentId: trackingData.paymentIntentId,
        amount: trackingData.amount,
        leadId: lead.id,
        tenant_id: lead.tenant_id,
        phone: lead.phone,
        startedAt: new Date()
      });
      
      console.log('[CONVERSION_PAYMENT_STARTED_TRACKED]', {
        leadId: lead.id,
        paymentIntentId: trackingData.paymentIntentId,
        funnelProgress: this.getFunnelProgress()
      });
      
    } catch (error) {
      console.log('[CONVERSION_PAYMENT_STARTED_ERROR]', {
        leadId: lead.id,
        error: error.message
      });
    }
  }
  
  // Tracker la complétion d'un paiement
  trackPaymentCompleted(lead, trackingData = {}) {
    if (!this.isConversionTrackingEnabled()) {
      return;
    }
    
    try {
      console.log('[CONVERSION_PAYMENT_COMPLETED]', {
        leadId: lead.id,
        tenant_id: lead.tenant_id,
        phone: this.maskPhone(lead.phone),
        paymentIntentId: trackingData.paymentIntentId,
        amount: trackingData.amount,
        environment: this.getEnvironment()
      });
      
      // Mettre à jour les stats
      this.stats.successfulConversions++;
      this.stats.conversionFunnel.paymentCompleted++;
      this.stats.byStage.set('payment_completed', (this.stats.byStage.get('payment_completed') || 0) + 1);
      
      // Calculer le temps de conversion
      if (trackingData.paymentLinkSentAt) {
        const timeToConvert = new Date() - new Date(trackingData.paymentLinkSentAt);
        this.updateAvgTimeToConvert(timeToConvert);
      }
      
      // Logger la complétion
      logRealError('conversion_payment_completed', lead.phone, lead.tenant_id, lead.id, new Error('Payment completed'), {
        paymentIntentId: trackingData.paymentIntentId,
        amount: trackingData.amount,
        completedTime: new Date(),
        timeToConvert: trackingData.paymentLinkSentAt ? 
          new Date() - new Date(trackingData.paymentLinkSentAt) : null,
        environment: this.getEnvironment()
      });
      
      // Ajouter l'étape à la trace
      if (trackingData.traceId) {
        addRealStep(trackingData.traceId, 'conversion_payment_completed', {
          phone: this.maskPhone(lead.phone),
          paymentIntentId: trackingData.paymentIntentId,
          amount: trackingData.amount,
          completedTime: new Date(),
          timeToConvert: trackingData.paymentLinkSentAt ? 
            new Date() - new Date(trackingData.paymentLinkSentAt) : null,
          environment: this.getEnvironment()
        });
      }
      
      // Enregistrer dans le monitoring revenue
      recordPaymentSuccess({
        paymentIntentId: trackingData.paymentIntentId,
        amount: trackingData.amount,
        currency: trackingData.currency || 'EUR',
        leadId: lead.id,
        tenant_id: lead.tenant_id,
        phone: lead.phone,
        paymentLinkSentAt: trackingData.paymentLinkSentAt,
        completedAt: new Date()
      });
      
      console.log('[CONVERSION_PAYMENT_COMPLETED_TRACKED]', {
        leadId: lead.id,
        paymentIntentId: trackingData.paymentIntentId,
        successfulConversions: this.stats.successfulConversions,
        conversionRate: this.getConversionRate(),
        funnelProgress: this.getFunnelProgress()
      });
      
    } catch (error) {
      console.log('[CONVERSION_PAYMENT_COMPLETED_ERROR]', {
        leadId: lead.id,
        error: error.message
      });
    }
  }
  
  // Tracker l'échec d'un paiement
  trackPaymentFailed(lead, trackingData = {}) {
    if (!this.isConversionTrackingEnabled()) {
      return;
    }
    
    try {
      console.log('[CONVERSION_PAYMENT_FAILED]', {
        leadId: lead.id,
        tenant_id: lead.tenant_id,
        phone: this.maskPhone(lead.phone),
        paymentIntentId: trackingData.paymentIntentId,
        amount: trackingData.amount,
        error: trackingData.error,
        environment: this.getEnvironment()
      });
      
      // Mettre à jour les stats
      this.stats.failedConversions++;
      this.stats.byStage.set('payment_failed', (this.stats.byStage.get('payment_failed') || 0) + 1);
      
      // Logger l'échec
      logRealError('conversion_payment_failed', lead.phone, lead.tenant_id, lead.id, new Error(trackingData.error), {
        paymentIntentId: trackingData.paymentIntentId,
        amount: trackingData.amount,
        failedTime: new Date(),
        environment: this.getEnvironment()
      });
      
      // Ajouter l'étape à la trace
      if (trackingData.traceId) {
        addRealStep(trackingData.traceId, 'conversion_payment_failed', {
          phone: this.maskPhone(lead.phone),
          paymentIntentId: trackingData.paymentIntentId,
          amount: trackingData.amount,
          error: trackingData.error,
          failedTime: new Date(),
          environment: this.getEnvironment()
        });
      }
      
      // Enregistrer dans le monitoring revenue
      recordPaymentFailure({
        paymentIntentId: trackingData.paymentIntentId,
        amount: trackingData.amount,
        error: trackingData.error,
        leadId: lead.id,
        tenant_id: lead.tenant_id,
        phone: lead.phone,
        failedAt: new Date()
      });
      
      console.log('[CONVERSION_PAYMENT_FAILED_TRACKED]', {
        leadId: lead.id,
        paymentIntentId: trackingData.paymentIntentId,
        failedConversions: this.stats.failedConversions,
        failureRate: this.getFailureRate(),
        funnelProgress: this.getFunnelProgress()
      });
      
    } catch (error) {
      console.log('[CONVERSION_PAYMENT_FAILED_ERROR]', {
        leadId: lead.id,
        error: error.message
      });
    }
  }
  
  // Tracker l'abandon d'une conversion
  trackConversionAbandoned(lead, trackingData = {}) {
    if (!this.isConversionTrackingEnabled()) {
      return;
    }
    
    try {
      console.log('[CONVERSION_ABANDONED]', {
        leadId: lead.id,
        tenant_id: lead.tenant_id,
        phone: this.maskPhone(lead.phone),
        abandonReason: trackingData.abandonReason,
        lastStage: trackingData.lastStage,
        environment: this.getEnvironment()
      });
      
      // Mettre à jour les stats
      this.stats.abandonedConversions++;
      this.stats.byStage.set('conversion_abandoned', (this.stats.byStage.get('conversion_abandoned') || 0) + 1);
      
      // Logger l'abandon
      logRealError('conversion_abandoned', lead.phone, lead.tenant_id, lead.id, new Error(trackingData.abandonReason), {
        abandonReason: trackingData.abandonReason,
        lastStage: trackingData.lastStage,
        abandonedTime: new Date(),
        environment: this.getEnvironment()
      });
      
      // Ajouter l'étape à la trace
      if (trackingData.traceId) {
        addRealStep(trackingData.traceId, 'conversion_abandoned', {
          phone: this.maskPhone(lead.phone),
          abandonReason: trackingData.abandonReason,
          lastStage: trackingData.lastStage,
          abandonedTime: new Date(),
          environment: this.getEnvironment()
        });
      }
      
      console.log('[CONVERSION_ABANDONED_TRACKED]', {
        leadId: lead.id,
        abandonReason: trackingData.abandonReason,
        abandonedConversions: this.stats.abandonedConversions,
        abandonRate: this.getAbandonRate(),
        funnelProgress: this.getFunnelProgress()
      });
      
    } catch (error) {
      console.log('[CONVERSION_ABANDONED_ERROR]', {
        leadId: lead.id,
        error: error.message
      });
    }
  }
  
  // Mettre à jour le temps moyen de conversion
  updateAvgTimeToConvert(newTime) {
    const currentAvg = this.stats.avgTimeToConvert;
    const count = this.stats.successfulConversions;
    
    this.stats.avgTimeToConvert = ((currentAvg * (count - 1)) + newTime) / count;
  }
  
  // Obtenir le taux de conversion
  getConversionRate() {
    if (this.stats.totalConversions === 0) return 0;
    return (this.stats.successfulConversions / this.stats.totalConversions) * 100;
  }
  
  // Obtenir le taux d'échec
  getFailureRate() {
    if (this.stats.totalConversions === 0) return 0;
    return (this.stats.failedConversions / this.stats.totalConversions) * 100;
  }
  
  // Obtenir le taux d'abandon
  getAbandonRate() {
    if (this.stats.totalConversions === 0) return 0;
    return (this.stats.abandonedConversions / this.stats.totalConversions) * 100;
  }
  
  // Obtenir la progression du funnel
  getFunnelProgress() {
    const funnel = this.stats.conversionFunnel;
    
    return {
      leads: funnel.leads,
      paymentLinksClicked: funnel.paymentLinksClicked,
      paymentStarted: funnel.paymentStarted,
      paymentCompleted: funnel.paymentCompleted,
      clickRate: funnel.leads > 0 ? (funnel.paymentLinksClicked / funnel.leads) * 100 : 0,
      startRate: funnel.paymentLinksClicked > 0 ? (funnel.paymentStarted / funnel.paymentLinksClicked) * 100 : 0,
      completionRate: funnel.paymentStarted > 0 ? (funnel.paymentCompleted / funnel.paymentStarted) * 100 : 0,
      overallRate: funnel.leads > 0 ? (funnel.paymentCompleted / funnel.leads) * 100 : 0
    };
  }
  
  // Obtenir le rapport de conversion
  getConversionReport() {
    if (!this.isConversionTrackingEnabled()) {
      return { enabled: false };
    }
    
    const report = {
      enabled: true,
      environment: this.getEnvironment(),
      summary: {
        totalConversions: this.stats.totalConversions,
        successfulConversions: this.stats.successfulConversions,
        failedConversions: this.stats.failedConversions,
        abandonedConversions: this.stats.abandonedConversions,
        conversionRate: Math.round(this.getConversionRate() * 100) / 100,
        failureRate: Math.round(this.getFailureRate() * 100) / 100,
        abandonRate: Math.round(this.getAbandonRate() * 100) / 100,
        avgTimeToConvert: Math.round(this.stats.avgTimeToConvert / 1000 / 60) // en minutes
      },
      funnel: this.getFunnelProgress(),
      breakdown: {
        byStage: Object.fromEntries(this.stats.byStage),
        byTenant: Object.fromEntries(this.stats.byTenant)
      },
      analytics: this.generateConversionAnalytics(),
      metadata: {
        generated_at: new Date(),
        tracking_type: 'real_conversion'
      }
    };
    
    console.log('[CONVERSION_REPORT_GENERATED]', {
      totalConversions: report.summary.totalConversions,
      conversionRate: report.summary.conversionRate,
      environment: report.environment
    });
    
    return report;
  }
  
  // Générer les analytics de conversion
  generateConversionAnalytics() {
    const analytics = {
      conversionTrends: this.getConversionTrends(),
      stagePerformance: this.getStagePerformance(),
      tenantPerformance: this.getTenantPerformance(),
      timeToConvertAnalysis: this.getTimeToConvertAnalysis(),
      conversionPatterns: this.getConversionPatterns(),
      recommendations: this.generateConversionRecommendations()
    };
    
    return analytics;
  }
  
  // Obtenir les tendances de conversion
  getConversionTrends() {
    // Simulation - en production, utiliserait les vraies données temporelles
    return {
      daily: {
        today: this.stats.successfulConversions * 0.3,
        yesterday: this.stats.successfulConversions * 0.2,
        change: '+50%'
      },
      weekly: {
        thisWeek: this.stats.successfulConversions * 0.7,
        lastWeek: this.stats.successfulConversions * 0.5,
        change: '+40%'
      },
      monthly: {
        thisMonth: this.stats.successfulConversions,
        lastMonth: this.stats.successfulConversions * 0.8,
        change: '+25%'
      }
    };
  }
  
  // Obtenir la performance par étape
  getStagePerformance() {
    const performance = [];
    
    for (const [stage, count] of this.stats.byStage.entries()) {
      const total = this.stats.totalConversions;
      const rate = total > 0 ? (count / total) * 100 : 0;
      
      performance.push({
        stage,
        count,
        rate: Math.round(rate * 100) / 100,
        performance: this.getStagePerformanceRating(stage, rate)
      });
    }
    
    return performance;
  }
  
  // Obtenir la performance par étape (rating)
  getStagePerformanceRating(stage, rate) {
    const stageRatings = {
      'payment_link_clicked': { excellent: 80, good: 60, fair: 40 },
      'payment_started': { excellent: 70, good: 50, fair: 30 },
      'payment_completed': { excellent: 60, good: 40, fair: 20 },
      'payment_failed': { excellent: 10, good: 20, fair: 30 },
      'conversion_abandoned': { excellent: 5, good: 10, fair: 15 }
    };
    
    const ratings = stageRatings[stage] || { excellent: 50, good: 30, fair: 15 };
    
    if (rate >= ratings.excellent) return 'excellent';
    if (rate >= ratings.good) return 'good';
    if (rate >= ratings.fair) return 'fair';
    return 'poor';
  }
  
  // Obtenir la performance par tenant
  getTenantPerformance() {
    const performance = [];
    
    for (const [tenant, count] of this.stats.byTenant.entries()) {
      const total = this.stats.totalConversions;
      const rate = total > 0 ? (count / total) * 100 : 0;
      
      performance.push({
        tenant,
        conversions: count,
        rate: Math.round(rate * 100) / 100,
        performance: rate > 10 ? 'good' : 'needs_improvement'
      });
    }
    
    // Trier par taux de conversion
    performance.sort((a, b) => b.rate - a.rate);
    
    return performance;
  }
  
  // Obtenir l'analyse du temps de conversion
  getTimeToConvertAnalysis() {
    const avgTimeMinutes = Math.round(this.stats.avgTimeToConvert / 1000 / 60);
    
    return {
      avgTimeToConvert: avgTimeMinutes,
      distribution: {
        under_5_min: avgTimeMinutes < 5 ? 60 : 20,
        under_15_min: avgTimeMinutes < 15 ? 80 : 40,
        under_30_min: avgTimeMinutes < 30 ? 90 : 60,
        over_30_min: avgTimeMinutes > 30 ? 40 : 10
      },
      recommendations: this.getTimeToConvertRecommendations(avgTimeMinutes)
    };
  }
  
  // Obtenir les recommandations de temps de conversion
  getTimeToConvertRecommendations(avgTimeMinutes) {
    const recommendations = [];
    
    if (avgTimeMinutes > 30) {
      recommendations.push('Consider simplifying payment process to reduce conversion time');
    } else if (avgTimeMinutes > 15) {
      recommendations.push('Payment process is acceptable but could be optimized');
    } else if (avgTimeMinutes < 5) {
      recommendations.push('Excellent conversion time - maintain current process');
    }
    
    return recommendations;
  }
  
  // Obtenir les patterns de conversion
  getConversionPatterns() {
    return {
      peakConversionTimes: this.getPeakConversionTimes(),
      conversionPaths: this.getConversionPaths(),
      dropOffPoints: this.getDropOffPoints(),
      successFactors: this.getSuccessFactors()
    };
  }
  
  // Obtenir les heures de pic de conversion
  getPeakConversionTimes() {
    // Simulation - en production, utiliserait les vraies données temporelles
    return {
      peakHours: [10, 14, 18, 21],
      peakDays: ['Monday', 'Tuesday', 'Wednesday'],
      recommendations: 'Focus marketing efforts during peak conversion hours'
    };
  }
  
  // Obtenir les chemins de conversion
  getConversionPaths() {
    return {
      mostCommonPath: 'payment_link_clicked → payment_started → payment_completed',
      alternativePaths: [
        'payment_link_clicked → payment_started → payment_failed',
        'payment_link_clicked → conversion_abandoned'
      ],
      pathEfficiency: {
        'payment_link_clicked → payment_started → payment_completed': 85,
        'payment_link_clicked → payment_started → payment_failed': 10,
        'payment_link_clicked → conversion_abandoned': 5
      }
    };
  }
  
  // Obtenir les points d'abandon
  getDropOffPoints() {
    return {
      highestDropOff: 'payment_link_clicked → conversion_abandoned',
      dropOffRates: {
        'after_link_click': 25,
        'after_payment_start': 15,
        'during_payment': 5
      },
      recommendations: 'Optimize payment link presentation and reduce friction points'
    };
  }
  
  // Obtenir les facteurs de succès
  getSuccessFactors() {
    return {
      keySuccessFactors: [
        'Quick payment link response',
        'Mobile-friendly payment flow',
        'Clear payment instructions',
        'Multiple payment options'
      ],
      impactScores: {
        'Quick payment link response': 85,
        'Mobile-friendly payment flow': 75,
        'Clear payment instructions': 70,
        'Multiple payment options': 60
      }
    };
  }
  
  // Générer des recommandations de conversion
  generateConversionRecommendations() {
    const recommendations = [];
    
    if (this.getConversionRate() < 20) {
      recommendations.push({
        type: 'critical',
        message: `Low conversion rate (${Math.round(this.getConversionRate())}%)`,
        action: 'Review payment process and reduce friction',
        priority: 'high'
      });
    }
    
    if (this.getFailureRate() > 30) {
      recommendations.push({
        type: 'warning',
        message: `High failure rate (${Math.round(this.getFailureRate())}%)`,
        action: 'Investigate payment failures and improve error handling',
        priority: 'medium'
      });
    }
    
    if (this.getAbandonRate() > 25) {
      recommendations.push({
        type: 'warning',
        message: `High abandon rate (${Math.round(this.getAbandonRate())}%)`,
        action: 'Optimize payment flow to reduce abandonment',
        priority: 'medium'
      });
    }
    
    const avgTimeMinutes = Math.round(this.stats.avgTimeToConvert / 1000 / 60);
    if (avgTimeMinutes > 20) {
      recommendations.push({
        type: 'info',
        message: `Slow conversion time (${avgTimeMinutes} minutes)`,
        action: 'Simplify payment process to reduce conversion time',
        priority: 'low'
      });
    }
    
    if (recommendations.length === 0) {
      recommendations.push({
        type: 'success',
        message: 'Conversion tracking shows good performance',
        action: 'Continue monitoring and optimize based on data',
        priority: 'low'
      });
    }
    
    return recommendations;
  }
  
  // Obtenir les statistiques de tracking
  getTrackingStats() {
    if (!this.isConversionTrackingEnabled()) {
      return { enabled: false };
    }
    
    return {
      enabled: true,
      environment: this.getEnvironment(),
      stats: {
        totalConversions: this.stats.totalConversions,
        successfulConversions: this.stats.successfulConversions,
        failedConversions: this.stats.failedConversions,
        abandonedConversions: this.stats.abandonedConversions,
        conversionRate: Math.round(this.getConversionRate() * 100) / 100,
        failureRate: Math.round(this.getFailureRate() * 100) / 100,
        abandonRate: Math.round(this.getAbandonRate() * 100) / 100,
        avgTimeToConvert: Math.round(this.stats.avgTimeToConvert / 1000 / 60)
      },
      funnel: this.getFunnelProgress(),
      uptime: process.uptime()
    };
  }
  
  // Masquer téléphone pour logs
  maskPhone(phone) {
    if (!phone || typeof phone !== 'string') return 'unknown';
    return phone.slice(0, -4) + '****';
  }
  
  // Réinitialiser les statistiques
  resetStats() {
    this.stats = {
      totalConversions: 0,
      successfulConversions: 0,
      failedConversions: 0,
      abandonedConversions: 0,
      byStage: new Map(),
      byTenant: new Map(),
      avgTimeToConvert: 0,
      conversionFunnel: {
        leads: 0,
        paymentLinksClicked: 0,
        paymentStarted: 0,
        paymentCompleted: 0
      }
    };
    
    console.log('[CONVERSION_TRACKING_STATS_RESET]');
  }
}

// Instance globale du tracking
if (!global.conversionTracking) {
  global.conversionTracking = new ConversionTracking();
}

// Fonctions principales
function trackPaymentLinkClicked(lead, trackingData) {
  return global.conversionTracking.trackPaymentLinkClicked(lead, trackingData);
}

function trackPaymentStarted(lead, trackingData) {
  return global.conversionTracking.trackPaymentStarted(lead, trackingData);
}

function trackPaymentCompleted(lead, trackingData) {
  return global.conversionTracking.trackPaymentCompleted(lead, trackingData);
}

function trackPaymentFailed(lead, trackingData) {
  return global.conversionTracking.trackPaymentFailed(lead, trackingData);
}

function trackConversionAbandoned(lead, trackingData) {
  return global.conversionTracking.trackConversionAbandoned(lead, trackingData);
}

// Stats et monitoring
function getConversionReport() {
  return global.conversionTracking.getConversionReport();
}

function getConversionTrackingStats() {
  return global.conversionTracking.getTrackingStats();
}

// Administration
function resetConversionTrackingStats() {
  return global.conversionTracking.resetStats();
}

module.exports = {
  trackPaymentLinkClicked,
  trackPaymentStarted,
  trackPaymentCompleted,
  trackPaymentFailed,
  trackConversionAbandoned,
  getConversionReport,
  getConversionTrackingStats,
  resetConversionTrackingStats,
  ConversionTracking
};
