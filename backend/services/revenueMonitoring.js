// ACTION 7 - Monitoring revenue

const { getFlag } = require('./envFlags');
const { logRealError } = require('./realValidationLogger');

// Monitoring revenue (SAFE - tracking complet, analytics, reporting)
class RevenueMonitoring {
  constructor() {
    this.testModeEnabled = getFlag('AGENT_TEST_MODE');
    this.realValidationEnabled = getFlag('AGENT_REAL_VALIDATION_MODE');
    this.realPaymentEnabled = getFlag('AGENT_REAL_PAYMENT_ENABLED');
    this.stats = {
      totalPayments: 0,
      totalRevenue: 0,
      successfulPayments: 0,
      failedPayments: 0,
      refunds: 0,
      avgTimeToPay: 0,
      byTenant: new Map(),
      byAmount: new Map(),
      byTimeOfDay: new Map(),
      conversionFunnel: {
        leads: 0,
        paymentLinksSent: 0,
        paymentStarted: 0,
        paymentCompleted: 0
      }
    };
    
    console.log('[REVENUE_MONITORING_INITIALIZED]', {
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
  
  // Enregistrer un paiement réussi
  recordPaymentSuccess(paymentData) {
    if (!this.realPaymentEnabled || !this.realValidationEnabled) {
      return;
    }
    
    try {
      console.log('[REVENUE_PAYMENT_SUCCESS]', {
        paymentIntentId: paymentData.paymentIntentId,
        amount: paymentData.amount,
        currency: paymentData.currency,
        leadId: paymentData.leadId,
        tenant_id: paymentData.tenant_id,
        environment: this.getEnvironment()
      });
      
      // Mettre à jour les stats
      this.stats.totalPayments++;
      this.stats.successfulPayments++;
      this.stats.totalRevenue += paymentData.amount;
      
      // Stats par tenant
      const tenantKey = paymentData.tenant_id || 'unknown';
      const tenantStats = this.stats.byTenant.get(tenantKey) || {
        payments: 0,
        revenue: 0,
        avgAmount: 0
      };
      tenantStats.payments++;
      tenantStats.revenue += paymentData.amount;
      tenantStats.avgAmount = tenantStats.revenue / tenantStats.payments;
      this.stats.byTenant.set(tenantKey, tenantStats);
      
      // Stats par montant
      const amountRange = this.getAmountRange(paymentData.amount);
      this.stats.byAmount.set(amountRange, (this.stats.byAmount.get(amountRange) || 0) + 1);
      
      // Stats par heure
      const hour = new Date().getHours();
      this.stats.byTimeOfDay.set(hour, (this.stats.byTimeOfDay.get(hour) || 0) + 1);
      
      // Mettre à jour le funnel
      this.stats.conversionFunnel.paymentCompleted++;
      
      // Calculer le temps moyen pour payer
      if (paymentData.paymentLinkSentAt) {
        const timeToPay = new Date() - new Date(paymentData.paymentLinkSentAt);
        this.updateAvgTimeToPay(timeToPay);
      }
      
      // Logger le paiement
      logRealError('revenue_payment_success', paymentData.phone, paymentData.tenant_id, paymentData.leadId, new Error('Payment recorded'), {
        paymentIntentId: paymentData.paymentIntentId,
        amount: paymentData.amount,
        currency: paymentData.currency,
        environment: this.getEnvironment()
      });
      
      console.log('[REVENUE_PAYMENT_SUCCESS_RECORDED]', {
        paymentIntentId: paymentData.paymentIntentId,
        totalRevenue: this.stats.totalRevenue,
        successRate: this.getSuccessRate()
      });
      
    } catch (error) {
      console.log('[REVENUE_PAYMENT_SUCCESS_ERROR]', {
        paymentIntentId: paymentData.paymentIntentId,
        error: error.message
      });
    }
  }
  
  // Enregistrer un paiement échoué
  recordPaymentFailure(paymentData) {
    if (!this.realPaymentEnabled || !this.realValidationEnabled) {
      return;
    }
    
    try {
      console.log('[REVENUE_PAYMENT_FAILURE]', {
        paymentIntentId: paymentData.paymentIntentId,
        amount: paymentData.amount,
        error: paymentData.error,
        leadId: paymentData.leadId,
        tenant_id: paymentData.tenant_id,
        environment: this.getEnvironment()
      });
      
      // Mettre à jour les stats
      this.stats.totalPayments++;
      this.stats.failedPayments++;
      
      // Logger l'échec
      logRealError('revenue_payment_failure', paymentData.phone, paymentData.tenant_id, paymentData.leadId, new Error(paymentData.error), {
        paymentIntentId: paymentData.paymentIntentId,
        amount: paymentData.amount,
        environment: this.getEnvironment()
      });
      
      console.log('[REVENUE_PAYMENT_FAILURE_RECORDED]', {
        paymentIntentId: paymentData.paymentIntentId,
        failureRate: this.getFailureRate()
      });
      
    } catch (error) {
      console.log('[REVENUE_PAYMENT_FAILURE_ERROR]', {
        paymentIntentId: paymentData.paymentIntentId,
        error: error.message
      });
    }
  }
  
  // Enregistrer l'envoi d'un lien de paiement
  recordPaymentLinkSent(paymentData) {
    if (!this.realPaymentEnabled || !this.realValidationEnabled) {
      return;
    }
    
    try {
      console.log('[REVENUE_PAYMENT_LINK_SENT]', {
        paymentLinkId: paymentData.paymentLinkId,
        paymentIntentId: paymentData.paymentIntentId,
        amount: paymentData.amount,
        leadId: paymentData.leadId,
        tenant_id: paymentData.tenant_id,
        environment: this.getEnvironment()
      });
      
      // Mettre à jour le funnel
      this.stats.conversionFunnel.paymentLinksSent++;
      
      // Logger l'envoi
      logRealError('revenue_payment_link_sent', paymentData.phone, paymentData.tenant_id, paymentData.leadId, new Error('Payment link sent'), {
        paymentLinkId: paymentData.paymentLinkId,
        paymentIntentId: paymentData.paymentIntentId,
        amount: paymentData.amount,
        environment: this.getEnvironment()
      });
      
    } catch (error) {
      console.log('[REVENUE_PAYMENT_LINK_SENT_ERROR]', {
        paymentLinkId: paymentData.paymentLinkId,
        error: error.message
      });
    }
  }
  
  // Enregistrer le début d'un paiement
  recordPaymentStarted(paymentData) {
    if (!this.realPaymentEnabled || !this.realValidationEnabled) {
      return;
    }
    
    try {
      console.log('[REVENUE_PAYMENT_STARTED]', {
        paymentIntentId: paymentData.paymentIntentId,
        amount: paymentData.amount,
        leadId: paymentData.leadId,
        tenant_id: paymentData.tenant_id,
        environment: this.getEnvironment()
      });
      
      // Mettre à jour le funnel
      this.stats.conversionFunnel.paymentStarted++;
      
      // Logger le début
      logRealError('revenue_payment_started', paymentData.phone, paymentData.tenant_id, paymentData.leadId, new Error('Payment started'), {
        paymentIntentId: paymentData.paymentIntentId,
        amount: paymentData.amount,
        environment: this.getEnvironment()
      });
      
    } catch (error) {
      console.log('[REVENUE_PAYMENT_STARTED_ERROR]', {
        paymentIntentId: paymentData.paymentIntentId,
        error: error.message
      });
    }
  }
  
  // Enregistrer un remboursement
  recordRefund(refundData) {
    if (!this.realPaymentEnabled || !this.realValidationEnabled) {
      return;
    }
    
    try {
      console.log('[REVENUE_REFUND]', {
        paymentIntentId: refundData.paymentIntentId,
        refundAmount: refundData.refundAmount,
        reason: refundData.reason,
        leadId: refundData.leadId,
        tenant_id: refundData.tenant_id,
        environment: this.getEnvironment()
      });
      
      // Mettre à jour les stats
      this.stats.refunds++;
      this.stats.totalRevenue -= refundData.refundAmount;
      
      // Logger le remboursement
      logRealError('revenue_refund', refundData.phone, refundData.tenant_id, refundData.leadId, new Error('Refund processed'), {
        paymentIntentId: refundData.paymentIntentId,
        refundAmount: refundData.refundAmount,
        reason: refundData.reason,
        environment: this.getEnvironment()
      });
      
    } catch (error) {
      console.log('[REVENUE_REFUND_ERROR]', {
        paymentIntentId: refundData.paymentIntentId,
        error: error.message
      });
    }
  }
  
  // Obtenir la plage de montant
  getAmountRange(amount) {
    if (amount < 1000) return '0-999';      // < 10€
    if (amount < 5000) return '1000-4999';  // 10-49€
    if (amount < 10000) return '5000-9999'; // 50-99€
    if (amount < 20000) return '10000-19999'; // 100-199€
    return '20000+';                         // 200€+
  }
  
  // Mettre à jour le temps moyen pour payer
  updateAvgTimeToPay(newTime) {
    const currentAvg = this.stats.avgTimeToPay;
    const count = this.stats.successfulPayments;
    
    this.stats.avgTimeToPay = ((currentAvg * (count - 1)) + newTime) / count;
  }
  
  // Obtenir le taux de succès
  getSuccessRate() {
    if (this.stats.totalPayments === 0) return 0;
    return (this.stats.successfulPayments / this.stats.totalPayments) * 100;
  }
  
  // Obtenir le taux d'échec
  getFailureRate() {
    if (this.stats.totalPayments === 0) return 0;
    return (this.stats.failedPayments / this.stats.totalPayments) * 100;
  }
  
  // Obtenir le taux de conversion
  getConversionRate() {
    if (this.stats.conversionFunnel.paymentLinksSent === 0) return 0;
    return (this.stats.conversionFunnel.paymentCompleted / this.stats.conversionFunnel.paymentLinksSent) * 100;
  }
  
  // Obtenir le rapport de revenue
  getRevenueReport() {
    if (!this.realPaymentEnabled || !this.realValidationEnabled) {
      return { enabled: false };
    }
    
    const report = {
      enabled: true,
      environment: this.getEnvironment(),
      summary: {
        totalPayments: this.stats.totalPayments,
        totalRevenue: this.stats.totalRevenue,
        successfulPayments: this.stats.successfulPayments,
        failedPayments: this.stats.failedPayments,
        refunds: this.stats.refunds,
        successRate: Math.round(this.getSuccessRate() * 100) / 100,
        failureRate: Math.round(this.getFailureRate() * 100) / 100,
        avgTimeToPay: Math.round(this.stats.avgTimeToPay / 1000 / 60), // en minutes
        conversionRate: Math.round(this.getConversionRate() * 100) / 100
      },
      breakdown: {
        byTenant: Object.fromEntries(this.stats.byTenant),
        byAmount: Object.fromEntries(this.stats.byAmount),
        byTimeOfDay: Object.fromEntries(this.stats.byTimeOfDay)
      },
      funnel: this.stats.conversionFunnel,
      analytics: this.generateAnalytics(),
      metadata: {
        generated_at: new Date(),
        currency: 'EUR'
      }
    };
    
    console.log('[REVENUE_REPORT_GENERATED]', {
      totalRevenue: report.summary.totalRevenue,
      conversionRate: report.summary.conversionRate,
      environment: report.environment
    });
    
    return report;
  }
  
  // Générer les analytics
  generateAnalytics() {
    const analytics = {
      revenueTrends: this.getRevenueTrends(),
      peakPaymentTimes: this.getPeakPaymentTimes(),
      averageOrderValue: this.getAverageOrderValue(),
      tenantPerformance: this.getTenantPerformance(),
      paymentMethodDistribution: this.getPaymentMethodDistribution(),
      revenueProjections: this.getRevenueProjections()
    };
    
    return analytics;
  }
  
  // Obtenir les tendances de revenue
  getRevenueTrends() {
    // Simulation - en production, utiliserait les vraies données temporelles
    return {
      daily: {
        today: this.stats.totalRevenue * 0.3,
        yesterday: this.stats.totalRevenue * 0.2,
        change: '+50%'
      },
      weekly: {
        thisWeek: this.stats.totalRevenue * 0.7,
        lastWeek: this.stats.totalRevenue * 0.5,
        change: '+40%'
      },
      monthly: {
        thisMonth: this.stats.totalRevenue,
        lastMonth: this.stats.totalRevenue * 0.8,
        change: '+25%'
      }
    };
  }
  
  // Obtenir les heures de pic de paiement
  getPeakPaymentTimes() {
    const timeSlots = [];
    
    for (let hour = 0; hour < 24; hour++) {
      const count = this.stats.byTimeOfDay.get(hour) || 0;
      if (count > 0) {
        timeSlots.push({ hour, count });
      }
    }
    
    // Trier par nombre de paiements
    timeSlots.sort((a, b) => b.count - a.count);
    
    return {
      peakHours: timeSlots.slice(0, 3),
      distribution: timeSlots,
      recommendations: this.generateTimeRecommendations(timeSlots)
    };
  }
  
  // Obtenir la valeur moyenne de commande
  getAverageOrderValue() {
    if (this.stats.successfulPayments === 0) return 0;
    return this.stats.totalRevenue / this.stats.successfulPayments;
  }
  
  // Obtenir la performance par tenant
  getTenantPerformance() {
    const performance = [];
    
    for (const [tenant, stats] of this.stats.byTenant.entries()) {
      performance.push({
        tenant,
        payments: stats.payments,
        revenue: stats.revenue,
        avgAmount: stats.avgAmount,
        performance: stats.revenue > 0 ? 'good' : 'none'
      });
    }
    
    // Trier par revenue
    performance.sort((a, b) => b.revenue - a.revenue);
    
    return performance;
  }
  
  // Obtenir la distribution des méthodes de paiement
  getPaymentMethodDistribution() {
    // Simulation - en production, utiliserait les vraies données
    return {
      card: 85,
      sepa_debit: 10,
      other: 5
    };
  }
  
  // Obtenir les projections de revenue
  getRevenueProjections() {
    const avgDailyRevenue = this.stats.totalRevenue / 30; // Simulation
    const currentMonthRevenue = this.stats.totalRevenue;
    
    return {
      daily: avgDailyRevenue,
      weekly: avgDailyRevenue * 7,
      monthly: currentMonthRevenue,
      quarterly: currentMonthRevenue * 3,
      yearly: currentMonthRevenue * 12,
      confidence: 'medium'
    };
  }
  
  // Générer des recommandations temporelles
  generateTimeRecommendations(timeSlots) {
    const recommendations = [];
    
    if (timeSlots.length === 0) {
      recommendations.push('No payment data available for time analysis');
      return recommendations;
    }
    
    const peakHour = timeSlots[0].hour;
    
    if (peakHour >= 9 && peakHour <= 17) {
      recommendations.push('Peak payments during business hours - consider business hours optimization');
    } else if (peakHour >= 18 && peakHour <= 22) {
      recommendations.push('Peak payments during evening hours - consider evening engagement strategies');
    } else {
      recommendations.push('Peak payments during off-hours - consider 24/7 availability');
    }
    
    return recommendations;
  }
  
  // Obtenir les statistiques de monitoring
  getMonitoringStats() {
    if (!this.realPaymentEnabled || !this.realValidationEnabled) {
      return { enabled: false };
    }
    
    return {
      enabled: true,
      environment: this.getEnvironment(),
      stats: {
        totalPayments: this.stats.totalPayments,
        totalRevenue: this.stats.totalRevenue,
        successfulPayments: this.stats.successfulPayments,
        failedPayments: this.stats.failedPayments,
        refunds: this.stats.refunds,
        successRate: Math.round(this.getSuccessRate() * 100) / 100,
        avgTimeToPay: Math.round(this.stats.avgTimeToPay / 1000 / 60)
      },
      uptime: process.uptime()
    };
  }
  
  // Réinitialiser les statistiques
  resetStats() {
    this.stats = {
      totalPayments: 0,
      totalRevenue: 0,
      successfulPayments: 0,
      failedPayments: 0,
      refunds: 0,
      avgTimeToPay: 0,
      byTenant: new Map(),
      byAmount: new Map(),
      byTimeOfDay: new Map(),
      conversionFunnel: {
        leads: 0,
        paymentLinksSent: 0,
        paymentStarted: 0,
        paymentCompleted: 0
      }
    };
    
    console.log('[REVENUE_MONITORING_STATS_RESET]');
  }
}

// Instance globale du monitoring
if (!global.revenueMonitoring) {
  global.revenueMonitoring = new RevenueMonitoring();
}

// Fonctions principales
function recordPaymentSuccess(paymentData) {
  return global.revenueMonitoring.recordPaymentSuccess(paymentData);
}

function recordPaymentFailure(paymentData) {
  return global.revenueMonitoring.recordPaymentFailure(paymentData);
}

function recordPaymentLinkSent(paymentData) {
  return global.revenueMonitoring.recordPaymentLinkSent(paymentData);
}

function recordPaymentStarted(paymentData) {
  return global.revenueMonitoring.recordPaymentStarted(paymentData);
}

function recordRefund(refundData) {
  return global.revenueMonitoring.recordRefund(refundData);
}

// Stats et monitoring
function getRevenueReport() {
  return global.revenueMonitoring.getRevenueReport();
}

function getRevenueMonitoringStats() {
  return global.revenueMonitoring.getMonitoringStats();
}

// Administration
function resetRevenueMonitoringStats() {
  return global.revenueMonitoring.resetStats();
}

module.exports = {
  recordPaymentSuccess,
  recordPaymentFailure,
  recordPaymentLinkSent,
  recordPaymentStarted,
  recordRefund,
  getRevenueReport,
  getRevenueMonitoringStats,
  resetRevenueMonitoringStats,
  RevenueMonitoring
};
