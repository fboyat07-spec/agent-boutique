const OutboundLead = require('../models/OutboundLead');
const { sendOutboundMessage } = require('./outboundMessageService');
const { updateLeadStatus } = require('./outboundPipeline');

// Scheduler principal - toutes les 60 secondes
function startOutboundScheduler() {
  console.log('[OUTBOUND SCHEDULER] Starting outbound system...');
  
  setInterval(async () => {
    try {
      console.log('[OUTBOUND START] Processing outbound leads...');
      
      // Récupérer les leads qui ne sont pas WON, triés par score décroissant
      const leads = await OutboundLead.find({ 
        status: { $ne: 'WON' }
      })
      .sort({ score: -1, createdAt: 1 });
      
      if (leads.length === 0) {
        console.log('[OUTBOUND START] No leads to process');
        return;
      }
      
      console.log('[OUTBOUND START] Found leads to process', { 
        totalLeads: leads.length 
      });
      
      // Limitation envoi anti-spam
      const MAX_PER_RUN = 3;
      const limitedLeads = leads.slice(0, MAX_PER_RUN);
      
      const now = new Date();
      let messagesSent = 0;
      
      for (const lead of limitedLeads) {
        try {
          // Cooldown simple 60 minutes
          if (lead.lastContactAt) {
            const last = new Date(lead.lastContactAt);
            const now = new Date();
            const diffMinutes = (now - last) / (1000 * 60);

            if (diffMinutes < 60) {
              continue;
            }
          }

          console.log('[OUTBOUND PROCESS]', {
            phone: lead.phone,
            status: lead.status,
            score: lead.score
          });

          const success = await sendOutboundMessage(lead);

          if (success) {
            messagesSent++;
          }
        } catch (err) {
          console.log('[OUTBOUND LOOP ERROR]', err.message);
        }
      }
      
      console.log('[OUTBOUND START] Batch completed', {
        messagesSent,
        totalProcessed: limitedLeads.length,
        maxPerRun: MAX_PER_RUN
      });
      
    } catch (error) {
      console.error('[OUTBOUND SCHEDULER ERROR]', error.message);
    }
  }, 60000); // 60 secondes
}

// Déterminer si on doit envoyer maintenant
function shouldSendNow(lead, now) {
  // Si c'est un nouveau lead, envoyer immédiatement
  if (lead.status === 'NEW' && !lead.lastContactAt) {
    return true;
  }
  
  // Si on a un nextFollowUpAt défini
  if (lead.nextFollowUpAt) {
    return now >= lead.nextFollowUpAt;
  }
  
  // Si dernier contact il y a plus de 24h et pas de réponse
  if (lead.lastContactAt) {
    const hoursSinceLastContact = (now - lead.lastContactAt) / (1000 * 60 * 60);
    
    // Relance J+1, J+3, J+7
    if (hoursSinceLastContact >= 24 && lead.attempts < 3) {
      return true;
    }
  }
  
  return false;
}

// Programmer le prochain follow-up
async function scheduleNextFollowUp(lead) {
  try {
    let nextStatus = lead.status;
    let delay = null;
    
    // Logique de progression du statut
    switch (lead.status) {
      case 'NEW':
        nextStatus = 'CONTACTED';
        delay = 24 * 60 * 60 * 1000; // J+1
        break;
        
      case 'CONTACTED':
        if (lead.attempts >= 2) {
          nextStatus = 'INTERESTED';
          delay = 3 * 24 * 60 * 60 * 1000; // J+3
        } else {
          delay = 24 * 60 * 60 * 1000; // J+1
        }
        break;
        
      case 'INTERESTED':
        if (lead.attempts >= 2) {
          nextStatus = 'CLOSING';
          delay = 7 * 24 * 60 * 60 * 1000; // J+7
        } else {
          delay = 3 * 24 * 60 * 60 * 1000; // J+3
        }
        break;
        
      case 'CLOSING':
        if (lead.attempts >= 3) {
          // Garder en CLOSING mais relancer moins souvent
          delay = 14 * 24 * 60 * 60 * 1000; // J+14
        } else {
          delay = 7 * 24 * 60 * 60 * 1000; // J+7
        }
        break;
    }
    
    if (nextStatus !== lead.status || delay) {
      await updateLeadStatus(lead._id, nextStatus, delay);
    }
    
  } catch (error) {
    console.error('[SCHEDULE FOLLOW-UP ERROR]', error.message);
  }
}

// Démarrer le scheduler automatiquement
console.log('[OUTBOUND SYSTEM] Initializing outbound scheduler...');
startOutboundScheduler();

module.exports = {
  startOutboundScheduler,
  shouldSendNow,
  scheduleNextFollowUp
};
