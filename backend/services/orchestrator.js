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
const axios  = require('axios');

const { updateScore } = require('./scoringService');

const Conversation     = require('../models/Conversation');
const User             = require('../models/User');
const paymentLinks     = require('../config/paymentLinks');
const WhatsAppSequence = require('../models/WhatsAppSequence');

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
// COLD OUTREACH PRIORITY: When in doubt between qualifying and ending →
// ALWAYS end_conversation. Never repeat the same tool twice in a row.

const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'qualify_lead',
      description: 'NEVER ask \'qu\'est-ce qui vous a amené à nous contacter\' — we contacted them first. Ask about THEIR current situation instead. Use when prospect says Bonjour, asks a question, or shows any curiosity. Ask ONE short friendly question about their business. Cible : boutiques, commerces, coaches, artisans, esthéticiennes, photographes, restaurants — tout type d\'activité indépendante.',
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
      description: "NEVER use when prospect says just 'Non' or 'Non merci' as a standalone reply — use end_conversation instead. Répondre à une objection (prix, besoin, timing, concurrence). If prospect says no twice OR says they are not interested → use end_conversation instead, NEVER handle_objection.",
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
      description: "Use when prospect replies with just 'Non', 'Non.', 'Non merci', 'Pas intéressé' as standalone short replies. Use ONLY when prospect explicitly refuses: no/not interested/stop/bloquer/occupé/pas mon secteur, OR after 2 clearly negative responses, OR prospect says they have no shop, are closing their business, or their activity doesn't match the offer. NEVER use on neutral greetings like Bonjour, or questions about the offer.",
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

// ── Hot lead notification ─────────────────────────────────────────────────────
function notifyHotLead({ phone, score, lastMessage, reason }) {
  const waToken   = process.env.WHATSAPP_TOKEN;
  const waPhoneId = process.env.PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!waToken || !waPhoneId) return;

  const header = reason === 'intent'
    ? '🎯 Intention d\'achat détectée'
    : '🔥 Lead chaud détecté !';
  const body =
    `${header}\nNuméro: ${phone}\nScore: ${score}/100\n` +
    `Dernière réponse: ${lastMessage}\n` +
    `→ Ouvrir la console: api.agentboutique.fr/console.html`;

  axios.post(
    `https://graph.facebook.com/v20.0/${waPhoneId}/messages`,
    { messaging_product: 'whatsapp', to: '33788199089', type: 'text', text: { body } },
    { headers: { Authorization: `Bearer ${waToken}`, 'Content-Type': 'application/json' }, timeout: 8000 }
  )
  .then(() => console.log(`[HOT LEAD] ✅ Notif envoyée | phone: ${phone} | reason: ${reason}`))
  .catch(err  => console.warn('[HOT LEAD] ⚠️ Notif échouée:', err.message));
}

function buildSystemPrompt(user, running_summary) {
  const storeName = user?.store_name || 'Agent Boutique';
  const { starter, pro, elite } = paymentLinks;
  let prompt = `Tu es un agent commercial IA expert en closing pour ${storeName}.
Tu aides des entrepreneurs et commerçants français à automatiser leurs ventes via WhatsApp avec de l'IA.

TON OBJECTIF : Convertir chaque prospect en client payant, avec empathie et sans pression excessive.

CONTEXTE PRODUIT :
- Agent Boutique automatise les réponses WhatsApp avec GPT-4
- Gain de temps : répond 24h/24 sans intervention humaine
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
7. Si le running_summary contient déjà des informations sur le prospect (métier, intérêt, objections), NE PAS redemander ces informations — utilise-les directement pour personnaliser ta réponse.

CONTEXTE PROSPECTION SORTANTE :
Tu contactes en COLD OUTREACH des gérants d'activités indépendantes françaises
(commerces, coaches, artisans, restaurateurs, professions libérales, e-commerçants).
Ils n'ont pas demandé à être contactés.

⚠️ RÈGLE ABSOLUE — PROSPECTION SORTANTE :
Tu as TOI-MÊME contacté ce prospect en premier via un message WhatsApp.
Il ne t'a PAS contacté spontanément.

INTERDIT en cold outreach :
- "Qu'est-ce qui vous a amené à nous contacter ?" → JAMAIS
- "Comment puis-je vous aider ?" → JAMAIS
- Toute question qui sous-entend que le prospect a fait la démarche

OBLIGATOIRE quand le prospect répond :
1. Rappelle en 1 phrase pourquoi tu l'as contacté :
   "Je vous avais contacté car j'accompagne les indépendants
   à automatiser leur relation client WhatsApp."
2. Pose UNE question sur SON activité :
   "Vous gérez beaucoup de messages clients en ce moment ?"

RÈGLES STRICTES cold outreach :
1. Message 1 de leur part → présente-toi EN UNE PHRASE max :
   "Je suis [prénom], j'aide des activités comme la vôtre à ne plus
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

  // Instructions dynamiques du jour (définies via la console)
  if (user?.agent_instructions?.trim()) {
    prompt += `\n\nINSTRUCTIONS SPÉCIALES DU JOUR :\n${user.agent_instructions.trim()}`;
  }

  // Lien Calendly pour prise de RDV
  if (user?.calendly_link?.trim()) {
    prompt += `\n\nLIEN DE PRISE DE RDV :\nSi le prospect montre de l'intérêt pour une démo ou un appel, envoie ce lien Calendly : ${user.calendly_link.trim()}\nEnvoie-le naturellement dans la conversation, ex: 'Voici mon lien pour réserver un créneau : ${user.calendly_link.trim()}'`;
  }

  // Injection non-destructive du résumé de conversation (si disponible)
  if (running_summary) {
    prompt += `\n\nCONTEXTE CONVERSATION (résumé automatique — basé sur l'historique) :\n${running_summary}`;
  }

  return prompt;
}

