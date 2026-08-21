'use strict';

/**
 * CampaignConfig — catalogue produit + discours PAR CAMPAGNE (et non par tenant).
 * ──────────────────────────────────────────────────────────────────────────────
 * Un tenant peut avoir un nombre ILLIMITÉ de campagnes simultanées, chacune avec
 * sa propre fiche produit. Ajouter une campagne = un simple insert en base
 * (jamais un déploiement de code, jamais un enum en dur).
 *
 * Résolution à la réponse entrante (voir campaignConfigService.js) :
 *   phone → campagne la plus récemment contactée → CampaignConfig{tenantId,campaign,active}
 *   → productInfo injecté dans le system prompt.
 *
 * Repli garanti : si AUCUN CampaignConfig actif n'existe pour la campagne résolue,
 * l'orchestrateur retombe sur User.catalog (comportement d'avant ce changement).
 */

const mongoose = require('mongoose');
const { ProductSchema } = require('./User');   // même sous-doc que User.catalog (réutilisé)

// Fiche produit d'une campagne. `catalog` réutilise EXACTEMENT ProductSchema (User),
// afin que l'injection dans buildSystemPrompt suive le même chemin de rendu que le
// catalogue tenant (aucune divergence de format possible).
const ProductInfoSchema = new mongoose.Schema({
  catalog:      { type: [ProductSchema], default: [] },  // nom produit, prix, stock, tailles…
  pitch:        { type: String, default: '' },
  argumentaire: { type: String, default: '' },
  faq:          { type: [{ question: String, reponse: String }], default: [] },
  objections:   { type: [{ objection: String, reponse: String }], default: [] },
  pricing:      { type: String, default: '' },
}, { _id: false });

const CampaignConfigSchema = new mongoose.Schema({
  tenantId:    { type: String, required: true, index: true },
  campaign:    { type: String, required: true, index: true },
  productInfo: { type: ProductInfoSchema, default: () => ({}) },
  active:      { type: Boolean, default: true, index: true },
}, {
  timestamps: true,
});

// Une seule config par (tenant, campagne) — même pattern d'unicité que OutboundLead/WhatsAppSequence.
CampaignConfigSchema.index({ tenantId: 1, campaign: 1 }, { unique: true });

module.exports = mongoose.model('CampaignConfig', CampaignConfigSchema);
