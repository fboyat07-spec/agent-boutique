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

// Index unique : une ligne par (tenant, phone)
ConversationSummarySchema.index({ tenant_id: 1, phone: 1 }, { unique: true });

module.exports = mongoose.model('ConversationSummary', ConversationSummarySchema);
