'use strict';

const OpenAI = require('openai');
const { sendWhatsAppMessage } = require('./messageSender');
const Prospect = require('../models/Prospect');

let _openai = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

/** Diffuse un événement SSE à tous les clients connectés (si la console SSE est active). */
function broadcastSSE(eventType, payload) {
  const clients = global._consoleSseClients;
  if (!clients || clients.size === 0) return;
  const data = JSON.stringify({ type: eventType, time: new Date().toISOString(), ...payload });
  for (const client of clients) {
    try { client.write(`data: ${data}\n\n`); } catch { /* client déconnecté */ }
  }
}

// ─── Prompts par campagne ─────────────────────────────────────────────────────
const DEFAULT_CAMPAIGN = 'agent_boutique';

const SYSTEM_PROMPTS = {
  agent_boutique: agentName => `Tu es ${agentName}, assistant commercial pour Agent Boutique.
Tu rédiges des messages WhatsApp d'accroche courts, naturels et non intrusifs pour des commerçants français.
Règles absolues :
- Maximum 3 phrases
- Pas de lien de paiement ni de tarif
- Ton chaleureux et direct
- Terminer par une question ouverte courte`,

  adele: agentName => `Tu es ${agentName}. Tu contactes des professionnels indépendants français (kinésithérapeutes, ostéopathes, salons de coiffure, instituts de beauté, coachs/formateurs, artisans du dépannage) pour leur recommander Adèle, une réceptionniste IA.
Adèle répond à leur place sur WhatsApp/SMS quand ils sont occupés (avec un client, en intervention, en séance), prend les rendez-vous et qualifie les demandes.
Tu rédiges des messages WhatsApp d'accroche courts, directs, sans blabla commercial, pour ces professionnels français.
Règles absolues :
- Maximum 3 phrases
- Pas de lien de paiement ni de tarif
- Pas de pitch complet — juste une question d'accroche courte
- Ton direct
- Terminer par une question ouverte courte`,
};

const USER_PROMPTS = {
  agent_boutique: prospectName => `Rédige un message d'accroche WhatsApp pour ce commerce : "${prospectName}".
Présente-toi brièvement, explique que tu aides les boutiques à automatiser leur relation client via WhatsApp avec l'IA, et pose une question pour engager la conversation.`,

  adele: prospectName => `Rédige un message d'accroche WhatsApp pour ce professionnel indépendant : "${prospectName}".
Évoque le fait de rater des appels ou demandes pendant qu'il est occupé avec un client (mains prises, impossible de décrocher), sans détailler toute la solution, et pose une question courte pour engager la conversation.`,
};

const FALLBACK_MESSAGES = {
  agent_boutique: (prospectName, agentName) =>
    `Bonjour ${prospectName} 👋 Je suis ${agentName} d'Agent Boutique. J'aide les commerces comme le vôtre à automatiser leur relation client via WhatsApp avec l'IA — ça vous intéresse d'en savoir plus ?`,

  adele: (prospectName, agentName) =>
    `Bonjour ${prospectName} 👋 Je suis ${agentName}. Ça vous arrive de rater des appels pendant que vous êtes avec un client ? Je voulais vous parler d'Adèle, une réceptionniste IA qui répond à votre place — ça vous intéresse ?`,
};

/**
 * Génère un message d'accroche naturel via GPT-4o.
 * Aucun lien de paiement dans ce premier contact.
 * @param {string} prospectName
 * @param {string} [campaign] - 'agent_boutique' (défaut) ou 'adele'
 */
async function generateOutreachMessage(prospectName, campaign = DEFAULT_CAMPAIGN) {
  const agentName = process.env.AGENT_FIRST_NAME || 'Alex';
  const key = SYSTEM_PROMPTS[campaign] ? campaign : DEFAULT_CAMPAIGN;
  if (!SYSTEM_PROMPTS[campaign]) {
    console.warn(`[AUTO OUTREACH] Campagne inconnue "${campaign}" — fallback sur "${DEFAULT_CAMPAIGN}"`);
  }
  try {
    const res = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 120,
      temperature: 0.8,
      messages: [
        { role: 'system', content: SYSTEM_PROMPTS[key](agentName) },
        { role: 'user', content: USER_PROMPTS[key](prospectName) }
      ]
    });
    return res.choices[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error('[AUTO OUTREACH] GPT-4o error:', err.message);
    return FALLBACK_MESSAGES[key](prospectName, agentName);
  }
}

/**
 * Envoie un message d'accroche WhatsApp à un prospect et met à jour son statut.
 *
 * @param {object} prospect - Document Mongoose Prospect
 * @returns {Promise<string|null>} Le message envoyé, ou null si échec
 */
async function sendOutreach(prospect) {
  console.log('[AUTO OUTREACH] Démarrage pour:', prospect.name, prospect.phone, '| campagne:', prospect.campaign);

  const message = await generateOutreachMessage(prospect.name, prospect.campaign);
  if (!message) {
    console.error('[AUTO OUTREACH] Impossible de générer le message pour', prospect.name);
    return null;
  }

  try {
    // tenant_id null → messageSender bascule sur les env vars WhatsApp globales
    await sendWhatsAppMessage(prospect.phone, message, null);

    await Prospect.findByIdAndUpdate(prospect._id, {
      whatsappSent: true,
      status: 'contacted',
    });

    console.log('[AUTO OUTREACH] Envoyé à', prospect.name, ':', message.slice(0, 60));

    broadcastSSE('outreach', {
      message: `[OUTREACH] → ${prospect.name} (${prospect.phone}): ${message.slice(0, 80)}`,
      prospect: { name: prospect.name, phone: prospect.phone },
    });

    return message;
  } catch (err) {
    console.error('[AUTO OUTREACH] Erreur envoi WhatsApp:', err.message);
    return null;
  }
}

module.exports = { sendOutreach };
