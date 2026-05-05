const OutboundLead = require('../models/OutboundLead');

async function getStats() {
  const total = await OutboundLead.countDocuments();
  const won = await OutboundLead.countDocuments({ status: 'WON' });

  return {
    total,
    won,
    conversionRate: total ? (won / total) : 0
  };
}

module.exports = { getStats };
