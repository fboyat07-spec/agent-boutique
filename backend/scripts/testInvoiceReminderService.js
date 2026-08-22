#!/usr/bin/env node
'use strict';

/**
 * TEST UNITAIRE — invoiceReminderService.js (Phase 3)
 * ─────────────────────────────────────────────────────
 * Usage : node scripts/testInvoiceReminderService.js
 *
 * Pur : NE nécessite NI MongoDB NI réseau.
 * Teste :
 *   A. resolveDueReminderStep — chaque seuil (J-3/J+1/J+10/J+20) dans l'ordre
 *   B. États terminaux — paid/disputed ne déclenchent jamais rien
 *   C. Aucune régression / re-déclenchement d'une étape déjà envoyée
 *   E. Plafond J+20 — ne peut jamais être le tout premier envoi d'une facture
 *      (une facture 'pending' très en retard reçoit J+10, puis J+20 seulement
 *      au passage suivant si toujours impayée)
 *   F. normalizeOutboundPhone — format attendu par OutboundLead.phone
 */

const assert = require('assert');
const {
  resolveDueReminderStep,
  normalizeOutboundPhone,
  DAY_MS,
} = require('../services/invoiceReminderService');

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

const NOW = new Date('2026-09-15T12:00:00Z');
const days = n => new Date(NOW.getTime() + n * DAY_MS);

// ─── A. Chaque seuil, dans l'ordre attendu ─────────────────────────────────────
sep('A. resolveDueReminderStep — seuils individuels');

check('rien à faire si dueDate est dans 10 jours et statut pending', () => {
  const inv = { status: 'pending', dueDate: days(10) };
  assert.strictEqual(resolveDueReminderStep(inv, NOW), null);
});

check('J-3 due quand dueDate est dans 3 jours ou moins (mais pas encore atteinte)', () => {
  const inv = { status: 'pending', dueDate: days(3) };
  const step = resolveDueReminderStep(inv, NOW);
  assert.ok(step);
  assert.strictEqual(step.templateStep, 'j-3');
  assert.strictEqual(step.newStatus, 'reminder_sent_j-3');
});

check('J-3 due exactement à J-3 pile (borne inclusive)', () => {
  const inv = { status: 'pending', dueDate: days(3) };
  // now = dueDate - 3j exactement
  const step = resolveDueReminderStep(inv, new Date(days(3).getTime() - 3 * DAY_MS));
  assert.strictEqual(step.templateStep, 'j-3');
});

check('J-3 NE se déclenche PAS après la date d\'échéance (déjà en retard)', () => {
  // dueDate hier — trop tard pour "avant échéance", doit sauter à j+1 (pas j-3)
  const inv = { status: 'pending', dueDate: days(-1) };
  const step = resolveDueReminderStep(inv, NOW);
  assert.strictEqual(step.templateStep, 'j+1');
});

check('J+1 due 1 jour après dueDate si statut pending ou reminder_sent_j-3', () => {
  const invPending = { status: 'pending', dueDate: days(-1) };
  const invAfterJ3  = { status: 'reminder_sent_j-3', dueDate: days(-1) };
  assert.strictEqual(resolveDueReminderStep(invPending, NOW).templateStep, 'j+1');
  assert.strictEqual(resolveDueReminderStep(invAfterJ3, NOW).templateStep, 'j+1');
});

check('J+10 due 10 jours après dueDate si toujours impayée', () => {
  const inv = { status: 'reminder_sent_j+1', dueDate: days(-10) };
  const step = resolveDueReminderStep(inv, NOW);
  assert.strictEqual(step.templateStep, 'j+10');
  assert.strictEqual(step.newStatus, 'reminder_sent_j+10');
});

check('J+20 due 20 jours après dueDate si toujours impayée', () => {
  const inv = { status: 'reminder_sent_j+10', dueDate: days(-20) };
  const step = resolveDueReminderStep(inv, NOW);
  assert.strictEqual(step.templateStep, 'j+20');
  assert.strictEqual(step.newStatus, 'reminder_sent_j+20');
});

check('rien après J+20 déjà envoyée (dernière étape)', () => {
  const inv = { status: 'reminder_sent_j+20', dueDate: days(-30) };
  assert.strictEqual(resolveDueReminderStep(inv, NOW), null);
});

// ─── B. paid / disputed — jamais de relance ────────────────────────────────────
sep('B. États terminaux — paid/disputed ne déclenchent jamais rien');

check('paid : aucune relance quelle que soit la date d\'échéance', () => {
  assert.strictEqual(resolveDueReminderStep({ status: 'paid', dueDate: days(-100) }, NOW), null);
  assert.strictEqual(resolveDueReminderStep({ status: 'paid', dueDate: days(1) }, NOW), null);
});

check('disputed : aucune relance quelle que soit la date d\'échéance', () => {
  assert.strictEqual(resolveDueReminderStep({ status: 'disputed', dueDate: days(-100) }, NOW), null);
});

check('facture payée APRÈS une relance envoyée → plus aucune relance suivante', () => {
  // Statut passé à 'paid' après reminder_sent_j-3 — même très en retard, rien ne repart.
  const inv = { status: 'paid', dueDate: days(-25) };
  assert.strictEqual(resolveDueReminderStep(inv, NOW), null);
});

// ─── C. Pas de régression / pas de double envoi le même tick ──────────────────
sep('C. Pas de régression — jamais une étape déjà envoyée ou antérieure');

