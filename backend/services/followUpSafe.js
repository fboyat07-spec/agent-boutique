// ACTION 3 - Follow-up intelligent (max 2 relances)

const { sendWhatsAppMessage } = require('./messageSender');
const { getLead, updateLead } = require('./leadMemory');
const { canSendFollowUp } = require('./finalStatusProtection');

// Configuration
const FOLLOW_UP_DELAY_MS = parseInt(process.env.AGENT_FOLLOW_UP_DELAY) || 3600000; // 1h par défaut
const MAX_FOLLOW_UPS = 2; // ACTION 3 - max 2 relances
const FOLLOW_UP_INTERVAL_MS = parseInt(process.env.AGENT_FOLLOW_UP_INTERVAL) || 86400000; // 24h par défaut

// Messages de follow-up par statut
const FOLLOW_UP_MESSAGES = {
  'ENGAGED': [
    'Je me permets de revenir vers vous. Ça vous intéresse toujours ?',
    'Petit follow-up : vous êtes toujours intéressé(e) ?',
    'Je reviens vers vous. On peut en parler ?'
  ],
  'INTERESTED': [
    'Je me permets de relancer. Vous voulez plus d\'infos ?',
    'Follow-up : vous souhaitez en savoir plus ?',
    'Je reviens vers vous. Prêt(e) à essayer ?'
  ],
  'CLOSING': [
    'Je me permets de relancer pour finaliser. Ça vous va ?',
    'Follow-up final : prêt(e) à vous lancer ?',
    'Dernière relance : on finalise ensemble ?'
  ]
};

// Programmer follow-up intelligent
function scheduleIntelligentFollowUp(phone, tenant_id) {
  const lead = getLead(phone, tenant_id);
  
  if (!lead) {
    console.log('[FOLLOW_UP_ERROR] Lead not found', { phone, tenant_id });
    return false;
  }
  
  // ACTION 3 - Utiliser protection globale
  if (!canSendFollowUp(lead)) {
    return false;
  }
  
  // ACTION 3 - Vérifier nombre de relances
  const followUpCount = lead.followUpCount || 0;
  if (followUpCount >= MAX_FOLLOW_UPS) {
    console.log('[FOLLOW_UP_SKIPPED] Max relances reached', { 
      phone,
      followUpCount,
      max: MAX_FOLLOW_UPS
    });
    return false;
  }
  
  // Vérifier statut éligible
  if (!['ENGAGED', 'INTERESTED', 'CLOSING'].includes(lead.status)) {
    console.log('[FOLLOW_UP_SKIPPED] Invalid status', { 
      phone,
      status: lead.status 
    });
    return false;
  }
  
  // Calculer délai (progressif)
  const delayMs = FOLLOW_UP_DELAY_MS + (followUpCount * FOLLOW_UP_INTERVAL_MS);
  
  // Programmer timer
  setTimeout(async () => {
    await sendIntelligentFollowUp(phone, tenant_id);
  }, delayMs);
  
  console.log('[FOLLOW_UP_SCHEDULED]', {
    phone,
    tenant_id,
    status: lead.status,
    followUpCount,
    delay: delayMs,
    scheduledAt: new Date()
  });
  
  return true;
}

