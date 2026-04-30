const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    index: true
  },
  name: {
    type: String,
    trim: true
  },
  businessType: {
    type: String,
    trim: true
  },
  region: {
    type: String,
    trim: true
  },
  source: {
    type: String,
    enum: ['manual', 'import', 'scraper'],
    default: 'manual'
  },
  status: {
    type: String,
    enum: ['new', 'queued', 'contacted', 'failed'],
    default: 'new'
  },
  score: {
    type: Number,
    default: 0
  },
  lastContactedAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  metadata: {
    notes: String,
    tags: [String],
    customData: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Indexes for performance
leadSchema.index({ status: 1, createdAt: 1 });
leadSchema.index({ source: 1 });
leadSchema.index({ businessType: 1 });
leadSchema.index({ region: 1 });
leadSchema.index({ lastContactedAt: 1 });

module.exports = mongoose.model('Lead', leadSchema);
