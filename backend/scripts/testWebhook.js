#!/usr/bin/env node
/**
 * DIAGNOSTIC WEBHOOK META WHATSAPP
 * Usage : node scripts/testWebhook.js
 *
 * Vérifie :
 *  1. Présence des variables d'environnement requises
 *  2. Validité du token WhatsApp via l'API Meta
 *  3. Format HTTPS de l'URL Railway du webhook
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const https = require('https');

const GRAPH_API_VERSION = 'v19.0';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok(msg)   { console.log(`  ✅  ${msg}`); }
function warn(msg) { console.warn(`  ⚠️   ${msg}`); }
function fail(msg) { console.error(`  ❌  ${msg}`); }
function section(title) { console.log(`\n── ${title} ${'─'.repeat(50 - title.length)}`); }

function httpsGet(url, token) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'agent-boutique-diag/1.0' }
    };
    https.get(url, opts, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, data: body }); }
      });
    }).on('error', reject);
  });
}

// ─── 1. Variables d'environnement ─────────────────────────────────────────────

section('1. Variables d\'environnement');

const REQUIRED = {
  WHATSAPP_TOKEN:              process.env.WHATSAPP_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID:    process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID,
  // Accepte WEBHOOK_VERIFY_TOKEN ou l'ancien VERIFY_TOKEN
  WEBHOOK_VERIFY_TOKEN:        process.env.WEBHOOK_VERIFY_TOKEN || process.env.VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN,
  WHATSAPP_BUSINESS_ACCOUNT_ID: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
};

let envOk = true;
for (const [name, value] of Object.entries(REQUIRED)) {
  if (value) {
    ok(`${name} = ${value.slice(0, 6)}…`);
  } else {
    fail(`${name} manquant`);
    envOk = false;
  }
}

// Alias utilisé en interne par server.js
if (!process.env.WEBHOOK_VERIFY_TOKEN && process.env.VERIFY_TOKEN) {
  warn('VERIFY_TOKEN trouvé (ancien nom) — préférer WEBHOOK_VERIFY_TOKEN dans les nouvelles configs');
}

// ─── 2. Validation token via API Meta ─────────────────────────────────────────

section('2. Validation token WhatsApp (API Meta)');

async function checkToken() {
  const token   = REQUIRED.WHATSAPP_TOKEN;
  const phoneId = REQUIRED.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneId) {
    fail('Impossible de tester — variables manquantes (voir étape 1)');
    return;
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneId}`;
  console.log(`  → GET ${url}`);

  try {
    const { status, data } = await httpsGet(url, token);

    if (status === 200 && data.id) {
      ok(`Token valide — Phone Number ID : ${data.id}`);
      if (data.display_phone_number) ok(`Numéro affiché : ${data.display_phone_number}`);
      if (data.verified_name)        ok(`Nom vérifié    : ${data.verified_name}`);
      if (data.quality_rating)       ok(`Qualité        : ${data.quality_rating}`);
    } else {
      fail(`Réponse Meta : HTTP ${status}`);
      if (data.error) {
        fail(`Code erreur : ${data.error.code} — ${data.error.message}`);
        if (data.error.error_subcode) fail(`Sous-code     : ${data.error.error_subcode}`);
      } else {
        console.error('  Réponse brute :', JSON.stringify(data, null, 2));
      }
    }
  } catch (err) {
    fail(`Erreur réseau : ${err.message}`);
  }
}

// ─── 3. Vérification URL Railway ──────────────────────────────────────────────

section('3. URL webhook Railway');

function checkWebhookUrl() {
  const url = process.env.RAILWAY_STATIC_URL
    || process.env.RAILWAY_PUBLIC_DOMAIN
    || process.env.PUBLIC_URL
    || process.env.WEBHOOK_URL;

  if (!url) {
    warn('Aucune variable RAILWAY_STATIC_URL / PUBLIC_URL / WEBHOOK_URL trouvée');
    warn('Vérifier manuellement que l\'URL Railway est bien HTTPS dans le dashboard Meta');
    return;
  }

  if (url.startsWith('https://')) {
    ok(`URL détectée : ${url}`);
    ok(`Webhook complet : ${url}/webhook/whatsapp`);
  } else {
    fail(`URL non-HTTPS : ${url}`);
    fail('Meta exige HTTPS — configurer un domaine Railway ou un proxy SSL');
  }
}

checkWebhookUrl();

// ─── Run async checks ─────────────────────────────────────────────────────────

checkToken().then(() => {
  section('Résumé');
  if (envOk) ok('Toutes les variables requises sont présentes');
  else       fail('Des variables manquent — compléter le .env ou les vars Railway');
  console.log('');
});
