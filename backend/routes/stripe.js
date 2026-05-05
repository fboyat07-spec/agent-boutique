const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/User');
const SaaSTenant = require('../models/SaaSTenant');

// Create Stripe checkout session
router.post('/create-checkout-session', async (req, res) => {
  try {
    const { email, tenant_id } = req.body;

    if (!email || !tenant_id) {
      return res.status(400).json({ error: 'Email et tenant_id requis' });
    }

    // Get or create Stripe customer
    const user = await User.findOne({ email, tenant_id });
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    console.log('[STRIPE CHECKOUT] User found', { 
      email, 
      tenant_id, 
      existing_customer_id: user.stripe_customer_id 
    });

    let customerId = user.stripe_customer_id;
    if (!customerId) {
      console.log('[STRIPE CHECKOUT] Creating new customer');
      const customer = await stripe.customers.create({
        email: email,
        metadata: { tenant_id }
      });
      customerId = customer.id;
      
      // Update user with Stripe customer ID
      user.stripe_customer_id = customerId;
      await user.save();
      
      console.log('[STRIPE CHECKOUT] Customer created and saved', { customerId });
    } else {
      console.log('[STRIPE CHECKOUT] Using existing customer', { customerId });
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{
        price: 'price_1month', // Replace with actual price ID
        quantity: 1,
      }],
      success_url: `${process.env.FRONTEND_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/billing/cancel`,
      metadata: {
        tenant_id,
        user_id: user.user_id
      }
    });

    res.json({ 
      sessionId: session.id,
      url: session.url 
    });

  } catch (error) {
    console.error('[STRIPE CHECKOUT ERROR]', error);
    res.status(500).json({ error: 'Erreur création session Stripe' });
  }
});

// Stripe webhook handler
router.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
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
      
      // Update user subscription
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

      // Update tenant subscription
      await SaaSTenant.updateOne(
        { tenant_id: session.metadata.tenant_id },
        { 
          subscription_status: 'active',
          stripe_subscription_id: session.subscription 
        }
      );

      console.log('[STRIPE SUBSCRIPTION ACTIVATED]', {
        tenant_id: session.metadata.tenant_id,
        user_id: session.metadata.user_id,
        subscription_id: session.subscription
      });
      break;

    case 'invoice.payment_failed':
      const failedInvoice = event.data.object;
      
      // Update subscription status to past_due
      await User.updateOne(
        { stripe_customer_id: failedInvoice.customer },
        { subscription_status: 'past_due' }
      );

      await SaaSTenant.updateOne(
        { stripe_subscription_id: failedInvoice.subscription },
        { subscription_status: 'past_due' }
      );
      break;

    case 'customer.subscription.deleted':
      const cancelledSubscription = event.data.object;
      
      // Update subscription status to cancelled
      await User.updateOne(
        { stripe_customer_id: cancelledSubscription.customer },
        { subscription_status: 'cancelled' }
      );

      await SaaSTenant.updateOne(
        { stripe_subscription_id: cancelledSubscription.id },
        { subscription_status: 'cancelled' }
      );
      break;

    default:
      console.log(`[STRIPE WEBHOOK] Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

module.exports = router;
