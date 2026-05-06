const axios = require('axios');

// Conversation storage
const conversations = {};

function getConversation(phone) {
  if (!conversations[phone]) {
    conversations[phone] = { stage: "new", messagesSent: 0 };
  }
  return conversations[phone];
}

function updateConversation(phone, data) {
  conversations[phone] = { ...conversations[phone], ...data };
}

const ENV_TOKEN     = () => process.env.WHATSAPP_TOKEN     || process.env.WHATSAPP_ACCESS_TOKEN;
const ENV_PHONE_ID  = () => process.env.PHONE_NUMBER_ID    || process.env.WHATSAPP_PHONE_NUMBER_ID;

async function sendWhatsAppMessage(to, message, tenant_id = null) {
  try {
    let WHATSAPP_TOKEN, PHONE_NUMBER_ID;

    if (tenant_id) {
      // Get tenant-specific configuration
      const SaaSTenant = require('../models/SaaSTenant');
      const tenant = await SaaSTenant.findOne({ tenant_id });

      if (tenant) {
        WHATSAPP_TOKEN  = tenant.whatsapp_token;
        PHONE_NUMBER_ID = tenant.phone_number_id;
      } else {
        console.log('[SEND WARN] Tenant non trouvé:', tenant_id, '- fallback env vars');
      }
    }

    // Fallback env vars si tenant absent ou champs vides
    if (!WHATSAPP_TOKEN)  WHATSAPP_TOKEN  = ENV_TOKEN();
    if (!PHONE_NUMBER_ID) PHONE_NUMBER_ID = ENV_PHONE_ID();

    if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
      console.log('[SEND ERROR] Missing WHATSAPP_TOKEN or PHONE_NUMBER_ID');
      return;
    }
    
    const apiUrl = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;
    const payload = {
      messaging_product: "whatsapp",
      to: to,
      type: "text",
      text: {
        body: message
      }
    };
    
    console.log('[SENDING MESSAGE]', { to, message });
    
    const response = await axios.post(apiUrl, payload, {
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    console.log('[MESSAGE SENT SUCCESS]', {
      messageId: response.data?.messages?.[0]?.id,
      status: response.status
    });
    
    return response.data;
    
  } catch (error) {
    console.log('[MESSAGE SEND ERROR]', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    throw error;
  }
}

module.exports = {
  getConversation,
  updateConversation,
  sendWhatsAppMessage
};
