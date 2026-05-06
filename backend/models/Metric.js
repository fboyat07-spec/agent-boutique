'use strict';

const mongoose = require('mongoose');

const MetricSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  value:     { type: Number, required: true },
  timestamp: { type: Date,   default: Date.now },
  tenant_id: { type: String, required: true },
});

module.exports = mongoose.model('Metric', MetricSchema);
