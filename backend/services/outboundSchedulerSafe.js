// ACTION 6 - Scheduler outbound contrôlé (désactivé par défaut)

const { sendWhatsAppMessage } = require('./messageSender');
const { getLead, updateLead, getMemoryStats } = require('./leadMemory');
const { sendPaymentLinkSafe } = require('./stripePaymentSafe');

// Configuration
const MAX_PER_RUN = parseInt(process.env.AGENT_MAX_PER_RUN) || 3;
const COOLDOWN_HOURS = parseInt(process.env.AGENT_COOLDOWN_HOURS) || 24;
const ENABLED = process.env.AGENT_OUTBOUND_ENABLED === 'true';

// Messages par statut
const MESSAGES = {
  'NEW': [
    'Bonjour ! Je vous contacte concernant votre activité. Intéressé(e) ?',
    'Bonjour ! Je vois que vous êtes dans le business. Ça vous intéresse ?',
    'Bonjour ! Je pense que ça pourrait vous intéresser. On en parle ?'
  ],
  'ENGAGED': [
    'Super ! Vous faites quoi comme business exactement ?',
    'Parfait ! Quel est votre domaine d\'activité ?',
    'Génial ! Dans quel secteur êtes-vous ?'
  ],
  'INTERESTED': [
    'Je peux vous aider à développer votre clientèle. Ça vous dit ?',
    'Vous voulez plus de clients chaque semaine ?',
    'Je vous propose une solution pour augmenter votre chiffre d\'affaires.'
  ]
};

// Vérifier cooldown
function isInCooldown(lead) {
  if (!lead.lastContactAt) return false;
  
  const now = new Date();
  const lastContact = new Date(lead.lastContactAt);
  const diffHours = (now - lastContact) / (1000 * 60 * 60);
  
  return diffHours < COOLDOWN_HOURS;
}

// Scheduler principal avec scaling dynamique
async function runOutboundScheduler() {
  if (!ENABLED) {
    console.log('[OUTBOUND_SCHEDULER] Disabled (AGENT_OUTBOUND_ENABLED != true)');
    return;
  }
  
  try {
    console.log('[OUTBOUND_SCHEDULER] Starting run');
    
    const stats = getMemoryStats();
    console.log('[OUTBOUND_SCHEDULER] Memory stats', stats);
    
    // Récupérer tous les leads
    const leads = [];
    for (const [key, lead] of global.leadMemory.entries()) {
      leads.push(lead);
    }
    
    // ACTION 4 - Filtrer leads éligibles
    const eligibleLeads = leads.filter(lead => {
      // Skip statuts finaux
      if (['WON', 'LOST', 'PAYMENT_SENT'].includes(lead.status)) {
        return false;
      }
      
      // Skip si déjà en cooldown
      if (isInCooldown(lead)) {
        return false;
      }
      
      return true;
    });
    
    // ACTION 4 - Trier par score DESC puis lastContactAt ASC
    eligibleLeads.sort((a, b) => {
      // Priorité 1: score décroissant
      const scoreDiff = (b.score || 0) - (a.score || 0);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }
      
      // Priorité 2: lastContactAt croissant (plus ancien d'abord)
      const aTime = a.lastContactAt ? new Date(a.lastContactAt).getTime() : 0;
      const bTime = b.lastContactAt ? new Date(b.lastContactAt).getTime() : 0;
      return aTime - bTime;
    });
    
    console.log('[OUTBOUND_SCHEDULER] Eligible leads', eligibleLeads.length);
    
    // ACTION 4 - Log priorisation
    if (eligibleLeads.length > 0) {
      console.log('[OUTBOUND_PRIORITIZATION]', {
        topLead: {
          phone: eligibleLeads[0].phone,
          score: eligibleLeads[0].score,
          status: eligibleLeads[0].status,
          lastContact: eligibleLeads[0].lastContactAt
        },
        totalEligible: eligibleLeads.length,
        scoreRange: {
          min: Math.min(...eligibleLeads.map(l => l.score || 0)),
          max: Math.max(...eligibleLeads.map(l => l.score || 0))
        }
      });
    }
    
    // ACTION 4 - Calculer batchSize dynamique
    const dynamicBatchSize = calculateDynamicBatchSize(eligibleLeads.length);
    const leadsToProcess = eligibleLeads.slice(0, Math.min(dynamicBatchSize, eligibleLeads.length));
    
    if (leadsToProcess.length === 0) {
      console.log('[OUTBOUND_SCHEDULER] No leads to process');
      return;
    }
    
    console.log('[OUTBOUND_SCHEDULER] Processing leads', {
      requested: leadsToProcess.length,
      batchSize: dynamicBatchSize,
      totalEligible: eligibleLeads.length
    });
    
    let sentCount = 0;
    let errorCount = 0;
    
    for (const lead of leadsToProcess) {
      try {
        const result = await sendOutboundMessage(lead);
        if (result.success) {
          sentCount++;
        } else {
          errorCount++;
        }
      } catch (error) {
        errorCount++;
        console.log('[OUTBOUND_SCHEDULER] Lead error', {
          phone: lead.phone,
          error: error.message
        });
      }
    }
    
    console.log('[OUTBOUND_SCHEDULER] Run completed', {
      processed: leadsToProcess.length,
      sent: sentCount,
      errors: errorCount,
      batchSize: dynamicBatchSize,
      successRate: leadsToProcess.length > 0 ? ((sentCount / leadsToProcess.length) * 100).toFixed(1) + '%' : '0%'
    });
    
    // ACTION 4 - Ajuster prochain batch selon performance
    adjustBatchSizeBasedOnPerformance(sentCount, errorCount, leadsToProcess.length);
    
  } catch (error) {
    console.log('[OUTBOUND_SCHEDULER] Error', error.message);
  }
}

