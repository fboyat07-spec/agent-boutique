'use strict';

const mongoose = require('mongoose');

const emailSequenceSchema = new mongoose.Schema({
  contactEmail: { type: String, required: true },
  contactName:  { type: String, default: '' },
  businessName: { type: String, default: '' },
  phone:        { type: String, default: '' },
  sector:       { type: String, default: '' },
  step:         { type: String, enum: ['J3', 'J7'], required: true },
  scheduledAt:  { type: Date,   required: true },
  sentAt:       { type: Date },
  status:       { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
  createdAt:    { type: Date,   default: Date.now },
});

module.exports = mongoose.model('EmailSequence', emailSequenceSchema);
