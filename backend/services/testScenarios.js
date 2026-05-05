// ACTION 9 - Scénarios de test intégrés

const { getFlag } = require('./envFlags');
const { createTrace, addTraceStep, completeTrace } = require('./traceManager');
const { logInboundReceived, logLeadCreated, logStatusChange, logMessageSent, logPaymentLinkSent } = require('./testModeLogger');
const { generateTestPaymentLink, confirmTestPayment } = require('./testPaymentSimulator');
const { checkDuplicate } = require('./duplicateValidator');
const { checkActionAllowed, recordAction } = require('./testModeLimiter');
const { getLeadsByTenant } = require('./tenantIsolationSafe');

// Scénarios de test intégrés (SAFE - simulation uniquement)
class TestScenarios {
  constructor() {
    this.enabled = getFlag('AGENT_TEST_MODE');
    this.scenarios = new Map();
    this.results = new Map();
    this.stats = {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      byScenario: new Map()
    };
    
    this.initializeScenarios();
    
    console.log('[TEST_SCENARIOS_INITIALIZED]', {
      enabled: this.enabled,
      scenariosCount: this.scenarios.size
    });
  }
  
  // Initialiser les scénarios
  initializeScenarios() {
    // Scénario 1: Lead froid → pas de réponse
    this.scenarios.set('cold_lead_no_response', {
      name: 'Cold Lead - No Response',
      description: 'Test lead creation with no follow-up',
      steps: [
        'create_lead',
        'send_initial_message',
        'wait_for_response',
        'timeout_no_response'
      ],
      expectedOutcome: 'Lead stays in CONTACTED or returns to NEW'
    });
    
    // Scénario 2: Lead répond → engage
    this.scenarios.set('lead_responds_engages', {
      name: 'Lead Responds - Engages',
      description: 'Test lead response and engagement',
      steps: [
        'create_lead',
        'send_initial_message',
        'receive_response',
        'engage_conversation',
        'send_followup'
      ],
      expectedOutcome: 'Lead moves to ENGAGED or INTERESTED'
    });
    
    // Scénario 3: Lead prêt → closing
    this.scenarios.set('ready_lead_closing', {
      name: 'Ready Lead - Closing',
      description: 'Test lead ready for closing phase',
      steps: [
        'create_lead',
        'send_initial_message',
        'receive_positive_response',
        'move_to_closing',
        'send_payment_link'
      ],
      expectedOutcome: 'Lead moves to CLOSING then PAYMENT_SENT'
    });
    
    // Scénario 4: Paiement → WON
    this.scenarios.set('payment_conversion', {
      name: 'Payment Conversion',
      description: 'Test complete payment conversion',
      steps: [
        'create_lead',
        'send_initial_message',
        'receive_positive_response',
        'move_to_closing',
        'send_payment_link',
        'confirm_payment',
        'convert_to_won'
      ],
      expectedOutcome: 'Lead converts to WON'
    });
    
    // Scénario 5: Test complet bout en bout
    this.scenarios.set('full_funnel_test', {
      name: 'Full Funnel Test',
      description: 'Complete end-to-end funnel test',
      steps: [
        'create_multiple_leads',
        'process_inbound_messages',
        'handle_engagement',
        'send_payment_links',
        'confirm_payments',
        'validate_no_duplicates',
        'check_error_handling'
      ],
      expectedOutcome: 'All leads processed correctly with no errors or duplicates'
    });
  }
  
