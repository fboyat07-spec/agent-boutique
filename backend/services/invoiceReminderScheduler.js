'use strict';

/**
 * Séquenceur de relances pour la campagne "relance_facture".
 * ────────────────────────────────────────────────────────────────────────────
 * Adapte le moteur cron J0/J3/J7 existant (routes/whatsapp.js) à un
 * déclenchement basé sur l'échéance de chaque facture plutôt que sur un point
 * de départ fixe. Réutilise tel quel isOptedOut / getTemplateName /
 * sendTemplate / buildTemplateVariables exportés par routes/whatsapp.js — même
 * principe que services/adeleBatchScheduler.js pour la campagne 'adele'.
 *
 * Persistance : PAS de nouveau document de séquence par facture. Invoice.status
 * (pending → reminder_sent_j-3 → j+1 → j+10 → j+20 → paid/disputed) EST déjà
 * l'état d'avancement — créer un WhatsAppSequence par facture dupliquerait un
 * état déjà porté par Invoice, ce qui est explicitement à éviter.
 *
 * Dépendance Phase 0 : campaignConfigService résout la campagne active d'un
 * numéro via l'index {phone, campaign} d'OutboundLead, pas Invoice. Chaque
 * envoi de relance upsert donc un OutboundLead{phone, campaign:'relance_facture'}
 * — sans quoi une réponse du client à cette relance ne serait pas résolue vers
 * le bon CampaignConfig (elle retomberait sur une autre campagne active pour ce
 * numéro, ou sur le catalogue tenant par défaut).
 *
 * Flag de pause : Campaign{name:'relance_facture'} — même pattern que
 * adeleBatchScheduler pour 'adele' (paused:true par défaut, activation
 * explicite requise via /api/campaigns/relance_facture/start).
 */

const cron = require('node-cron');

const Invoice      = require('../models/Invoice');
const OutboundLead  = require('../models/OutboundLead');
const Campaign      = require('../models/Campaign');

const { isOptedOut, getTemplateName, sendTemplate, buildTemplateVariables } = require('../routes/whatsapp');
const { resolveDueReminderStep, normalizeOutboundPhone } = require('./invoiceReminderService');

const CAMPAIGN = 'relance_facture';

const DEFAULT_INTERVAL_MIN = 30;
let INTERVAL_MINUTES = parseInt(process.env.INVOICE_REMINDER_INTERVAL_MINUTES, 10) || DEFAULT_INTERVAL_MIN;
if (INTERVAL_MINUTES < 1 || INTERVAL_MINUTES > 59) {
  console.warn(`[INVOICE REMINDER] INVOICE_REMINDER_INTERVAL_MINUTES=${INTERVAL_MINUTES} hors plage (1-59) — fallback sur ${DEFAULT_INTERVAL_MIN}`);
  INTERVAL_MINUTES = DEFAULT_INTERVAL_MIN;
}

// Statuts sur lesquels plus rien ne peut jamais être envoyé — exclus de la
// requête pour ne pas rescanner indéfiniment des factures figées à chaque tick.
// payment_claimed/delayed (Phase 4) y figurent : dès que le client a répondu, la
// séquence est suspendue en attente de vérification humaine. Filet de sécurité
// redondant : resolveDueReminderStep arrête déjà tout statut hors chaîne.
const NON_ACTIONABLE_STATUSES = ['paid', 'disputed', 'reminder_sent_j+20', 'payment_claimed', 'delayed'];

function maskPhone(phone) {
  if (!phone || phone.length < 6) return '***';
  return phone.slice(0, 4) + '*'.repeat(Math.max(phone.length - 6, 3)) + phone.slice(-2);
}

/**
 * Récupère le document de contrôle Campaign{name:'relance_facture'}, le crée
 * s'il n'existe pas. paused:true au premier insert — sécurité par défaut,
 * aucun envoi tant que /api/campaigns/relance_facture/start n'a pas été
 * appelé explicitement (même garde-fou que 'adele').
 */
