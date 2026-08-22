'use strict';

/**
 * Invoice — factures clientes suivies pour la campagne "relance_facture".
 * ──────────────────────────────────────────────────────────────────────
 * Nouveau type de campagne dans le schéma multi-campagne existant (voir
 * OutboundLead / Prospect / WhatsAppSequence : champ `campaign` + index
 * composite sur le numéro). Ajout parallèle — ne modifie aucun modèle
 * ni logique de campagne existante (produit_prise_de_contact, relance_j3,
 * closing_j7).
 *
 * Phase 1 : modèle seul. L'envoi des relances (J-3/J+1/J+10/J+20) et la
 * résolution de campagne pour ce numéro sont hors scope de cette phase.
 */

const mongoose = require('mongoose');

const InvoiceSchema = new mongoose.Schema({
  tenantId:      { type: String, required: true, index: true },

  clientName:    { type: String, required: true, trim: true },
  clientPhone:   { type: String, required: true, trim: true },   // E.164, ex: "+33612345678"

  invoiceNumber: { type: String, required: true, trim: true },
  amount:        { type: Number, required: true },
  dueDate:       { type: Date,   required: true },

  // Type de campagne — même champ que OutboundLead/Prospect/WhatsAppSequence,
  // pour que ce numéro soit résolvable via le mécanisme de campagne existant.
  campaign:      { type: String, default: 'relance_facture', index: true },

  status: {
    type: String,
    enum: [
      'pending',
      'reminder_sent_j-3',
      'reminder_sent_j+1',
      'reminder_sent_j+10',
      'reminder_sent_j+20',
      'paid',
      'disputed',
      // Phase 4 — statuts posés quand le client répond à une relance. Comme
      // paid/disputed, ils SORTENT de la chaîne pending → reminder_sent_j* et
      // suspendent donc toute relance automatique future (cf.
      // invoiceReminderService.resolveDueReminderStep, whitelist REMINDER_CHAIN_STATUSES).
      'payment_claimed', // le client affirme avoir payé — vérification humaine requise
      'delayed',         // le client a demandé un délai — confirmation humaine requise
    ],
    default: 'pending',
    index: true,
  },
}, {
  timestamps: true,   // createdAt, updatedAt
});

// Pattern identique aux modèles de campagne existants : index composite sur le
// numéro + la campagne, pour les mêmes requêtes de résolution "quel numéro
// répond à quelle campagne". NON-unique ici (contrairement à OutboundLead/
// Prospect/WhatsAppSequence) : un même client peut avoir plusieurs factures
// actives en parallèle, chacune avec son propre cycle de relance.
InvoiceSchema.index({ clientPhone: 1, campaign: 1 });

// Unicité métier réelle d'une facture : son numéro, par tenant.
InvoiceSchema.index({ tenantId: 1, invoiceNumber: 1 }, { unique: true });

module.exports = mongoose.model('Invoice', InvoiceSchema);
