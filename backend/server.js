// Load environment variables (optional for Railway)
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

// DEPLOYMENT VERSION CHECK - V3
console.log('DEPLOY VERSION CHECK - V3');
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
  console.log('WEBHOOK ROUTE ACTIVE - GET');
  
  // Use global VERIFY_TOKEN (avoid redeclaration scope issue)
  const globalVerifyToken = VERIFY_TOKEN;
  
  // Debug logging - comprehensive environment check
  console.log('[WEBHOOK DEBUG] === VERIFY TOKEN DEBUG ===');
  console.log('[WEBHOOK DEBUG] process.env.VERIFY_TOKEN:', process.env.VERIFY_TOKEN);
  console.log('[WEBHOOK DEBUG] global VERIFY_TOKEN:', globalVerifyToken);
  console.log('[WEBHOOK DEBUG] NODE_ENV:', process.env.NODE_ENV);
  console.log('[WEBHOOK DEBUG] isProduction:', isProduction);
  console.log('[WEBHOOK DEBUG] All env keys starting with VERIFY:', Object.keys(process.env).filter(k => k.includes('VERIFY')));
  
  // Fallback token for debugging ONLY (remove in production)
  const FALLBACK_TOKEN = 'debug_fallback_token_123';
  const effectiveToken = globalVerifyToken || (isProduction ? null : FALLBACK_TOKEN);
  
  console.log('[WEBHOOK DEBUG] effectiveToken (with fallback):', effectiveToken ? 'PRESENT' : 'MISSING');
  console.log('[WEBHOOK DEBUG] Using fallback:', !globalVerifyToken && !isProduction ? 'YES' : 'NO');

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('[WEBHOOK DEBUG] Request params:', {
    mode,
    tokenProvided: !!token,
    challengeProvided: !!challenge,
    tokenLength: token?.length || 0
  });

  // Critical error handling
  if (!effectiveToken) {
    console.error('[WEBHOOK CRITICAL] No VERIFY_TOKEN available');
    console.error('[WEBHOOK CRITICAL] Railway env vars not loaded properly');
    return res.status(500).json({ 
      error: 'VERIFY_TOKEN not configured',
      debug: {
        envLoaded: !!process.env.VERIFY_TOKEN,
        isProduction,
        fallbackUsed: false
      }
    });
  }

  // Verification logic with detailed logging
  if (mode === 'subscribe' && token === effectiveToken) {
    console.log('[WEBHOOK SUCCESS] Verification passed');
    console.log('[WEBHOOK SUCCESS] Returning challenge:', challenge);
    return res.status(200).send(challenge);
  } else {
    console.error('[WEBHOOK FAILED] Verification failed');
    console.error('[WEBHOOK FAILED] Details:', {
      expectedMode: 'subscribe',
      receivedMode: mode,
      tokenMatch: token === effectiveToken,
      expectedToken: effectiveToken?.substring(0, 5) + '...',
      receivedToken: token?.substring(0, 5) + '...'
    });
    return res.status(403).json({ 
      error: 'Webhook verification failed',
      debug: {
        mode,
        tokenProvided: !!token,
        isProduction
      }
    });
  }
});

// WhatsApp Webhook Messages (POST)
app.post('/webhook/whatsapp', (req, res) => {
  console.log('WEBHOOK ROUTE ACTIVE - POST');
  console.log('[WEBHOOK HIT]');
  
  // Immediate response to Meta
  res.sendStatus(200);
  
  try {
    // Safe extraction with optional chaining
    const value = req.body.entry?.[0]?.changes?.[0]?.value;
    
    if (!value) {
      return;
    }
    
    const messages = value.messages;
    if (!messages || messages.length === 0) {
      return;
    }
    
    // Process each message asynchronously
    for (const message of messages) {
      // Security check
      if (!message || !message.id || !message.from) {
        console.log('[DUPLICATE IGNORED]', message.id || 'no-id');
        continue;
      }
      
      // Anti-duplicate check
      if (processedMessages.has(message.id)) {
        console.log('[DUPLICATE IGNORED]', message.id);
        continue;
      }
      
      processedMessages.add(message.id);
      
      // Memory optimization: clean up old messages (keep last 1000)
      if (processedMessages.size > 1000) {
        const entries = Array.from(processedMessages);
        processedMessages.clear();
        entries.slice(-500).forEach(id => processedMessages.add(id));
      }
      
      const userText = message.text?.body;
      
      if (!userText || userText.trim() === '') {
        continue;
      }
      
      // Move all AI processing to async
      setImmediate(async () => {
        try {
          console.log('[AI RECEIVED]', message.from);
          
          // Use global OpenAI client
          if (!openaiClient) {
            console.log('[ERROR] OPENAI client not available');
            return;
          }
          
          const completion = await openaiClient.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
              {
                role: 'system',
                content: 'You are a high-converting WhatsApp sales agent. Max 2 lines. Always ask a question. Focus on getting client and money.'
              },
              {
                role: 'user',
                content: userText
              }
            ],
            max_tokens: 150,
            temperature: 0.7
          });
          
          const aiResponse = completion.choices?.[0]?.message?.content?.trim();
          if (!aiResponse) {
            console.log('[ERROR] Empty AI response');
            return;
          }
          
          console.log('[AI RESPONSE]', aiResponse.substring(0, 50) + '...');
          
          // WhatsApp API call with global axios
          const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
          const whatsappToken = process.env.WHATSAPP_TOKEN;
          
          if (!phoneNumberId || !whatsappToken) {
            console.log('[ERROR] WHATSAPP config missing');
            return;
          }
          
          await axios.post(
            `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
            {
              messaging_product: 'whatsapp',
              to: message.from,
              type: 'text',
              text: { body: aiResponse }
            },
            {
              headers: {
                Authorization: `Bearer ${whatsappToken}`,
                'Content-Type': 'application/json'
              }
            }
          );
          
          console.log('[WHATSAPP SENT]', message.from);
          
        } catch (error) {
          console.log('[ERROR]', error.message);
        }
      });
    }
  } catch (error) {
    console.log('[ERROR]', error.message);
  }
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

// Simple ping endpoint for server accessibility test
app.get('/ping', (req, res) => {
  console.log('[PING] GET /ping called');
  res.send('OK');
});

// DEBUG: Test endpoint to verify server accessibility
app.get('/webhook-test', (req, res) => {
  console.log('[WEBHOOK TEST] GET /webhook-test called');
  console.log('[WEBHOOK TEST] Server is accessible');
  console.log('[WEBHOOK TEST] Request IP:', req.ip);
  console.log('[WEBHOOK TEST] User-Agent:', req.headers['user-agent']);
  
  res.json({
    message: 'Webhook test endpoint working',
    timestamp: new Date().toISOString(),
    webhook_url: `${req.protocol}://${req.get('host')}/webhook/whatsapp`,
    server_accessible: true
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
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVER START] Webhook route ready: GET /webhook/whatsapp`);
  console.log(`[SERVER START] Webhook route ready: POST /webhook/whatsapp`);
  console.log(`[SERVER START] Test endpoints ready: GET /ping, GET /webhook-test`);
  console.log(`[SERVER START] Server listening on 0.0.0.0:${PORT}`);
  console.log(`[SERVER START] PORT from env:`, process.env.PORT);
});

process.on('unhandledRejection', (reason) => {
  console.error('UnhandledRejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('UncaughtException:', error);
});
