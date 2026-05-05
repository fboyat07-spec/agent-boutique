const OutboundLead = require('../models/OutboundLead');
const { sendWhatsAppMessage } = require('./messageSender');

// Messages pipeline
const PIPELINE_MESSAGES = {
  NEW: "Salut, tu gères comment tes demandes clients sur WhatsApp ?",
  CONTACTED: "Tu réponds vite aux clients ou ça dépend ?",
  INTERESTED: "Je peux automatiser ça pour toi",
  CLOSING: "Je peux te l'activer aujourd'hui si tu veux",
  WON: "Merci pour votre confiance !"
};

function getNextMessageByStatus(status) {
  return PIPELINE_MESSAGES[status] || PIPELINE_MESSAGES.NEW;
}

// Fonction propre
async function sendOutboundMessage(lead) {
  try {
    const message = getNextMessageByStatus(lead.status);

    console.log('[OUTBOUND MESSAGE SENDING]', {
      phone: lead.phone,
      status: lead.status,
      message
    });

    await sendWhatsAppMessage(lead.phone, message);

    await OutboundLead.findByIdAndUpdate(lead._id, {
      lastContactAt: new Date(),
      attempts: (lead.attempts || 0) + 1,
      updatedAt: new Date()
    });

    console.log('[OUTBOUND MESSAGE SUCCESS]', {
      phone: lead.phone
    });

    return true;

  } catch (error) {
    console.log('[OUTBOUND MESSAGE ERROR]', error.message);
    return false;
  }
}

module.exports = {
  sendOutboundMessage
};