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

async function sendWhatsAppMessage(to, message) {
  try {
    const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
    const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
    
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
