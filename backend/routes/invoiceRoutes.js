'use strict';

/**
 * Invoice — écran de gestion des factures pour la campagne "relance_facture"
 * ────────────────────────────────────────────────────────────────────────
 * POST /api/invoices          → saisie manuelle d'une facture
 * POST /api/invoices/import   → import CSV en masse
 * GET  /api/invoices          → liste des factures d'un tenant (triée par échéance)
 *
 * Protégé par consoleAuth (jeton console partagé — même mécanisme que
 * /api/console/*, /api/agent/instructions, /api/agent/calendly et
 * /api/agent/catalog/import).
 */

const express   = require('express');
const csvParser = require('csv-parser');
const { Readable } = require('stream');

const Invoice = require('../models/Invoice');
const consoleAuth = require('../middleware/consoleAuth');
const { isValidE164, parseAmount, parseDueDate, validateInvoiceRows } = require('../services/invoiceCsvService');

const router = express.Router();

// ─── POST /api/invoices — saisie manuelle ─────────────────────────────────────
router.post('/', consoleAuth, async (req, res) => {
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
router.post('/import', consoleAuth, async (req, res) => {
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
router.get('/', consoleAuth, async (req, res) => {
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

// ─── PATCH /api/invoices/:id/status — marquage manuel (paid) ──────────────────
// Bouton "Marquer comme payée" de la console (écran factures, Phase 2).
// Restreint à 'paid' : bascule manuelle par l'opérateur, pas un remplacement
// générique du statut. Une fois 'paid', la facture sort de la chaîne de
// relance (invoiceReminderService.REMINDER_CHAIN_STATUSES) et
// resolveDueReminderStep() l'exclut définitivement de tout envoi futur —
// vérifié explicitement par scripts/testInvoiceReminderService.js.
router.patch('/:id/status', consoleAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['paid'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `status doit être : ${allowed.join(' | ')}` });
    }

    const invoice = await Invoice.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!invoice) return res.status(404).json({ error: 'Facture introuvable' });

    console.log(`[INVOICE] Marquée payée manuellement : ${invoice.invoiceNumber} (tenant ${invoice.tenantId})`);
    return res.json({ ok: true, invoice });
  } catch (err) {
    console.error('[INVOICE STATUS ERROR]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
