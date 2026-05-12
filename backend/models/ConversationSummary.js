'use strict';

const mongoose = require('mongoose');

const ConversationSummarySchema = new mongoose.Schema({
  tenant_id:       { type: String, required: true },
  phone:           { type: String, required: true },
  thread_id:       { type: String, default: '' },
  running_summary: { type: String, default: '' },
  last_message_at: { type: Date,   default: null },
  message_count:   { type: Number, default: 0 },
  updated_at:      { type: Date,   default: Date.now },
}, { timestamps: false });

// Index unique : une ligne par (tenant, phone, thread)
ConversationSummarySchema.index({ tenant_id: 1, phone: 1, thread_id: 1 }, { unique: true });
// TTL : suppression automatique après 90 jours d'inactivité
ConversationSummarySchema.index({ updated_at: 1 }, { expireAfterSeconds: 7776000 });

module.exports = mongoose.model('ConversationSummary', ConversationSummarySchema);
