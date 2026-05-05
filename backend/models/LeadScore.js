const mongoose = require('mongoose');

const LeadScoreSchema = new mongoose.Schema({
  tenant_id: { type: String, required: true, ref: 'SaaSTenant' },
  phone: String,
  score: { type: Number, default: 0 },
  temperature: {
    type: String,
    enum: ['cold', 'warm', 'hot'],
    default: 'cold'
  },
  lastInteraction: Date
});

module.exports = mongoose.model('LeadScore', LeadScoreSchema);
