const express = require('express');
const app = express();

app.get('/webhook/whatsapp', (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'test-token';
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('[webhook verify]', req.query);

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.status(403).json({ error: 'invalid verify token' });
});

// Test route
app.get('/test-webhook', (req, res) => {
  const testUrl = '/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=test-token&hub.challenge=123';
  res.send(`Test URL: <a href="${testUrl}">${testUrl}</a>`);
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`);
  console.log(`Test URL: http://localhost:${PORT}/test-webhook`);
});
