'use strict';

if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = require('crypto');
}

/**
 * AGENT BOUTIQUE — ORCHESTRATEUR AGENTIQUE v2.0 (LangGraph.js)
 * -------------------------------------------------------------
 * Architecture : StateGraph LangGraph
 *
 * Nœuds : load_state → classify_intent → route →
 *   [qualify_lead | present_offer | handle_objection |
 *    close_sale | schedule_followup | end_conversation]
 *   → persist_state → send_whatsapp
 */

const { Annotation, StateGraph, START, END } = require('@langchain/langgraph');
const OpenAI = require('openai');

const { updateScore } = require('./scoringService');

const Conversation   = require('../models/Conversation');
const User           = require('../models/User');
const paymentLinks   = require('../config/paymentLinks');

let _openai = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

// ─── CHECKPOINT STORE (MongoDB persistant) ───────────────────────────────────────

// Clé unique pour thread_id (stable par numéro + tenant)
function getThreadId(phone, tenant_id) {
  const crypto = require('crypto');
  const phoneHash = crypto.createHash('sha256').update(phone).digest('hex').slice(0, 8);
  return `conv_${phoneHash}_${tenant_id}`;
}

// Lazy-compiled app : MongoDBSaver → MemorySaver en fallback
let _compiledApp = null;
let _mongoCheckpointClient = null;

async function getCompiledApp() {
  if (_compiledApp) return _compiledApp;

  let checkpointer;
  try {
    const { MongoDBSaver } = require('@langchain/langgraph-checkpoint-mongodb');
    const { MongoClient } = require('mongodb');
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/agent-boutique';
    _mongoCheckpointClient = new MongoClient(uri);
    await _mongoCheckpointClient.connect();
    checkpointer = new MongoDBSaver({ client: _mongoCheckpointClient });
    console.log('[ORCHESTRATOR] ✅ MongoDBSaver actif — checkpoints persistants');
  } catch (err) {
    console.warn('[ORCHESTRATOR] ⚠️  MongoDBSaver indisponible → MemorySaver (fallback):', err.message);
    const { MemorySaver } = require('@langchain/langgraph-checkpoint');
    checkpointer = new MemorySaver();
  }

  _compiledApp = workflow.compile({ checkpointer });
  return _compiledApp;
}

// ─── ÉTAT PARTAGÉ ─────────────────────────────────────────────────────────────

const OrchestratorState = Annotation.Root({
  phone:         Annotation({ reducer: (_, y) => y ?? _, default: () => null }),
  tenant_id:     Annotation({ reducer: (_, y) => y ?? _, default: () => null }),
  message:       Annotation({ reducer: (_, y) => y ?? _, default: () => null }),
  intent:        Annotation({ reducer: (_, y) => y ?? _, default: () => null }),
  context:       Annotation({ reducer: (_, y) => y ?? _, default: () => null }),
  toolName:      Annotation({ reducer: (_, y) => y ?? _, default: () => null }),
  toolArgs:      Annotation({ reducer: (_, y) => y ?? _, default: () => null }),
  reply:         Annotation({ reducer: (_, y) => y ?? _, default: () => null }),
});

// ─── OUTILS AGENT GPT-4 ───────────────────────────────────────────────────────

