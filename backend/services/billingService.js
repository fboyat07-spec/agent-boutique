'use strict';

/**
 * BILLING SERVICE — activation/désactivation auto via events Stripe
 * ─────────────────────────────────────────────────────────────────────────────
 *   A. activateTenantAgent       → réactive l'agent après paiement réussi
 *   B. deactivateTenantAgent     → désactive l'agent (subscription cancelled)
 *   C. scheduleDeactivation      → planifie désactivation 24h après paiement échoué
 *   D. cancelScheduledDeactivation → annule désactivation si paiement réussit avant 24h
 *
 * Lookup : par stripe_subscription_id (champ existant dans SaaSTenant)
 * Override : tenantIdOverride permet de lookup par tenant_id (cas payment link)
 * Aucune fonction ne throw — toujours silencieux pour ne pas bloquer le webhook.
 */

const SaaSTenant = require('../models/SaaSTenant');
const deactivationTimers = new Map();

// ─── A. activateTenantAgent ──────────────────────────────────────────────────
async function activateTenantAgent(stripeSubscriptionId, tenantIdOverride) {
  try {
    const query = tenantIdOverride
      ? { tenant_id: tenantIdOverride }
      : { stripe_subscription_id: stripeSubscriptionId };

    const tenant = await SaaSTenant.findOneAndUpdate(
      query,
      {
        $set: {
          subscription_status: 'active',
          'settings.auto_reply_enabled': true,
          updated_at: new Date()
        }
      },
      { new: true }
    );

    if (tenant) {
      console.log(`[BILLING] ✅ Agent activated | tenant: ${tenant.tenant_id} | plan: ${tenant.plan}`);
    } else {
      console.log(`[BILLING] ⚠️ Tenant not found | stripe_subscription: ${stripeSubscriptionId}`);
    }
  } catch (err) {
    console.error(`[BILLING] ❌ activateTenantAgent error | ${err.message}`);
  }
}

// ─── B. deactivateTenantAgent ────────────────────────────────────────────────
async function deactivateTenantAgent(stripeSubscriptionId, reason) {
  try {
    const tenant = await SaaSTenant.findOneAndUpdate(
      { stripe_subscription_id: stripeSubscriptionId },
      {
        $set: {
          'settings.auto_reply_enabled': false,
          updated_at: new Date()
        }
      },
      { new: true }
    );
    console.log(`[BILLING] 🔴 Agent deactivated | tenant: ${tenant?.tenant_id || '?'} | reason: ${reason}`);
  } catch (err) {
    console.error(`[BILLING] ❌ deactivateTenantAgent error | ${err.message}`);
  }
}

// ─── C. scheduleDeactivation ─────────────────────────────────────────────────
function scheduleDeactivation(stripeSubscriptionId) {
  // Annuler timer précédent si existant (évite doublons)
  if (deactivationTimers.has(stripeSubscriptionId)) {
    clearTimeout(deactivationTimers.get(stripeSubscriptionId));
  }
  console.log(`[BILLING] ⏰ Deactivation scheduled 24h | subscription: ${stripeSubscriptionId}`);

  const timer = setTimeout(async () => {
    console.log(`[BILLING] 🔴 Deactivation executed | subscription: ${stripeSubscriptionId}`);
    deactivationTimers.delete(stripeSubscriptionId);
    await deactivateTenantAgent(stripeSubscriptionId, 'payment_failed_24h');
  }, 86400000); // 24h

  deactivationTimers.set(stripeSubscriptionId, timer);
}

// ─── D. cancelScheduledDeactivation ──────────────────────────────────────────
function cancelScheduledDeactivation(stripeSubscriptionId) {
  if (deactivationTimers.has(stripeSubscriptionId)) {
    clearTimeout(deactivationTimers.get(stripeSubscriptionId));
    deactivationTimers.delete(stripeSubscriptionId);
    console.log(`[BILLING] ✅ Deactivation cancelled | subscription: ${stripeSubscriptionId}`);
  }
}

module.exports = {
  activateTenantAgent,
  deactivateTenantAgent,
  scheduleDeactivation,
  cancelScheduledDeactivation
};
