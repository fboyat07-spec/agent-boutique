'use strict';

/**
 * ÉTAPE 3 — Enrichissement Google Places des éditeurs (prospection KidAI Learning).
 * ──────────────────────────────────────────────────────────────────────────────
 * SCRIPT À EXÉCUTER EN LOCAL. Enrichit kidai-prospecting/data/kidai_editeurs_5811z.csv
 * (produit par fetch_editeurs.js) avec téléphone, site web, et email best-effort
 * trouvé sur le site, via l'API Google Places legacy (mêmes endpoints que
 * backend/services/prospecting.js).
 *
 * UNIQUEMENT les éditeurs — PAS les bibliothèques (leur 85% de téléphone direct
 * déjà présent dans le dataset officiel suffit comme premier canal, décision
 * déjà tranchée).
 *
 * Sécurité : vérifie la clé API avec UNE SEULE requête légère avant de lancer
 * le batch complet. Si absente/invalide, s'arrête sans toucher au CSV source
 * et affiche la marche à suivre pour Florian.
 *
 * Checkpoint tous les 50 éditeurs traités : écrit un CSV partiel + un fichier
 * .checkpoint.json (index du dernier traité) pour pouvoir reprendre après
 * interruption sans tout refaire (et sans re-consommer du quota API).
 *
 * Usage : node enrich_editeurs_places.js
 * Variables d'env acceptées (l'une des deux) : GOOGLE_PLACES_API_KEY ou
 * GOOGLE_MAPS_API_KEY (même convention que backend/services/prospecting.js).
 * Dépendances : axios, csv-parser (déjà dans package.json racine du repo)
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const csvParser = require('csv-parser');

if (!process.env.GOOGLE_MAPS_API_KEY && !process.env.GOOGLE_PLACES_API_KEY) {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) require('dotenv').config({ path: envPath });
}

const API_KEY = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

const PLACES_TEXT_SEARCH = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const PLACES_DETAILS = 'https://maps.googleapis.com/maps/api/place/details/json';
const DETAILS_FIELDS = 'name,formatted_phone_number,formatted_address,website';

const DATA_DIR = path.join(__dirname, 'data');
const IN_FILE = path.join(DATA_DIR, 'kidai_editeurs_5811z.csv');
const OUT_FILE = path.join(DATA_DIR, 'kidai_editeurs_5811z_enrichis.csv');
const CHECKPOINT_FILE = path.join(DATA_DIR, 'enrich_editeurs.checkpoint.json');

const CHECKPOINT_EVERY = 50;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function csvEscape(v) {
  const s = String(v ?? '');
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsv(filePath, headers, rows) {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) lines.push(headers.map(h => csvEscape(row[h])).join(','));
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

function readCsv(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csvParser({ mapHeaders: ({ header }) => header.replace(/^﻿/, '') }))
      .on('data', row => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

/**
 * Vérifie la clé API avec UNE requête Text Search légère, sans consommer
 * de quota Details. Retourne true/false — n'échoue jamais silencieusement.
 */
async function checkApiKey() {
  console.log('[ENRICH] Vérification de la clé API sur 1 requête de test...');
  try {
    const { data } = await axios.get(PLACES_TEXT_SEARCH, {
      params: { query: 'éditeur jeunesse Paris', key: API_KEY },
      timeout: 10000,
    });

    if (data.status === 'OK' || data.status === 'ZERO_RESULTS') {
      console.log('[ENRICH] Clé API valide (statut Places:', data.status + ').');
      return true;
    }

    console.error('[ENRICH] Clé API invalide ou restreinte — statut Places:', data.status);
    if (data.error_message) console.error('[ENRICH]', data.error_message);
    return false;
  } catch (err) {
    console.error('[ENRICH] Échec de la requête de test:', err.message);
    return false;
  }
}

async function fetchPlaceForEditeur(editeur) {
  const query = `${editeur.nom} ${editeur.ville}`.trim();
  const { data: searchData } = await axios.get(PLACES_TEXT_SEARCH, {
    params: { query, key: API_KEY },
    timeout: 10000,
  });

  if (searchData.status !== 'OK' || !(searchData.results || []).length) {
    return { phone: '', website: '', email: '', placesStatus: searchData.status };
  }

  const placeId = searchData.results[0].place_id;
  const { data: detailsData } = await axios.get(PLACES_DETAILS, {
    params: { place_id: placeId, fields: DETAILS_FIELDS, key: API_KEY },
    timeout: 10000,
  });

  const result = detailsData.result || {};
  const phone = (result.formatted_phone_number || '').trim();
  const website = (result.website || '').trim();

  let email = '';
  if (website) {
    email = await bestEffortEmailFromSite(website);
  }

  return { phone, website, email, placesStatus: 'OK' };
}

/**
 * Best-effort : une seule requête GET sur la page d'accueil du site, regex
 * simple sur une adresse email. Aucun crawl multi-pages, timeout court,
 * échec silencieux (retourne '') si le site ne répond pas.
 */
