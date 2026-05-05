// ACTION 4 - Moteur transition statut (applyTransition SAFE)

// Hiérarchie des statuts (interdit downgrade)
const STATUS_HIERARCHY = {
  'NEW': 1,
  'ENGAGED': 2,
  'INTERESTED': 3,
  'CLOSING': 4,
  'PAYMENT_SENT': 5,
  'WON': 6,
  'LOST': 6
};

// Fonction SAFE de transition de statut
function applyTransition(lead, intent) {
  if (!lead || !intent) {
    console.log('[TRANSITION_ERROR] Invalid parameters', { lead: !!lead, intent: !!intent });
    return { success: false, reason: 'invalid_parameters' };
  }
  
  const oldStatus = lead.status;
  let newStatus = oldStatus;
  
  // Règles de transition basées sur l'intention
  switch (intent) {
    case 'INFO':
      if (oldStatus === 'NEW') {
        newStatus = 'ENGAGED';
      }
      break;
      
    case 'INTERESTED':
      if (['NEW', 'ENGAGED'].includes(oldStatus)) {
        newStatus = 'INTERESTED';
      }
      break;
      
    case 'READY_TO_BUY':
      if (['NEW', 'ENGAGED', 'INTERESTED'].includes(oldStatus)) {
        newStatus = 'CLOSING';
      }
      break;
      
    case 'OBJECTION':
      if (['NEW', 'ENGAGED', 'INTERESTED', 'CLOSING'].includes(oldStatus)) {
        newStatus = 'LOST';
      }
      break;
  }
  
  // Vérifier que c'est un upgrade (pas de downgrade)
  if (!isValidTransition(oldStatus, newStatus)) {
    console.log('[TRANSITION_BLOCKED] Downgrade attempt', { 
      oldStatus, 
      newStatus,
      intent 
    });
    return { 
      success: false, 
      reason: 'downgrade_blocked',
      oldStatus,
      newStatus 
    };
  }
  
  // Protection: ne pas modifier WON/LOST
  if (['WON', 'LOST'].includes(oldStatus)) {
    console.log('[TRANSITION_BLOCKED] Final status protected', { 
      oldStatus,
      intent 
    });
    return { 
      success: false, 
      reason: 'final_status_protected',
      oldStatus 
    };
  }
  
  // Appliquer la transition
  const transition = {
    success: true,
    oldStatus,
    newStatus,
    intent,
    timestamp: new Date()
  };
  
  console.log('[TRANSITION_APPLIED]', transition);
  return transition;
}

// Vérifier si la transition est valide (pas de downgrade)
function isValidTransition(fromStatus, toStatus) {
  if (fromStatus === toStatus) return true; // Pas de changement
  
  const fromLevel = STATUS_HIERARCHY[fromStatus] || 0;
  const toLevel = STATUS_HIERARCHY[toStatus] || 0;
  
  return toLevel >= fromLevel; // Permet upgrade ou égal, pas downgrade
}

// Transition spéciale pour paiement (envoi lien)
function applyPaymentTransition(lead) {
  if (!lead) {
    console.log('[PAYMENT_TRANSITION_ERROR] Invalid lead');
    return { success: false, reason: 'invalid_lead' };
  }
  
  // Ne pas envoyer si déjà envoyé
  if (lead.paymentLinkSentAt) {
    console.log('[PAYMENT_TRANSITION_BLOCKED] Already sent', { 
      phone: lead.phone,
      sentAt: lead.paymentLinkSentAt 
    });
    return { 
      success: false, 
      reason: 'already_sent',
      paymentLinkSentAt: lead.paymentLinkSentAt 
    };
  }
  
  // Protection: ne pas modifier WON/LOST
  if (['WON', 'LOST'].includes(lead.status)) {
    console.log('[PAYMENT_TRANSITION_BLOCKED] Final status', { 
      phone: lead.phone,
      status: lead.status 
    });
    return { 
      success: false, 
      reason: 'final_status_protected',
      status: lead.status 
    };
  }
  
  const transition = {
    success: true,
    oldStatus: lead.status,
    newStatus: 'PAYMENT_SENT',
    paymentLinkSentAt: new Date(),
    timestamp: new Date()
  };
  
  console.log('[PAYMENT_TRANSITION_APPLIED]', transition);
  return transition;
}

// Transition spéciale pour confirmation Stripe
function applyWonTransition(lead) {
  if (!lead) {
    console.log('[WON_TRANSITION_ERROR] Invalid lead');
    return { success: false, reason: 'invalid_lead' };
  }
  
  const transition = {
    success: true,
    oldStatus: lead.status,
    newStatus: 'WON',
    timestamp: new Date()
  };
  
  console.log('[WON_TRANSITION_APPLIED]', transition);
  return transition;
}

module.exports = {
  applyTransition,
  applyPaymentTransition,
  applyWonTransition,
  isValidTransition,
  STATUS_HIERARCHY
};
