const OutboundLead = require('../models/OutboundLead');
const { sendPaymentLink } = require('./outboundPayment');
const { generateReply } = require('./aiCloser');
const { decideAction } = require('./aiDecisionEngine');
const { trackEvent } = require('./aiAnalytics');

// Mettre à jour le statut d'un lead selon sa réponse
async function updateLeadStatus(leadId, userReply) {
  try {
    const lead = await OutboundLead.findById(leadId);
    if (!lead) {
      console.log('[PIPELINE] Lead not found', { leadId });
      return null;
    }
    
    const oldStatus = lead.status;
    let newStatus = oldStatus;
    let nextFollowUpDelay = null;
    
    // Logique simple de qualification avec normalisation
    const normalized = userReply.toLowerCase().trim();
    
    console.log('[PIPELINE INBOUND]', { phone: lead.phone, message: normalized });
    
    // Réponses positives -> INTERESTED (normalisé)
    if (normalized.includes('oui') || normalized.includes('interesse') || normalized.includes('ok')) {
      if (oldStatus === 'NEW' || oldStatus === 'CONTACTED') {
        newStatus = 'INTERESTED';
        nextFollowUpDelay = 24 * 60 * 60 * 1000; // J+1
      }
    }
    
    // Réponses de prix/paiement -> CLOSING (normalisé)
    if (normalized.includes('prix') || normalized.includes('combien') || normalized.includes('coût') || normalized.includes('tarif')) {
      if (oldStatus === 'INTERESTED' || oldStatus === 'CONTACTED') {
        newStatus = 'CLOSING';
        nextFollowUpDelay = 3 * 24 * 60 * 60 * 1000; // J+3
        
        // Envoyer le lien de paiement automatiquement
        await sendPaymentLink(lead.phone);
      }
    }
    
    // Réponses d'achat -> WON
    if (reply.includes('acheter') || reply.includes('prends') || reply.includes('commande') || reply.includes('je veux')) {
      newStatus = 'WON';
      console.log('[PIPELINE] LEAD WON!', { leadId, phone: lead.phone });
    }
    
    // Hiérarchie des statuts - éviter régression
    const statusPriority = {
      NEW: 1,
      CONTACTED: 2,
      INTERESTED: 3,
      CLOSING: 4,
      WON: 5
    };
    
    if (newStatus && statusPriority[newStatus] < statusPriority[lead.status]) {
      console.log('[STATUS REGRESSION BLOCKED]', {
        from: lead.status,
        attempted: newStatus
      });
      
      newStatus = lead.status;
    }
    
    // Si le statut change, mettre à jour
    if (newStatus !== oldStatus) {
      const updateData = {
        status: newStatus,
        updatedAt: new Date()
      };
      
      if (nextFollowUpDelay) {
        updateData.nextFollowUpAt = new Date(Date.now() + nextFollowUpDelay);
      }
      
      await OutboundLead.findByIdAndUpdate(leadId, updateData);
      
      console.log('[PIPELINE STATUS UPDATE]', { 
        phone: lead.phone, 
        oldStatus, 
        newStatus,
        nextFollowUpAt: updateData.nextFollowUpAt 
      });
      
      // Logs critiques - état pipeline sécurisé
      console.log('[PIPELINE SAFE STATE]', {
        phone: lead.phone,
        oldStatus,
        newStatus
      });
      
      // Trigger paiement automatique si CLOSING (anti duplication)
      if (newStatus === 'CLOSING' && oldStatus !== 'CLOSING') {
        // Sécurité paiement link
        if (!process.env.STRIPE_PAYMENT_LINK) {
          console.log('[PAYMENT LINK ERROR] Missing STRIPE_PAYMENT_LINK');
          return;
        }
        
        const { sendWhatsAppMessage } = require('./messageSender');
        
        await sendWhatsAppMessage(
          lead.phone,
          "Voici le lien pour activer le service : " + process.env.STRIPE_PAYMENT_LINK
        );
        
        console.log('[AUTO PAYMENT LINK SENT]', {
          phone: lead.phone
        });
      }
    }
    
    return { oldStatus, newStatus };
    
  } catch (error) {
    console.error('[PIPELINE ERROR]', error.message);
    throw error;
  }
}

