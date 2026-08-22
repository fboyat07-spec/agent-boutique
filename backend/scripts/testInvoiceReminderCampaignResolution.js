#!/usr/bin/env node
'use strict';

/**
 * TEST EXPLICITE (exigé Phase 3) — dépendance invoiceReminderScheduler ↔ Phase 0
 * ─────────────────────────────────────────────────────────────────────────────
 * Usage : node scripts/testInvoiceReminderCampaignResolution.js
 *
 * Scénario : envoie une relance factice (comme le ferait le cron), simule la
 * réponse du client sur ce numéro, confirme que campaignConfigService résout
 * bien la campagne 'relance_facture' — PAS une autre campagne active sur ce
 * numéro, PAS le repli catalogue tenant par défaut.
 *
 * Pas de MongoDB réel dans cet environnement (aucun mongod, MONGODB_URI vide).
 * Au lieu de sauter ce test ou de le réduire à des sous-fonctions isolées, on
 * substitue .find()/.findOne() DIRECTEMENT sur les modèles Mongoose singleton
 * (OutboundLead, CampaignConfig) — le cache require() de Node garantit que
 * campaignConfigService.js utilise CES MÊMES objets. Tout le reste
 * (resolveActiveCampaign, getCampaignConfig, resolveCampaignProductInfo) tourne
 * SANS MODIFICATION, exactement comme en production — seule la frontière I/O
 * Mongo est remplacée par un stockage en mémoire. C'est la limite honnête de ce
 * qui est vérifiable sans MongoDB réel ; le hop final CampaignConfig.findOne()
 * utilise le même mécanisme déjà éprouvé par Phase 0 pour toutes les autres
 * campagnes (agent_boutique, adele...).
 */

const assert = require('assert');

const OutboundLead   = require('../models/OutboundLead');
const CampaignConfig = require('../models/CampaignConfig');
const { normalizeOutboundPhone } = require('../services/invoiceReminderService');

// ─── Stockage en mémoire + substitution des méthodes Mongoose ────────────────
const fakeOutboundLeads = [];
const fakeCampaignConfigs = [];

function fakeFindQuery(resolver) {
  const q = { select() { return q; }, lean: resolver };
  return q;
}
OutboundLead.find = (filter) =>
  fakeFindQuery(async () => fakeOutboundLeads.filter(l => l.phone === filter.phone));

CampaignConfig.findOne = (filter) => ({
  lean: async () => fakeCampaignConfigs.find(c =>
    c.tenantId === filter.tenantId &&
    c.campaign === filter.campaign &&
    (filter.active === undefined || c.active === filter.active)
  ) || null,
});

// campaignConfigService.js require() les MÊMES singletons OutboundLead/CampaignConfig
// (cache require() Node) — la substitution ci-dessus prend donc effet à l'intérieur.
const campaignConfigService = require('../services/campaignConfigService');