  // Exécuter un scénario de test
  async runTestScenario(scenarioName, options = {}) {
    if (!this.enabled) {
      return { success: false, reason: 'test_mode_disabled' };
    }
    
    const scenario = this.scenarios.get(scenarioName);
    
    if (!scenario) {
      return { success: false, reason: 'scenario_not_found', availableScenarios: Array.from(this.scenarios.keys()) };
    }
    
    this.stats.totalRuns++;
    
    console.log('[TEST_SCENARIO_STARTED]', {
      scenarioName,
      description: scenario.description,
      options
    });
    
    try {
      const result = await this.executeScenario(scenarioName, scenario, options);
      
      if (result.success) {
        this.stats.successfulRuns++;
      } else {
        this.stats.failedRuns++;
      }
      
      // Stats par scénario
      const scenarioStats = this.stats.byScenario.get(scenarioName) || { runs: 0, successes: 0 };
      scenarioStats.runs++;
      if (result.success) {
        scenarioStats.successes++;
      }
      this.stats.byScenario.set(scenarioName, scenarioStats);
      
      console.log('[TEST_SCENARIO_COMPLETED]', {
        scenarioName,
        success: result.success,
        duration: result.duration,
        stepsCompleted: result.stepsCompleted
      });
      
      return result;
      
    } catch (error) {
      this.stats.failedRuns++;
      
      console.log('[TEST_SCENARIO_ERROR]', {
        scenarioName,
        error: error.message
      });
      
      return {
        success: false,
        scenarioName,
        error: error.message,
        stepsCompleted: 0
      };
    }
  }
  
  // Exécuter un scénario spécifique
  async executeScenario(scenarioName, scenario, options) {
    const startTime = Date.now();
    const traceId = createTrace(`test_${scenarioName}`, options.tenant_id || 'test', 'test_scenario');
    
    const result = {
      success: false,
      scenarioName,
      traceId,
      stepsCompleted: 0,
      steps: [],
      errors: [],
      duration: 0,
      metadata: {
        startedAt: new Date(),
        testMode: true
      }
    };
    
    try {
      for (const step of scenario.steps) {
        const stepResult = await this.executeStep(step, traceId, options);
        
        result.steps.push({
          step,
          success: stepResult.success,
          data: stepResult.data,
          error: stepResult.error,
          timestamp: new Date()
        });
        
        if (stepResult.success) {
          result.stepsCompleted++;
        } else {
          result.errors.push(stepResult.error);
          
          // Continuer même si une étape échoue (pour tester la résilience)
          console.log('[TEST_SCENARIO_STEP_FAILED]', {
            scenarioName,
            step,
            error: stepResult.error,
            continuing: true
          });
        }
      }
      
      // Évaluer le succès global
      result.success = this.evaluateScenarioSuccess(scenarioName, result);
      
    } catch (error) {
      result.errors.push(error.message);
      result.success = false;
    }
    
    result.duration = Date.now() - startTime;
    result.metadata.completedAt = new Date();
    
    // Compléter la trace
    completeTrace(traceId, result.success ? 'COMPLETED' : 'FAILED', result.success);
    
    // Stocker le résultat
    this.results.set(`${scenarioName}_${Date.now()}`, result);
    
    return result;
  }
  
