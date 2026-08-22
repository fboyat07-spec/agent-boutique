'use strict';

/**
 * SEED one-shot — crée UNE FOIS la CampaignConfig 'relance_facture' pour un tenant.
 * ──────────────────────────────────────────────────────────────────────────────
 * Contourne volontairement la route POST /api/campaigns (bloquée en création pour
 * la clé réservée 'relance_facture' par campaignAdminService.validateCampaignKey)
 * en appelant directement le modèle CampaignConfig. Script MANUEL, à exécuter à la
 * main par Florian — PAS de seed automatique au démarrage du serveur.
 *
 * Contenu de départ volontairement MINIMAL — un brouillon :
 *   - pitch / argumentaire / pricing / objections : vides (pas de vente ici, la
 *     campagne relance_facture répond à des questions sur une facture, pas un pitch)
 *   - faq : 2-3 entrées génériques et neutres, à adapter par Florian
 * Florian doit relire et éditer ce contenu depuis l'écran Campagnes de la console
 * (édition autorisée : le document existe déjà, la garde de création ne s'applique
 * qu'à la CRÉATION, cf. campaignAdminService.validateCampaignKey).
 *
 * Usage :
 *   node scripts/seedRelanceFactureCampaignConfig.js <tenant_id>
 *
 * Idempotent : si le document existe déjà pour ce tenant, ne fait RIEN (log +
 * sortie propre) — ne récrit jamais un contenu déjà édité par Florian.
 */

const path = require('path');

if (!process.env.MONGODB_URI) {
  require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
}

const mongoose = require('mongoose');
const CampaignConfig = require('../models/CampaignConfig');

const CAMPAIGN = 'relance_facture';

const DRAFT_PRODUCT_INFO = {
  catalog: [],
  pitch: '',
  argumentaire: '',
  pricing: '',
  faq: [
    {
      question: 'J\'ai perdu ma facture, comment en obtenir un duplicata ?',
      reponse: 'Contactez notre équipe en répondant directement à ce message, en précisant le numéro de facture si vous l\'avez, et nous vous renverrons un duplicata.',
    },
    {
      question: 'Je conteste le montant de cette facture, que dois-je faire ?',
      reponse: 'Répondez à ce message en expliquant votre situation, un membre de l\'équipe reviendra vers vous pour clarifier le montant.',
    },
    {
      question: 'J\'ai une question qui n\'a rien à voir avec le paiement de cette facture.',
      reponse: 'Pas de souci, décrivez votre demande et nous la transmettrons à la bonne personne.',
    },
  ],
  objections: [],
};

async function main() {
  const tenantId = process.argv[2];
  if (!tenantId) {
    console.error('Usage: node scripts/seedRelanceFactureCampaignConfig.js <tenant_id>');
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI manquant — vérifier le .env');

  await mongoose.connect(uri);
  console.log('[MONGOOSE] connecté');

  try {
    const existing = await CampaignConfig.findOne({ tenantId, campaign: CAMPAIGN }).lean();
    if (existing) {
      console.log(`[SEED] CampaignConfig '${CAMPAIGN}' existe déjà pour tenant "${tenantId}" — rien à faire.`);
      console.log('       (édition possible depuis la console — écran Campagnes)');
      return;
    }

    const config = await CampaignConfig.create({
      tenantId,
      campaign: CAMPAIGN,
      active: true,
      productInfo: DRAFT_PRODUCT_INFO,
    });

    console.log(`[SEED] CampaignConfig '${CAMPAIGN}' créée pour tenant "${tenantId}" (id=${config._id}).`);
    console.log('       Brouillon générique — à relire et éditer depuis la console (écran Campagnes).');
  } finally {
    await mongoose.disconnect();
    console.log('[MONGOOSE] déconnecté');
  }
}

main().catch(err => {
  console.error('[SEED ERROR]', err.message);
  process.exit(1);
});
