const OutboundLead = require('../models/OutboundLead');

const ENABLE_FAKE_LEADS = process.env.ENABLE_FAKE_LEADS === 'true';

async function generateLeads() {
  console.log('[LEAD GENERATOR START]');

  if (!ENABLE_FAKE_LEADS) {
    console.log('[FAKE LEADS DISABLED]');
    return;
  }

  const randomPhone = () => '+337' + Math.floor(10000000 + Math.random() * 89999999);

  const leads = Array.from({ length: 3 }).map(() => ({
    phone: randomPhone(),
    name: 'Prospect',
    city: 'France'
  }));

  for (const l of leads) {
    const exists = await OutboundLead.findOne({ phone: l.phone });

    if (!exists) {
      await OutboundLead.create({
        ...l,
        business: 'Test Business',
        status: 'NEW',
        attempts: 0,
        createdAt: new Date()
      });

      console.log('[LEAD CREATED]', { phone: l.phone });
    }
  }
}

module.exports = { generateLeads };