check('reminder_sent_j+1 déjà envoyée → ne redéclenche jamais j-3 ni j+1', () => {
  // dueDate largement dans le passé : la fenêtre j-3/j+1 est "due" en valeur brute,
  // mais le statut interdit toute régression.
  const inv = { status: 'reminder_sent_j+1', dueDate: days(-2) };
  const step = resolveDueReminderStep(inv, NOW);
  // Rien de plus avancé n'est due (j+10 pas encore atteint) → null, jamais j-3/j+1.
  assert.strictEqual(step, null);
});

check('facture très en retard (import CSV historique) saute directement à l\'étape la plus avancée due — pas de cascade (hors J+20, plafonné)', () => {
  // Facture 25 jours en retard, jamais relancée (import CSV d'une facture déjà ancienne).
  // Doit sauter directement à j+10 (la plus avancée due ATTEIGNABLE — j+20 est
  // plafonné, cf. section E), PAS j-3 puis j+1 en cascade.
  const inv = { status: 'pending', dueDate: days(-25) };
  const step = resolveDueReminderStep(inv, NOW);
  assert.strictEqual(step.templateStep, 'j+10');
});

check('une seule étape renvoyée par appel, jamais un tableau ou plusieurs déclenchements', () => {
  const inv = { status: 'pending', dueDate: days(-25) };
  const step = resolveDueReminderStep(inv, NOW);
  assert.strictEqual(typeof step, 'object');
  assert.ok(!Array.isArray(step));
  assert.ok('templateStep' in step && 'newStatus' in step);
});

// ─── E. Plafond J+20 — jamais un premier envoi ─────────────────────────────────
sep('E. Plafond J+20 — ne peut jamais être le tout premier envoi');

check('SCÉNARIO MOTIVANT LE FIX : facture importée à 25j de retard (pending) reçoit J+10, pas J+20, au premier passage', () => {
  const inv = { status: 'pending', dueDate: days(-25) };
  const step = resolveDueReminderStep(inv, NOW);
  assert.strictEqual(step.templateStep, 'j+10');
  assert.strictEqual(step.newStatus, 'reminder_sent_j+10');
});

check('… puis reçoit J+20 au passage SUIVANT, une fois status=reminder_sent_j+10, si toujours impayée', () => {
  // Statut tel qu'il serait après le premier envoi ci-dessus, toujours 25j de retard.
  const invApresJ10 = { status: 'reminder_sent_j+10', dueDate: days(-25) };
  const step = resolveDueReminderStep(invApresJ10, NOW);
  assert.strictEqual(step.templateStep, 'j+20');
  assert.strictEqual(step.newStatus, 'reminder_sent_j+20');
});

check('pending à 100 jours de retard (extrême) → toujours J+10 d\'abord, jamais J+20 directement', () => {
  const inv = { status: 'pending', dueDate: days(-100) };
  const step = resolveDueReminderStep(inv, NOW);
  assert.strictEqual(step.templateStep, 'j+10');
});

check('reminder_sent_j-3 très en retard → J+10 (pas de saut à J+20 depuis un statut ≠ reminder_sent_j+10)', () => {
  const inv = { status: 'reminder_sent_j-3', dueDate: days(-30) };
  const step = resolveDueReminderStep(inv, NOW);
  assert.strictEqual(step.templateStep, 'j+10');
});

check('reminder_sent_j+1 très en retard → J+10 (pas de saut à J+20 depuis un statut ≠ reminder_sent_j+10)', () => {
  const inv = { status: 'reminder_sent_j+1', dueDate: days(-30) };
  const step = resolveDueReminderStep(inv, NOW);
  assert.strictEqual(step.templateStep, 'j+10');
});

check('reminder_sent_j+10 mais seuil J+20 PAS ENCORE atteint → rien (pas d\'envoi prématuré)', () => {
  const inv = { status: 'reminder_sent_j+10', dueDate: days(-15) }; // 15j < 20j
  assert.strictEqual(resolveDueReminderStep(inv, NOW), null);
});

check('J+20 accessible UNIQUEMENT depuis reminder_sent_j+10 exact — jamais depuis pending même si "due"', () => {
  // Même dueDate, seul le statut change : pending → j+10 (plafonné) ; reminder_sent_j+10 → j+20.
  const dueDate = days(-25);
  assert.strictEqual(resolveDueReminderStep({ status: 'pending', dueDate }, NOW).templateStep, 'j+10');
  assert.strictEqual(resolveDueReminderStep({ status: 'reminder_sent_j+10', dueDate }, NOW).templateStep, 'j+20');
});

// ─── F. normalizeOutboundPhone ─────────────────────────────────────────────────
sep('F. normalizeOutboundPhone — format OutboundLead.phone');

check('retire le + initial (E.164 → format webhook)', () => {
  assert.strictEqual(normalizeOutboundPhone('+33612345678'), '33612345678');
});
check('ne modifie pas un numéro déjà sans +', () => {
  assert.strictEqual(normalizeOutboundPhone('33612345678'), '33612345678');
});
check('gère une entrée vide sans lever', () => {
  assert.strictEqual(normalizeOutboundPhone(''), '');
  assert.strictEqual(normalizeOutboundPhone(null), '');
  assert.strictEqual(normalizeOutboundPhone(undefined), '');
});

// ─── Résultat ──────────────────────────────────────────────────────────────────
sep('RÉSULTAT');
if (process.exitCode === 1) {
  console.log(`\n  ❌ Des tests ont échoué (${passed} OK).`);
  process.exit(1);
} else {
  console.log(`\n  ✅ Tous les tests passent (${passed}).`);
}
