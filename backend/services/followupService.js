const Lead = require('../models/Lead');
const { sendWhatsAppMessage } = require('./messageSender');

async function scheduleFollowUps(tenant_id) {
  const leads = await Lead.find({
    status: { $ne: 'won' },
    tenant_id: tenant_id || { $exists: false }
  });

  const now = Date.now();

  for (const lead of leads) {

    const last = new Date(lead.updatedAt || lead.createdAt).getTime();
    const diff = now - last;

    let message = null;

    if (diff > 86400000 && lead.status === 'interested') {
      message = "Tu veux toujours plus de clients ?";
    }

    if (diff > 3 * 86400000 && lead.status === 'closing') {
      message = "Je peux t'activer ça aujourd'hui si tu veux.";
    }

    if (diff > 7 * 86400000) {
      message = "Je clôture ton dossier aujourd'hui si pas de réponse.";
    }

    if (message) {
      await sendWhatsAppMessage(lead.phone, message);
    }
  }
}

module.exports = { scheduleFollowUps };
