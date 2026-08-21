#!/usr/bin/env node
'use strict';

/**
 * TEST UNITAIRE — Sélection du catalogue produit par campagne (Phase 0)
 * ─────────────────────────────────────────────────────────────────────
 * Usage : node scripts/testCampaignCatalog.js
 *
 * Pur : NE nécessite NI MongoDB NI OpenAI (aucune connexion réseau).
 * Teste :
 *   A. pickMostRecentCampaign — règle multi-campagne "le plus récemment contacté l'emporte"
 *   B. ZÉRO RÉGRESSION — buildSystemPrompt sans campagne == comportement d'avant
 *      (Adèle / Nove : produit_prise_de_contact / relance_j3 / closing_j7)
 *   C. Injection par campagne — le catalogue campagne remplace le catalogue tenant
 *   D. Repli — catalogue campagne vide ⇒ on retombe sur le catalogue tenant
 */

// Env factices pour éviter les warnings paymentLinks (sans effet sur le test)
process.env.SALES_PAYMENT_LINK_STARTER ||= 'https://pay.test/starter';
process.env.SALES_PAYMENT_LINK_PRO     ||= 'https://pay.test/pro';
process.env.SALES_PAYMENT_LINK_ELITE   ||= 'https://pay.test/elite';

const assert = require('assert');
const { buildSystemPrompt } = require('../services/orchestrator');
const { pickMostRecentCampaign, leadContactTime } = require('../services/campaignConfigService');

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

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// User "prod" représentatif d'Adèle/Nove : un catalogue tenant, pas d'instructions custom.
const tenantUser = {
  store_name: 'Boutique Adèle',
  agent_instructions: '',
  calendly_link: '',
  catalog: [
    { reference: 'A1', nom: 'Robe été', categorie: 'Robes', prix: 49, stock: 12, tailles: ['S', 'M'], couleurs: ['bleu'] },
    { reference: 'A2', nom: 'Chemisier lin', categorie: 'Hauts', prix: 39, stock: 5 },
  ],
};

// Fiche produit d'une NOUVELLE campagne (aurait un CampaignConfig dédié).
const campaignProductInfo = {
  catalog: [
    { reference: 'N1', nom: 'Sac cuir', categorie: 'Maroquinerie', prix: 120, stock: 3 },
  ],
  pitch: 'Le sac cuir fait main, édition limitée.',
  argumentaire: 'Cuir pleine fleur, garanti 5 ans.',
  pricing: '120€ — livraison offerte cette semaine.',
  faq: [{ question: 'Cuir véritable ?', reponse: 'Oui, pleine fleur.' }],
  objections: [{ objection: 'trop cher', reponse: 'Garanti 5 ans, coût par an minime.' }],
};

// ─── A. Règle multi-campagne : le plus récemment contacté l'emporte ────────────
sep('A. pickMostRecentCampaign — règle multi-campagne');

check('campagne la plus récemment contactée (lastContactAt) gagne', () => {
  const leads = [
    { campaign: 'adele', lastContactAt: '2026-06-01T10:00:00Z' },
    { campaign: 'nove',  lastContactAt: '2026-08-15T10:00:00Z' }, // plus récent
    { campaign: 'old',   lastContactAt: '2026-01-01T10:00:00Z' },
  ];
  assert.strictEqual(pickMostRecentCampaign(leads), 'nove');
});

check('repli sur updatedAt puis createdAt si lastContactAt absent', () => {
  const leads = [
    { campaign: 'a', createdAt: '2026-02-01T00:00:00Z' },
    { campaign: 'b', updatedAt: '2026-07-01T00:00:00Z' }, // plus récent via updatedAt
  ];
  assert.strictEqual(pickMostRecentCampaign(leads), 'b');
  assert.ok(leadContactTime(leads[1]) > leadContactTime(leads[0]));
});

check('ignore les leads sans campagne', () => {
  const leads = [
    { lastContactAt: '2026-08-20T00:00:00Z' },              // pas de campagne → ignoré
    { campaign: 'seule', lastContactAt: '2026-03-01T00:00:00Z' },
  ];
  assert.strictEqual(pickMostRecentCampaign(leads), 'seule');
});

