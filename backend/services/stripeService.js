const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// SAFE: Plan mapping constant (ADDITIVE ONLY)
const PLAN_BY_PRICE_ID = {
  "price_starter_id": "starter",
  "price_pro_id": "pro", 
  "price_premium_id": "premium",
  "price_1month": "pro" // Existing hardcoded mapping
};

async function createPaymentLink() {
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'eur',
        product_data: {
          name: 'Agent Boutique IA'
        },
        unit_amount: 4900
      },
      quantity: 1
    }],
    mode: 'payment',
    success_url: 'https://yourdomain.com/success',
    cancel_url: 'https://yourdomain.com/cancel'
  });

  return session.url;
}

// SAFE: Helper function (ADDITIVE ONLY)
function getUserPlan(user) {
  return user?.plan || "starter";
}

// SAFE: Get plan from price ID (ADDITIVE ONLY)
function getPlanFromPriceId(priceId) {
  return PLAN_BY_PRICE_ID[priceId] || "starter";
}

// SAFE: Plan feature helper (ADDITIVE ONLY)
function getPlanFeatures(plan) {
  return {
    canUseClosing: plan !== "starter",
    canUseOutbound: plan !== "starter",
    maxActionsPerMinute: 
      plan === "starter" ? 5 :
      plan === "pro" ? 50 :
      Infinity,
    maxLeads:
      plan === "starter" ? 50 :
      plan === "pro" ? 500 :
      Infinity,
    multiTenant: plan === "premium"
  };
}

module.exports = { 
  createPaymentLink,
  getUserPlan,
  getPlanFromPriceId,
  getPlanFeatures,
  PLAN_BY_PRICE_ID
};
