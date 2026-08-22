#!/usr/bin/env node
'use strict';

/**
 * TEST UNITAIRE — Écran de gestion des campagnes (CampaignConfig + tag à l'import)
 * ──────────────────────────────────────────────────────────────────────────────
 * Usage : node scripts/testCampaignManagement.js
 *
 * Pur : NE nécessite NI MongoDB NI OpenAI (aucune connexion réseau).
 * Teste :
 *   A. normalizeCampaignConfigInput — clé libre, active, structure productInfo,
 *      parsing FAQ/objections, rejet clé vide, valeurs par défaut.
 *   B. Résolution / injection — la fiche produit normalisée d'une campagne est
 *      bien injectée dans buildSystemPrompt (pitch/argumentaire/tarifs/FAQ/objections
 *      + primauté du catalogue campagne).
 *   C. ZÉRO RÉGRESSION — un numéro sans campagne OU une campagne sans config
 *      (resolveCampaignProductInfo → null) ⇒ buildSystemPrompt retombe sur le
 *      catalogue tenant, byte-identique au comportement d'avant.
 *   D. Tag à l'import — buildLeadDoc pose la campagne choisie, et retombe sur le
 *      défaut modèle (champ absent) quand aucune campagne n'est choisie.
 */

// Env factices pour éviter les warnings paymentLinks (sans effet sur le test)
process.env.SALES_PAYMENT_LINK_STARTER ||= 'https://pay.test/starter';
process.env.SALES_PAYMENT_LINK_PRO     ||= 'https://pay.test/pro';
process.env.SALES_PAYMENT_LINK_ELITE   ||= 'https://pay.test/elite';

const assert = require('assert');
const { normalizeCampaignConfigInput } = require('../services/campaignAdminService');
const { buildLeadDoc, parseLeadRows } = require('../services/csvLeadImporter');
const { buildSystemPrompt } = require('../services/orchestrator');

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

// ─── A. normalizeCampaignConfigInput ───────────────────────────────────────────
sep('A. normalizeCampaignConfigInput');

check('clé de campagne en TEXTE LIBRE conservée (trim), non figée à une liste', () => {
  const out = normalizeCampaignConfigInput({ campaign: '  KidAI-2026  ' });
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.campaign, 'KidAI-2026');
});

check('clé vide ⇒ rejet explicite (jamais de config anonyme)', () => {
  assert.strictEqual(normalizeCampaignConfigInput({ campaign: '   ' }).ok, false);
  assert.strictEqual(normalizeCampaignConfigInput({}).ok, false);
});

check('active par défaut = true, false uniquement si explicitement false', () => {
  assert.strictEqual(normalizeCampaignConfigInput({ campaign: 'c' }).active, true);
  assert.strictEqual(normalizeCampaignConfigInput({ campaign: 'c', active: false }).active, false);
  assert.strictEqual(normalizeCampaignConfigInput({ campaign: 'c', active: 0 }).active, false);
});

check('productInfo : structure identique à ProductInfoSchema (5 champs de discours + catalog)', () => {
  const { productInfo } = normalizeCampaignConfigInput({ campaign: 'c' });
  assert.deepStrictEqual(Object.keys(productInfo).sort(),
    ['argumentaire', 'catalog', 'faq', 'objections', 'pitch', 'pricing'].sort());
  assert.deepStrictEqual(productInfo.catalog, []);
  assert.deepStrictEqual(productInfo.faq, []);
  assert.deepStrictEqual(productInfo.objections, []);
  assert.strictEqual(productInfo.pitch, '');
});

check('FAQ : ne conserve que les entrées avec question, coerce les champs', () => {
  const { productInfo } = normalizeCampaignConfigInput({
    campaign: 'c',
    productInfo: { faq: [
      { question: ' Livraison ? ', reponse: ' 48h ' },
      { question: '', reponse: 'orpheline' },     // pas de question → ignorée
      { reponse: 'sans question' },               // ignorée
    ] },
  });
  assert.deepStrictEqual(productInfo.faq, [{ question: 'Livraison ?', reponse: '48h' }]);
});

check('objections : ne conserve que les entrées avec objection', () => {
  const { productInfo } = normalizeCampaignConfigInput({
    campaign: 'c',
    productInfo: { objections: [
      { objection: ' trop cher ', reponse: ' garanti 5 ans ' },
      { objection: '', reponse: 'orpheline' },    // ignorée
    ] },
  });
  assert.deepStrictEqual(productInfo.objections, [{ objection: 'trop cher', reponse: 'garanti 5 ans' }]);
});

check('catalog fourni (array) conservé tel quel ; non-array ⇒ []', () => {
  const withCat = normalizeCampaignConfigInput({ campaign: 'c', productInfo: { catalog: [{ nom: 'X', prix: 10 }] } });
  assert.strictEqual(withCat.productInfo.catalog.length, 1);
  const badCat = normalizeCampaignConfigInput({ campaign: 'c', productInfo: { catalog: 'oops' } });
  assert.deepStrictEqual(badCat.productInfo.catalog, []);
});

// ─── B. Résolution / injection dans buildSystemPrompt ──────────────────────────
sep('B. Injection de la fiche campagne normalisée dans le prompt');

const tenantUser = {
  store_name: 'Boutique Test',
  agent_instructions: '',
  catalog: [
    { reference: 'T1', nom: 'Produit Tenant', prix: 20, stock: 4 },
  ],
};

