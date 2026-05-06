'use strict';

/**
 * AGENT BOUTIQUE — ORCHESTRATEUR AGENTIQUE v1.0
 * ------------------------------------------------
 * Architecture : Classify → Decide → Act
 *
 * Le flux séquentiel fixe (message → closingService → send) est remplacé
 * par un agent GPT-4 qui raisonne sur le contexte complet avant d'agir.
 *
 * Étapes :
 *  1. CLASSIFY  — GPT-4 analyse le message + historique → intent + stage
 *  2. DECIDE    — l'agent choisit quelle action exécuter (tool calling)
 *  3. ACT       — exécution de l'action choisie
 *  4. RESPOND   — génération de la réponse finale adaptée au contexte
 */

const OpenAI = require('openai');

// Services existants (inchangés — l'orchestrateur les pilote)
const { sendWhatsAppMessage } = require('./messageSender');
const { processLead }          = require('./closingService');
const { updateScore }          = require('./scoringService');
const { scheduleFollowUps }    = require('./followupService');

// Modèles MongoDB
const Conversation      = require('../models/Conversation');
const ProcessedMessage  = require('../models/ProcessedMessage');
const User              = require('../models/User');

// ─── Client OpenAI ────────────────────────────────────────────────────────────
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── OUTILS DISPONIBLES POUR L'AGENT ─────────────────────────────────────────
// L'agent GPT-4 choisit parmi ces tools selon le contexte du message.

const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'qualify_lead',
      description: 'Poser une question de qualification pour mieux comprendre le prospect (business, CA, besoins). Utiliser quand le prospect est nouveau ou qu\'on manque d\'info.',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'La question de qualification à poser' },
          focus: {
            type: 'string',
            enum: ['business_type', 'revenue', 'pain_point', 'decision_timeline'],
            description: 'Le point sur lequel se concentrer'
          }
        },
        required: ['question', 'focus']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'present_offer',
      description: 'Présenter l\'offre Agent Boutique avec les bénéfices adaptés au profil du prospect. Utiliser quand le prospect est qualifié et réceptif.',
      parameters: {
        type: 'object',
        properties: {
          pitch: { type: 'string', description: 'Le pitch personnalisé à envoyer' },
          include_price: { type: 'boolean', description: 'Inclure le prix dans ce message' }
        },
        required: ['pitch', 'include_price']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'handle_objection',
      description: 'Répondre à une objection (prix, besoin, timing, concurrence). Utiliser quand le prospect exprime un doute ou une résistance.',
      parameters: {
        type: 'object',
        properties: {
          objection_type: {
            type: 'string',
            enum: ['price', 'need', 'timing', 'trust', 'competitor', 'other'],
            description: 'Type d\'objection détecté'
          },
          response: { type: 'string', description: 'La réponse à l\'objection' }
        },
        required: ['objection_type', 'response']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'close_sale',
      description: 'Envoyer le lien de paiement et inviter à passer à l\'action. Utiliser uniquement quand le prospect a montré un intérêt fort et clair.',
      parameters: {
        type: 'object',
        properties: {
          closing_message: { type: 'string', description: 'Message de closing personnalisé' },
          urgency_trigger: {
            type: 'string',
            enum: ['none', 'limited_spots', 'time_offer', 'competitor_risk'],
            description: 'Levier d\'urgence à utiliser'
          }
        },
        required: ['closing_message', 'urgency_trigger']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'schedule_followup',
      description: 'Programmer un suivi automatique dans le futur. Utiliser quand le prospect n\'est pas prêt maintenant mais garde de l\'intérêt.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Message à envoyer lors du suivi' },
          delay_hours: { type: 'number', description: 'Délai en heures avant le suivi (ex: 24, 48, 72)' }
        },
        required: ['message', 'delay_hours']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'end_conversation',
      description: 'Clore poliment la conversation. Utiliser quand le prospect est clairement désintéressé ou hostile.',
      parameters: {
        type: 'object',
        properties: {
          farewell: { type: 'string', description: 'Message de clôture bienveillant' }
        },
        required: ['farewell']
      }
    }
  }
];

// ─── SYSTEM PROMPT DE L'AGENT ─────────────────────────────────────────────────

