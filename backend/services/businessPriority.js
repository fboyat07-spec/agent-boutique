// ACTION 7 - Priorité business dynamique

const { getConversationContext } = require('./conversationMemory');
const { enhanceDecision } = require('./aiOrchestrator');
const BusinessLogger = require('./businessLogger');

// Calculer priorité business dynamique
async function computePriority(lead) {
  try {
    console.log('[BUSINESS_PRIORITY_CALCULATING]', {
      phone: lead.phone,
      status: lead.status,
      currentScore: lead.score || 0
    });
    
    // Score de base
    let priority = lead.score || 10;
    
    // Facteurs de scoring
    const factors = {
      score: lead.score || 0,
      recency: calculateRecencyScore(lead),
      followUpCount: calculateFollowUpScore(lead),
      status: calculateStatusScore(lead.status),
      conversation: await calculateConversationScore(lead),
      engagement: calculateEngagementScore(lead),
      business: calculateBusinessScore(lead)
    };
    
    // Pondération des facteurs
    const weights = {
      score: 0.3,        // 30%
      recency: 0.2,      // 20%
      followUpCount: 0.1, // 10%
      status: 0.15,      // 15%
      conversation: 0.15, // 15%
      engagement: 0.05,  // 5%
      business: 0.05     // 5%
    };
    
    // Calculer score pondéré
    let weightedScore = 0;
    for (const [factor, value] of Object.entries(factors)) {
      weightedScore += value * weights[factor];
    }
    
    // Normaliser entre 0-100
    priority = Math.max(0, Math.min(100, weightedScore * 100));
    
    // Améliorer avec IA si disponible
    if (process.env.AI_ADVANCED_ENABLED === 'true') {
      try {
        const aiEnhancement = await enhanceDecision({
          type: 'priority',
          lead,
          message: ''
        });
        
        if (aiEnhancement && aiEnhancement.priority) {
          // Combiner score business et IA (70% business + 30% IA)
          priority = (priority * 0.7) + (aiEnhancement.priority * 0.3);
          
          console.log('[BUSINESS_PRIORITY_AI_ENHANCED]', {
            phone: lead.phone,
            businessPriority: priority,
            aiPriority: aiEnhancement.priority,
            finalPriority: priority
          });
        }
      } catch (error) {
        console.log('[BUSINESS_PRIORITY_AI_ERROR]', error.message);
      }
    }
    
    const result = {
      phone: lead.phone,
      priority: Math.round(priority * 100) / 100,
      factors,
      weights,
      calculation: 'business_dynamic',
      timestamp: new Date()
    };
    
    console.log('[BUSINESS_PRIORITY_CALCULATED]', {
      phone: lead.phone,
      priority: result.priority,
      topFactors: getTopFactors(factors, weights)
    });
    
    return result;
    
  } catch (error) {
    console.log('[BUSINESS_PRIORITY_ERROR]', {
      phone: lead.phone,
      error: error.message
    });
    
    // Fallback: score simple
    return {
      phone: lead.phone,
      priority: lead.score || 10,
      factors: {},
      weights: {},
      calculation: 'fallback',
      timestamp: new Date()
    };
  }
}

// Calculer score de récence
function calculateRecencyScore(lead) {
  const now = Date.now();
  const lastContact = lead.lastContactAt ? new Date(lead.lastContactAt).getTime() : lead.createdAt ? new Date(lead.createdAt).getTime() : now;
  const daysSinceContact = (now - lastContact) / (1000 * 60 * 60 * 24);
  
  // Plus récent = plus prioritaire
  if (daysSinceContact < 1) return 1.0;      // Aujourd'hui
  if (daysSinceContact < 3) return 0.9;      // < 3 jours
  if (daysSinceContact < 7) return 0.7;      // < 1 semaine
  if (daysSinceContact < 14) return 0.5;     // < 2 semaines
  if (daysSinceContact < 30) return 0.3;     // < 1 mois
  return 0.1;                                 // > 1 mois
}

// Calculer score de follow-up
function calculateFollowUpScore(lead) {
  const followUpCount = lead.followUpCount || 0;
  
  // Moins de follow-ups = plus prioritaire
  if (followUpCount === 0) return 1.0;        // Jamais contacté
  if (followUpCount === 1) return 0.8;        // 1 follow-up
  if (followUpCount === 2) return 0.6;        // 2 follow-ups
  if (followUpCount === 3) return 0.4;        // 3 follow-ups
  return 0.2;                                 // 4+ follow-ups
}

// Calculer score de statut
function calculateStatusScore(status) {
  const statusScores = {
    'NEW': 0.6,           // Nouveau lead
    'CONTACTED': 0.7,     // Contacté
    'ENGAGED': 0.8,       // Engagé
    'INTERESTED': 0.9,    // Intéressé
    'CLOSING': 1.0,       // Prêt à acheter
    'PAYMENT_SENT': 0.3,   // Paiement envoyé (attend)
    'WON': 0.0,           // Gagné (priorité nulle)
    'LOST': 0.0           // Perdu (priorité nulle)
  };
  
  return statusScores[status] || 0.5;
}

