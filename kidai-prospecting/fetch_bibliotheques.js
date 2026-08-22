'use strict';

/**
 * ÉTAPE 1 — Collecte bibliothèques/médiathèques (prospection KidAI Learning).
 * ──────────────────────────────────────────────────────────────────────────
 * SCRIPT À EXÉCUTER EN LOCAL (le container cloud de cette session n'a pas
 * d'accès réseau sortant vers data.gouv.fr — testé et confirmé bloqué).
 *
 * Source : dataset officiel data.gouv.fr "adresses-des-bibliotheques-publiques".
 * Résout dynamiquement l'URL de la ressource CSV via l'API data.gouv.fr
 * (jamais d'URL de ressource codée en dur — les UUID de ressources data.gouv.fr
 * peuvent changer entre deux publications du jeu de données).
 *
 * Étapes :
 *   1. Résout le dataset par son slug via /api/1/datasets/<slug>/
 *   2. Télécharge la ressource CSV principale
 *   3. Affiche les valeurs RÉELLES de la colonne Statut (ne suppose rien)
 *   4. Filtre : Statut ∈ {Bibliothèque municipale, Bibliothèque intercommunale,
 *      Bibliothèque municipale classée} + (Téléphone renseigné OU site_internet renseigné)
 *   5. Écrit kidai-prospecting/data/kidai_bibliotheques_filtrees.csv avec les
 *      10 colonnes retenues
 *
 * Usage : node fetch_bibliotheques.js
 * Dépendances : axios (déjà dans package.json racine du repo)
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const DATASET_SLUG = 'adresses-des-bibliotheques-publiques';
const DATASET_API_URL = `https://www.data.gouv.fr/api/1/datasets/${DATASET_SLUG}/`;

const OUT_DIR = path.join(__dirname, 'data');
const OUT_FILE = path.join(OUT_DIR, 'kidai_bibliotheques_filtrees.csv');
const RAW_FILE = path.join(OUT_DIR, 'bibliotheques_brut.csv');

const STATUTS_RETENUS = [
  'bibliothèque municipale',
  'bibliothèque intercommunale',
  'bibliothèque municipale classée',
];

const COLONNES_A_CONSERVER = [
  'nom_de_l_etablissement',
  'Adresse',
  'CP',
  'Ville',
  'Région',
  'Département',
  'Téléphone',
  'site_internet',
  'Statut',
  'Population commune',
];

// ─── Parsing CSV robuste (gère guillemets, virgule ou point-virgule) ──────────

function detectDelimiter(headerLine) {
  const commaCount = (headerLine.match(/,/g) || []).length;
  const semiCount = (headerLine.match(/;/g) || []).length;
  return semiCount > commaCount ? ';' : ',';
}

function parseCsvLine(line, delimiter) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else {
        cur += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === delimiter) { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

function parseCsv(text) {
  // Retire un éventuel BOM UTF-8 en tête de fichier
  const clean = text.replace(/^﻿/, '');
  const lines = clean.split(/\r?\n/).filter(l => l.length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter).map(h => h.trim());

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i], delimiter);
    const row = {};
    headers.forEach((h, idx) => { row[h] = (fields[idx] ?? '').trim(); });
    rows.push(row);
  }
  return { headers, rows };
}

function csvEscape(v) {
  const s = String(v ?? '');
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsv(filePath, headers, rows) {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => csvEscape(row[h])).join(','));
  }
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

// ─── Résolution du nom de colonne réel (tolérant aux variations mineures) ────

function findColumn(headers, candidates) {
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  const normalizedHeaders = headers.map(h => ({ raw: h, n: norm(h) }));
  for (const cand of candidates) {
    const nc = norm(cand);
    const hit = normalizedHeaders.find(h => h.n === nc);
    if (hit) return hit.raw;
  }
  return null;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('[BIBLIOTHEQUES] Résolution du dataset data.gouv.fr:', DATASET_SLUG);
  const { data: dataset } = await axios.get(DATASET_API_URL, { timeout: 15000 });

  const resources = dataset.resources || [];
  // On cherche la ressource CSV principale (format csv, la plus grosse / la plus récente)
  const csvResources = resources.filter(r => (r.format || '').toLowerCase() === 'csv');
  if (csvResources.length === 0) {
    throw new Error('Aucune ressource CSV trouvée sur le dataset — vérifier manuellement sur data.gouv.fr');
  }
  csvResources.sort((a, b) => new Date(b.last_modified) - new Date(a.last_modified));
  const resource = csvResources[0];

  console.log('[BIBLIOTHEQUES] Ressource retenue:', resource.title, '—', resource.url);
  console.log('[BIBLIOTHEQUES] Dernière modification:', resource.last_modified);

  const { data: csvText } = await axios.get(resource.url, {
    timeout: 60000,
    responseType: 'text',
    // data.gouv.fr sert parfois en latin1 — on force le décodage texte brut ici,
    // un re-encodage sera fait si nécessaire après inspection des accents.
    transformResponse: [d => d],
  });

  fs.writeFileSync(RAW_FILE, csvText, 'utf8');
  console.log('[BIBLIOTHEQUES] Brut sauvegardé:', RAW_FILE);

  const { headers, rows } = parseCsv(csvText);
  console.log(`[BIBLIOTHEQUES] Colonnes détectées (${headers.length}):`, headers.join(' | '));
  console.log(`[BIBLIOTHEQUES] Lignes brutes: ${rows.length}`);

  const statutCol = findColumn(headers, ['Statut', 'statut', 'type_etablissement']);
  if (!statutCol) {
    console.error('[BIBLIOTHEQUES] Colonne Statut introuvable — colonnes disponibles ci-dessus. ARRÊT.');
    process.exit(1);
  }

  // Valeurs RÉELLES de la colonne Statut — ne rien supposer
  const statutValues = {};
  for (const row of rows) {
    const v = row[statutCol] || '(vide)';
    statutValues[v] = (statutValues[v] || 0) + 1;
  }
  console.log('\n[BIBLIOTHEQUES] Valeurs réelles de la colonne Statut:');
  Object.entries(statutValues).sort((a, b) => b[1] - a[1]).forEach(([v, n]) => {
    console.log(`   ${n.toString().padStart(6)}  ${v}`);
  });

  const telCol = findColumn(headers, ['Téléphone', 'Telephone', 'tel']);
  const webCol = findColumn(headers, ['site_internet', 'site internet', 'siteweb', 'site_web']);
  if (!telCol || !webCol) {
    console.error('[BIBLIOTHEQUES] Colonne Téléphone ou site_internet introuvable — colonnes disponibles ci-dessus. ARRÊT.');
    process.exit(1);
  }

  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const statutsRetenusNorm = STATUTS_RETENUS.map(norm);

  const filtered = rows.filter(row => {
    const statut = norm(row[statutCol] || '');
    if (!statutsRetenusNorm.includes(statut)) return false;
    const hasTel = (row[telCol] || '').trim().length > 0;
    const hasWeb = (row[webCol] || '').trim().length > 0;
    return hasTel || hasWeb;
  });

  console.log(`\n[BIBLIOTHEQUES] Lignes après filtre Statut + (tél OU site): ${filtered.length}`);
  console.log('[BIBLIOTHEQUES] (attendu ~13 341 lors de la session précédente — le chiffre réel peut différer si le dataset a été mis à jour)');

  // Mapping colonnes retenues → noms réels détectés dans ce fichier
  const outHeaders = COLONNES_A_CONSERVER;
  const outRows = filtered.map(row => {
    const out = {};
    for (const wanted of COLONNES_A_CONSERVER) {
      const real = findColumn(headers, [wanted]);
      out[wanted] = real ? row[real] : '';
    }
    return out;
  });

  writeCsv(OUT_FILE, outHeaders, outRows);
  console.log('\n[BIBLIOTHEQUES] Fichier filtré écrit:', OUT_FILE);
  console.log(`[BIBLIOTHEQUES] ${outRows.length} lignes, ${outHeaders.length} colonnes.`);
}

main().catch(err => {
  console.error('[BIBLIOTHEQUES ERROR]', err.message);
  process.exit(1);
});
