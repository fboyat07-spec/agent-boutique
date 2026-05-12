'use strict';

/**
 * ONBOARDING SERVICE
 * ─────────────────────────────────────────────────────────────────────────────
 * Gère le cycle de vie d'un nouveau tenant lors de son onboarding :
 *   A. createTenant       → crée le doc SaaSTenant (plan = 'pending')
 *   B. validateWhatsApp   → vérifie les credentials via Meta Graph API
 *   C. sendTestMessage    → envoie un message de test via l'API Meta
 *   D. activateAgent      → active le tenant (plan = 'starter', auto_reply = true)
 *   E. rollbackTenant     → suppression silencieuse si onboarding échoue avant activation
 *
 * Convention de suivi d'état (champ `plan` du SaaSTenant, pas d'enum) :
 *   'pending'   → créé, validation WhatsApp pas encore effectuée
 *   'validated' → WhatsApp validé avec succès via Meta Graph API
 *   'failed'    → échec validation WhatsApp
 *   'starter'   → agent actif (état final normal)
 *
 * Aucune modification de SaaSTenant.js : on réutilise le champ `plan`
 * qui est un String libre (pas d'enum dans le schéma).
 */

const axios  = require('axios');
const { v4: uuidv4 } = require('uuid');
const SaaSTenant = require('../models/SaaSTenant');

const META_GRAPH_BASE = 'https://graph.facebook.com/v17.0';

// ─── A. createTenant ──────────────────────────────────────────────────────────
/**
 * Crée un nouveau SaaSTenant avec statut 'pending'.
 * L'agent n'est PAS activé (auto_reply_enabled = false).
 *
 * @param {{ name, whatsapp_token, phone_number_id, verify_token, business_name }} data
 * @returns {{ tenant_id: string, status: 'pending' }}
 */
async function createTenant({ name, whatsapp_token, phone_number_id, verify_token, business_name }) {
  try {
    const tenant_id = uuidv4();

    await SaaSTenant.create({
      tenant_id,
      name,
      whatsapp_token,
      phone_number_id,
      verify_token,
      created_by: 'onboarding',
      plan: 'pending',                     // suivi onboarding via champ libre
      subscription_status: 'trial',
      settings: {
        business_name: business_name || name,
        auto_reply_enabled: false,          // agent désactivé jusqu'à activateAgent()
      },
    });

    console.log(`[ONBOARDING] ✅ Tenant created | tenant: ${tenant_id}`);
    return { tenant_id, status: 'pending' };

  } catch (err) {
    console.error(`[ONBOARDING] ❌ createTenant failed | reason: ${err.message}`);
    throw new Error(`Impossible de créer le tenant : ${err.message}`);
  }
}

// ─── B. validateWhatsApp ──────────────────────────────────────────────────────
/**
 * Vérifie les credentials WhatsApp via l'API Meta Graph.
 * Met `plan` à 'validated' si succès, 'failed' si erreur.
 *
 * @param {string} tenant_id
 * @returns {{ status: 'validated' }}
 */
async function validateWhatsApp(tenant_id) {
  const tenant = await SaaSTenant.findOne({ tenant_id });
  if (!tenant) throw new Error('Tenant introuvable');

  try {
    await axios.get(`${META_GRAPH_BASE}/${tenant.phone_number_id}`, {
      headers: { Authorization: `Bearer ${tenant.whatsapp_token}` },
      timeout: 10000,
    });

    await SaaSTenant.updateOne(
      { tenant_id },
      { $set: { plan: 'validated', updated_at: new Date() } }
    );

    console.log(
      `[ONBOARDING] ✅ WhatsApp validated | tenant: ${tenant_id} | phone_number_id: ${tenant.phone_number_id}`
    );
    return { status: 'validated' };

  } catch (err) {
    const reason = err.response?.data?.error?.message || err.message;

    await SaaSTenant.updateOne(
      { tenant_id },
      { $set: { plan: 'failed', updated_at: new Date() } }
    );

    console.error(
      `[ONBOARDING] ❌ WhatsApp validation failed | tenant: ${tenant_id} | reason: ${reason}`
    );
    throw new Error(reason);
  }
}

// ─── C. sendTestMessage ───────────────────────────────────────────────────────
/**
 * Envoie un message de confirmation via l'API Meta (retourne toujours, ne throw pas).
 * Nécessite plan === 'validated'.
 *
 * @param {string} tenant_id
 * @returns {{ success: boolean, reason?: string }}
 */
async function sendTestMessage(tenant_id) {
  const tenant = await SaaSTenant.findOne({ tenant_id });
  if (!tenant) throw new Error('Tenant introuvable');

  if (tenant.plan !== 'validated') {
    throw new Error('WhatsApp non encore validé — exécutez d\'abord la validation WhatsApp');
  }

  try {
    await axios.post(
      `${META_GRAPH_BASE}/${tenant.phone_number_id}/messages`,
      {
        messaging_product: 'whatsapp',
        to:                tenant.phone_number_id,
        type:              'text',
        text: { body: '✅ Votre agent IA est prêt ! Ce message confirme la connexion WhatsApp.' },
      },
      {
        headers: {
          Authorization:  `Bearer ${tenant.whatsapp_token}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    console.log(`[ONBOARDING] ✅ Test message sent | tenant: ${tenant_id}`);
    return { success: true };

  } catch (err) {
    const reason = err.response?.data?.error?.message || err.message;
    console.error(`[ONBOARDING] ❌ sendTestMessage failed | tenant: ${tenant_id} | reason: ${reason}`);
    return { success: false, reason };
  }
}

// ─── D. activateAgent ─────────────────────────────────────────────────────────
/**
 * Active l'agent pour ce tenant.
 * Nécessite plan === 'validated' (refus explicite sinon).
 *
 * @param {string} tenant_id
 * @returns {{ success: true, tenant_id: string, status: 'active' }}
 */
async function activateAgent(tenant_id) {
  const tenant = await SaaSTenant.findOne({ tenant_id });
  if (!tenant) throw new Error('Tenant introuvable');

  if (tenant.plan !== 'validated') {
    throw new Error(
      'WhatsApp non validé — impossible d\'activer l\'agent avant la validation'
    );
  }

  await SaaSTenant.updateOne(
    { tenant_id },
    {
      $set: {
        plan:                            'starter',
        subscription_status:             'trial',
        'settings.auto_reply_enabled':   true,
        updated_at:                      new Date(),
      },
    }
  );

  console.log(`[ONBOARDING] ✅ Agent activated | tenant: ${tenant_id}`);
  return { success: true, tenant_id, status: 'active' };
}

// ─── E. rollbackTenant ────────────────────────────────────────────────────────
/**
 * Supprime silencieusement le tenant si l'onboarding échoue avant activation.
 * Ne throw jamais. Ne supprime JAMAIS un tenant déjà actif (plan = 'starter').
 *
 * @param {string|null} tenant_id
 */
async function rollbackTenant(tenant_id) {
  if (!tenant_id) return;
  try {
    const tenant = await SaaSTenant.findOne({ tenant_id });
    if (!tenant) return;
    if (tenant.plan === 'starter') return; // tenant actif → intouchable

    await SaaSTenant.deleteOne({ tenant_id });
    console.log(`[ONBOARDING] ⚠️ Rollback | tenant: ${tenant_id}`);
  } catch {
    // silencieux — ne jamais bloquer le caller
  }
}

module.exports = { createTenant, validateWhatsApp, sendTestMessage, activateAgent, rollbackTenant };
