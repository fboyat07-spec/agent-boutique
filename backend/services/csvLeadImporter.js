const fs = require('fs');
const OutboundLead = require('../models/OutboundLead');

async function importCSVLeads(filePath) {
  try {
    console.log('[CSV IMPORT START]', { filePath });

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').slice(1); // skip header

    for (const line of lines) {
      if (!line.trim()) continue;

      const [phoneRaw, name, city, business] = line.split(',');

      const phone = phoneRaw?.trim();

      if (!phone || !phone.startsWith('+33')) {
        console.log('[INVALID PHONE SKIPPED]', { phone });
        continue;
      }

      const exists = await OutboundLead.findOne({ phone });

      if (!exists) {
        await OutboundLead.create({
          phone,
          name: name || 'Prospect',
          city: city || 'France',
          business: business || 'Business',
          source: 'csv_import',
          status: 'NEW',
          attempts: 0,
          createdAt: new Date()
        });

        console.log('[REAL LEAD IMPORTED]', { phone });
      }
    }

  } catch (err) {
    console.log('[CSV IMPORT ERROR]', err.message);
  }
}

module.exports = { importCSVLeads };