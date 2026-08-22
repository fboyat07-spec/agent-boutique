'use strict';

/**
 * campaignConfigRoutes — écran "Campagnes" de la console.
 * ────────────────────────────────────────────────────────────────────────────
 * CRUD des CampaignConfig (fiche produit PAR campagne : pitch, argumentaire,
 * FAQ, tarifs, objections). Chaque campagne d'un tenant a sa propre fiche, au
 * lieu de dépendre du seul champ partagé user.agent_instructions.
 *
 *   GET  /api/campaigns?tenant_id=xxx              → liste (clé, actif, maj)
 *   GET  /api/campaigns/one?tenant_id=xxx&campaign=yyy → une config complète
 *   POST /api/campaigns                            → upsert (créer/éditer)
 *
 * Protégé par consoleAuth (même jeton partagé que le reste de la console :
 * /api/agent/*, /api/invoices/*).
 *
 * ADDITIF / ZÉRO RÉGRESSION : ne crée un CampaignConfig que sur action explicite
 * de Florian. Tant qu'aucune config n'existe pour une campagne (adele, nove,
 * agent_boutique…), campaignConfigService.resolveCampaignProductInfo renvoie
 * null et l'orchestrateur retombe sur user.catalog + agent_instructions — le
 * comportement d'avant, strictement inchangé.
 *
 * La campagne relance_facture (Phase 0-4) utilise déjà CampaignConfig : cet
 * écran ne fait que lui offrir une interface, sans toucher au mécanisme de
 * relance/réponse.
 */

const express = require('express');

const CampaignConfig = require('../models/CampaignConfig');
const consoleAuth = require('../middleware/consoleAuth');
const { normalizeCampaignConfigInput, validateCampaignKey } = require('../services/campaignAdminService');

const router = express.Router();

// ─── GET /api/campaigns?tenant_id=xxx — liste des campagnes d'un tenant ────────
router.get('/', consoleAuth, async (req, res) => {
  try {
    const { tenant_id } = req.query;
    if (!tenant_id) return res.status(400).json({ error: 'tenant_id requis' });

    const campaigns = await CampaignConfig
      .find({ tenantId: tenant_id })
      .select('campaign active updatedAt')
      .sort({ campaign: 1 })
      .lean();

    return res.json({ ok: true, campaigns, count: campaigns.length });
  } catch (err) {
    console.error('[CAMPAIGN CONFIG LIST ERROR]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/campaigns/one?tenant_id=xxx&campaign=yyy — une config complète ───
// Clé passée en query (et non en param d'URL) pour tolérer les clés libres
// contenant des caractères délicats sans encodage.
router.get('/one', consoleAuth, async (req, res) => {
  try {
    const { tenant_id, campaign } = req.query;
    if (!tenant_id) return res.status(400).json({ error: 'tenant_id requis' });
    if (!campaign)  return res.status(400).json({ error: 'campaign requis' });

    const config = await CampaignConfig
      .findOne({ tenantId: tenant_id, campaign })
      .lean();

    return res.json({ ok: true, config: config || null });
  } catch (err) {
    console.error('[CAMPAIGN CONFIG GET ERROR]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/campaigns — upsert (créer ou éditer) ───────────────────────────
// Reçoit { tenant_id, campaign, active, productInfo:{pitch,argumentaire,pricing,faq[],objections[]} }.
router.post('/', consoleAuth, async (req, res) => {
  try {
    const { tenant_id } = req.body;
    if (!tenant_id) return res.status(400).json({ error: 'tenant_id requis' });

    const norm = normalizeCampaignConfigInput(req.body);
    if (!norm.ok) return res.status(400).json({ error: norm.error });

    // Vérifier si la config existe déjà (pour distinguer création/édition)
    const exists = await CampaignConfig.findOne({ tenantId: tenant_id, campaign: norm.campaign }).lean();
    const isCreation = !exists;

    // Valider la clé de campagne (relance_facture est réservée)
    const validation = validateCampaignKey(norm.campaign, isCreation);
    if (!validation.ok) return res.status(400).json({ error: validation.error });

    const config = await CampaignConfig.findOneAndUpdate(
      { tenantId: tenant_id, campaign: norm.campaign },
      { $set: { active: norm.active, productInfo: norm.productInfo } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log(`[CAMPAIGN CONFIG] Upsert "${norm.campaign}" pour tenant ${tenant_id} (active=${norm.active})`);
    return res.json({ ok: true, config });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Conflit d\'unicité (tenant, campagne)' });
    }
    console.error('[CAMPAIGN CONFIG UPSERT ERROR]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
