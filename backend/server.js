console.log("SERVER FINAL UNIQUE");

// Core Express setup - IMMEDIATE START
const express = require('express');
const cors = require('cors');
const app = express();

// GLOBAL REQUEST LOGGER - DEBUG RAILWAY HEALTHCHECK
app.use((req, res, next) => {
  console.log('[REQUEST]', req.method, req.url);
  next();
});

// HEALTH ROUTE - MUST BE FIRST
app.get('/health', (req, res) => {
  console.log('[HEALTH ROUTE HIT]');
  res.status(200).send("OK");
});

// START SERVER IMMEDIATELY
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVER START] Server listening on 0.0.0.0:${PORT}`);
  console.log(`[SERVER START] Health endpoint ready: GET /health`);
  
  // Initialize production systems
  initRedis();
  
  console.log('[PRODUCTION SYSTEMS]', {
    redis: redis ? 'connected' : 'fallback',
    messageTracker: messageTracker ? 'initialized' : 'failed',
    rateLimiter: 'initialized'
  });
});

// Load environment variables AFTER server starts
if (process.env.NODE_ENV !== 'production') {
  try {
    require('dotenv').config();
  } catch (error) {
    console.log('dotenv config failed:', error.message);
  }
}

// Global axios (reuse for performance)
let axios = null;
try {
  axios = require('axios');
  console.log('axios loaded successfully');
} catch (error) {
  console.log('axios load failed:', error.message);
}

// Production-grade message tracking
const crypto = require('crypto');
let redis = null;
let messageTracker = null;

// Initialize Redis for persistent duplicate detection
function initRedis() {
  if (!process.env.REDIS_URL) {
    console.log('[REDIS DISABLED] Using memory tracker');
    messageTracker = new MemoryMessageTracker();
    return;
  }

  try {
    const Redis = require('redis');
    redis = Redis.createClient({
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy: false
      }
    });
    
    redis.on('error', (err) => {
      console.log('[REDIS ERROR]', err.message);
      messageTracker = new MemoryMessageTracker();
    });
    
    redis.on('connect', () => {
      console.log('[REDIS CONNECTED]');
      messageTracker = new RedisMessageTracker();
    });
    
    redis.connect().catch(() => {
      console.log('[REDIS FALLBACK] Using memory tracker');
      messageTracker = new MemoryMessageTracker();
    });
  } catch (error) {
    console.log('[REDIS UNAVAILABLE]', error.message);
    messageTracker = new MemoryMessageTracker();
  }
}

// Memory fallback for duplicate detection
class MemoryMessageTracker {
  constructor() {
    this.messages = new Map();
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000); // Cleanup every minute
  }
  
  async hasMessage(messageId) {
    return this.messages.has(messageId);
  }
  
  async addMessage(messageId, ttl = 3600) {
    this.messages.set(messageId, Date.now() + ttl * 1000);
  }
  
  cleanup() {
    const now = Date.now();
    for (const [id, expiry] of this.messages.entries()) {
      if (now > expiry) {
        this.messages.delete(id);
      }
    }
  }
}

// Redis-based message tracking
class RedisMessageTracker {
  constructor() {
    this.redis = redis;
  }
  
  async hasMessage(messageId) {
    try {
      const exists = await this.redis.exists(`msg:${messageId}`);
      return exists === 1;
    } catch (error) {
      console.log('[REDIS HAS ERROR]', error.message);
      return false;
    }
  }
  
  async addMessage(messageId, ttl = 3600) {
    try {
      await this.redis.setEx(`msg:${messageId}`, ttl, '1');
    } catch (error) {
      console.log('[REDIS ADD ERROR]', error.message);
    }
  }
}

// Rate limiting per user
class RateLimiter {
  constructor() {
    this.limits = new Map();
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }
  
  async canSendMessage(senderPhone, limit = 5, window = 3600) {
    const key = `rate:${senderPhone}`;
    const now = Date.now();
    const windowStart = now - (window * 1000);
    
    let userRequests = this.limits.get(key) || [];
    
    // Clean old requests
    userRequests = userRequests.filter(timestamp => timestamp > windowStart);
    
    if (userRequests.length >= limit) {
      console.log('[RATE LIMIT]', { sender: senderPhone, count: userRequests.length, limit });
      return false;
    }
    
    userRequests.push(now);
    this.limits.set(key, userRequests);
    return true;
  }
  
  cleanup() {
    const now = Date.now();
    const windowStart = now - 3600000; // 1 hour
    
    for (const [key, requests] of this.limits.entries()) {
      const filtered = requests.filter(timestamp => timestamp > windowStart);
      if (filtered.length === 0) {
        this.limits.delete(key);
      } else {
        this.limits.set(key, filtered);
      }
    }
  }
}

const rateLimiter = new RateLimiter();

// Verify Meta webhook signature
function verifyWebhookSignature(rawBody, signature, secret) {
  if (!signature || !secret) {
    return false;
  }
  
  try {
    const [version, hash] = signature.split('=');
    if (version !== 'sha256') {
      return false;
    }

    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      console.log('[SIGNATURE VERIFY ERROR] missing raw body');
      return false;
    }
    
    const expectedHash = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(hash, 'hex'),
      Buffer.from(expectedHash, 'hex')
    );
  } catch (error) {
    console.log('[SIGNATURE VERIFY ERROR]', error.message);
    return false;
  }
}

// DEPLOYMENT VERSION CHECK - V4
console.log('DEPLOY VERSION CHECK - V4');
console.log('WEBHOOK V4 ACTIF');
console.log('FILE PATH:', __filename);
console.log('WORKING DIR:', process.cwd());
console.log('BOOT ENV:', {
  VERIFY_TOKEN: process.env.VERIFY_TOKEN,
  PORT: process.env.PORT,
  NODE_ENV: process.env.NODE_ENV
});

// Environment validation for production
const isProduction = process.env.NODE_ENV === 'production';
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// Anti-duplicate message tracking
const processedMessages = new Set();

console.log('[ENV CHECK]', {
  hasToken: !!(process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN),
  hasPhoneId: !!(process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID)
});

function getWhatsAppToken() {
  return process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN || '';
}

function getPhoneNumberId() {
  return process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID || '';
}

function getAppSecret() {
  return process.env.APP_SECRET || process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET || '';
}

function logFlowBlocked(reason, messageId = '') {
  console.log('[FLOW BLOCKED]', {
    reason,
    messageId
  });
}

// Log ALL incoming requests - BEFORE ANY MIDDLEWARE
app.use((req, res, next) => {
  console.log('[INCOMING REQUEST]', req.method, req.url);
  console.log('[INCOMING HEADERS]', JSON.stringify(req.headers, null, 2));
  next();
});

// CORS middleware
app.use(cors({
  origin: ['http://localhost:8081', 'http://localhost:8082', 'http://localhost:8083', 'http://localhost:8084'],
  credentials: true
}));

// JSON body parser - CRITICAL FOR WEBHOOK
app.use(express.json({
  limit: '1mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// Log after body parser to confirm parsing
app.use((req, res, next) => {
  console.log('[BODY PARSER CHECK]', {
    hasBody: !!req.body,
    bodyType: typeof req.body,
    bodyKeys: req.body ? Object.keys(req.body) : [],
    contentType: req.headers['content-type']
  });
  next();
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/diagnostic', require('./routes/diagnostic'));
app.use('/api/missions', require('./routes/missions'));
app.use('/api/ai', require('./routes/ai'));

// Modules incomplets explicitement desactives
app.use('/api/progress', (req, res) => {
  res.status(410).json({
    error: 'Route desactivee',
    message: 'Le module /api/progress est desactive pour stabilisation production.',
  });
});

app.use('/api/firebase-auth', (req, res) => {
  res.status(410).json({
    error: 'Route desactivee',
    message: 'Le module /api/firebase-auth est desactive pour stabilisation production.',
  });
});

// WhatsApp Webhook Verification (GET)
app.get('/webhook/whatsapp', (req, res) => {
  console.log('[WEBHOOK GET HIT]');
  
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  console.log('[WEBHOOK GET PARAMS]', { mode, hasToken: !!token, hasChallenge: !!challenge });
  
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[WEBHOOK GET SUCCESS]');
    return res.status(200).send(challenge);
  } else {
    console.log('[WEBHOOK GET FAILED]', { mode, tokenMatch: token === VERIFY_TOKEN });
    return res.sendStatus(403);
  }
});

// WhatsApp Webhook Messages (POST)
app.post('/webhook/whatsapp', async (req, res) => {
  console.log('[WEBHOOK POST HIT]');
  
  // Verify webhook signature
  const signature = req.headers['x-hub-signature-256'];
  const appSecret = getAppSecret();
  
  if (!verifyWebhookSignature(req.rawBody, signature, appSecret)) {
    logFlowBlocked('invalid_signature');
    console.log('[WEBHOOK SIGNATURE INVALID]');
    return res.sendStatus(403);
  }
  
  console.log('[WEBHOOK SIGNATURE VALID]');
  console.log('[WEBHOOK POST BODY]', JSON.stringify(req.body, null, 2));
  
  // RESPONSE 200 IMMEDIATE - DO NOT AWAIT
  res.sendStatus(200);
  
  try {
    await processWhatsAppMessages(req.body);
  } catch (err) {
    console.log('[HANDLE ERROR]', err.message);
    console.log('[WEBHOOK PROCESSING ERROR]', err.message, err.stack);
  }
});

// Separate async function for message processing
async function processWhatsAppMessages(webhookBody) {
  try {
    // Validation structure webhook
    const entry = webhookBody?.entry;
    if (!entry || !Array.isArray(entry) || entry.length === 0) {
      logFlowBlocked('no_entry');
      console.log('[WEBHOOK NO ENTRY]');
      return;
    }
    
    const changes = entry[0]?.changes;
    if (!changes || !Array.isArray(changes) || changes.length === 0) {
      logFlowBlocked('no_changes');
      console.log('[WEBHOOK NO CHANGES]');
      return;
    }
    
    const value = changes[0]?.value;
    if (!value) {
      logFlowBlocked('no_value');
      console.log('[WEBHOOK NO VALUE]');
      return;
    }
    
    const messages = value.messages;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      logFlowBlocked('no_messages');
      console.log('[WEBHOOK NO MESSAGES]');
      return;
    }
    
    console.log('[WEBHOOK HAS MESSAGES]');
    
    // Traiter chaque message
    for (const message of messages) {
      console.log('[FLOW START]', {
        messageId: message?.id,
        from: message?.from
      });
      await forceSendDebugPing(message);
      await processSingleMessage(message);
    }
    
  } catch (error) {
    console.log('[WEBHOOK PARSING ERROR]', error.message, error.stack);
  }
}

// Process single message with production-grade features
async function processSingleMessage(message) {
  try {
    if (!message) {
      logFlowBlocked('empty_message');
      console.log('[WEBHOOK EMPTY MESSAGE]');
      return;
    }
    
    // Check for duplicate message using persistent tracker
    const messageId = message.id;
    if (!messageId) {
      logFlowBlocked('missing_message_id');
      console.log('[WEBHOOK NO MESSAGE ID]');
      return;
    }
    
    const isDuplicate = await messageTracker.hasMessage(messageId);
    if (isDuplicate) {
      logFlowBlocked('duplicate_message', messageId);
      console.log('[WEBHOOK DUPLICATE MESSAGE]', { messageId });
      return;
    }
    
    // Mark as processed with TTL (1 hour)
    await messageTracker.addMessage(messageId, 3600);
    
    // Validation structure message
    const senderPhone = message.from;
    const messageType = message.type;
    const messageText = message.text?.body || '';
    
    if (!senderPhone) {
      logFlowBlocked('missing_sender', messageId);
      console.log('[WEBHOOK NO SENDER]');
      return;
    }
    
    console.log('[MESSAGE RECEIVED]', {
      messageId,
      sender: senderPhone,
      type: messageType,
      text: messageText
    });
    
    // Auto-reply uniquement pour messages texte avec contenu
    if (messageType === 'text' && messageText && messageText.trim()) {
      // Check rate limiting
      const canSend = await rateLimiter.canSendMessage(senderPhone, 5, 3600); // 5 messages per hour
      if (!canSend) {
        logFlowBlocked('rate_limited', messageId);
        console.log('[RATE LIMIT EXCEEDED]', { messageId, sender: senderPhone });
        return;
      }
      
      console.log('[AUTO-REPLY TRIGGERED]', { messageId });
      try {
        await sendWhatsAppReply(senderPhone, messageText);
        console.log('[AUTO-REPLY COMPLETED]', { messageId });
      } catch (replyError) {
        console.log('[AUTO-REPLY FAILED]', { 
          messageId, 
          sender: senderPhone,
          error: replyError.message, 
          stack: replyError.stack 
        });
      }
    } else {
      logFlowBlocked(
        !messageType ? 'no_type' :
        messageType !== 'text' ? 'not_text' :
        !messageText.trim() ? 'empty_text' : 'unknown',
        messageId
      );
      console.log('[AUTO-REPLY SKIPPED]', { 
        messageId,
        reason: !messageType ? 'no_type' : 
                messageType !== 'text' ? 'not_text' : 
                !messageText.trim() ? 'empty_text' : 'unknown'
      });
    }
    
  } catch (error) {
    console.log('[MESSAGE PROCESSING ERROR]', error.message, error.stack);
  }
}

async function forceSendDebugPing(message) {
  try {
    console.log('[FORCE SEND TEST]');

    const token = getWhatsAppToken();
    const phoneNumberId = getPhoneNumberId();
    const recipientPhone = message?.from;

    const test = await axios.post(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: recipientPhone,
        type: 'text',
        text: { body: 'PING DEBUG' }
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    console.log('[FORCE SEND SUCCESS]', test.data);
  } catch (err) {
    console.log('[FORCE SEND ERROR]', {
      status: err.response?.status,
      data: err.response?.data,
      message: err.message
    });
  }
}

// Fonction auto-reply WhatsApp
async function sendWhatsAppReply(recipientPhone, originalMessage) {
  try {
    console.log('[AUTO-REPLY START]', { recipient: recipientPhone, original: originalMessage });
    
    // Configuration WhatsApp API
    const WHATSAPP_TOKEN = getWhatsAppToken();
    const PHONE_NUMBER_ID = getPhoneNumberId();
    
    if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
      logFlowBlocked('missing_whatsapp_env');
      console.log('[AUTO-REPLY ERROR] Missing WHATSAPP_TOKEN or PHONE_NUMBER_ID');
      return;
    }
    
    // Message de réponse
    const replyText = `Auto-reply: Received "${originalMessage}". Thank you for your message!`;
    const aiResponse = replyText;

    console.log('[AI RESPONSE]', {
      text: aiResponse
    });

    if (!aiResponse || aiResponse.trim().length < 3) {
      console.log('[BLOCKED] Empty AI response');
      logFlowBlocked('empty_ai_response');
      return;
    }
    
    // API WhatsApp Graph
    const apiUrl = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;
    
    const payload = {
      messaging_product: "whatsapp",
      to: recipientPhone,
      type: "text",
      text: {
        body: aiResponse
      }
    };
    
    console.log('[ABOUT TO SEND]', {
      to: recipientPhone,
      text: aiResponse
    });
    console.log('[AUTO-REPLY SENDING]', { url: apiUrl, payload });
    
    // Envoyer via axios
    if (axios) {
      try {
        const response = await axios.post(apiUrl, payload, {
          headers: {
            'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000 // 10 seconds timeout
        });
        
        console.log('[SEND SUCCESS]', {
          status: response.status,
          data: response.data
        });
      } catch (err) {
        console.log('[SEND ERROR]', {
          status: err.response?.status,
          data: err.response?.data,
          message: err.message
        });
        throw err;
      }
    } else {
      logFlowBlocked('axios_unavailable');
      console.log('[AUTO-REPLY ERROR] axios not available');
    }
    
  } catch (error) {
    console.log('[AUTO-REPLY ERROR]', error.message);
    if (error.response) {
      console.log('[AUTO-REPLY ERROR DETAILS]', error.response.data);
    }
  }
}

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    aiProvider,
    persistenceMode: getPersistenceMode(),
    firestoreEnabled: isFirestoreEnabled(),
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.status(200).send("OK");
});

app.get('/ping', (req, res) => {
  res.send('OK');
});

app.get('/webhook-test', (req, res) => {
  res.json({
    message: 'WhatsApp webhook test endpoint',
    timestamp: new Date().toISOString(),
    webhookUrl: `${req.protocol}://${req.get('host')}/webhook/whatsapp`,
    serverAccessible: true
  });
});

// Route test unique pour identifier serveur
app.get('/webhook/test', (req, res) => {
  console.log("TEST ROUTE HIT");
  res.json({ server: "EXPRESS FINAL OK" });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} not found`
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[GLOBAL ERROR]', err);
  res.status(500).json({ error: 'Erreur serveur', message: err.message });
});
