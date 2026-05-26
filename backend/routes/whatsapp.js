'use strict';

/**
 * WhatsApp Cloud API — Templates & Séquences automatisées
 * ────────────────────────────────────────────────────────
 * POST /api/whatsapp/send-template       → envoi unique d'un template
 * POST /api/whatsapp/start-sequence      → séquence J0 / J3 / J7 (persistée MongoDB)
 * GET  /api/whatsapp/sequence-status/:phone
 * POST /api/whatsapp/stop-sequence
 *
 * Env requis : WHATSAPP_TOKEN, WHATSAPP_PHONE_ID (ou WHATSAPP_PHONE_NUMBER_ID)
 *
 * Persistence : WhatsAppSequence (MongoDB) + node-cron toutes les 5 min
 * Opt-out     : vérifie Conversation.status === 'opted_out' avant J3/J7
 */

const express  = require('express');
const axios    = require('axios');
const cron     = require('node-cron');

const router   = express.Router();

const WhatsAppSequence = require('../models/WhatsAppSequence');
const Conversation     = require('../models/Conversation');

// ─── Config ──────────────────────────────────────────────────────────────────

const GRAPH_API_VERSION = 'v20.0';
const TOKEN             = process.env.WHATSAPP_TOKEN;
const PHONE_ID          = process.env.PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID;

const MS_3_DAYS = 3 * 24 * 60 * 60 * 1000;
const MS_7_DAYS = 7 * 24 * 60 * 60 * 1000;

// ─── Helper : appel Meta Graph API ───────────────────────────────────────────

/**
 * Envoie un template WhatsApp via Meta Graph API.
 * @param {string} to            – numéro E.164 sans + (ex: "33612345678")
 * @param {string} templateName
 * @param {Array}  variables     – tableau de composants body [{type:"text",text:"..."}]
 * @returns {string} message_id retourné par Meta
 */
