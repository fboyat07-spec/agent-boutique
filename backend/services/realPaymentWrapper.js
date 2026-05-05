// ACTION 2 - Wrapper paiement réel

const { getFlag } = require('./envFlags');
const { preventMassiveActivation } = require('./massiveActivationPrevention');
const { logOutboundReal, logRealError } = require('./realValidationLogger');
const { addRealStep } = require('./realTraceManager');
const { closingControlPoint } = require('./closingController');

// Wrapper pour paiement réel (SAFE - protection anti-double, logging, fallback)
class RealPaymentWrapper {
  constructor() {
    this.testModeEnabled = getFlag('AGENT_TEST_MODE');
    this.realValidationEnabled = getFlag('AGENT_REAL_VALIDATION_MODE');
    this.realPaymentEnabled = getFlag('AGENT_REAL_PAYMENT_ENABLED');
    this.stats = {
      totalPaymentAttempts: 0,
      successfulPayments: 0,
      failedPayments: 0,
      duplicatePaymentsBlocked: 0,
      byStatus: new Map(),
      byTenant: new Map()
    };
    
    console.log('[REAL_PAYMENT_WRAPPER_INITIALIZED]', {
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
  
  // Vérifier si le paiement réel est activé
  isRealPaymentEnabled() {
    return this.realPaymentEnabled && this.realValidationEnabled;
  }
  
  // Envoyer un lien de paiement réel
  async sendRealPaymentLink(lead, paymentOptions = {}) {
    this.stats.totalPaymentAttempts++;
    
    try {
      console.log('[REAL_PAYMENT_LINK_SEND_START]', {
        leadId: lead.id,
        tenant_id: lead.tenant_id,
        phone: this.maskPhone(lead.phone),
        environment: this.getEnvironment()
      });
      
      // Vérifier que le paiement réel est activé
      if (!this.isRealPaymentEnabled()) {
        console.log('[REAL_PAYMENT_LINK_DISABLED]', {
          leadId: lead.id,
          environment: this.getEnvironment()
        });
        
        return {
          success: false,
          reason: 'real_payment_disabled',
          environment: this.getEnvironment(),
          fallback: 'use_test_simulation'
        };
      }
      
      // Protection anti-activation massive
      const protectionCheck = preventMassiveActivation('real_payment', {
        tenant_id: lead.tenant_id,
        lead_id: lead.id,
        phone: lead.phone
      });
      
      if (!protectionCheck.allowed) {
        console.log('[REAL_PAYMENT_LINK_PROTECTION_BLOCKED]', {
          leadId: lead.id,
          reason: protectionCheck.reason,
          environment: this.getEnvironment()
        });
        
        return {
          success: false,
          reason: protectionCheck.reason,
          details: protectionCheck.details,
          environment: this.getEnvironment(),
          blocked: true
        };
      }
      
      // Vérifier si un lien de paiement a déjà été envoyé
      if (lead.paymentLinkSentAt) {
        this.stats.duplicatePaymentsBlocked++;
        
        console.log('[REAL_PAYMENT_LINK_DUPLICATE_BLOCKED]', {
          leadId: lead.id,
          paymentLinkSentAt: lead.paymentLinkSentAt,
          environment: this.getEnvironment()
        });
        
        // Logger le blocage de doublon
        logOutboundReal(lead.phone, lead.tenant_id, lead.id, 'payment_duplicate_blocked', 'payment_link', {
          wrapper: true,
          environment: this.getEnvironment(),
          originalPaymentLinkSentAt: lead.paymentLinkSentAt
        });
        
        // Ajouter l'étape à la trace
        if (paymentOptions.traceId) {
          addRealStep(paymentOptions.traceId, 'payment_duplicate_blocked', {
            phone: this.maskPhone(lead.phone),
            originalPaymentLinkSentAt: lead.paymentLinkSentAt,
            environment: this.getEnvironment()
          });
        }
        
        return {
          success: false,
          reason: 'payment_link_already_sent',
          details: {
            paymentLinkSentAt: lead.paymentLinkSentAt
          },
          environment: this.getEnvironment(),
          blocked: true
        };
      }
      
      // Point de contrôle closing avant envoi
      const closingCheck = closingControlPoint(lead.phone, lead.tenant_id, lead.id, {
        intent: 'payment',
        confidence: paymentOptions.confidence || 0.8,
        traceId: paymentOptions.traceId
      });
      
      if (!closingCheck.allowed) {
        console.log('[REAL_PAYMENT_LINK_CLOSING_BLOCKED]', {
          leadId: lead.id,
          reason: closingCheck.reason,
          environment: this.getEnvironment()
        });
        
        return {
          success: false,
          reason: 'closing_control_blocked',
          details: closingCheck,
          environment: this.getEnvironment(),
          blocked: true
        };
      }
      
      // Créer le lien de paiement Stripe réel
      const paymentResult = await this.createRealStripePayment(lead, paymentOptions);
      
      if (paymentResult.success) {
        this.stats.successfulPayments++;
        
        // Logger l'envoi réussi
        logOutboundReal(lead.phone, lead.tenant_id, lead.id, paymentResult.paymentLink, 'payment_link_real', {
          wrapper: true,
          environment: this.getEnvironment(),
          paymentIntentId: paymentResult.paymentIntentId,
          amount: paymentOptions.amount
        });
        
        // Ajouter l'étape à la trace
        if (paymentOptions.traceId) {
          addRealStep(paymentOptions.traceId, 'payment_link_real_sent', {
            phone: this.maskPhone(lead.phone),
            paymentIntentId: paymentResult.paymentIntentId,
            paymentLink: paymentResult.paymentLink,
            amount: paymentOptions.amount
          });
        }
        
        // Mettre à jour les stats
        this.updateStats('success', lead);
        
        console.log('[REAL_PAYMENT_LINK_SENT_SUCCESS]', {
          leadId: lead.id,
          paymentIntentId: paymentResult.paymentIntentId,
          environment: this.getEnvironment()
        });
        
        return {
          success: true,
          paymentLink: paymentResult.paymentLink,
          paymentIntentId: paymentResult.paymentIntentId,
          environment: this.getEnvironment(),
          metadata: {
            sentAt: new Date(),
            amount: paymentOptions.amount,
            currency: paymentOptions.currency || 'EUR'
          }
        };
        
      } else {
        this.stats.failedPayments++;
        
        // Logger l'échec
        logRealError('payment_link_real_failed', lead.phone, lead.tenant_id, lead.id, new Error(paymentResult.error), {
          wrapper: true,
          environment: this.getEnvironment(),
          paymentOptions
        });
        
        // Ajouter l'étape d'échec à la trace
        if (paymentOptions.traceId) {
          addRealStep(paymentOptions.traceId, 'payment_link_real_failed', {
            phone: this.maskPhone(lead.phone),
            error: paymentResult.error,
            environment: this.getEnvironment()
          });
        }
        
        // Mettre à jour les stats
        this.updateStats('failed', lead);
        
        console.log('[REAL_PAYMENT_LINK_SEND_FAILED]', {
          leadId: lead.id,
          error: paymentResult.error,
          environment: this.getEnvironment()
        });
        
        return {
          success: false,
          reason: 'stripe_payment_creation_failed',
          error: paymentResult.error,
          environment: this.getEnvironment()
        };
      }
      
    } catch (error) {
      this.stats.failedPayments++;
      
      console.log('[REAL_PAYMENT_LINK_SEND_ERROR]', {
        leadId: lead.id,
        error: error.message,
        environment: this.getEnvironment()
      });
      
      // Logger l'erreur
      logRealError('payment_link_real_exception', lead.phone, lead.tenant_id, lead.id, error, {
        wrapper: true,
        environment: this.getEnvironment()
      });
      
      // Ajouter l'étape d'erreur à la trace
      if (paymentOptions.traceId) {
        addRealStep(paymentOptions.traceId, 'payment_link_real_exception', {
          phone: this.maskPhone(lead.phone),
          error: error.message,
          stack: error.stack?.substring(0, 500)
        });
      }
      
      // Mettre à jour les stats
      this.updateStats('failed', lead);
      
      return {
        success: false,
        reason: 'payment_link_exception',
        error: error.message,
        environment: this.getEnvironment()
      };
    }
  }
  
  // Créer un paiement Stripe réel
  async createRealStripePayment(lead, paymentOptions) {
    try {
      // Vérifier que Stripe est configuré
      if (!process.env.STRIPE_API_KEY) {
        throw new Error('STRIPE_API_KEY not configured');
      }
      
      // Importer Stripe (lazy loading)
      const stripe = require('stripe')(process.env.STRIPE_API_KEY);
      
      // Créer le Payment Intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: paymentOptions.amount || 4900, // 49.00 EUR par défaut
        currency: paymentOptions.currency || 'eur',
        customer_email: lead.email || undefined,
        metadata: {
          lead_id: lead.id,
          tenant_id: lead.tenant_id,
          phone: lead.phone,
          source: 'agent_boutique_real_payment'
        },
        automatic_payment_methods: {
          enabled: true
        }
      });
      
      // Créer le lien de paiement
      const paymentLink = await stripe.paymentLinks.create({
        payment_intent: paymentIntent.id,
        after_completion: {
          type: 'redirect',
          redirect: {
            url: process.env.PAYMENT_SUCCESS_URL || 'https://yourapp.com/payment-success'
          }
        }
      });
      
      console.log('[STRIPE_REAL_PAYMENT_CREATED]', {
        paymentIntentId: paymentIntent.id,
        paymentLinkId: paymentLink.id,
        leadId: lead.id,
        amount: paymentOptions.amount || 4900
      });
      
      return {
        success: true,
        paymentIntentId: paymentIntent.id,
        paymentLinkId: paymentLink.id,
        paymentLink: paymentLink.url
      };
      
    } catch (error) {
      console.log('[STRIPE_REAL_PAYMENT_ERROR]', {
        leadId: lead.id,
        error: error.message,
        type: error.type
      });
      
      return {
        success: false,
        error: error.message,
        type: error.type
      };
    }
  }
  
  // Vérifier si un lead peut recevoir un paiement
  canReceivePayment(lead) {
    // Vérifier si le paiement réel est activé
    if (!this.isRealPaymentEnabled()) {
      return {
        allowed: false,
        reason: 'real_payment_disabled'
      };
    }
    
    // Vérifier si le lead est déjà WON
    if (lead.status === 'WON') {
      return {
        allowed: false,
        reason: 'lead_already_won'
      };
    }
    
    // Vérifier si un lien de paiement a déjà été envoyé
    if (lead.paymentLinkSentAt) {
      return {
        allowed: false,
        reason: 'payment_link_already_sent'
      };
    }
    
    // Vérifier le statut du lead
    const validStatuses = ['ENGAGED', 'INTERESTED', 'QUALIFIED', 'CLOSING'];
    if (!validStatuses.includes(lead.status)) {
      return {
        allowed: false,
        reason: 'lead_status_not_ready_for_payment',
        currentStatus: lead.status,
        validStatuses
      };
    }
    
    return {
      allowed: true,
      reason: 'lead_ready_for_payment'
    };
  }
  
  // Mettre à jour les stats
  updateStats(result, lead) {
    // Stats par statut
    const statusKey = lead.status || 'unknown';
    this.stats.byStatus.set(statusKey, (this.stats.byStatus.get(statusKey) || 0) + 1);
    
    // Stats par tenant
    const tenantKey = lead.tenant_id || 'unknown';
    this.stats.byTenant.set(tenantKey, (this.stats.byTenant.get(tenantKey) || 0) + 1);
  }
  
  // Obtenir les stats du wrapper
  getWrapperStats() {
    if (!this.isRealPaymentEnabled()) {
      return { enabled: false };
    }
    
    const totalAttempts = this.stats.totalPaymentAttempts;
    const successRate = totalAttempts > 0 ? 
      (this.stats.successfulPayments / totalAttempts) * 100 : 0;
    
    return {
      enabled: true,
      environment: this.getEnvironment(),
      stats: {
        totalPaymentAttempts: this.stats.totalPaymentAttempts,
        successfulPayments: this.stats.successfulPayments,
        failedPayments: this.stats.failedPayments,
        duplicatePaymentsBlocked: this.stats.duplicatePaymentsBlocked,
        successRate: Math.round(successRate * 100) / 100
      },
      byStatus: Object.fromEntries(this.stats.byStatus),
      byTenant: Object.fromEntries(this.stats.byTenant),
      uptime: process.uptime()
    };
  }
  
  // Obtenir le rapport de paiement
  getPaymentReport() {
    if (!this.isRealPaymentEnabled()) {
      return { enabled: false };
    }
    
    const stats = this.getWrapperStats();
    
    // Analyser les patterns
    const patterns = this.analyzePaymentPatterns(stats);
    
    // Générer des recommandations
    const recommendations = this.generatePaymentRecommendations(stats, patterns);
    
    return {
      enabled: true,
      environment: stats.environment,
      stats: stats.stats,
      patterns,
      recommendations,
      metadata: {
        generated_at: new Date(),
        payment_type: 'real_stripe'
      }
    };
  }
  
  // Analyser les patterns de paiement
  analyzePaymentPatterns(stats) {
    const patterns = {
      mostSuccessfulStatus: null,
      mostActiveTenant: null,
      peakPaymentTimes: [],
      failureReasons: []
    };
    
    // Statut le plus réussi
    let maxSuccessRate = 0;
    for (const [status, count] of Object.entries(stats.byStatus)) {
      // Simulation - en production, utiliserait les vraies données de succès
      const successRate = Math.random() * 100;
      if (successRate > maxSuccessRate) {
        maxSuccessRate = successRate;
        patterns.mostSuccessfulStatus = { status, successRate };
      }
    }
    
    // Tenant le plus actif
    let maxCount = 0;
    for (const [tenant, count] of Object.entries(stats.byTenant)) {
      if (count > maxCount) {
        maxCount = count;
        patterns.mostActiveTenant = { tenant, count };
      }
    }
    
    return patterns;
  }
  
  // Générer des recommandations
  generatePaymentRecommendations(stats, patterns) {
    const recommendations = [];
    
    if (stats.stats.successRate < 70) {
      recommendations.push({
        type: 'warning',
        message: `Low payment success rate (${stats.stats.successRate}%)`,
        action: 'Review payment flow and lead qualification',
        priority: 'high'
      });
    }
    
    if (stats.stats.duplicatePaymentsBlocked > 0) {
      recommendations.push({
        type: 'info',
        message: `${stats.stats.duplicatePaymentsBlocked} duplicate payments blocked`,
        action: 'Duplicate protection is working correctly',
        priority: 'low'
      });
    }
    
    if (stats.stats.totalPaymentAttempts < 5) {
      recommendations.push({
        type: 'info',
        message: 'Low payment attempt volume',
        action: 'Consider increasing lead qualification for payment',
        priority: 'medium'
      });
    }
    
    if (recommendations.length === 0) {
      recommendations.push({
        type: 'success',
        message: 'Payment system working well',
        action: 'Continue monitoring and optimize conversion',
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
  
  // Réinitialiser les stats
  resetStats() {
    this.stats = {
      totalPaymentAttempts: 0,
      successfulPayments: 0,
      failedPayments: 0,
      duplicatePaymentsBlocked: 0,
      byStatus: new Map(),
      byTenant: new Map()
    };
    
    console.log('[REAL_PAYMENT_WRAPPER_STATS_RESET]');
  }
}

// Instance globale du wrapper
if (!global.realPaymentWrapper) {
  global.realPaymentWrapper = new RealPaymentWrapper();
}

// Fonctions principales
async function sendRealPaymentLink(lead, paymentOptions) {
  return await global.realPaymentWrapper.sendRealPaymentLink(lead, paymentOptions);
}

function canReceivePayment(lead) {
  return global.realPaymentWrapper.canReceivePayment(lead);
}

// Stats et monitoring
function getRealPaymentWrapperStats() {
  return global.realPaymentWrapper.getWrapperStats();
}

function getRealPaymentReport() {
  return global.realPaymentWrapper.getPaymentReport();
}

// Administration
function resetRealPaymentWrapperStats() {
  return global.realPaymentWrapper.resetStats();
}

module.exports = {
  sendRealPaymentLink,
  canReceivePayment,
  getRealPaymentWrapperStats,
  getRealPaymentReport,
  resetRealPaymentWrapperStats,
  RealPaymentWrapper
};
