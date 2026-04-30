import { decideNextAction } from "./engine/decisionEngine.js";
import { getMemory, updateMemory } from "./memory.js";
import { handleSales } from "./agents/salesAgent.js";
import { followUp } from "./followUpEngine.js";
import { assignNumber, getAssignedNumber } from "./numberAssigner.js";

export async function orchestrate(event) {
  console.log('[ORCHESTRATOR EVENT]', event.type);

  const { payload } = event;
  
  // Support multiple clients
  payload.client_id = payload.client_id || "default";
  const userId = payload.user_id;
  const memoryKey = userId + "_" + payload.client_id;

  // Load memory
  const memory = await getMemory(memoryKey);

  // Assign number on first message
  if (!memory.assignedNumberId) {
    const assignedNumberId = assignNumber();
    if (assignedNumberId) {
      await updateMemory(memoryKey, { assignedNumberId });
      memory.assignedNumberId = assignedNumberId;
      console.log('[NUMBER ASSIGNED]', memoryKey, assignedNumberId);
    } else {
      console.log('[NUMBER ASSIGN FAILED]', memoryKey);
      return {
        reply: null,
        intent: "noop",
        error: "No available numbers"
      };
    }
  }

  // Stop system if user already converted
  if (memory.status === "won") {
    return {
      reply: null,
      intent: "noop"
    };
  }
  
  // Decision engine
  const action = decideNextAction(memory);

  // Debug logs
  console.log('[LEAD]', payload.user_id);
  console.log('[SCORE]', memory.score);
  console.log('[ACTION]', action);

  let response;

  switch (event.type) {
    case "incoming_message":
      if (action === "close") {
        console.log('[CLOSING TRIGGERED]');
        response = {
          reply: "Je t'active ça maintenant 👉 " + process.env.SALES_PAYMENT_LINK,
          intent: "buy"
        };
      } else {
        response = await handleSales(payload, memory);
      }
      break;

    case "new_lead":
      response = await handleNewLead(payload, memory);
      break;

    case "follow_up":
      response = await handleFollowUp(payload, memory);
      break;

    default:
      console.log('[ORCHESTRATOR UNKNOWN EVENT]', event.type);
      return null;
  }

  // Follow-up logic injection
  const followUpMessage = await followUp(memory, memoryKey);

  if (!response.reply && followUpMessage) {
    response = {
      reply: followUpMessage,
      intent: "followup"
    };
  }

  // Update memory with response
  if (response) {
    await updateMemory(memoryKey, {
      intent: response.intent,
      reply: response.reply,
      action: action
    });

    // Add assigned number to response for sending
    response.assignedNumberId = memory.assignedNumberId;
    response.assignedNumber = getAssignedNumber(memory.assignedNumberId);
  }

  return response;
}

async function handleNewLead(payload, memory) {
  return {
    reply: "Bienvenue ! Tu fais quoi comme business ?",
    intent: "new_lead"
  };
}

async function handleFollowUp(payload, memory) {
  if (memory.last_intent === "buy") {
    return {
      reply: "Tu veux toujours que je t'active l'accès ?",
      intent: "follow_up_buy"
    };
  }

  return {
    reply: "Ça te dirait de générer plus de clients ?",
    intent: "follow_up_general"
  };
}
