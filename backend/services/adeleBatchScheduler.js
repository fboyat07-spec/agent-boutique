'use strict';

/**
 * Déclenchement en masse des séquences WhatsApp pour campaign: 'adele'.
 * ───────────────────────────────────────────────────────────────────
 * Cron dédié — lit OutboundLead{ campaign:'adele', status:'NEW' } par lots,
 * crée le WhatsAppSequence correspondant, envoie le J0.
 *
 * Curseur de progression : OutboundLead.status lui-même (NEW → CONTACTED / OPTED_OUT).
 * Persisté en base — un redémarrage serveur n'entraîne aucune perte : le prochain tick
 * requête simplement les documents encore à 'NEW'.
 *
 * Flag de pause : document Campaign{ name:'adele' } réutilisé comme document de contrôle
 * (paused: true par défaut — AUCUN envoi tant que POST /api/campaigns/adele/start
 * n'a pas été appelé explicitement).
 *
 * Ne modifie PAS /start-sequence — logique indépendante, réutilise seulement
 * isOptedOut/getTemplateName/sendTemplate exportés par routes/whatsapp.js.
 */

const cron = require('node-cron');

const OutboundLead      = require('../models/OutboundLead');
const WhatsAppSequence  = require('../models/WhatsAppSequence');
const Campaign          = require('../models/Campaign');

const { isOptedOut, getTemplateName, sendTemplate } = require('../routes/whatsapp');

// ─── Config ──────────────────────────────────────────────────────────────────

const CAMPAIGN = 'adele';

// Palier Meta confirmé (WhatsApp Manager) : 250 conversations lancées par l'entreprise / 24h.
// 5 x 48 ticks/jour = 240 msg/24h max, sous le palier avec marge de sécurité.
const DEFAULT_BATCH_SIZE   = 5;
const DEFAULT_INTERVAL_MIN = 30;

const BATCH_SIZE = parseInt(process.env.ADELE_BATCH_SIZE, 10) || DEFAULT_BATCH_SIZE;

let INTERVAL_MINUTES = parseInt(process.env.ADELE_BATCH_INTERVAL_MINUTES, 10) || DEFAULT_INTERVAL_MIN;
if (INTERVAL_MINUTES < 1 || INTERVAL_MINUTES > 59) {
  console.warn(`[ADELE BATCH] ADELE_BATCH_INTERVAL_MINUTES=${INTERVAL_MINUTES} hors plage (1-59) — fallback sur ${DEFAULT_INTERVAL_MIN}`);
  INTERVAL_MINUTES = DEFAULT_INTERVAL_MIN;
}

const MS_3_DAYS = 3 * 24 * 60 * 60 * 1000;
const MS_7_DAYS = 7 * 24 * 60 * 60 * 1000;

// ─── Helper : masquage téléphone pour logs partagés ──────────────────────────

function maskPhone(phone) {
  if (!phone || phone.length < 6) return '***';
  return phone.slice(0, 4) + '*'.repeat(Math.max(phone.length - 6, 3)) + phone.slice(-2);
}

// ─── Document de contrôle (flag de pause) ────────────────────────────────────

/**
 * Récupère le document de contrôle Campaign{name:'adele'}, le crée s'il n'existe pas.
 * ⚠️ paused: true au premier insert — sécurité par défaut, aucun envoi tant que
 * /api/campaigns/adele/start n'a pas été appelé explicitement.
 */