// Envoyer follow-up intelligent
async function sendIntelligentFollowUp(phone, tenant_id) {
  try {
    const lead = getLead(phone, tenant_id);
    
    if (!lead) {
      console.log('[FOLLOW_UP_SEND_ERROR] Lead not found', { phone, tenant_id });
      return false;
    }
    
    // ACTION 3 - Protection globale
    if (!canSendFollowUp(lead)) {
      return false;
    }
    
    // Double vérification avant envoi
    const followUpCount = lead.followUpCount || 0;
    if (followUpCount >= MAX_FOLLOW_UPS) {
      console.log('[FOLLOW_UP_SEND_SKIPPED] Max relances reached', { 
        phone,
        followUpCount
      });
      return false;
    }
    
    // Vérifier statut final
    if (['WON', 'LOST', 'PAYMENT_SENT'].includes(lead.status)) {
      console.log('[FOLLOW_UP_SEND_BLOCKED] Final status', { 
        phone,
        status: lead.status 
      });
      return false;
    }
    
    const messages = FOLLOW_UP_MESSAGES[lead.status];
    if (!messages || messages.length === 0) {
      console.log('[FOLLOW_UP_SEND_ERROR] No message for status', { 
        phone,
        status: lead.status 
      });
      return false;
    }
    
    // Choisir message aléatoire
    const message = messages[Math.floor(Math.random() * messages.length)];
    
    // Envoyer
    await sendWhatsAppMessage(phone, message);
    
    // ACTION 3 - Mettre à jour avec incrément
    updateLead(phone, tenant_id, {
      followUpSentAt: new Date(),
      followUpCount: followUpCount + 1,
      lastContactAt: new Date()
    });
    
    console.log('[FOLLOW_UP_SENT]', {
      phone,
      status: lead.status,
      followUpCount: followUpCount + 1,
      message: message.substring(0, 50),
      sentAt: new Date()
    });
    
    // Programmer prochaine relance si pas encore max
    if (followUpCount + 1 < MAX_FOLLOW_UPS) {
      scheduleIntelligentFollowUp(phone, tenant_id);
    }
    
    return true;
    
  } catch (error) {
    console.log('[FOLLOW_UP_SEND_ERROR]', {
      phone,
      tenant_id,
      error: error.message
    });
    return false;
  }
}

// Vérifier si follow-up peut être envoyé
function canSendIntelligentFollowUp(phone, tenant_id) {
  const lead = getLead(phone, tenant_id);
  
  if (!lead) {
    return { can: false, reason: 'lead_not_found' };
  }
  
  // ACTION 3 - Protection globale
  if (!canSendFollowUp(lead)) {
    return { can: false, reason: 'final_status_protected' };
  }
  
  const followUpCount = lead.followUpCount || 0;
  if (followUpCount >= MAX_FOLLOW_UPS) {
    return { can: false, reason: 'max_relances_reached', count: followUpCount };
  }
  
  if (!['ENGAGED', 'INTERESTED', 'CLOSING'].includes(lead.status)) {
    return { can: false, reason: 'invalid_status', status: lead.status };
  }
  
  return { can: true, remaining: MAX_FOLLOW_UPS - followUpCount };
}

// Stop follow-up si réponse client
function stopFollowUpOnReply(phone, tenant_id) {
  const lead = getLead(phone, tenant_id);
  
  if (!lead) {
    return false;
  }
  
  // Mettre à jour lastContactAt pour arrêter les relances
  updateLead(phone, tenant_id, {
    lastContactAt: new Date(),
    followUpStoppedAt: new Date()
  });
  
  console.log('[FOLLOW_UP_STOPPED_ON_REPLY]', {
    phone,
    status: lead.status,
    stoppedAt: new Date()
  });
  
  return true;
}

// Stats follow-up intelligent
function getIntelligentFollowUpStats() {
  const stats = {
    totalLeads: 0,
    withFollowUp: 0,
    followUpCounts: {},
    byStatus: {}
  };
  
  for (const [key, lead] of global.leadMemory.entries()) {
    stats.totalLeads++;
    
    const hasFollowUp = !!(lead.followUpSentAt);
    if (hasFollowUp) {
      stats.withFollowUp++;
    }
    
    const count = lead.followUpCount || 0;
    stats.followUpCounts[count] = (stats.followUpCounts[count] || 0) + 1;
    
    const status = lead.status;
    if (!stats.byStatus[status]) {
      stats.byStatus[status] = { total: 0, withFollowUp: 0 };
    }
    stats.byStatus[status].total++;
    if (hasFollowUp) {
      stats.byStatus[status].withFollowUp++;
    }
  }
  
  return stats;
}

module.exports = {
  scheduleIntelligentFollowUp,
  sendIntelligentFollowUp,
  canSendIntelligentFollowUp,
  stopFollowUpOnReply,
  getIntelligentFollowUpStats,
  MAX_FOLLOW_UPS,
  FOLLOW_UP_DELAY_MS,
  FOLLOW_UP_INTERVAL_MS
};