async function bestEffortEmailFromSite(url) {
  try {
    const { data } = await axios.get(url, {
      timeout: 6000,
      responseType: 'text',
      transformResponse: [d => d],
      maxRedirects: 3,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KidAI-Prospecting/1.0)' },
    });
    const match = String(data).match(EMAIL_RE);
    return match ? match[0] : '';
  } catch {
    return '';
  }
}

function loadCheckpoint() {
  if (!fs.existsSync(CHECKPOINT_FILE)) return { lastIndex: -1 };
  try {
    return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
  } catch {
    return { lastIndex: -1 };
  }
}

function saveCheckpoint(lastIndex) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify({ lastIndex, savedAt: new Date().toISOString() }, null, 2));
}

async function main() {
  if (!API_KEY) {
    console.error('\n[ENRICH] ARRÊT — Aucune clé API trouvée (GOOGLE_PLACES_API_KEY ni GOOGLE_MAPS_API_KEY).');
    console.error('[ENRICH] Rien n\'a été lancé sur les éditeurs. Marche à suivre :');
    console.error('[ENRICH]   1. Google Cloud Console → APIs & Services → Credentials');
    console.error('[ENRICH]   2. Régénérer/vérifier une clé API');
    console.error('[ENRICH]   3. Activer "Places API" (legacy)');
    console.error('[ENRICH]   4. Exporter GOOGLE_PLACES_API_KEY=... (ou GOOGLE_MAPS_API_KEY) avant de relancer ce script');
    process.exit(1);
  }

  const keyValid = await checkApiKey();
  if (!keyValid) {
    console.error('\n[ENRICH] ARRÊT — Clé API présente mais invalide/restreinte/expirée.');
    console.error('[ENRICH] Rien n\'a été lancé sur les éditeurs. Marche à suivre :');
    console.error('[ENRICH]   1. Google Cloud Console → APIs & Services → Credentials');
    console.error('[ENRICH]   2. Régénérer la clé');
    console.error('[ENRICH]   3. Vérifier que "Places API" (legacy) est activée pour le projet');
    console.error('[ENRICH]   4. Relancer ce script spécifiquement (les étapes 1 et 2 restent acquises)');
    process.exit(1);
  }

  if (!fs.existsSync(IN_FILE)) {
    console.error('[ENRICH] Fichier source introuvable:', IN_FILE);
    console.error('[ENRICH] Lancer d\'abord fetch_editeurs.js.');
    process.exit(1);
  }

  const editeurs = await readCsv(IN_FILE);
  console.log(`[ENRICH] ${editeurs.length} éditeurs à enrichir.`);

  const checkpoint = loadCheckpoint();
  const startIndex = checkpoint.lastIndex + 1;
  if (startIndex > 0) {
    console.log(`[ENRICH] Reprise après checkpoint — déjà traité: ${startIndex}/${editeurs.length}`);
  }

  const outHeaders = ['nom', 'adresse', 'ville', 'code_postal', 'siret', 'naf', 'dirigeant', 'tranche_effectif', 'phone_places', 'website_places', 'email_best_effort', 'places_status'];
  let enriched = fs.existsSync(OUT_FILE) && startIndex > 0
    ? await readCsv(OUT_FILE)
    : [];

  let withPhone = 0, withWebsite = 0, withEmail = 0;
  for (const row of enriched) {
    if (row.phone_places) withPhone++;
    if (row.website_places) withWebsite++;
    if (row.email_best_effort) withEmail++;
  }

  for (let i = startIndex; i < editeurs.length; i++) {
    const editeur = editeurs[i];
    process.stdout.write(`\r[ENRICH] ${i + 1}/${editeurs.length} — ${editeur.nom}`.padEnd(100));

    let result;
    try {
      result = await fetchPlaceForEditeur(editeur);
    } catch (err) {
      console.warn(`\n[ENRICH] Échec sur "${editeur.nom}":`, err.message);
      result = { phone: '', website: '', email: '', placesStatus: 'ERROR' };
    }

    if (result.phone) withPhone++;
    if (result.website) withWebsite++;
    if (result.email) withEmail++;

    enriched.push({
      ...editeur,
      phone_places: result.phone,
      website_places: result.website,
      email_best_effort: result.email,
      places_status: result.placesStatus,
    });

    if ((i + 1) % CHECKPOINT_EVERY === 0 || i === editeurs.length - 1) {
      writeCsv(OUT_FILE, outHeaders, enriched);
      saveCheckpoint(i);
      console.log(`\n[ENRICH] Checkpoint — ${i + 1}/${editeurs.length} traités. tel=${withPhone} web=${withWebsite} email=${withEmail}`);
    }

    await sleep(200); // throttle raisonnable pour rester sous les quotas Places
  }

  console.log('\n\n[ENRICH] Terminé.');
  console.log(`[ENRICH] Total: ${enriched.length} | téléphone trouvé: ${withPhone} | site trouvé: ${withWebsite} | email trouvé: ${withEmail}`);
  console.log('[ENRICH] Fichier final:', OUT_FILE);
}

main().catch(err => {
  console.error('[ENRICH ERROR]', err.message);
  process.exit(1);
});
