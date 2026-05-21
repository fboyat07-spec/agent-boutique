'use strict';

/**
 * WhatsAppSequence — séquences J0/J3/J7 persistées en MongoDB
 * Remplace l'ancienne Map<phone, {timeouts}> en mémoire.
 */

const mongoose = require('mongoose');

const whatsAppSequenceSchema = new mongoose.Schema({
  to:        { type: String, required: true, unique: true },
  prenom:    { type: String, required: true },
  tenant_id: { type: String, default: 'default' },
  status:    { type: String, enum: ['active', 'stopped', 'completed'], default: 'active' },
  step:      { type: String, enum: ['j0', 'j3', 'j7'], default: 'j0' },
  startDate: { type: Date,   default: Date.now },
  j3_date:   { type: Date,   required: true },   // date à partir de laquelle J3 peut être envoyé
  j7_date:   { type: Date,   required: true },   // date à partir de laquelle J7 peut être envoyé
}, { timestamps: true });

// Index pour les requêtes du cron
whatsAppSequenceSchema.index({ status: 1, j3_date: 1 });
whatsAppSequenceSchema.index({ status: 1, j7_date: 1 });

module.exports = mongoose.model('WhatsAppSequence', whatsAppSequenceSchema);