// ACTION 4 - Calculer batchSize dynamique
function calculateDynamicBatchSize(eligibleCount) {
  const baseSize = MAX_PER_RUN;
  let adjustment = 0;
  
  // Obtenir métriques de performance
  const { getRegulatorStats } = require('./agentRegulator');
  const regulatorStats = getRegulatorStats();
  
  // Si charge faible → +20%
  if (regulatorStats.metrics.actionsPerMinute < 10 && eligibleCount > baseSize) {
    adjustment = Math.floor(baseSize * 0.2); // +20%
    console.log('[OUTBOUND_BATCH_INCREASED]', {
      reason: 'low_load',
      base: baseSize,
      adjustment,
      new: baseSize + adjustment
    });
  }
  
  // Si erreurs → -30%
  if (regulatorStats.metrics.errorsPerMinute > 3) {
    adjustment = -Math.floor(baseSize * 0.3); // -30%
    console.log('[OUTBOUND_BATCH_DECREASED]', {
      reason: 'high_errors',
      base: baseSize,
      adjustment,
      new: Math.max(1, baseSize + adjustment)
    });
  }
  
  // Si système throttled → -50%
  if (regulatorStats.status.throttled) {
    adjustment = -Math.floor(baseSize * 0.5); // -50%
    console.log('[OUTBOUND_BATCH_REDUCED]', {
      reason: 'system_throttled',
      base: baseSize,
      adjustment,
      new: Math.max(1, baseSize + adjustment)
    });
  }
  
  const finalSize = Math.max(1, Math.min(eligibleCount, baseSize + adjustment));
  
  console.log('[OUTBOUND_BATCH_CALCULATED]', {
    eligibleCount,
    baseSize,
    adjustment,
    finalSize,
    regulator: {
      actionsPerMin: regulatorStats.metrics.actionsPerMinute,
      errorsPerMin: regulatorStats.metrics.errorsPerMinute,
      throttled: regulatorStats.status.throttled
    }
  });
  
  return finalSize;
}

