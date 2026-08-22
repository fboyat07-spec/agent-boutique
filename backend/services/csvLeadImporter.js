const fs = require('fs');
const OutboundLead = require('../models/OutboundLead');

// ─── Import fichier existant — COMPORTEMENT INCHANGÉ ───────────────────────────
// Utilisé par agentRouter.handleLeadImport(data.filePath). Ne pose pas de
// campagne (défaut modèle 'agent_boutique'), dédoublonne par {phone} — exactement
// comme avant l'ajout du sélecteur de campagne. Ne pas modifier cette fonction.
async function importCSVLeads(filePath) {
  try {
    console.log('[CSV IMPORT START]', { filePath });

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').slice(1); // skip header

    for (const line of lines) {
      if (!line.trim()) continue;

      const [phoneRaw, name, city, business] = line.split(',');

      const phone = phoneRaw?.trim();

      if (!phone || !phone.startsWith('+33')) {
        console.log('[INVALID PHONE SKIPPED]', { phone });
        continue;
      }

      const exists = await OutboundLead.findOne({ phone });

      if (!exists) {
        await OutboundLead.create({
          phone,
          name: name || 'Prospect',
          city: city || 'France',
          business: business || 'Business',
          source: 'csv_import',
          status: 'NEW',
          attempts: 0,
          createdAt: new Date()
        });

        console.log('[REAL LEAD IMPORTED]', { phone });
      }
    }

  } catch (err) {
    console.log('[CSV IMPORT ERROR]', err.message);
  }
}

// ─── Import taggé par campagne (écran console) ─────────────────────────────────
// Nouveau point d'entrée de la MÊME mécanique (même module, même modèle
// OutboundLead) : au lieu de tagger les leads par script manuel APRÈS coup, la
// campagne est choisie AU MOMENT de l'import dans la console.

/**
 * Parse le texte CSV en lignes de lead. Colonnes attendues (mêmes que
 * importCSVLeads) : phone, name, city, business. Pur — aucune I/O.
 * @param {string} csvText
 * @returns {Array<{phone:string,name:string,city:string,business:string}>}
 */
function parseLeadRows(csvText) {
  const lines = String(csvText || '').split('\n').slice(1); // skip header
  const rows = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const [phoneRaw, name, city, business] = line.split(',');
    rows.push({
      phone:    (phoneRaw || '').trim(),
      name:     (name || '').trim(),
      city:     (city || '').trim(),
      business: (business || '').trim(),
    });
  }
  return rows;
}

/**
 * Construit le document OutboundLead à insérer pour une ligne + une campagne.
 * Pur — aucune I/O.
 *
 * ⚠️ Règle de tag : une campagne VIDE/absente ne pose PAS le champ `campaign`
 * → le défaut du modèle ('agent_boutique') s'applique, comportement identique
 * à l'import par défaut. Une campagne choisie est posée telle quelle (texte
 * libre), tagant le lead dès l'import.
 * @param {{phone:string,name:string,city:string,business:string}} row
 * @param {string} campaign
 * @returns {object}
 */
function buildLeadDoc(row, campaign) {
  const doc = {
    phone:    row.phone,
    name:     row.name     || 'Prospect',
    city:     row.city     || 'France',
    business: row.business || 'Business',
    source:   'csv_import',
    status:   'NEW',
    attempts: 0,
  };
  const c = String(campaign || '').trim();
  if (c) doc.campaign = c;   // sinon : défaut modèle 'agent_boutique'
  return doc;
}

/**
 * Importe des leads depuis un texte CSV, taggés avec la campagne choisie.
 * Dédoublonne sur {phone, campaign} (respecte l'index unique d'OutboundLead) :
 * un même numéro peut ainsi exister dans deux campagnes distinctes, mais jamais
 * deux fois dans la même. Une ligne en erreur n'interrompt jamais les autres.
 *
 * @param {string} csvText
 * @param {{campaign?:string}} [opts]
 * @returns {Promise<{imported:number, skipped:number, errors:string[]}>}
 */
async function importLeadsFromText(csvText, { campaign = '' } = {}) {
  const rows = parseLeadRows(csvText);
  const c = String(campaign || '').trim();
  // Campagne effectivement stockée (défaut modèle si aucune choisie) — sert de
  // clé de dédoublonnage cohérente avec l'index {phone, campaign}.
  const effectiveCampaign = c || 'agent_boutique';

  const errors = [];
  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!row.phone || !row.phone.startsWith('+33')) {
      skipped++;
      errors.push(`Téléphone invalide (format +33 attendu) — ignoré : "${row.phone}"`);
      continue;
    }

    try {
      const exists = await OutboundLead.findOne({ phone: row.phone, campaign: effectiveCampaign }).lean();
      if (exists) { skipped++; continue; }

      await OutboundLead.create(buildLeadDoc(row, c));
      imported++;
    } catch (err) {
      if (err.code === 11000) {
        skipped++; // doublon concurrent {phone, campaign}
      } else {
        errors.push(`Erreur enregistrement "${row.phone}" — ${err.message}`);
      }
    }
  }

  return { imported, skipped, errors };
}

module.exports = {
  importCSVLeads,
  importLeadsFromText,
  parseLeadRows,
  buildLeadDoc,
};