// Traiter une réponse entrante (appelé depuis webhook inbound)
async function processIncomingReply(phone, message) {
  try {
    // Anti spam inbound - détection doublons webhook avec fenêtre temporelle
    const ProcessedMessage = require('../models/ProcessedMessage');
    const normalized = message.toLowerCase().trim();
    
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    const exists = await ProcessedMessage.findOne({
      message: normalized,
      phone: phone,
      createdAt: { $gt: fiveMinutesAgo }
    });
    
    if (exists) {
      console.log('[DUPLICATE MESSAGE BLOCKED - WINDOW]', { phone });
      return;
    }
    
    await ProcessedMessage.create({
      phone: phone,
      message: normalized,
      createdAt: new Date()
    });
    
    // Trouver le lead par téléphone
    const lead = await OutboundLead.findOne({ phone });
    
    if (!lead) {
      console.log('[PIPELINE] No lead found for phone', { phone });
      return null;
    }
    
    // Bloquer après conversion - vérifier statut WON
    if (lead.status === 'WON') {
      console.log('[PIPELINE BLOCKED - ALREADY WON]', { phone: lead.phone });
      return;
    }
    
    // Mettre à jour selon la réponse
    const result = await updateLeadStatus(lead._id, message);
    
    // ACTION 3 - Décision IA autonome
    const action = await decideAction({ lead, message: normalized });
    
    console.log('[AI DECISION]', { action });
    
    // Tracking événement
    await trackEvent({
      phone: lead.phone,
      event: action
    });
    
    if (action === 'wait') return;
    
    if (action === 'send_payment') {
      const { sendWhatsAppMessage } = require('./messageSender');
      await sendWhatsAppMessage(
        lead.phone,
        "Voici le lien pour activer : " + process.env.STRIPE_PAYMENT_LINK
      );
      console.log('[AI AUTO PAYMENT SENT]');
      return;
    }
    
    // Follow-up intelligent
    if (action === 'follow_up') {
      setTimeout(async () => {
        const { sendWhatsAppMessage } = require('./messageSender');
        await sendWhatsAppMessage(
          lead.phone,
          "Je me permets de revenir vers toi 👍"
        );

        console.log('[AI FOLLOW-UP SENT]', { phone: lead.phone });
      }, 3600000); // 1h
    }
    
    // ACTION 3 - Utiliser IA avec fallback
    let aiReply = null;
    
    try {
      aiReply = await generateReply({
        message: normalized,
        lead
      });
    } catch (e) {
      console.log('[AI FALLBACK]', e.message);
    }
    
    // Réponse par défaut selon le statut
    let defaultReply = "Merci pour votre réponse.";
    if (lead.status === 'INTERESTED') {
      defaultReply = "Super ! Je vais vous préparer une offre personnalisée.";
    } else if (lead.status === 'CLOSING') {
      defaultReply = "Parfait ! Voici le lien pour finaliser : " + process.env.STRIPE_PAYMENT_LINK;
    }
    
    const finalReply = aiReply || defaultReply;
    
    // ACTION 4 - Envoi message IA
    if (finalReply && finalReply !== defaultReply || lead.status === 'CLOSING') {
      const { sendWhatsAppMessage } = require('./messageSender');
      
      await sendWhatsAppMessage(lead.phone, finalReply);
      
      // ACTION 5 - Logs AI
      console.log('[AI REPLY GENERATED]', {
        phone: lead.phone,
        usedAI: !!aiReply,
        status: lead.status
      });
    }
    
    console.log('[PIPELINE] Reply processed', {
      leadId: lead._id,
      phone,
      message,
      statusChange: result
    });
    
    return result;
    
  } catch (error) {
    console.error('[PIPELINE INCOMING ERROR]', error.message);
    throw error;
  }
}

// Obtenir les statistiques du pipeline
async function getPipelineStats() {
  try {
    const stats = await OutboundLead.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          status: '$_id',
          count: '$count',
          _id: 0
        }
      }
    ]);
    
    const totalLeads = await OutboundLead.countDocuments();
    const contactedToday = await OutboundLead.countDocuments({
      lastContactAt: { 
        $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) 
      }
    });
    
    return {
      totalLeads,
      contactedToday,
      statusBreakdown: stats
    };
    
  } catch (error) {
    console.error('[PIPELINE STATS ERROR]', error.message);
    return null;
  }
}

module.exports = {
  updateLeadStatus,
  processIncomingReply,
  getPipelineStats
};
