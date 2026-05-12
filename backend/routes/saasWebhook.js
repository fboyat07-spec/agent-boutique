const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/User');
const SaaSTenant = require('../models/SaaSTenant');
const {
  activateTenantAgent,
  deactivateTenantAgent,
  scheduleDeactivation,
  cancelScheduledDeactivation
} = require('../services/billingService');

// Webhook Stripe pour gérer les événements d'abonnement
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.log('[STRIPE WEBHOOK ERROR]', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      
      console.log('[STRIPE WEBHOOK] checkout.session.completed', {
        session_id: session.id,
        customer: session.customer,
        metadata: session.metadata
      });
      
      // Mettre à jour l'utilisateur
      const user = await User.findOne({ 
        user_id: session.metadata.user_id,
        tenant_id: session.metadata.tenant_id 
      });
      
      if (user) {
        console.log('[STRIPE WEBHOOK] User found for activation', {
          user_id: user.user_id,
          tenant_id: user.tenant_id,
          current_status: user.subscription_status
        });
        
        user.subscription_status = 'active';
        user.stripe_customer_id = session.customer;
        await user.save();
        
        console.log('[STRIPE ACTIVATED]', {
          user_id: user.user_id,
          tenant_id: user.tenant_id,
          stripe_customer_id: session.customer,
          subscription_id: session.subscription
        });
      } else {
        console.log('[STRIPE WEBHOOK] User NOT FOUND for activation', {
          metadata: session.metadata
        });
      }

      // Mettre à jour le tenant
      await SaaSTenant.updateOne(
        { tenant_id: session.metadata.tenant_id },
        { 
          subscription_status: 'active',
          stripe_subscription_id: session.subscription 
        }
      );
      
      console.log('[STRIPE WEBHOOK] Tenant subscription activated', {
        tenant_id: session.metadata.tenant_id,
        subscription_id: session.subscription
      });

      // ── ACTIVATION AGENT — couvre regular sessions + payment links ───────────
      {
        const subId = session.subscription;
        const tenantRef = session.client_reference_id;
        if (tenantRef && subId) {
          // Payment link (pas de metadata) : lier tenant via client_reference_id
          await SaaSTenant.updateOne(
            { tenant_id: tenantRef },
            {
              $set: {
                stripe_subscription_id: subId,
                stripe_customer_id: session.customer,
                subscription_status: 'active',
                updated_at: new Date()
              }
            }
          );
          console.log(`[BILLING] ✅ Tenant linked | tenant: ${tenantRef} | subscription: ${subId}`);
          await activateTenantAgent(subId, tenantRef);
        } else if (subId) {
          // Cas regular session avec metadata déjà traité plus haut
          await activateTenantAgent(subId);
        }
      }

      break;

    case 'invoice.payment_failed':
      const failedInvoice = event.data.object;
      
      console.log('[STRIPE WEBHOOK] invoice.payment_failed', {
        customer: failedInvoice.customer,
        subscription: failedInvoice.subscription
      });
      
      // Mettre à jour le statut en past_due
      await User.updateOne(
        { stripe_customer_id: failedInvoice.customer },
        { subscription_status: 'past_due' }
      );

      await SaaSTenant.updateOne(
        { stripe_subscription_id: failedInvoice.subscription },
        { subscription_status: 'past_due' }
      );
      
      console.log('[STRIPE WEBHOOK] Subscription marked as past_due');

      // ── GRACE PERIOD — désactivation planifiée 24h ─────────────────────────
      if (failedInvoice.subscription) {
        scheduleDeactivation(failedInvoice.subscription);
      }

      break;

    case 'invoice.payment_succeeded': {
      const paidInvoice = event.data.object;
      console.log('[STRIPE WEBHOOK] invoice.payment_succeeded', {
        customer: paidInvoice.customer,
        subscription: paidInvoice.subscription
      });
      if (paidInvoice.subscription) {
        cancelScheduledDeactivation(paidInvoice.subscription);
        await activateTenantAgent(paidInvoice.subscription);
      }
      break;
    }

    case 'customer.subscription.deleted':
      const cancelledSubscription = event.data.object;
      
      console.log('[STRIPE WEBHOOK] customer.subscription.deleted', {
        customer: cancelledSubscription.customer,
        subscription: cancelledSubscription.id
      });
      
      // Mettre à jour le statut en cancelled
      await User.updateOne(
        { stripe_customer_id: cancelledSubscription.customer },
        { subscription_status: 'cancelled' }
      );

      await SaaSTenant.updateOne(
        { stripe_subscription_id: cancelledSubscription.id },
        { subscription_status: 'cancelled' }
      );
      
      console.log('[STRIPE WEBHOOK] Subscription cancelled');

      // ── DÉSACTIVATION IMMÉDIATE de l'agent ─────────────────────────────────
      if (cancelledSubscription.id) {
        await deactivateTenantAgent(cancelledSubscription.id, 'subscription_deleted');
      }

      break;

    default:
      console.log(`[STRIPE WEBHOOK] Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

module.exports = router;
