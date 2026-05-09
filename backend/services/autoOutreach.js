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

/**
 * Génère un message d'accroche naturel via GPT-4o.
 * Aucun lien de paiement dans ce premier contact.
 */
async function generateOutreachMessage(prospectName) {
  const agentName = process.env.AGENT_FIRST_NAME || 'Alex';
  try {
    const res = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 120,
      temperature: 0.8,
      messages: [
        {
          role: 'system',
          content: `Tu es ${agentName}, assistant commercial pour Agent Boutique.
Tu rédiges des messages WhatsApp d'accroche courts, naturels et non intrusifs pour des commerçants français.
Règles absolues :
- Maximum 3 phrases
- Pas de lien de paiement ni de tarif
- Ton chaleureux et direct
- Terminer par une question ouverte courte`
        },
        {
          role: 'user',
          content: `Rédige un message d'accroche WhatsApp pour ce commerce : "${prospectName}".
Présente-toi brièvement, explique que tu aides les boutiques à automatiser leur relation client via WhatsApp avec l'IA, et pose une question pour engager la conversation.`
        }
      ]
    });
    return res.choices[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error('[AUTO OUTREACH] GPT-4o error:', err.message);
    const agentName = process.env.AGENT_FIRST_NAME || 'Alex';
    return `Bonjour ${prospectName} 👋 Je suis ${agentName} d'Agent Boutique. J'aide les commerces comme le vôtre à automatiser leur relation client via WhatsApp avec l'IA — ça vous intéresse d'en savoir plus ?`;
  }
}

/**
 * Envoie un message d'accroche WhatsApp à un prospect et met à jour son statut.
 *
 * @param {object} prospect - Document Mongoose Prospect
 * @returns {Promise<string|null>} Le message envoyé, ou null si échec
 */
async function sendOutreach(prospect) {
  console.log('[AUTO OUTREACH] Démarrage pour:', prospect.name, prospect.phone);

  const message = await generateOutreachMessage(prospect.name);
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
