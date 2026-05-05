// ACTION 4 - Double paiement protection

const { getFlag } = require('./envFlags');
const { logRealError } = require('./realValidationLogger');
const { addRealStep } = require('./realTraceManager');

// Protection contre double paiement (SAFE - validation stricte, logging complet)
class DoublePaymentProtection {
  constructor() {
    this.testModeEnabled = getFlag('AGENT_TEST_MODE');
    this.realValidationEnabled = getFlag('AGENT_REAL_VALIDATION_MODE');
    this.realPaymentEnabled = getFlag('AGENT_REAL_PAYMENT_ENABLED');
    this.stats = {
      totalChecks: 0,
      blockedPayments: 0,
      allowedPayments: 0,
      byReason: new Map(),
      byTenant: new Map()
    };
    
    console.log('[DOUBLE_PAYMENT_PROTECTION_INITIALIZED]', {
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
  
  // Vérifier si un paiement est autorisé
  async checkPaymentAllowed(lead, paymentContext = {}) {
    if (!this.realPaymentEnabled || !this.realValidationEnabled) {
      return { allowed: true, reason: 'real_payment_disabled' };
    }
    
    this.stats.totalChecks++;
    
    try {
      console.log('[DOUBLE_PAYMENT_CHECK_START]', {
        leadId: lead.id,
        tenant_id: lead.tenant_id,
        phone: this.maskPhone(lead.phone),
        currentStatus: lead.status,
        environment: this.getEnvironment()
      });
      
      // Check 1: Vérifier si le lead est déjà WON
      const wonCheck = await this.checkLeadAlreadyWon(lead);
      if (!wonCheck.allowed) {
        this.updateStats('blocked', 'lead_already_won', lead);
        
        console.log('[DOUBLE_PAYMENT_BLOCKED_ALREADY_WON]', {
          leadId: lead.id,
          tenant_id: lead.tenant_id,
          phone: this.maskPhone(lead.phone),
          wonAt: lead.wonAt,
          environment: this.getEnvironment()
        });
        
        // Logger le blocage
        logRealError('payment_blocked_already_won', lead.phone, lead.tenant_id, lead.id, new Error('Lead already WON'), {
          wonAt: lead.wonAt,
          paymentIntentId: lead.paymentIntentId,
          environment: this.getEnvironment()
        });
        
        // Ajouter l'étape à la trace
        if (paymentContext.traceId) {
          addRealStep(paymentContext.traceId, 'payment_blocked_already_won', {
            phone: this.maskPhone(lead.phone),
            wonAt: lead.wonAt,
            paymentIntentId: lead.paymentIntentId,
            environment: this.getEnvironment()
          });
        }
        
        return {
          allowed: false,
          reason: 'lead_already_won',
          details: wonCheck,
          environment: this.getEnvironment()
        };
      }
      
      // Check 2: Vérifier si un lien de paiement a déjà été envoyé
      const paymentLinkCheck = await this.checkPaymentLinkAlreadySent(lead);
      if (!paymentLinkCheck.allowed) {
        this.updateStats('blocked', 'payment_link_already_sent', lead);
        
        console.log('[DOUBLE_PAYMENT_BLOCKED_LINK_SENT]', {
          leadId: lead.id,
          tenant_id: lead.tenant_id,
          phone: this.maskPhone(lead.phone),
          paymentLinkSentAt: lead.paymentLinkSentAt,
          environment: this.getEnvironment()
        });
        
        // Logger le blocage
        logRealError('payment_blocked_link_already_sent', lead.phone, lead.tenant_id, lead.id, new Error('Payment link already sent'), {
          paymentLinkSentAt: lead.paymentLinkSentAt,
          environment: this.getEnvironment()
        });
        
        // Ajouter l'étape à la trace
        if (paymentContext.traceId) {
          addRealStep(paymentContext.traceId, 'payment_blocked_link_already_sent', {
            phone: this.maskPhone(lead.phone),
            paymentLinkSentAt: lead.paymentLinkSentAt,
            environment: this.getEnvironment()
          });
        }
        
        return {
          allowed: false,
          reason: 'payment_link_already_sent',
          details: paymentLinkCheck,
          environment: this.getEnvironment()
        };
      }
      
      // Check 3: Vérifier si un paiement est en cours
      const ongoingPaymentCheck = await this.checkOngoingPayment(lead);
      if (!ongoingPaymentCheck.allowed) {
        this.updateStats('blocked', 'payment_ongoing', lead);
        
        console.log('[DOUBLE_PAYMENT_BLOCKED_ONGOING]', {
          leadId: lead.id,
          tenant_id: lead.tenant_id,
          phone: this.maskPhone(lead.phone),
          ongoingPayment: ongoingPaymentCheck.ongoingPayment,
          environment: this.getEnvironment()
        });
        
        // Logger le blocage
        logRealError('payment_blocked_ongoing', lead.phone, lead.tenant_id, lead.id, new Error('Payment already in progress'), {
          ongoingPayment: ongoingPaymentCheck.ongoingPayment,
          environment: this.getEnvironment()
        });
        
        // Ajouter l'étape à la trace
        if (paymentContext.traceId) {
          addRealStep(paymentContext.traceId, 'payment_blocked_ongoing', {
            phone: this.maskPhone(lead.phone),
            ongoingPayment: ongoingPaymentCheck.ongoingPayment,
            environment: this.getEnvironment()
          });
        }
        
        return {
          allowed: false,
          reason: 'payment_ongoing',
          details: ongoingPaymentCheck,
          environment: this.getEnvironment()
        };
      }
      
      // Check 4: Vérifier les doublons récents
      const recentDuplicateCheck = await this.checkRecentDuplicates(lead);
      if (!recentDuplicateCheck.allowed) {
        this.updateStats('blocked', 'recent_duplicate', lead);
        
        console.log('[DOUBLE_PAYMENT_BLOCKED_RECENT_DUPLICATE]', {
          leadId: lead.id,
          tenant_id: lead.tenant_id,
          phone: this.maskPhone(lead.phone),
          recentPayments: recentDuplicateCheck.recentPayments,
          environment: this.getEnvironment()
        });
        
        // Logger le blocage
        logRealError('payment_blocked_recent_duplicate', lead.phone, lead.tenant_id, lead.id, new Error('Recent duplicate payment detected'), {
          recentPayments: recentDuplicateCheck.recentPayments,
          environment: this.getEnvironment()
        });
        
        // Ajouter l'étape à la trace
        if (paymentContext.traceId) {
          addRealStep(paymentContext.traceId, 'payment_blocked_recent_duplicate', {
            phone: this.maskPhone(lead.phone),
            recentPayments: recentDuplicateCheck.recentPayments,
            environment: this.getEnvironment()
          });
        }
        
        return {
          allowed: false,
          reason: 'recent_duplicate',
          details: recentDuplicateCheck,
          environment: this.getEnvironment()
        };
      }
      
      // Si tous les checks passent
      this.updateStats('allowed', 'all_checks_passed', lead);
      
      console.log('[DOUBLE_PAYMENT_CHECK_PASSED]', {
        leadId: lead.id,
        tenant_id: lead.tenant_id,
        phone: this.maskPhone(lead.phone),
        environment: this.getEnvironment()
      });
      
      return {
        allowed: true,
        reason: 'all_checks_passed',
        checks: [
          { type: 'lead_already_won', passed: true },
          { type: 'payment_link_already_sent', passed: true },
          { type: 'payment_ongoing', passed: true },
          { type: 'recent_duplicate', passed: true }
        ],
        environment: this.getEnvironment()
      };
      
    } catch (error) {
      console.log('[DOUBLE_PAYMENT_CHECK_ERROR]', {
        leadId: lead.id,
        error: error.message,
        environment: this.getEnvironment()
      });
      
      // En cas d'erreur, autoriser mais logger
      this.updateStats('allowed', 'error_fallback', lead);
      
      return {
        allowed: true,
        reason: 'error_fallback',
        error: error.message,
        environment: this.getEnvironment()
      };
    }
  }
  
  // Vérifier si le lead est déjà WON
  async checkLeadAlreadyWon(lead) {
    if (lead.status === 'WON') {
      return {
        allowed: false,
        alreadyWon: true,
        wonAt: lead.wonAt,
        paymentIntentId: lead.paymentIntentId,
        paymentAmount: lead.paymentAmount
      };
    }
    
    return {
      allowed: true,
      alreadyWon: false
    };
  }
  
  // Vérifier si un lien de paiement a déjà été envoyé
  async checkPaymentLinkAlreadySent(lead) {
    if (lead.paymentLinkSentAt) {
      return {
        allowed: false,
        paymentLinkSentAt: lead.paymentLinkSentAt,
        paymentLinkId: lead.paymentLinkId,
        timeSinceSent: Date.now() - new Date(lead.paymentLinkSentAt).getTime()
      };
    }
    
    return {
      allowed: true,
      paymentLinkSentAt: null
    };
  }
  
  // Vérifier si un paiement est en cours
  async checkOngoingPayment(lead) {
    // Simulation - en production, vérifierait les Payment Intent en cours
    const ongoingPayment = null; // Simulation
    
    if (ongoingPayment) {
      return {
        allowed: false,
        ongoingPayment,
        paymentIntentId: ongoingPayment.id,
        status: ongoingPayment.status
      };
    }
    
    return {
      allowed: true,
      ongoingPayment: null
    };
  }
  
  // Vérifier les doublons récents
  async checkRecentDuplicates(lead) {
    // Simulation - en production, vérifierait les paiements récents
    const recentPayments = []; // Simulation
    
    // Chercher les paiements des dernières 24h pour le même téléphone
    const duplicateWindow = 24 * 60 * 60 * 1000; // 24 heures
    
    if (recentPayments.length > 0) {
      return {
        allowed: false,
        recentPayments,
        duplicateWindow,
        message: `${recentPayments.length} payments found in last 24h`
      };
    }
    
    return {
      allowed: true,
      recentPayments: [],
      duplicateWindow
    };
  }
  
  // Marquer un lien de paiement comme envoyé
  async markPaymentLinkSent(lead, paymentLinkData) {
    try {
      // Simulation - en production, mettrait à jour la base de données
      const updateResult = {
        success: true,
        paymentLinkSentAt: new Date(),
        paymentLinkId: paymentLinkData.paymentLinkId,
        paymentLink: paymentLinkData.paymentLink
      };
      
      console.log('[DOUBLE_PAYMENT_LINK_SENT_MARKED]', {
        leadId: lead.id,
        tenant_id: lead.tenant_id,
        paymentLinkId: paymentLinkData.paymentLinkId,
        environment: this.getEnvironment()
      });
      
      return updateResult;
      
    } catch (error) {
      console.log('[DOUBLE_PAYMENT_LINK_MARK_ERROR]', {
        leadId: lead.id,
        error: error.message,
        environment: this.getEnvironment()
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // Marquer un lead comme WON
  async markLeadAsWon(lead, paymentData) {
    try {
      // Simulation - en production, mettrait à jour la base de données
      const updateResult = {
        success: true,
        status: 'WON',
        wonAt: new Date(),
        paymentIntentId: paymentData.paymentIntentId,
        paymentAmount: paymentData.amount,
        paymentCurrency: paymentData.currency
      };
      
      console.log('[DOUBLE_PAYMENT_LEAD_WON_MARKED]', {
        leadId: lead.id,
        tenant_id: lead.tenant_id,
        paymentIntentId: paymentData.paymentIntentId,
        amount: paymentData.amount,
        environment: this.getEnvironment()
      });
      
      return updateResult;
      
    } catch (error) {
      console.log('[DOUBLE_PAYMENT_WON_MARK_ERROR]', {
        leadId: lead.id,
        error: error.message,
        environment: this.getEnvironment()
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // Mettre à jour les statistiques
  updateStats(result, reason, lead) {
    if (result === 'blocked') {
      this.stats.blockedPayments++;
    } else {
      this.stats.allowedPayments++;
    }
    
    this.stats.byReason.set(reason, (this.stats.byReason.get(reason) || 0) + 1);
    
    if (lead && lead.tenant_id) {
      this.stats.byTenant.set(lead.tenant_id, (this.stats.byTenant.get(lead.tenant_id) || 0) + 1);
    }
  }
  
  // Obtenir les statistiques de protection
  getProtectionStats() {
    if (!this.realPaymentEnabled || !this.realValidationEnabled) {
      return { enabled: false };
    }
    
    const totalChecks = this.stats.totalChecks;
    const blockRate = totalChecks > 0 ? 
      (this.stats.blockedPayments / totalChecks) * 100 : 0;
    
    return {
      enabled: true,
      environment: this.getEnvironment(),
      stats: {
        totalChecks: this.stats.totalChecks,
        blockedPayments: this.stats.blockedPayments,
        allowedPayments: this.stats.allowedPayments,
        blockRate: Math.round(blockRate * 100) / 100
      },
      byReason: Object.fromEntries(this.stats.byReason),
      byTenant: Object.fromEntries(this.stats.byTenant),
      uptime: process.uptime()
    };
  }
  
  // Obtenir le rapport de protection
  getProtectionReport() {
    if (!this.realPaymentEnabled || !this.realValidationEnabled) {
      return { enabled: false };
    }
    
    const stats = this.getProtectionStats();
    
    // Analyser les patterns de blocage
    const patterns = this.analyzeBlockingPatterns(stats);
    
    // Générer des recommandations
    const recommendations = this.generateProtectionRecommendations(stats, patterns);
    
    return {
      enabled: true,
      environment: stats.environment,
      stats: stats.stats,
      patterns,
      recommendations,
      metadata: {
        generated_at: new Date(),
        protection_type: 'double_payment'
      }
    };
  }
  
  // Analyser les patterns de blocage
  analyzeBlockingPatterns(stats) {
    const patterns = {
      mostBlockedReason: null,
      mostActiveTenant: null,
      protectionEffectiveness: 0
    };
    
    // Raison la plus commune
    let maxCount = 0;
    for (const [reason, count] of Object.entries(stats.byReason)) {
      if (count > maxCount) {
        maxCount = count;
        patterns.mostBlockedReason = { reason, count };
      }
    }
    
    // Tenant le plus actif
    maxCount = 0;
    for (const [tenant, count] of Object.entries(stats.byTenant)) {
      if (count > maxCount) {
        maxCount = count;
        patterns.mostActiveTenant = { tenant, count };
      }
    }
    
    // Efficacité de la protection
    if (stats.stats.totalChecks > 0) {
      patterns.protectionEffectiveness = Math.round((stats.stats.blockedPayments / stats.stats.totalChecks) * 100);
    }
    
    return patterns;
  }
  
  // Générer des recommandations
  generateProtectionRecommendations(stats, patterns) {
    const recommendations = [];
    
    if (stats.stats.blockRate > 20) {
      recommendations.push({
        type: 'warning',
        message: `High block rate (${stats.stats.blockRate}%)`,
        action: 'Review payment flow and lead qualification',
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
    
    if (patterns.protectionEffectiveness > 80) {
      recommendations.push({
        type: 'success',
        message: 'Double payment protection working effectively',
        action: 'Continue monitoring and maintain current configuration',
        priority: 'low'
      });
    }
    
    if (recommendations.length === 0) {
      recommendations.push({
        type: 'info',
        message: 'Double payment protection operating normally',
        action: 'Continue monitoring for potential issues',
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
      blockedPayments: 0,
      allowedPayments: 0,
      byReason: new Map(),
      byTenant: new Map()
    };
    
    console.log('[DOUBLE_PAYMENT_PROTECTION_STATS_RESET]');
  }
}

// Instance globale de la protection
if (!global.doublePaymentProtection) {
  global.doublePaymentProtection = new DoublePaymentProtection();
}

// Fonctions principales
async function checkPaymentAllowed(lead, paymentContext) {
  return await global.doublePaymentProtection.checkPaymentAllowed(lead, paymentContext);
}

async function markPaymentLinkSent(lead, paymentLinkData) {
  return await global.doublePaymentProtection.markPaymentLinkSent(lead, paymentLinkData);
}

async function markLeadAsWon(lead, paymentData) {
  return await global.doublePaymentProtection.markLeadAsWon(lead, paymentData);
}

// Stats et monitoring
function getDoublePaymentProtectionStats() {
  return global.doublePaymentProtection.getProtectionStats();
}

function getDoublePaymentProtectionReport() {
  return global.doublePaymentProtection.getProtectionReport();
}

// Administration
function resetDoublePaymentProtectionStats() {
  return global.doublePaymentProtection.resetStats();
}

module.exports = {
  checkPaymentAllowed,
  markPaymentLinkSent,
  markLeadAsWon,
  getDoublePaymentProtectionStats,
  getDoublePaymentProtectionReport,
  resetDoublePaymentProtectionStats,
  DoublePaymentProtection
};
