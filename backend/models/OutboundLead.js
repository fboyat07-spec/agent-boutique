const mongoose = require('mongoose');

const outboundLeadSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  business: {
    type: String,
    required: true,
    trim: true
  },
  city: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['NEW', 'CONTACTED', 'INTERESTED', 'CLOSING', 'WON'],
    default: 'NEW',
    index: true
  },
  lastContactAt: {
    type: Date,
    default: null
  },
  nextFollowUpAt: {
    type: Date,
    default: null
  },
  attempts: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for performance
outboundLeadSchema.index({ phone: 1, createdAt: -1 });
outboundLeadSchema.index({ status: 1, nextFollowUpAt: 1 });
outboundLeadSchema.index({ business: 1 });
outboundLeadSchema.index({ city: 1 });

module.exports = mongoose.model('OutboundLead', outboundLeadSchema);