// ACTION 4 - Ajuster prochain batch selon performance
function adjustBatchSizeBasedOnPerformance(sent, errors, total) {
  if (total === 0) return;
  
  const successRate = sent / total;
  const errorRate = errors / total;
  
  let adjustment = 0;
  
  // Si taux d'erreur élevé → réduire pour prochain run
  if (errorRate > 0.3) { // >30% d'erreurs
    adjustment = -1;
    console.log('[OUTBOUND_BATCH_NEXT_DECREASE]', {
      reason: 'high_error_rate',
      errorRate: (errorRate * 100).toFixed(1) + '%',
      adjustment
    });
  }
  
  // Si taux de succès très élevé et peu d'erreurs → augmenter
  if (successRate > 0.9 && errorRate < 0.05) { // >90% succès, <5% erreurs
    adjustment = 1;
    console.log('[OUTBOUND_BATCH_NEXT_INCREASE]', {
      reason: 'high_success_rate',
      successRate: (successRate * 100).toFixed(1) + '%',
      errorRate: (errorRate * 100).toFixed(1) + '%',
      adjustment
    });
  }
  
  // Ajuster MAX_PER_RUN pour prochain run (plage: 1-10)
  if (adjustment !== 0) {
    const newMax = Math.max(1, Math.min(10, MAX_PER_RUN + adjustment));
    
    // Note: Ceci est un ajustement temporaire pour la session
    // En production, on pourrait stocker dans DB ou config
    console.log('[OUTBOUND_BATCH_MAX_ADJUSTED]', {
      old: MAX_PER_RUN,
      new: newMax,
      adjustment,
      reason: 'performance_based'
    });
    
    // Stocker l'ajustement en mémoire globale
    if (!global.batchSizeAdjustments) {
      global.batchSizeAdjustments = [];
    }
    
    global.batchSizeAdjustments.push({
      timestamp: Date.now(),
      oldSize: MAX_PER_RUN,
      newSize: newMax,
      reason: 'performance_based',
      metrics: { sent, errors, total, successRate, errorRate }
    });
    
    // Limiter historique
    if (global.batchSizeAdjustments.length > 50) {
      global.batchSizeAdjustments.shift();
    }
  }
}

// Envoyer message outbound
async function sendOutboundMessage(lead) {
  try {
    const messages = MESSAGES[lead.status];
    if (!messages || messages.length === 0) {
      return { success: false, reason: 'no_message_for_status' };
    }
    
    // Choisir message aléatoire
    const message = messages[Math.floor(Math.random() * messages.length)];
    
    // Envoyer
    await sendWhatsAppMessage(lead.phone, message);
    
    // Marquer contact
    updateLead(lead.phone, lead.tenant_id, {
      lastContactAt: new Date()
    });
    
    console.log('[OUTBOUND_SENT]', {
      phone: lead.phone,
      status: lead.status,
      message: message.substring(0, 50)
    });
    
    return { success: true, message };
    
  } catch (error) {
    console.log('[OUTBOUND_SEND_ERROR]', {
      phone: lead.phone,
      error: error.message
    });
    return { success: false, reason: 'send_error', error: error.message };
  }
}

// Démarrer scheduler
function startOutboundScheduler() {
  if (!ENABLED) {
    console.log('[OUTBOUND_SCHEDULER] Not starting - disabled');
    return;
  }
  
  const intervalMs = 60 * 60 * 1000; // 1 heure
  
  setInterval(async () => {
    await runOutboundScheduler();
  }, intervalMs);
  
  console.log('[OUTBOUND_SCHEDULER] Started', {
    interval: '1h',
    maxPerRun: MAX_PER_RUN,
    cooldown: `${COOLDOWN_HOURS}h`,
    enabled: ENABLED
  });
}

module.exports = {
  runOutboundScheduler,
  startOutboundScheduler,
  sendOutboundMessage,
  isInCooldown
};
