'use strict';

/**
 * CONVERSATION SUMMARY SERVICE
 * ─────────────────────────────────────────────────────────────────────────────
 * Génère des résumés incrémentaux de conversations WhatsApp et les persiste
 * dans la collection MongoDB `conversation_summaries`.
 *
 * Design :
 *   - Résumé déclenché tous les SUMMARY_EVERY_N messages utilisateur
 *   - Incrémental : chaque résumé intègre le précédent + les nouveaux échanges
 *   - Non-destructif : si le service échoue, l'orchestrateur continue normalement
 *   - Backward-compatible : retourne null si aucun résumé disponible
 *   - Multi-tenant : isolé par (tenant_id, phone)
 *   - Modèle GPT : gpt-4o-mini (coût minimal)
 */

const crypto = require('crypto');
const ConversationSummary = require('../models/ConversationSummary');

// Déclencher le résumé tous les N messages utilisateur (configurable via env)
const SUMMARY_EVERY_N = parseInt(process.env.SUMMARY_EVERY_N || '8', 10);

// Délai minimum entre deux résumés (évite les rafales GPT inutiles)
const SUMMARY_COOLDOWN_MS = parseInt(process.env.SUMMARY_COOLDOWN_MS || String(30 * 60 * 1000), 10); // 30 min

// Lazy OpenAI (même pattern que orchestrator.js)
let _openai = null;
function getOpenAI() {
  if (!_openai) {
    const OpenAI = require('openai');
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

// thread_id identique à celui de l'orchestrateur (copie locale, zéro import circulaire)
function computeThreadId(phone, tenant_id) {
  const hash = crypto.createHash('sha256').update(phone).digest('hex').slice(0, 8);
  return `conv_${hash}_${tenant_id}`;
}

// ─── API PUBLIQUE ─────────────────────────────────────────────────────────────

/**
 * Récupère le résumé courant d'une conversation.
 * Retourne null si inexistant ou en cas d'erreur (fallback safe).
 *
 * @param {string} phone
 * @param {string} tenant_id
 * @returns {Promise<{running_summary:string, message_count:number}|null>}
 */
async function getSummary(phone, tenant_id) {
  try {
    const doc = await ConversationSummary.findOne({ phone, tenant_id })
      .select('running_summary message_count')
      .lean();
    if (!doc?.running_summary) return null;
    console.log('[SUMMARY SERVICE] Résumé chargé', {
      phone,
      tenant_id,
      message_count: doc.message_count,
      chars: doc.running_summary.length,
    });
    return doc;
  } catch (err) {
    console.warn('[SUMMARY SERVICE] getSummary error (non-bloquant):', err.message);
    return null;
  }
}

/**
 * Génère ou met à jour le résumé si le seuil SUMMARY_EVERY_N est atteint.
 * Toujours fire-and-forget : ne bloque JAMAIS l'orchestrateur.
 *
 * @param {string} phone
 * @param {string} tenant_id
 * @param {Array}  messages  — tableau complet des messages Conversation (tous types)
 */
async function maybeUpdateSummary(phone, tenant_id, messages) {
  try {
    if (!messages || messages.length === 0) return;

    // Compter uniquement les messages entrants (prospect → agent)
    const userMsgs = messages.filter(m => m.sender !== 'agent');
    const count = userMsgs.length;

    // Déclencher uniquement si on atteint un multiple de SUMMARY_EVERY_N
    if (count === 0 || count % SUMMARY_EVERY_N !== 0) return;

    // Lire le résumé précédent (si existant)
    const existing = await ConversationSummary.findOne({ phone, tenant_id })
      .select('running_summary updated_at')
      .lean();

    // Cooldown : ne pas générer si un résumé a déjà été produit récemment
    if (existing?.updated_at && Date.now() - new Date(existing.updated_at).getTime() < SUMMARY_COOLDOWN_MS) {
      const remainMin = Math.round((SUMMARY_COOLDOWN_MS - (Date.now() - new Date(existing.updated_at).getTime())) / 60000);
      console.log('[SUMMARY SERVICE] Cooldown actif — résumé ignoré', { phone, tenant_id, nextAllowedIn: `${remainMin}min` });
      return;
    }

    const prevSummary = existing?.running_summary || '';

    // Construire le contexte des N derniers échanges (2×N pour avoir les paires)
    const recentExchanges = messages
      .slice(-(SUMMARY_EVERY_N * 2))
      .map(m => {
        const role = m.sender === 'agent' ? 'Agent' : 'Prospect';
        return `${role}: ${m.content}`;
      })
      .join('\n');

    console.log('[SUMMARY SERVICE] Génération résumé incrémental', {
      phone,
      tenant_id,
      userMsgCount: count,
      hasExisting: !!prevSummary,
    });

    // Prompt de résumé incrémental (gpt-4o-mini = coût minimal)
    const systemPrompt = `Tu es un assistant commercial expert. Génère un résumé CONCIS et UTILE d'une conversation WhatsApp de prospection.

Capture uniquement les FAITS IMPORTANTS pour un commercial :
- Métier / secteur du prospect
- Problèmes / pain points évoqués
- Objections soulevées (prix, timing, besoin, confiance)
- Niveau d'intérêt actuel
- Engagements ou décisions exprimés
- Informations clés (CA, taille équipe, localisation, urgence)

FORMAT : style télégraphique, maximum 150 mots, zéro phrase creuse.
Si un résumé précédent existe, l'enrichir avec les nouveaux échanges sans répéter.`;

    const userPrompt = prevSummary
      ? `RÉSUMÉ PRÉCÉDENT :\n${prevSummary}\n\nNOUVEAUX ÉCHANGES :\n${recentExchanges}\n\nMets à jour le résumé en intégrant ces nouveaux échanges.`
      : `ÉCHANGES :\n${recentExchanges}\n\nGénère le résumé de cette conversation commerciale.`;

    const response = await getOpenAI().chat.completions.create({
      model:       'gpt-4o-mini',
      max_tokens:  500,
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt   },
      ],
    });

    const newSummary = response.choices[0]?.message?.content?.trim();
    if (!newSummary) {
      console.warn('[SUMMARY SERVICE] Réponse GPT vide — résumé non mis à jour');
      return;
    }

    const thread_id = computeThreadId(phone, tenant_id);
    await ConversationSummary.findOneAndUpdate(
      { phone, tenant_id },
      {
        $set: {
          thread_id,
          running_summary: newSummary,
          last_message_at: new Date(),
          message_count:   count,
          updated_at:      new Date(),
        },
      },
      { upsert: true, new: true }
    );

    console.log('[SUMMARY SERVICE] Résumé sauvegardé', {
      phone,
      tenant_id,
      message_count: count,
      chars:         newSummary.length,
      preview:       newSummary.slice(0, 100),
    });

  } catch (err) {
    // JAMAIS de crash — l'orchestrateur continue sans résumé
    console.warn('[SUMMARY SERVICE] maybeUpdateSummary error (non-bloquant):', err.message);
  }
}

module.exports = { getSummary, maybeUpdateSummary };