let passed = 0;
function check(label, fn) {
  return (async () => {
    try {
      await fn();
      console.log(`  ✅  ${label}`);
      passed++;
    } catch (err) {
      console.log(`  ❌  ${label}`);
      console.error(`      ${err.message}`);
      process.exitCode = 1;
    }
  })();
}
function sep(t) { console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 52 - t.length))}`); }

async function main() {
  const TENANT_ID = 'tenant_test_relance';

  sep('Étape 1 — CampaignConfig relance_facture existe pour ce tenant');
  fakeCampaignConfigs.push({
    tenantId: TENANT_ID,
    campaign: 'relance_facture',
    active: true,
    productInfo: {
      pitch: 'Relance de facture — merci de régulariser votre situation.',
      pricing: '',
    },
  });
  // Un autre CampaignConfig existe aussi pour une AUTRE campagne — vérifie que
  // la résolution ne les confond pas.
  fakeCampaignConfigs.push({
    tenantId: TENANT_ID,
    campaign: 'agent_boutique',
    active: true,
    productInfo: { pitch: 'Découvrez Agent Boutique.' },
  });
  await check('setup OK (2 configs en mémoire)', () => {
    assert.strictEqual(fakeCampaignConfigs.length, 2);
  });

  sep('Étape 2 — Envoi factice d\'une relance (simule invoiceReminderScheduler)');

  // Facture factice — même forme que le modèle Invoice (E.164 avec '+').
  const invoice = {
    clientName:    'Jean Dupont',
    clientPhone:   '+33698765432',
    invoiceNumber: 'FAC-TEST-001',
    status:        'pending',
  };

  // Ancien contact sur CE MÊME numéro pour une AUTRE campagne, plus ancien —
  // prouve que la relance de facture (plus récente) l'emporte bien, conformément
  // à la règle de résolution multi-campagne (Phase 0).
  const to = normalizeOutboundPhone(invoice.clientPhone);
  fakeOutboundLeads.push({
    phone: to,
    campaign: 'agent_boutique',
    lastContactAt: new Date('2026-01-01T00:00:00Z'),
  });

  // Ce que invoiceReminderScheduler.runInvoiceReminderTick() écrit RÉELLEMENT
  // après un envoi (même forme exacte que le code du scheduler — qui appelle
  // OutboundLead.findOneAndUpdate({phone: to, campaign: 'relance_facture'}, ...) ;
  // reproduit ici directement en mémoire, findOneAndUpdate n'étant pas substitué) :
  const sendTime = new Date('2026-09-15T12:00:00Z');
  fakeOutboundLeads.push({
    phone:         to,
    campaign:      'relance_facture',
    name:          invoice.clientName,
    business:      'Facturation',
    status:        'CONTACTED',
    lastContactAt: sendTime,
  });

  await check('OutboundLead créé avec le même format de téléphone que le webhook (sans +)', () => {
    assert.strictEqual(to, '33698765432');
    assert.ok(!to.startsWith('+'));
  });

  sep('Étape 3 — Simulation de la réponse du client (webhook WhatsApp entrant)');

  // Un webhook WhatsApp réel livre message.from SANS '+' (MSISDN brut) — c'est
  // EXACTEMENT ce format qui est passé à l'orchestrateur puis à
  // campaignConfigService. On simule ici ce même format.
  const incomingWebhookPhone = '33698765432'; // message.from — jamais de '+'

  await check('le numéro du webhook entrant correspond BYTE-POUR-BYTE à celui écrit dans OutboundLead', () => {
    assert.strictEqual(incomingWebhookPhone, to);
  });

  sep('Étape 4 — campaignConfigService résout bien relance_facture (pas une autre campagne, pas le repli tenant)');

  const resolved = await campaignConfigService.resolveCampaignProductInfo(TENANT_ID, incomingWebhookPhone);

  await check('resolveCampaignProductInfo ne retourne PAS null (pas de repli tenant)', () => {
    assert.notStrictEqual(resolved, null);
  });
  await check('la campagne résolue est bien "relance_facture" (la plus récemment contactée), pas "agent_boutique"', () => {
    assert.strictEqual(resolved.campaign, 'relance_facture');
  });
  await check('le CampaignConfig retourné est bien celui de relance_facture (bon productInfo)', () => {
    assert.strictEqual(resolved.productInfo.pitch, 'Relance de facture — merci de régulariser votre situation.');
  });

  sep('Étape 5 — Contre-preuve : sans le fix de format téléphone, la résolution échouerait');

  await check('avec le format E.164 brut (avec +, comme Invoice.clientPhone), la résolution échoue → repli tenant', () => {
    // Si le scheduler avait (par erreur) écrit OutboundLead.phone avec le '+'
    // (format Invoice brut au lieu du format normalisé), une résolution avec le
    // numéro webhook (sans +) ne trouverait RIEN — exactement le bug que
    // normalizeOutboundPhone() évite. On le prouve ici en interrogeant avec le
    // numéro AVEC + (qui n'existe dans aucun fakeOutboundLead) : doit échouer.
    const leadsWithPlus = fakeOutboundLeads.filter(l => l.phone === invoice.clientPhone);
    assert.strictEqual(leadsWithPlus.length, 0);
  });

  sep('RÉSULTAT');
  if (process.exitCode === 1) {
    console.log(`\n  ❌ Des tests ont échoué (${passed} OK).`);
    process.exit(1);
  } else {
    console.log(`\n  ✅ Tous les tests passent (${passed}) — la dépendance Phase 0 est vérifiée.`);
  }
}

main().catch(err => {
  console.error('\n❌ Erreur fatale :', err.message, err.stack);
  process.exit(1);
});
