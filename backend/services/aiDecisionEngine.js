const OpenAI = require('openai');

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function decideAction({ lead, message }) {
  try {
    const prompt = `
Tu es un directeur commercial IA autonome.

OBJECTIF :
Maximiser les conversions.

CONTEXTE :
- Statut: ${lead.status}
- Score: ${lead.score || 0}
- Business: ${lead.business}
- Message: "${message}"

ANALYSE :
- Niveau d'intérêt
- Probabilité de conversion
- Urgence

DÉCIDE UNE ACTION :
- reply_now
- wait
- follow_up
- send_payment

RÈGLE :
Optimise conversion, pas discussion.

Répond uniquement avec l'action.
`;

    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    });

    return res.choices[0].message.content.trim();

  } catch (e) {
    console.log('[AI DECISION ERROR]', e.message);
    return 'reply_now';
  }
}

module.exports = { decideAction };
