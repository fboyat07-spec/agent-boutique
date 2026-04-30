export async function followUp(memory, userId) {

  if (memory.status === "won") return null;

  if (memory.score < 20) {
    return "Tu veux toujours développer ton business ou pas ?";
  }

  if (memory.score >= 20 && memory.score < 50) {
    return "Tu veux voir comment ça peut t'apporter des clients ?";
  }

  return null;
}
