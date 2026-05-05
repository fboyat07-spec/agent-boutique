// ACTION 10 - Webhook Stripe minimal (payment_intent.succeeded)

const crypto = require('crypto');
const { updateLead } = require('./leadMemory');
const { applyWonTransition } = require('./statusTransition');
const BusinessLogger = require('./businessLogger');

// Vérifier signature webhook Stripe
function verifyStripeSignature(req, secret) {
  const signature = req.headers['stripe-signature'];
  
  if (!signature || !secret) {
    BusinessLogger.logWebhookError('Missing signature or secret');
    return false;
  }
  
  try {
    const webhookSecret = secret;
    const elements = signature.split(',');
    const timestamp = elements[0].split('=')[1];
    const signedHash = elements[1].split('=')[1];
    
    // Vérifier que le timestamp n'est pas trop vieux (5 minutes)
    const webhookTimestamp = parseInt(timestamp) * 1000;
    const tolerance = 5 * 60 * 1000; // 5 minutes en ms
    if (Date.now() - webhookTimestamp > tolerance) {
      BusinessLogger.logWebhookError('Webhook timestamp too old');
      return false;
    }
    
    // Calculer le hash attendu
    const payload = `${timestamp}.${JSON.stringify(req.body)}`;
    const expectedHash = crypto
      .createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('hex');
    
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signedHash, 'hex'),
      Buffer.from(expectedHash, 'hex')
    );
    
    if (!isValid) {
      BusinessLogger.logWebhookError('Invalid signature');
    }
    
    return isValid;
    
  } catch (error) {
    BusinessLogger.logWebhookError(error.message, { context: 'signature_verification' });
    return false;
  }
}

// Traiter webhook Stripe
async function processStripeWebhook(req, res) {
  try {
    // Validation config
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      BusinessLogger.logWebhookError('Missing STRIPE_WEBHOOK_SECRET');
      return res.status(400).json({ error: 'Webhook not configured' });
    }
    
    // Vérifier signature
    if (!verifyStripeSignature(req, process.env.STRIPE_WEBHOOK_SECRET)) {
      return res.status(400).json({ error: 'Invalid signature' });
    }
    
    const event = req.body;
    
    BusinessLogger.logWebhookReceived('stripe', event.type);
    
    // Traiter payment_intent.succeeded
    if (event.type === 'payment_intent.succeeded') {
      await handlePaymentSucceeded(event.data.object);
    }
    
    // ACTION 1 - Traiter checkout.session.completed
    if (event.type === 'checkout.session.completed') {
      await handleCheckoutCompleted(event.data.object);
    }
    
    // Réponse OK
    res.status(200).json({ received: true });
    
  } catch (error) {
    BusinessLogger.logWebhookError(error.message, { context: 'stripe_webhook_processing' });
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}

// Gérer checkout session complété
async function handleCheckoutCompleted(session) {
  try {
    const metadata = session.metadata || {};
    const phone = metadata.phone;
    const tenant_id = metadata.tenant_id;
    const leadId = metadata.leadId;
    
    // ACTION 1 - Retrouver lead via metadata.phone ou metadata.leadId
    let lead = null;
    
    if (phone && tenant_id) {
      const { getLead } = require('./leadMemory');
      lead = getLead(phone, tenant_id);
    }
    
    // Fallback via leadId si disponible
    if (!lead && leadId) {
      const OutboundLead = require('../models/OutboundLead');
      lead = await OutboundLead.findById(leadId);
    }
    
    if (!lead) {
      BusinessLogger.logWebhookError('Lead not found for checkout session', {
        phone,
        tenant_id,
        leadId,
        sessionId: session.id
      });
      return;
    }
    
    // Vérifier statut actuel
    if (lead.status === 'WON') {
      BusinessLogger.logWebhookSkipped('Lead already WON', {
        phone: lead.phone,
        status: lead.status,
        sessionId: session.id
      });
      return;
    }
    
    // ACTION 1 - Appliquer status WON uniquement via webhook Stripe
    const { applyWonTransition } = require('./statusTransition');
    const transition = applyWonTransition(lead);
    
    if (transition.success) {
      // Mettre à jour lead
      const phoneToUpdate = lead.phone || phone;
      const tenantIdToUpdate = lead.tenant_id || tenant_id;
      
      if (phoneToUpdate && tenantIdToUpdate) {
        const { updateLead } = require('./leadMemory');
        updateLead(phoneToUpdate, tenantIdToUpdate, {
          status: 'WON',
          paidAt: new Date(),
          sessionId: session.id,
          amount: session.amount_total,
          currency: session.currency
        });
      }
      
      BusinessLogger.logStatusChanged(phoneToUpdate, transition.oldStatus, transition.newStatus, 'stripe_checkout_completed');
      
      // Envoyer confirmation WhatsApp
      const { sendWhatsAppMessage } = require('./messageSender');
      await sendWhatsAppMessage(phoneToUpdate, '🎉 Paiement confirmé ! Bienvenue dans le service. Je vous contacte rapidement pour la suite.');
      
      BusinessLogger.logWebhookReceived(phoneToUpdate, 'payment_confirmation_sent');
      
      console.log('[STRIPE_CHECKOUT_CONFIRMED]', {
        phone: phoneToUpdate,
        tenant_id: tenantIdToUpdate,
        sessionId: session.id,
        amount: session.amount_total / 100,
        currency: session.currency
      });
      
    } else {
      BusinessLogger.logTransitionBlocked(phone, transition.reason, transition);
    }
    
  } catch (error) {
    BusinessLogger.logWebhookError(error.message, { context: 'checkout_completed_handler' });
  }
}

