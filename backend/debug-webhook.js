const express = require('express');
require('dotenv').config();

const app = express();

app.get('/webhook/whatsapp', (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('[webhook verify] DEBUG:');
  console.log('  - process.env.VERIFY_TOKEN:', VERIFY_TOKEN);
  console.log('  - process.env.WHATSAPP_VERIFY_TOKEN:', WHATSAPP_VERIFY_TOKEN);
  console.log('  - req.query hub.verify_token:', token);
  console.log('  - req.query hub.mode:', mode);
  console.log('  - req.query hub.challenge:', challenge);

  // Trim both sides
  const envToken = (VERIFY_TOKEN || WHATSAPP_VERIFY_TOKEN || '').trim();
  const receivedToken = (token || '').trim();

  console.log('  - envToken (trimmed):', envToken);
  console.log('  - receivedToken (trimmed):', receivedToken);
  console.log('  - strict equality:', envToken === receivedToken);

  if (mode === 'subscribe' && envToken === receivedToken) {
    console.log('[webhook verify] SUCCESS - tokens match');
    return res.status(200).send(challenge);
  }

  console.log('[webhook verify] FAILED - tokens dont match');
  return res.status(403).json({ error: 'invalid verify token' });
});

const PORT = 3002;
app.listen(PORT, () => {
  console.log(`Debug server running on port ${PORT}`);
  console.log(`Test URL: http://localhost:${PORT}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=my_verify_token_2468&hub.challenge=123`);
});
