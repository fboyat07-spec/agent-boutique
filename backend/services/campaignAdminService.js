'use strict';

/**
 * campaignAdminService — logique PURE de normalisation d'un CampaignConfig saisi
 * depuis l'écran "Campagnes" de la console.
 * ────────────────────────────────────────────────────────────────────────────
 * Aucune dépendance Mongo/réseau ici — entièrement testable en isolation.
 * La route (routes/campaignConfigRoutes.js) ne fait qu'appeler cette fonction
 * puis persister le résultat via CampaignConfig.findOneAndUpdate.
 *
 * Contrat de sortie identique au sous-document ProductInfoSchema (CampaignConfig)
 * afin que l'injection dans buildSystemPrompt suive EXACTEMENT le même chemin de
 * rendu que la fiche produit Phase 0 — aucune divergence de format possible.
 *
 * Clé de campagne = TEXTE LIBRE (jamais une liste figée) : Florian ajoute des
 * campagnes futures sans changement de code.
 */

const s = v => String(v == null ? '' : v).trim();

/**
 * Normalise le tableau FAQ : ne conserve que les entrées avec une question
 * non vide, coerce chaque champ en chaîne. Accepte {question, reponse}.
 * @param {any} faq
 * @returns {Array<{question:string, reponse:string}>}
 */
function normalizeFaq(faq) {
  if (!Array.isArray(faq)) return [];
  return faq
    .map(f => ({ question: s(f?.question), reponse: s(f?.reponse) }))
    .filter(f => f.question);
}

/**
 * Normalise le tableau d'objections : ne conserve que les entrées avec une
 * objection non vide. Accepte {objection, reponse}.
 * @param {any} objections
 * @returns {Array<{objection:string, reponse:string}>}
 */
function normalizeObjections(objections) {
  if (!Array.isArray(objections)) return [];
  return objections
    .map(o => ({ objection: s(o?.objection), reponse: s(o?.reponse) }))
    .filter(o => o.objection);
}

/**
 * Normalise le catalogue produit d'une campagne. Pass-through minimal (mêmes
 * champs que ProductSchema, réutilisé par CampaignConfig.productInfo.catalog).
 * Le formulaire console n'édite pas le catalogue campagne pour l'instant — il
 * est donc conservé tel quel s'il est fourni (édition API/Mongo directe), sinon
 * []. Ne JAMAIS écraser silencieusement par [] si une valeur array est fournie.
 * @param {any} catalog
 * @returns {Array<object>}
 */
function normalizeCatalog(catalog) {
  return Array.isArray(catalog) ? catalog : [];
}

/**
 * Normalise/valide l'entrée du formulaire "Campagnes".
 *
 * @param {object} body  Corps de la requête POST /api/campaigns
 * @param {string} body.campaign      Clé de campagne (texte libre, requis)
 * @param {boolean} [body.active]     Actif ? (défaut true)
 * @param {object} [body.productInfo] { pitch, argumentaire, pricing, faq[], objections[], catalog[] }
 * @returns {{ok:true, campaign:string, active:boolean, productInfo:object}|{ok:false, error:string}}
 */
function normalizeCampaignConfigInput(body = {}) {
  const campaign = s(body.campaign);
  if (!campaign) {
    return { ok: false, error: 'campaign (clé de campagne) requis' };
  }

  // active : true par défaut ; n'est false que si explicitement false.
  const active = body.active === undefined ? true : Boolean(body.active);

  const pi = body.productInfo || {};
  const productInfo = {
    catalog:      normalizeCatalog(pi.catalog),
    pitch:        s(pi.pitch),
    argumentaire: s(pi.argumentaire),
    pricing:      s(pi.pricing),
    faq:          normalizeFaq(pi.faq),
    objections:   normalizeObjections(pi.objections),
  };

  return { ok: true, campaign, active, productInfo };
}

module.exports = {
  normalizeCampaignConfigInput,
  normalizeFaq,
  normalizeObjections,
  normalizeCatalog,
};
