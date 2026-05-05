// ACTION 5 - Envoi Stripe safe (anti double paiement)

const { sendWhatsAppMessage } = require('./messageSender');

// Envoi lien paiement SAFE (anti double)
async function sendPaymentLinkSafe(phone, tenant_id) {
  try {
    // Validation config
    if (!process.env.STRIPE_PAYMENT_LINK) {
      console.log('[PAYMENT_LINK_ERROR] Missing STRIPE_PAYMENT_LINK');
      return { success: false, reason: 'missing_config' };
    }
    
    // Récupérer lead
    const { getLead, updateLead } = require('./leadMemory');
    const lead = getLead(phone, tenant_id);
    
    if (!lead) {
      console.log('[PAYMENT_LINK_ERROR] Lead not found', { phone, tenant_id });
      return { success: false, reason: 'lead_not_found' };
    }
    
    // ACTION 5 - Anti double: vérifier si déjà envoyé
    if (lead.paymentLinkSentAt) {
      console.log('[PAYMENT_LINK_SKIPPED] Already sent', { 
        phone,
        sentAt: lead.paymentLinkSentAt 
      });
      return { 
        success: false, 
        reason: 'already_sent',
        paymentLinkSentAt: lead.paymentLinkSentAt 
      };
    }
    
    // Protection: ne pas envoyer si statut final
    if (['WON', 'LOST'].includes(lead.status)) {
      console.log('[PAYMENT_LINK_BLOCKED] Final status', { 
        phone,
        status: lead.status 
      });
      return { 
        success: false, 
        reason: 'final_status_protected',
        status: lead.status 
      };
    }
    
    // Envoyer message WhatsApp
    const message = `Voici le lien pour activer le service : ${process.env.STRIPE_PAYMENT_LINK}`;
    
    await sendWhatsAppMessage(phone, message);
    
    // Marquer comme envoyé
    const { applyPaymentTransition } = require('./statusTransition');
    const transition = applyPaymentTransition(lead);
    
    if (transition.success) {
      updateLead(phone, tenant_id, {
        status: transition.newStatus,
        paymentLinkSentAt: transition.paymentLinkSentAt,
        lastContactAt: new Date()
      });
      
      console.log('[PAYMENT_LINK_SENT]', { 
        phone,
        tenant_id,
        paymentLink: process.env.STRIPE_PAYMENT_LINK,
        sentAt: transition.paymentLinkSentAt 
      });
      
      return { 
        success: true, 
        paymentLinkSentAt: transition.paymentLinkSentAt 
      };
    } else {
      console.log('[PAYMENT_LINK_ERROR] Transition failed', transition);
      return { success: false, reason: 'transition_failed', transition };
    }
    
  } catch (error) {
    console.log('[PAYMENT_LINK_ERROR]', error.message);
    return { success: false, reason: 'exception', error: error.message };
  }
}

// Vérifier si lien paiement peut être envoyé
function canSendPaymentLink(phone, tenant_id) {
  const { getLead } = require('./leadMemory');
  const lead = getLead(phone, tenant_id);
  
  if (!lead) {
    return { can: false, reason: 'lead_not_found' };
  }
  
  if (lead.paymentLinkSentAt) {
    return { can: false, reason: 'already_sent', sentAt: lead.paymentLinkSentAt };
  }
  
  if (['WON', 'LOST'].includes(lead.status)) {
    return { can: false, reason: 'final_status_protected', status: lead.status };
  }
  
  return { can: true };
}

// Stats paiement
function getPaymentStats() {
  const { getMemoryStats } = require('./leadMemory');
  const stats = getMemoryStats();
  
  const paymentSent = stats.byStatus?.PAYMENT_SENT || 0;
  const won = stats.byStatus?.WON || 0;
  const lost = stats.byStatus?.LOST || 0;
  
  return {
    totalLeads: stats.totalLeads,
    paymentSent,
    won,
    lost,
    conversionRate: paymentSent > 0 ? (won / paymentSent) : 0
  };
}

module.exports = {
  sendPaymentLinkSafe,
  canSendPaymentLink,
  getPaymentStats
};
