const { getUser, updateUser, addToHistory } = require('../memory/memory');

async function handle(event) {
  const { phone, source, data } = event;

  console.log('[LEAD AGENT]', phone, source);

  const user = getUser(phone);

  // Initialize new lead
  if (user.stage === "new") {
    updateUser(phone, { 
      stage: "new",
      source: source,
      leadData: data
    });

    addToHistory(phone, {
      type: 'new_lead',
      source,
      data,
      stage: 'new'
    });

    console.log('[NEW LEAD CREATED]', phone, source);
  }

  return {
    action: "lead_processed",
    phone,
    source
  };
}

module.exports = { handle };
