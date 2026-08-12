'use strict';

/**
 * Import des prospects Adèle (264 contacts "fiables") depuis 5 CSV vers MongoDB.OutboundLead.
 *
 * Lecture SEULE sur les CSV. Écriture UNIQUEMENT dans OutboundLead (campaign: 'adele').
 * N'envoie AUCUN message WhatsApp/email — import de données uniquement. Le déclenchement
 * des séquences reste une action manuelle séparée.
 *
 * Sources (dossier fourni séparément, pas versionné dans le repo) :
 *   C:\Users\Florian\Documents\prospects-adele\*-fiable.csv
 *   (uniquement les 5 fichiers -fiable.csv — PAS les X.csv ni les -a-verifier.csv,
 *   ce tri qualité exclut des mismatches de matching Google Places déjà identifiés)
 *
 * Mapping colonnes CSV → OutboundLead :
 *   nom          → business   (raison sociale / nom de l'établissement)
 *   dirigeant    → name       (nom du contact — vide si absent dans le CSV, non fabriqué)
 *   adresse      → adresse
 *   ville        → city
 *   code_postal  → codePostal
 *   telephone    → phone      (via normalizePhone(), skip si absent/invalide)
 *   email        → email
 *   site_web     → siteWeb
 *   siret        → siret
 *   naf          → naf
 *   (dérivé du fichier source, pas du CSV) → secteur
 *
 * Usage : node scripts/import-adele-prospects.js
 */

const path = require('path');
const fs = require('fs');

if (!process.env.MONGODB_URI) {
  require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
}

const csvParser = require('csv-parser');
const mongoose  = require('mongoose');

const OutboundLead              = require('../models/OutboundLead');
const { normalizePhone }        = require('../services/prospecting');

const CSV_DIR  = 'C:\\Users\\Florian\\Documents\\prospects-adele\\';
const CAMPAIGN = 'adele';

// Uniquement les fichiers -fiable.csv, comme demandé (tri qualité déjà effectué)
const SOURCES = [
  { file: 'kine-osteopathie-fiable.csv', secteur: 'kine_osteo' },
  { file: 'salon-coiffure-fiable.csv', secteur: 'hair_salon' },
  { file: 'institut-beaute-fiable.csv', secteur: 'beauty_wellness' },
  { file: 'coach-formateur-fiable.csv', secteur: 'coach_training' },
  { file: 'artisan-depannage-fiable.csv', secteur: 'home_services' },
];

// Numéro français valide après normalisation : +33 suivi de 9 chiffres
const VALID_PHONE_RE = /^\+33\d{9}$/;

function readCsv(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      // Les CSV sources ont un BOM UTF-8 collé au 1er en-tête ("nom") —
      // sans ce strip, row.nom est undefined et "business" reste vide.
      .pipe(csvParser({ mapHeaders: ({ header }) => header.replace(/^﻿/, '') }))
      .on('data', row => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

async function importSource({ file, secteur }, stats) {
  const filePath = path.join(CSV_DIR, file);
  const rows = await readCsv(filePath);

  let imported = 0;
  let skippedNoPhone = 0;
  let skippedInvalidPhone = 0;

  for (const row of rows) {
    const rawPhone = (row.telephone || '').trim();

    if (!rawPhone) {
      skippedNoPhone++;
      continue;
    }

    const phone = normalizePhone(rawPhone);

    if (!phone || !VALID_PHONE_RE.test(phone)) {
      skippedInvalidPhone++;
      console.log(`[IMPORT ADELE] Skip (téléphone invalide) — "${row.nom || '?'}" | brut="${rawPhone}" → normalisé="${phone}"`);
      continue;
    }

    const doc = {
      phone,
      name:       (row.dirigeant   || '').trim(),
      business:   (row.nom         || '').trim(),
      city:       (row.ville       || '').trim(),
      campaign:   CAMPAIGN,
      status:     'NEW',
      secteur,
      email:      (row.email       || '').trim(),
      adresse:    (row.adresse     || '').trim(),
      codePostal: (row.code_postal || '').trim(),
      siteWeb:    (row.site_web    || '').trim(),
      siret:      (row.siret       || '').trim(),
      naf:        (row.naf         || '').trim(),
    };

    // Upsert par (phone, campaign) — idempotent si le script est relancé.
    // ⚠️ OutboundLead n'a PAS d'index unique composé {phone, campaign} en base
    // (contrairement à Prospect/WhatsAppSequence). findOneAndUpdate garantit
    // l'idempotence pour des exécutions séquentielles de ce script, mais sans
    // la garantie dure d'un index unique en cas d'exécutions concurrentes.
    await OutboundLead.findOneAndUpdate(
      { phone: doc.phone, campaign: CAMPAIGN },
      { $set: doc },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    imported++;
  }

  stats.push({
    fichier: file,
    lignes: rows.length,
    importés: imported,
    'skip (sans tél)': skippedNoPhone,
    'skip (tél invalide)': skippedInvalidPhone,
  });

  return { imported, skippedNoPhone, skippedInvalidPhone, totalLignes: rows.length };
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI manquant — vérifier le .env');

  await mongoose.connect(uri);
  console.log('[IMPORT ADELE] MongoDB connecté —', new Date().toISOString(), '\n');

  const stats = [];
  let totalLignes = 0;
  let totalImported = 0;
  let totalSkippedNoPhone = 0;
  let totalSkippedInvalidPhone = 0;

  for (const source of SOURCES) {
    const r = await importSource(source, stats);
    totalLignes += r.totalLignes;
    totalImported += r.imported;
    totalSkippedNoPhone += r.skippedNoPhone;
    totalSkippedInvalidPhone += r.skippedInvalidPhone;
  }

  console.log('\n=== RÉSUMÉ PAR FICHIER ===');
  console.table(stats);

  const totalInDbAdele = await OutboundLead.countDocuments({ campaign: CAMPAIGN });

  console.log('\n=== TOTAUX ===');
  console.log(`Lignes lues (5 fichiers)         : ${totalLignes}`);
  console.log(`Importés (upsert)                : ${totalImported}`);
  console.log(`Skippés — téléphone absent       : ${totalSkippedNoPhone}`);
  console.log(`Skippés — téléphone invalide     : ${totalSkippedInvalidPhone}`);
  console.log(`Total documents campaign='adele' en base après import : ${totalInDbAdele}`);

  await mongoose.disconnect();
  console.log('\n[IMPORT ADELE] Déconnecté —', new Date().toISOString());
}

main().catch(err => {
  console.error('[IMPORT ADELE ERROR]', err.message);
  process.exit(1);
});
