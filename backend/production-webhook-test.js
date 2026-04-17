const express = require('express');
require('dotenv').config();

const app = express();

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

// Health endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Webhook test server running',
    mode: process.env.NODE_ENV || 'development',
    verify_token_configured: !!process.env.VERIFY_TOKEN
  });
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`Production webhook test server running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`Test: http://localhost:${PORT}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=${process.env.VERIFY_TOKEN || 'my_verify_token_2468'}&hub.challenge=12345`);
});
