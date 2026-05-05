// ACTION 4 - Score dynamique (amélioration incrémentale)

const { updateLead, getLead } = require('./leadMemory');
const { detectIntent } = require('./intentionDetector');
const BusinessLogger = require('./businessLogger');

// Scores par action (incrémentaux)
const SCORE_RULES = {
  // Réponses inbound
  inbound_reply: +20,
  
  // Intentions
  intent_interested: +30,
  intent_ready_to_buy: +50,
  intent_objection: -10,
  
  // Silence prolongé (pénalité)
  silence_24h: -10,
  silence_48h: -20,
  
  // Actions système
  outbound_sent: +5,
  follow_up_sent: +3,
  payment_link_sent: +15,
  payment_confirmed: +100,
  
  // Base
  base_score: 10
};

// Mettre à jour score incrémental (SANS recalcul global)
function updateDynamicScore(phone, tenant_id, action, context = {}) {
  try {
    const lead = getLead(phone, tenant_id);
    
    if (!lead) {
      console.log('[SCORE_UPDATE_ERROR] Lead not found', { phone, tenant_id });
      return false;
    }
    
    // Protection: ne pas modifier score si statut final
    if (['WON', 'LOST'].includes(lead.status)) {
      console.log('[SCORE_UPDATE_BLOCKED] Final status', { 
        phone, 
        status: lead.status 
      });
      return false;
    }
    
    const currentScore = lead.score || 0;
    let scoreChange = 0;
    
    // Calculer changement de score selon action
    switch (action) {
      case 'inbound_reply':
        scoreChange = SCORE_RULES.inbound_reply;
        break;
        
      case 'intent_detected':
        const intent = context.intent;
        if (intent === 'INTERESTED') {
          scoreChange = SCORE_RULES.intent_interested;
        } else if (intent === 'READY_TO_BUY') {
          scoreChange = SCORE_RULES.intent_ready_to_buy;
        } else if (intent === 'OBJECTION') {
          scoreChange = SCORE_RULES.intent_objection;
        }
        break;
        
      case 'silence_penalty':
        const hours = context.hours || 24;
        if (hours >= 48) {
          scoreChange = SCORE_RULES.silence_48h;
        } else if (hours >= 24) {
          scoreChange = SCORE_RULES.silence_24h;
        }
        break;
        
      case 'outbound_sent':
        scoreChange = SCORE_RULES.outbound_sent;
        break;
        
      case 'follow_up_sent':
        scoreChange = SCORE_RULES.follow_up_sent;
        break;
        
      case 'payment_link_sent':
        scoreChange = SCORE_RULES.payment_link_sent;
        break;
        
      case 'payment_confirmed':
        scoreChange = SCORE_RULES.payment_confirmed;
        break;
        
      default:
        console.log('[SCORE_UPDATE_UNKNOWN_ACTION]', { action });
        return false;
    }
    
    // Appliquer changement (avec limites)
    const newScore = Math.max(0, Math.min(100, currentScore + scoreChange));
    
    // Mettre à jour uniquement si changement significatif
    if (newScore !== currentScore) {
      updateLead(phone, tenant_id, {
        score: newScore,
        scoreUpdatedAt: new Date(),
        lastScoreAction: action
      });
      
      console.log('[SCORE_UPDATED]', {
        phone,
        tenant_id,
        action,
        oldScore: currentScore,
        newScore,
        change: scoreChange
      });
      
      BusinessLogger.logStatusChanged(phone, `score_${currentScore}`, `score_${newScore}`, 'dynamic_scoring');
      
      return true;
    }
    
    return false;
    
  } catch (error) {
    console.log('[SCORE_UPDATE_ERROR]', {
      phone,
      tenant_id,
      action,
      error: error.message
    });
    return false;
  }
}

// Calculer score initial pour nouveau lead
function calculateInitialScore(leadData) {
  let score = SCORE_RULES.base_score;
  
  // +20 si business renseigné
  if (leadData.business && leadData.business !== 'Business') {
    score += 20;
  }
  
  // +15 si ville renseignée
  if (leadData.city && leadData.city !== 'France') {
    score += 15;
  }
  
  // +10 si téléphone valide (+33)
  if (leadData.phone && leadData.phone.startsWith('+33')) {
    score += 10;
  }
  
  return Math.min(100, score);
}

// Mettre à jour score sur message inbound
function updateScoreOnMessage(phone, tenant_id, message) {
  // ACTION 4 - +20 si réponse inbound
  updateDynamicScore(phone, tenant_id, 'inbound_reply');
  
  // Détecter intention et scorer
  const intent = detectIntent(message);
  updateDynamicScore(phone, tenant_id, 'intent_detected', { intent });
  
  return intent;
}

// Pénalité silence prolongé (appelé périodiquement)
function applySilencePenalty(phone, tenant_id) {
  const lead = getLead(phone, tenant_id);
  
  if (!lead) {
    return false;
  }
  
  // Protection: ne pas pénaliser si statut final
  if (['WON', 'LOST'].includes(lead.status)) {
    return false;
  }
  
  const lastContact = lead.lastContactAt || lead.createdAt;
  const now = new Date();
  const hoursSinceContact = (now - lastContact) / (1000 * 60 * 60);
  
  // Appliquer pénalité si silence prolongé
  if (hoursSinceContact >= 24) {
    return updateDynamicScore(phone, tenant_id, 'silence_penalty', { 
      hours: Math.floor(hoursSinceContact) 
    });
  }
  
  return false;
}

// Stats scoring dynamique
function getDynamicScoringStats() {
  const stats = {
    totalLeads: 0,
    scoreDistribution: {},
    averageScore: 0,
    highScoreLeads: 0, // >70
    mediumScoreLeads: 0, // 40-70
    lowScoreLeads: 0 // <40
  };
  
  let totalScore = 0;
  
  for (const [key, lead] of global.leadMemory.entries()) {
    if (!lead.score) continue;
    
    stats.totalLeads++;
    totalScore += lead.score;
    
    // Distribution par tranche de 10
    const scoreRange = Math.floor(lead.score / 10) * 10;
    const rangeKey = `${scoreRange}-${scoreRange + 9}`;
    stats.scoreDistribution[rangeKey] = (stats.scoreDistribution[rangeKey] || 0) + 1;
    
    // Catégories
    if (lead.score > 70) {
      stats.highScoreLeads++;
    } else if (lead.score >= 40) {
      stats.mediumScoreLeads++;
    } else {
      stats.lowScoreLeads++;
    }
  }
  
  stats.averageScore = stats.totalLeads > 0 ? totalScore / stats.totalLeads : 0;
  
  return stats;
}

// Optimisation automatique (appelé périodiquement)
function optimizeScoring() {
  const stats = getDynamicScoringStats();
  
  console.log('[SCORING_OPTIMIZATION]', stats);
  
  // Ajuster règles si nécessaire (futur)
  if (stats.averageScore < 30) {
    console.log('[SCORING_ALERT] Average score too low');
  }
  
  if (stats.highScoreLeads < stats.totalLeads * 0.1) {
    console.log('[SCORING_ALERT] Not enough high-score leads');
  }
}

module.exports = {
  updateDynamicScore,
  calculateInitialScore,
  updateScoreOnMessage,
  applySilencePenalty,
  getDynamicScoringStats,
  optimizeScoring,
  SCORE_RULES
};
