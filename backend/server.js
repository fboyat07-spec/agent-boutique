require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { isFirestoreEnabled, getPersistenceMode } = require('./database/firebase');
const { provider: aiProvider } = require('./services/openaiService');

// Environment validation for production
const isProduction = process.env.NODE_ENV === 'production';
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

if (isProduction) {
  console.log('[ENV PROD] Production mode detected');
  console.log('[ENV PROD] VERIFY_TOKEN loaded:', VERIFY_TOKEN ? 'YES' : 'NO');
  
  if (!VERIFY_TOKEN) {
    console.error('[ENV PROD] CRITICAL: VERIFY_TOKEN is required in production');
    process.exit(1);
  }
  
  console.log('[ENV PROD] VERIFY_TOKEN length:', VERIFY_TOKEN.length);
  console.log('[ENV PROD] VERIFY_TOKEN starts with:', VERIFY_TOKEN.substring(0, 10) + '...');
}

const app = express();

app.use(cors({
  origin: ['http://localhost:8081', 'http://localhost:8082', 'http://localhost:8083', 'http://localhost:8084'],
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));

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
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Production logging - no sensitive data
  if (isProduction) {
    console.log('[WEBHOOK PROD] Verification request received');
    console.log('[WEBHOOK PROD] Mode:', mode);
    console.log('[WEBHOOK PROD] Token provided:', token ? 'YES' : 'NO');
    console.log('[WEBHOOK PROD] Challenge provided:', challenge ? 'YES' : 'NO');
  } else {
    console.log("[webhook verify] DEBUG:");
    console.log("  - process.env.VERIFY_TOKEN:", VERIFY_TOKEN);
    console.log("  - process.env.WHATSAPP_VERIFY_TOKEN:", WHATSAPP_VERIFY_TOKEN);
    console.log("  - req.query hub.verify_token:", token);
    console.log("  - req.query hub.mode:", mode);
    console.log("  - req.query hub.challenge:", challenge);
  }

  // Trim both sides and validate
  const envToken = (VERIFY_TOKEN || WHATSAPP_VERIFY_TOKEN || '').trim();
  const receivedToken = (token || '').trim();

  if (isProduction && !VERIFY_TOKEN) {
    console.error('[WEBHOOK PROD] CRITICAL: No VERIFY_TOKEN configured');
    return res.status(500).json({ error: "server configuration error" });
  }

  if (!isProduction) {
    console.log("  - envToken (trimmed):", envToken);
    console.log("  - receivedToken (trimmed):", receivedToken);
    console.log("  - strict equality:", envToken === receivedToken);
  }

  if (mode === 'subscribe' && envToken === receivedToken) {
    if (isProduction) {
      console.log('[WEBHOOK PROD] Verification SUCCESS');
    } else {
      console.log("[webhook verify] SUCCESS - tokens match");
    }
    return res.status(200).send(challenge);
  }

  if (isProduction) {
    console.log('[WEBHOOK PROD] Verification FAILED - invalid token');
  } else {
    console.log("[webhook verify] FAILED - tokens don't match");
  }
  return res.status(403).json({ error: "invalid verify token" });
});

// WhatsApp Webhook Messages (POST)
app.post('/webhook/whatsapp', (req, res) => {
  console.log("[webhook message]", req.body);
  res.sendStatus(200);
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'KidAI Backend running',
    version: '1.1.0',
    aiProvider,
    persistence: typeof getPersistenceMode === 'function' ? getPersistenceMode() : 'unknown',
    firestoreEnabled: typeof isFirestoreEnabled === 'function' ? isFirestoreEnabled() : false,
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route introuvable' });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Erreur serveur', message: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`KidAI Backend demarre sur http://localhost:${PORT}`);
});

process.on('unhandledRejection', (reason) => {
  console.error('UnhandledRejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('UncaughtException:', error);
});
