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
  
  // Traitement async des messages
  if (req.body?.entry?.[0]?.changes?.[0]?.value?.messages) {
    console.log('[WEBHOOK HAS MESSAGES]');
    
    // Extraire message entrant
    const messages = req.body.entry[0].changes[0].value.messages;
    const message = messages[0];
    
    // Obtenir infos expéditeur
    const senderPhone = message.from;
    const messageText = message.text?.body || '';
    const messageType = message.type;
    
    console.log('[MESSAGE INFO]', {
      sender: senderPhone,
      type: messageType,
      text: messageText
    });
    
    // Auto-reply seulement pour messages texte
    if (messageType === 'text' && messageText) {
      sendWhatsAppReply(senderPhone, messageText);
    }
  } else {
    console.log('[WEBHOOK NO MESSAGES]');
  }
});

// Fonction auto-reply WhatsApp
async function sendWhatsAppReply(recipientPhone, originalMessage) {
  try {
    console.log('[AUTO-REPLY START]', { recipient: recipientPhone, original: originalMessage });
    
    // Configuration WhatsApp API
    const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
    const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
    
    if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
      console.log('[AUTO-REPLY ERROR] Missing WHATSAPP_TOKEN or PHONE_NUMBER_ID');
      return;
    }
    
    // Message de réponse
    const replyText = `Auto-reply: Received "${originalMessage}". Thank you for your message!`;
    
    // API WhatsApp Graph
    const apiUrl = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;
    
    const payload = {
      messaging_product: "whatsapp",
      to: recipientPhone,
      text: {
        body: replyText
      }
    };
    
    console.log('[AUTO-REPLY SENDING]', { url: apiUrl, payload });
    
    // Envoyer via axios
    if (axios) {
      const response = await axios.post(apiUrl, payload, {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('[AUTO-REPLY SUCCESS]', response.data);
    } else {
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
