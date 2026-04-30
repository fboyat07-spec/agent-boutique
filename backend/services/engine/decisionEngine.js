function decideNextAction(memory) {

  if (memory.score >= 50) return "close";
  if (memory.score >= 30) return "interested";
  if (memory.score >= 15) return "qualified";
  return "new";
}

module.exports = {
  decideNextAction
};
