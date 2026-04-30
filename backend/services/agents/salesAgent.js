import { getMemory, updateMemory } from "../memory.js";

export async function handleSales(payload, memory) {
  const { message } = payload;
  const text = message.toLowerCase();

  // High score closing behavior
  if (memory.score > 50) {
    return {
      reply: "Je t'active ça maintenant 👉 " + process.env.SALES_PAYMENT_LINK,
      intent: "close"
    };
  }

  // Sales funnel logic based on memory score
  let stage = determineStage(memory);
  let reply = getStageResponse(stage);
  let intent = stage;

  // Keyword-based overrides for immediate progression
  if (text.includes("prix") || text.includes("tarif")) {
    intent = "interested";
    reply = "Je te montre comment ça te ramène des clients 👉 " + process.env.SALES_PAYMENT_LINK;
  } else if (text.includes("ok") || text.includes("oui")) {
    intent = "buy";
    reply = "Parfait, je t'active ça 👉 " + process.env.SALES_PAYMENT_LINK;
  } else if (text.includes("quoi") || text.includes("comment")) {
    intent = "interested";
    reply = "Je te génère des clients automatiquement, tu veux voir ?";
  } else if (text.includes("business") || text.includes("entreprise")) {
    intent = "qualified";
    reply = "Tu fais combien de CA par mois ?";
  }

  return {
    reply,
    intent
  };
}

function determineStage(memory) {
  // Stage progression based on score and history
  if (memory.score >= 50) return "closing";
  if (memory.score >= 30) return "interested";
  if (memory.score >= 15) return "qualified";
  return "new";
}

function getStageResponse(stage) {
  switch (stage) {
    case "new":
      return "Tu fais quoi comme business ?";
    case "qualified":
      return "Tu fais combien de CA par mois ?";
    case "interested":
      return "Tu veux plus de clients chaque semaine ?";
    case "closing":
      return "Je t'active ça maintenant 👉 " + process.env.SALES_PAYMENT_LINK;
    default:
      return "Tu fais quoi comme business ?";
  }
}
