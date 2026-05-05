const OutboundLead = require('../models/OutboundLead');

function computeScore(lead) {
  let score = 0;

  if (lead.city && lead.city !== 'France') score += 20;
  if (lead.business) score += 30;
  if (lead.phone && lead.phone.startsWith('+33')) score += 20;

  return score;
}

async function enrichLeads() {
  console.log('[ENRICHMENT START]');

  const leads = await OutboundLead.find({
    $or: [
      { enriched: { $ne: true } },
      { enrichedAt: { $lt: new Date(Date.now() - 86400000) } }
    ]
  }).limit(20);

  for (const lead of leads) {
    const score = computeScore(lead);

    await OutboundLead.findByIdAndUpdate(lead._id, {
      score,
      enriched: true,
      enrichedAt: new Date(),
      updatedAt: new Date()
    });

    console.log('[LEAD ENRICHED]', {
      phone: lead.phone,
      score
    });
  }
}

module.exports = { enrichLeads };