async function getControlDoc() {
  return Campaign.findOneAndUpdate(
    { name: CAMPAIGN },
    {
      $setOnInsert: {
        name: CAMPAIGN,
        segment: 'other',   // champ requis par le schéma Campaign — non pertinent ici,
        region: 'n/a',      // ce document sert de flag de contrôle, pas d'une vraie
                             // campagne segmentée par métier/région.
        active: true,
        paused: true,
        description: "Document de contrôle du batch scheduler pour campaign='adele' " +
                      "(réutilisation du modèle Campaign, cf. conception validée — " +
                      "pas un segment/région marketing réel).",
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

// ─── Tick principal ───────────────────────────────────────────────────────────

async function runAdeleBatchTick() {
  const now = new Date();
  console.log('[ADELE BATCH] Tick —', now.toISOString());

  const control = await getControlDoc();
  if (control.paused) {
    console.log('[ADELE BATCH] En pause (Campaign.paused=true) — aucun traitement ce tick. ' +
                'POST /api/campaigns/adele/start pour activer.');
    return;
  }

  const batch = await OutboundLead.find({ campaign: CAMPAIGN, status: 'NEW' }).limit(BATCH_SIZE);

  if (batch.length === 0) {
    console.log('[ADELE BATCH] Aucun prospect NEW à traiter.');
    return;
  }

  let sent = 0, optedOut = 0, failed = 0;

  for (const lead of batch) {
    // Aligné sur le format WhatsAppSequence.to / Conversation.phone (sans '+')
    const to = (lead.phone || '').replace('+', '');
    const masked = maskPhone(to);

    try {
      // ⚠️ Opt-out vérifié AVANT toute création de séquence ou tout envoi.
      if (await isOptedOut(to)) {
        await OutboundLead.updateOne(
          { _id: lead._id },
          { status: 'OPTED_OUT' },
          { runValidators: true }
        );
        optedOut++;
        console.log(`[ADELE BATCH] Skip (opted_out) → ${masked}`);
        continue;
      }

      const j3_date = new Date(now.getTime() + MS_3_DAYS);
      const j7_date = new Date(now.getTime() + MS_7_DAYS);
      // OutboundLead.name = "dirigeant" du CSV source (nom complet ou vide) —
      // PAS un prénom isolé. Conservé tel quel pour cohérence avec le J0 actuel,
      // qui envoie déjà ce champ tel quel comme variable de template.
      const prenom = lead.name || '';

      // campaign explicite dans l'objet upserté — ne dépend PAS du default du schéma
      // (c'est exactement le bug identifié dans /start-sequence pour ce cas d'usage).
      await WhatsAppSequence.findOneAndUpdate(
        { to, campaign: CAMPAIGN },
        {
          to,
          campaign: CAMPAIGN,
          prenom,
          tenant_id: 'default',
          status: 'active',
          step: 'j0',
          startDate: now,
          j3_date,
          j7_date,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      // Confirmé : le template Meta 'produit_prise_de_contact' n'a AUCUNE variable
      // dans son texte (contenu rédigé sans {{1}}). Appel SANS component — sendTemplate()
      // gère nativement ce cas (variables par défaut = [], components: [] en interne).
      await sendTemplate(to, getTemplateName(CAMPAIGN, 'j0'));

      await OutboundLead.updateOne(
        { _id: lead._id },
        { status: 'CONTACTED', lastContactAt: now },
        { runValidators: true }
      );
      sent++;
      console.log(`[ADELE BATCH] J0 envoyé → ${masked}`);

    } catch (err) {
      // Échec (Meta API, réseau...) → status reste 'NEW', retry au prochain tick.
      failed++;
      console.error(`[ADELE BATCH] Échec envoi → ${masked} | ${err.message}`);
    }
  }

  console.log(
    `[ADELE BATCH] Tick terminé — traités: ${batch.length} | envoyés: ${sent} | ` +
    `opted-out: ${optedOut} | échoués: ${failed}`
  );
}

// ─── Démarrage du cron ─────────────────────────────────────────────────────────

function startAdeleBatchScheduler() {
  const cronExpr = `*/${INTERVAL_MINUTES} * * * *`;
  cron.schedule(cronExpr, () => {
    runAdeleBatchTick().catch(err => {
      console.error('[ADELE BATCH] Erreur fatale du tick:', err.message);
    });
  });
  console.log(
    `[ADELE BATCH] Scheduler démarré — toutes les ${INTERVAL_MINUTES} min, ` +
    `lots de ${BATCH_SIZE} (~${Math.round((BATCH_SIZE * 60) / INTERVAL_MINUTES)} msg/h)`
  );
}

module.exports = {
  startAdeleBatchScheduler,
  runAdeleBatchTick,
  getControlDoc,
  maskPhone,
};
