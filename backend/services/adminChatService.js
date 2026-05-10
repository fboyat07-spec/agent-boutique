const Conversation = require('../models/Conversation');
const Lead = require('../models/Lead');
const { sendWhatsAppMessage } = require('./whatsappService');

class AdminChatService {
  constructor() {
    this.activeConnections = new Map(); // Pour le temps réel
  }

  // Service SAFE - utilise uniquement le workflow existant
  async sendAdminMessage(phone, message, tenant_id, adminId = 'system') {
    try {
      console.log('[ADMIN_CHAT_SERVICE] Sending admin message:', { phone, tenant_id, adminId });

      // Vérifier si le lead existe
      const lead = await Lead.findOne({ phone, tenant_id });
      if (!lead) {
        throw new Error('Lead not found');
      }

      // Trouver ou créer la conversation
      let conversation = await Conversation.findOne({ phone, tenant_id });
      if (!conversation) {
        conversation = new Conversation({
          tenant_id,
          phone,
          stage: 'active',
          messages: [],
          lastInteractionAt: new Date()
        });
      }

      // Ajouter le message admin à la conversation
      const adminMessage = {
        id: require('uuid').v4(),
        sender: 'admin',
        senderId: adminId,
        content: message,
        timestamp: new Date(),
        type: 'text',
        metadata: {
          source: 'admin_panel',
          human_takeover: conversation.mode === 'HUMAN'
        }
      };

      conversation.messages.push(adminMessage);
      conversation.lastInteractionAt = new Date();
      
      // Marquer comme conversation humaine active
      conversation.mode = 'HUMAN';
      conversation.takenOverAt = new Date();
      conversation.takenOverBy = adminId;
      
      await conversation.save();

      // Envoyer via le pipeline WhatsApp existant (SAFE)
      try {
        await sendWhatsAppMessage(phone, message, tenant_id);
        console.log('[ADMIN_CHAT_SERVICE] WhatsApp send successful:', { phone, messageId: adminMessage.id });
      } catch (whatsappError) {
        console.error('[ADMIN_CHAT_SERVICE] WhatsApp send failed:', whatsappError);
        // Ne pas bloquer l'opération, juste logger
      }

      // Mettre à jour le lead
      lead.lastMessage = message;
      lead.status = 'human_interacting';
      lead.lastInteractionAt = new Date();
      lead.metadata = lead.metadata || {};
      lead.metadata.lastAdminInteraction = {
        timestamp: new Date(),
        adminId,
        messageId: adminMessage.id
      };
      await lead.save();

      // Notifier les connections temps réel
      this.notifyActiveConnections(tenant_id, {
        type: 'new_message',
        conversationId: conversation._id,
        message: adminMessage
      });

      return {
        success: true,
        messageId: adminMessage.id,
        conversationId: conversation._id,
        timestamp: adminMessage.timestamp
      };

    } catch (error) {
      console.error('[ADMIN_CHAT_SERVICE] Error sending admin message:', error);
      throw error;
    }
  }

