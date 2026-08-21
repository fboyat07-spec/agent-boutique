#!/usr/bin/env node
'use strict';

/**
 * TEST UNITAIRE — middleware/consoleAuth.js
 * ───────────────────────────────────────────
 * Usage : node scripts/testConsoleAuth.js
 *
 * Pur : ne nécessite NI MongoDB NI réseau (mock req/res/next).
 * Vérifie le comportement du jeton console partagé (CONSOLE_TOKEN) utilisé
 * pour protéger /api/invoices*, /api/agent/instructions, /api/agent/calendly,
 * /api/agent/catalog/import — même mécanisme que /api/console/* (server.js).
 */

process.env.CONSOLE_TOKEN = 'test_token_123';
// require APRÈS avoir fixé l'env var (le module lit CONSOLE_TOKEN une seule fois au chargement)
const consoleAuth = require('../middleware/consoleAuth');

const assert = require('assert');

let passed = 0;
function check(label, fn) {
  try {
    fn();
    console.log(`  ✅  ${label}`);
    passed++;
  } catch (err) {
    console.log(`  ❌  ${label}`);
    console.error(`      ${err.message}`);
    process.exitCode = 1;
  }
}
function sep(t) { console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 52 - t.length))}`); }

function mockRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body)   { this.body = body; return this; },
  };
  return res;
}

sep('consoleAuth — jeton via header Authorization');

check('aucun header → 401 Unauthorized, next() jamais appelé', () => {
  const req = { headers: {}, query: {} };
  const res = mockRes();
  let nextCalled = false;
  consoleAuth(req, res, () => { nextCalled = true; });
  assert.strictEqual(res.statusCode, 401);
  assert.deepStrictEqual(res.body, { error: 'Unauthorized' });
  assert.strictEqual(nextCalled, false);
});

check('mauvais jeton → 401 Unauthorized', () => {
  const req = { headers: { authorization: 'Bearer wrong_token' }, query: {} };
  const res = mockRes();
  let nextCalled = false;
  consoleAuth(req, res, () => { nextCalled = true; });
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(nextCalled, false);
});

check('bon jeton en header Authorization → next() appelé, pas de réponse 401', () => {
  const req = { headers: { authorization: 'Bearer test_token_123' }, query: {} };
  const res = mockRes();
  let nextCalled = false;
  consoleAuth(req, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(res.statusCode, null);
});

check('bon jeton insensible à la casse "bearer"', () => {
  const req = { headers: { authorization: 'bearer test_token_123' }, query: {} };
  const res = mockRes();
  let nextCalled = false;
  consoleAuth(req, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true);
});

sep('consoleAuth — jeton via ?token= (fallback EventSource)');

check('bon jeton en query ?token= → next() appelé', () => {
  const req = { headers: {}, query: { token: 'test_token_123' } };
  const res = mockRes();
  let nextCalled = false;
  consoleAuth(req, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true);
});

check('mauvais jeton en query → 401', () => {
  const req = { headers: {}, query: { token: 'nope' } };
  const res = mockRes();
  let nextCalled = false;
  consoleAuth(req, res, () => { nextCalled = true; });
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(nextCalled, false);
});

sep('RÉSULTAT');
if (process.exitCode === 1) {
  console.log(`\n  ❌ Des tests ont échoué (${passed} OK).`);
  process.exit(1);
} else {
  console.log(`\n  ✅ Tous les tests passent (${passed}).`);
}
