'use strict';

const express  = require('express');
const router   = express.Router();

const { searchProspects } = require('../services/prospecting');
const { sendOutreach }    = require('../services/autoOutreach');
const Prospect            = require('../models/Prospect');

// ─── Auth middleware ───────────────────────────────────────────────────────────
const CONSOLE_TOKEN = process.env.CONSOLE_TOKEN || 'console_admin_2024';

function consoleAuth(req, res, next) {
  const auth  = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (token !== CONSOLE_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ─── POST /api/prospecting/search ─────────────────────────────────────────────
// Lance une recherche Google Places et sauvegarde les prospects en MongoDB.
router.post('/search', consoleAuth, async (req, res) => {
  const { query, location, radius = 5000, autoSend = false } = req.body;

  if (!query) return res.status(400).json({ error: 'query requis' });

  try {
    const results = await searchProspects({ query, location, radius });

    let saved = 0, skipped = 0;
    const savedProspects = [];

    for (const p of results) {
      try {
        const doc = await Prospect.findOneAndUpdate(
          { phone: p.phone },
          { $setOnInsert: { ...p, query: query } },
          { upsert: true, new: true, rawResult: false }
        );
        savedProspects.push(doc);
        saved++;
      } catch (e) {
        if (e.code === 11000) { skipped++; } // doublon téléphone
        else throw e;
      }
    }

    // Envoi automatique optionnel
    if (autoSend) {
      const toSend = savedProspects.filter(p => !p.whatsappSent);
      console.log('[PROSPECTING] autoSend activé — envoi vers', toSend.length, 'prospects');
      for (const p of toSend) {
        await sendOutreach(p).catch(err =>
          console.error('[PROSPECTING] autoSend erreur:', err.message)
        );
      }
    }

    res.json({
      ok: true,
      found: results.length,
      saved,
      skipped,
      prospects: savedProspects.map(p => ({
        _id: p._id, name: p.name, phone: p.phone,
        status: p.status, whatsappSent: p.whatsappSent
      }))
    });
  } catch (err) {
    console.error('[PROSPECTING] /search error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/prospecting/list ─────────────────────────────────────────────────
// Liste paginée des prospects.
router.get('/list', consoleAuth, async (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit  = Math.min(100, parseInt(req.query.limit) || 20);
  const status = req.query.status; // filtre optionnel

  const filter = status ? { status } : {};

  try {
    const [total, prospects] = await Promise.all([
      Prospect.countDocuments(filter),
      Prospect.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
    ]);

    res.json({
      ok: true, total, page, limit,
      pages: Math.ceil(total / limit),
      prospects
    });
  } catch (err) {
    console.error('[PROSPECTING] /list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/prospecting/:id/status ────────────────────────────────────────
// Met à jour le statut d'un prospect.
router.patch('/:id/status', consoleAuth, async (req, res) => {
  const { status } = req.body;
  const allowed = ['new', 'contacted', 'converted', 'ignored'];

  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status doit être : ${allowed.join(' | ')}` });
  }

  try {
    const prospect = await Prospect.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!prospect) return res.status(404).json({ error: 'Prospect introuvable' });
    res.json({ ok: true, prospect });
  } catch (err) {
    console.error('[PROSPECTING] /status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/prospecting/:id/outreach ───────────────────────────────────────
// Envoie manuellement un message d'accroche à un prospect précis.
router.post('/:id/outreach', consoleAuth, async (req, res) => {
  try {
    const prospect = await Prospect.findById(req.params.id);
    if (!prospect) return res.status(404).json({ error: 'Prospect introuvable' });
    if (prospect.whatsappSent) {
      return res.status(409).json({ error: 'Message déjà envoyé à ce prospect' });
    }
    const message = await sendOutreach(prospect);
    if (!message) return res.status(500).json({ error: 'Échec envoi WhatsApp' });
    res.json({ ok: true, message });
  } catch (err) {
    console.error('[PROSPECTING] /outreach error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
