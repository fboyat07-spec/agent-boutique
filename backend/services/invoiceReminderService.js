'use strict';

/**
 * invoiceReminderService — logique pure de déclenchement des relances de facture.
 * ──────────────────────────────────────────────────────────────────────────────
 * Aucune dépendance Mongo/réseau ici — entièrement testable en isolation.
 * Utilisée par services/invoiceReminderScheduler.js (le cron lui-même).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// Ordre = progression de la campagne. Chaque étape ne peut être déclenchée que
// pour une facture dont le statut actuel est STRICTEMENT antérieur (jamais de
// régression, jamais de re-déclenchement d'une étape déjà envoyée).
const STATUS_INDEX = {
  'pending':             0,
  'reminder_sent_j-3':   1,
  'reminder_sent_j+1':   2,
  'reminder_sent_j+10':  3,
  'reminder_sent_j+20':  4,
};

// paid/disputed : états terminaux — plus aucune relance possible, quel que soit
// l'écart avec dueDate (vérifié explicitement, pas seulement via STATUS_INDEX).
const TERMINAL_STATUSES = ['paid', 'disputed'];

// WHITELIST — seuls ces statuts autorisent l'automatisation. C'est exactement
// l'ensemble des clés de STATUS_INDEX (pending + reminder_sent_j*). Toute facture
// dont le statut sort de cette chaîne (paid, disputed, payment_claimed, delayed,
// ou tout statut futur/inconnu) DOIT arrêter l'automatisation. Approche par
// liste blanche plutôt que noire : un nouveau statut ajouté à Invoice sans
// mise à jour ici est traité comme "arrêt" par défaut (fail-safe), pas comme
// "pending" (ce qui relancerait à tort — le bug corrigé en Phase 4).
const REMINDER_CHAIN_STATUSES = Object.keys(STATUS_INDEX);

const REMINDER_STEPS = [
  // J-3 avant l'échéance : seule étape avec une borne haute (doit être envoyée
  // AVANT dueDate — sinon une facture déjà en retard importée via CSV recevrait
  // à tort un message "votre facture arrive à échéance").
  { statusIndex: 1, offsetDays: -3, templateStep: 'j-3',  newStatus: 'reminder_sent_j-3',  mustBeBeforeDueDate: true  },
  { statusIndex: 2, offsetDays: 1,  templateStep: 'j+1',  newStatus: 'reminder_sent_j+1',  mustBeBeforeDueDate: false },
  { statusIndex: 3, offsetDays: 10, templateStep: 'j+10', newStatus: 'reminder_sent_j+10', mustBeBeforeDueDate: false },
  // J+20 ("dernière relance") : contrairement à tous les autres seuils — qui
  // restent atteignables directement dès le tout premier envoi, même si la
  // facture est déjà très en retard (import CSV historique) — ce template ne
  // peut JAMAIS être le premier message envoyé. requiredStatusIndex impose que
  // le statut actuel soit EXACTEMENT reminder_sent_j+10 (pas seulement
  // "antérieur à j+20") : une facture 'pending' à 25 jours de retard reçoit
  // donc j+10 d'abord ; j+20 ne partira qu'au passage suivant si toujours
  // impayée à ce moment-là.
  { statusIndex: 4, offsetDays: 20, templateStep: 'j+20', newStatus: 'reminder_sent_j+20', mustBeBeforeDueDate: false, requiredStatusIndex: 3 },
];

/**
 * Détermine LA relance à envoyer pour une facture à l'instant `now`, ou null
 * si rien n'est dû.
 *
 * Ne renvoie jamais plus d'une étape par appel : si plusieurs seuils sont déjà
 * dépassés simultanément (ex: facture déjà très en retard importée via CSV, ou
 * cron resté arrêté longtemps), on saute directement à l'étape la PLUS AVANCÉE
 * due, sans repasser par les étapes intermédiaires devenues obsolètes — cela
 * évite d'envoyer plusieurs messages WhatsApp au même client dans un seul tick.
 *
 * Exception à ce saut direct : J+20 ("dernière relance") exige que le statut
 * actuel soit EXACTEMENT reminder_sent_j+10 (cf. REMINDER_STEPS.requiredStatusIndex)
 * — il ne peut jamais être le tout premier message envoyé à une facture.
 *
 * @param {{status:string, dueDate:Date|string}} invoice
 * @param {Date} now
 * @returns {{templateStep:string, newStatus:string}|null}
 */
function resolveDueReminderStep(invoice, now = new Date()) {
  if (!invoice) return null;

  // Fail-safe : n'automatise QUE les statuts de la chaîne de relance connue.
  // Couvre paid/disputed (terminaux), payment_claimed/delayed (Phase 4) et tout
  // statut inconnu — tous arrêtent l'automatisation. TERMINAL_STATUSES est
  // désormais un sous-ensemble redondant, conservé pour l'export/compat.
  if (!REMINDER_CHAIN_STATUSES.includes(invoice.status)) return null;

  const dueDate = new Date(invoice.dueDate);
  if (Number.isNaN(dueDate.getTime())) return null;

  const currentIndex = STATUS_INDEX[invoice.status] ?? 0;
  const nowMs = now.getTime();

  for (let i = REMINDER_STEPS.length - 1; i >= 0; i--) {
    const step = REMINDER_STEPS[i];

    if (step.requiredStatusIndex !== undefined) {
      // Étape plafonnée (J+20) : éligible SEULEMENT si le statut actuel est
      // exactement celui requis — jamais un saut direct depuis un statut antérieur.
      if (currentIndex !== step.requiredStatusIndex) continue;
    } else if (step.statusIndex <= currentIndex) {
      continue; // déjà envoyée ou dépassée
    }

    const triggerTime = dueDate.getTime() + step.offsetDays * DAY_MS;
    if (nowMs < triggerTime) continue; // pas encore due

    if (step.mustBeBeforeDueDate && nowMs >= dueDate.getTime()) continue; // J-3 uniquement avant échéance

    return { templateStep: step.templateStep, newStatus: step.newStatus };
  }
  return null;
}

/**
 * Normalise un numéro E.164 (avec '+', format Invoice.clientPhone) au format
 * utilisé par le webhook WhatsApp entrant (message.from, sans '+') — même
 * format que Conversation.phone / WhatsAppSequence.to.
 *
 * Critique pour la dépendance Phase 0 : campaignConfigService.resolveActiveCampaign()
 * reçoit `phone` directement depuis message.from (sans '+') et interroge
 * OutboundLead.find({phone}) par égalité stricte. Si OutboundLead.phone était
 * écrit avec le '+' (format Invoice brut), la résolution de campagne à la
 * réponse du client échouerait silencieusement — c'est exactement ce que ce
 * helper évite.
 */
function normalizeOutboundPhone(clientPhoneE164) {
  return String(clientPhoneE164 || '').replace(/^\+/, '');
}

module.exports = {
  resolveDueReminderStep,
  normalizeOutboundPhone,
  REMINDER_STEPS,
  STATUS_INDEX,
  TERMINAL_STATUSES,
  REMINDER_CHAIN_STATUSES,
  DAY_MS,
};
