// ACTION 2 - Anti-régression global (final status protection)

const BusinessLogger = require('./businessLogger');

// Garde-fou global: vérifier statut final
function isFinalStatus(status) {
  const finalStatuses = ['WON', 'LOST'];
  const isFinal = finalStatuses.includes(status);
  
  if (isFinal) {
    console.log('[FINAL_STATUS_CHECK]', { status, isFinal: true });
  }
  
  return isFinal;
}

// Bloquer TOUTE transition si final
function canTransition(fromStatus, toStatus) {
  // Si statut source est final → bloquer
  if (isFinalStatus(fromStatus)) {
    console.log('[TRANSITION_BLOCKED_FINAL_SOURCE]', { 
      fromStatus, 
      toStatus,
      reason: 'source_status_is_final'
    });
    
    BusinessLogger.logTransitionBlocked('unknown', 'final_status_source', {
      fromStatus,
      toStatus
    });
    
    return false;
  }
  
  // Si statut destination est final → autoriser (seulement vers WON/LOST)
  if (isFinalStatus(toStatus)) {
    console.log('[TRANSITION_ALLOWED_FINAL_DEST]', { 
      fromStatus, 
      toStatus,
      reason: 'destination_is_final'
    });
    return true;
  }
  
  // Transition normale
  return true;
}

// Bloquer outbound si final
function canSendOutbound(lead) {
  if (!lead) {
    console.log('[OUTBOUND_BLOCKED] No lead');
    return false;
  }
  
  if (isFinalStatus(lead.status)) {
    console.log('[OUTBOUND_BLOCKED_FINAL]', { 
      phone: lead.phone,
      status: lead.status,
      reason: 'final_status'
    });
    
    BusinessLogger.logOutboundSkipped(lead.phone, 'final_status_protected', {
      status: lead.status
    });
    
    return false;
  }
  
  return true;
}

// Bloquer follow-up si final
function canSendFollowUp(lead) {
  if (!lead) {
    console.log('[FOLLOW_UP_BLOCKED] No lead');
    return false;
  }
  
  if (isFinalStatus(lead.status)) {
    console.log('[FOLLOW_UP_BLOCKED_FINAL]', { 
      phone: lead.phone,
      status: lead.status,
      reason: 'final_status'
    });
    
    BusinessLogger.logFollowUpSkipped(lead.phone, 'final_status_protected');
    
    return false;
  }
  
  return true;
}

// Wrapper pour transition avec protection
function safeTransition(lead, newStatus, reason = 'user_action') {
  if (!lead) {
    console.log('[SAFE_TRANSITION_ERROR] No lead provided');
    return { success: false, reason: 'no_lead' };
  }
  
  const oldStatus = lead.status;
  
  // Vérifier si transition autorisée
  if (!canTransition(oldStatus, newStatus)) {
    return { 
      success: false, 
      reason: 'transition_blocked',
      oldStatus,
      newStatus
    };
  }
  
  // Appliquer transition
  console.log('[SAFE_TRANSITION_APPLIED]', {
    phone: lead.phone,
    oldStatus,
    newStatus,
    reason
  });
  
  BusinessLogger.logStatusChanged(lead.phone, oldStatus, newStatus, reason);
  
  return {
    success: true,
    oldStatus,
    newStatus,
    reason
  };
}

// Wrapper pour envoi outbound avec protection
function safeOutbound(lead, messageFunction) {
  if (!canSendOutbound(lead)) {
    return { success: false, reason: 'final_status_protected' };
  }
  
  try {
    const result = messageFunction(lead);
    console.log('[SAFE_OUTBOUND_SENT]', {
      phone: lead.phone,
      status: lead.status
    });
    
    BusinessLogger.logOutboundSent(lead.phone, lead.status);
    
    return { success: true, result };
    
  } catch (error) {
    console.log('[SAFE_OUTBOUND_ERROR]', {
      phone: lead.phone,
      error: error.message
    });
    
    return { success: false, reason: 'send_error', error: error.message };
  }
}

// Wrapper pour follow-up avec protection
function safeFollowUp(lead, messageFunction) {
  if (!canSendFollowUp(lead)) {
    return { success: false, reason: 'final_status_protected' };
  }
  
  try {
    const result = messageFunction(lead);
    console.log('[SAFE_FOLLOW_UP_SENT]', {
      phone: lead.phone,
      status: lead.status
    });
    
    BusinessLogger.logFollowUpSent(lead.phone, lead.status);
    
    return { success: true, result };
    
  } catch (error) {
    console.log('[SAFE_FOLLOW_UP_ERROR]', {
      phone: lead.phone,
      error: error.message
    });
    
    return { success: false, reason: 'send_error', error: error.message };
  }
}

// Stats de protection
function getProtectionStats() {
  const stats = {
    finalStatuses: ['WON', 'LOST'],
    totalLeads: 0,
    finalStatusLeads: 0,
    activeLeads: 0
  };
  
  // Compter dans la mémoire globale
  if (global.leadMemory) {
    for (const [key, lead] of global.leadMemory.entries()) {
      stats.totalLeads++;
      
      if (isFinalStatus(lead.status)) {
        stats.finalStatusLeads++;
      } else {
        stats.activeLeads++;
      }
    }
  }
  
  return stats;
}

// Validation globale
function validateGlobalProtection() {
  const stats = getProtectionStats();
  const issues = [];
  
  // Vérifier qu'il n'y a pas de leads avec statuts incohérents
  if (global.leadMemory) {
    for (const [key, lead] of global.leadMemory.entries()) {
      // Vérifier que les leads finaux n'ont pas de follow-up programmé
      if (isFinalStatus(lead.status) && lead.followUpSentAt) {
        issues.push({
          phone: lead.phone,
          status: lead.status,
          issue: 'final_status_with_followup'
        });
      }
      
      // Vérifier que les leads finaux n'ont pas de paiement envoyé récemment
      if (isFinalStatus(lead.status) && lead.paymentLinkSentAt && !lead.paidAt) {
        issues.push({
          phone: lead.phone,
          status: lead.status,
          issue: 'final_status_with_unpaid_payment'
        });
      }
    }
  }
  
  if (issues.length > 0) {
    console.log('[PROTECTION_VALIDATION_ISSUES]', issues);
  }
  
  return {
    stats,
    issues,
    isValid: issues.length === 0
  };
}

module.exports = {
  isFinalStatus,
  canTransition,
  canSendOutbound,
  canSendFollowUp,
  safeTransition,
  safeOutbound,
  safeFollowUp,
  getProtectionStats,
  validateGlobalProtection
};
