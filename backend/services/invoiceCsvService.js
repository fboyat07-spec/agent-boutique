'use strict';

/**
 * invoiceCsvService — validation pure (sans DB) des factures saisies manuellement
 * ou importées en masse pour la campagne "relance_facture".
 * ────────────────────────────────────────────────────────────────────────────
 * Toute fonction ici est pure et ne lève JAMAIS : une ligne mal formée retourne
 * { valid: false, error } au lieu de faire planter l'import. C'est ce qui
 * garantit "pas de crash silencieux sur une ligne mal formée" côté route.
 */

const E164_REGEX = /^\+[1-9]\d{1,14}$/;

function isValidE164(phone) {
  return E164_REGEX.test(String(phone || '').trim());
}

function parseAmount(raw) {
  const n = parseFloat(String(raw ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseDueDate(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Valide une ligne CSV (clés déjà normalisées en snake_case minuscule par
 * csv-parser mapHeaders) : client_name, client_phone, invoice_number, amount, due_date.
 * @returns {{valid:true, doc:object}|{valid:false, error:string}}
 */
function validateInvoiceRow(row) {
  const clientName    = String(row.client_name || '').trim();
  const clientPhone   = String(row.client_phone || '').trim();
  const invoiceNumber = String(row.invoice_number || '').trim();
  const amountRaw      = row.amount;
  const dueDateRaw      = row.due_date;

  if (!clientName)  return { valid: false, error: 'client_name manquant' };
  if (!clientPhone) return { valid: false, error: 'client_phone manquant' };
  if (!isValidE164(clientPhone)) {
    return { valid: false, error: `client_phone invalide (format E.164 attendu, ex: +33612345678) — reçu "${clientPhone}"` };
  }
  if (!invoiceNumber) return { valid: false, error: 'invoice_number manquant' };

  const amount = parseAmount(amountRaw);
  if (amount === null) return { valid: false, error: `amount invalide — reçu "${amountRaw ?? ''}"` };

  const dueDate = parseDueDate(dueDateRaw);
  if (dueDate === null) return { valid: false, error: `due_date invalide — reçu "${dueDateRaw ?? ''}"` };

  return { valid: true, doc: { clientName, clientPhone, invoiceNumber, amount, dueDate } };
}

/**
 * Valide un tableau de lignes CSV déjà parsées. Ne lève jamais.
 * Les lignes entièrement vides sont ignorées silencieusement (comme l'import
 * catalogue existant) — ce ne sont pas des lignes "mal formées", juste du vide.
 * Toute autre ligne invalide produit un message d'erreur avec son numéro de
 * ligne (2 = première ligne de données, après l'en-tête).
 * @returns {{valid:object[], errors:string[], blankSkipped:number}}
 */
function validateInvoiceRows(rows) {
  const valid = [];
  const errors = [];
  let blankSkipped = 0;

  rows.forEach((row, i) => {
    const lineNumber = i + 2;
    const isBlank = Object.values(row).every(v => !String(v || '').trim());
    if (isBlank) { blankSkipped++; return; }

    const result = validateInvoiceRow(row);
    if (result.valid) {
      valid.push(result.doc);
    } else {
      errors.push(`Ligne ${lineNumber}: ${result.error}`);
    }
  });

  return { valid, errors, blankSkipped };
}

module.exports = { isValidE164, parseAmount, parseDueDate, validateInvoiceRow, validateInvoiceRows };
