const OpenAI = require('openai');
const { loadStrategy } = require('./aiStrategyMemory');

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function generateReply({ message, lead }) {
  try {
    const strategy = loadStrategy();

    const prompt = `
Tu es un closer expert en vente conversationnelle WhatsApp.

OBJECTIF :
Convertir le prospect en client de manière naturelle et efficace.

CONTEXTE BUSINESS :
- Type de business : ${lead.business || 'inconnu'}
- Localisation : ${lead.city || 'France'}
- Statut dans le funnel : ${lead.status}

ANALYSE À FAIRE AVANT DE RÉPONDRE :
1. Identifier l'intention du client (curiosité / intérêt / hésitation / objection / achat)
2. Adapter ton ton (direct, rassurant, engageant, persuasif)
3. Choisir une stratégie :
   - curiosité → engager
   - intérêt → qualifier
   - hésitation → rassurer
   - objection → répondre
   - prêt à acheter → closer

RÈGLES DE RÉPONSE :
- 1 à 2 phrases maximum
- Style humain (jamais robotique)
- Pas de blabla inutile
- Toujours orienté vers l'action
- Adapter au type de business (restaurant, coiffeur, garage, etc.)
- Si opportunité → proposer passage à l'action (paiement)

AGRESSIVITÉ COMMERCIALE : ${strategy.aggressiveness}

CONTEXTE CONVERSATION :
Message client :
"${message}"

Réponds uniquement par le message à envoyer.
`;

    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 150
    });

    return response.choices[0].message.content.trim();

  } catch (err) {
    console.log('[AI CLOSER ERROR]', err.message);
    return null;
  }
}

module.exports = { generateReply };