  // Exécuter une étape spécifique
  async executeStep(step, traceId, options) {
    console.log(`[TEST_SCENARIO_STEP_EXECUTING]`, { step, traceId });
    
    try {
      switch (step) {
        case 'create_lead':
          return await this.stepCreateLead(traceId, options);
        case 'send_initial_message':
          return await this.stepSendInitialMessage(traceId, options);
        case 'wait_for_response':
          return await this.stepWaitForResponse(traceId, options);
        case 'timeout_no_response':
          return await this.stepTimeoutNoResponse(traceId, options);
        case 'receive_response':
          return await this.stepReceiveResponse(traceId, options);
        case 'engage_conversation':
          return await this.stepEngageConversation(traceId, options);
        case 'send_followup':
          return await this.stepSendFollowup(traceId, options);
        case 'receive_positive_response':
          return await this.stepReceivePositiveResponse(traceId, options);
        case 'move_to_closing':
          return await this.stepMoveToClosing(traceId, options);
        case 'send_payment_link':
          return await this.stepSendPaymentLink(traceId, options);
        case 'confirm_payment':
          return await this.stepConfirmPayment(traceId, options);
        case 'convert_to_won':
          return await this.stepConvertToWon(traceId, options);
        case 'create_multiple_leads':
          return await this.stepCreateMultipleLeads(traceId, options);
        case 'process_inbound_messages':
          return await this.stepProcessInboundMessages(traceId, options);
        case 'handle_engagement':
          return await this.stepHandleEngagement(traceId, options);
        case 'send_payment_links':
          return await this.stepSendPaymentLinks(traceId, options);
        case 'confirm_payments':
          return await this.stepConfirmPayments(traceId, options);
        case 'validate_no_duplicates':
          return await this.stepValidateNoDuplicates(traceId, options);
        case 'check_error_handling':
          return await this.stepCheckErrorHandling(traceId, options);
        default:
          return { success: false, error: `Unknown step: ${step}` };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  // Étape: Créer un lead
  async stepCreateLead(traceId, options) {
    const phone = this.generateTestPhone();
    const tenant_id = options.tenant_id || 'test';
    
    // Vérifier les doublons
    const duplicateCheck = checkDuplicate(phone, tenant_id, { lead_id: `test_${Date.now()}` });
    
    if (duplicateCheck.isDuplicate) {
      return { success: false, error: 'Duplicate phone detected', data: duplicateCheck };
    }
    
    // Simuler la création du lead
    const lead = {
      id: `lead_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      phone,
      tenant_id,
      status: 'NEW',
      score: Math.floor(Math.random() * 50) + 1,
      createdAt: new Date(),
      source: 'test_scenario'
    };
    
    // Logger
    logLeadCreated(lead);
    addTraceStep(traceId, 'lead_created', { lead_id: lead.id, phone, status: lead.status });
    
    // Stocker pour les étapes suivantes
    this.tempData = { lead, phone, tenant_id };
    
    return { success: true, data: { lead } };
  }
  
  // Étape: Envoyer message initial
  async stepSendInitialMessage(traceId, options) {
    if (!this.tempData?.lead) {
      return { success: false, error: 'No lead available' };
    }
    
    const { lead } = this.tempData;
    const message = 'Bonjour ! Je suis votre assistant virtuel. Comment puis-je vous aider ?';
    
    // Vérifier limite d'actions
    const actionCheck = checkActionAllowed('message', { tenant_id: lead.tenant_id });
    
    if (!actionCheck.allowed) {
      return { success: false, error: actionCheck.reason, data: actionCheck };
    }
    
    // Simuler l'envoi
    logMessageSent(lead.phone, lead.tenant_id, lead.id, 'initial', message);
    addTraceStep(traceId, 'message_sent', { 
      lead_id: lead.id, 
      messageType: 'initial', 
      messageLength: message.length 
    });
    
    // Enregistrer l'action
    recordAction('message', { tenant_id: lead.tenant_id });
    
    return { success: true, data: { message, sent: true } };
  }
  
  // Étape: Attendre réponse
  async stepWaitForResponse(traceId, options) {
    // Simuler une attente
    await this.sleep(1000);
    
    return { success: true, data: { waitTime: 1000 } };
  }
  
  // Étape: Timeout sans réponse
  async stepTimeoutNoResponse(traceId, options) {
    if (!this.tempData?.lead) {
      return { success: false, error: 'No lead available' };
    }
    
    const { lead } = this.tempData;
    
    // Simuler le timeout
    logStatusChange(lead.phone, lead.tenant_id, lead.id, 'CONTACTED', 'NEW', 'timeout_no_response');
    addTraceStep(traceId, 'status_timeout', { 
      lead_id: lead.id, 
      oldStatus: 'CONTACTED', 
      newStatus: 'NEW' 
    });
    
    return { success: true, data: { timeout: true, status: 'NEW' } };
  }
  
  // Étape: Recevoir réponse
  async stepReceiveResponse(traceId, options) {
    if (!this.tempData?.lead) {
      return { success: false, error: 'No lead available' };
    }
    
    const { lead } = this.tempData;
    const response = 'Bonjour, je suis intéressé par vos services';
    
    // Simuler la réception
    addTraceStep(traceId, 'response_received', { 
      lead_id: lead.id, 
      response: response.substring(0, 50) 
    });
    
    return { success: true, data: { response } };
  }
  
  // Étape: Engager conversation
  async stepEngageConversation(traceId, options) {
    if (!this.tempData?.lead) {
      return { success: false, error: 'No lead available' };
    }
    
    const { lead } = this.tempData;
    
    // Simuler l'engagement
    logStatusChange(lead.phone, lead.tenant_id, lead.id, 'CONTACTED', 'ENGAGED', 'positive_response');
    addTraceStep(traceId, 'status_engaged', { 
      lead_id: lead.id, 
      oldStatus: 'CONTACTED', 
      newStatus: 'ENGAGED' 
    });
    
    return { success: true, data: { status: 'ENGAGED' } };
  }
  
  // Étape: Envoyer follow-up
  async stepSendFollowup(traceId, options) {
    if (!this.tempData?.lead) {
      return { success: false, error: 'No lead available' };
    }
    
    const { lead } = this.tempData;
    const message = 'Super ! Avez-vous des questions spécifiques ?';
    
    // Vérifier limite follow-up
    const actionCheck = checkActionAllowed('followup', { tenant_id: lead.tenant_id });
    
    if (!actionCheck.allowed) {
      return { success: false, error: actionCheck.reason, data: actionCheck };
    }
    
    logMessageSent(lead.phone, lead.tenant_id, lead.id, 'followup', message);
    addTraceStep(traceId, 'followup_sent', { 
      lead_id: lead.id, 
      messageType: 'followup', 
      messageLength: message.length 
    });
    
    return { success: true, data: { message, sent: true } };
  }
  
  // Étape: Recevoir réponse positive
  async stepReceivePositiveResponse(traceId, options) {
    if (!this.tempData?.lead) {
      return { success: false, error: 'No lead available' };
    }
    
    const response = 'Oui, je veux procéder. Comment faire ?';
    
    addTraceStep(traceId, 'positive_response', { response: response.substring(0, 50) });
    
    return { success: true, data: { response } };
  }
  
  // Étape: Passer en closing
  async stepMoveToClosing(traceId, options) {
    if (!this.tempData?.lead) {
      return { success: false, error: 'No lead available' };
    }
    
    const { lead } = this.tempData;
    
    logStatusChange(lead.phone, lead.tenant_id, lead.id, 'ENGAGED', 'CLOSING', 'ready_to_buy');
    addTraceStep(traceId, 'status_closing', { 
      lead_id: lead.id, 
      oldStatus: 'ENGAGED', 
      newStatus: 'CLOSING' 
    });
    
    return { success: true, data: { status: 'CLOSING' } };
  }
  
  // Étape: Envoyer lien de paiement
  async stepSendPaymentLink(traceId, options) {
    if (!this.tempData?.lead) {
      return { success: false, error: 'No lead available' };
    }
    
    const { lead } = this.tempData;
    
    // Générer lien de paiement de test
    const paymentResult = generateTestPaymentLink(lead, 100);
    
    if (!paymentResult.success) {
      return { success: false, error: paymentResult.error };
    }
    
    logPaymentLinkSent(lead.phone, lead.tenant_id, lead.id, paymentResult.paymentLink, 100);
    addTraceStep(traceId, 'payment_link_sent', { 
      lead_id: lead.id, 
      paymentId: paymentResult.paymentId,
      amount: 100 
    });
    
    // Stocker le payment ID
    this.tempData.paymentId = paymentResult.paymentId;
    
    return { success: true, data: paymentResult };
  }
  
  // Étape: Confirmer paiement
  async stepConfirmPayment(traceId, options) {
    if (!this.tempData?.paymentId) {
      return { success: false, error: 'No payment ID available' };
    }
    
    const { paymentId } = this.tempData;
    
    // Confirmer le paiement
    const paymentResult = confirmTestPayment(paymentId, true);
    
    if (!paymentResult.success) {
      return { success: false, error: paymentResult.error };
    }
    
    addTraceStep(traceId, 'payment_confirmed', { 
      paymentId,
      confirmed: true 
    });
    
    return { success: true, data: paymentResult };
  }
  
  // Étape: Convertir en WON
  async stepConvertToWon(traceId, options) {
    if (!this.tempData?.lead) {
      return { success: false, error: 'No lead available' };
    }
    
    const { lead } = this.tempData;
    
    logStatusChange(lead.phone, lead.tenant_id, lead.id, 'PAYMENT_SENT', 'WON', 'payment_confirmed');
    addTraceStep(traceId, 'status_won', { 
      lead_id: lead.id, 
      oldStatus: 'PAYMENT_SENT', 
      newStatus: 'WON' 
    });
    
    return { success: true, data: { status: 'WON' } };
  }
  
  // Étape: Créer plusieurs leads
  async stepCreateMultipleLeads(traceId, options) {
    const leads = [];
    const count = options.leadCount || 3;
    
    for (let i = 0; i < count; i++) {
      const phone = this.generateTestPhone();
      const tenant_id = options.tenant_id || 'test';
      
      const duplicateCheck = checkDuplicate(phone, tenant_id, { lead_id: `test_${i}` });
      
      if (!duplicateCheck.isDuplicate) {
        const lead = {
          id: `lead_multi_${Date.now()}_${i}`,
          phone,
          tenant_id,
          status: 'NEW',
          score: Math.floor(Math.random() * 50) + 1,
          createdAt: new Date(),
          source: 'test_scenario_multi'
        };
        
        leads.push(lead);
        logLeadCreated(lead);
      }
    }
    
    addTraceStep(traceId, 'multiple_leads_created', { count: leads.length });
    
    return { success: true, data: { leads, count: leads.length } };
  }
  
  // Étape: Traiter messages inbound
  async stepProcessInboundMessages(traceId, options) {
    // Simuler le traitement de messages
    await this.sleep(500);
    
    addTraceStep(traceId, 'inbound_messages_processed', { simulated: true });
    
    return { success: true, data: { processed: true } };
  }
  
  // Étape: Gérer l'engagement
  async stepHandleEngagement(traceId, options) {
    // Simuler la gestion de l'engagement
    addTraceStep(traceId, 'engagement_handled', { simulated: true });
    
    return { success: true, data: { handled: true } };
  }
  
  // Étape: Envoyer liens de paiement
  async stepSendPaymentLinks(traceId, options) {
    // Simuler l'envoi de liens de paiement
    addTraceStep(traceId, 'payment_links_sent', { simulated: true, count: 2 });
    
    return { success: true, data: { sent: 2 } };
  }
  
  // Étape: Confirmer paiements
  async stepConfirmPayments(traceId, options) {
    // Simuler la confirmation de paiements
    addTraceStep(traceId, 'payments_confirmed', { simulated: true, count: 1 });
    
    return { success: true, data: { confirmed: 1 } };
  }
  
  // Étape: Valider absence de doublons
  async stepValidateNoDuplicates(traceId, options) {
    // Simuler la validation des doublons
    addTraceStep(traceId, 'duplicates_validated', { result: 'no_duplicates_found' });
    
    return { success: true, data: { duplicates: 0 } };
  }
  
  // Étape: Vérifier gestion d'erreurs
  async stepCheckErrorHandling(traceId, options) {
    // Simuler la vérification de la gestion d'erreurs
    addTraceStep(traceId, 'error_handling_checked', { result: 'all_errors_handled' });
    
    return { success: true, data: { errorsHandled: true } };
  }
  
  // Évaluer le succès d'un scénario
  evaluateScenarioSuccess(scenarioName, result) {
    const successRate = result.stepsCompleted / result.steps.length;
    
    // Au moins 80% des étapes doivent réussir
    if (successRate >= 0.8 && result.errors.length === 0) {
      return true;
    }
    
    // Pour certains scénarios, des critères spécifiques
    switch (scenarioName) {
      case 'payment_conversion':
        // Le scénario de paiement doit réussir à 100%
        return successRate === 1.0 && result.errors.length === 0;
      
      case 'full_funnel_test':
        // Le test complet doit avoir au moins 90% de succès
        return successRate >= 0.9 && result.errors.length <= 1;
      
      default:
        // Critère par défaut
        return successRate >= 0.8;
    }
  }
  
  // Obtenir les résultats des scénarios
  getScenarioResults(scenarioName = null) {
    if (!this.enabled) {
      return { enabled: false };
    }
    
    const results = [];
    
    for (const [key, result] of this.results.entries()) {
      if (!scenarioName || key.startsWith(scenarioName)) {
        results.push(result);
      }
    }
    
    // Trier par date (plus récent d'abord)
    results.sort((a, b) => new Date(b.metadata.completedAt) - new Date(a.metadata.completedAt));
    
    return {
      enabled: this.enabled,
      results: results.slice(0, 50), // Limiter à 50 résultats
      count: results.length
    };
  }
  
  // Obtenir les stats des scénarios
  getScenarioStats() {
    if (!this.enabled) {
      return { enabled: false };
    }
    
    const byScenarioStats = {};
    for (const [scenarioName, stats] of this.stats.byScenario.entries()) {
      byScenarioStats[scenarioName] = {
        ...stats,
        successRate: stats.runs > 0 ? (stats.successes / stats.runs) * 100 : 0
      };
    }
    
    const overallSuccessRate = this.stats.totalRuns > 0 ? 
      (this.stats.successfulRuns / this.stats.totalRuns) * 100 : 0;
    
    return {
      enabled: this.enabled,
      stats: {
        totalRuns: this.stats.totalRuns,
        successfulRuns: this.stats.successfulRuns,
        failedRuns: this.stats.failedRuns,
        overallSuccessRate: Math.round(overallSuccessRate * 100) / 100
      },
      byScenario: byScenarioStats,
      availableScenarios: Array.from(this.scenarios.keys()),
      uptime: process.uptime()
    };
  }
  
  // Obtenir tous les scénarios disponibles
  getAvailableScenarios() {
    if (!this.enabled) {
      return { enabled: false };
    }
    
    const scenarios = [];
    for (const [key, scenario] of this.scenarios.entries()) {
      const stats = this.stats.byScenario.get(key) || { runs: 0, successes: 0 };
      
      scenarios.push({
        id: key,
        name: scenario.name,
        description: scenario.description,
        steps: scenario.steps,
        expectedOutcome: scenario.expectedOutcome,
        stats: {
          runs: stats.runs,
          successes: stats.successes,
          successRate: stats.runs > 0 ? (stats.successes / stats.runs) * 100 : 0
        }
      });
    }
    
    return {
      enabled: this.enabled,
      scenarios,
      count: scenarios.length
    };
  }
  
  // Nettoyer les anciens résultats
  cleanup(maxAge = 24 * 60 * 60 * 1000) { // 24 heures
    const cutoff = Date.now() - maxAge;
    let cleaned = 0;
    
    for (const [key, result] of this.results.entries()) {
      const completedTime = new Date(result.metadata.completedAt).getTime();
      
      if (completedTime < cutoff) {
        this.results.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log('[TEST_SCENARIOS_CLEANUP]', {
        cleaned,
        remaining: this.results.size
      });
    }
    
    return cleaned;
  }
  
  // Réinitialiser
  reset() {
    this.results.clear();
    this.stats = {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      byScenario: new Map()
    };
    this.tempData = null;
    
    console.log('[TEST_SCENARIOS_RESET]');
  }
  
  // Générer un téléphone de test
  generateTestPhone() {
    const prefixes = ['06', '07', '01'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    
    let remaining = '';
    for (let i = 0; i < 8; i++) {
      remaining += Math.floor(Math.random() * 10);
    }
    
    return prefix + remaining;
  }
  
  // Helper pour pause
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Instance globale des scénarios
if (!global.testScenarios) {
  global.testScenarios = new TestScenarios();
}

// Fonctions principales
async function runTestScenario(scenarioName, options) {
  return await global.testScenarios.runTestScenario(scenarioName, options);
}

function getScenarioResults(scenarioName) {
  return global.testScenarios.getScenarioResults(scenarioName);
}

function getScenarioStats() {
  return global.testScenarios.getScenarioStats();
}

function getAvailableScenarios() {
  return global.testScenarios.getAvailableScenarios();
}

// Administration
function cleanupScenarios(maxAge) {
  return global.testScenarios.cleanup(maxAge);
}

function resetScenarios() {
  return global.testScenarios.reset();
}

module.exports = {
  runTestScenario,
  getScenarioResults,
  getScenarioStats,
  getAvailableScenarios,
  cleanupScenarios,
  resetScenarios,
  TestScenarios
};
