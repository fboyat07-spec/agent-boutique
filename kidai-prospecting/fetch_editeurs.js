'use strict';

/**
 * ÉTAPE 2 — Collecte éditeurs (prospection KidAI Learning).
 * ──────────────────────────────────────────────────────────────────────────
 * SCRIPT À EXÉCUTER EN LOCAL (le container cloud de cette session n'a pas
 * d'accès réseau sortant vers recherche-entreprises.api.gouv.fr — testé et
 * confirmé bloqué).
 *
 * Source : API recherche-entreprises.api.gouv.fr (publique, gratuite, sans clé).
 * Même API que celle utilisée pour la collecte Adèle.
 *
 * NAF 58.11Z (édition de livres), France entière, tranches d'effectif salarié
 * 0-49 : codes INSEE 00, 01, 02, 03, 11, 12 (exclut "NN" non-employeur et
 * les tranches 50+ salariés).
 *
 * Le filtre par tranche d'effectif est appliqué CÔTÉ CLIENT après récupération
 * de toutes les pages — l'API ne garantit pas un paramètre de requête fiable
 * pour ce filtre précis, donc on ne suppose rien et on filtre nous-mêmes sur
 * le champ retourné par chaque résultat.
 *
 * Déduplication par SIRET (un SIREN peut avoir plusieurs établissements ;
 * on garde le siège si plusieurs matchs).
 *
 * Usage : node fetch_editeurs.js
 * Dépendances : axios (déjà dans package.json racine du repo)
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const API_URL = 'https://recherche-entreprises.api.gouv.fr/search';
const NAF_CODE = '58.11Z';
const PER_PAGE = 25; // max autorisé par l'API
const TRANCHES_RETENUES = ['00', '01', '02', '03', '11', '12'];

const OUT_DIR = path.join(__dirname, 'data');
const OUT_FILE = path.join(OUT_DIR, 'kidai_editeurs_5811z.csv');

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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Extrait la tranche d'effectif salarié d'un résultat, en tolérant les
 * variations de forme de la réponse API (le champ peut être à la racine
 * ou nichée sous un objet "complements" selon la version de l'API).
 */
function extractTrancheEffectif(result) {
  return (
    result.tranche_effectif_salarie ??
    result.complements?.tranche_effectif_salarie ??
    result.siege?.tranche_effectif_salarie ??
    null
  );
}

function extractDirigeant(result) {
  const dirigeants = result.dirigeants || [];
  if (dirigeants.length === 0) return '';
  const d = dirigeants[0];
  if (d.nom || d.prenoms) {
    return [d.prenoms, d.nom].filter(Boolean).join(' ');
  }
  return d.denomination || '';
}

async function fetchAllPages() {
  const all = [];
  let page = 1;
  let totalPages = null;

  while (true) {
    console.log(`[EDITEURS] Requête page ${page}${totalPages ? '/' + totalPages : ''}...`);
    const { data } = await axios.get(API_URL, {
      params: {
        activite_principale: NAF_CODE,
        page,
        per_page: PER_PAGE,
        minimal: false,
      },
      timeout: 15000,
    });

    const results = data.results || [];
    all.push(...results);

    if (totalPages === null && data.total_pages) {
      totalPages = data.total_pages;
      console.log(`[EDITEURS] Total résultats bruts annoncé par l'API: ${data.total_results} (${totalPages} pages)`);
    }

    if (results.length === 0 || (totalPages && page >= totalPages)) break;
    page++;

    // Throttle pour rester sous la limite de rate (API publique, pas de clé)
    await sleep(300);
  }

  return all;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('[EDITEURS] Collecte NAF', NAF_CODE, '— France entière, via recherche-entreprises.api.gouv.fr');
  const results = await fetchAllPages();
  console.log(`[EDITEURS] Total résultats bruts récupérés: ${results.length}`);

  if (results.length > 0) {
    console.log('\n[EDITEURS] Exemple de structure du 1er résultat (pour vérifier les champs disponibles):');
    console.log(JSON.stringify(results[0], null, 2).slice(0, 2000));
  }

  // Distribution réelle des tranches d'effectif rencontrées — ne rien supposer
  const trancheDist = {};
  for (const r of results) {
    const t = extractTrancheEffectif(r) ?? '(absent)';
    trancheDist[t] = (trancheDist[t] || 0) + 1;
  }
  console.log('\n[EDITEURS] Distribution réelle des tranches d\'effectif salarié:');
  Object.entries(trancheDist).sort((a, b) => b[1] - a[1]).forEach(([t, n]) => {
    console.log(`   ${n.toString().padStart(6)}  ${t}`);
  });

  const filtered = results.filter(r => {
    const t = extractTrancheEffectif(r);
    return t !== null && TRANCHES_RETENUES.includes(String(t));
  });
  console.log(`\n[EDITEURS] Après filtre tranche effectif 0-49 (codes ${TRANCHES_RETENUES.join(',')}): ${filtered.length}`);
  console.log('[EDITEURS] (attendu ~935 lors de la session précédente — le chiffre réel peut différer si le registre a été mis à jour)');

  // Déduplication par SIRET (siège en priorité)
  const bySiret = new Map();
  for (const r of filtered) {
    const siret = r.siege?.siret || r.siret || r.siren;
    if (!siret) continue;
    if (!bySiret.has(siret)) {
      bySiret.set(siret, {
        nom: r.nom_complet || r.nom_raison_sociale || '',
        adresse: r.siege?.adresse || r.siege?.geo_adresse || '',
        ville: r.siege?.libelle_commune || '',
        code_postal: r.siege?.code_postal || '',
        siret,
        naf: r.siege?.activite_principale || r.activite_principale || NAF_CODE,
        dirigeant: extractDirigeant(r),
        tranche_effectif: extractTrancheEffectif(r) || '',
      });
    }
  }

  const rows = Array.from(bySiret.values());
  console.log(`[EDITEURS] Après déduplication par SIRET: ${rows.length}`);

  const headers = ['nom', 'adresse', 'ville', 'code_postal', 'siret', 'naf', 'dirigeant', 'tranche_effectif'];
  writeCsv(OUT_FILE, headers, rows);

  console.log('\n[EDITEURS] Fichier écrit:', OUT_FILE);
  console.log(`[EDITEURS] ${rows.length} lignes, ${headers.length} colonnes.`);
}

main().catch(err => {
  console.error('[EDITEURS ERROR]', err.message);
  if (err.response) {
    console.error('[EDITEURS ERROR] Statut HTTP:', err.response.status, '—', JSON.stringify(err.response.data).slice(0, 500));
  }
  process.exit(1);
});
