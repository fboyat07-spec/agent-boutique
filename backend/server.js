require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const mongoose = require('mongoose');

// ─── WORKFLOW LOCK PAR MESSAGE.ID ─────────────────────────────────────────────────────

// Lock en mémoire si Redis non disponible
const workflowLocks = new Map();

// TTL court pour éviter les locks permanents
const LOCK_TTL = 30000; // 30 secondes

async function acquireWorkflowLock(messageId) {
  const lockKey = `workflow_lock:${messageId}`;
  const ownerToken = crypto.randomUUID(); // Token unique du propriétaire
  
  // PRIORITÉ REDIS si disponible
  if (isRedisAvailable() && redis) {
    try {
      const result = await redis.set(lockKey, ownerToken, 'EX', LOCK_TTL / 1000, 'NX');
      if (result === 'OK') {
        console.log('[WORKFLOW LOCK ACQUIRED REDIS]', { messageId, lockKey, ownerToken });
        return ownerToken; // Retourner le token propriétaire
      }
      console.log('[WORKFLOW LOCK FAILED REDIS]', { messageId, lockKey });
      return false;
    } catch (redisError) {
      console.log('[WORKFLOW LOCK REDIS ERROR]', { messageId, error: redisError.message });
      // Fallback vers mémoire
    }
  }
  
  // FALLBACK MÉMOIRE
  const expires = Date.now() + LOCK_TTL;
  cleanupExpiredLocks();
  
  if (workflowLocks.has(lockKey)) {
    return false;
  }
  
  workflowLocks.set(lockKey, { owner: ownerToken, expires });
  console.log('[WORKFLOW LOCK ACQUIRED MEMORY]', { messageId, lockKey, ownerToken });
  return ownerToken; // Retourner le token propriétaire
}

async function releaseWorkflowLock(messageId, ownerToken = null) {
  const lockKey = `workflow_lock:${messageId}`;
  
  // PRIORITÉ REDIS si disponible
  if (isRedisAvailable() && redis) {
    try {
      // Vérifier le token propriétaire avant de supprimer
      if (ownerToken) {
        const currentToken = await redis.get(lockKey);
        if (currentToken === ownerToken) {
          await redis.del(lockKey);
          console.log('[WORKFLOW LOCK RELEASED REDIS]', { messageId, lockKey, ownerToken });
        } else {
          console.log('[WORKFLOW LOCK RELEASE DENIED REDIS]', { messageId, lockKey, ownerToken, currentToken });
        }
      } else {
        await redis.del(lockKey);
        console.log('[WORKFLOW LOCK RELEASED REDIS (NO TOKEN)]', { messageId, lockKey });
      }
      return;
    } catch (redisError) {
      console.log('[WORKFLOW LOCK REDIS RELEASE ERROR]', { messageId, error: redisError.message });
      // Fallback vers mémoire
    }
  }
  
  // FALLBACK MÉMOIRE
  const lock = workflowLocks.get(lockKey);
  if (lock) {
    // Vérifier le token propriétaire avant de supprimer
    if (!ownerToken || lock.owner === ownerToken) {
      workflowLocks.delete(lockKey);
      console.log('[WORKFLOW LOCK RELEASED MEMORY]', { messageId, lockKey, ownerToken });
    } else {
      console.log('[WORKFLOW LOCK RELEASE DENIED MEMORY]', { messageId, lockKey, ownerToken, lockOwner: lock.owner });
    }
  }
}

function cleanupExpiredLocks() {
  const now = Date.now();
  for (const [key, lock] of workflowLocks.entries()) {
    if (lock.expires < now) {
      workflowLocks.delete(key);
      console.log('[WORKFLOW LOCK EXPIRED]', { key });
    }
  }
}

// Environment security check - allow local mode for development
if (!process.env.MONGODB_URI) {
  console.log("MONGODB_URI manquant - using local mode");
  process.env.MONGODB_URI = 'mongodb://localhost:27017/agent-boutique-local';
}

console.log("SERVER FINAL UNIQUE");
console.log("MONGO:", process.env.MONGODB_URI);
console.log('VERIFY_TOKEN:', process.env.VERIFY_TOKEN);

