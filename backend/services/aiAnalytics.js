const OutboundLead = require('../models/OutboundLead');

async function trackEvent({ phone, event }) {
  console.log('[AI EVENT]', { phone, event });

  await OutboundLead.updateOne(
    { phone },
    {
      $push: {
        ai_events: {
          event,
          createdAt: new Date()
        }
      }
    }
  );
}

module.exports = { trackEvent };
