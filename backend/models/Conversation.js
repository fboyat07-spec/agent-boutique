const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    index: true
  },
  stage: {
    type: String,
    enum: ['new', 'qualified', 'interested', 'closing', 'won', 'lost'],
    default: 'new'
  },
  score: {
    type: Number,
    default: 0
  },
  lastInteractionAt: {
    type: Date,
    default: Date.now
  },
  avgResponseTime: {
    type: Number,
    default: 0
  },
  metadata: {
    variant: String,
    source: String,
    tags: [String],
    customData: mongoose.Schema.Types.Mixed
  },
  messages: [{
    content: String,
    sender: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    type: {
      type: String,
      enum: ['text', 'image', 'document'],
      default: 'text'
    }
  }],
  followUps: [{
    scheduledAt: Date,
    sent: Boolean,
    content: String,
    type: String
  }],
  // NEW FIELDS FOR NATIONAL SCALING
  region: {
    type: String,
    default: null
  },
  businessType: {
    type: String,
    default: null
  },
  campaignId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    default: null
  }
}, {
  timestamps: true
});

// Indexes for performance
conversationSchema.index({ phone: 1, createdAt: -1 });
conversationSchema.index({ stage: 1 });
conversationSchema.index({ campaignId: 1 });
conversationSchema.index({ region: 1 });
conversationSchema.index({ businessType: 1 });
conversationSchema.index({ lastInteractionAt: 1 });

module.exports = mongoose.model('Conversation', conversationSchema);
