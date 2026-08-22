'use strict';

/**
 * campaignConfigService — sélection du catalogue produit PAR CAMPAGNE.
 * ────────────────────────────────────────────────────────────────────
 * À chaque message entrant, avant de générer une réponse, l'orchestrateur
 * doit injecter le catalogue de LA campagne à laquelle ce numéro répond,
 * pas le catalogue tenant par défaut.
 *
 * Chaîne de résolution :
 *   1. resolveActiveCampaign(phone)      → campagne la plus récemment contactée
 *   2. getCampaignConfig(tenantId, camp) → CampaignConfig actif (ou null)
 *   3. resolveCampaignProductInfo(...)   → { campaign, productInfo } ou null
 *
 * ⚠️ RÈGLE DE RÉSOLUTION MULTI-CAMPAGNE (documentée + testée) :
 *   Si un même numéro est associé à PLUSIEURS campagnes en même temps (rare mais
 *   possible), la campagne la plus RÉCEMMENT CONTACTÉE sur ce numéro l'emporte.
 *   Critère : OutboundLead.lastContactAt décroissant, puis updatedAt, puis createdAt.
 *
 * ⚠️ REPLI OBLIGATOIRE (zéro régression) :
 *   Toute fonction retourne null (jamais d'exception) si la campagne est
 *   introuvable, si aucun CampaignConfig actif n'existe, ou en cas d'erreur DB.
 *   null ⇒ l'orchestrateur retombe sur User.catalog (comportement d'avant).
 */

const OutboundLead   = require('../models/OutboundLead');
const CampaignConfig = require('../models/CampaignConfig');

/**
 * Instant de dernier contact d'un lead, avec repli déterministe.
 * lastContactAt > updatedAt > createdAt > 0.
 * @param {object} lead
 * @returns {number} timestamp ms
 */
function leadContactTime(lead) {
  const t = lead?.lastContactAt || lead?.updatedAt || lead?.createdAt || 0;
  const ms = new Date(t).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * PURE (testable sans DB) — parmi les leads d'un même numéro, retourne la campagne
 * la plus récemment contactée. Applique la règle de résolution multi-campagne.
 * @param {Array<object>} leads
 * @returns {string|null}
 */
function pickMostRecentCampaign(leads) {
  if (!Array.isArray(leads) || leads.length === 0) return null;
  let best = null;
  let bestTime = -Infinity;
  for (const lead of leads) {
    if (!lead?.campaign) continue;
    const t = leadContactTime(lead);
    if (t > bestTime) {
      bestTime = t;
      best = lead.campaign;
    }
  }
  return best;
}

/**
 * Résout la campagne active d'un numéro via l'index {phone, campaign} d'OutboundLead.
 * @param {string} phone
 * @returns {Promise<string|null>}
 */
async function resolveActiveCampaign(phone) {
  if (!phone) return null;
  try {
    const leads = await OutboundLead
      .find({ phone })
      .select('campaign lastContactAt updatedAt createdAt')
      .lean();
    return pickMostRecentCampaign(leads);
  } catch (err) {
    console.warn('[CAMPAIGN] resolveActiveCampaign error (repli tenant):', err.message);
    return null;
  }
}

/**
 * Récupère le CampaignConfig ACTIF d'un couple (tenant, campagne).
 * @param {string} tenantId
 * @param {string} campaign
 * @returns {Promise<object|null>} document lean ou null
 */
async function getCampaignConfig(tenantId, campaign) {
  if (!tenantId || !campaign) return null;
  try {
    return await CampaignConfig.findOne({ tenantId, campaign, active: true }).lean();
  } catch (err) {
    console.warn('[CAMPAIGN] getCampaignConfig error (repli tenant):', err.message);
    return null;
  }
}

/**
 * Point d'entrée orchestrateur : { campaign, productInfo } de la campagne à laquelle
 * ce numéro répond, ou null si aucune config spécifique → repli sur User.catalog.
 * Ne lève JAMAIS d'exception (garantie zéro régression).
 * @param {string} tenantId
 * @param {string} phone
 * @returns {Promise<{campaign:string, productInfo:object}|null>}
 */
async function resolveCampaignProductInfo(tenantId, phone) {
  try {
    const campaign = await resolveActiveCampaign(phone);
    if (!campaign) return null;

    const config = await getCampaignConfig(tenantId, campaign);
    if (!config || !config.productInfo) return null;

    return { campaign, productInfo: config.productInfo };
  } catch (err) {
    console.warn('[CAMPAIGN] resolveCampaignProductInfo error (repli tenant):', err.message);
    return null;
  }
}

module.exports = {
  leadContactTime,
  pickMostRecentCampaign,
  resolveActiveCampaign,
  getCampaignConfig,
  resolveCampaignProductInfo,
};
