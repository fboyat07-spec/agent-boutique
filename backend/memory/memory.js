const memory = {};

function getUser(phone) {
  if (!memory[phone]) {
    memory[phone] = {
      stage: "new",
      score: 0,
      lastInteraction: Date.now(),
      history: []
    };
  }
  return memory[phone];
}

function updateUser(phone, data) {
  const user = getUser(phone);
  memory[phone] = { ...user, ...data };
  console.log('[MEMORY UPDATED]', phone, memory[phone]);
}

function updateScore(phone, text) {
  const user = getUser(phone);
  let score = user.score || 0;
  
  if (text.includes('prix')) score += 20;
  if (text.includes('ok')) score += 15;
  if (text.includes('oui')) score += 10;
  if (text.includes('intéress')) score += 25;
  if (text.includes('combien')) score += 20;
  if (text.includes('tarif')) score += 20;
  
  updateUser(phone, { score, lastInteraction: Date.now() });
  return score;
}

function addToHistory(phone, event) {
  const user = getUser(phone);
  user.history.push({
    ...event,
    timestamp: Date.now()
  });
  
  // Keep only last 50 events
  if (user.history.length > 50) {
    user.history = user.history.slice(-50);
  }
  
  updateUser(phone, { history: user.history });
}

module.exports = { getUser, updateUser, updateScore, addToHistory };
