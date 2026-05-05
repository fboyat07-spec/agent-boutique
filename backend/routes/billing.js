const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/User');
const SaaSTenant = require('../models/SaaSTenant');

// Créer session de checkout Stripe
router.post('/create-checkout-session', async (req, res) => {
  try {
    const { email, tenant_id } = req.body;

    if (!email || !tenant_id) {
      return res.status(400).json({ error: 'Email et tenant_id requis' });
    }

    // Récupérer l'utilisateur
    const user = await User.findOne({ email, tenant_id });
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    console.log('[CHECKOUT CREATED] User found', { 
      email, 
      tenant_id, 
      user_id: user.user_id,
      current_status: user.subscription_status 
    });

    let customerId = user.stripe_customer_id;
    
    // Créer customer Stripe si n'existe pas
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: email,
        metadata: { 
          tenant_id,
          user_id: user.user_id 
        }
      });
      customerId = customer.id;
      
      // Mettre à jour l'utilisateur avec le Stripe customer ID
      user.stripe_customer_id = customerId;
      await user.save();
      
      console.log('[CHECKOUT CREATED] New Stripe customer created', { customerId });
    } else {
      console.log('[CHECKOUT CREATED] Using existing Stripe customer', { customerId });
    }

    // Créer session de checkout
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{
        price: 'price_1month', // À remplacer avec le vrai price ID
        quantity: 1,
      }],
      success_url: `${process.env.FRONTEND_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/billing/cancel`,
      metadata: {
        tenant_id,
        user_id: user.user_id,
        email
      }
    });

    console.log('[CHECKOUT CREATED] Session created', {
      session_id: session.id,
      customer_id: customerId,
      user_id: user.user_id
    });

    res.json({
      sessionId: session.id,
      url: session.url
    });

  } catch (error) {
    console.error('[CHECKOUT ERROR]', error);
    res.status(500).json({ error: 'Erreur création session Stripe' });
  }
});

// Récupérer le statut de l'abonnement
router.get('/subscription-status', async (req, res) => {
  try {
    const { email, tenant_id } = req.query;

    if (!email || !tenant_id) {
      return res.status(400).json({ error: 'Email et tenant_id requis' });
    }

    const user = await User.findOne({ email, tenant_id });
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    res.json({
      subscription_status: user.subscription_status,
      stripe_customer_id: user.stripe_customer_id
    });

  } catch (error) {
    console.error('[SUBSCRIPTION STATUS ERROR]', error);
    res.status(500).json({ error: 'Erreur récupération statut abonnement' });
  }
});

module.exports = router;
