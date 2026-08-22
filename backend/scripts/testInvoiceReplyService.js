#!/usr/bin/env node
'use strict';

/**
 * TEST UNITAIRE — invoiceReplyService.js + garantie de suspension (Phase 4)
 * ────────────────────────────────────────────────────────────────────────
 * Usage : node scripts/testInvoiceReplyService.js
 *
 * Pur : NE nécessite NI MongoDB NI OpenAI NI réseau.
 * Teste :
 *   A. resolveInvoiceReplyOutcome — les 5 catégories de réponse client
 *   B. Fail-safe — catégorie inconnue → traitée comme 'unclear'
 *   C. Preuve croisée de SUSPENSION : le statut posé par chaque catégorie
 *      "suspendante" arrête bien resolveDueReminderStep (Phase 3)
 *   D. routeByCampaign — non-régression : seul relance_facture est dérouté,
 *      Adèle/Nove/autres restent sur le pipeline commercial
 *   E. Prompt de classification — présence des règles de prudence
 */

const assert = require('assert');
const {
  resolveInvoiceReplyOutcome,
  buildInvoiceReplyClassifierPrompt,
  routeByCampaign,
  INVOICE_REPLY_CATEGORIES,
} = require('../services/invoiceReplyService');
const { resolveDueReminderStep, DAY_MS } = require('../services/invoiceReminderService');

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

// ─── A. Les 5 catégories ────────────────────────────────────────────────────
sep('A. resolveInvoiceReplyOutcome — les 5 cas');

check('CAS 1 — payment_claimed : statut → payment_claimed, suspend, notifie, réponse neutre', () => {
  const o = resolveInvoiceReplyOutcome('payment_claimed');
  assert.strictEqual(o.newStatus, 'payment_claimed');
  assert.strictEqual(o.suspendsAutomation, true);
  assert.strictEqual(o.notifyHuman, true);
  assert.strictEqual(o.replyKind, 'neutral');
  assert.ok(o.neutralReply && o.neutralReply.length > 0);
});

check('CAS 2 — disputed : statut → disputed, suspend, notifie, réponse neutre', () => {
  const o = resolveInvoiceReplyOutcome('disputed');
  assert.strictEqual(o.newStatus, 'disputed');
  assert.strictEqual(o.suspendsAutomation, true);
  assert.strictEqual(o.notifyHuman, true);
  assert.strictEqual(o.replyKind, 'neutral');
  assert.ok(o.neutralReply);
});

check('CAS 3 — delayed : statut → delayed, suspend, notifie, réponse neutre', () => {
  const o = resolveInvoiceReplyOutcome('delayed');
  assert.strictEqual(o.newStatus, 'delayed');
  assert.strictEqual(o.suspendsAutomation, true);
  assert.strictEqual(o.notifyHuman, true);
  assert.strictEqual(o.replyKind, 'neutral');
  assert.ok(o.neutralReply);
});

check('CAS 4 — general_question : AUCUN changement de statut, ne suspend pas, ne notifie pas, réponse informative', () => {
  const o = resolveInvoiceReplyOutcome('general_question');
  assert.strictEqual(o.newStatus, null);
  assert.strictEqual(o.suspendsAutomation, false);
  assert.strictEqual(o.notifyHuman, false);
  assert.strictEqual(o.replyKind, 'informative');
  assert.strictEqual(o.neutralReply, null); // réponse générée via Phase 0, pas fixe
});

check('CAS 5 — unclear : AUCUN changement de statut, notifie un humain, réponse neutre', () => {
  const o = resolveInvoiceReplyOutcome('unclear');
  assert.strictEqual(o.newStatus, null);
  assert.strictEqual(o.suspendsAutomation, false); // pas de statut posé
  assert.strictEqual(o.notifyHuman, true);         // mais on alerte quand même
  assert.strictEqual(o.replyKind, 'neutral');
  assert.ok(o.neutralReply);
});

// ─── B. Fail-safe catégorie inconnue ────────────────────────────────────────
sep('B. Fail-safe — catégorie inconnue');