  // Prendre le contrôle d'une conversation (HUMAN takeover)
  async takeOverConversation(conversationId, tenant_id, adminId = 'system') {
    try {
      console.log('[ADMIN_CHAT_SERVICE] Taking over conversation:', { conversationId, tenant_id, adminId });

      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        throw new Error('Conversation not found');
      }

      // Marquer comme prise en charge par humain
      conversation.mode = 'HUMAN';
      conversation.takenOverAt = new Date();
      conversation.takenOverBy = adminId;
      conversation.lastInteractionAt = new Date();
      await conversation.save();

      // Mettre à jour le lead
      const lead = await Lead.findOne({ phone: conversation.phone, tenant_id });
      if (lead) {
        lead.status = 'human_takeover';
        lead.lastInteractionAt = new Date();
        lead.metadata = lead.metadata || {};
        lead.metadata.takeoverHistory = lead.metadata.takeoverHistory || [];
        lead.metadata.takeoverHistory.push({
          timestamp: new Date(),
          adminId,
          conversationId: conversation._id
        });
        await lead.save();
      }

      // Notifier les connections temps réel
      this.notifyActiveConnections(tenant_id, {
        type: 'takeover',
        conversationId: conversation._id,
        mode: 'HUMAN',
        adminId
      });

      return {
        success: true,
        conversationId: conversation._id,
        mode: 'HUMAN',
        takenOverAt: conversation.takenOverAt
      };

    } catch (error) {
      console.error('[ADMIN_CHAT_SERVICE] Error taking over conversation:', error);
      throw error;
    }
  }

  // Relâcher une conversation vers l'IA
  async releaseConversation(conversationId, tenant_id, adminId = 'system') {
    try {
      console.log('[ADMIN_CHAT_SERVICE] Releasing conversation:', { conversationId, tenant_id, adminId });

      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        throw new Error('Conversation not found');
      }

      // Marquer comme retournée à l'IA
      conversation.mode = 'IA';
      conversation.releasedAt = new Date();
      conversation.releasedBy = adminId;
      conversation.lastInteractionAt = new Date();
      await conversation.save();

      // Mettre à jour le lead
      const lead = await Lead.findOne({ phone: conversation.phone, tenant_id });
      if (lead) {
        lead.status = 'active';
        lead.lastInteractionAt = new Date();
        lead.metadata = lead.metadata || {};
        lead.metadata.releaseHistory = lead.metadata.releaseHistory || [];
        lead.metadata.releaseHistory.push({
          timestamp: new Date(),
          adminId,
          conversationId: conversation._id
        });
        await lead.save();
      }

      // Notifier les connections temps réel
      this.notifyActiveConnections(tenant_id, {
        type: 'release',
        conversationId: conversation._id,
        mode: 'IA',
        adminId
      });

      return {
        success: true,
        conversationId: conversation._id,
        mode: 'IA',
        releasedAt: conversation.releasedAt
      };

    } catch (error) {
      console.error('[ADMIN_CHAT_SERVICE] Error releasing conversation:', error);
      throw error;
    }
  }

  // Obtenir les conversations pour le chat panel
  async getConversations(tenant_id, limit = 50) {
    try {
      const conversations = await Conversation.find(
        tenant_id ? { tenant_id } : {}
      )
        .sort({ lastInteractionAt: -1 })
        .limit(limit)
        .select('tenant_id phone lastInteractionAt messages mode takenOverAt releasedAt')
        .lean();

      return conversations.map(conv => ({
        id: conv._id,
        phone: conv.phone,
        tenant_id: conv.tenant_id,
        lastInteraction: conv.lastInteractionAt,
        messageCount: conv.messages?.length || 0,
        lastMessage: conv.messages?.[conv.messages.length - 1] || null,
        mode: conv.mode || 'IA',
        takenOverAt: conv.takenOverAt,
        releasedAt: conv.releasedAt,
        isActive: conv.mode === 'HUMAN'
      }));

    } catch (error) {
      console.error('[ADMIN_CHAT_SERVICE] Error fetching conversations:', error);
      throw error;
    }
  }

  // Obtenir une conversation spécifique avec tous les messages
  async getConversation(conversationId, tenant_id) {
    try {
      const conversation = await Conversation.findById(conversationId)
        .select('messages phone tenant_id lastInteractionAt mode takenOverAt releasedAt')
        .lean();

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      if (tenant_id && conversation.tenant_id !== tenant_id) {
        throw new Error('Unauthorized access to conversation');
      }

      return {
        id: conversation._id,
        phone: conversation.phone,
        tenant_id: conversation.tenant_id,
        lastInteraction: conversation.lastInteractionAt,
        messages: conversation.messages || [],
        mode: conversation.mode || 'IA',
        takenOverAt: conversation.takenOverAt,
        releasedAt: conversation.releasedAt,
        isActive: conversation.mode === 'HUMAN'
      };

    } catch (error) {
      console.error('[ADMIN_CHAT_SERVICE] Error fetching conversation:', error);
      throw error;
    }
  }

  // Obtenir les statistiques du chat panel
  async getChatStats(tenant_id) {
    try {
      const stats = await Conversation.aggregate([
        { $match: tenant_id ? { tenant_id } : {} },
        {
          $group: {
            _id: null,
            totalConversations: { $sum: 1 },
            humanActiveConversations: {
              $sum: { $cond: [{ $eq: ['$mode', 'HUMAN'] }, 1, 0] }
            },
            iaActiveConversations: {
              $sum: { $cond: [{ $eq: ['$mode', 'IA'] }, 1, 0] }
            },
            totalMessages: { $sum: { $size: '$messages' } },
            adminMessages: {
              $sum: {
                $size: {
                  $filter: {
                    input: '$messages',
                    cond: { $eq: ['$$this.sender', 'admin'] }
                  }
                }
              }
            }
          }
        }
      ]);

      return stats[0] || {
        totalConversations: 0,
        humanActiveConversations: 0,
        iaActiveConversations: 0,
        totalMessages: 0,
        adminMessages: 0
      };

    } catch (error) {
      console.error('[ADMIN_CHAT_SERVICE] Error fetching stats:', error);
      throw error;
    }
  }

  // Gestion des connections temps réel
  addActiveConnection(tenant_id, socketId) {
    if (!this.activeConnections.has(tenant_id)) {
      this.activeConnections.set(tenant_id, new Set());
    }
    this.activeConnections.get(tenant_id).add(socketId);
    console.log('[ADMIN_CHAT_SERVICE] Active connection added:', { tenant_id, socketId });
  }

  removeActiveConnection(tenant_id, socketId) {
    if (this.activeConnections.has(tenant_id)) {
      this.activeConnections.get(tenant_id).delete(socketId);
      if (this.activeConnections.get(tenant_id).size === 0) {
        this.activeConnections.delete(tenant_id);
      }
    }
    console.log('[ADMIN_CHAT_SERVICE] Active connection removed:', { tenant_id, socketId });
  }

  // Notifier les connections actives
  notifyActiveConnections(tenant_id, data) {
    if (this.activeConnections.has(tenant_id)) {
      const connections = this.activeConnections.get(tenant_id);
      console.log('[ADMIN_CHAT_SERVICE] Notifying connections:', { tenant_id, connectionCount: connections.size, data });
      
      // La notification réelle se fera via WebSocket dans la route
      return {
        notified: true,
        connectionCount: connections.size,
        data
      };
    }
    return { notified: false, connectionCount: 0 };
  }

  // Obtenir l'historique des messages admin
  async getAdminMessageHistory(conversationId, tenant_id, limit = 100) {
    try {
      const conversation = await Conversation.findById(conversationId)
        .select('messages')
        .lean();

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      if (tenant_id && conversation.tenant_id !== tenant_id) {
        throw new Error('Unauthorized access to conversation');
      }

      // Filtrer uniquement les messages admin
      const adminMessages = (conversation.messages || [])
        .filter(msg => msg.sender === 'admin')
        .slice(-limit)
        .map(msg => ({
          id: msg.id,
          content: msg.content,
          timestamp: msg.timestamp,
          type: msg.type,
          senderId: msg.senderId,
          metadata: msg.metadata
        }));

      return adminMessages;

    } catch (error) {
      console.error('[ADMIN_CHAT_SERVICE] Error fetching admin message history:', error);
      throw error;
    }
  }
}

module.exports = new AdminChatService();
