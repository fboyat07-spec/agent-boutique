const Conversation = require('../models/Conversation');
const crypto = require('crypto');

// ACTION 6 - Mémoire contexte conversation (limitée)
if (!global.conversationMemory) {
  global.conversationMemory = new Map();
}

// Clé limitée pour éviter stockage infini
function getConversationKey(phone, tenant_id) {
  const phoneHash = crypto.createHash('sha256').update(phone).digest('hex').slice(0, 8);
  return `conv_${phoneHash}_${tenant_id}`;
}

// Ajouter message à la conversation
function addMessage(phone, tenant_id, message, sender = 'user') {
  const key = getConversationKey(phone, tenant_id);
  
  if (!global.conversationMemory.has(key)) {
    global.conversationMemory.set(key, {
      phone,
      tenant_id,
      messages: [],
      createdAt: new Date(),
      lastUpdated: new Date()
    });
  }
  
  const conversation = global.conversationMemory.get(key);
  
  const messageObj = {
    content: message,
    sender, // 'user' ou 'agent'
    timestamp: new Date(),
    type: detectMessageType(message)
  };
  
  // Ajouter message
  conversation.messages.push(messageObj);
  
  // ACTION 6 - Limiter taille mémoire (max 5 messages)
  if (conversation.messages.length > 5) {
    conversation.messages = conversation.messages.slice(-5);
  }
  
  conversation.lastUpdated = new Date();
  
  console.log('[CONVERSATION_MESSAGE_ADDED]', {
    phone: phone.substring(0, -4) + '****',
    tenant_id,
    sender,
    messageCount: conversation.messages.length,
    type: messageObj.type
  });
  
  return conversation;
}

// Récupérer conversation
function getConversation(phone, tenant_id) {
  const key = getConversationKey(phone, tenant_id);
  return global.conversationMemory.get(key) || null;
}

// Obtenir derniers messages (contexte)
function getLastMessages(phone, tenant_id, limit = 3) {
  const conversation = getConversation(phone, tenant_id);
  
  if (!conversation) {
    return [];
  }
  
  return conversation.messages.slice(-limit);
}

// Obtenir contexte formaté pour IA
function getConversationContext(phone, tenant_id) {
  const messages = getLastMessages(phone, tenant_id, 5);
  
  if (messages.length === 0) {
    return null;
  }
  
  const context = {
    phone,
    tenant_id,
    messageCount: messages.length,
    lastActivity: messages[messages.length - 1].timestamp,
    conversationFlow: messages.map(m => ({
      sender: m.sender,
      type: m.type,
      timestamp: m.timestamp,
      content: m.content.substring(0, 100) + (m.content.length > 100 ? '...' : '')
    }))
  };
  
  // Analyser pattern de conversation
  context.pattern = analyzeConversationPattern(messages);
  context.sentiment = analyzeSentiment(messages);
  context.engagement = analyzeEngagement(messages);
  
  return context;
}

// Détecter type de message
function detectMessageType(message) {
  const lower = message.toLowerCase();
  
  // Questions
  if (lower.includes('?') || lower.startsWith('comment') || lower.startsWith('pourquoi') || lower.startsWith('quoi')) {
    return 'question';
  }
  
  // Affirmations positives
  if (lower.includes('oui') || lower.includes('ok') || lower.includes('super') || lower.includes('parfait')) {
    return 'positive_affirmation';
  }
  
  // Négations/objections
  if (lower.includes('non') || lower.includes('pas') || lower.includes('refuse') || lower.includes('intéressé pas')) {
    return 'objection';
  }
  
  // Demande d'information
  if (lower.includes('savoir') || lower.includes('information') || lower.includes('détails') || lower.includes('explique')) {
    return 'info_request';
  }
  
  // Prêt à acheter
  if (lower.includes('acheter') || lower.includes('payer') || lower.includes('commander') || lower.includes('finaliser')) {
    return 'buying_intent';
  }
  
  // Salutations
  if (lower.includes('bonjour') || lower.includes('salut') || lower.includes('hello') || lower.includes('hi')) {
    return 'greeting';
  }
  
  // Remerciements
  if (lower.includes('merci') || lower.includes('thanks')) {
    return 'thanks';
  }
  
  return 'general';
}

