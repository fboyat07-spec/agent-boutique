#!/usr/bin/env node
/**
 * ENVOI DE MESSAGE WHATSAPP DE TEST
 * Usage : node scripts/sendTestMessage.js +33XXXXXXXXX "Message de test"
 *
 * Utilise directement l'API Cloud WhatsApp Business (Graph API).
 * Affiche la réponse brute de Meta pour debug.
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const https = require('https');

const GRAPH_API_VERSION = 'v19.0';

// ─── Arguments ────────────────────────────────────────────────────────────────

const [,, to, ...msgParts] = process.argv;
const message = msgParts.join(' ');

if (!to || !message) {
  console.error('Usage : node scripts/sendTestMessage.js +33XXXXXXXXX "Message de test"');
  process.exit(1);
}

if (!to.startsWith('+')) {
  console.warn('⚠️  Le numéro devrait être au format international (+33…)');
}

// ─── Config ───────────────────────────────────────────────────────────────────

const TOKEN    = process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID;

if (!TOKEN) {
  console.error('❌  WHATSAPP_TOKEN manquant dans .env');
  process.exit(1);
}
if (!PHONE_ID) {
  console.error('❌  WHATSAPP_PHONE_NUMBER_ID manquant dans .env');
  process.exit(1);
}

// ─── Envoi ────────────────────────────────────────────────────────────────────

const payload = JSON.stringify({
  messaging_product: 'whatsapp',
  to,
  type: 'text',
  text: { body: message }
});

const options = {
  hostname: 'graph.facebook.com',
  path:     `/${GRAPH_API_VERSION}/${PHONE_ID}/messages`,
  method:   'POST',
  headers: {
    'Authorization':  `Bearer ${TOKEN}`,
    'Content-Type':   'application/json',
    'Content-Length': Buffer.byteLength(payload),
  }
};

console.log(`\n→ Envoi vers : ${to}`);
console.log(`→ Message    : ${message}`);
console.log(`→ Phone ID   : ${PHONE_ID}`);
console.log(`→ URL        : https://graph.facebook.com${options.path}\n`);

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    console.log(`── Réponse Meta (HTTP ${res.statusCode}) ${'─'.repeat(40)}`);
    try {
      const data = JSON.parse(body);
      console.log(JSON.stringify(data, null, 2));

      if (res.statusCode === 200 && data.messages?.[0]?.id) {
        console.log(`\n✅  Message envoyé — ID : ${data.messages[0].id}`);
        if (data.contacts?.[0]?.wa_id) {
          console.log(`✅  WhatsApp ID destinataire : ${data.contacts[0].wa_id}`);
        }
      } else if (data.error) {
        console.error(`\n❌  Erreur Meta ${data.error.code} : ${data.error.message}`);
        if (data.error.error_data?.details) {
          console.error(`   Détails : ${data.error.error_data.details}`);
        }
      }
    } catch {
      console.log(body);
    }
  });
});

req.on('error', (err) => {
  console.error('❌  Erreur réseau :', err.message);
  process.exit(1);
});

req.write(payload);
req.end();
