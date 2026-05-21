const express = require('express');
const router = express.Router();
const Conversation = require('../models/Conversation');
const Lead = require('../models/Lead');
const { sendWhatsAppMessage } = require('../services/messageSender');
const { v4: uuidv4 } = require('uuid');

// Middleware d'authentification admin (réutilise consoleAuth)
const adminAuth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || token !== process.env.CONSOLE_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// GET /api/admin/chat/conversations - Liste des conversations pour le chat panel
router.get('/conversations', adminAuth, async (req, res) => {
  try {
    const conversations = await Conversation.find({})
      .sort({ lastInteractionAt: -1 })
      .limit(50)
      .select('tenant_id phone lastInteractionAt messages')
      .lean();

    const formattedConversations = conversations.map(conv => ({
      id: conv._id,
      phone: conv.phone,
      tenant_id: conv.tenant_id,
      lastInteraction: conv.lastInteractionAt,
      messageCount: conv.messages?.length || 0,
      lastMessage: conv.messages?.[conv.messages.length - 1] || null,
      mode: conv.messages?.some(msg => msg.sender === 'admin') ? 'HUMAN' : 'IA'
    }));

    res.json({
      success: true,
      conversations: formattedConversations
    });
  } catch (error) {
    console.error('[ADMIN_CHAT] Error fetching conversations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/chat/conversation/:id - Messages d'une conversation spécifique
router.get('/conversation/:id', adminAuth, async (req, res) => {
  try {
    const conversationId = req.params.id;
    const conversation = await Conversation.findById(conversationId)
      .select('messages phone tenant_id lastInteractionAt')
      .lean();

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({
      success: true,
      conversation: {
        id: conversation._id,
        phone: conversation.phone,
        tenant_id: conversation.tenant_id,
        lastInteraction: conversation.lastInteractionAt,
        messages: conversation.messages || []
      }
    });
  } catch (error) {
    console.error('[ADMIN_CHAT] Error fetching conversation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/chat/send - Envoyer un message admin (SAFE)
router.post('/send', adminAuth, async (req, res) => {
  try {
    console.log('[ADMIN_CHAT SEND] Route entry');
    console.log('[ADMIN_CHAT SEND] Body received:', JSON.stringify(req.body, null, 2));
    
    const { phone, message, conversationId, tenant_id } = req.body;
    
    console.log('[ADMIN_CHAT SEND] Parsed params:', { phone, message, conversationId, tenant_id });

    if (!phone || !message) {
      return res.status(400).json({ error: 'Phone and message are required' });
    }

    // Vérifier si le lead existe
    const lead = await Lead.findOne({ phone, tenant_id });
    if (!lead) {
      console.log('[ADMIN_CHAT SEND] Lead not found, continuing with WhatsApp send:', { phone, tenant_id });
      // NE PAS bloquer l'envoi WhatsApp si phone et message valides
      // Fallback safe pour permettre l'envoi même sans Lead Mongo
    }

    // Trouver ou créer la conversation
    let conversation = await Conversation.findOne({ phone, tenant_id });
    if (!conversation) {
      conversation = new Conversation({
        tenant_id,
        phone,
        stage: 'new',
        messages: [],
        lastInteractionAt: new Date()
      });
    }

    // Ajouter le message admin à la conversation
    const adminMessage = {
      sender: 'admin',
      content: message,
      timestamp: new Date(),
      type: 'text'
    };

    conversation.messages.push(adminMessage);
    conversation.lastInteractionAt = new Date();
    await conversation.save();

    // Envoyer le message via WhatsApp (pipeline existant)
    try {
      console.log('[ADMIN_CHAT SEND] Attempting WhatsApp send:', { phone, message, tenant_id });
      await sendWhatsAppMessage(phone, message, tenant_id);
      console.log('[ADMIN_CHAT SEND] WhatsApp send success:', { phone, tenant_id, messageId: adminMessage.id });
    } catch (whatsappError) {
      console.error('[ADMIN_CHAT SEND] WhatsApp send error:', whatsappError);
      console.error('[ADMIN_CHAT SEND] WhatsApp error stack:', whatsappError.stack);
      // Ne pas bloquer l'opération, juste logger
    }

    // Mettre à jour le lead
    if (lead) {
      lead.lastMessage = message;
      lead.status = 'human_interacting';
      lead.lastInteractionAt = new Date();
      await lead.save();
    }

    res.json({
      success: true,
      message: {
        id: adminMessage.id,
        sender: 'admin',
        content: message,
        timestamp: adminMessage.timestamp,
        type: 'text'
      },
      conversationId: conversation._id
    });

  } catch (error) {
    console.error('[ADMIN_CHAT SEND] Main error caught:', error);
    console.error('[ADMIN_CHAT SEND] Error stack:', error.stack);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/chat/takeover - Prendre le contrôle d'une conversation
router.post('/takeover', adminAuth, async (req, res) => {
  try {
    const { conversationId, tenant_id } = req.body;

    if (!conversationId || !tenant_id) {
      return res.status(400).json({ error: 'Conversation ID and tenant ID are required' });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Marquer la conversation comme prise en charge par un humain
    conversation.mode = 'HUMAN';
    conversation.takenOverAt = new Date();
    conversation.takenOverBy = 'admin';
    await conversation.save();

    // Mettre à jour le lead correspondant
    const lead = await Lead.findOne({ phone: conversation.phone, tenant_id });
    if (lead) {
      lead.status = 'human_takeover';
      lead.lastInteractionAt = new Date();
      await lead.save();
    }

    res.json({
      success: true,
      message: 'Conversation taken over successfully',
      mode: 'HUMAN'
    });

  } catch (error) {
    console.error('[ADMIN_CHAT] Error taking over conversation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/chat/release - Relâcher une conversation vers l'IA
router.post('/release', adminAuth, async (req, res) => {
  try {
    const { conversationId, tenant_id } = req.body;

    if (!conversationId || !tenant_id) {
      return res.status(400).json({ error: 'Conversation ID and tenant ID are required' });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Marquer la conversation comme retournée à l'IA
    conversation.mode = 'IA';
    conversation.releasedAt = new Date();
    conversation.releasedBy = 'admin';
    await conversation.save();

    // Mettre à jour le lead correspondant
    const lead = await Lead.findOne({ phone: conversation.phone, tenant_id });
    if (lead) {
      lead.status = 'active';
      lead.lastInteractionAt = new Date();
      await lead.save();
    }

    res.json({
      success: true,
      message: 'Conversation released to AI successfully',
      mode: 'IA'
    });

  } catch (error) {
    console.error('[ADMIN_CHAT] Error releasing conversation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/chat/status - Statut du chat panel
router.get('/status', adminAuth, async (req, res) => {
  try {
    const { tenant_id } = req.query;
    
    const stats = await Conversation.aggregate([
      { $match: tenant_id ? { tenant_id } : {} },
      {
        $group: {
          _id: null,
          totalConversations: { $sum: 1 },
          activeConversations: {
            $sum: { $cond: [{ $eq: ['$mode', 'HUMAN'] }, 1, 0] }
          },
          iaConversations: {
            $sum: { $cond: [{ $eq: ['$mode', 'IA'] }, 1, 0] }
          },
          totalMessages: { $sum: { $size: '$messages' } }
        }
      }
    ]);

    res.json({
      success: true,
      status: stats[0] || {
        totalConversations: 0,
        activeConversations: 0,
        iaConversations: 0,
        totalMessages: 0
      }
    });

  } catch (error) {
    console.error('[ADMIN_CHAT] Error fetching status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ÉTAPE 4 - Test route admin directe pour diagnostic Railway
router.get('/debug', (req, res) => {
  console.log('[ADMIN DEBUG] /api/admin/debug called');
  res.json({ 
    ok: true, 
    message: 'Admin routes are mounted', 
    timestamp: new Date().toISOString(),
    routes: ['conversations', 'conversation/:id', 'send', 'takeover', 'release', 'status', 'debug']
  });
});

module.exports = router;
