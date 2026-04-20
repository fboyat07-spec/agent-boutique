const TenantService = require('./TenantService');
const { v4: uuidv4 } = require('uuid');

/**
 * Stripe Payment Service
 * Handles subscription management, payments, and billing
 */
class PaymentService {
  constructor() {
    this.plans = {
      free: {
        id: 'price_free',
        name: 'KidAI Gratuit',
        description: 'Fonctionnalités de base pour commencer',
        price: 0,
        currency: 'eur',
        interval: 'month',
        features: {
          max_students: 3,
          max_exercises_per_day: 20,
          ai_tutor: false,
          voice_features: false,
          advanced_analytics: false,
          rewards_system: true,
          parent_dashboard: true,
          export_reports: false,
          api_access: false
        },
        stripe_price_id: null
      },
      premium: {
        id: 'price_premium',
        name: 'KidAI Premium',
        description: 'Accès complet pour les familles',
        price: 9.99,
        currency: 'eur',
        interval: 'month',
        features: {
          max_students: 10,
          max_exercises_per_day: 100,
          ai_tutor: true,
          voice_features: true,
          advanced_analytics: true,
          rewards_system: true,
          parent_dashboard: true,
          export_reports: true,
          api_access: false
        },
        stripe_price_id: 'price_1O9ABC123DEF456' // Would be actual Stripe price ID
      },
      school: {
        id: 'price_school',
        name: 'KidAI École',
        description: 'Solution complète pour les établissements',
        price: 199.99,
        currency: 'eur',
        interval: 'month',
        features: {
          max_students: 500,
          max_exercises_per_day: 10000,
          ai_tutor: true,
          voice_features: true,
          advanced_analytics: true,
          rewards_system: true,
          parent_dashboard: true,
          export_reports: true,
          api_access: true,
          teacher_dashboard: true,
          class_management: true,
          bulk_operations: true
        },
        stripe_price_id: 'price_1O9XYZ789UVW012' // Would be actual Stripe price ID
      }
    };

    this.trialPeriods = {
      premium: 14, // days
      school: 30 // days
    };
  }

  async createCheckoutSession(tenantId, planId, customerInfo = {}) {
    try {
      const tenant = await TenantService.getTenant(tenantId);
      const plan = this.plans[planId];
      
      if (!plan) {
        throw new Error('Plan non trouvé');
      }

      // Create or retrieve Stripe customer
      const customer = await this.getOrCreateStripeCustomer(tenant, customerInfo);
      
      const checkoutSession = {
        session_id: uuidv4(),
        tenant_id: tenantId,
        customer_id: customer.id,
        plan_id: planId,
        plan_name: plan.name,
        amount: plan.price * 100, // Convert to cents
        currency: plan.currency,
        success_url: `${process.env.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/payment/cancel?session_id={CHECKOUT_SESSION_ID}`,
        payment_methods: ['card'],
        mode: plan.price > 0 ? 'subscription' : 'setup',
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 minutes
      };

      // Add trial period if applicable
      if (plan.price > 0 && this.trialPeriods[planId]) {
        checkoutSession.trial_period_days = this.trialPeriods[planId];
      }

      // In production, this would create an actual Stripe Checkout Session
      // const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      // const session = await stripe.checkout.sessions.create({
      //   customer: customer.id,
      //   payment_method_types: ['card'],
      //   line_items: [{
      //     price: plan.stripe_price_id,
      //     quantity: 1,
      //   }],
      //   mode: 'subscription',
      //   success_url: checkoutSession.success_url,
      //   cancel_url: checkoutSession.cancel_url,
      //   trial_period_days: checkoutSession.trial_period_days
      // });

      return {
        checkout_session_id: checkoutSession.session_id,
        checkout_url: `${process.env.FRONTEND_URL}/checkout/${checkoutSession.session_id}`,
        plan: plan,
        customer: {
          id: customer.id,
          email: customer.email,
          name: customer.name
        },
        trial_period: checkoutSession.trial_period_days,
        expires_at: checkoutSession.expires_at
      };
    } catch (error) {
      throw new Error(`Erreur création session paiement: ${error.message}`);
    }
  }

