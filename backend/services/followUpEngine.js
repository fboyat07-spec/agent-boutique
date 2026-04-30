async function followUp(memory, userId) {

  if (memory.status === "won") return null;

  // Time-based follow-up logic
  const now = Date.now();
  const lastInteraction = memory.last_interaction || 0;
  const hoursSinceLast = (now - lastInteraction) / (1000 * 60 * 60);

  if (hoursSinceLast < 24) return null; // No follow-up within 24 hours

  // Stage-specific follow-ups
  if (memory.score < 15) {
    return {
      reply: "Tu fais quoi comme business ?",
      intent: "follow_up_new"
    };
  }

  if (memory.score < 30) {
    return {
      reply: "Tu fais combien de CA par mois ?",
      intent: "follow_up_qualified"
    };
  }

  if (memory.score < 50) {
    return {
      reply: "Tu veux plus de clients chaque semaine ?",
      intent: "follow_up_interested"
    };
  }

  return {
    reply: "Tu veux toujours que je t'active l'accès ?",
    intent: "follow_up_buy"
  };
}

module.exports = {
  followUp
};