// Analyser pattern de conversation
function analyzeConversationPattern(messages) {
  if (messages.length < 2) {
    return 'insufficient_data';
  }
  
  const types = messages.map(m => m.type);
  const userMessages = messages.filter(m => m.sender === 'user');
  
  // Pattern question-réponse
  if (types.includes('question') && types.some(t => ['info_request', 'general'].includes(t))) {
    return 'qa_pattern';
  }
  
  // Pattern d'objection
  if (types.includes('objection')) {
    return 'objection_pattern';
  }
  
  // Pattern d'achat
  if (types.includes('buying_intent')) {
    return 'buying_pattern';
  }
  
  // Pattern engagement
  if (userMessages.length >= 2 && !types.includes('objection')) {
    return 'engagement_pattern';
  }
  
  return 'general_pattern';
}

// Analyser sentiment
function analyzeSentiment(messages) {
  const userMessages = messages.filter(m => m.sender === 'user');
  
  if (userMessages.length === 0) {
    return 'neutral';
  }
  
  const positiveTypes = ['positive_affirmation', 'buying_intent', 'thanks'];
  const negativeTypes = ['objection'];
  
  let positiveCount = 0;
  let negativeCount = 0;
  
  for (const msg of userMessages) {
    if (positiveTypes.includes(msg.type)) positiveCount++;
    if (negativeTypes.includes(msg.type)) negativeCount++;
  }
  
  if (positiveCount > negativeCount) {
    return 'positive';
  } else if (negativeCount > positiveCount) {
    return 'negative';
  } else {
    return 'neutral';
  }
}

// Analyser engagement
function analyzeEngagement(messages) {
  const userMessages = messages.filter(m => m.sender === 'user');
  
  if (userMessages.length === 0) {
    return 'low';
  }
  
  // Longueur moyenne des messages utilisateur
  const avgLength = userMessages.reduce((sum, m) => sum + m.content.length, 0) / userMessages.length;
  
  // Types de messages engagés
  const engagingTypes = ['question', 'info_request', 'buying_intent'];
  const engagingCount = userMessages.filter(m => engagingTypes.includes(m.type)).length;
  
  const engagementScore = (avgLength / 50) + (engagingCount * 0.3);
  
  if (engagementScore > 2) {
    return 'high';
  } else if (engagementScore > 1) {
    return 'medium';
  } else {
    return 'low';
  }
}

// Netoyer anciennes conversations (plus de 7 jours)
function cleanupOldConversations() {
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  let cleaned = 0;
  
  for (const [key, conversation] of global.conversationMemory.entries()) {
    if (conversation.lastUpdated.getTime() < sevenDaysAgo) {
      global.conversationMemory.delete(key);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log('[CONVERSATION_CLEANUP]', { cleaned });
  }
  
  return cleaned;
}

// Stats mémoire conversation
function getConversationMemoryStats() {
  const stats = {
    totalConversations: global.conversationMemory.size,
    totalMessages: 0,
    avgMessagesPerConversation: 0,
    memoryUsage: 0,
    oldestConversation: null,
    newestConversation: null
  };
  
  let oldestTime = Date.now();
  let newestTime = 0;
  
  for (const [key, conversation] of global.conversationMemory.entries()) {
    stats.totalMessages += conversation.messages.length;
    
    const updateTime = conversation.lastUpdated.getTime();
    if (updateTime < oldestTime) {
      oldestTime = updateTime;
      stats.oldestConversation = new Date(updateTime);
    }
    if (updateTime > newestTime) {
      newestTime = updateTime;
      stats.newestConversation = new Date(updateTime);
    }
    
    // Estimer usage mémoire (très approximatif)
    stats.memoryUsage += JSON.stringify(conversation).length;
  }
  
  stats.avgMessagesPerConversation = stats.totalConversations > 0 ? 
    stats.totalMessages / stats.totalConversations : 0;
  
  return stats;
}

async function getHistory(phone) {
  const conv = await Conversation.findOne({ phone }).sort({ updatedAt: -1 });
  return conv?.messages?.slice(-5) || [];
}

async function saveMessage(phone, role, content) {
  let conv = await Conversation.findOne({ phone });

  if (!conv) {
    conv = await Conversation.create({
      phone,
      messages: []
    });
  }

  conv.messages.push({
    role,
    content,
    createdAt: new Date()
  });

  await conv.save();
}

// Exporter les fonctions
module.exports = {
  addMessage,
  getConversation,
  getLastMessages,
  getConversationContext,
  cleanupOldConversations,
  getConversationMemoryStats,
  getHistory,
  saveMessage
};