function buildSystemPrompt(user) {
  const paymentLink = process.env.SALES_PAYMENT_LINK || '[LIEN_PAIEMENT]';
  const storeName   = user?.store_name || 'Agent Boutique';

  return `Tu es un agent commercial IA expert en closing pour ${storeName}.
Tu aides des entrepreneurs et commerçants français à automatiser leurs ventes via WhatsApp avec de l'IA.

TON OBJECTIF : Convertir chaque prospect en client payant, avec empathie et sans pression excessive.

CONTEXTE PRODUIT :
- Agent Boutique automatise les réponses WhatsApp avec GPT-4
- Gain de temps : répond 24h/24 sans intervention humaine
- Augmente les conversions de 30 à 50% selon les secteurs
- Lien de paiement : ${paymentLink}

RÈGLES ABSOLUES :
1. Tu analyses TOUJOURS l'historique complet avant de répondre
2. Tu ne répètes JAMAIS une question déjà posée
3. Tu adaptes ton ton au profil du prospect (décontracté si eux décontractés, pro si pro)
4. Tu n'envoies le lien de paiement QUE si le prospect a montré un intérêt réel
5. Tes messages sont courts, percutants, en français courant (pas de jargon)
6. Maximum 2-3 phrases par message WhatsApp

STADES DU FUNNEL :
- new       → qualifier le business
- qualified → présenter l'offre
- interested → gérer les objections, avancer vers le closing
- closing   → envoyer le lien, créer de l'urgence
- won       → confirmer et onboarder
- lost      → clore poliment

Choisis l'outil le plus adapté au contexte. Ne fais qu'UNE seule action par message.`;
}

// ─── RÉCUPÉRATION DU CONTEXTE CONVERSATION ───────────────────────────────────

async function getConversationContext(phone, tenant_id) {
  try {
    const convo = await Conversation.findOne({ phone, tenant_id });
    if (!convo) return { stage: 'new', history: [], score: 0 };

    // Formater l'historique pour GPT-4 (10 derniers messages max)
    const history = (convo.messages || [])
      .slice(-10)
      .map(m => ({
        role: m.sender === phone ? 'user' : 'assistant',
        content: m.content
      }));

    return {
      stage:   convo.stage || 'new',
      history,
      score:   convo.score || 0,
      name:    convo.name || null,
      business: convo.business || null
    };
  } catch (err) {
    console.warn('[ORCHESTRATOR] getConversationContext error:', err.message);
    return { stage: 'new', history: [], score: 0 };
  }
}

// ─── CLASSIFY — INTENT RAPIDE (sans tool call, juste du texte) ───────────────

async function classifyIntent(message, context) {
  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // rapide + économique pour la classification
      max_tokens: 60,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: 'Classe ce message WhatsApp en une seule catégorie. Réponds UNIQUEMENT avec le JSON {"intent":"X","sentiment":"Y"} où X est parmi : greeting|question|objection_price|objection_need|objection_timing|interest|ready_to_buy|negative|off_topic et Y parmi : positive|neutral|negative.'
        },
        {
          role: 'user',
          content: `Message: "${message}"\nStade actuel: ${context.stage}\nScore: ${context.score}`
        }
      ]
    });

    const text = res.choices[0]?.message?.content?.trim() || '{}';
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch (err) {
    console.warn('[ORCHESTRATOR] classifyIntent error:', err.message);
    return { intent: 'question', sentiment: 'neutral' };
  }
}

// ─── DECIDE + ACT — GPT-4 choisit et exécute l'outil ────────────────────────

async function decideAndAct(message, context, intent, user) {
  // Construction du prompt conversationnel avec historique
  const messages = [
    { role: 'system', content: buildSystemPrompt(user) },
    ...context.history,
    {
      role: 'user',
      content: `[Intent détecté: ${intent.intent} | Sentiment: ${intent.sentiment} | Stage: ${context.stage} | Score: ${context.score}]\n\nMessage du prospect: ${message}`
    }
  ];

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 400,
      temperature: 0.7,
      tools: AGENT_TOOLS,
      tool_choice: 'required', // force l'agent à choisir un outil
      messages
    });

    const choice = response.choices[0];

    // L'agent a choisi un outil
    if (choice.message.tool_calls?.length > 0) {
      const toolCall = choice.message.tool_calls[0];
      const toolName = toolCall.function.name;
      const toolArgs = JSON.parse(toolCall.function.arguments);

      console.log('[ORCHESTRATOR] Tool choisi:', toolName, toolArgs);

      return { toolName, toolArgs };
    }

    // Fallback texte pur (ne devrait pas arriver avec tool_choice: required)
    return {
      toolName: 'qualify_lead',
      toolArgs: { question: choice.message.content, focus: 'business_type' }
    };

  } catch (err) {
    console.error('[ORCHESTRATOR] decideAndAct error:', err.message);
    // Fallback safe : poser une question neutre
    return {
      toolName: 'qualify_lead',
      toolArgs: { question: 'Tu fais quoi comme business ?', focus: 'business_type' }
    };
  }
}