check('une fiche campagne normalisée est injectée (pitch/argumentaire/tarifs/FAQ/objections + catalogue campagne)', () => {
  const norm = normalizeCampaignConfigInput({
    campaign: 'kidai',
    productInfo: {
      catalog: [{ reference: 'K1', nom: 'Kit KidAI', prix: 99, stock: 7 }],
      pitch: 'KidAI rend vos enfants curieux.',
      argumentaire: 'Contenu pédagogique validé par des enseignants.',
      pricing: '99€ à vie, sans abonnement.',
      faq: [{ question: 'Âge conseillé ?', reponse: 'Dès 6 ans.' }],
      objections: [{ objection: 'écran', reponse: 'Usage encadré, 20 min/jour.' }],
    },
  });
  // Simule ce que resolveCampaignProductInfo renverrait à l'orchestrateur.
  const prompt = buildSystemPrompt(tenantUser, null, norm.productInfo);

  assert.ok(prompt.includes('FICHE PRODUIT CAMPAGNE'), 'entête fiche absente');
  assert.ok(prompt.includes('KidAI rend vos enfants curieux'), 'pitch absent');
  assert.ok(prompt.includes('Contenu pédagogique validé'), 'argumentaire absent');
  assert.ok(prompt.includes('99€ à vie'), 'tarifs absents');
  assert.ok(prompt.includes('Âge conseillé ?'), 'FAQ absente');
  assert.ok(prompt.includes('Usage encadré'), 'objection absente');
  // Catalogue campagne prime sur celui du tenant.
  assert.ok(prompt.includes('Kit KidAI'), 'catalogue campagne absent');
  assert.ok(!prompt.includes('Produit Tenant'), 'catalogue tenant fuité malgré une campagne active');
});

// ─── C. ZÉRO RÉGRESSION — sans campagne / campagne sans config ──────────────────
sep('C. Zéro régression (numéro sans campagne / campagne sans config)');

check('resolveCampaignProductInfo → null ⇒ buildSystemPrompt byte-identique au legacy', () => {
  // null = ce que renvoie resolveCampaignProductInfo pour adele/nove/agent_boutique
  // (aucun CampaignConfig) OU pour un numéro sans campagne résolue.
  const legacy = buildSystemPrompt(tenantUser, null);
  const withNull = buildSystemPrompt(tenantUser, null, null);
  assert.strictEqual(withNull, legacy, 'la présence du 3e arg null modifie le prompt');
});

check('catalogue TENANT toujours injecté quand aucune campagne résolue', () => {
  const prompt = buildSystemPrompt(tenantUser, null, null);
  assert.ok(prompt.includes('Produit Tenant'), 'catalogue tenant absent');
  assert.ok(!prompt.includes('FICHE PRODUIT CAMPAGNE'), 'bloc campagne injecté à tort');
});

check('une campagne sans config (productInfo null) ne fait PAS fuiter de bloc campagne', () => {
  const prompt = buildSystemPrompt(tenantUser, null, null);
  assert.ok(!prompt.includes('Kit KidAI'), 'produit campagne fuité sans config résolue');
});

// ─── D. Tag à l'import — buildLeadDoc / parseLeadRows ──────────────────────────
sep('D. Tag campagne à l\'import de leads');

check('parseLeadRows : header ignoré, colonnes phone/name/city/business', () => {
  const rows = parseLeadRows('phone,name,city,business\n+33612345678,Alice,Lyon,Café');
  assert.strictEqual(rows.length, 1);
  assert.deepStrictEqual(rows[0], { phone: '+33612345678', name: 'Alice', city: 'Lyon', business: 'Café' });
});

check('campagne CHOISIE ⇒ champ campaign posé sur le lead', () => {
  const doc = buildLeadDoc({ phone: '+33611111111', name: 'Bob', city: 'Paris', business: 'Bar' }, 'kidai');
  assert.strictEqual(doc.campaign, 'kidai');
  assert.strictEqual(doc.status, 'NEW');
});

check('AUCUNE campagne (option "comportement par défaut") ⇒ champ campaign ABSENT (défaut modèle agent_boutique)', () => {
  const docEmpty = buildLeadDoc({ phone: '+33622222222', name: 'C', city: 'Nice', business: 'Resto' }, '');
  const docSpace = buildLeadDoc({ phone: '+33633333333', name: 'D', city: 'Nantes', business: 'Shop' }, '   ');
  assert.ok(!('campaign' in docEmpty), 'campaign posé à tort quand aucune campagne choisie');
  assert.ok(!('campaign' in docSpace), 'campaign posé à tort pour une campagne blanche');
});

check('valeurs par défaut de lead (name/city/business) si colonnes vides', () => {
  const doc = buildLeadDoc({ phone: '+33644444444', name: '', city: '', business: '' }, 'x');
  assert.strictEqual(doc.name, 'Prospect');
  assert.strictEqual(doc.city, 'France');
  assert.strictEqual(doc.business, 'Business');
});

// ─── Résultat ──────────────────────────────────────────────────────────────────
sep('RÉSULTAT');
if (process.exitCode === 1) {
  console.log(`\n  ❌ Des tests ont échoué (${passed} OK).`);
  process.exit(1);
} else {
  console.log(`\n  ✅ Tous les tests passent (${passed}).`);
}
