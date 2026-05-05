// ACTION 3 - Webhook Stripe strict

const { getFlag } = require('./envFlags');
const { logRealError } = require('./realValidationLogger');
const { addRealStep } = require('./realTraceManager');

// Webhook Stripe strict pour paiement réel (SAFE - validation signature, filtrage, logging)
class RealPaymentWebhook {
  constructor() {
    this.testModeEnabled = getFlag('AGENT_TEST_MODE');
    this.realValidationEnabled = getFlag('AGENT_REAL_VALIDATION_MODE');
    this.realPaymentEnabled = getFlag('AGENT_REAL_PAYMENT_ENABLED');
    this.stats = {
      totalWebhooks: 0,
      validWebhooks: 0,
      invalidWebhooks: 0,
      paymentSucceeded: 0,
      paymentFailed: 0,
      duplicatePaymentsBlocked: 0,
      byEventType: new Map()
    };
    
    console.log('[REAL_PAYMENT_WEBHOOK_INITIALIZED]', {
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
  
  // Vérifier si le webhook de paiement réel est activé
  isRealPaymentWebhookEnabled() {
    return this.realPaymentEnabled && this.realValidationEnabled;
  }
  
  // Traiter le webhook Stripe
  async processStripeWebhook(req, res) {
    this.stats.totalWebhooks++;
    
    try {
      console.log('[REAL_PAYMENT_WEBHOOK_RECEIVED]', {
        headers: {
          'stripe-signature': req.headers['stripe-signature'] ? 'present' : 'missing'
        },
        bodySize: req.body ? req.body.length : 0,
        environment: this.getEnvironment()
      });
      
      // Vérifier que le paiement réel est activé
      if (!this.isRealPaymentWebhookEnabled()) {
        console.log('[REAL_PAYMENT_WEBHOOK_DISABLED]', {
          environment: this.getEnvironment()
        });
        
        return res.status(403).json({
          error: 'real_payment_webhook_disabled',
          environment: this.getEnvironment()
        });
      }
      
      // Validation stricte de la signature
      const signatureValidation = this.validateStripeSignature(req);
      
      if (!signatureValidation.valid) {
        this.stats.invalidWebhooks++;
        
        console.log('[REAL_PAYMENT_WEBHOOK_SIGNATURE_INVALID]', {
          error: signatureValidation.error,
          environment: this.getEnvironment()
        });
        
        // Logger l'erreur de signature
        logRealError('webhook_signature_invalid', null, null, null, new Error(signatureValidation.error), {
          environment: this.getEnvironment(),
          webhookType: 'real_payment'
        });
        
        return res.status(400).json({
          error: 'invalid_signature',
          details: signatureValidation.error,
          environment: this.getEnvironment()
        });
      }
      
      // Parser l'événement
      const event = signatureValidation.event;
      
      // Logger l'événement reçu
      this.logWebhookEvent(event);
      
      // Filtrer les événements utiles uniquement
      const eventFilter = this.filterUsefulEvent(event);
      
      if (!eventFilter.useful) {
        console.log('[REAL_PAYMENT_WEBHOOK_EVENT_FILTERED]', {
          eventType: event.type,
          reason: eventFilter.reason,
          environment: this.getEnvironment()
        });
        
        this.stats.validWebhooks++;
        return res.json({ received: true, filtered: true, reason: eventFilter.reason });
      }
      
      // Traiter l'événement
      const processingResult = await this.processWebhookEvent(event);
      
      if (processingResult.success) {
        this.stats.validWebhooks++;
        
        // Stats par type d'événement
        this.stats.byEventType.set(event.type, (this.stats.byEventType.get(event.type) || 0) + 1);
        
        console.log('[REAL_PAYMENT_WEBHOOK_PROCESSED]', {
          eventType: event.type,
          eventId: event.id,
          processingResult,
          environment: this.getEnvironment()
        });
        
        return res.json({ 
          received: true, 
          processed: true,
          eventId: event.id,
          eventType: event.type,
          environment: this.getEnvironment()
        });
        
      } else {
        console.log('[REAL_PAYMENT_WEBHOOK_PROCESSING_FAILED]', {
          eventType: event.type,
          eventId: event.id,
          error: processingResult.error,
          environment: this.getEnvironment()
        });
        
        // Logger l'erreur de traitement
        logRealError('webhook_processing_failed', null, null, null, new Error(processingResult.error), {
          eventType: event.type,
          eventId: event.id,
          environment: this.getEnvironment()
        });
        
        return res.status(500).json({
          error: 'webhook_processing_failed',
          details: processingResult.error,
          eventId: event.id,
          environment: this.getEnvironment()
        });
      }
      
    } catch (error) {
      console.log('[REAL_PAYMENT_WEBHOOK_EXCEPTION]', {
        error: error.message,
        stack: error.stack?.substring(0, 500),
        environment: this.getEnvironment()
      });
      
      // Logger l'exception
      logRealError('webhook_exception', null, null, null, error, {
        environment: this.getEnvironment(),
        webhookType: 'real_payment'
      });
      
      return res.status(500).json({
        error: 'webhook_exception',
        details: error.message,
        environment: this.getEnvironment()
      });
    }
  }
  
  // Valider la signature Stripe
  validateStripeSignature(req) {
    try {
      // Vérifier que la signature est présente
      const sig = req.headers['stripe-signature'];
      if (!sig) {
        return {
          valid: false,
          error: 'Missing stripe-signature header',
          event: null
        };
      }
      
      // Vérifier que le webhook secret est configuré
      if (!process.env.STRIPE_WEBHOOK_SECRET) {
        return {
          valid: false,
          error: 'STRIPE_WEBHOOK_SECRET not configured',
          event: null
        };
      }
      
      // Importer Stripe (lazy loading)
      const stripe = require('stripe')(process.env.STRIPE_API_KEY);
      
      // Construire l'événement avec validation stricte
      const event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
      
      return {
        valid: true,
        event,
        signaturePresent: true
      };
      
    } catch (error) {
      return {
        valid: false,
        error: error.message,
        event: null
      };
    }
  }
  
  // Filtrer les événements utiles
  filterUsefulEvent(event) {
    // Événements de paiement utiles pour les leads
    const usefulPaymentEvents = [
      'payment_intent.succeeded',
      'payment_intent.payment_failed',
      'payment_intent.canceled',
      'payment_link.created',
      'payment_link.updated'
    ];
    
    // Événements d'abonnement (pour SaaS - à séparer)
    const subscriptionEvents = [
      'checkout.session.completed',
      'invoice.payment_succeeded',
      'invoice.payment_failed',
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted'
    ];
    
    // En mode paiement réel, on ne traite que les événements de paiement
    if (usefulPaymentEvents.includes(event.type)) {
      return {
        useful: true,
        category: 'payment',
        reason: 'useful_payment_event'
      };
    }
    
    // En mode paiement réel, les événements d'abonnement sont filtrés
    if (subscriptionEvents.includes(event.type)) {
      return {
        useful: false,
        category: 'subscription',
        reason: 'subscription_event_filtered_in_payment_mode'
      };
    }
    
    // Autres événements non utiles
    return {
      useful: false,
      category: 'other',
      reason: 'event_not_useful_for_real_payment'
    };
  }
  
  // Traiter l'événement webhook
  async processWebhookEvent(event) {
    try {
      switch (event.type) {
        case 'payment_intent.succeeded':
          return await this.handlePaymentSucceeded(event);
          
        case 'payment_intent.payment_failed':
          return await this.handlePaymentFailed(event);
          
        case 'payment_intent.canceled':
          return await this.handlePaymentCanceled(event);
          
        case 'payment_link.created':
          return await this.handlePaymentLinkCreated(event);
          
        case 'payment_link.updated':
          return await this.handlePaymentLinkUpdated(event);
          
        default:
          return {
            success: false,
            error: `Unhandled event type: ${event.type}`
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // Gérer le paiement réussi
  async handlePaymentSucceeded(event) {
    const paymentIntent = event.data.object;
    
    console.log('[REAL_PAYMENT_SUCCEEDED]', {
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      metadata: paymentIntent.metadata,
      environment: this.getEnvironment()
    });
    
    // Extraire les métadonnées du lead
    const leadId = paymentIntent.metadata?.lead_id;
    const tenantId = paymentIntent.metadata?.tenant_id;
    const phone = paymentIntent.metadata?.phone;
    
    if (!leadId || !tenantId) {
      return {
        success: false,
        error: 'Missing lead_id or tenant_id in payment metadata'
      };
    }
    
    // Vérifier si le lead est déjà WON (protection double paiement)
    const leadCheck = await this.checkLeadStatus(leadId, tenantId);
    
    if (leadCheck.status === 'WON') {
      this.stats.duplicatePaymentsBlocked++;
      
      console.log('[REAL_PAYMENT_DUPLICATE_BLOCKED]', {
        leadId,
        tenantId,
        paymentIntentId: paymentIntent.id,
        currentStatus: leadCheck.status,
        environment: this.getEnvironment()
      });
      
      // Logger le blocage de doublon
      logRealError('payment_duplicate_blocked', phone, tenantId, leadId, new Error('Lead already WON'), {
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount,
        environment: this.getEnvironment()
      });
      
      return {
        success: false,
        error: 'Lead already WON - duplicate payment blocked',
        leadId,
        currentStatus: leadCheck.status
      };
    }
    
    // Mettre à jour le statut du lead à WON
    const updateResult = await this.updateLeadToWon(leadId, tenantId, paymentIntent);
    
    if (updateResult.success) {
      this.stats.paymentSucceeded++;
      
      // Logger la confirmation de paiement
      logRealError('payment_confirmed_real', phone, tenantId, leadId, new Error('Payment confirmed'), {
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        environment: this.getEnvironment()
      });
      
      // Ajouter l'étape à la trace
      addRealStep(`lead_${leadId}`, 'payment_confirmed_real', {
        phone: this.maskPhone(phone),
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        environment: this.getEnvironment()
      });
      
      return {
        success: true,
        leadId,
        tenantId,
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount,
        status: 'WON'
      };
    } else {
      return updateResult;
    }
  }
  
  // Gérer le paiement échoué
  async handlePaymentFailed(event) {
    const paymentIntent = event.data.object;
    
    console.log('[REAL_PAYMENT_FAILED]', {
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      lastPaymentError: paymentIntent.last_payment_error,
      metadata: paymentIntent.metadata,
      environment: this.getEnvironment()
    });
    
    this.stats.paymentFailed++;
    
    // Logger l'échec de paiement
    const leadId = paymentIntent.metadata?.lead_id;
    const tenantId = paymentIntent.metadata?.tenant_id;
    const phone = paymentIntent.metadata?.phone;
    
    if (leadId && tenantId) {
      logRealError('payment_failed_real', phone, tenantId, leadId, new Error(paymentIntent.last_payment_error?.message || 'Payment failed'), {
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount,
        lastPaymentError: paymentIntent.last_payment_error,
        environment: this.getEnvironment()
      });
      
      // Ajouter l'étape à la trace
      addRealStep(`lead_${leadId}`, 'payment_failed_real', {
        phone: this.maskPhone(phone),
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount,
        lastPaymentError: paymentIntent.last_payment_error?.message,
        environment: this.getEnvironment()
      });
    }
    
    return {
      success: true,
      paymentIntentId: paymentIntent.id,
      status: 'FAILED'
    };
  }
  
  // Gérer le paiement annulé
  async handlePaymentCanceled(event) {
    const paymentIntent = event.data.object;
    
    console.log('[REAL_PAYMENT_CANCELED]', {
      paymentIntentId: paymentIntent.id,
      metadata: paymentIntent.metadata,
      environment: this.getEnvironment()
    });
    
    // Logger l'annulation
    const leadId = paymentIntent.metadata?.lead_id;
    const tenantId = paymentIntent.metadata?.tenant_id;
    const phone = paymentIntent.metadata?.phone;
    
    if (leadId && tenantId) {
      logRealError('payment_canceled_real', phone, tenantId, leadId, new Error('Payment canceled'), {
        paymentIntentId: paymentIntent.id,
        environment: this.getEnvironment()
      });
      
      // Ajouter l'étape à la trace
      addRealStep(`lead_${leadId}`, 'payment_canceled_real', {
        phone: this.maskPhone(phone),
        paymentIntentId: paymentIntent.id,
        environment: this.getEnvironment()
      });
    }
    
    return {
      success: true,
      paymentIntentId: paymentIntent.id,
      status: 'CANCELED'
    };
  }
  
  // Gérer la création de lien de paiement
  async handlePaymentLinkCreated(event) {
    const paymentLink = event.data.object;
    
    console.log('[REAL_PAYMENT_LINK_CREATED]', {
      paymentLinkId: paymentLink.id,
      paymentIntentId: paymentLink.payment_intent,
      environment: this.getEnvironment()
    });
    
    return {
      success: true,
      paymentLinkId: paymentLink.id,
      status: 'LINK_CREATED'
    };
  }
  
  // Gérer la mise à jour de lien de paiement
  async handlePaymentLinkUpdated(event) {
    const paymentLink = event.data.object;
    
    console.log('[REAL_PAYMENT_LINK_UPDATED]', {
      paymentLinkId: paymentLink.id,
      paymentIntentId: paymentLink.payment_intent,
      environment: this.getEnvironment()
    });
    
    return {
      success: true,
      paymentLinkId: paymentLink.id,
      status: 'LINK_UPDATED'
    };
  }
  
  // Vérifier le statut du lead
  async checkLeadStatus(leadId, tenantId) {
    try {
      // Simulation - en production, utiliserait la vraie base de données
      const Lead = require('../models/Lead');
      const lead = await Lead.findOne({ id: leadId, tenant_id: tenantId });
      
      if (!lead) {
        return {
          found: false,
          status: null,
          error: 'Lead not found'
        };
      }
      
      return {
        found: true,
        status: lead.status,
        lead
      };
      
    } catch (error) {
      return {
        found: false,
        status: null,
        error: error.message
      };
    }
  }
  
  // Mettre à jour le lead à WON
  async updateLeadToWon(leadId, tenantId, paymentIntent) {
    try {
      // Simulation - en production, utiliserait la vraie base de données
      const Lead = require('../models/Lead');
      const updateResult = await Lead.updateOne(
        { id: leadId, tenant_id: tenantId },
        { 
          status: 'WON',
          wonAt: new Date(),
          paymentIntentId: paymentIntent.id,
          paymentAmount: paymentIntent.amount,
          paymentCurrency: paymentIntent.currency
        }
      );
      
      if (updateResult.modifiedCount > 0) {
        return {
          success: true,
          leadId,
          tenantId,
          newStatus: 'WON'
        };
      } else {
        return {
          success: false,
          error: 'Lead not found or not updated'
        };
      }
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // Logger l'événement webhook
  logWebhookEvent(event) {
    console.log('[REAL_PAYMENT_WEBHOOK_EVENT]', {
      id: event.id,
      type: event.type,
      created: new Date(event.created * 1000),
      environment: this.getEnvironment()
    });
  }
  
  // Obtenir les stats du webhook
  getWebhookStats() {
    if (!this.isRealPaymentWebhookEnabled()) {
      return { enabled: false };
    }
    
    const totalWebhooks = this.stats.totalWebhooks;
    const validRate = totalWebhooks > 0 ? 
      (this.stats.validWebhooks / totalWebhooks) * 100 : 0;
    
    return {
      enabled: true,
      environment: this.getEnvironment(),
      stats: {
        totalWebhooks: this.stats.totalWebhooks,
        validWebhooks: this.stats.validWebhooks,
        invalidWebhooks: this.stats.invalidWebhooks,
        paymentSucceeded: this.stats.paymentSucceeded,
        paymentFailed: this.stats.paymentFailed,
        duplicatePaymentsBlocked: this.stats.duplicatePaymentsBlocked,
        validRate: Math.round(validRate * 100) / 100
      },
      byEventType: Object.fromEntries(this.stats.byEventType),
      uptime: process.uptime()
    };
  }
  
  // Masquer téléphone pour logs
  maskPhone(phone) {
    if (!phone || typeof phone !== 'string') return 'unknown';
    return phone.slice(0, -4) + '****';
  }
  
  // Réinitialiser les stats
  resetStats() {
    this.stats = {
      totalWebhooks: 0,
      validWebhooks: 0,
      invalidWebhooks: 0,
      paymentSucceeded: 0,
      paymentFailed: 0,
      duplicatePaymentsBlocked: 0,
      byEventType: new Map()
    };
    
    console.log('[REAL_PAYMENT_WEBHOOK_STATS_RESET]');
  }
}

// Instance globale du webhook
if (!global.realPaymentWebhook) {
  global.realPaymentWebhook = new RealPaymentWebhook();
}

// Fonctions principales
async function processStripeWebhook(req, res) {
  return await global.realPaymentWebhook.processStripeWebhook(req, res);
}

// Stats et monitoring
function getRealPaymentWebhookStats() {
  return global.realPaymentWebhook.getWebhookStats();
}

// Administration
function resetRealPaymentWebhookStats() {
  return global.realPaymentWebhook.resetStats();
}

module.exports = {
  processStripeWebhook,
  getRealPaymentWebhookStats,
  resetRealPaymentWebhookStats,
  RealPaymentWebhook
};
