const LeadScore = require('../models/LeadScore');

async function updateScore(phone, message, tenant_id) {
  let lead = await LeadScore.findOne({ phone, tenant_id });

  if (!lead) {
    lead = await LeadScore.create({ phone, tenant_id });
  }

  let score = lead.score;

  if (message.includes("prix") || message.includes("tarif")) score += 20;
  if (message.includes("ok") || message.includes("oui")) score += 30;
  if (message.includes("intéressé")) score += 40;

  let temperature = 'cold';
  if (score > 30) temperature = 'warm';
  if (score > 70) temperature = 'hot';

  lead.score = score;
  lead.temperature = temperature;
  lead.lastInteraction = new Date();

  await lead.save();

  return lead;
}

module.exports = { updateScore };