  async processPayment(sessionId) {
    try {
      const session = await this.getCheckoutSession(sessionId);
      
      if (session.status !== 'completed') {
        throw new Error('Session de paiement non complétée');
      }

      // Update tenant subscription
      const tenant = await TenantService.getTenant(session.tenant_id);
      await TenantService.upgradeSubscription(session.tenant_id, session.plan_id, {
        customer_id: session.customer_id,
        subscription_id: session.subscription_id
      });

      // Create subscription record
      const subscription = {
        subscription_id: uuidv4(),
        tenant_id: session.tenant_id,
        stripe_customer_id: session.customer_id,
        stripe_subscription_id: session.subscription_id,
        plan_id: session.plan_id,
        status: 'active',
        current_period_start: new Date().toISOString(),
        current_period_end: this.calculatePeriodEnd(session.plan_id),
        trial_end: session.trial_period_days ? 
          new Date(Date.now() + session.trial_period_days * 24 * 60 * 60 * 1000).toISOString() : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Send confirmation
      await this.sendPaymentConfirmation(tenant, subscription);

      return {
        payment_processed: true,
        subscription,
        plan: this.plans[session.plan_id],
        next_billing: subscription.current_period_end
      };
    } catch (error) {
      throw new Error(`Erreur traitement paiement: ${error.message}`);
    }
  }

  async createCustomerPortalSession(tenantId) {
    try {
      const tenant = await TenantService.getTenant(tenantId);
      
      if (!tenant.subscription.stripe_customer_id) {
        throw new Error('Aucun client Stripe trouvé');
      }

      const portalSession = {
        session_id: uuidv4(),
        tenant_id: tenantId,
        customer_id: tenant.subscription.stripe_customer_id,
        return_url: `${process.env.FRONTEND_URL}/account/billing`,
        created_at: new Date().toISOString()
      };

      // In production, this would create an actual Stripe Customer Portal Session
      // const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      // const session = await stripe.billingPortal.sessions.create({
      //   customer: tenant.subscription.stripe_customer_id,
      //   return_url: portalSession.return_url
      // });

      return {
        portal_session_id: portalSession.session_id,
        portal_url: `${process.env.FRONTEND_URL}/billing/portal/${portalSession.session_id}`,
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString()
      };
    } catch (error) {
      throw new Error(`Erreur portail client: ${error.message}`);
    }
  }

  async handleWebhook(eventType, eventData) {
    try {
      switch (eventType) {
        case 'checkout.session.completed':
          return await this.handleCheckoutCompleted(eventData);
        case 'invoice.payment_succeeded':
          return await this.handlePaymentSucceeded(eventData);
        case 'invoice.payment_failed':
          return await this.handlePaymentFailed(eventData);
        case 'customer.subscription.deleted':
          return await this.handleSubscriptionCancelled(eventData);
        case 'customer.subscription.updated':
          return await this.handleSubscriptionUpdated(eventData);
        default:
          return { handled: false, message: 'Event type not handled' };
      }
    } catch (error) {
      throw new Error(`Erreur webhook: ${error.message}`);
    }
  }

  async getSubscriptionStatus(tenantId) {
    try {
      const tenant = await TenantService.getTenant(tenantId);
      
      if (!tenant.subscription.stripe_subscription_id) {
        return {
          status: 'free',
          plan: this.plans.free,
          current_period_end: null,
          trial_end: null,
          cancel_at_period_end: false
        };
      }

      // In production, this would fetch from Stripe
      // const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      // const subscription = await stripe.subscriptions.retrieve(tenant.subscription.stripe_subscription_id);

      return {
        status: tenant.subscription.status,
        plan: this.plans[tenant.subscription.plan],
        current_period_end: tenant.subscription.next_billing,
        trial_end: tenant.subscription.trial_ends,
        cancel_at_period_end: tenant.subscription.cancel_at_period_end || false,
        payment_method: 'card', // Would fetch from Stripe
        next_billing_amount: this.plans[tenant.subscription.plan].price
      };
    } catch (error) {
      throw new Error(`Erreur statut abonnement: ${error.message}`);
    }
  }

  async cancelSubscription(tenantId, immediate = false, reason = '') {
    try {
      const tenant = await TenantService.getTenant(tenantId);
      
      if (!tenant.subscription.stripe_subscription_id) {
        throw new Error('Aucun abonnement à annuler');
      }

      // In production, this would cancel with Stripe
      // const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      // if (immediate) {
      //   await stripe.subscriptions.del(tenant.subscription.stripe_subscription_id);
      // } else {
      //   await stripe.subscriptions.update(tenant.subscription.stripe_subscription_id, {
      //     cancel_at_period_end: true
      //   });
      // }

      // Update tenant record
      tenant.subscription.status = immediate ? 'cancelled' : 'active';
      tenant.subscription.cancel_at_period_end = !immediate;
      tenant.subscription.cancellation_reason = reason;
      tenant.subscription.updated_at = new Date().toISOString();

      // Send cancellation confirmation
      await this.sendCancellationConfirmation(tenant, immediate);

      return {
        subscription_cancelled: true,
        immediate: immediate,
        access_until: immediate ? null : tenant.subscription.next_billing,
        plan: this.plans[tenant.subscription.plan]
      };
    } catch (error) {
      throw new Error(`Erreur annulation abonnement: ${error.message}`);
    }
  }

  async updateSubscription(tenantId, newPlanId) {
    try {
      const tenant = await TenantService.getTenant(tenantId);
      const newPlan = this.plans[newPlanId];
      
      if (!newPlan) {
        throw new Error('Plan non trouvé');
      }

      // In production, this would update with Stripe
      // const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      // const subscription = await stripe.subscriptions.update(tenant.subscription.stripe_subscription_id, {
      //   items: [{
      //     id: subscription.items.data[0].id,
      //     price: newPlan.stripe_price_id,
      //   }],
      //   proration_behavior: 'create_prorations'
      // });

      // Update tenant record
      await TenantService.upgradeSubscription(tenantId, newPlanId, {
        customer_id: tenant.subscription.stripe_customer_id,
        subscription_id: tenant.subscription.stripe_subscription_id
      });

      return {
        subscription_updated: true,
        old_plan: this.plans[tenant.subscription.plan],
        new_plan: newPlan,
        effective_date: new Date().toISOString(),
        prorated_amount: this.calculateProratedAmount(tenant, newPlan)
      };
    } catch (error) {
      throw new Error(`Erreur mise à jour abonnement: ${error.message}`);
    }
  }

  async getBillingHistory(tenantId, limit = 12) {
    try {
      const tenant = await TenantService.getTenant(tenantId);
      
      // In production, this would fetch from Stripe
      // const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      // const invoices = await stripe.invoices.list({
      //   customer: tenant.subscription.stripe_customer_id,
      //   limit: limit
      // });

      // Mock billing history
      const billingHistory = [
        {
          id: 'in_1ABC123',
          date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          amount: 9.99,
          currency: 'eur',
          status: 'paid',
          description: 'Abonnement KidAI Premium',
          invoice_url: 'https://stripe.com/invoice/in_1ABC123'
        }
      ];

      return {
        tenant_id: tenantId,
        billing_history: billingHistory,
        total_paid: billingHistory
          .filter(inv => inv.status === 'paid')
          .reduce((sum, inv) => sum + inv.amount, 0),
        next_payment: tenant.subscription.next_billing
      };
    } catch (error) {
      throw new Error(`Erreur historique facturation: ${error.message}`);
    }
  }

  async getUsageMetrics(tenantId, period = 'month') {
    try {
      const tenant = await TenantService.getTenant(tenantId);
      
      const metrics = {
        tenant_id: tenantId,
        period,
        current_usage: tenant.usage,
        limits: tenant.limits,
        utilization: {
          students: (tenant.usage.students / tenant.limits.students) * 100,
          exercises: (tenant.usage.exercises_today / tenant.limits.exercises_per_day) * 100,
          storage: (tenant.usage.storage_mb / tenant.limits.storage_mb) * 100
        },
        recommendations: this.getUsageRecommendations(tenant)
      };

      return metrics;
    } catch (error) {
      throw new Error(`Erreur métriques utilisation: ${error.message}`);
    }
  }

  // Helper methods
  async getOrCreateStripeCustomer(tenant, customerInfo) {
    if (tenant.subscription.stripe_customer_id) {
      // Return existing customer
      return {
        id: tenant.subscription.stripe_customer_id,
        email: tenant.email,
        name: tenant.name
      };
    }

    // Create new customer
    const customer = {
      id: `cus_${uuidv4().replace(/-/g, '')}`,
      email: tenant.email,
      name: tenant.name,
      phone: customerInfo.phone || null,
      address: customerInfo.address || null,
      created: new Date().toISOString()
    };

    // In production, this would create with Stripe
    // const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    // const stripeCustomer = await stripe.customers.create({
    //   email: tenant.email,
    //   name: tenant.name,
    //   phone: customerInfo.phone,
    //   address: customerInfo.address,
    //   metadata: {
    //     tenant_id: tenant.tenant_id
    //   }
    // });

    return customer;
  }

  calculatePeriodEnd(planId) {
    const plan = this.plans[planId];
    const interval = plan.interval || 'month';
    const intervalCount = 1;
    
    const now = new Date();
    if (interval === 'month') {
      now.setMonth(now.getMonth() + intervalCount);
    } else if (interval === 'year') {
      now.setFullYear(now.getFullYear() + intervalCount);
    }
    
    return now.toISOString();
  }

  async sendPaymentConfirmation(tenant, subscription) {
    // This would send email confirmation
    console.log(`Payment confirmation sent to ${tenant.email}`);
  }

  async sendCancellationConfirmation(tenant, immediate) {
    // This would send email confirmation
    console.log(`Cancellation confirmation sent to ${tenant.email}`);
  }

  calculateProratedAmount(tenant, newPlan) {
    // Simple proration calculation
    const currentPlan = this.plans[tenant.subscription.plan];
    const priceDifference = newPlan.price - currentPlan.price;
    const daysInMonth = 30;
    const daysRemaining = 15; // Simplified
    
    return Math.max(0, (priceDifference / daysInMonth) * daysRemaining);
  }

  getUsageRecommendations(tenant) {
    const recommendations = [];
    
    if (tenant.usage.students / tenant.limits.students > 0.8) {
      recommendations.push({
        type: 'upgrade_students',
        message: 'Vous approchez la limite d\'élèves',
        action: 'upgrade_plan'
      });
    }
    
    if (tenant.usage.exercises_today / tenant.limits.exercises_per_day > 0.8) {
      recommendations.push({
        type: 'upgrade_exercises',
        message: 'Utilisation élevée d\'exercices',
        action: 'upgrade_plan'
      });
    }
    
    return recommendations;
  }

  // Webhook handlers
  async handleCheckoutCompleted(eventData) {
    const session = eventData;
    await this.processPayment(session.id);
    return { handled: true, message: 'Checkout completed' };
  }

  async handlePaymentSucceeded(eventData) {
    const invoice = eventData;
    // Update subscription status, send receipt
    return { handled: true, message: 'Payment succeeded' };
  }

  async handlePaymentFailed(eventData) {
    const invoice = eventData;
    // Notify customer, update subscription status
    return { handled: true, message: 'Payment failed' };
  }

  async handleSubscriptionCancelled(eventData) {
    const subscription = eventData;
    // Update tenant subscription status
    return { handled: true, message: 'Subscription cancelled' };
  }

  async handleSubscriptionUpdated(eventData) {
    const subscription = eventData;
    // Update tenant subscription details
    return { handled: true, message: 'Subscription updated' };
  }

  // Placeholder implementations
  async getCheckoutSession(sessionId) {
    // This would fetch from database
    throw new Error('Session storage not implemented');
  }
}

module.exports = new PaymentService();
