const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function createPaymentLink() {
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'eur',
        product_data: {
          name: 'Agent Boutique IA'
        },
        unit_amount: 4900
      },
      quantity: 1
    }],
    mode: 'payment',
    success_url: 'https://yourdomain.com/success',
    cancel_url: 'https://yourdomain.com/cancel'
  });

  return session.url;
}

module.exports = { createPaymentLink };
