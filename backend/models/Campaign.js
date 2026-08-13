const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  segment: {
    type: String,
    enum: ['barber', 'restaurant', 'retail', 'service', 'professional', 'other'],
    required: true
  },
  region: {
    type: String,
    required: true,
    trim: true
  },
  scriptVariant: {
    type: String,
    enum: ['direct', 'soft', 'urgency'],
    default: 'direct'
  },
  active: {
    type: Boolean,
    default: true
  },
  // Flag de pause pour les campagnes utilisées comme document de contrôle
  // d'un batch scheduler (ex: name:'adele' piloté par services/adeleBatchScheduler.js).
  // Démarre à true — aucun envoi automatique tant qu'il n'est pas explicitement désactivé.
  paused: {
    type: Boolean,
    default: true
  },
  description: {
    type: String,
    trim: true
  },
  settings: {
    maxFollowUps: {
      type: Number,
      default: 3
    },
    followUpDelay: {
      type: Number,
      default: 24 // hours
    },
    customScript: String
  },
  metrics: {
    totalConversations: {
      type: Number,
      default: 0
    },
    conversions: {
      type: Number,
      default: 0
    },
    lastUsed: Date
  }
}, {
  timestamps: true
});

// Indexes for performance
campaignSchema.index({ segment: 1, region: 1, active: 1 });
campaignSchema.index({ active: 1 });
campaignSchema.index({ region: 1 });

module.exports = mongoose.model('Campaign', campaignSchema);
