// Load environment variables (optional for Railway)
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
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

const express = require('express');
const cors = require('cors');
const { isFirestoreEnabled, getPersistenceMode } = require('./database/firebase');
const { provider: aiProvider } = require('./services/openaiService');

// Environment validation for production
const isProduction = process.env.NODE_ENV === 'production';
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// Anti-duplicate message tracking
const processedMessages = new Set();

// Global OpenAI client (reuse for performance)
let openaiClient = null;
if (process.env.OPENAI_API_KEY) {
  try {
    const openai = require('openai');
    openaiClient = new openai.OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  } catch (error) {
    console.log('[ERROR] OpenAI client init failed:', error.message);
  }
}

// Global axios (reuse for performance)
const axios = require('axios');

// Debug ENV global
console.log('[ENV CHECK] VERIFY_TOKEN:', process.env.VERIFY_TOKEN);
console.log('[ENV CHECK] ALL ENV KEYS:', Object.keys(process.env));

if (isProduction) {
  console.log('[ENV PROD] Production mode detected');
  console.log('[ENV PROD] VERIFY_TOKEN loaded:', VERIFY_TOKEN ? 'YES' : 'NO');

  if (!VERIFY_TOKEN) {
    console.error('[ENV PROD] CRITICAL: VERIFY_TOKEN is required in production');
    process.exit(1);
  }

  console.log('[ENV PROD] VERIFY_TOKEN length:', VERIFY_TOKEN.length);
  console.log('[ENV PROD] VERIFY_TOKEN starts with:', VERIFY_TOKEN.substring(0, 10) + '...');

  // Check WhatsApp token for permissions
  const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
  console.log('[ENV PROD] WHATSAPP_TOKEN configured:', WHATSAPP_TOKEN ? 'YES' : 'NO');

  if (WHATSAPP_TOKEN) {
    console.log('[ENV PROD] WHATSAPP_TOKEN length:', WHATSAPP_TOKEN.length);
    console.log('[ENV PROD] WHATSAPP_TOKEN starts with:', WHATSAPP_TOKEN.substring(0, 10) + '...');

    // Log required permissions (for admin reference)
    const requiredPermissions = [
      'whatsapp_business_messaging',
      'whatsapp_business_management', 
      'whatsapp_business_manage_events'
    ];
    console.log('[ENV PROD] Required WhatsApp permissions:', requiredPermissions.join(', '));
  } else {
    console.log('[ENV PROD] WARNING: WHATSAPP_TOKEN not configured - message sending disabled');
  }
}

const app = express();

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
app.use(express.json({ limit: '1mb' }));

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
app.post('/webhook/whatsapp', (req, res) => {
  console.log('[WEBHOOK POST HIT]');
  console.log('[WEBHOOK POST BODY]', JSON.stringify(req.body, null, 2));
  
  // RESPONSE 200 IMMEDIATE
  res.sendStatus(200);
  
  // Traitement async si nécessaire
  if (req.body?.entry?.[0]?.changes?.[0]?.value?.messages) {
    console.log('[WEBHOOK HAS MESSAGES]');
    // TODO: Traiter messages ici
  } else {
    console.log('[WEBHOOK NO MESSAGES]');
  }
});

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
  console.log('[WEBHOOK TEST ROUTE HIT]');
  res.json({
    success: true,
    server: 'EXPRESS V4',
    timestamp: new Date().toISOString(),
    message: 'Serveur Express correct exécuté'
  });
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVER START] Webhook route ready: GET /webhook/whatsapp`);
  console.log(`[SERVER START] Webhook route ready: POST /webhook/whatsapp`);
  console.log(`[SERVER START] Test endpoints ready: GET /ping, GET /webhook-test`);
  console.log(`[SERVER START] Server listening on 0.0.0.0:${PORT}`);
  console.log(`[SERVER START] PORT from env:`, process.env.PORT);
});
