console.log("SERVER FINAL UNIQUE");

// Core Express setup - IMMEDIATE START
const express = require('express');
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
  
  // Start follow-up scheduler
  setInterval(() => {
    processFollowUps().catch(err => {
      console.log('[FOLLOW UP ERROR]', err.message);
    });
  }, 60000); // every minute
  
  console.log('[PRODUCTION SYSTEMS]', {
    redis: redis ? 'connected' : 'fallback',
    messageTracker: messageTracker ? 'initialized' : 'failed',
    rateLimiter: 'initialized',
    followUpScheduler: 'started'
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

// Import orchestrate service
const { orchestrate } = require('./services/orchestrator');
const { sendWhatsAppMessage } = require('./services/messageSender');

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
  try {
    const Redis = require('redis');
    redis = Redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      retry_delay_on_failover: 100,
      enable_ready_check: false,
      max_retries_per_request: null
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
      console.log('[REDIS HAS MESSAGE ERROR]', error.message);
      return false;
    }
  }
  
  async addMessage(messageId, ttl = 3600) {
    try {
      await this.redis.setEx(`msg:${messageId}`, ttl, '1');
    } catch (error) {
      console.log('[REDIS ADD MESSAGE ERROR]', error.message);
    }
  }
}

// Rate limiting for production
class RateLimiter {
  constructor() {
    this.limits = new Map();
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000); // Cleanup every minute
  }
  
  async canSendMessage(userId, maxMessages = 5, windowSeconds = 3600) {
    const key = `${userId}_${Math.floor(Date.now() / (windowSeconds * 1000))}`;
    const userLimits = this.limits.get(userId) || [];
    
    const recentMessages = userLimits.filter(msg => 
      Date.now() - msg.timestamp < windowSeconds * 1000
    );
    
    if (recentMessages.length >= maxMessages) {
      return false;
    }
    
    recentMessages.push({ timestamp: Date.now() });
    this.limits.set(userId, recentMessages);
    return true;
  }
  
  cleanup() {
    const now = Date.now();
    for (const [key, messages] of this.limits.entries()) {
      const filtered = messages.filter(msg => now - msg.timestamp < 3600000); // 1 hour
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
function verifyWebhookSignature(req, signature, secret) {
  if (!signature || !secret) {
    return false;
  }
  
  try {
    const [version, hash] = signature.split('=');
    if (version !== 'sha256') {
      return false;
    }
    
    const expectedHash = crypto
      .createHmac('sha256', secret)
      .update(req.rawBody)
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

// Global duplicate message prevention (MongoDB-based)
const ProcessedMessage = require('./models/ProcessedMessage');
const Conversation = require('./models/Conversation');

// Follow-up processor
async function processFollowUps() {
  const now = new Date();
  const conversations = await Conversation.find({
    nextFollowUpAt: { $lte: now },
    stage: { $ne: 'won' }
  }).sort({ priority: -1, nextFollowUpAt: 1 }).limit(20);

  console.log('[PRIORITY PROCESSING]', conversations.length, 'leads');

  for (const convo of conversations) {
    if (convo.stage === 'won') continue;

    let message;
    const stageFollowUps = {
      new: ["Tu fais quoi comme business ?"],
      qualified: ["Tu fais combien de CA par mois ?"],
      interested: ["Tu veux plus de clients chaque semaine ?"],
      closing: ["Je t'active ça maintenant 👉 " + process.env.SALES_PAYMENT_LINK]
    };

    const stageOptions = stageFollowUps[convo.stage] || stageFollowUps.new;
    message = stageOptions[Math.floor(Math.random() * stageOptions.length)];

    await Conversation.updateOne(
      { _id: convo._id },
      {
        $set: {
          nextFollowUpAt: new Date(Date.now() + 3600000), // +1h
          followUpType: 'recovery'
        }
      }
    );

    try {
      await sendWhatsAppMessage(convo.phone, message);
    } catch (err) {
      console.log('[FOLLOW UP ERROR]', err.message);
    }
  }
}

// Global rate limiting (MongoDB-based)
const RateLimit = require('./models/RateLimit');

async function canSendMessage() {
  const currentMinute = new Date().toISOString().slice(0,16);

  const record = await RateLimit.findOne({ minute: currentMinute });

  if (record && record.count >= 20) {
    console.log('[RATE LIMIT BLOCKED GLOBAL]');
    return false;
  }

  await RateLimit.updateOne(
    { minute: currentMinute },
    { $inc: { count: 1 } },
    { upsert: true }
  );

  return true;
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

// JSON body parser - CRITICAL FOR WEBHOOK with raw body capture
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  },
  limit: '1mb'
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
  
  // Diagnose raw body integrity
  console.log('[RAW BODY CHECK]', {
    hasRaw: !!req.rawBody,
    rawLength: req.rawBody?.length
  });
  console.log('[RAW BODY STRING]', req.rawBody?.toString());
  console.log('[PARSED BODY]', JSON.stringify(req.body));
  
  try {
    JSON.parse(req.rawBody.toString());
    console.log('[RAW BODY VALID JSON]');
  } catch (e) {
    console.log('[RAW BODY INVALID JSON]', e.message);
  }
  
  // Verify webhook signature
  const signature = req.headers['x-hub-signature-256'];
  const appSecret = process.env.APP_SECRET;
  
  if (!verifyWebhookSignature(req, signature, appSecret)) {
    console.log('[WEBHOOK SIGNATURE INVALID]');
    return res.sendStatus(403);
  }
  
  console.log('[WEBHOOK SIGNATURE VALID]');
  console.log('[WEBHOOK POST BODY]', JSON.stringify(req.body, null, 2));
  
  // RESPONSE 200 IMMEDIATE - DO NOT AWAIT
  res.sendStatus(200);
  
  // Process webhook asynchronously (fire and forget)
  processWebhook(req.body).catch(error => {
    console.log('[WEBHOOK PROCESS ERROR]', error.message);
  });
});

// Separate async function for webhook processing
async function processWebhook(webhookBody) {
  try {
    console.log('[PROCESS STARTED]');
    console.log('[RAW BODY STRING]', webhookBody);
    
    // Safety check for body structure
    if (!webhookBody || !webhookBody.entry) {
      console.log('[WEBHOOK ERROR] Invalid body structure');
      return;
    }

    const entries = webhookBody.entry || [];

    for (const entry of entries) {
      const changes = entry.changes || [];

      for (const change of changes) {
        const value = change.value;

        if (!value || !value.messages) continue;

        for (const message of value.messages) {

          console.log('[MESSAGE STRUCTURE]', {
            id: message.id,
            from: message.from,
            text: message.text?.body
          });

          if (!message?.id || !message?.from) continue;

          const exists = await ProcessedMessage.findOne({ messageId: message.id });

          if (exists) {
            console.log('[DUPLICATE GLOBAL]', message.id);
            continue;
          }

          await ProcessedMessage.create({ messageId: message.id });

          const userText = message.text?.body;

          if (!userText) continue;

          // Process single message with production-grade features
          await processSingleMessage(message);
        }
      }
    }
    
  } catch (error) {
    console.log('[WEBHOOK PARSING ERROR]', error.message, error.stack);
  }
}

// Process single message with production-grade features
async function processSingleMessage(message) {
  try {
    if (!message) {
      console.log('[WEBHOOK EMPTY MESSAGE]');
      return;
    }
    
    // Check for duplicate message using persistent tracker
    const messageId = message.id;
    if (!messageId) {
      console.log('[WEBHOOK NO MESSAGE ID]');
      return;
    }
    
    const isDuplicate = await messageTracker.hasMessage(messageId);
    if (isDuplicate) {
      console.log('[WEBHOOK DUPLICATE MESSAGE]', { messageId });
      return;
    }
    
    // Mark as processed with TTL (1 hour)
    await messageTracker.addMessage(messageId, 3600);
    
    // Validation structure message
    const senderPhone = message.from;
    const messageType = message?.type;
    const messageText = message?.text?.body;
    
    // Debug logs for extracted message
    console.log('[EXTRACTED]', {
      messageType,
      messageText,
      hasMessage: !!message,
      messageKeys: message ? Object.keys(message) : []
    });
    
    if (!senderPhone) {
      console.log('[WEBHOOK NO SENDER]');
      return;
    }
    
    console.log('[MESSAGE RECEIVED]', {
      messageId,
      sender: senderPhone,
      type: messageType,
      text: messageText
    });
    
    // Orchestrator-based logic for messages texte avec contenu
    if (messageType === 'text' && messageText) {
      // Check rate limiting
      const canSend = await rateLimiter.canSendMessage(senderPhone, 5, 3600); // 5 messages per hour
      if (!canSend) {
        console.log('[RATE LIMIT EXCEEDED]', { messageId, sender: senderPhone });
        return;
      }
      
      console.log('[PIPELINE ACTIVE] orchestrator');
      console.log('[ORCHESTRATOR TRIGGERED]', { messageId });
      console.log('[SEND TRIGGER]', { messageId, sender: senderPhone, messageText });
      
      try {
        const response = await orchestrate({
          type: "incoming_message",
          payload: {
            user_id: senderPhone,
            message: messageText
          }
        });

        console.log("[ORCHESTRATOR RESPONSE]", response.reply);

        // Block any other response
        if (!response || !response.reply) {
          console.log("[BLOCKED EMPTY RESPONSE]");
          return;
        }

        // Send message using only sendWhatsAppMessage
        await sendWhatsAppMessage(senderPhone, response.reply);
        
        console.log('[ORCHESTRATOR COMPLETED]', { messageId, intent: response.intent });

      } catch (orchError) {
        console.log('[ORCHESTRATOR ERROR]', { 
          messageId, 
          sender: senderPhone,
          error: orchError.message, 
          stack: orchError.stack 
        });
      }
    } else {
      console.log('[PIPELINE BLOCKED]', { 
        messageId,
        reason: !messageType ? 'no_type' : 
                messageType !== 'text' ? 'not_text' : 
                !messageText.trim() ? 'empty_text' : 'unknown'
      });
      return;
    }
    
  } catch (error) {
    console.log('[MESSAGE PROCESSING ERROR]', error.message, error.stack);
  }
}

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
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

// Analytics endpoints - read-only
try {
  const statsRoutes = require('./routes/statsRoutes');
  app.use('/stats', statsRoutes);
  console.log('[STATS ROUTES] Analytics endpoints loaded');
} catch (error) {
  console.log('[STATS ROUTES] Failed to load analytics routes:', error.message);
}

// Lead import endpoints
try {
  const leadsRoutes = require('./routes/leadsRoutes');
  app.use('/leads', leadsRoutes);
  console.log('[LEADS ROUTES] Lead import endpoints loaded');
} catch (error) {
  console.log('[LEADS ROUTES] Failed to load lead routes:', error.message);
}

// Initialize campaign system
try {
  const { createDefaultCampaigns } = require('./services/campaignService');
  createDefaultCampaigns();
  console.log('[CAMPAIGNS] Campaign system initialized');
} catch (error) {
  console.log('[CAMPAIGNS] Failed to initialize campaign system:', error.message);
}

// Outbound messaging system
try {
  const outboundRoutes = require('./routes/outboundRoutes');
  app.use('/outbound', outboundRoutes);
  console.log('[OUTBOUND ROUTES] Outbound messaging endpoints loaded');
} catch (error) {
  console.log('[OUTBOUND ROUTES] Failed to load outbound routes:', error.message);
}

// Outbound scheduler (automation)
try {
  const { startOutboundScheduler } = require('./services/outboundScheduler');

  if (process.env.OUTBOUND_ENABLED === "true") {
    startOutboundScheduler();
    console.log('[OUTBOUND SCHEDULER] Started');
  } else {
    console.log('[OUTBOUND SCHEDULER] Disabled (set OUTBOUND_ENABLED=true to enable)');
  }
} catch (error) {
  console.log('[OUTBOUND SCHEDULER] Failed to start scheduler:', error.message);
}

// Helper functions for environment validation
function getPersistenceMode() {
  return process.env.MONGODB_URI ? 'mongodb' : 'memory';
}

function isFirestoreEnabled() {
  return !!process.env.FIREBASE_PROJECT_ID;
}

// Global error handler
app.use((error, req, res, next) => {
  console.log('[GLOBAL ERROR]', error.message, error.stack);
  res.status(500).json({
    error: 'Internal server error',
    message: isProduction ? 'Something went wrong' : error.message
  });
});

// 404 handler
app.use((req, res) => {
  console.log('[404 NOT FOUND]', req.method, req.url);
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.method} ${req.url} not found`
  });
});

console.log('[SERVER INITIALIZATION COMPLETE]');
console.log('[ORCHESTRATOR PIPELINE ACTIVE]');
console.log('[AUTO-REPLY SYSTEMS REMOVED]');