// Calculer score de conversation (async)
async function calculateConversationScore(lead) {
  try {
    const context = getConversationContext(lead.phone, lead.tenant_id);
    
    if (!context) {
      return 0.3; // Pas de conversation = faible priorité
    }
    
    let score = 0.5; // Base
    
    // Bonus selon pattern
    switch (context.pattern) {
      case 'buying_pattern':
        score += 0.4;
        break;
      case 'engagement_pattern':
        score += 0.3;
        break;
      case 'qa_pattern':
        score += 0.2;
        break;
      case 'objection_pattern':
        score -= 0.1;
        break;
    }
    
    // Bonus selon sentiment
    switch (context.sentiment) {
      case 'positive':
        score += 0.2;
        break;
      case 'negative':
        score -= 0.2;
        break;
    }
    
    // Bonus selon engagement
    switch (context.engagement) {
      case 'high':
        score += 0.3;
        break;
      case 'medium':
        score += 0.1;
        break;
      case 'low':
        score -= 0.1;
        break;
    }
    
    return Math.max(0, Math.min(1, score));
    
  } catch (error) {
    console.log('[CONVERSATION_SCORE_ERROR]', error.message);
    return 0.5; // Neutre en cas d'erreur
  }
}

// Calculer score d'engagement
function calculateEngagementScore(lead) {
  let score = 0.3; // Base
  
  // Bonus si réponse récente
  if (lead.lastReplyAt) {
    const daysSinceReply = (Date.now() - new Date(lead.lastReplyAt).getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysSinceReply < 1) score += 0.4;
    else if (daysSinceReply < 3) score += 0.3;
    else if (daysSinceReply < 7) score += 0.2;
  }
  
  // Bonus si score élevé
  if (lead.score && lead.score > 70) score += 0.3;
  else if (lead.score && lead.score > 50) score += 0.2;
  
  return Math.max(0, Math.min(1, score));
}

// Calculer score business
function calculateBusinessScore(lead) {
  let score = 0.5; // Base
  
  // Bonus si business renseigné
  if (lead.business && lead.business !== 'Business' && lead.business !== '') {
    score += 0.2;
  }
  
  // Bonus si ville renseignée
  if (lead.city && lead.city !== 'France' && lead.city !== '') {
    score += 0.1;
  }
  
  // Bonus si téléphone français
  if (lead.phone && lead.phone.startsWith('+33')) {
    score += 0.1;
  }
  
  // Bonus si email présent
  if (lead.email && lead.email !== '') {
    score += 0.1;
  }
  
  return Math.max(0, Math.min(1, score));
}

// Obtenir les facteurs les plus influents
function getTopFactors(factors, weights) {
  const weightedFactors = [];
  
  for (const [factor, value] of Object.entries(factors)) {
    const weight = weights[factor] || 0;
    weightedFactors.push({
      factor,
      value,
      weight,
      weighted: value * weight
    });
  }
  
  // Trier par poids pondéré
  weightedFactors.sort((a, b) => b.weighted - a.weighted);
  
  return weightedFactors.slice(0, 3).map(f => ({
    factor: f.factor,
    impact: f.weighted,
    value: f.value
  }));
}

// Trier leads par priorité business
async function sortLeadsByPriority(leads) {
  console.log('[BUSINESS_PRIORITY_SORTING]', { leadCount: leads.length });
  
  // Calculer priorité pour chaque lead
  const priorityPromises = leads.map(lead => computePriority(lead));
  const priorities = await Promise.all(priorityPromises);
  
  // Associer priorités aux leads
  const leadsWithPriority = leads.map((lead, index) => ({
    ...lead,
    priority: priorities[index]
  }));
  
  // Trier par priorité décroissante
  leadsWithPriority.sort((a, b) => b.priority.priority - a.priority.priority);
  
  console.log('[BUSINESS_PRIORITY_SORTED]', {
    totalLeads: leadsWithPriority.length,
    topPriority: leadsWithPriority[0]?.priority?.priority || 0,
    bottomPriority: leadsWithPriority[leadsWithPriority.length - 1]?.priority?.priority || 0
  });
  
  return leadsWithPriority;
}

// Stats de priorité business
function getPriorityStats(leads) {
  const stats = {
    totalLeads: leads.length,
    priorityDistribution: {
      high: 0,    // >70
      medium: 0,  // 40-70
      low: 0      // <40
    },
    avgPriority: 0,
    topFactors: {}
  };
  
  let totalPriority = 0;
  const factorCounts = {};
  
  for (const lead of leads) {
    const priority = lead.priority?.priority || 0;
    totalPriority += priority;
    
    // Distribution
    if (priority > 70) stats.priorityDistribution.high++;
    else if (priority >= 40) stats.priorityDistribution.medium++;
    else stats.priorityDistribution.low++;
    
    // Compter facteurs principaux
    if (lead.priority?.topFactors) {
      for (const factor of lead.priority.topFactors) {
        if (!factorCounts[factor.factor]) {
          factorCounts[factor.factor] = 0;
        }
        factorCounts[factor.factor]++;
      }
    }
  }
  
  stats.avgPriority = leads.length > 0 ? totalPriority / leads.length : 0;
  
  // Top facteurs globaux
  stats.topFactors = Object.entries(factorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([factor, count]) => ({ factor, count }));
  
  return stats;
}

module.exports = {
  computePriority,
  sortLeadsByPriority,
  getPriorityStats
};