// FIX 1 — Lire les deux noms possibles du token
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN;

console.log('[ENV CHECK]', {
  VERIFY_TOKEN: !!process.env.VERIFY_TOKEN,
  MONGODB_URI: !!process.env.MONGODB_URI,
  NODE_ENV: process.env.NODE_ENV
});

// Core Express setup - IMMEDIATE START
const app = express();

async function connectDB() {
  try {
    console.log('[MONGO] connecting...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('[MONGO] connected');
  } catch (err) {
    console.log('[MONGO ERROR]', err.message);
    process.exit(1); // stop si DB KO
  }
}

// GLOBAL REQUEST LOGGER - DEBUG RAILWAY HEALTHCHECK
app.use((req, res, next) => {
  console.log('[REQUEST]', req.method, req.url);
  next();
});

// NOTE: /health est défini plus bas avec JSON complet (status, version, timestamp)

// Load environment variables AFTER server starts


// ── ORCHESTRATEUR AGENTIQUE (Classify → Decide → Act) ──
const { orchestrate } = require('./services/orchestrator');
const { sendWhatsAppMessage } = require('./services/messageSender');
const { processLead } = require('./services/closingService');
const { updateScore } = require('./services/scoringService');
const { scheduleFollowUps } = require('./services/followupService');

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

// Redis availability management
let redisAvailable = false;
let redisRetryCount = 0;
const MAX_REDIS_RETRY = 3;

// Safe Redis availability checker
function isRedisAvailable() {
  return redisAvailable === true;
}

// Initialize Redis for persistent duplicate detection
function initRedis() {
  if (redisRetryCount >= MAX_REDIS_RETRY) {
    if (!global.redisWarned) {
      console.warn('[REDIS PERMANENTLY DISABLED]');
      global.redisWarned = true;
    }
    messageTracker = new MemoryMessageTracker();
    return;
  }

  try {
    const Redis = require('redis');
    redis = Redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      retry_delay_on_failover: 100,
      enable_ready_check: false,
      max_retries_per_request: null
    });
    
    redis.on('error', (err) => {
      if (!global.redisWarned) {
        console.warn('[REDIS DISABLED - FALLBACK MEMORY]');
        global.redisWarned = true;
      }
      redisAvailable = false;
      messageTracker = new MemoryMessageTracker();
    });
    
    redis.on('connect', () => {
      console.log('[REDIS CONNECTED]');
      redisAvailable = true;
      messageTracker = new RedisMessageTracker();
    });
    
    redis.connect().then(() => {
      redisAvailable = true;
      redisRetryCount = 0;
    }).catch((err) => {
      redisRetryCount++;
      redisAvailable = false;
      if (!global.redisWarned) {
        console.warn('[REDIS DISABLED - FALLBACK MEMORY]');
        global.redisWarned = true;
      }
      messageTracker = new MemoryMessageTracker();
    });
  } catch (error) {
    redisRetryCount++;
    redisAvailable = false;
    if (!global.redisWarned) {
      console.warn('[REDIS DISABLED - FALLBACK MEMORY]');
      global.redisWarned = true;
    }
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
    if (this.messages.has(messageId)) {
      return false; // Message already exists
    }
    this.messages.set(messageId, Date.now() + ttl * 1000);
    return true; // Successfully added
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
    this.memoryFallback = new MemoryMessageTracker();
  }
  
  async hasMessage(messageId) {
    if (!isRedisAvailable()) {
      return this.memoryFallback.hasMessage(messageId);
    }
    
    try {
      const exists = await this.redis.exists(`msg:${messageId}`);
      return exists === 1;
    } catch (error) {
      redisAvailable = false;
      return this.memoryFallback.hasMessage(messageId);
    }
  }
  
  async addMessage(messageId, ttl = 3600) {
    if (!isRedisAvailable()) {
      return this.memoryFallback.addMessage(messageId, ttl);
    }
    
    try {
      // Use SET with NX (Not eXists) option for atomic operation
      const result = await this.redis.set(`msg:${messageId}`, '1', {
        NX: true, // Only set if key doesn't exist
        EX: ttl   // Set expiration
      });
      return result === 'OK'; // Returns 'OK' if key was set, null if key already exists
    } catch (error) {
      redisAvailable = false;
      return this.memoryFallback.addMessage(messageId, ttl);
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

// Global duplicate message prevention (MongoDB-based)
const ProcessedMessage = require('./models/ProcessedMessage');
const Conversation = require('./models/Conversation');
const User = require('./models/User');
const AgentInstruction = require('./models/AgentInstruction');

// ─── Console API — state & helpers ───────────────────────────────────────────
let agentEnabled = true;
const CONSOLE_TOKEN = process.env.CONSOLE_TOKEN || 'console_admin_2024';
if (!global._consoleSseClients) global._consoleSseClients = new Set();

// Error counter (auto-reset chaque jour)
if (!global._errorsToday) global._errorsToday = { date: new Date().toDateString(), count: 0 };
function getErrorsToday() {
  const today = new Date().toDateString();
  if (global._errorsToday.date !== today) global._errorsToday = { date: today, count: 0 };
  return global._errorsToday.count;
}
function incError() {
  const today = new Date().toDateString();
  if (global._errorsToday.date !== today) global._errorsToday = { date: today, count: 0 };
  global._errorsToday.count++;
}

// Monkey-patch console.log/error → SSE broadcast (idempotent)
if (!console._patched) {
  const _origLog = console.log.bind(console);
  const _origErr = console.error.bind(console);
  function _sseLog(args) {
    const message = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    const payload = JSON.stringify({ time: new Date().toISOString(), message });
    for (const client of global._consoleSseClients) {
      try { client.write(`data: ${payload}\n\n`); } catch (_) {}
    }
  }
  console.log   = (...args) => { _origLog(...args); _sseLog(args); };
  console.error = (...args) => { _origErr(...args); _sseLog(args); };
  console._patched = true;
}

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

// FIX 2 — Un seul logger de requêtes, sans fuite de headers
app.use((req, res, next) => {
  console.log('[INCOMING REQUEST]', req.method, req.url);
  next();
});

// FIX 4 — CORS dynamique depuis .env (inclut Railway + localhost)
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:8081,http://localhost:8082,http://localhost:8083,http://localhost:8084').split(',').map(o => o.trim());
app.use(cors({
  origin: allowedOrigins,
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
  console.log('[DIAGNOSTIC] REQUEST RECEIVED - MIDDLEWARE', {
    method: req.method,
    url: req.url,
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

// ACTION 6 - Monitoring conversion endpoint
try {
  app.use('/api/agent', require('./routes/agentStats'));
} catch (error) {
  console.log('[AGENT_STATS_ROUTE_ERROR]', error.message);
  app.use('/api/agent', (req, res) => {
    res.status(503).json({
      error: 'Agent stats service unavailable',
      message: 'Monitoring endpoints temporarily disabled'
    });
  });
}

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
  console.log('[DIAGNOSTIC] WEBHOOK POST HIT - STEP 1');
  
  // Diagnose raw body integrity
  console.log('[DIAGNOSTIC] RAW BODY CHECK - STEP 2', {
    hasRaw: !!req.rawBody,
    rawLength: req.rawBody?.length
  });
  console.log('[DIAGNOSTIC] RAW BODY STRING - STEP 3', req.rawBody?.toString());
  console.log('[DIAGNOSTIC] PARSED BODY - STEP 4', JSON.stringify(req.body));
  
  try {
    JSON.parse(req.rawBody.toString());
    console.log('[DIAGNOSTIC] RAW BODY VALID JSON - STEP 5');
  } catch (e) {
    console.log('[DIAGNOSTIC] RAW BODY INVALID JSON - STEP 5 ERROR', e.message);
  }
  
  // DIAGNOSTIC: Check headers
  console.log('[DIAGNOSTIC] HEADERS CHECK - STEP 6', {
    'x-hub-signature-256': req.headers['x-hub-signature-256'],
    'content-type': req.headers['content-type'],
    'user-agent': req.headers['user-agent']
  });
  
  // FIX 6 — Vérifier configs critiques sans bloquer le traitement (log warning uniquement)
  const criticalConfigs = ['VERIFY_TOKEN', 'APP_SECRET', 'WHATSAPP_TOKEN', 'PHONE_NUMBER_ID'];
  const missingConfigs = criticalConfigs.filter(key => !process.env[key] && key !== 'VERIFY_TOKEN');
  if (missingConfigs.length > 0) {
    console.log('[DIAGNOSTIC] CONFIGS MANQUANTES - STEP 7', missingConfigs);
  } else {
    console.log('[DIAGNOSTIC] CONFIGS OK - STEP 7');
  }
  
  // Fallback mémoire si messageTracker null
  if (!global.messageTracker) {
    global.messageTracker = new Map();
    console.log('[DIAGNOSTIC] MEMORY TRACKER INITIALIZED - STEP 8');
  } else {
    console.log('[DIAGNOSTIC] MEMORY TRACKER EXISTS - STEP 8');
  }
  
  const signature = req.headers['x-hub-signature-256'];
  
  // VALIDATION FINALE - DÉSACTIVÉ COMPLÈTEMENT POUR TEST
  console.log('[WEBHOOK WARNING] Signature verification disabled for validation');
  
  console.log('[WEBHOOK RECEIVED]'); // Log business obligatoire
  console.log('[WEBHOOK POST BODY]', JSON.stringify(req.body, null, 2));
  
  // RESPONSE 200 IMMEDIATE - DO NOT AWAIT
  console.log('[DIAGNOSTIC] SENDING RESPONSE 200 - STEP 9');
  res.sendStatus(200);
  console.log('[DIAGNOSTIC] RESPONSE 200 SENT - STEP 10');
  
  // Process webhook asynchronously (fire and forget)
  console.log('[DIAGNOSTIC] STARTING ASYNC PROCESSING - STEP 11');
  processWebhook(req.body).catch(error => {
    console.log('[DIAGNOSTIC] ASYNC PROCESSING ERROR - STEP 11 ERROR', error.message);
  });
  console.log('[DIAGNOSTIC] ASYNC PROCESSING STARTED - STEP 12');
});

// Separate async function for webhook processing
async function processWebhook(webhookBody) {
  try {
    console.log('[DIAGNOSTIC] PROCESS WEBHOOK STARTED - STEP 13');
    console.log('[DIAGNOSTIC] WEBHOOK BODY RECEIVED - STEP 14', webhookBody);
    
    // Safety check for body structure
    if (!webhookBody || !webhookBody.entry) {
      console.log('[DIAGNOSTIC] INVALID BODY STRUCTURE - STEP 15 ERROR');
      console.log('[DIAGNOSTIC] BODY STRUCTURE CHECK - STEP 15', {
        hasBody: !!webhookBody,
        hasEntry: !!webhookBody?.entry,
        bodyKeys: webhookBody ? Object.keys(webhookBody) : []
      });
      return;
    }
    
    console.log('[DIAGNOSTIC] BODY STRUCTURE OK - STEP 15');

    const entries = webhookBody.entry || [];

    for (const entry of entries) {
      const changes = entry.changes || [];

      for (const change of changes) {
        const value = change.value;
        
        // Extraire phone_number_id au bon niveau AVANT la boucle messages
        const phone_number_id = change.value?.metadata?.phone_number_id;
        
        console.log('[PHONE_ID EXTRACTED]', { 
          phone_number_id,
          entry_id: entry.id 
        });
        
        // ACTION 7 - Résoudre tenant_id avec validation multi-tenant
        console.log('[DIAGNOSTIC] STARTING TENANT RESOLUTION - STEP 16');
        const { resolveTenantId } = require('./services/tenantResolver');
        let tenant_id = null;
        
        if (phone_number_id) {
          console.log('[DIAGNOSTIC] RESOLVING TENANT FOR PHONE_ID - STEP 17', { phone_number_id });
          tenant_id = await resolveTenantId(phone_number_id);
          
          if (!tenant_id) {
            console.log('[DIAGNOSTIC] TENANT_RESOLUTION_FAILED - STEP 18 ERROR', { phone_number_id });
            continue;
          }
          
          console.log('[DIAGNOSTIC] TENANT_RESOLVED - STEP 18', { 
            phone_number_id, 
            tenant_id
          });
        } else {
          console.log('[DIAGNOSTIC] NO PHONE_NUMBER_ID - STEP 17 ERROR');
          continue;
        }

        if (!value || !value.messages) {
          console.log('[DIAGNOSTIC] NO MESSAGES IN VALUE - STEP 19');
          continue;
        }

        console.log('[DIAGNOSTIC] PROCESSING MESSAGES - STEP 19', { messageCount: value.messages.length });

        for (const message of value.messages) {
          console.log('[DIAGNOSTIC] PROCESSING MESSAGE - STEP 20', {
            id: message.id,
            from: message.from,
            text: message.text?.body
          });

          if (!message?.id || !message?.from) {
            console.log('[DIAGNOSTIC] MESSAGE MISSING ID OR FROM - STEP 21 ERROR');
            continue;
          }
          
          console.log('[DIAGNOSTIC] MESSAGE STRUCTURE OK - STEP 21');

          console.log('[DIAGNOSTIC] CHECKING MONGODB DUPLICATE - STEP 22');
          try {
            await ProcessedMessage.create({ messageId: message.id, tenant_id });
            console.log('[DIAGNOSTIC] MONGODB UNIQUE CHECK PASSED - STEP 22');
          } catch (e) {
            if (e.code === 11000) {
              console.log('[DIAGNOSTIC] MONGODB DUPLICATE DETECTED - STEP 22 ERROR', message.id);
              continue;
            }
            console.log('[DIAGNOSTIC] MONGODB ERROR - STEP 22 ERROR', e.message);
            throw e;
          }

          const userText = message.text?.body;

          if (!userText) continue;

          const contentKey = (message.from + '_' + (message.text?.body || '').trim().toLowerCase().slice(0, 50));
          try {
            await ProcessedMessage.create({
              messageId: 'content_' + contentKey + '_' + Math.floor(Date.now()/60000),
              tenant_id
            });
          } catch (e) {
            if (e.code === 11000) {
              console.log('[CONTENT DEDUP MONGO] Doublon ignoré:', contentKey);
              continue;
            }
          }

// Process single message with production-grade features
          console.log('[DIAGNOSTIC] STARTING PROCESS SINGLE MESSAGE - STEP 23');
          await processSingleMessage(message, tenant_id);
          console.log('[DIAGNOSTIC] PROCESS SINGLE MESSAGE COMPLETED - STEP 23');
        }
      }
    }
    
  } catch (error) {
    console.log('[WEBHOOK PARSING ERROR]', error.message, error.stack);
  }
}

// Process single message with production-grade features
async function processSingleMessage(message, tenant_id) {
  try {
    console.log('[DIAGNOSTIC] PROCESS SINGLE MESSAGE STARTED - STEP 24');
    if (!message) {
      console.log('[DIAGNOSTIC] EMPTY MESSAGE - STEP 24 ERROR');
      return;
    }
    
    // Check for duplicate message using persistent tracker
    const messageId = message.id;
    if (!messageId) {
      console.log('[DIAGNOSTIC] NO MESSAGE ID - STEP 25 ERROR');
      return;
    }
    
    console.log('[DIAGNOSTIC] CHECKING MESSAGE TRACKER - STEP 25', { messageId });
    
    // FIX 7 — Guard null : messageTracker peut ne pas être encore initialisé
    if (!messageTracker) {
      messageTracker = new MemoryMessageTracker();
      console.log('[DIAGNOSTIC] MESSAGE TRACKER INITIALIZED - STEP 25');
    }
    
    // Atomic duplicate prevention - addMessage returns false if duplicate
    const wasAdded = await messageTracker.addMessage(messageId, 3600);
    if (!wasAdded) {
      console.log('[DIAGNOSTIC] MESSAGE TRACKER DUPLICATE - STEP 26 ERROR', { messageId });
      return;
    }
    
    console.log('[DIAGNOSTIC] MESSAGE TRACKER CHECK PASSED - STEP 26');
    
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
      text: messageText,
      tenant_id
    });
    
    // Vérifier l'abonnement via User - OBLIGATOIRE
    console.log('[DIAGNOSTIC] CHECKING SUBSCRIPTION - STEP 27');
    if (tenant_id) {
      console.log('[DIAGNOSTIC] FINDING USER FOR TENANT - STEP 27', { tenant_id });
      const user = await User.findOne({ tenant_id });
      
      if (!user) {
        console.log('[DIAGNOSTIC] USER NOT FOUND - STEP 27 ERROR', { tenant_id });
        return;
      }
      
      console.log('[DIAGNOSTIC] USER FOUND - STEP 27', { 
        tenant_id, 
        subscription_status: user.subscription_status 
      });
      
      if (user.subscription_status !== 'active' && user.subscription_status !== 'trial') {
        console.log('[DIAGNOSTIC] INACTIVE SUBSCRIPTION - STEP 27 ERROR', { 
          tenant_id, 
          subscription_status: user.subscription_status 
        });
        return;
      }
      
      console.log('[DIAGNOSTIC] SUBSCRIPTION CHECK PASSED - STEP 27');
    } else {
      console.log('[DIAGNOSTIC] TENANT ID MISSING - STEP 27 ERROR');
      return;
    }
    
    // ── ORCHESTRATEUR AGENTIQUE ──────────────────────────────────────────────
    // Remplace l'ancien pipeline fixe (processIncomingReply → processLead → send)
    // par un agent GPT-4 qui raisonne : Classify → Decide → Act
    if (messageType === 'text' && messageText) {
      console.log('[DIAGNOSTIC] CHECKING RATE LIMIT - STEP 28');
      // Rate limiting inchangé
      const canSend = await rateLimiter.canSendMessage(senderPhone, 50, 3600);
      if (!canSend) {
        console.log('[DIAGNOSTIC] RATE LIMIT EXCEEDED - STEP 28 ERROR', { messageId, sender: senderPhone });
        return;
      }

      console.log('[DIAGNOSTIC] RATE LIMIT PASSED - STEP 28');
      console.log('[DIAGNOSTIC] TRIGGERING ORCHESTRATOR - STEP 29', { messageId, sender: senderPhone });

      // WORKFLOW LOCK - Empêcher les workflows parallèles pour le même message.id
      console.log('[DIAGNOSTIC] ACQUIRING WORKFLOW LOCK - STEP 30');
      let lockAcquired = false;

      try {
        lockAcquired = await acquireWorkflowLock(messageId);
        if (!lockAcquired) {
          console.log('[DIAGNOSTIC] WORKFLOW LOCK FAILED - STEP 30 ERROR', { messageId, sender: senderPhone });
          return;
        }

        console.log('[DIAGNOSTIC] WORKFLOW LOCK ACQUIRED - STEP 30');

        // Vérifier si l'agent est activé (toggle /api/console/power)
        console.log('[DIAGNOSTIC] CHECKING AGENT ENABLED - STEP 31');
        if (!agentEnabled) {
          console.log('[DIAGNOSTIC] AGENT DISABLED - STEP 31 ERROR', { messageId });
          return;
        }

        console.log('[DIAGNOSTIC] AGENT ENABLED - STEP 31');
        console.log('[DIAGNOSTIC] CALLING ORCHESTRATE - STEP 32');
        
        // L'orchestrateur gère : contexte + intent + décision + persistance + score
        const reply = await orchestrate(senderPhone, messageText, tenant_id);

        if (!reply) {
          console.log('[DIAGNOSTIC] ORCHESTRATOR NO REPLY - STEP 32 ERROR');
          return;
        }

        console.log('[DIAGNOSTIC] ORCHESTRATOR REPLY RECEIVED - STEP 32', reply.slice(0, 80));
        console.log('[DIAGNOSTIC] ORCHESTRATOR MANAGES WHATSAPP SEND - STEP 33');

        // L'orchestrateur gère déjà l'envoi via nodeSendWhatsApp() - PAS DE SEND DIRECT REDONDANT
        console.log('[DIAGNOSTIC] REDUNDANT SEND PREVENTED - STEP 33', { messageId });

      } catch (orchError) {
        console.log('[DIAGNOSTIC] ORCHESTRATOR ERROR - STEP 32 ERROR', {
          messageId,
          sender: senderPhone,
          error: orchError.message,
          stack: orchError.stack
        });
        incError();
      } finally {
        // LIBÉRATION GARANTIE DU LOCK - finally exécuté même en cas d'erreur
        console.log('[DIAGNOSTIC] RELEASING WORKFLOW LOCK - STEP 34');
        if (lockAcquired) {
          await releaseWorkflowLock(messageId, lockAcquired);
          console.log('[DIAGNOSTIC] WORKFLOW LOCK RELEASED - STEP 34');
        } else {
          console.log('[DIAGNOSTIC] NO LOCK TO RELEASE - STEP 34');
        }
      }
    } else {
      console.log('[DIAGNOSTIC] PIPELINE BLOCKED - STEP 28 ERROR', { 
        messageId,
        reason: !messageType ? 'no_type' : 
                messageType !== 'text' ? 'not_text' : 
                !messageText.trim() ? 'empty_text' : 'unknown',
        messageType,
        hasText: !!messageText
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
  const agentRoutes = require('./routes/agentRoutes');
  const tenantRoutes = require('./routes/tenantRoutes');
  const agentStatsRoutes = require('./routes/agentStatsRoutes');
  const saasRoutes = require('./routes/saasRoutes'); // ACTION 9 - Monitoring SaaS
  app.use('/api/agent', agentRoutes);
  app.use('/api/agent', tenantRoutes); // ACTION 2 - Onboarding client
  app.use('/api/agent', saasRoutes); // ACTION 9 - Monitoring SaaS
  app.use('/api/agent/stats', agentStatsRoutes);
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

// ─── Prospecting routes ───────────────────────────────────────────────────────
app.use('/api/prospecting', require('./routes/prospecting.routes'));

// ─── Static files serving ─────────────────────────────────────────────────────
// Servir tous les fichiers du dossier public à la racine
app.use(express.static(path.join(__dirname, 'public')));

// ─── Route racine pour index.html ─────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── TEST ROUTE DIRECTE POUR DIAGNOSTIC RAILWAY ─────────────────────────────
app.get('/api/test-admin-route', (req, res) => {
  console.log('[TEST] /api/test-admin-route called');
  res.json({ ok: true, message: 'Test route works', timestamp: new Date().toISOString() });
});

// ─── Console statique ─────────────────────────────────────────────────────────
// index: 'console.html' → /console et /console/ servent console.html directement
app.use('/console', express.static(path.join(__dirname, 'public'), { index: 'console.html' }));

// ─── /api/console/* ──────────────────────────────────────────────────────────
const { computeROI } = require('./services/roiCalculator');

function consoleAuth(req, res, next) {
  // Accepte Bearer header OU ?token= (EventSource ne supporte pas les headers)
  const headerToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const queryToken  = req.query.token || '';
  const token = headerToken || queryToken;
  if (token !== CONSOLE_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

app.get('/api/console/stats', consoleAuth, async (req, res) => {
  try {
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const [messages_today, active_conversations, closings_today] = await Promise.all([
      ProcessedMessage.countDocuments({ createdAt: { $gte: startOfDay } }),
      Conversation.countDocuments({ stage: { $nin: ['won', 'lost'] } }),
      Conversation.countDocuments({ stage: 'won', updatedAt: { $gte: startOfDay } }),
    ]);
    res.json({
      messages_today,
      active_conversations,
      closings_today,
      errors_today:   getErrorsToday(),
      uptime:         Math.round(process.uptime()),
      agent_status:   agentEnabled ? 'running' : 'stopped',
    });
  } catch (err) {
    console.error('[CONSOLE STATS ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/console/conversations', consoleAuth, async (req, res) => {
  try {
    const convos = await Conversation
      .find({}, 'phone stage score lastInteractionAt messages')
      .sort({ lastInteractionAt: -1 })
      .limit(20)
      .lean();
    res.json(convos.map(c => ({
      phone:              c.phone,
      stage:              c.stage,
      score:              c.score,
      lastInteractionAt:  c.lastInteractionAt,
      lastMessage:        (c.messages || []).slice(-1)[0] || null,
    })));
  } catch (err) {
    console.error('[CONSOLE CONVERSATIONS ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// CONSOLE CONVERSATION ADMIN PANEL - READ ONLY SAFE EXTENSION
try {
  app.use('/api/console', require('./routes/consoleConversationRoutes'));
} catch (err) {
  console.error('[CONSOLE CONVERSATION ROUTES ERROR]', err.message);
}

// ADMIN CHAT PANEL - SAFE ISOLATED ROUTES
console.log('[BOOT] adminChatRoutes loading...');
try {
  const adminChatRoutes = require('./routes/adminChatRoutes');
  console.log('[BOOT] adminChatRoutes loaded successfully');
  app.use('/api/admin', adminChatRoutes);
  console.log('[BOOT] Mounted /api/admin routes');
} catch (err) {
  console.error('[BOOT] FAILED TO LOAD adminChatRoutes', err);
  console.error('[ADMIN CHAT ROUTES ERROR]', err.message);
}

app.post('/api/console/instruction', consoleAuth, async (req, res) => {
  try {
    const text = String(req.body?.instruction || '').trim();
    if (!text) return res.status(400).json({ error: 'instruction required' });
    const instruction = await AgentInstruction.create({ text });
    res.json({ ok: true, instruction });
  } catch (err) {
    console.error('[CONSOLE INSTRUCTION ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/console/logs', consoleAuth, (req, res) => {
  res.set({
    'Content-Type':      'text/event-stream',
    'Cache-Control':     'no-cache',
    'Connection':        'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write(`data: ${JSON.stringify({ time: new Date().toISOString(), message: '[SSE CONNECTED]' })}\n\n`);
  global._consoleSseClients.add(res);
  const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (_) {} }, 25000);
  req.on('close', () => { clearInterval(ping); global._consoleSseClients.delete(res); });
});

app.post('/api/console/power', consoleAuth, (req, res) => {
  const action = req.body?.action;
  if      (action === 'start') agentEnabled = true;
  else if (action === 'stop')  agentEnabled = false;
  else return res.status(400).json({ error: 'action must be start or stop' });
  console.log(`[CONSOLE POWER] agent ${agentEnabled ? 'STARTED' : 'STOPPED'}`);
  res.json({ ok: true, status: agentEnabled ? 'running' : 'stopped' });
});

app.get('/api/console/roi', consoleAuth, async (req, res) => {
  try {
    const roi = await computeROI();
    res.json({ ok: true, ...roi });
  } catch (err) {
    console.error('[ROI] Erreur calcul:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Helper functions for environment validation
function getPersistenceMode() {
  return process.env.MONGODB_URI ? 'mongodb' : 'memory';
}

function isFirestoreEnabled() {
  return !!process.env.FIREBASE_PROJECT_ID;
}

// Global error handler
app.use((error, req, res, next) => {
  incError();
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

const PORT = process.env.PORT || 3000;

async function startServer() {
  await connectDB(); // CRITIQUE

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER START] Server listening on 0.0.0.0:${PORT}`);
    console.log(`[SERVER START] Health endpoint ready: GET /health`);

    // init systèmes existants (NE PAS SUPPRIMER)
    if (typeof initRedis === "function") initRedis();

    setInterval(() => {
      if (typeof processFollowUps === "function") {
        processFollowUps().catch(err => {
          console.log('[FOLLOW UP ERROR]', err.message);
        });
      }
      
      // Schedule automated follow-ups
      scheduleFollowUps().catch(err => {
        console.log('[SCHEDULE FOLLOWUP ERROR]', err.message);
      });
    }, 60000);

    console.log('[PRODUCTION SYSTEMS READY]');
  });
}

startServer();

// FIX 8 — Test de send supprimé (numéro hardcodé envoyait un vrai message à chaque démarrage)