check('aucun lead → null (déclenche le repli tenant)', () => {
  assert.strictEqual(pickMostRecentCampaign([]), null);
  assert.strictEqual(pickMostRecentCampaign(null), null);
  assert.strictEqual(pickMostRecentCampaign(undefined), null);
});

// ─── B. ZÉRO RÉGRESSION — comportement identique sans campagne ─────────────────
sep('B. Zéro régression (Adèle / Nove sans CampaignConfig)');

const promptLegacy = buildSystemPrompt(tenantUser, null);          // signature d'avant (2 args)
const promptNull   = buildSystemPrompt(tenantUser, null, null);    // 3e arg null
const promptUndef  = buildSystemPrompt(tenantUser, null, undefined);

check('buildSystemPrompt(u, s) === buildSystemPrompt(u, s, null) (byte-identique)', () => {
  assert.strictEqual(promptNull, promptLegacy);
});
check('buildSystemPrompt(u, s) === buildSystemPrompt(u, s, undefined)', () => {
  assert.strictEqual(promptUndef, promptLegacy);
});
check('catalogue TENANT toujours injecté (Robe été / Chemisier lin)', () => {
  assert.ok(promptLegacy.includes('Robe été'), 'Robe été absente');
  assert.ok(promptLegacy.includes('Chemisier lin'), 'Chemisier lin absent');
  assert.ok(promptLegacy.includes('CATALOGUE PRODUITS DISPONIBLES'), 'entête catalogue absente');
});
check('AUCUN bloc "FICHE PRODUIT CAMPAGNE" sans campagne', () => {
  assert.ok(!promptLegacy.includes('FICHE PRODUIT CAMPAGNE'), 'bloc campagne injecté à tort');
});
check('catalogue campagne (Sac cuir) ABSENT du prompt legacy', () => {
  assert.ok(!promptLegacy.includes('Sac cuir'), 'produit campagne fuité dans le prompt tenant');
});

// ─── C. Injection PAR CAMPAGNE — le catalogue campagne prime ───────────────────
sep('C. Injection par campagne');

const promptCampaign = buildSystemPrompt(tenantUser, null, campaignProductInfo);

check('catalogue CAMPAGNE injecté (Sac cuir)', () => {
  assert.ok(promptCampaign.includes('Sac cuir'), 'produit campagne absent');
});
check('catalogue TENANT NON injecté quand campagne présente (pas de Robe été)', () => {
  assert.ok(!promptCampaign.includes('Robe été'), 'catalogue tenant fuité alors que campagne active');
});
check('bloc discours campagne présent (pitch/argumentaire/tarifs/FAQ/objections)', () => {
  assert.ok(promptCampaign.includes('FICHE PRODUIT CAMPAGNE'), 'entête fiche absente');
  assert.ok(promptCampaign.includes('Le sac cuir fait main'), 'pitch absent');
  assert.ok(promptCampaign.includes('Cuir pleine fleur, garanti 5 ans'), 'argumentaire absent');
  assert.ok(promptCampaign.includes('livraison offerte'), 'pricing absent');
  assert.ok(promptCampaign.includes('Cuir véritable ?'), 'FAQ absente');
  assert.ok(promptCampaign.includes('trop cher'), 'objection absente');
});

// ─── D. Repli — catalogue campagne vide ⇒ catalogue tenant ─────────────────────
sep('D. Repli catalogue campagne vide');

check('productInfo.catalog vide ⇒ repli sur catalogue tenant', () => {
  const emptyCat = buildSystemPrompt(tenantUser, null, { catalog: [], pitch: 'Promo flash' });
  assert.ok(emptyCat.includes('Robe été'), 'repli tenant non appliqué');
  assert.ok(emptyCat.includes('Promo flash'), 'pitch campagne perdu');
});

check('user sans catalogue + sans campagne ⇒ aucun bloc catalogue (pas de crash)', () => {
  const bare = buildSystemPrompt({ store_name: 'X' }, null);
  assert.ok(!bare.includes('CATALOGUE PRODUITS DISPONIBLES'), 'catalogue injecté à tort');
});

// ─── Résultat ──────────────────────────────────────────────────────────────────
sep('RÉSULTAT');
if (process.exitCode === 1) {
  console.log(`\n  ❌ Des tests ont échoué (${passed} OK).`);
  process.exit(1);
} else {
  console.log(`\n  ✅ Tous les tests passent (${passed}).`);
}