async function sendTemplate(to, templateName, variables = []) {
  if (!TOKEN || !PHONE_ID) {
    throw new Error('WHATSAPP_TOKEN ou PHONE_NUMBER_ID / WHATSAPP_PHONE_NUMBER_ID manquant dans .env');
  }

  const url  = `https://graph.facebook.com/${GRAPH_API_VERSION}/${PHONE_ID}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'fr' },
      components: variables.length
        ? [{ type: 'body', parameters: variables }]
        : [],
    },
  };

  const response = await axios.post(url, body, {
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    timeout: 10000,
  });

  const messageId = response.data?.messages?.[0]?.id || null;
  console.log(`[WA TEMPLATE] ✅ ${templateName} → ${to} | id: ${messageId}`);
  return messageId;
}

// ─── Helper : vérification opt-out ───────────────────────────────────────────

/**
 * Retourne true si le prospect a opt-out (Conversation.status === 'opted_out').
 * Silencieux si aucune conversation trouvée.
 */
async function isOptedOut(phone) {
  try {
    const convo = await Conversation.findOne({ phone }).select('status').lean();
    return convo?.status === 'opted_out';
  } catch {
    return false; // fail-safe : on envoie si la DB est injoignable
  }
}

// ─── CRON : vérification J3 / J7 toutes les 5 min ───────────────────────────

async function runSequenceCron() {
  const now = new Date();
  console.log('[WA CRON] Vérification séquences dues…', now.toISOString());

  try {
    // ── J3 dues ────────────────────────────────────────────────────────────
    const j3Due = await WhatsAppSequence.find({
      status:  'active',
      step:    'j0',
      j3_date: { $lte: now },
    });

    for (const seq of j3Due) {
      if (await isOptedOut(seq.to)) {
        console.log(`[WA CRON] J3 skipped (opted_out) → ${seq.to}`);
        await WhatsAppSequence.updateOne({ _id: seq._id }, { status: 'stopped' });
        continue;
      }
      try {
        await sendTemplate(seq.to, 'agent_boutique_relance_j3', [
          { type: 'text', text: seq.prenom },
        ]);
        await WhatsAppSequence.updateOne({ _id: seq._id }, { step: 'j3' });
        console.log(`[WA CRON] J3 envoyé → ${seq.to}`);
      } catch (err) {
        console.error(`[WA CRON] J3 erreur pour ${seq.to}:`, err.message);
      }
    }

    // ── J7 dues ────────────────────────────────────────────────────────────
    const j7Due = await WhatsAppSequence.find({
      status:  'active',
      step:    { $in: ['j0', 'j3'] },
      j7_date: { $lte: now },
    });

    for (const seq of j7Due) {
      if (await isOptedOut(seq.to)) {
        console.log(`[WA CRON] J7 skipped (opted_out) → ${seq.to}`);
        await WhatsAppSequence.updateOne({ _id: seq._id }, { status: 'stopped' });
        continue;
      }
      try {
        await sendTemplate(seq.to, 'agent_boutique_closing_j7', [
          { type: 'text', text: seq.prenom },
        ]);
        await WhatsAppSequence.updateOne({ _id: seq._id }, { step: 'j7', status: 'completed' });
        console.log(`[WA CRON] J7 envoyé → ${seq.to} | séquence terminée`);
      } catch (err) {
        console.error(`[WA CRON] J7 erreur pour ${seq.to}:`, err.message);
      }
    }

    if (j3Due.length === 0 && j7Due.length === 0) {
      console.log('[WA CRON] Aucune séquence due.');
    }
  } catch (err) {
    console.error('[WA CRON] Erreur fatale:', err.message);
  }
}

// Lance le cron toutes les 5 minutes
cron.schedule('*/5 * * * *', runSequenceCron);
console.log('[WA CRON] Scheduler démarré — vérification toutes les 5 min');

// ─── POST /send-template ─────────────────────────────────────────────────────

router.post('/send-template', async (req, res) => {
  try {
    const { to, templateName, variables = [] } = req.body;
    if (!to || !templateName) {
      return res.status(400).json({ error: 'to et templateName sont requis' });
    }
    const messageId = await sendTemplate(to, templateName, variables);
    return res.json({ ok: true, messageId });
  } catch (err) {
    console.error('[WA /send-template ERROR]', err.message);
    const status = err.response?.status || 500;
    return res.status(status).json({ error: err.response?.data || err.message });
  }
});

// ─── POST /start-sequence ─────────────────────────────────────────────────────

router.post('/start-sequence', async (req, res) => {
  try {
    const { to, prenom, tenant_id = 'default' } = req.body;
    if (!to || !prenom) {
      return res.status(400).json({ error: 'to et prenom sont requis' });
    }

    const now      = new Date();
    const j3_date  = new Date(now.getTime() + MS_3_DAYS);
    const j7_date  = new Date(now.getTime() + MS_7_DAYS);

    // Upsert — remplace une séquence existante pour ce numéro
    const sequence = await WhatsAppSequence.findOneAndUpdate(
      { to },
      { to, prenom, tenant_id, status: 'active', step: 'j0', startDate: now, j3_date, j7_date },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log(`[WA SEQUENCE] Séquence créée/réinitialisée → ${to} | J3: ${j3_date.toISOString()} | J7: ${j7_date.toISOString()}`);

    // J0 — envoi immédiat
    await sendTemplate(to, 'agent_boutique_prise_de_contact', [
      { type: 'text', text: prenom },
    ]);
    console.log(`[WA SEQUENCE] J0 envoyé → ${to}`);

    const safe = sequence.toObject();
    delete safe.__v;
    return res.json({ ok: true, sequence: safe });

  } catch (err) {
    console.error('[WA /start-sequence ERROR]', err.message);
    const status = err.response?.status || 500;
    return res.status(status).json({ error: err.response?.data || err.message });
  }
});

// ─── GET /sequence-status/:phone ─────────────────────────────────────────────

router.get('/sequence-status/:phone', async (req, res) => {
  try {
    const sequence = await WhatsAppSequence.findOne({ to: req.params.phone }).lean();
    if (!sequence) {
      return res.status(404).json({ error: `Aucune séquence trouvée pour ${req.params.phone}` });
    }
    return res.json({ ok: true, sequence });
  } catch (err) {
    console.error('[WA /sequence-status ERROR]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /stop-sequence ─────────────────────────────────────────────────────

router.post('/stop-sequence', async (req, res) => {
  try {
    const { to } = req.body;
    if (!to) {
      return res.status(400).json({ error: 'to est requis' });
    }
    const sequence = await WhatsAppSequence.findOneAndUpdate(
      { to },
      { status: 'stopped' },
      { new: true }
    );
    if (!sequence) {
      return res.status(404).json({ error: `Aucune séquence active pour ${to}` });
    }
    console.log(`[WA SEQUENCE] Séquence stoppée pour ${to} (étape: ${sequence.step})`);
    return res.json({ ok: true, sequence: sequence.toObject() });
  } catch (err) {
    console.error('[WA /stop-sequence ERROR]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

router.get('/sequences-active', async (req, res) => {
  try {
    const sequences = await WhatsAppSequence.find({ status: 'active' })
      .select('to prenom step j3_date j7_date startDate')
      .sort({ startDate: -1 })
      .lean();
    return res.json({ ok: true, sequences });
  } catch (err) {
    console.error('[WA /sequences-active ERROR]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
