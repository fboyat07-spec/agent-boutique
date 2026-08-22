'use strict';

/**
 * invoiceReplyService — logique PURE de traitement d'une réponse client à une
 * relance de facture (campagne relance_facture, Phase 4).
 * ────────────────────────────────────────────────────────────────────────────
 * Aucune dépendance Mongo/réseau/LLM ici — entièrement testable en isolation.
 * L'appel au LLM de classification et l'application (DB, notif) vivent dans
 * l'orchestrateur ; ce module fournit :
 *   - la liste des catégories,
 *   - le prompt de classification (prudence maximale),
 *   - le mapping catégorie → action (statut, suspension, notif humaine, réponse).
 *
 * Principe directeur (coût d'erreur élevé) : en cas de doute, TOUJOURS suspendre
 * l'automatisation + notifier un humain plutôt que de continuer à relancer.
 */

// Les 5 catégories de réponse client. `general_question` est la SEULE qui ne
// suspend pas la séquence et ne notifie pas d'humain (réponse informative simple).
const INVOICE_REPLY_CATEGORIES = [
  'payment_claimed', // le client affirme avoir payé
  'disputed',        // le client conteste le montant / signale un litige
  'delayed',         // le client demande un délai de paiement
  'general_question',// question sans rapport avec le paiement lui-même
  'unclear',         // message vide / incompréhensible / ambigu
];

// Réponses NEUTRES et fixes (pas de génération LLM) pour les catégories qui
// suspendent : garantit qu'on n'accuse jamais le client et qu'on ne promet rien.
// Un humain prend le relais derrière.
const NEUTRAL_REPLIES = {
  payment_claimed: 'Merci pour votre retour, c\'est bien noté. Je transmets à notre équipe qui vérifie et revient vers vous. Bonne journée !',
  disputed:        'Merci pour votre message. Je le transmets à notre équipe qui va regarder cela et vous recontacter rapidement.',
  delayed:         'Merci pour votre retour, c\'est noté. Un membre de notre équipe revient vers vous pour confirmer.',
  unclear:         'Merci pour votre message. Je le transmets à notre équipe qui vous répondra rapidement.',
};

// Mapping catégorie → action. `newStatus: null` = ne change pas le statut facture.
// `suspendsAutomation` est une conséquence du statut (via la whitelist de
// invoiceReminderService) — exposé ici pour être asserté explicitement en test.
const OUTCOME_BY_CATEGORY = {
  payment_claimed:  { newStatus: 'payment_claimed', suspendsAutomation: true,  notifyHuman: true,  replyKind: 'neutral'     },
  disputed:         { newStatus: 'disputed',        suspendsAutomation: true,  notifyHuman: true,  replyKind: 'neutral'     },
  delayed:          { newStatus: 'delayed',         suspendsAutomation: true,  notifyHuman: true,  replyKind: 'neutral'     },
  general_question: { newStatus: null,              suspendsAutomation: false, notifyHuman: false, replyKind: 'informative' },
  unclear:          { newStatus: null,              suspendsAutomation: false, notifyHuman: true,  replyKind: 'neutral'     },
};

/**
 * Mapping pur catégorie → action à appliquer. Toute catégorie inconnue est
 * traitée comme 'unclear' (fail-safe : notif humaine, aucun changement de statut).
 * @param {string} category
 * @returns {{category:string, newStatus:string|null, suspendsAutomation:boolean, notifyHuman:boolean, replyKind:string, neutralReply:string|null}}
 */
function resolveInvoiceReplyOutcome(category) {
  const known = OUTCOME_BY_CATEGORY[category] ? category : 'unclear';
  const outcome = OUTCOME_BY_CATEGORY[known];
  return {
    category: known,
    newStatus: outcome.newStatus,
    suspendsAutomation: outcome.suspendsAutomation,
    notifyHuman: outcome.notifyHuman,
    replyKind: outcome.replyKind,
    neutralReply: outcome.replyKind === 'neutral' ? NEUTRAL_REPLIES[known] : null,
  };
}

/**
 * Prompt système du classifieur de réponse client à une relance de facture.
 * Volontairement séparé du classifieur commercial (nodeClassifyIntent) : le
 * contexte (facture impayée, pas prospection) et surtout le biais de PRUDENCE
 * sont différents. Exposé comme fonction pour être testé (présence des règles
 * de prudence) et audité facilement.
 */
function buildInvoiceReplyClassifierPrompt() {
  return [
    "Tu classes la réponse d'un CLIENT à une relance concernant une FACTURE impayée.",
    "Ce n'est PAS une conversation commerciale : n'essaie jamais de vendre quoi que ce soit.",
    '',
    'Réponds UNIQUEMENT avec un JSON {"category":"X","agreed_date":"Y"} où X est EXACTEMENT l\'une de :',
    '- payment_claimed : le client affirme avoir déjà payé, réglé, effectué le virement (même partiellement, même sans preuve).',
    '- disputed : le client conteste le montant, l\'existence de la facture, la prestation, ou signale une erreur / un litige.',
    '- delayed : le client demande un délai, dit qu\'il paiera plus tard, ou propose une date de règlement.',
    '- general_question : question SANS rapport avec le paiement lui-même (duplicata, coordonnées, horaires…), SANS contester ni annoncer de paiement ou de délai.',
    '- unclear : message vide, incompréhensible, hors-sujet total, ou dont le sens reste ambigu.',
    '',
    'RÈGLES DE PRUDENCE — le coût d\'une erreur est ÉLEVÉ (relancer quelqu\'un qui a déjà payé, ou accuser à tort un client) :',
    '1. Ne suppose JAMAIS la mauvaise foi du client.',
    '2. En cas de DOUTE entre general_question et l\'une de payment_claimed / disputed / delayed → choisis TOUJOURS payment_claimed, disputed ou delayed. Ne choisis general_question que si le message ne contient AUCUN signal de paiement, de contestation ou de délai.',
    '3. En cas de doute ENTRE plusieurs catégories de suspension, choisis celle du signal le plus explicite du message.',
    '4. Si le sens global du message reste incertain → unclear (jamais un statut de paiement supposé).',
    '5. agreed_date : renseigne une date UNIQUEMENT pour delayed si le client en mentionne une explicitement ; sinon chaîne vide "".',
    '',
    'Rappel : payment_claimed, disputed et delayed déclenchent une vérification humaine et STOPPENT toute relance automatique. En cas d\'hésitation, préfère toujours cette voie prudente plutôt que de laisser l\'automatisation continuer.',
  ].join('\n');
}

/**
 * Router de campagne (pur) — décide si une conversation entrante doit passer par
 * le traitement dédié relance_facture ou par le pipeline commercial existant.
 * Gate explicite : SEULE la campagne 'relance_facture' est déroutée ; toute
 * autre valeur (adele, nove, agent_boutique, null…) reste sur le flux commercial.
 * @param {string|null|undefined} campaign
 * @returns {'invoice_reply'|'commercial'}
 */
function routeByCampaign(campaign) {
  return campaign === 'relance_facture' ? 'invoice_reply' : 'commercial';
}

module.exports = {
  INVOICE_REPLY_CATEGORIES,
  NEUTRAL_REPLIES,
  OUTCOME_BY_CATEGORY,
  resolveInvoiceReplyOutcome,
  buildInvoiceReplyClassifierPrompt,
  routeByCampaign,
};
