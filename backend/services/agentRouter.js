// ACTION 1 - Router multi-agent (couche non intrusive)

const { isEnabled } = require('./envFlags');
const BusinessLogger = require('./businessLogger');

// Agents spécialisés
const AGENTS = {
  LEAD_AGENT: 'lead_agent',
  SALES_AGENT: 'sales_agent', 
  SUPPORT_AGENT: 'support_agent',
  PAYMENT_AGENT: 'payment_agent'
};

// Router principal - SURCOUCHE non intrusive
class AgentRouter {
  constructor() {
    this.enabled = isEnabled('MULTI_AGENT_ENABLED');
    this.taskStats = {
      total: 0,
      byAgent: {},
      errors: 0
    };
  }
  
  // Router principal - ne modifie PAS pipeline existant
  async routeTask(task) {
    const startTime = Date.now();
    this.taskStats.total++;
    
    try {
      if (!this.enabled) {
        // Fallback: pipeline actuel
        console.log('[AGENT_ROUTER_DISABLED] Using fallback pipeline');
        return await this.fallbackPipeline(task);
      }
      
      const agent = this.determineAgent(task);
      
      if (!agent) {
        console.log('[AGENT_ROUTER_NO_AGENT] Using fallback', { taskType: task.type });
        return await this.fallbackPipeline(task);
      }
      
      console.log('[AGENT_ROUTER_DISPATCH]', {
        taskType: task.type,
        agent,
        taskId: task.id
      });
      
      const result = await this.executeAgent(agent, task);
      
      const duration = Date.now() - startTime;
      this.updateAgentStats(agent, true, duration);
      
      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      this.taskStats.errors++;
      
      console.log('[AGENT_ROUTER_ERROR]', {
        taskType: task.type,
        error: error.message,
        duration
      });
      
      BusinessLogger.logWebhookError(error.message, {
        context: 'agent_router',
        taskType: task.type
      });
      
      // Fallback garanti même en cas d'erreur
      return await this.fallbackPipeline(task);
    }
  }
  
  // Déterminer l'agent approprié
  determineAgent(task) {
    const { type, data } = task;
    
    switch (type) {
      case 'lead_created':
      case 'lead_import':
      case 'lead_enrich':
        return AGENTS.LEAD_AGENT;
        
      case 'outbound_send':
      case 'follow_up_send':
      case 'closing_attempt':
        return AGENTS.SALES_AGENT;
        
      case 'inbound_message':
      case 'intent_detected':
      case 'support_request':
        return AGENTS.SUPPORT_AGENT;
        
      case 'payment_request':
      case 'payment_validate':
      case 'payment_confirm':
        return AGENTS.PAYMENT_AGENT;
        
      default:
        return null; // Fallback
    }
  }
  
  // Exécuter tâche par agent
  async executeAgent(agent, task) {
    switch (agent) {
      case AGENTS.LEAD_AGENT:
        return await this.leadAgent(task);
        
      case AGENTS.SALES_AGENT:
        return await this.salesAgent(task);
        
      case AGENTS.SUPPORT_AGENT:
        return await this.supportAgent(task);
        
      case AGENTS.PAYMENT_AGENT:
        return await this.paymentAgent(task);
        
      default:
        throw new Error(`Unknown agent: ${agent}`);
    }
  }
  
  // Lead Agent - création/enrichissement
  async leadAgent(task) {
    const { type, data } = task;
    
    switch (type) {
      case 'lead_created':
        return await this.handleLeadCreated(data);
        
      case 'lead_import':
        return await this.handleLeadImport(data);
        
      case 'lead_enrich':
        return await this.handleLeadEnrich(data);
        
      default:
        return await this.fallbackPipeline(task);
    }
  }
  
  // Sales Agent - outbound/closing
  async salesAgent(task) {
    const { type, data } = task;
    
    switch (type) {
      case 'outbound_send':
        return await this.handleOutboundSend(data);
        
      case 'follow_up_send':
        return await this.handleFollowUpSend(data);
        
      case 'closing_attempt':
        return await this.handleClosingAttempt(data);
        
      default:
        return await this.fallbackPipeline(task);
    }
  }
  
  // Support Agent - réponses inbound
  async supportAgent(task) {
    const { type, data } = task;
    
    switch (type) {
      case 'inbound_message':
        return await this.handleInboundMessage(data);
        
      case 'intent_detected':
        return await this.handleIntentDetected(data);
        
      case 'support_request':
        return await this.handleSupportRequest(data);
        
      default:
        return await this.fallbackPipeline(task);
    }
  }
  
  // Payment Agent - Stripe/validation
  async paymentAgent(task) {
    const { type, data } = task;
    
    switch (type) {
      case 'payment_request':
        return await this.handlePaymentRequest(data);
        
      case 'payment_validate':
        return await this.handlePaymentValidate(data);
        
      case 'payment_confirm':
        return await this.handlePaymentConfirm(data);
        
      default:
        return await this.fallbackPipeline(task);
    }
  }
  
