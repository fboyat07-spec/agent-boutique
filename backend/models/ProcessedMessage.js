const mongoose = require('mongoose');

const processedMessageSchema = new mongoose.Schema({
  tenant_id: { type: String, required: true, ref: 'SaaSTenant' },
  messageId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// TTL index to automatically delete old records (24 hours)
processedMessageSchema.index({ createdAt: { expires: 86400 } });

module.exports = mongoose.model('ProcessedMessage', processedMessageSchema);
