'use strict';

/**
 * ONBOARDING ROUTES — /api/onboarding/*
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /create-tenant       → crée le tenant (validation + appel service)
 * POST /validate-whatsapp   → vérifie credentials Meta Graph API
 * POST /test-connection     → envoie un message de test WhatsApp
 * POST /activate-agent      → active l'agent pour ce tenant
 *
 * Monté dans server.js : app.use('/api/onboarding', require('./routes/onboardingRoutes'))
 */

const express = require('express');
const router  = express.Router();
const {
  createTenant,
  validateWhatsApp,
  sendTestMessage,
  activateAgent,
  rollbackTenant,
  registerWebhook,
  exchangeOAuthCode,
} = require('../services/onboardingService');

// ── POST /api/onboarding/create-tenant ───────────────────────────────────────
router.post('/create-tenant', async (req, res) => {
  const {
    name,
    whatsapp_token,
    phone_number_id,
    verify_token,
    business_name,
  } = req.body || {};

  // ── Validation des champs ────────────────────────────────────────────────
  if (!name?.trim())
    return res.status(400).json({ error: 'Le champ "name" est requis' });

  if (!whatsapp_token?.trim() || !whatsapp_token.trim().startsWith('EAA'))
    return res.status(400).json({ error: 'whatsapp_token invalide (doit commencer par "EAA")' });

  if (!phone_number_id?.trim() || !/^\d+$/.test(phone_number_id.trim()))
    return res.status(400).json({ error: 'phone_number_id invalide (doit être numérique uniquement)' });

  if (!verify_token?.trim() || verify_token.trim().length < 8)
    return res.status(400).json({ error: 'verify_token requis (minimum 8 caractères)' });

  if (!business_name?.trim())
    return res.status(400).json({ error: 'Le champ "business_name" est requis' });

  // ── Appel service avec rollback automatique en cas d'erreur ─────────────
  let tenant_id = null;
  try {
    const result = await createTenant({
      name:            name.trim(),
      whatsapp_token:  whatsapp_token.trim(),
      phone_number_id: phone_number_id.trim(),
      verify_token:    verify_token.trim(),
      business_name:   business_name.trim(),
    });
    tenant_id = result.tenant_id;
    return res.status(201).json(result);
  } catch (err) {
    await rollbackTenant(tenant_id);
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/onboarding/validate-whatsapp ───────────────────────────────────
router.post('/validate-whatsapp', async (req, res) => {
  const { tenant_id } = req.body || {};
  if (!tenant_id)
    return res.status(400).json({ error: 'tenant_id requis' });

  try {
    const result = await validateWhatsApp(tenant_id);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(400).json({ status: 'failed', reason: err.message });
  }
});

// ── POST /api/onboarding/test-connection ─────────────────────────────────────
router.post('/test-connection', async (req, res) => {
  const { tenant_id } = req.body || {};
  if (!tenant_id)
    return res.status(400).json({ error: 'tenant_id requis' });

  try {
    const result = await sendTestMessage(tenant_id);
    if (result.success) return res.status(200).json(result);
    return res.status(400).json(result);
  } catch (err) {
    return res.status(400).json({ success: false, reason: err.message });
  }
});

// ── POST /api/onboarding/activate-agent ──────────────────────────────────────
router.post('/activate-agent', async (req, res) => {
  const { tenant_id } = req.body || {};
  if (!tenant_id)
    return res.status(400).json({ error: 'tenant_id requis' });

  try {
    const result = await activateAgent(tenant_id);
    return res.status(200).json(result);
  } catch (err) {
    // Erreur explicite de validation → 403 ; erreur technique → 500
    if (err.message.toLowerCase().includes('non validé') || err.message.toLowerCase().includes('not valid')) {
      return res.status(403).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/onboarding/config ────────────────────────────────────────────────
// Expose uniquement meta_app_id et meta_config_id — jamais META_APP_SECRET.
router.get('/config', (req, res) => {
  res.json({
    meta_app_id:    process.env.META_APP_ID    || null,
    meta_config_id: process.env.META_CONFIG_ID || null,
  });
});

// ── GET /api/onboarding/payment-links ────────────────────────────────────────
// Expose les 3 liens Stripe avec client_reference_id = tenant_id.
// JAMAIS de STRIPE_SECRET_KEY ni de STRIPE_WEBHOOK_SECRET dans la réponse.
router.get('/payment-links', (req, res) => {
  const { tenant_id } = req.query;
  const suffix = tenant_id
    ? `?client_reference_id=${encodeURIComponent(tenant_id)}`
    : '';
  res.json({
    starter: process.env.SALES_PAYMENT_LINK_STARTER
      ? process.env.SALES_PAYMENT_LINK_STARTER + suffix : null,
    pro: process.env.SALES_PAYMENT_LINK_PRO
      ? process.env.SALES_PAYMENT_LINK_PRO + suffix : null,
    elite: process.env.SALES_PAYMENT_LINK_ELITE
      ? process.env.SALES_PAYMENT_LINK_ELITE + suffix : null,
  });
});

// ── GET /api/onboarding/whatsapp-callback ─────────────────────────────────────
// Reçoit le code OAuth depuis Meta Embedded Signup, échange et met à jour le tenant.
router.get('/whatsapp-callback', async (req, res) => {
  const { code, tenant_id } = req.query;

  if (!code || !tenant_id)
    return res.status(400).json({ error: 'code et tenant_id requis' });

  try {
    await exchangeOAuthCode(code, tenant_id);
    return res.redirect(`/onboarding?step=3&tenant_id=${encodeURIComponent(tenant_id)}`);
  } catch (err) {
    const reason = err.response?.data?.error?.message || err.message;
    console.error(`[ONBOARDING] ❌ OAuth failed | tenant: ${tenant_id} | reason: ${reason}`);
    return res.redirect(
      `/onboarding?step=2&error=oauth_failed&tenant_id=${encodeURIComponent(tenant_id)}`
    );
  }
});

module.exports = router;
