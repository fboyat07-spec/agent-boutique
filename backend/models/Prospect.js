'use strict';

const mongoose = require('mongoose');

const ProspectSchema = new mongoose.Schema({
  name:         { type: String, required: true },
  phone:        { type: String, required: true },
  address:      { type: String, default: '' },
  website:      { type: String, default: '' },
  rating:       { type: Number, default: null },
  ratingsTotal: { type: Number, default: null },
  query:        { type: String, default: '' },         // terme de recherche qui a trouvé ce prospect
  campaign:     { type: String, default: 'agent_boutique', index: true },
  status:       {
    type: String,
    enum: ['new', 'contacted', 'converted', 'ignored'],
    default: 'new',
    index: true
  },
  whatsappSent: { type: Boolean, default: false },
  plan:         { type: String, enum: ['starter', 'pro', 'elite', null], default: null },
  convertedAt:  { type: Date,   default: null },
  revenue:      { type: Number, default: 0 },
}, { timestamps: true });

// Unicité par campagne — remplace l'ancien index unique simple sur "phone"
ProspectSchema.index({ phone: 1, campaign: 1 }, { unique: true });

module.exports = mongoose.model('Prospect', ProspectSchema);