// ─── DÉTECTION STOP / OPT-OUT ─────────────────────────────────────────────────

const OPT_OUT_SIGNALS = [
  'bloquer', 'stop', 'pas intéressé', 'non merci',
  'laissez-moi', 'ne plus', 'merde', 'nul',
  'j arrête', 'j arrete', 'je ferme', 'je cesse',
  'plus d activité', 'pas de boutique', 'pas boutique', 'coach', 'je ne suis pas',
];

const OPT_OUT_REPLY = "Pas de problème, je vous retire de la liste et ne vous recontacterai plus. Belle journée ! 🙏";

function isOptOut(message) {
  const norm = str => (str || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  const text = norm(message);
  if (text.trim() === 'non') return true;
  return OPT_OUT_SIGNALS.some(signal => text.includes(norm(signal)));
}

// ─── DÉTECTION AUTO-REPLY / RÉPONDEUR ─────────────────────────────────────────

const AUTO_REPLY_SIGNALS = [
  'je reviens vers vous', 'message automatique', 'absent',
  'répondeur', 'hors de', 'actuellement indisponible',
  'je vous réponds', 'bot', 'automated', 'auto-reply',
  '7j/7', '24h/24', 'entre 8h', 'entre 9h', 'nous contacter au',
  'notre équipe', 'votre demande a bien été', 'pris en compte',
];

function isAutoReply(message) {
  const norm = str => (str || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  const text = norm(message);
  return AUTO_REPLY_SIGNALS.some(signal => text.includes(norm(signal)));
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
      toolArgs: { question: 'Je vous avais contacté pour vous parler de WhatsApp — vous gérez beaucoup de messages clients en ce moment ?', focus: 'pain_point' }
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
  return { reply: toolArgs.closing_message };
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

    // ── Hot lead notification (fire-and-forget) ───────────────────────────────
    (async () => {
      try {
        const prevScore = state.context?.score || 0;
        const fresh     = await Conversation.findOne({ phone, tenant_id }).select('score').lean();
        const newScore  = fresh?.score || 0;

        // Seuil score : franchissement 0→30 (notif unique au crossing)
        if (prevScore < 30 && newScore >= 30) {
          notifyHotLead({ phone, score: newScore, lastMessage: message, reason: 'score' });
          return;
        }

        // Intention d'achat explicite dans le message du prospect
        const normalize     = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        const INTENT_KEYWORDS = ['intéressé', 'je veux', 'comment on fait', 'combien', 'tarif', 'prix', 'abonnement'];
        const msgNorm       = normalize(message);
        if (INTENT_KEYWORDS.some(kw => msgNorm.includes(normalize(kw)))) {
          notifyHotLead({ phone, score: newScore, lastMessage: message, reason: 'intent' });
        }
      } catch (e) {
        console.warn('[HOT LEAD] check error (non-bloquant):', e.message);
      }
    })();

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

    // ── Auto-reply / répondeur → silence total (pas d'opt-out, juste skip) ─────
    if (isAutoReply(message)) {
      console.log('[ORCHESTRATOR] Auto-reply détecté → message ignoré silencieusement pour', phone);
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
      await WhatsAppSequence.findOneAndUpdate(
        { to: phone, status: 'active' },
        { $set: { status: 'stopped' } }
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

// ─── TTS ElevenLabs (optionnel — désactivé si ELEVENLABS_API_KEY absent) ──────

async function synthesizeVoice(text) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return null;
  const voiceId = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB';
  try {
    const res = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      { text, model_id: 'eleven_multilingual_v2' },
      {
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        responseType: 'arraybuffer',
        timeout: 15000,
      }
    );
    return Buffer.from(res.data);
  } catch (err) {
    console.warn('[TTS] ElevenLabs error:', err.message);
    return null;
  }
}

module.exports = { orchestrate, synthesizeVoice };
