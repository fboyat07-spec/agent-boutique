const mongoose = require('mongoose');

const numberUsageSchema = new mongoose.Schema({
  numberId: {
    type: String,
    required: true,
    index: true
  },
  date: {
    type: String, // YYYY-MM-DD format
    required: true,
    index: true
  },
  messagesSent: {
    type: Number,
    default: 0
  },
  lastMessageAt: {
    type: Date,
    default: Date.now
  },
  burstCount: {
    type: Number,
    default: 0
  },
  lastBurstReset: {
    type: Date,
    default: Date.now
  },
  warmupLevel: {
    type: Number,
    default: 1 // Days since number was added
  },
  isPaused: {
    type: Boolean,
    default: false
  },
  pauseUntil: {
    type: Date
  },
  recentMessages: [{
    message: String,
    timestamp: Date
  }]
}, {
  timestamps: true
});

// Compound index for efficient queries
numberUsageSchema.index({ numberId: 1, date: 1 });

// TTL index to automatically clean old records (keep 30 days)
numberUsageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('NumberUsage', numberUsageSchema);