async function getControlDoc() {
  return Campaign.findOneAndUpdate(
    { name: CAMPAIGN },
    {
      $setOnInsert: {
        name: CAMPAIGN,
        segment: 'other', // champ requis par le schéma Campaign — non pertinent ici,
        region: 'n/a',    // ce document sert de flag de contrôle, pas d'une vraie
                            // campagne segmentée par métier/région (même réutilisation qu'adele).
        active: true,
        paused: true,
        description: "Document de contrôle du scheduler relance_facture (réutilisation du " +
                      "modèle Campaign comme flag de pause — même pattern qu'adeleBatchScheduler).",
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

// ─── Tick principal ───────────────────────────────────────────────────────────

async function runInvoiceReminderTick() {
  const now = new Date();
  console.log('[INVOICE REMINDER] Tick —', now.toISOString());

  const control = await getControlDoc();
  if (control.paused) {
    console.log('[INVOICE REMINDER] En pause (Campaign.paused=true) — aucun traitement ce tick. ' +
                'POST /api/campaigns/relance_facture/start pour activer.');
    return;
  }

  const candidates = await Invoice.find({ status: { $nin: NON_ACTIONABLE_STATUSES } });

  let sent = 0, skippedOptOut = 0, skippedNotDue = 0, failed = 0;

  for (const invoice of candidates) {
    const step = resolveDueReminderStep(invoice, now);
    if (!step) { skippedNotDue++; continue; }

    // Voir invoiceReminderService.normalizeOutboundPhone : Invoice.clientPhone
    // est en E.164 (avec '+'), mais OutboundLead.phone doit matcher le format
    // du webhook entrant (sans '+') pour que la résolution de campagne Phase 0
    // fonctionne à la réponse du client.
    const to = normalizeOutboundPhone(invoice.clientPhone);
    const masked = maskPhone(to);

    try {
      // ⚠️ Statut re-vérifié via resolveDueReminderStep() qui lit invoice.status
      // à chaque itération de CE tick (candidates chargés une fois en début de
      // tick) — jamais de renvoi si déjà 'paid'/'disputed' (exclus de la requête
      // ET de TERMINAL_STATUSES dans resolveDueReminderStep).
      if (await isOptedOut(to)) {
        skippedOptOut++;
        console.log(`[INVOICE REMINDER] Skip (opted_out) → ${masked} | facture ${invoice.invoiceNumber}`);
        continue;
      }

      await sendTemplate(
        to,
        getTemplateName(CAMPAIGN, step.templateStep),
        buildTemplateVariables(CAMPAIGN, invoice.clientName)
      );

      await Invoice.updateOne({ _id: invoice._id }, { status: step.newStatus });

      // Dépendance Phase 0 (cf. en-tête du fichier) : sans cet upsert, une
      // réponse du client à cette relance ne serait pas résolue vers le
      // CampaignConfig relance_facture.
      await OutboundLead.findOneAndUpdate(
        { phone: to, campaign: CAMPAIGN },
        {
          phone:         to,
          campaign:      CAMPAIGN,
          name:          invoice.clientName || 'Client',
          business:      'Facturation', // champ requis par le schéma, non pertinent pour ce flux
          status:        'CONTACTED',
          lastContactAt: now,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      sent++;
      console.log(`[INVOICE REMINDER] ${step.templateStep} envoyé → ${masked} | facture ${invoice.invoiceNumber} | statut → ${step.newStatus}`);
    } catch (err) {
      // Échec (Meta API, réseau...) → statut Invoice inchangé, retry au prochain tick.
      failed++;
      console.error(`[INVOICE REMINDER] Échec envoi (${step.templateStep}) → ${masked} | facture ${invoice.invoiceNumber} | ${err.message}`);
    }
  }

  console.log(
    `[INVOICE REMINDER] Tick terminé — candidates: ${candidates.length} | envoyés: ${sent} | ` +
    `opted-out: ${skippedOptOut} | non dues: ${skippedNotDue} | échoués: ${failed}`
  );
}

// ─── Démarrage du cron ─────────────────────────────────────────────────────────

function startInvoiceReminderScheduler() {
  const cronExpr = `*/${INTERVAL_MINUTES} * * * *`;
  cron.schedule(cronExpr, () => {
    runInvoiceReminderTick().catch(err => {
      console.error('[INVOICE REMINDER] Erreur fatale du tick:', err.message);
    });
  });
  console.log(`[INVOICE REMINDER] Scheduler démarré — toutes les ${INTERVAL_MINUTES} min`);
}

module.exports = {
  startInvoiceReminderScheduler,
  runInvoiceReminderTick,
  getControlDoc,
  maskPhone,
};
