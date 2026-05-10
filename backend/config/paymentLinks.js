'use strict';

const plans = {
  starter: { label: 'Starter', price: '79€',  link: process.env.SALES_PAYMENT_LINK_STARTER },
  pro:     { label: 'Pro',     price: '149€', link: process.env.SALES_PAYMENT_LINK_PRO },
  elite:   { label: 'Elite',   price: '399€', link: process.env.SALES_PAYMENT_LINK_ELITE },
};

// Warn at startup if any variable is missing
['SALES_PAYMENT_LINK_STARTER', 'SALES_PAYMENT_LINK_PRO', 'SALES_PAYMENT_LINK_ELITE'].forEach(name => {
  if (!process.env[name]) console.warn(`[PAYMENT LINKS] Variable manquante : ${name}`);
});

module.exports = plans;
