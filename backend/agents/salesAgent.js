const { getUser, updateUser, updateScore, addToHistory } = require('../memory/memory');
const axios = require('axios');

// Reuse existing funnel logic (DO NOT rewrite it)
// ===== STAGE DETECTION =====
function nextStage(current, text) {
  const t = text.toLowerCase();

  if (current === "new" && (t.includes("business") || t.includes("entreprise") || t.includes("activité"))) {
    return "qualified";
  }

  if (current === "qualified" && (t.includes("€") || t.includes("k") || t.includes("mois") || t.includes("ca"))) {
    return "interested";
  }

  if (current === "interested" && (t.includes("oui") || t.includes("ok") || t.includes("intéress"))) {
    return "closing";
  }

  if (current === "closing" && (t.includes("payer") || t.includes("go") || t.includes("lien"))) {
    return "won";
  }

  return current;
}

// ===== RESPONSE ENGINE =====
function getResponse(stage) {
  if (stage === "new") return "Tu fais quoi comme business ?";
  if (stage === "qualified") return "Tu fais combien de CA par mois ?";
  if (stage === "interested") return "Tu veux augmenter ton CA ?";
  if (stage === "closing") return "Je t'active ça maintenant 👉 " + process.env.SALES_PAYMENT_LINK;
  return null;
}

async function handle(event) {
  const { phone, text } = event;

  const user = getUser(phone);

  console.log('[SALES AGENT]', phone, user.stage);

  // Update lead scoring
  updateScore(phone, text);

  // Add to history
  addToHistory(phone, {
    type: 'incoming_message',
    text,
    stage: user.stage
  });

  // Reuse existing funnel logic
  const updatedStage = nextStage(user.stage, text);
  
  if (updatedStage !== user.stage) {
    updateUser(phone, { stage: updatedStage });
    console.log('[STAGE PROGRESSION]', phone, user.stage, '→', updatedStage);
  }

  // Generate response
  const reply = getResponse(updatedStage);

  if (!reply) {
    console.log('[NO RESPONSE]', phone);
    return null;
  }

  // Add response to history
  addToHistory(phone, {
    type: 'outgoing_message',
    text: reply,
    stage: updatedStage
  });

  console.log('[RESPONSE]', phone, reply);

  return {
    action: "reply",
    phone,
    text: reply
  };
}

async function followUp(event) {
  const { phone } = event;
  const user = getUser(phone);

  console.log('[SALES AGENT FOLLOW UP]', phone, user.stage);

  // Generate stage-specific follow-up
  const reply = getResponse(user.stage);

  if (!reply) {
    console.log('[NO FOLLOW UP RESPONSE]', phone);
    return null;
  }

  // Add follow-up to history
  addToHistory(phone, {
    type: 'follow_up',
    text: reply,
    stage: user.stage
  });

  console.log('[FOLLOW UP RESPONSE]', phone, reply);

  return {
    action: "reply",
    phone,
    text: reply
  };
}

module.exports = { handle, followUp };
