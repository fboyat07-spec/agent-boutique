const { sendWhatsAppMessage } = require('./messageSender');

// Envoyer un lien de paiement Stripe EXISTANT
async function sendPaymentLink(phone) {
  try {
    // Utiliser le lien Stripe EXISTANT de l'environnement
    const paymentLink = process.env.STRIPE_PAYMENT_LINK;
    
    if (!paymentLink) {
      console.log('[OUTBOUND PAYMENT] No STRIPE_PAYMENT_LINK in environment');
      return { success: false, error: 'Payment link not configured' };
    }
    
    const message = `Je peux t'activer ça maintenant 👉 ${paymentLink}`;
    
    console.log('[OUTBOUND PAYMENT] Sending payment link', {
      phone,
      paymentLink
    });
    
    // Utiliser sendWhatsAppMessage EXISTANT - NE PAS MODIFIER
    await sendWhatsAppMessage(phone, message);
    
    console.log('[OUTBOUND PAYMENT] Payment link sent', {
      phone
    });
    
    return { success: true, message, paymentLink };
    
  } catch (error) {
    console.error('[OUTBOUND PAYMENT ERROR]', {
      phone,
      error: error.message
    });
    
    return { success: false, error: error.message };
  }
}

// Envoyer un message de suivi de paiement
async function sendPaymentFollowUp(phone) {
  try {
    const paymentLink = process.env.STRIPE_PAYMENT_LINK;
    
    if (!paymentLink) {
      return { success: false, error: 'Payment link not configured' };
    }
    
    const message = `Tu veux toujours plus de clients ? Je peux t'activer l'automatisation aujourd'hui 👉 ${paymentLink}`;
    
    console.log('[OUTBOUND PAYMENT] Sending payment follow-up', { phone });
    
    await sendWhatsAppMessage(phone, message);
    
    console.log('[OUTBOUND PAYMENT] Payment follow-up sent', { phone });
    
    return { success: true, message };
    
  } catch (error) {
    console.error('[OUTBOUND PAYMENT FOLLOW-UP ERROR]', error.message);
    return { success: false, error: error.message };
  }
}

// Envoyer une confirmation de paiement reçu
async function sendPaymentConfirmation(phone) {
  try {
    const message = "Super ! C'est activé. Tu vas recevoir tes premiers clients automatiquement dans les prochaines heures.";
    
    console.log('[OUTBOUND PAYMENT] Sending payment confirmation', { phone });
    
    await sendWhatsAppMessage(phone, message);
    
    console.log('[OUTBOUND PAYMENT] Payment confirmation sent', { phone });
    
    return { success: true, message };
    
  } catch (error) {
    console.error('[OUTBOUND PAYMENT CONFIRMATION ERROR]', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendPaymentLink,
  sendPaymentFollowUp,
  sendPaymentConfirmation
};