  // Handlers Lead Agent
  async handleLeadCreated(data) {
    // Utiliser logique existante sans modification
    const { createOrGetLead } = require('./leadMemory');
    const { calculateInitialScore } = require('./dynamicScoring');
    
    const lead = createOrGetLead(data.phone, data.tenant_id);
    
    if (lead.createdAt === new Date(lead.createdAt).getTime()) {
      // Nouveau lead - calculer score initial
      const initialScore = calculateInitialScore(data);
      
      const { updateLead } = require('./leadMemory');
      updateLead(data.phone, data.tenant_id, { score: initialScore });
      
      console.log('[LEAD_AGENT_CREATED]', {
        phone: data.phone,
        score: initialScore
      });
    }
    
    return { success: true, lead };
  }
  
  async handleLeadImport(data) {
    // Utiliser import CSV existant
    const { importCSVLeads } = require('./csvLeadImporter');
    await importCSVLeads(data.filePath);
    
    return { success: true, imported: true };
  }
  
  async handleLeadEnrich(data) {
    // Utiliser enrichissement existant
    const { enrichLeads } = require('./leadEnrichment');
    await enrichLeads();
    
    return { success: true, enriched: true };
  }
  
  // Handlers Sales Agent
  async handleOutboundSend(data) {
    // Utiliser scheduler existant
    const { runOutboundScheduler } = require('./outboundSchedulerSafe');
    await runOutboundScheduler();
    
    return { success: true, outbound: true };
  }
  
  async handleFollowUpSend(data) {
    // Utiliser follow-up existant
    const { scheduleIntelligentFollowUp } = require('./followUpSafe');
    scheduleIntelligentFollowUp(data.phone, data.tenant_id);
    
    return { success: true, followUp: true };
  }
  
  async handleClosingAttempt(data) {
    // Utiliser paiement existant
    const { sendPaymentLinkSafe } = require('./stripePaymentSafe');
    await sendPaymentLinkSafe(data.phone, data.tenant_id);
    
    return { success: true, closing: true };
  }
  
  // Handlers Support Agent
  async handleInboundMessage(data) {
    // Utiliser pipeline existant
    const { processIncomingReply } = require('./outboundPipeline');
    await processIncomingReply(data.phone, data.message);
    
    return { success: true, processed: true };
  }
  
  async handleIntentDetected(data) {
    // Utiliser scoring existant
    const { updateScoreOnMessage } = require('./dynamicScoring');
    updateScoreOnMessage(data.phone, data.tenant_id, data.message);
    
    return { success: true, scored: true };
  }
  
  async handleSupportRequest(data) {
    // Log support request - pas de modification
    console.log('[SUPPORT_AGENT_REQUEST]', {
      phone: data.phone,
      request: data.request?.substring(0, 50)
    });
    
    return { success: true, logged: true };
  }
  
  // Handlers Payment Agent
  async handlePaymentRequest(data) {
    // Utiliser paiement existant
    const { sendPaymentLinkSafe } = require('./stripePaymentSafe');
    await sendPaymentLinkSafe(data.phone, data.tenant_id);
    
    return { success: true, payment: true };
  }
  
  async handlePaymentValidate(data) {
    // Utiliser webhook existant
    const { handlePaymentSucceeded } = require('./stripeWebhookSafe');
    await handlePaymentSucceeded(data.paymentIntent);
    
    return { success: true, validated: true };
  }
  
  async handlePaymentConfirm(data) {
    // Utiliser confirmation existante
    const { handleCheckoutCompleted } = require('./stripeWebhookSafe');
    await handleCheckoutCompleted(data.session);
    
    return { success: true, confirmed: true };
  }
  
  // Fallback vers pipeline actuel (non modifié)
  async fallbackPipeline(task) {
    console.log('[FALLBACK_PIPELINE]', { taskType: task.type });
    
    // Utiliser pipeline existant sans aucune modification
    switch (task.type) {
      case 'inbound_message':
        const { processIncomingReply } = require('./outboundPipeline');
        return await processIncomingReply(task.data.phone, task.data.message);
        
      case 'outbound_send':
        const { runOutboundScheduler } = require('./outboundSchedulerSafe');
        return await runOutboundScheduler();
        
      default:
        console.log('[FALLBACK_NOT_HANDLED]', { taskType: task.type });
        return { success: false, reason: 'not_handled' };
    }
  }
  
  // Stats agent
  updateAgentStats(agent, success, duration) {
    if (!this.taskStats.byAgent[agent]) {
      this.taskStats.byAgent[agent] = {
        total: 0,
        success: 0,
        avgDuration: 0
      };
    }
    
    const stats = this.taskStats.byAgent[agent];
    stats.total++;
    
    if (success) {
      stats.success++;
    }
    
    // Moyenne durée
    stats.avgDuration = ((stats.avgDuration * (stats.total - 1)) + duration) / stats.total;
  }
  
  // Obtenir stats router
  getStats() {
    return {
      enabled: this.enabled,
      taskStats: this.taskStats,
      agents: Object.keys(AGENTS),
      uptime: process.uptime()
    };
  }
}

// Instance globale du router
if (!global.agentRouter) {
  global.agentRouter = new AgentRouter();
}

// Fonction principale de routing
async function routeTask(task) {
  return await global.agentRouter.routeTask(task);
}

// Stats du router
function getRouterStats() {
  return global.agentRouter.getStats();
}

// Activer/désactiver router
function setRouterEnabled(enabled) {
  global.agentRouter.enabled = enabled;
  console.log('[ROUTER_ENABLED]', { enabled });
}

module.exports = {
  routeTask,
  getRouterStats,
  setRouterEnabled,
  AGENTS
};
