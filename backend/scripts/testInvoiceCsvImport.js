#!/usr/bin/env node
'use strict';

/**
 * TEST UNITAIRE — Validation CSV import factures (Phase 2)
 * ──────────────────────────────────────────────────────────
 * Usage : node scripts/testInvoiceCsvImport.js
 *
 * Pur : NE nécessite NI MongoDB NI réseau.
 * Teste :
 *   A. isValidE164 / parseAmount / parseDueDate — validateurs unitaires
 *   B. validateInvoiceRow — ligne valide / champs manquants / téléphone invalide
 *   C. validateInvoiceRows — jeu mixte (valides/invalides/vides), numéros de
 *      ligne corrects, AUCUN throw sur une ligne mal formée (exigence clé :
 *      pas de crash silencieux — chaque ligne rejetée produit un message clair)
 */

const assert = require('assert');
const {
  isValidE164,
  parseAmount,
  parseDueDate,
  validateInvoiceRow,
  validateInvoiceRows,
} = require('../services/invoiceCsvService');

let passed = 0;
function check(label, fn) {
  try {
    fn();
    console.log(`  ✅  ${label}`);
    passed++;
  } catch (err) {
    console.log(`  ❌  ${label}`);
    console.error(`      ${err.message}`);
    process.exitCode = 1;
  }
}
function sep(t) { console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 52 - t.length))}`); }

// ─── A. Validateurs unitaires ───────────────────────────────────────────────
sep('A. Validateurs unitaires');

check('isValidE164 accepte un numéro E.164 valide', () => {
  assert.strictEqual(isValidE164('+33612345678'), true);
  assert.strictEqual(isValidE164('+14155552671'), true);
});
check('isValidE164 rejette un numéro non-E.164', () => {
  assert.strictEqual(isValidE164('0612345678'), false);   // pas de +
  assert.strictEqual(isValidE164('+0612345678'), false);  // commence par 0 après le +
  assert.strictEqual(isValidE164('abc'), false);
  assert.strictEqual(isValidE164(''), false);
  assert.strictEqual(isValidE164(null), false);
});
check('parseAmount accepte un nombre positif (virgule ou point)', () => {
  assert.strictEqual(parseAmount('120.50'), 120.5);
  assert.strictEqual(parseAmount('120,50'), 120.5);
  assert.strictEqual(parseAmount(99), 99);
});
check('parseAmount rejette zéro, négatif, ou non-numérique', () => {
  assert.strictEqual(parseAmount('0'), null);
  assert.strictEqual(parseAmount('-10'), null);
  assert.strictEqual(parseAmount('abc'), null);
  assert.strictEqual(parseAmount(''), null);
  assert.strictEqual(parseAmount(undefined), null);
});
check('parseDueDate accepte une date valide (ISO ou fr)', () => {
  assert.ok(parseDueDate('2026-09-15') instanceof Date);
  assert.ok(!Number.isNaN(parseDueDate('2026-09-15').getTime()));
});
check('parseDueDate rejette une date invalide ou vide', () => {
  assert.strictEqual(parseDueDate('pas une date'), null);
  assert.strictEqual(parseDueDate(''), null);
  assert.strictEqual(parseDueDate(undefined), null);
});

// ─── B. validateInvoiceRow ───────────────────────────────────────────────────
sep('B. validateInvoiceRow — ligne unique');

check('ligne complète et valide → valid:true avec doc correct', () => {
  const r = validateInvoiceRow({
    client_name: 'Boulangerie Dupont',
    client_phone: '+33612345678',
    invoice_number: 'FAC-001',
    amount: '150.00',
    due_date: '2026-09-01',
  });
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.doc.clientName, 'Boulangerie Dupont');
  assert.strictEqual(r.doc.clientPhone, '+33612345678');
  assert.strictEqual(r.doc.invoiceNumber, 'FAC-001');
  assert.strictEqual(r.doc.amount, 150);
  assert.ok(r.doc.dueDate instanceof Date);
});
check('client_phone manquant → valid:false avec message clair', () => {
  const r = validateInvoiceRow({ client_name: 'X', invoice_number: 'F1', amount: '10', due_date: '2026-01-01' });
  assert.strictEqual(r.valid, false);
  assert.match(r.error, /client_phone/);
});
check('client_phone mal formé (pas E.164) → valid:false avec message clair', () => {
  const r = validateInvoiceRow({
    client_name: 'X', client_phone: '0612345678', invoice_number: 'F1', amount: '10', due_date: '2026-01-01',
  });
  assert.strictEqual(r.valid, false);
  assert.match(r.error, /E\.164/);
});
check('amount invalide → valid:false, ne lève jamais', () => {
  const r = validateInvoiceRow({
    client_name: 'X', client_phone: '+33612345678', invoice_number: 'F1', amount: 'gratuit', due_date: '2026-01-01',
  });
  assert.strictEqual(r.valid, false);
  assert.match(r.error, /amount/);
});
check('due_date invalide → valid:false, ne lève jamais', () => {
  const r = validateInvoiceRow({
    client_name: 'X', client_phone: '+33612345678', invoice_number: 'F1', amount: '10', due_date: 'jamais',
  });
  assert.strictEqual(r.valid, false);
  assert.match(r.error, /due_date/);
});

// ─── C. validateInvoiceRows — jeu mixte, zéro crash ───────────────────────────
sep('C. validateInvoiceRows — jeu mixte (CSV réel)');

const mixedRows = [
  // ligne 2 : valide
  { client_name: 'Client A', client_phone: '+33611111111', invoice_number: 'FAC-A', amount: '100', due_date: '2026-09-01' },
  // ligne 3 : vide (doit être ignorée silencieusement, sans erreur)
  { client_name: '', client_phone: '', invoice_number: '', amount: '', due_date: '' },
  // ligne 4 : téléphone mal formé
  { client_name: 'Client B', client_phone: '0699999999', invoice_number: 'FAC-B', amount: '200', due_date: '2026-09-05' },
  // ligne 5 : valide
  { client_name: 'Client C', client_phone: '+33622222222', invoice_number: 'FAC-C', amount: '50.5', due_date: '2026-09-10' },
  // ligne 6 : montant absent
  { client_name: 'Client D', client_phone: '+33633333333', invoice_number: 'FAC-D', amount: '', due_date: '2026-09-12' },
  // ligne 7 : date invalide
  { client_name: 'Client E', client_phone: '+33644444444', invoice_number: 'FAC-E', amount: '80', due_date: 'trente février' },
];

let result;
check('validateInvoiceRows ne lève AUCUNE exception sur un jeu mal formé', () => {
  assert.doesNotThrow(() => { result = validateInvoiceRows(mixedRows); });
});
check('2 lignes valides extraites (A et C)', () => {
  assert.strictEqual(result.valid.length, 2);
  assert.deepStrictEqual(result.valid.map(d => d.invoiceNumber).sort(), ['FAC-A', 'FAC-C']);
});
check('1 ligne vide ignorée silencieusement (pas dans errors)', () => {
  assert.strictEqual(result.blankSkipped, 1);
});
check('3 lignes invalides rejetées avec message clair et numéro de ligne', () => {
  assert.strictEqual(result.errors.length, 3);
  assert.ok(result.errors.some(e => e.startsWith('Ligne 4:') && e.includes('E.164')));
  assert.ok(result.errors.some(e => e.startsWith('Ligne 6:') && e.includes('amount')));
  assert.ok(result.errors.some(e => e.startsWith('Ligne 7:') && e.includes('due_date')));
});
check('invariant : valid + errors + blankSkipped == total lignes', () => {
  assert.strictEqual(result.valid.length + result.errors.length + result.blankSkipped, mixedRows.length);
});

// ─── Résultat ──────────────────────────────────────────────────────────────────
sep('RÉSULTAT');
if (process.exitCode === 1) {
  console.log(`\n  ❌ Des tests ont échoué (${passed} OK).`);
  process.exit(1);
} else {
  console.log(`\n  ✅ Tous les tests passent (${passed}).`);
}
