'use strict';

const mongoose = require('mongoose');

const AgentInstructionSchema = new mongoose.Schema({
  text:      { type: String, required: true },
  active:    { type: Boolean, default: true },
  createdAt: { type: Date,    default: Date.now },
});

module.exports = mongoose.model('AgentInstruction', AgentInstructionSchema);
