export function decideNextAction(memory) {

  if (memory.score >= 50) return "close";

  if (memory.score >= 20) return "nurture";

  return "engage";
}
