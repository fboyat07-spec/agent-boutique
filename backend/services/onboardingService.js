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
const META_GRAPH_V25  = 'https://graph.facebook.com/v25.0';

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

    console.log(`[ONBOARDING] ✅ Tenant created | tenant: ${tenant_id} | name: ${name}`);
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

  if (!['validated', 'whatsapp_connected'].includes(tenant.plan)) {
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

  if (!['validated', 'whatsapp_connected'].includes(tenant.plan)) {
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

// ─── F. registerWebhook ───────────────────────────────────────────────────────
/**
 * Abonne le numéro WhatsApp du tenant aux messages via Meta Graph API v25.
 * Non-bloquant : les erreurs sont loguées mais ne stoppent JAMAIS le flow.
 * N'agit QUE sur le tenant_id passé — zéro impact sur les tenants existants.
 *
 * @param {string} tenant_id
 */
async function registerWebhook(tenant_id) {
  const tenant = await SaaSTenant.findOne({ tenant_id });
  if (!tenant) {
    console.error(`[ONBOARDING] ❌ Webhook registration failed | tenant: ${tenant_id} | reason: Tenant introuvable`);
    return;
  }
  try {
    await axios.post(
      `${META_GRAPH_V25}/${tenant.phone_number_id}/subscribed_apps`,
      { subscribed_fields: ['messages'] },
      { headers: { Authorization: `Bearer ${tenant.whatsapp_token}` }, timeout: 10000 }
    );
    // Marquer webhook_url avec l'URL de production (champ libre du schéma)
    await SaaSTenant.updateOne(
      { tenant_id },
      { $set: { webhook_url: process.env.ONBOARDING_WEBHOOK_URL || '', updated_at: new Date() } }
    );
    console.log(`[ONBOARDING] ✅ Webhook registered | tenant: ${tenant_id} | phone_number_id: ${tenant.phone_number_id}`);
  } catch (err) {
    const reason = err.response?.data?.error?.message || err.message;
    console.error(`[ONBOARDING] ❌ Webhook registration failed | tenant: ${tenant_id} | reason: ${reason}`);
    // NON-BLOQUANT — le commerçant pourra réessayer manuellement
  }
}

// ─── G. exchangeOAuthCode ─────────────────────────────────────────────────────
/**
 * Échange un code OAuth Meta Embedded Signup contre un access_token,
 * récupère le phone_number_id via l'API Meta, met à jour le tenant en base,
 * puis enregistre le webhook automatiquement.
 *
 * Plan mis à jour : 'whatsapp_connected' (accepted par activateAgent + sendTestMessage).
 *
 * @param {string} code       Code OAuth reçu depuis le callback Meta
 * @param {string} tenant_id
 * @returns {{ phone_number_id: string }}
 */
async function exchangeOAuthCode(code, tenant_id) {
  const tenant = await SaaSTenant.findOne({ tenant_id });
  if (!tenant) throw new Error('Tenant introuvable');

  // 1. Échanger le code contre un access_token
  const tokenRes = await axios.post(
    `${META_GRAPH_BASE}/oauth/access_token`, null,
    {
      params: {
        client_id:     process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        code,
      },
      timeout: 10000,
    }
  );
  const access_token = tokenRes.data.access_token;
  if (!access_token) throw new Error('access_token absent de la réponse Meta');

  // 2. Récupérer le WABA ID (WhatsApp Business Account)
  const wabaRes = await axios.get(`${META_GRAPH_BASE}/me/whatsapp_business_accounts`, {
    headers: { Authorization: `Bearer ${access_token}` },
    timeout: 10000,
  });
  const waba_id = wabaRes.data.data?.[0]?.id;
  if (!waba_id) throw new Error('Aucun WhatsApp Business Account trouvé pour ce token');

  // 3. Récupérer le phone_number_id via le WABA
  const phoneRes = await axios.get(`${META_GRAPH_BASE}/${waba_id}/phone_numbers`, {
    headers: { Authorization: `Bearer ${access_token}` },
    timeout: 10000,
  });
  const phone_number_id = phoneRes.data.data?.[0]?.id;
  if (!phone_number_id) throw new Error('Aucun numéro WhatsApp trouvé dans ce compte Business');

  // 4. Mettre à jour le tenant avec les credentials OAuth
  await SaaSTenant.updateOne(
    { tenant_id },
    {
      $set: {
        whatsapp_token:  access_token,
        phone_number_id,
        plan:            'whatsapp_connected',
        updated_at:      new Date(),
      },
    }
  );
  console.log(`[ONBOARDING] ✅ OAuth success | tenant: ${tenant_id} | phone_number_id: ${phone_number_id}`);

  // 5. Enregistrer le webhook automatiquement (non-bloquant)
  await registerWebhook(tenant_id);

  return { phone_number_id };
}

module.exports = { createTenant, validateWhatsApp, sendTestMessage, activateAgent, rollbackTenant, registerWebhook, exchangeOAuthCode };
