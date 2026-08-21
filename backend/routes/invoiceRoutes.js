'use strict';

/**
 * Invoice — écran de gestion des factures pour la campagne "relance_facture"
 * ────────────────────────────────────────────────────────────────────────
 * POST /api/invoices          → saisie manuelle d'une facture
 * POST /api/invoices/import   → import CSV en masse
 * GET  /api/invoices          → liste des factures d'un tenant (triée par échéance)
 *
 * Même style que routes/agentConfigRoutes.js (catalog/import) : tenant_id
 * scoping simple, pas de middleware d'auth dédié (cohérent avec les autres
 * routes console existantes — instructions, calendly, catalog).
 */

const express   = require('express');
const csvParser = require('csv-parser');
const { Readable } = require('stream');

const Invoice = require('../models/Invoice');
const { isValidE164, parseAmount, parseDueDate, validateInvoiceRows } = require('../services/invoiceCsvService');

const router = express.Router();

// ─── POST /api/invoices — saisie manuelle ─────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { tenant_id, clientName, clientPhone, invoiceNumber, amount, dueDate } = req.body;
    if (!tenant_id) return res.status(400).json({ error: 'tenant_id requis' });

    const name   = String(clientName || '').trim();
    const phone  = String(clientPhone || '').trim();
    const number = String(invoiceNumber || '').trim();

    if (!name)   return res.status(400).json({ error: 'clientName requis' });
    if (!phone)  return res.status(400).json({ error: 'clientPhone requis' });
    if (!isValidE164(phone)) {
      return res.status(400).json({ error: `clientPhone invalide (format E.164 attendu, ex: +33612345678) — reçu "${phone}"` });
    }
    if (!number) return res.status(400).json({ error: 'invoiceNumber requis' });

    const parsedAmount = parseAmount(amount);
    if (parsedAmount === null) return res.status(400).json({ error: `amount invalide — reçu "${amount}"` });

    const parsedDueDate = parseDueDate(dueDate);
    if (parsedDueDate === null) return res.status(400).json({ error: `dueDate invalide — reçu "${dueDate}"` });

    const invoice = await Invoice.create({
      tenantId:      tenant_id,
      clientName:    name,
      clientPhone:   phone,
      invoiceNumber: number,
      amount:        parsedAmount,
      dueDate:       parsedDueDate,
    });

    console.log(`[INVOICE] Créée pour tenant ${tenant_id} : ${number} (${parsedAmount}€)`);
    return res.json({ ok: true, invoice });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Une facture avec ce numéro existe déjà pour ce tenant' });
    }
    console.error('[INVOICE CREATE ERROR]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/invoices/import — import CSV en masse ──────────────────────────
// Colonnes attendues : client_name, client_phone, invoice_number, amount, due_date
// Reçoit { tenant_id, csv } (texte CSV brut) — même contrat que /api/agent/catalog/import.
router.post('/import', async (req, res) => {
  try {
    const { tenant_id, csv } = req.body;
    if (!tenant_id) return res.status(400).json({ error: 'tenant_id requis' });
    if (!csv || typeof csv !== 'string') return res.status(400).json({ error: 'csv (texte) requis' });

    const rows = await new Promise((resolve, reject) => {
      const out = [];
      Readable.from(csv)
        .pipe(csvParser({ mapHeaders: ({ header }) => header.trim().toLowerCase() }))
        .on('data', r => out.push(r))
        .on('end', () => resolve(out))
        .on('error', reject);
    });

    const { valid, errors, blankSkipped } = validateInvoiceRows(rows);

    // Insertion ligne par ligne — une facture en doublon (invoiceNumber déjà pris
    // pour ce tenant) ou toute autre erreur d'écriture ne doit JAMAIS interrompre
    // l'import des autres lignes valides (pas de crash silencieux sur une ligne).
    let importedCount = 0;
    for (const doc of valid) {
      try {
        await Invoice.create({ tenantId: tenant_id, ...doc });
        importedCount++;
      } catch (err) {
        if (err.code === 11000) {
          errors.push(`Facture ${doc.invoiceNumber}: déjà existante pour ce tenant — ignorée`);
        } else {
          errors.push(`Facture ${doc.invoiceNumber}: erreur d'enregistrement — ${err.message}`);
        }
      }
    }

    const skippedCount = blankSkipped + errors.length;
    console.log(`[INVOICE IMPORT] ${importedCount} facture(s) importée(s) pour tenant ${tenant_id} (${skippedCount} ignorée(s))`);
    return res.json({ ok: true, imported_count: importedCount, skipped_count: skippedCount, errors });
  } catch (err) {
    console.error('[INVOICE IMPORT ERROR]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/invoices?tenant_id=xxx — liste triée par échéance ──────────────
router.get('/', async (req, res) => {
  try {
    const { tenant_id } = req.query;
    if (!tenant_id) return res.status(400).json({ error: 'tenant_id requis' });

    const invoices = await Invoice.find({ tenantId: tenant_id }).sort({ dueDate: 1 }).lean();
    return res.json({ ok: true, invoices, count: invoices.length });
  } catch (err) {
    console.error('[INVOICE LIST ERROR]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
