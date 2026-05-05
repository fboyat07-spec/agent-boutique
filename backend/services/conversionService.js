const Lead = require('../models/Lead');

async function markAsWon(phone, tenant_id) {
  const lead = await Lead.findOne({ phone, tenant_id });

  if (!lead) return;

  lead.status = 'won';
  await lead.save();

  console.log('[CONVERSION]', phone, 'converted');
}

module.exports = { markAsWon };