check('catégorie inconnue/absente → traitée comme unclear (jamais un statut inventé)', () => {
  for (const bogus of ['n_importe_quoi', '', null, undefined, 'PAID', 'payment']) {
    const o = resolveInvoiceReplyOutcome(bogus);
    assert.strictEqual(o.category, 'unclear', `catégorie ${JSON.stringify(bogus)}`);
    assert.strictEqual(o.newStatus, null);
    assert.strictEqual(o.notifyHuman, true);
  }
});

check('les 5 catégories déclarées sont bien couvertes par le mapping', () => {
  for (const cat of INVOICE_REPLY_CATEGORIES) {
    const o = resolveInvoiceReplyOutcome(cat);
    assert.strictEqual(o.category, cat);
  }
});

// ─── C. Preuve croisée : le statut posé SUSPEND bien le scheduler ────────────
sep('C. Suspension end-to-end — le statut posé arrête resolveDueReminderStep');

const NOW = new Date('2026-09-15T12:00:00Z');
const overdue = new Date(NOW.getTime() - 25 * DAY_MS); // 25j de retard : "dû" en valeur brute

check('une facture très en retard SANS réponse (reminder_sent_j+10) serait relancée (J+20) — référence', () => {
  // Prouve que le scénario est bien "actif" avant la réponse client, sinon le
  // test de suspension ne prouverait rien.
  const step = resolveDueReminderStep({ status: 'reminder_sent_j+10', dueDate: overdue }, NOW);
  assert.ok(step && step.templateStep === 'j+20');
});

for (const cat of ['payment_claimed', 'disputed', 'delayed']) {
  check(`après réponse "${cat}" → statut posé arrête TOUTE relance (resolveDueReminderStep = null)`, () => {
    const { newStatus } = resolveInvoiceReplyOutcome(cat);
    // Même facture, même retard, mais statut passé à celui posé par la réponse.
    const step = resolveDueReminderStep({ status: newStatus, dueDate: overdue }, NOW);
    assert.strictEqual(step, null, `${cat} (statut ${newStatus}) aurait dû suspendre`);
  });
}

// ─── D. routeByCampaign — non-régression ────────────────────────────────────
sep('D. routeByCampaign — seul relance_facture est dérouté');

check('relance_facture → invoice_reply (traitement dédié)', () => {
  assert.strictEqual(routeByCampaign('relance_facture'), 'invoice_reply');
});

check('NON-RÉGRESSION : Adèle → commercial (pipeline commercial inchangé)', () => {
  assert.strictEqual(routeByCampaign('adele'), 'commercial');
});

check('NON-RÉGRESSION : Nove → commercial', () => {
  assert.strictEqual(routeByCampaign('nove'), 'commercial');
});

check('NON-RÉGRESSION : agent_boutique / null / undefined → commercial', () => {
  assert.strictEqual(routeByCampaign('agent_boutique'), 'commercial');
  assert.strictEqual(routeByCampaign(null), 'commercial');
  assert.strictEqual(routeByCampaign(undefined), 'commercial');
});

// ─── E. Prompt de classification — règles de prudence ────────────────────────
sep('E. Prompt de classification — prudence');

check('le prompt liste EXACTEMENT les 5 catégories', () => {
  const p = buildInvoiceReplyClassifierPrompt();
  for (const cat of INVOICE_REPLY_CATEGORIES) {
    assert.ok(p.includes(cat), `catégorie ${cat} absente du prompt`);
  }
});

check('le prompt contient la règle de prudence "en cas de doute, préférer la suspension"', () => {
  const p = buildInvoiceReplyClassifierPrompt().toLowerCase();
  assert.ok(p.includes('doute'), 'notion de doute absente');
  assert.ok(p.includes('mauvaise foi'), 'garde-fou "ne jamais supposer la mauvaise foi" absent');
  // Le prompt doit privilégier les catégories suspendantes sur general_question en cas de doute.
  assert.ok(p.includes('general_question') && p.includes('payment_claimed'),
    'la règle de départage doute→suspension doit citer general_question vs payment_claimed');
});

// ─── Résultat ──────────────────────────────────────────────────────────────────
sep('RÉSULTAT');
if (process.exitCode === 1) {
  console.log(`\n  ❌ Des tests ont échoué (${passed} OK).`);
  process.exit(1);
} else {
  console.log(`\n  ✅ Tous les tests passent (${passed}).`);
}
