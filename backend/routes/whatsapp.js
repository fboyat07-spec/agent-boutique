'use strict';

/**
 * WhatsApp Cloud API — Templates & Séquences automatisées
 * ────────────────────────────────────────────────────────
 * POST /api/whatsapp/send-template       → envoi unique d'un template
 * POST /api/whatsapp/start-sequence      → séquence J0 / J3 / J7
 * GET  /api/whatsapp/sequence-status/:phone
 * POST /api/whatsapp/stop-sequence
 *
 * Env requis : WHATSAPP_TOKEN, WHATSAPP_PHONE_ID
 */

const express = require('express');
const axios   = require('axios');

const router  = express.Router();

// ─── Config ──────────────────────────────────────────────────────────────────

const GRAPH_API_VERSION = 'v19.0';
const PHONE_ID          = process.env.WHATSAPP_PHONE_ID;
const TOKEN             = process.env.WHATSAPP_TOKEN;

// ─── State séquences en mémoire ──────────────────────────────────────────────

/**
 * Map<phone, { to, prenom, startDate, status, step, timeouts:{j3,j7} }>
 * status : "active" | "stopped" | "completed"
 * step   : "j0" | "j3" | "j7"
 */
const sequences = new Map();

// ─── Helper : appel Meta Graph API ───────────────────────────────────────────

/**
 * Envoie un template WhatsApp via Meta Graph API v19.0.
 * @param {string} to          – numéro E.164 (ex: "33612345678")
 * @param {string} templateName
 * @param {Array}  variables   – tableau de composants body [{type:"text",text:"..."}]
 * @returns {string} message_id retourné par Meta
 */
async function sendTemplate(to, templateName, variables = []) {
  if (!TOKEN || !PHONE_ID) {
    throw new Error('WHATSAPP_TOKEN ou WHATSAPP_PHONE_ID manquant dans .env');
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${PHONE_ID}/messages`;

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
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    timeout: 10000,
  });

  const messageId = response.data?.messages?.[0]?.id || null;
  console.log(`[WA TEMPLATE] ✅ ${templateName} → ${to} | id: ${messageId}`);
  return messageId;
}

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
    const detail = err.response?.data || err.message;
    return res.status(status).json({ error: detail });
  }
});

// ─── POST /start-sequence ─────────────────────────────────────────────────────

router.post('/start-sequence', async (req, res) => {
  try {
    const { to, prenom } = req.body;

    if (!to || !prenom) {
      return res.status(400).json({ error: 'to et prenom sont requis' });
    }

    // Annule une séquence existante avant d'en démarrer une nouvelle
    if (sequences.has(to)) {
      const existing = sequences.get(to);
      clearTimeout(existing.timeouts.j3);
      clearTimeout(existing.timeouts.j7);
      console.log(`[WA SEQUENCE] Remplacement séquence existante pour ${to}`);
    }

    // Crée l'objet de séquence immédiatement (timeoutIds stockés dans cet objet)
    const sequence = {
      to,
      prenom,
      startDate: new Date().toISOString(),
      status: 'active',
      step: 'j0',
      timeouts: { j3: null, j7: null },
    };
    sequences.set(to, sequence);

    // J0 — envoi immédiat
    await sendTemplate(to, 'agent_boutique_prise_de_contact', [
      { type: 'text', text: prenom },
    ]);
    console.log(`[WA SEQUENCE] J0 envoyé → ${to}`);

    // J3 — +3 jours
    sequence.timeouts.j3 = setTimeout(async () => {
      const seq = sequences.get(to);
      if (!seq || seq.status !== 'active') return;
      try {
        await sendTemplate(to, 'agent_boutique_relance_j3', [
          { type: 'text', text: prenom },
        ]);
        seq.step = 'j3';
        console.log(`[WA SEQUENCE] J3 envoyé → ${to}`);
      } catch (err) {
        console.error(`[WA SEQUENCE] J3 erreur pour ${to}:`, err.message);
      }
    }, 3 * 24 * 60 * 60 * 1000); // 259 200 000 ms

    // J7 — +7 jours
    sequence.timeouts.j7 = setTimeout(async () => {
      const seq = sequences.get(to);
      if (!seq || seq.status !== 'active') return;
      try {
        await sendTemplate(to, 'agent_boutique_closing_j7', [
          { type: 'text', text: prenom },
        ]);
        seq.step = 'j7';
        seq.status = 'completed';
        console.log(`[WA SEQUENCE] J7 envoyé → ${to} | séquence terminée`);
      } catch (err) {
        console.error(`[WA SEQUENCE] J7 erreur pour ${to}:`, err.message);
      }
    }, 7 * 24 * 60 * 60 * 1000); // 604 800 000 ms

    // Renvoie le state sans les timeoutIds (non-sérialisables)
    const { timeouts, ...safeSeq } = sequence;
    return res.json({ ok: true, sequence: safeSeq });

  } catch (err) {
    console.error('[WA /start-sequence ERROR]', err.message);
    const status = err.response?.status || 500;
    const detail = err.response?.data || err.message;
    return res.status(status).json({ error: detail });
  }
});

// ─── GET /sequence-status/:phone ─────────────────────────────────────────────

router.get('/sequence-status/:phone', (req, res) => {
  try {
    const phone = req.params.phone;
    const sequence = sequences.get(phone);

    if (!sequence) {
      return res.status(404).json({ error: `Aucune séquence trouvée pour ${phone}` });
    }

    const { timeouts, ...safeSeq } = sequence;
    return res.json({ ok: true, sequence: safeSeq });

  } catch (err) {
    console.error('[WA /sequence-status ERROR]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /stop-sequence ─────────────────────────────────────────────────────

router.post('/stop-sequence', (req, res) => {
  try {
    const { to } = req.body;

    if (!to) {
      return res.status(400).json({ error: 'to est requis' });
    }

    const sequence = sequences.get(to);
    if (!sequence) {
      return res.status(404).json({ error: `Aucune séquence active pour ${to}` });
    }

    clearTimeout(sequence.timeouts.j3);
    clearTimeout(sequence.timeouts.j7);
    sequence.timeouts.j3 = null;
    sequence.timeouts.j7 = null;
    sequence.status = 'stopped';

    console.log(`[WA SEQUENCE] Séquence stoppée pour ${to} (étape: ${sequence.step})`);

    const { timeouts, ...safeSeq } = sequence;
    return res.json({ ok: true, sequence: safeSeq });

  } catch (err) {
    console.error('[WA /stop-sequence ERROR]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
