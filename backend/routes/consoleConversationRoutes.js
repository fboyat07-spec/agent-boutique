// Console Conversation Routes - READ ONLY SAFE EXTENSION
// Permet la visualisation live des conversations sans impacter le workflow

const express = require('express');
const router = express.Router();
const Conversation = require('../models/Conversation');
const Lead = require('../models/Lead');

// Middleware d'auth console (réutilisé depuis les routes existantes)
const consoleAuth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || token !== 'console_admin_2024') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// GET /api/console/conversations - Liste des conversations récentes (READ ONLY)
router.get('/conversations', consoleAuth, async (req, res) => {
  try {
    const conversations = await Conversation.find({})
      .sort({ lastInteractionAt: -1 })
      .limit(50)
      .select('phone stage lastInteractionAt score messages metadata')
      .lean();

    // Enrichir avec infos Lead si disponible
    const enriched = await Promise.all(conversations.map(async conv => {
      const lead = await Lead.findOne({ phone: conv.phone })
        .select('name businessType status lastMessage')
        .lean();
      
      return {
        id: conv._id,
        phone: conv.phone,
        name: lead?.name || 'Client',
        businessType: lead?.businessType || null,
        stage: conv.stage,
        score: conv.score,
        status: lead?.status || 'new',
        lastInteractionAt: conv.lastInteractionAt,
        lastMessage: conv.messages[conv.messages.length - 1]?.content || lead?.lastMessage || '',
        messageCount: conv.messages.length,
        tags: conv.metadata?.tags || []
      };
    }));

    res.json({
      conversations: enriched,
      total: enriched.length
    });
  } catch (error) {
    console.error('[CONSOLE CONVERSATIONS ERROR]', error);
    res.status(500).json({ error: 'Failed to load conversations' });
  }
});

// GET /api/console/conversation/:id - Détails d'une conversation (READ ONLY)
router.get('/conversation/:id', consoleAuth, async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id)
      .select('phone stage lastInteractionAt score messages followUps metadata')
      .lean();

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Enrichir avec infos Lead
    const lead = await Lead.findOne({ phone: conversation.phone })
      .select('name businessType status budget region source createdAt')
      .lean();

    const response = {
      id: conversation._id,
      phone: conversation.phone,
      name: lead?.name || 'Client',
      businessType: lead?.businessType || null,
      region: lead?.region || null,
      stage: conversation.stage,
      score: conversation.score,
      status: lead?.status || 'new',
      budget: lead?.budget || null,
      source: lead?.source || 'unknown',
      createdAt: lead?.createdAt || conversation.lastInteractionAt,
      lastInteractionAt: conversation.lastInteractionAt,
      avgResponseTime: conversation.avgResponseTime,
      tags: conversation.metadata?.tags || [],
      messages: conversation.messages.map(msg => ({
        content: msg.content,
        sender: msg.sender,
        timestamp: msg.timestamp,
        type: msg.type
      })),
      followUps: conversation.followUps || [],
      stats: {
        messageCount: conversation.messages.length,
        followUpCount: conversation.followUps?.length || 0,
        avgResponseTime: conversation.avgResponseTime || 0
      }
    };

    res.json(response);
  } catch (error) {
    console.error('[CONSOLE CONVERSATION ERROR]', error);
    res.status(500).json({ error: 'Failed to load conversation' });
  }
});

// GET /api/console/conversations/stats - Stats conversations (READ ONLY)
router.get('/conversations/stats', consoleAuth, async (req, res) => {
  try {
    const [
      totalConversations,
      activeToday,
      byStage,
      avgScore,
      recentMessages
    ] = await Promise.all([
      Conversation.countDocuments(),
      Conversation.countDocuments({ 
        lastInteractionAt: { $gte: new Date(Date.now() - 24*60*60*1000) }
      }),
      Conversation.aggregate([
        { $group: { _id: '$stage', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      Conversation.aggregate([
        { $group: { _id: null, avgScore: { $avg: '$score' } } }
      ]),
      Conversation.aggregate([
        { $unwind: '$messages' },
        { $match: { 'messages.timestamp': { $gte: new Date(Date.now() - 24*60*60*1000) } } },
        { $count: 'total' }
      ])
    ]);

    res.json({
      totalConversations,
      activeToday,
      avgScore: avgScore[0]?.avgScore || 0,
      recentMessages: recentMessages[0]?.total || 0,
      stageBreakdown: byStage.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {})
    });
  } catch (error) {
    console.error('[CONSOLE STATS ERROR]', error);
    res.status(500).json({ error: 'Failed to load conversation stats' });
  }
});

module.exports = router;
