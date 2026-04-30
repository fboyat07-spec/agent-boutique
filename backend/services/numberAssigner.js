// Available WhatsApp numbers for assignment
const availableNumbers = [
  { id: "phone_1", number: process.env.WHATSAPP_PHONE_NUMBER_ID_1 || process.env.WHATSAPP_PHONE_NUMBER_ID, token: process.env.WHATSAPP_TOKEN_1 || process.env.WHATSAPP_TOKEN },
  { id: "phone_2", number: process.env.WHATSAPP_PHONE_NUMBER_ID_2, token: process.env.WHATSAPP_TOKEN_2 },
  { id: "phone_3", number: process.env.WHATSAPP_PHONE_NUMBER_ID_3, token: process.env.WHATSAPP_TOKEN_3 }
];

// Per-number rate limiting
const numberUsage = {};

function canSendFromNumber(numberId) {
  const now = Date.now();

  if (!numberUsage[numberId]) {
    numberUsage[numberId] = [];
  }

  // garder uniquement les 60 dernières secondes
  numberUsage[numberId] = numberUsage[numberId].filter(t => now - t < 60000);

  if (numberUsage[numberId].length >= 15) {
    return false;
  }

  numberUsage[numberId].push(now);
  return true;
}

// Track number usage for load balancing
const dailyUsage = new Map();

// Initialize daily usage tracking
availableNumbers.forEach(phone => {
  dailyUsage.set(phone.id, {
    count: 0,
    lastUsed: null,
    dailyLimit: 50,
    isPaused: false
  });
});

function assignNumber() {

  let best = null;
  let minUsage = Infinity;

  for (const num of availableNumbers) {

    // Check rate limiting first
    if (!canSendFromNumber(num.id)) {
      continue;
    }

    const usage = numberUsage[num.id]?.length || 0;

    if (usage < minUsage) {
      minUsage = usage;
      best = num;
    }
  }

  // If no available numbers due to rate limiting, fallback to first available
  if (!best) {
    const fallback = availableNumbers.find(num => canSendFromNumber(num.id));
    return fallback || availableNumbers[0];
  }

  return best;
}

function getAssignedNumber(numberId) {
  return availableNumbers.find(phone => phone.id === numberId);
}

function pauseNumber(numberId, reason = "Rate limit") {
  const usage = dailyUsage.get(numberId);
  if (usage) {
    usage.isPaused = true;
    console.log('[NUMBER PAUSE]', numberId, reason);
    
    // Auto-resume after 1 hour
    setTimeout(() => {
      usage.isPaused = false;
      console.log('[NUMBER RESUME]', numberId);
    }, 60 * 60 * 1000);
  }
}

function getNumberStats() {
  const stats = {};
  dailyUsage.forEach((usage, numberId) => {
    const rateLimitCount = numberUsage[numberId] ? numberUsage[numberId].length : 0;
    stats[numberId] = {
      ...usage,
      rateLimitCount,
      phoneNumber: getAssignedNumber(numberId)?.number
    };
  });
  return stats;
}

module.exports = {
  assignNumber,
  getAssignedNumber,
  pauseNumber,
  getNumberStats
};
