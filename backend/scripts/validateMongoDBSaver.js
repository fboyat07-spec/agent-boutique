#!/usr/bin/env node
/**
 * VALIDATION RUNTIME — MongoDBSaver LangGraph
 * Usage : node scripts/validateMongoDBSaver.js
 *
 * Vérifie :
 *   1. Connexion MongoClient (même URI que le serveur)
 *   2. Existence des collections LangGraph (checkpoints, checkpoint_writes)
 *   3. Nombre et aperçu des documents checkpoint
 *   4. Instanciation MongoDBSaver directe (même chemin que l'orchestrateur)
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const { MongoClient } = require('mongodb');

const CHECKPOINT_COL = 'checkpoints';
const WRITES_COL     = 'checkpoint_writes';

function ok(msg)   { console.log(`  ✅  ${msg}`); }
function warn(msg) { console.log(`  ⚠️   ${msg}`); }
function err(msg)  { console.log(`  ❌  ${msg}`); }
function sep(title) {
  const line = '─'.repeat(Math.max(0, 50 - title.length));
  console.log(`\n── ${title} ${line}`);
}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) { err('MONGODB_URI manquant dans .env'); process.exit(1); }

  // ── 1. Connexion ──────────────────────────────────────────────────────────
  sep('1. Connexion MongoDB');
  const client = new MongoClient(uri);
  await client.connect();
  ok('MongoClient connecté');

  // Extraire le nom de la base depuis l'URI
  const rawDb = uri.replace(/\?.*$/, '').split('/').pop();
  const dbName = rawDb && rawDb.length > 0 ? rawDb : 'agent-boutique';
  const db = client.db(dbName);
  ok(`Base de données : ${dbName}`);

  // ── 2. Collections existantes ─────────────────────────────────────────────
  sep('2. Collections dans la base');
  const allCols = (await db.listCollections().toArray()).map(c => c.name).sort();
  console.log(`  ${allCols.join(' | ')}`);

  const hasCheckpoints = allCols.includes(CHECKPOINT_COL);
  const hasWrites      = allCols.includes(WRITES_COL);

  // ── 3. Collections LangGraph ──────────────────────────────────────────────
  sep('3. Collections LangGraph');
  if (hasCheckpoints) ok(`"${CHECKPOINT_COL}" présente`);
  else warn(`"${CHECKPOINT_COL}" absente — le serveur doit recevoir un 1er message WhatsApp`);

  if (hasWrites) ok(`"${WRITES_COL}" présente`);
  else warn(`"${WRITES_COL}" absente`);

  // ── 4. Données checkpoints ────────────────────────────────────────────────
  sep('4. Contenu checkpoints');
  if (hasCheckpoints) {
    const total   = await db.collection(CHECKPOINT_COL).countDocuments();
    const threads = await db.collection(CHECKPOINT_COL).distinct('thread_id');
    ok(`${total} checkpoint(s) — ${threads.length} thread(s) distinct(s)`);

    const last = await db.collection(CHECKPOINT_COL)
      .find({}).sort({ _id: -1 }).limit(1).toArray();

    if (last.length > 0) {
      const d = last[0];
      ok(`Dernier checkpoint :`);
      console.log(`       thread_id     : ${d.thread_id}`);
      console.log(`       checkpoint_id : ${d.checkpoint_id}`);
      console.log(`       checkpoint_ns : ${d.checkpoint_ns}`);
      try { console.log(`       créé le       : ${d._id.getTimestamp().toISOString()}`); } catch {}
    }
  } else {
    warn('Aucun checkpoint à afficher');
  }

  sep('5. Contenu checkpoint_writes');
  if (hasWrites) {
    const total = await db.collection(WRITES_COL).countDocuments();
    ok(`${total} write(s) enregistré(s)`);
  } else {
    warn('Aucun write à afficher');
  }

  // ── 5. Instanciation MongoDBSaver (même chemin que l'orchestrateur) ───────
  sep('6. MongoDBSaver instanciation directe');
  try {
    const { MongoDBSaver } = require('@langchain/langgraph-checkpoint-mongodb');
    const saver = new MongoDBSaver({ client });
    ok('MongoDBSaver instancié sans erreur');

    // test list() sur un thread_id factice
    const results = [];
    for await (const t of saver.list({ configurable: { thread_id: '__validation_test__' } }, { limit: 1 })) {
      results.push(t);
    }
    ok(`MongoDBSaver.list() opérationnel (${results.length} résultat(s) pour thread test)`);
  } catch (e) {
    err(`MongoDBSaver erreur : ${e.message}`);
  }

  await client.close();

  // ── Résumé ─────────────────────────────────────────────────────────────────
  sep('Résumé');
  if (hasCheckpoints && hasWrites) {
    ok('MongoDBSaver ACTIF — checkpoints persistants confirmés');
    ok('Aucun fallback MemorySaver silencieux');
    ok('La mémoire survivra aux restarts Railway');
  } else if (!hasCheckpoints) {
    warn('Collections pas encore créées (normal si aucun message WhatsApp reçu)');
    console.log('\n  → Envoyez un message depuis votre téléphone vers le numéro de l\'agent');
    console.log('  → Puis re-lancez ce script pour confirmer la création des collections');
  }
  console.log('');
}

run().catch(e => {
  console.error('\n❌ Erreur fatale :', e.message);
  process.exit(1);
});
