// ACTION 11 - Protection surcharge business

const { getFlag } = require('./envFlags');
const { preventMassiveActivation } = require('./massiveActivationPrevention');
const { logRealError } = require('./realValidationLogger');
const { addRealStep } = require('./realTraceManager');

// Protection surcharge business (SAFE - limites strictes, monitoring, alerting)
class BusinessOverloadProtection {
  constructor() {
    this.testModeEnabled = getFlag('AGENT_TEST_MODE');
    this.realValidationEnabled = getFlag('AGENT_REAL_VALIDATION_MODE');
    this.realPaymentEnabled = getFlag('AGENT_REAL_PAYMENT_ENABLED');
    this.stats = {
      totalChecks: 0,
      blockedActions: 0,
      allowedActions: 0,
      byReason: new Map(),
      byType: new Map(),
      dailyLimits: new Map(),
      hourlyLimits: new Map()
    };
    
    // Limites de surcharge business
    this.limits = {
      daily: {
        maxPayments: 50,           // Max 50 paiements/jour
        maxPaymentLinks: 100,       // Max 100 liens/jour
        maxRevenue: 500000,          // Max 5000€/jour (en cents)
        maxLeads: 200               // Max 200 leads/jour
      },
      hourly: {
        maxPayments: 10,            // Max 10 paiements/heure
        maxPaymentLinks: 20,         // Max 20 liens/heure
        maxRevenue: 100000,          // Max 1000€/heure (en cents)
        maxLeads: 50                 // Max 50 leads/heure
      },
      perMinute: {
        maxPayments: 2,             // Max 2 paiements/minute
        maxPaymentLinks: 5,          // Max 5 liens/minute
        maxLeads: 10                 // Max 10 leads/minute
      }
    };
    
    console.log('[BUSINESS_OVERLOAD_PROTECTION_INITIALIZED]', {
      testModeEnabled: this.testModeEnabled,
      realValidationEnabled: this.realValidationEnabled,
      realPaymentEnabled: this.realPaymentEnabled,
      limits: this.limits
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
  
  // Vérifier si la protection surcharge est activée
  isBusinessOverloadProtectionEnabled() {
    return this.realPaymentEnabled && this.realValidationEnabled;
  }
  
  // Vérifier la surcharge business
  checkBusinessOverload(actionType, context = {}) {
    if (!this.isBusinessOverloadProtectionEnabled()) {
      return { allowed: true, reason: 'protection_disabled' };
    }
    
    this.stats.totalChecks++;
    
    try {
      console.log('[BUSINESS_OVERLOAD_CHECK_START]', {
        actionType,
        tenant_id: context.tenant_id,
        phone: this.maskPhone(context.phone),
        environment: this.getEnvironment()
      });
      
      // Check 1: Protection anti-activation massive (toujours active)
      const massiveActivationCheck = preventMassiveActivation(actionType, context);
      if (!massiveActivationCheck.allowed) {
        this.updateStats('blocked', 'massive_activation', actionType);
        
        console.log('[BUSINESS_OVERLOAD_BLOCKED_MASSIVE]', {
          actionType,
          reason: massiveActivationCheck.reason,
          environment: this.getEnvironment()
        });
        
        return {
          allowed: false,
          reason: 'massive_activation_blocked',
          details: massiveActivationCheck,
          environment: this.getEnvironment()
        };
      }
      
      // Check 2: Limites quotidiennes
      const dailyLimitCheck = this.checkDailyLimits(actionType, context);
      if (!dailyLimitCheck.allowed) {
        this.updateStats('blocked', 'daily_limit', actionType);
        
        console.log('[BUSINESS_OVERLOAD_BLOCKED_DAILY]', {
          actionType,
          reason: dailyLimitCheck.reason,
          environment: this.getEnvironment()
        });
        
        return {
          allowed: false,
          reason: 'daily_limit_exceeded',
          details: dailyLimitCheck,
          environment: this.getEnvironment()
        };
      }
      
      // Check 3: Limites horaires
      const hourlyLimitCheck = this.checkHourlyLimits(actionType, context);
      if (!hourlyLimitCheck.allowed) {
        this.updateStats('blocked', 'hourly_limit', actionType);
        
        console.log('[BUSINESS_OVERLOAD_BLOCKED_HOURLY]', {
          actionType,
          reason: hourlyLimitCheck.reason,
          environment: this.getEnvironment()
        });
        
        return {
          allowed: false,
          reason: 'hourly_limit_exceeded',
          details: hourlyLimitCheck,
          environment: this.getEnvironment()
        };
      }
      
      // Check 4: Limites par minute
      const perMinuteLimitCheck = this.checkPerMinuteLimits(actionType, context);
      if (!perMinuteLimitCheck.allowed) {
        this.updateStats('blocked', 'per_minute_limit', actionType);
        
        console.log('[BUSINESS_OVERLOAD_BLOCKED_PER_MINUTE]', {
          actionType,
          reason: perMinuteLimitCheck.reason,
          environment: this.getEnvironment()
        });
        
        return {
          allowed: false,
          reason: 'per_minute_limit_exceeded',
          details: perMinuteLimitCheck,
          environment: this.getEnvironment()
        };
      }
      
      // Check 5: Limites de revenue
      const revenueLimitCheck = this.checkRevenueLimits(actionType, context);
      if (!revenueLimitCheck.allowed) {
        this.updateStats('blocked', 'revenue_limit', actionType);
        
        console.log('[BUSINESS_OVERLOAD_BLOCKED_REVENUE]', {
          actionType,
          reason: revenueLimitCheck.reason,
          environment: this.getEnvironment()
        });
        
        return {
          allowed: false,
          reason: 'revenue_limit_exceeded',
          details: revenueLimitCheck,
          environment: this.getEnvironment()
        };
      }
      
      // Si tous les checks passent
      this.updateStats('allowed', 'all_checks_passed', actionType);
      
      console.log('[BUSINESS_OVERLOAD_CHECK_PASSED]', {
        actionType,
        environment: this.getEnvironment()
      });
      
      return {
        allowed: true,
        reason: 'all_checks_passed',
        checks: [
          { type: 'massive_activation', passed: true },
          { type: 'daily_limit', passed: true },
          { type: 'hourly_limit', passed: true },
          { type: 'per_minute_limit', passed: true },
          { type: 'revenue_limit', passed: true }
        ],
        environment: this.getEnvironment()
      };
      
    } catch (error) {
      console.log('[BUSINESS_OVERLOAD_CHECK_ERROR]', {
        actionType,
        error: error.message,
        environment: this.getEnvironment()
      });
      
      // En cas d'erreur, autoriser mais logger
      this.updateStats('allowed', 'error_fallback', actionType);
      
      return {
        allowed: true,
        reason: 'error_fallback',
        error: error.message,
        environment: this.getEnvironment()
      };
    }
  }
  
  // Vérifier les limites quotidiennes
  checkDailyLimits(actionType, context) {
    const today = new Date().toDateString();
    const dailyStats = this.getDailyStats(today);
    
    switch (actionType) {
      case 'payment':
      case 'payment_completed':
        if (dailyStats.payments >= this.limits.daily.maxPayments) {
          return {
            allowed: false,
            reason: 'daily_payment_limit_exceeded',
            details: {
              current: dailyStats.payments,
              limit: this.limits.daily.maxPayments,
              resetTime: this.getNextDayReset()
            }
          };
        }
        break;
        
      case 'payment_link':
      case 'payment_link_sent':
        if (dailyStats.paymentLinks >= this.limits.daily.maxPaymentLinks) {
          return {
            allowed: false,
            reason: 'daily_payment_link_limit_exceeded',
            details: {
              current: dailyStats.paymentLinks,
              limit: this.limits.daily.maxPaymentLinks,
              resetTime: this.getNextDayReset()
            }
          };
        }
        break;
        
      case 'lead_creation':
        if (dailyStats.leads >= this.limits.daily.maxLeads) {
          return {
            allowed: false,
            reason: 'daily_lead_limit_exceeded',
            details: {
              current: dailyStats.leads,
              limit: this.limits.daily.maxLeads,
              resetTime: this.getNextDayReset()
            }
          };
        }
        break;
    }
    
    return {
      allowed: true,
      reason: 'daily_limits_ok'
    };
  }
  
  // Vérifier les limites horaires
  checkHourlyLimits(actionType, context) {
    const currentHour = new Date().getHours();
    const hourlyStats = this.getHourlyStats(currentHour);
    
    switch (actionType) {
      case 'payment':
      case 'payment_completed':
        if (hourlyStats.payments >= this.limits.hourly.maxPayments) {
          return {
            allowed: false,
            reason: 'hourly_payment_limit_exceeded',
            details: {
              current: hourlyStats.payments,
              limit: this.limits.hourly.maxPayments,
              resetTime: this.getNextHourReset()
            }
          };
        }
        break;
        
      case 'payment_link':
      case 'payment_link_sent':
        if (hourlyStats.paymentLinks >= this.limits.hourly.maxPaymentLinks) {
          return {
            allowed: false,
            reason: 'hourly_payment_link_limit_exceeded',
            details: {
              current: hourlyStats.paymentLinks,
              limit: this.limits.hourly.maxPaymentLinks,
              resetTime: this.getNextHourReset()
            }
          };
        }
        break;
        
      case 'lead_creation':
        if (hourlyStats.leads >= this.limits.hourly.maxLeads) {
          return {
            allowed: false,
            reason: 'hourly_lead_limit_exceeded',
            details: {
              current: hourlyStats.leads,
              limit: this.limits.hourly.maxLeads,
              resetTime: this.getNextHourReset()
            }
          };
        }
        break;
    }
    
    return {
      allowed: true,
      reason: 'hourly_limits_ok'
    };
  }
  
  // Vérifier les limites par minute
  checkPerMinuteLimits(actionType, context) {
    const currentMinute = Math.floor(Date.now() / 60000);
    const perMinuteStats = this.getPerMinuteStats(currentMinute);
    
    switch (actionType) {
      case 'payment':
      case 'payment_completed':
        if (perMinuteStats.payments >= this.limits.perMinute.maxPayments) {
          return {
            allowed: false,
            reason: 'per_minute_payment_limit_exceeded',
            details: {
              current: perMinuteStats.payments,
              limit: this.limits.perMinute.maxPayments,
              resetTime: this.getNextMinuteReset()
            }
          };
        }
        break;
        
      case 'payment_link':
      case 'payment_link_sent':
        if (perMinuteStats.paymentLinks >= this.limits.perMinute.maxPaymentLinks) {
          return {
            allowed: false,
            reason: 'per_minute_payment_link_limit_exceeded',
            details: {
              current: perMinuteStats.paymentLinks,
              limit: this.limits.perMinute.maxPaymentLinks,
              resetTime: this.getNextMinuteReset()
            }
          };
        }
        break;
        
      case 'lead_creation':
        if (perMinuteStats.leads >= this.limits.perMinute.maxLeads) {
          return {
            allowed: false,
            reason: 'per_minute_lead_limit_exceeded',
            details: {
              current: perMinuteStats.leads,
              limit: this.limits.perMinute.maxLeads,
              resetTime: this.getNextMinuteReset()
            }
          };
        }
        break;
    }
    
    return {
      allowed: true,
      reason: 'per_minute_limits_ok'
    };
  }
  
  // Vérifier les limites de revenue
  checkRevenueLimits(actionType, context) {
    if (actionType !== 'payment' && actionType !== 'payment_completed') {
      return { allowed: true, reason: 'revenue_limits_not_applicable' };
    }
    
    const today = new Date().toDateString();
    const dailyStats = this.getDailyStats(today);
    const amount = context.amount || 0;
    
    // Vérifier la limite de revenue quotidienne
    const projectedDailyRevenue = dailyStats.revenue + amount;
    if (projectedDailyRevenue > this.limits.daily.maxRevenue) {
      return {
        allowed: false,
        reason: 'daily_revenue_limit_exceeded',
        details: {
          current: dailyStats.revenue,
          projected: projectedDailyRevenue,
          limit: this.limits.daily.maxRevenue,
          resetTime: this.getNextDayReset()
        }
      };
    }
    
    // Vérifier la limite de revenue horaire
    const currentHour = new Date().getHours();
    const hourlyStats = this.getHourlyStats(currentHour);
    const projectedHourlyRevenue = hourlyStats.revenue + amount;
    
    if (projectedHourlyRevenue > this.limits.hourly.maxRevenue) {
      return {
        allowed: false,
        reason: 'hourly_revenue_limit_exceeded',
        details: {
          current: hourlyStats.revenue,
          projected: projectedHourlyRevenue,
          limit: this.limits.hourly.maxRevenue,
          resetTime: this.getNextHourReset()
        }
      };
    }
    
    return {
      allowed: true,
      reason: 'revenue_limits_ok'
    };
  }
  
  // Obtenir les statistiques quotidiennes
  getDailyStats(date) {
    return this.stats.dailyLimits.get(date) || {
      payments: 0,
      paymentLinks: 0,
      revenue: 0,
      leads: 0
    };
  }
  
  // Obtenir les statistiques horaires
  getHourlyStats(hour) {
    const today = new Date().toDateString();
    const dailyStats = this.getDailyStats(today);
    return dailyStats.hourlyStats?.[hour] || {
      payments: 0,
      paymentLinks: 0,
      revenue: 0,
      leads: 0
    };
  }
  
  // Obtenir les statistiques par minute
  getPerMinuteStats(minute) {
    return this.stats.perMinuteLimits.get(minute) || {
      payments: 0,
      paymentLinks: 0,
      leads: 0
    };
  }
  
  // Mettre à jour les statistiques
  updateStats(actionType, reason, actionType) {
    if (action === 'blocked') {
      this.stats.blockedActions++;
    } else {
      this.stats.allowedActions++;
    }
    
    this.stats.byReason.set(reason, (this.stats.byReason.get(reason) || 0) + 1);
    this.stats.byType.set(actionType, (this.stats.byType.get(actionType) || 0) + 1);
  }
  
  // Enregistrer une action (pour les stats)
  recordAction(actionType, context = {}) {
    if (!this.isBusinessOverloadProtectionEnabled()) {
      return;
    }
    
    const today = new Date().toDateString();
    const currentHour = new Date().getHours();
    const currentMinute = Math.floor(Date.now() / 60000);
    
    // Mettre à jour les stats quotidiennes
    let dailyStats = this.getDailyStats(today);
    dailyStats = { ...dailyStats };
    
    // Mettre à jour les stats horaires
    if (!dailyStats.hourlyStats) {
      dailyStats.hourlyStats = {};
    }
    let hourlyStats = dailyStats.hourlyStats[currentHour] || {
      payments: 0,
      paymentLinks: 0,
      revenue: 0,
      leads: 0
    };
    
    // Mettre à jour les stats par minute
    let perMinuteStats = this.getPerMinuteStats(currentMinute);
    perMinuteStats = { ...perMinuteStats };
    
    switch (actionType) {
      case 'payment':
      case 'payment_completed':
        dailyStats.payments++;
        hourlyStats.payments++;
        perMinuteStats.payments++;
        
        if (context.amount) {
          dailyStats.revenue += context.amount;
          hourlyStats.revenue += context.amount;
        }
        break;
        
      case 'payment_link':
      case 'payment_link_sent':
        dailyStats.paymentLinks++;
        hourlyStats.paymentLinks++;
        perMinuteStats.paymentLinks++;
        break;
        
      case 'lead_creation':
        dailyStats.leads++;
        hourlyStats.leads++;
        perMinuteStats.leads++;
        break;
    }
    
    // Sauvegarder les stats mises à jour
    dailyStats.hourlyStats[currentHour] = hourlyStats;
    this.stats.dailyLimits.set(today, dailyStats);
    this.stats.perMinuteLimits.set(currentMinute, perMinuteStats);
    
    // Nettoyer les anciennes stats (pour économiser la mémoire)
    this.cleanupOldStats();
  }
  
  // Nettoyer les anciennes stats
  cleanupOldStats() {
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    const oneHourAgo = now - (60 * 60 * 1000);
    const oneMinuteAgo = now - (60 * 1000);
    
    // Nettoyer les stats quotidiennes (garder 7 jours)
    for (const [date, stats] of this.stats.dailyLimits.entries()) {
      const dateObj = new Date(date);
      if (dateObj.getTime() < oneDayAgo) {
        this.stats.dailyLimits.delete(date);
      }
    }
    
    // Nettoyer les stats par minute (garder 1 heure)
    for (const [minute, stats] of this.stats.perMinuteLimits.entries()) {
      if (minute * 60000 < oneHourAgo) {
        this.stats.perMinuteLimits.delete(minute);
      }
    }
  }
  
  // Obtenir le temps de reset du jour suivant
  getNextDayReset() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow;
  }
  
  // Obtenir le temps de reset de l'heure suivante
  getNextHourReset() {
    const nextHour = new Date();
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
    return nextHour;
  }
  
  // Obtenir le temps de reset de la minute suivante
  getNextMinuteReset() {
    const nextMinute = new Date();
    nextMinute.setMinutes(nextMinute.getMinutes() + 1, 0, 0);
    return nextMinute;
  }
  
  // Obtenir les statistiques de protection
  getProtectionStats() {
    if (!this.isBusinessOverloadProtectionEnabled()) {
      return { enabled: false };
    }
    
    const totalChecks = this.stats.totalChecks;
    const blockRate = totalChecks > 0 ? 
      (this.stats.blockedActions / totalChecks) * 100 : 0;
    
    // Calculer les stats actuelles
    const today = new Date().toDateString();
    const currentHour = new Date().getHours();
    const dailyStats = this.getDailyStats(today);
    const hourlyStats = this.getHourlyStats(currentHour);
    
    return {
      enabled: true,
      environment: this.getEnvironment(),
      limits: this.limits,
      stats: {
        totalChecks: this.stats.totalChecks,
        blockedActions: this.stats.blockedActions,
        allowedActions: this.stats.allowedActions,
        blockRate: Math.round(blockRate * 100) / 100
      },
      currentUsage: {
        daily: dailyStats,
        hourly: hourlyStats
      },
      byReason: Object.fromEntries(this.stats.byReason),
      byType: Object.fromEntries(this.stats.byType),
      uptime: process.uptime()
    };
  }
  
  // Obtenir le rapport de protection
  getProtectionReport() {
    if (!this.isBusinessOverloadProtectionEnabled()) {
      return { enabled: false };
    }
    
    const stats = this.getProtectionStats();
    
    // Analyser les patterns de surcharge
    const patterns = this.analyzeOverloadPatterns(stats);
    
    // Générer des recommandations
    const recommendations = this.generateOverloadRecommendations(stats, patterns);
    
    return {
      enabled: true,
      environment: stats.environment,
      limits: stats.limits,
      stats: stats.stats,
      currentUsage: stats.currentUsage,
      patterns,
      recommendations,
      metadata: {
        generated_at: new Date(),
        protection_type: 'business_overload'
      }
    };
  }
  
  // Analyser les patterns de surcharge
  analyzeOverloadPatterns(stats) {
    const patterns = {
      mostBlockedReason: null,
      mostBlockedType: null,
      peakUsageTimes: [],
      utilizationRate: 0
    };
    
    // Raison la plus commune
    let maxCount = 0;
    for (const [reason, count] of Object.entries(stats.byReason)) {
      if (count > maxCount) {
        maxCount = count;
        patterns.mostBlockedReason = { reason, count };
      }
    }
    
    // Type le plus commun
    maxCount = 0;
    for (const [type, count] of Object.entries(stats.byType)) {
      if (count > maxCount) {
        maxCount = count;
        patterns.mostBlockedType = { type, count };
      }
    }
    
    // Taux d'utilisation
    const dailyUsage = stats.currentUsage.daily;
    patterns.utilizationRate = {
      payments: (dailyUsage.payments / this.limits.daily.maxPayments) * 100,
      paymentLinks: (dailyUsage.paymentLinks / this.limits.daily.maxPaymentLinks) * 100,
      revenue: (dailyUsage.revenue / this.limits.daily.maxRevenue) * 100,
      leads: (dailyUsage.leads / this.limits.daily.maxLeads) * 100
    };
    
    return patterns;
  }
  
  // Générer des recommandations
  generateOverloadRecommendations(stats, patterns) {
    const recommendations = [];
    
    if (stats.stats.blockRate > 20) {
      recommendations.push({
        type: 'warning',
        message: `High block rate (${stats.stats.blockRate}%)`,
        action: 'Review business activity and adjust limits if needed',
        priority: 'high'
      });
    }
    
    if (patterns.mostBlockedReason) {
      recommendations.push({
        type: 'info',
        message: `Most common block reason: ${patterns.mostBlockedReason.reason}`,
        action: `Address ${patterns.mostBlockedReason.reason} issues`,
        priority: 'medium'
      });
    }
    
    // Vérifier les taux d'utilisation élevés
    for (const [metric, rate] of Object.entries(patterns.utilizationRate)) {
      if (rate > 80) {
        recommendations.push({
          type: 'warning',
          message: `High ${metric} utilization (${Math.round(rate)}%)`,
          action: `Monitor ${metric} activity and consider limits adjustment`,
          priority: 'medium'
        });
      }
    }
    
    if (recommendations.length === 0) {
      recommendations.push({
        type: 'success',
        message: 'Business overload protection working effectively',
        action: 'Continue monitoring and maintain current configuration',
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
      totalChecks: 0,
      blockedActions: 0,
      allowedActions: 0,
      byReason: new Map(),
      byType: new Map(),
      dailyLimits: new Map(),
      hourlyLimits: new Map()
    };
    
    console.log('[BUSINESS_OVERLOAD_PROTECTION_STATS_RESET]');
  }
}

// Instance globale de la protection
if (!global.businessOverloadProtection) {
  global.businessOverloadProtection = new BusinessOverloadProtection();
}

// Fonctions principales
function checkBusinessOverload(actionType, context) {
  return global.businessOverloadProtection.checkBusinessOverload(actionType, context);
}

function recordBusinessAction(actionType, context) {
  return global.businessOverloadProtection.recordAction(actionType, context);
}

// Stats et monitoring
function getBusinessOverloadProtectionStats() {
  return global.businessOverloadProtection.getProtectionStats();
}

function getBusinessOverloadProtectionReport() {
  return global.businessOverloadProtection.getProtectionReport();
}

// Administration
function resetBusinessOverloadProtectionStats() {
  return global.businessOverloadProtection.resetStats();
}

module.exports = {
  checkBusinessOverload,
  recordBusinessAction,
  getBusinessOverloadProtectionStats,
  getBusinessOverloadProtectionReport,
  resetBusinessOverloadProtectionStats,
  BusinessOverloadProtection
};
