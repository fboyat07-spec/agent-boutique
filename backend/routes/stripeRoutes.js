const express = require('express');
const router = express.Router();
const Conversation = require('../models/Conversation');
const { updateMemory } = require('../services/memory.js');

// Stripe webhook handler
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = require('stripe')(process.env.STRIPE_SECRET_KEY).webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.log('[STRIPE WEBHOOK ERROR]', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      const phone = session.metadata?.phone;

      if (phone) {
        const conversation = await Conversation.findOne({ phone });
        
        const updateData = {
          $set: {
            stage: 'won',
            paid: true,
            lastInteractionAt: new Date()
          },
          $inc: { revenue: session.amount_total / 100 }
        };

        // Calculate conversion time if first interaction exists
        if (conversation?.firstInteractionAt) {
          const conversionTime = new Date() - new Date(conversation.firstInteractionAt);
          updateData.$set.conversionTime = conversionTime;
          console.log('[CONVERSION TIME]', phone, conversionTime + 'ms');
        }

        await Conversation.updateOne(
          { phone },
          updateData,
          { upsert: true }
        );

        console.log('[STRIPE PAYMENT SUCCESS]', phone);

        // Mark user as WON in memory
        await updateMemory(phone, {
          intent: "buy",
          status: "won"
        });

        // Optional CRM sync
        console.log('[SYNC CRM OPTIONAL]');
      }
      break;

    default:
      console.log(`[STRIPE UNHANDLED EVENT] ${event.type}`);
  }

  res.json({ received: true });
});

module.exports = router;
