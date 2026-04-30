const SalesAgent = require('../agents/salesAgent');
const LeadAgent = require('../agents/leadAgent');

async function orchestrate(event) {
  console.log('[ORCHESTRATOR EVENT]', event.type);

  if (event.type === "incoming_message") {
    return SalesAgent.handle(event);
  }

  if (event.type === "new_lead") {
    return LeadAgent.handle(event);
  }

  if (event.type === "follow_up") {
    return SalesAgent.followUp(event);
  }

  console.log('[ORCHESTRATOR UNKNOWN EVENT]', event.type);
  return null;
}

module.exports = { orchestrate };