const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'qualify_lead',
      description: 'Utiliser pour TOUT premier contact et TOUTE réponse décrivant un métier ou secteur d\'activité. L\'agent s\'adapte à tous types de business.',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'La question de qualification à poser' },
          focus: {
            type: 'string',
            enum: ['business_type', 'revenue', 'pain_point', 'decision_timeline'],
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
      description: 'Présenter l\'offre Agent Boutique avec les bénéfices adaptés au profil du prospect.',
      parameters: {
        type: 'object',
        properties: {
          pitch:         { type: 'string',  description: 'Le pitch personnalisé à envoyer' },
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
      description: 'Répondre à une objection (prix, besoin, timing, concurrence).',
      parameters: {
        type: 'object',
        properties: {
          objection_type: {
            type: 'string',
            enum: ['price', 'need', 'timing', 'trust', 'competitor', 'other'],
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
      description: 'Envoyer le lien de paiement du plan adapté. Utiliser uniquement quand le prospect a montré un intérêt fort. Choisir le plan (starter/pro/elite) selon le profil du prospect.',
      parameters: {
        type: 'object',
        properties: {
          closing_message: { type: 'string', description: 'Message de closing personnalisé' },
          urgency_trigger: {
            type: 'string',
            enum: ['none', 'limited_spots', 'time_offer', 'competitor_risk'],
          },
          plan: {
            type: 'string',
            enum: ['starter', 'pro', 'elite'],
            description: 'Plan recommandé selon le profil : starter (indépendants), pro (PME), elite (agences/franchises)'
          }
        },
        required: ['closing_message', 'urgency_trigger', 'plan']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'schedule_followup',
      description: 'Programmer un suivi automatique dans le futur.',
      parameters: {
        type: 'object',
        properties: {
          message:     { type: 'string', description: 'Message à envoyer lors du suivi' },
          delay_hours: { type: 'number', description: 'Délai en heures avant le suivi' }
        },
        required: ['message', 'delay_hours']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'end_conversation',
      description: 'Clore la conversation UNIQUEMENT si le prospect dit explicitement qu\'il n\'est pas intéressé ou demande d\'arrêter. JAMAIS sur un premier message, JAMAIS sur une réponse courte comme un type de métier.',
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

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function buildSystemPrompt(user, running_summary) {
  const storeName = user?.store_name || 'Agent Boutique';
  const { starter, pro, elite } = paymentLinks;
  let prompt = `Tu es un agent commercial IA expert en closing pour ${storeName}.
Tu aides des entrepreneurs et commerçants français à automatiser leurs ventes via WhatsApp avec de l'IA.

TON OBJECTIF : Convertir chaque prospect en client payant, avec empathie et sans pression excessive.

CONTEXTE PRODUIT :
- Agent Boutique automatise les réponses WhatsApp avec GPT-4
- Gain de temps : répond 24h/24 sans intervention humaine
- Augmente les conversions de 30 à 50% selon les secteurs
- 3 plans sans engagement :
  * Starter 79€/mois — indépendants, artisans, petits commerces (1 numéro, 500 conversations/mois)
  * Pro 149€/mois — PME et commerces (conversations illimitées, GPT-4o, analytics)
  * Elite 399€/mois — agences et franchises (5 numéros, multi-tenant, support prioritaire)

Liens de paiement disponibles :
- Starter (79€) : ${starter.link || '[LIEN_STARTER]'}
- Pro (149€) : ${pro.link || '[LIEN_PRO]'}
- Elite (399€) : ${elite.link || '[LIEN_ELITE]'}

RÈGLE TARIF : Communique les prix quand le prospect les demande.
Pour le closing, envoie toujours le lien du plan adapté au profil du prospect.

RÈGLES ABSOLUES :
1. Tu analyses TOUJOURS l'historique complet avant de répondre
2. Tu ne répètes JAMAIS une question déjà posée
3. Tu adaptes ton ton au profil du prospect
4. Tu n'envoies le lien de paiement QUE si le prospect a montré un intérêt réel
5. Tes messages sont courts, percutants, en français courant
6. Maximum 2-3 phrases par message WhatsApp

CONTEXTE PROSPECTION SORTANTE :
Tu contactes en COLD OUTREACH des gérants de boutiques physiques
et e-commerces français. Ils n'ont pas demandé à être contactés.

RÈGLES STRICTES cold outreach :
1. Message 1 de leur part → présente-toi EN UNE PHRASE max :
   "Je suis [prénom], j'aide des boutiques comme la vôtre à ne plus
   rater de clients sur WhatsApp."
2. Pose UNE seule question concrète sur LEUR activité :
   "Vous gérez les messages clients vous-même en ce moment ?"
3. Si la réponse est négative (Non / Pas intéressé / Occupé) →
   remercie et souhaite bonne continuation. Ne relance JAMAIS.
4. Si hésitation → UNE seule relance max, puis exit poli.
5. Ne mentionne JAMAIS les prix avant le 3ème échange minimum.
6. Ne pose JAMAIS deux questions à la suite.
7. Si le prospect semble confus → explique en 1 phrase qui tu es
   et pourquoi tu l'as contacté.
8. Ton : humain, direct, bienveillant — PAS commercial, PAS robotique.

Choisis l'outil le plus adapté au contexte. Ne fais qu'UNE seule action par message.`;

  // Injection non-destructive du résumé de conversation (si disponible)
  if (running_summary) {
    prompt += `\n\nCONTEXTE CONVERSATION (résumé automatique — basé sur l'historique) :\n${running_summary}`;
  }

  return prompt;
}

// ─── DÉTECTION STOP / OPT-OUT ─────────────────────────────────────────────────

const OPT_OUT_SIGNALS = [
  'bloquer', 'stop', 'arrêter', 'pas intéressé', 'non merci',
  'laissez-moi', 'ne plus', 'merde', 'nul',
];

const OPT_OUT_REPLY = "Pas de problème, je vous retire de la liste et ne vous recontacterai plus. Belle journée ! 🙏";

function isOptOut(message) {
  const norm = str => (str || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  const text = norm(message);
  return OPT_OUT_SIGNALS.some(signal => text.includes(norm(signal)));
}

// ─── NŒUDS DU GRAPH ───────────────────────────────────────────────────────────

async function nodeLoadState(state) {
  const { phone, tenant_id } = state;
  try {
    const { getSummary } = require('./conversationSummaryService');

    const [user, convo, summaryDoc] = await Promise.all([
      User.findOne({ tenant_id }),
      Conversation.findOne({ phone, tenant_id }),
      getSummary(phone, tenant_id),   // null si absent ou erreur (fallback safe)
    ]);

    if (!user) {
      console.warn('[ORCHESTRATOR] User not found for tenant:', tenant_id);
    }

    // Si résumé disponible → garder seulement les 3 derniers échanges (réduction tokens)
    // Sinon → comportement existant : 10 derniers messages
    const historyLimit = summaryDoc?.running_summary ? 3 : 10;
    const history = (convo?.messages || [])
      .slice(-historyLimit)
      .map(m => ({
        role: m.sender === phone ? 'user' : 'assistant',
        content: m.content
      }));

    const context = {
      stage:           convo?.stage    || 'new',
      history,
      score:           convo?.score    || 0,
      name:            convo?.name     || null,
      business:        convo?.business || null,
      user,
      running_summary: summaryDoc?.running_summary || null,  // null = pas encore de résumé
    };

    return { context };
  } catch (err) {
    console.warn('[ORCHESTRATOR] load_state error:', err.message);
    return { context: { stage: 'new', history: [], score: 0, user: null, running_summary: null } };
  }
}

async function nodeClassifyIntent(state) {
  const { message, context } = state;
  try {
    const res = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
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
    const intent = JSON.parse(text.replace(/```json|```/g, '').trim());
    console.log('[ORCHESTRATOR] Intent:', intent);
    return { intent };
  } catch (err) {
    console.warn('[ORCHESTRATOR] classify_intent error:', err.message);
    return { intent: { intent: 'question', sentiment: 'neutral' } };
  }
}

async function nodeRoute(state) {
  const { message, context, intent } = state;

  // ── GARDE PRÉ-GPT : routing déterministe ───────────────────────────────────
  const intentType = intent?.intent;
  const score      = context?.score || 0;
  const stage      = context?.stage || 'new';

  // off_topic → toujours qualifier d'abord
  if (intentType === 'off_topic') {
    console.log('[ORCHESTRATOR] Guard pré-GPT → qualify_lead (off_topic)');
    return {
      toolName: 'qualify_lead',
      toolArgs: { question: 'Qu\'est-ce qui vous a amené à nous contacter aujourd\'hui ?', focus: 'need' }
    };
  }

  // greeting sur un nouveau prospect → qualifier
  if (intentType === 'greeting' && stage === 'new') {
    console.log('[ORCHESTRATOR] Guard pré-GPT → qualify_lead (greeting+new)');
    return {
      toolName: 'qualify_lead',
      toolArgs: { question: 'Bonjour ! Dites-moi, vous faites quoi comme activité ?', focus: 'business_type' }
    };
  }

  // sentiment négatif → handle_objection (sauf si le prospect veut acheter, a un pb de prix ou n'est pas intéressé)
  if (
    intent?.sentiment === 'negative' &&
    intentType !== 'ready_to_buy' &&
    intentType !== 'objection_price' &&
    intentType !== 'not_interested'
  ) {
    console.log('[ORCHESTRATOR] Guard pré-GPT → handle_objection (sentiment négatif)');
    return {
      toolName: 'handle_objection',
      toolArgs: { objection_type: 'other', response: 'Je comprends votre hésitation. Qu\'est-ce qui vous freine ?' }
    };
  }
  // ── FIN GARDE PRÉ-GPT ──────────────────────────────────────────────────────

  const messages = [
    { role: 'system', content: buildSystemPrompt(context.user, context.running_summary) },
    ...context.history,
    {
      role: 'user',
      content: `[Intent détecté: ${intent.intent} | Sentiment: ${intent.sentiment} | Stage: ${context.stage} | Score: ${context.score}]\n\nMessage du prospect: ${message}`
    }
  ];

  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 400,
      temperature: 0.7,
      tools: AGENT_TOOLS,
      tool_choice: 'required',
      messages
    });

    const choice = response.choices[0];
    if (choice.message.tool_calls?.length > 0) {
      const toolCall = choice.message.tool_calls[0];
      const toolName = toolCall.function.name;
      const toolArgs = JSON.parse(toolCall.function.arguments);
      console.log('[ORCHESTRATOR] Tool choisi:', toolName, toolArgs);

      // ── GARDE POST-GPT : bloquer close_sale prématuré ──────────────────────
      if (
        toolName === 'close_sale' &&
        score < 30 &&
        !['ready_to_buy', 'interest'].includes(intentType)
      ) {
        console.log('[ORCHESTRATOR] Guard post-GPT → close_sale bloqué (score:', score, '| intent:', intentType, ')');
        if (stage === 'new' || stage === 'qualified') {
          return {
            toolName: 'qualify_lead',
            toolArgs: { question: 'Pour mieux vous conseiller, dites-moi : vous gérez quel type de business ?', focus: 'business_type' }
          };
        }
        return {
          toolName: 'present_offer',
          toolArgs: { pitch: 'On aide les entrepreneurs à répondre automatiquement sur WhatsApp — 24h/24, sans effort. Votre secteur, c\'est quoi ?', include_price: false }
        };
      }
      // ── FIN GARDE POST-GPT ──────────────────────────────────────────────────

      return { toolName, toolArgs };
    }

    return {
      toolName: 'qualify_lead',
      toolArgs: { question: choice.message.content, focus: 'business_type' }
    };
  } catch (err) {
    console.error('[ORCHESTRATOR] route error:', err.message);
    return {
      toolName: 'qualify_lead',
      toolArgs: { question: 'Tu fais quoi comme business ?', focus: 'business_type' }
    };
  }
}

async function nodeQualifyLead(state) {
  const { toolArgs, phone, tenant_id } = state;
  await Conversation.findOneAndUpdate(
    { phone, tenant_id },
    { $set: { stage: 'qualified' }, $inc: { score: 5 } },
    { upsert: true }
  );
  return { reply: toolArgs.question };
}

async function nodePresentOffer(state) {
  const { toolArgs, phone, tenant_id } = state;
  await Conversation.findOneAndUpdate(
    { phone, tenant_id },
    { $set: { stage: 'interested' }, $inc: { score: 15 } },
    { upsert: true }
  );
  return { reply: toolArgs.pitch };
}

async function nodeHandleObjection(state) {
  const { toolArgs, phone, tenant_id } = state;
  await Conversation.findOneAndUpdate(
    { phone, tenant_id },
    { $inc: { score: 10 } },
    { upsert: true }
  );
  return { reply: toolArgs.response };
}

async function nodeCloseSale(state) {
  const { toolArgs, phone, tenant_id } = state;
  const planKey  = (toolArgs.plan || 'starter').toLowerCase();
  const plan     = paymentLinks[planKey] || paymentLinks.starter;
  const link     = plan.link || '[LIEN_PAIEMENT]';
  console.log('[CLOSE SALE] Plan sélectionné:', planKey, '| Link:', link);
  await Conversation.findOneAndUpdate(
    { phone, tenant_id },
    { $set: { stage: 'closing' }, $inc: { score: 25 } },
    { upsert: true }
  );
  return { reply: `${toolArgs.closing_message}\n\n👉 ${plan.label} ${plan.price} : ${link}` };
}

async function nodeScheduleFollowup(state) {
  const { toolArgs, phone, tenant_id } = state;
  await Conversation.findOneAndUpdate(
    { phone, tenant_id },
    {
      $set: {
        nextFollowUpAt: new Date(Date.now() + toolArgs.delay_hours * 3600000),
        followUpType: 'orchestrated'
      },
      $inc: { score: 5 }
    },
    { upsert: true }
  );
  return { reply: toolArgs.message };
}

async function nodeEndConversation(state) {
  const { toolArgs, phone, tenant_id } = state;
  await Conversation.findOneAndUpdate(
    { phone, tenant_id },
    { $set: { stage: 'lost' }, $inc: { score: -10 } },
    { upsert: true }
  );
  return { reply: toolArgs.farewell };
}

async function nodePersistState(state) {
  const { phone, tenant_id, message, reply } = state;
  try {
    const updated = await Conversation.findOneAndUpdate(
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

    // Fire-and-forget summary update — JAMAIS de crash si ça échoue
    const { maybeUpdateSummary } = require('./conversationSummaryService');
    maybeUpdateSummary(phone, tenant_id, updated?.messages || []).catch(err =>
      console.warn('[SUMMARY SERVICE] trigger error (non-bloquant):', err.message)
    );

    await updateScore(phone, message, tenant_id).catch(err =>
      console.warn('[ORCHESTRATOR] updateScore error:', err.message)
    );
  } catch (err) {
    console.error('[ORCHESTRATOR] persist_state error:', err.message);
  }
  return {};
}

// ─── CONSTRUCTION DU GRAPH ────────────────────────────────────────────────────

const workflow = new StateGraph(OrchestratorState);

workflow.addNode('load_state',       nodeLoadState);
workflow.addNode('classify_intent',  nodeClassifyIntent);
workflow.addNode('route',            nodeRoute);
workflow.addNode('qualify_lead',     nodeQualifyLead);
workflow.addNode('present_offer',    nodePresentOffer);
workflow.addNode('handle_objection', nodeHandleObjection);
workflow.addNode('close_sale',       nodeCloseSale);
workflow.addNode('schedule_followup', nodeScheduleFollowup);
workflow.addNode('end_conversation', nodeEndConversation);
workflow.addNode('persist_state',    nodePersistState);

// Arêtes fixes
workflow.addEdge(START, 'load_state');
workflow.addEdge('load_state',      'classify_intent');
workflow.addEdge('classify_intent', 'route');

// Arêtes conditionnelles depuis route → nœud action selon toolName
workflow.addConditionalEdges('route', (state) => state.toolName, {
  qualify_lead:     'qualify_lead',
  present_offer:    'present_offer',
  handle_objection: 'handle_objection',
  close_sale:       'close_sale',
  schedule_followup: 'schedule_followup',
  end_conversation: 'end_conversation',
});

// Tous les nœuds action → persist_state → END
// (l'envoi WhatsApp est géré par server.js sur la valeur de retour de orchestrate())
for (const node of ['qualify_lead', 'present_offer', 'handle_objection', 'close_sale', 'schedule_followup', 'end_conversation']) {
  workflow.addEdge(node, 'persist_state');
}
workflow.addEdge('persist_state', END);

// ─── POINT D'ENTRÉE ───────────────────────────────────────────────────────────

/**
 * @param {string} phone
 * @param {string} message
 * @param {string} tenant_id
 * @returns {Promise<string|null>}
 */
async function orchestrate(phone, message, tenant_id) {
  console.log('[ORCHESTRATOR START]', { phone, tenant_id, message: message.slice(0, 60) });
  try {
    // ── Conversation déjà opt-out → silence total ─────────────────────────────
    const existing = await Conversation.findOne({ phone, tenant_id }).select('status').lean();
    if (existing?.status === 'opted_out') {
      console.log('[ORCHESTRATOR] opted_out — message ignoré pour', phone);
      return null;
    }

    // ── Stop signal détecté → opt-out immédiat ────────────────────────────────
    if (isOptOut(message)) {
      console.log('[ORCHESTRATOR] Stop signal → opt-out pour', phone);
      await Conversation.findOneAndUpdate(
        { phone, tenant_id },
        {
          $set: { status: 'opted_out', stage: 'opted_out', lastInteractionAt: new Date() },
          $push: {
            messages: {
              $each: [
                { content: message,       sender: phone,   timestamp: new Date(), type: 'text' },
                { content: OPT_OUT_REPLY, sender: 'agent', timestamp: new Date(), type: 'text' },
              ],
            },
          },
        },
        { upsert: true }
      );
      return OPT_OUT_REPLY;
    }

    // ── Flux normal ───────────────────────────────────────────────────────────
    const app      = await getCompiledApp();
    const threadId = getThreadId(phone, tenant_id);
    const config   = { configurable: { thread_id: threadId } };

    const result = await app.invoke({ phone, message, tenant_id }, config);
    console.log('[ORCHESTRATOR DONE]', {
      toolName:     result.toolName,
      replyPreview: result.reply?.slice(0, 60),
      threadId,
    });
    return result.reply;
  } catch (err) {
    console.error('[ORCHESTRATOR ERROR]', err.message, err.stack);
    // Fallback sans checkpoint si erreur de persistence
    try {
      console.log('[ORCHESTRATOR FALLBACK] Sans checkpoint...');
      const { MemorySaver } = require('@langchain/langgraph-checkpoint');
      const fallbackApp = workflow.compile({ checkpointer: new MemorySaver() });
      const result = await fallbackApp.invoke({ phone, message, tenant_id });
      console.log('[ORCHESTRATOR FALLBACK DONE]', { replyPreview: result.reply?.slice(0, 60) });
      return result.reply;
    } catch (fallbackErr) {
      console.error('[ORCHESTRATOR FALLBACK FAILED]', fallbackErr.message);
      return null;
    }
  }
}

module.exports = { orchestrate };
