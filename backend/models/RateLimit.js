const mongoose = require('mongoose');

const rateLimitSchema = new mongoose.Schema({
  minute: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  count: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// TTL index to automatically delete old records (24 hours)
rateLimitSchema.index({ createdAt: { expires: 86400 } });

module.exports = mongoose.model('RateLimit', rateLimitSchema);