// ─── EXÉCUTION DES ACTIONS ────────────────────────────────────────────────────

async function executeAction(toolName, toolArgs, phone, tenant_id, context) {
  const paymentLink = process.env.SALES_PAYMENT_LINK || '[LIEN_PAIEMENT]';
  let reply    = null;
  let newStage = context.stage;
  let scoreInc = 0;

  switch (toolName) {

    case 'qualify_lead':
      reply    = toolArgs.question;
      newStage = 'qualified';
      scoreInc = 5;
      break;

    case 'present_offer':
      reply    = toolArgs.include_price
        ? toolArgs.pitch
        : toolArgs.pitch;
      newStage = 'interested';
      scoreInc = 15;
      break;

    case 'handle_objection':
      reply    = toolArgs.response;
      scoreInc = 10;
      // Le stage reste le même, l'agent repassera en closing après l'objection
      break;

    case 'close_sale':
      reply    = `${toolArgs.closing_message}\n\n👉 ${paymentLink}`;
      newStage = 'closing';
      scoreInc = 25;
      break;

    case 'schedule_followup':
      reply = toolArgs.message;
      await Conversation.findOneAndUpdate(
        { phone, tenant_id },
        {
          $set: {
            nextFollowUpAt: new Date(Date.now() + toolArgs.delay_hours * 3600000),
            followUpType: 'orchestrated'
          }
        }
      );
      scoreInc = 5;
      break;

    case 'end_conversation':
      reply    = toolArgs.farewell;
      newStage = 'lost';
      scoreInc = -10;
      break;

    default:
      reply = 'Je reviens vers toi très vite !';
  }

  // Mise à jour du stage + score dans la conversation
  if (newStage !== context.stage || scoreInc !== 0) {
    await Conversation.findOneAndUpdate(
      { phone, tenant_id },
      {
        $set:  { stage: newStage },
        $inc:  { score: scoreInc }
      },
      { upsert: true }
    );
  }

  return reply;
}

// ─── POINT D'ENTRÉE PRINCIPAL : orchestrate() ────────────────────────────────
/**
 * Appelé depuis server.js à la place de l'ancien pipeline fixe.
 *
 * @param {string} phone      - Numéro du prospect
 * @param {string} message    - Texte reçu
 * @param {string} tenant_id  - ID du tenant (multi-tenant)
 * @returns {Promise<string>} - Réponse à envoyer
 */
async function orchestrate(phone, message, tenant_id) {
  console.log('[ORCHESTRATOR START]', { phone, tenant_id, message: message.slice(0, 60) });

  try {
    // 1. Charger user + contexte conversation en parallèle
    const [user, context] = await Promise.all([
      User.findOne({ tenant_id }),
      getConversationContext(phone, tenant_id)
    ]);

    if (!user) {
      console.warn('[ORCHESTRATOR] User not found for tenant:', tenant_id);
      return null;
    }

    // 2. CLASSIFY — intent rapide
    const intent = await classifyIntent(message, context);
    console.log('[ORCHESTRATOR] Intent:', intent);

    // 3. DECIDE — GPT-4 choisit l'action
    const { toolName, toolArgs } = await decideAndAct(message, context, intent, user);

    // 4. ACT — exécuter l'action choisie
    const reply = await executeAction(toolName, toolArgs, phone, tenant_id, context);

    // 5. Persister le message entrant + la réponse dans l'historique
    await Conversation.findOneAndUpdate(
      { phone, tenant_id },
      {
        $push: {
          messages: {
            $each: [
              { content: message, sender: phone,   timestamp: new Date(), type: 'text' },
              { content: reply,   sender: 'agent', timestamp: new Date(), type: 'text' }
            ]
          }
        },
        $set: { lastInteractionAt: new Date() }
      },
      { upsert: true, new: true }
    );

    // 6. Mettre à jour le score via le service existant
    await updateScore(phone, message, tenant_id).catch(err =>
      console.warn('[ORCHESTRATOR] updateScore error:', err.message)
    );

    console.log('[ORCHESTRATOR DONE]', { toolName, replyPreview: reply?.slice(0, 60) });
    return reply;

  } catch (err) {
    console.error('[ORCHESTRATOR ERROR]', err.message, err.stack);
    return null;
  }
}

module.exports = { orchestrate };
