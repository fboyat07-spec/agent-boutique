const memoryDB = new Map();

async function getMemory(userId) {
  return memoryDB.get(userId) || {
    history: [],
    score: 0,
    status: "new",
    last_intent: null,
    last_message: null,
    assignedNumberId: null
  };
}

async function updateMemory(userId, newData) {
  const existing = await getMemory(userId);

  const updated = {
    ...existing,
    history: [...existing.history, newData],
    score: updateScore(existing.score, newData),
    last_intent: newData.intent || existing.last_intent,
    last_message: newData.reply || existing.last_message
  };

  memoryDB.set(userId, updated);
}

function updateScore(score, data) {
  if (data.intent === "buy") return score + 50;
  if (data.intent === "interested") return score + 20;
  if (data.intent === "ignore") return score - 10;
  return score;
}

module.exports = {
  getMemory,
  updateMemory
};
