const Lead = require('../models/Lead');

async function processLead(phone, message, tenant_id) {

  let lead = await Lead.findOne({ phone, tenant_id });

  if (!lead) {
    lead = await Lead.create({ phone, tenant_id });
  }

  let reply = "";

  switch (lead.status) {

    case 'new':
      reply = "Tu fais quoi comme business ?";
      lead.status = 'qualified';
      break;

    case 'qualified':
      reply = "Tu fais combien de CA par mois ?";
      lead.status = 'interested';
      break;

    case 'interested':
      reply = "Tu veux plus de clients automatiquement ?";
      lead.status = 'closing';
      break;

    case 'closing':
      reply = "Je peux t'activer ça maintenant 👉 " + process.env.STRIPE_PAYMENT_LINK;
      break;

    default:
      reply = "Dis-moi en plus sur ton activité.";
  }

  lead.lastMessage = message;
  lead.updatedAt = new Date();

  await lead.save();

  return reply;
}

module.exports = { processLead };