// Gérer paiement réussi
async function handlePaymentSucceeded(paymentIntent) {
  try {
    const metadata = paymentIntent.metadata || {};
    const phone = metadata.phone;
    const tenant_id = metadata.tenant_id;
    
    if (!phone || !tenant_id) {
      BusinessLogger.logWebhookError('Missing phone or tenant_id in payment metadata', {
        metadata
      });
      return;
    }
    
    // Récupérer lead
    const { getLead } = require('./leadMemory');
    const lead = getLead(phone, tenant_id);
    
    if (!lead) {
      BusinessLogger.logWebhookError('Lead not found for payment', {
        phone,
        tenant_id
      });
      return;
    }
    
    // Vérifier statut actuel
    if (lead.status === 'WON') {
      BusinessLogger.logWebhookSkipped('Lead already WON', {
        phone,
        status: lead.status
      });
      return;
    }
    
    // Appliquer transition WON
    const transition = applyWonTransition(lead);
    
    if (transition.success) {
      // Mettre à jour lead
      updateLead(phone, tenant_id, {
        status: 'WON',
        paymentConfirmedAt: new Date(),
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency
      });
      
      BusinessLogger.logStatusChanged(phone, transition.oldStatus, transition.newStatus, 'stripe_payment_confirmed');
      
      // Envoyer confirmation WhatsApp
      const { sendWhatsAppMessage } = require('./messageSender');
      await sendWhatsAppMessage(phone, '🎉 Paiement confirmé ! Bienvenue dans le service. Je vous contacte rapidement pour la suite.');
      
      BusinessLogger.logWebhookReceived(phone, 'payment_confirmation_sent');
      
      console.log('[STRIPE_PAYMENT_CONFIRMED]', {
        phone,
        tenant_id,
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount / 100, // Convertir de cents
        currency: paymentIntent.currency
      });
      
    } else {
      BusinessLogger.logTransitionBlocked(phone, transition.reason, transition);
    }
    
  } catch (error) {
    BusinessLogger.logWebhookError(error.message, { context: 'payment_succeeded_handler' });
  }
}

// Stats webhook Stripe
function getStripeWebhookStats() {
  // Cette fonction pourrait tracker les stats de webhooks si nécessaire
  return {
    supportedEvents: [
      'payment_intent.succeeded'
    ],
    lastProcessed: null,
    totalProcessed: 0
  };
}

// Créer endpoint webhook
function createStripeWebhookEndpoint(app) {
  app.post('/webhook/stripe', processStripeWebhook);
  
  console.log('[STRIPE_WEBHOOK] Endpoint registered at /webhook/stripe');
  
  // Endpoint de test pour vérifier la configuration
  app.get('/webhook/stripe/health', (req, res) => {
    const configured = !!process.env.STRIPE_WEBHOOK_SECRET;
    
    res.json({
      status: configured ? 'configured' : 'not_configured',
      endpoint: '/webhook/stripe',
      supportedEvents: ['payment_intent.succeeded']
    });
  });
}

module.exports = {
  processStripeWebhook,
  handlePaymentSucceeded,
  handleCheckoutCompleted,
  verifyStripeSignature,
  getStripeWebhookStats,
  createStripeWebhookEndpoint
};
