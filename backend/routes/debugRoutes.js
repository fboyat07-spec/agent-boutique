// ACTION 4 - Endpoint debug lead

const express = require('express');
const { getLeadsByTenant } = require('../services/tenantIsolationSafe');
const { getTraceByPhone, getTrace, getActiveTraces, getRecentTraces } = require('../services/traceManager');
const { getPhoneHistory, getTestModeStats } = require('../services/testModeLogger');
const { getFlag } = require('../services/envFlags');
const { generateTestRecommendations } = require('../services/testRecommendations');

const router = express.Router();

// GET /api/debug/lead?phone= - Debug lead complet
router.get('/lead', async (req, res) => {
  try {
    const { phone, tenant_id } = req.query;
    
    console.log('[DEBUG_LEAD_REQUESTED]', { phone, tenant_id });
    
    if (!phone) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'phone parameter required'
      });
    }
    
    // Vérifier que le mode test est activé
    if (!getFlag('AGENT_TEST_MODE')) {
      return res.status(403).json({
        error: 'test_mode_disabled',
        message: 'Debug endpoints only available in test mode'
      });
    }
    
    // Obtenir les données du lead
    let lead = null;
    let leadTenant = tenant_id;
    
    // Si tenant_id non spécifié, chercher dans tous les tenants
    if (!tenant_id) {
      // Simulation - en production, itérer sur les tenants
      const tenants = ['DEFAULT', 'demo', 'test'];
      
      for (const tenant of tenants) {
        const leads = getLeadsByTenant(tenant);
        const foundLead = leads.find(l => l.phone === phone);
        
        if (foundLead) {
          lead = foundLead;
          leadTenant = tenant;
          break;
        }
      }
    } else {
      const leads = getLeadsByTenant(tenant_id);
      lead = leads.find(l => l.phone === phone);
    }
    
    if (!lead) {
      return res.status(404).json({
        error: 'lead_not_found',
        message: 'Lead not found',
        phone: phone.slice(0, -4) + '****'
      });
    }
    
    // Obtenir l'historique du téléphone
    const phoneHistory = getPhoneHistory(phone);
    
    // Obtenir la trace si disponible
    const traceData = getTraceByPhone(phone);
    
    // Masquer les données sensibles
    const maskedLead = {
      ...lead,
      phone: phone.slice(0, -4) + '****'
    };
    
    console.log('[DEBUG_LEAD_GENERATED]', {
      phone: phone.slice(0, -4) + '****',
      tenant_id: leadTenant,
      lead_id: lead.id,
      status: lead.status
    });
    
    res.json({
      lead: maskedLead,
      tenant_id: leadTenant,
      phoneHistory: phoneHistory.enabled ? phoneHistory : null,
      trace: traceData.enabled ? traceData : null,
      metadata: {
        debug_at: new Date(),
        test_mode: true
      }
    });
    
  } catch (error) {
    console.log('[DEBUG_LEAD_ERROR]', error.message);
    
    res.status(500).json({
      error: 'debug_error',
      message: 'Failed to debug lead',
      details: error.message
    });
  }
});

// GET /api/debug/trace/:traceId - Obtenir trace par ID
router.get('/trace/:traceId', async (req, res) => {
  try {
    const { traceId } = req.params;
    
    console.log('[DEBUG_TRACE_REQUESTED]', { traceId });
    
    if (!getFlag('AGENT_TEST_MODE')) {
      return res.status(403).json({
        error: 'test_mode_disabled',
        message: 'Debug endpoints only available in test mode'
      });
    }
    
    const trace = getTrace(traceId);
    
    if (!trace.enabled && trace.error) {
      return res.status(404).json({
        error: 'trace_not_found',
        message: 'Trace not found'
      });
    }
    
    console.log('[DEBUG_TRACE_GENERATED]', { traceId });
    
    res.json({
      trace,
      metadata: {
        debug_at: new Date(),
        test_mode: true
      }
    });
    
  } catch (error) {
    console.log('[DEBUG_TRACE_ERROR]', error.message);
    
    res.status(500).json({
      error: 'debug_trace_error',
      message: 'Failed to get trace',
      details: error.message
    });
  }
});

// GET /api/debug/traces/active - Obtenir traces actives
router.get('/traces/active', async (req, res) => {
  try {
    console.log('[DEBUG_ACTIVE_TRACES_REQUESTED]');
    
    if (!getFlag('AGENT_TEST_MODE')) {
      return res.status(403).json({
        error: 'test_mode_disabled',
        message: 'Debug endpoints only available in test mode'
      });
    }
    
    const activeTraces = getActiveTraces();
    
    console.log('[DEBUG_ACTIVE_TRACES_GENERATED]', {
      count: activeTraces.count || 0
    });
    
    res.json({
      activeTraces,
      metadata: {
        debug_at: new Date(),
        test_mode: true
      }
    });
    
  } catch (error) {
    console.log('[DEBUG_ACTIVE_TRACES_ERROR]', error.message);
    
    res.status(500).json({
      error: 'debug_active_traces_error',
      message: 'Failed to get active traces',
      details: error.message
    });
  }
});

// GET /api/debug/traces/recent - Obtenir traces récentes
router.get('/traces/recent', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    console.log('[DEBUG_RECENT_TRACES_REQUESTED]', { limit });
    
    if (!getFlag('AGENT_TEST_MODE')) {
      return res.status(403).json({
        error: 'test_mode_disabled',
        message: 'Debug endpoints only available in test mode'
      });
    }
    
    const recentTraces = getRecentTraces(parseInt(limit));
    
    console.log('[DEBUG_RECENT_TRACES_GENERATED]', {
      count: recentTraces.count || 0
    });
    
    res.json({
      recentTraces,
      metadata: {
        debug_at: new Date(),
        test_mode: true
      }
    });
    
  } catch (error) {
    console.log('[DEBUG_RECENT_TRACES_ERROR]', error.message);
    
    res.status(500).json({
      error: 'debug_recent_traces_error',
      message: 'Failed to get recent traces',
      details: error.message
    });
  }
});

// GET /api/debug/stats - Stats du mode test
router.get('/stats', async (req, res) => {
  try {
    console.log('[DEBUG_STATS_REQUESTED]');
    
    if (!getFlag('AGENT_TEST_MODE')) {
      return res.status(403).json({
        error: 'test_mode_disabled',
        message: 'Debug endpoints only available in test mode'
      });
    }
    
    const testModeStats = getTestModeStats();
    
    console.log('[DEBUG_STATS_GENERATED]', {
      enabled: testModeStats.enabled,
      totalLogs: testModeStats.stats?.totalLogs || 0
    });
    
    res.json({
      testMode: testModeStats,
      metadata: {
        debug_at: new Date(),
        test_mode: true
      }
    });
    
  } catch (error) {
    console.log('[DEBUG_STATS_ERROR]', error.message);
    
    res.status(500).json({
      error: 'debug_stats_error',
      message: 'Failed to get test mode stats',
      details: error.message
    });
  }
});

// POST /api/debug/confirm-payment - Simulation paiement (ACTION 5)
router.post('/confirm-payment', async (req, res) => {
  try {
    const { phone, tenant_id, amount = 100 } = req.body;
    
    console.log('[DEBUG_CONFIRM_PAYMENT_REQUESTED]', { phone, tenant_id, amount });
    
    if (!getFlag('AGENT_TEST_MODE')) {
      return res.status(403).json({
        error: 'test_mode_disabled',
        message: 'Payment simulation only available in test mode'
      });
    }
    
    if (!phone) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'phone parameter required'
      });
    }
    
    // Trouver le lead
    let lead = null;
    let leadTenant = tenant_id;
    
    if (!tenant_id) {
      const tenants = ['DEFAULT', 'demo', 'test'];
      
      for (const tenant of tenants) {
        const leads = getLeadsByTenant(tenant);
        const foundLead = leads.find(l => l.phone === phone);
        
        if (foundLead) {
          lead = foundLead;
          leadTenant = tenant;
          break;
        }
      }
    } else {
      const leads = getLeadsByTenant(tenant_id);
      lead = leads.find(l => l.phone === phone);
    }
    
    if (!lead) {
      return res.status(404).json({
        error: 'lead_not_found',
        message: 'Lead not found for payment simulation'
      });
    }
    
    // Simuler la confirmation de paiement
    // En production, cela mettrait à jour le statut du lead à WON
    const simulatedResult = {
      success: true,
      paymentId: `test_payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      amount,
      currency: 'EUR',
      status: 'confirmed',
      lead_id: lead.id,
      tenant_id: leadTenant,
      confirmed_at: new Date()
    };
    
    // Logger la simulation
    console.log('[DEBUG_PAYMENT_SIMULATED]', {
      phone: phone.slice(0, -4) + '****',
      tenant_id: leadTenant,
      lead_id: lead.id,
      paymentId: simulatedResult.paymentId
    });
    
    res.json({
      success: true,
      message: 'Payment simulated successfully',
      result: simulatedResult,
      metadata: {
        simulated_at: new Date(),
        test_mode: true,
        note: 'In production, this would update lead status to WON'
      }
    });
    
  } catch (error) {
    console.log('[DEBUG_CONFIRM_PAYMENT_ERROR]', error.message);
    
    res.status(500).json({
      error: 'payment_simulation_error',
      message: 'Failed to simulate payment',
      details: error.message
    });
  }
});

// GET /api/debug/leads - Lister tous les leads (mode test)
router.get('/leads', async (req, res) => {
  try {
    const { tenant_id, status, limit = 50 } = req.query;
    
    console.log('[DEBUG_LEADS_REQUESTED]', { tenant_id, status, limit });
    
    if (!getFlag('AGENT_TEST_MODE')) {
      return res.status(403).json({
        error: 'test_mode_disabled',
        message: 'Debug endpoints only available in test mode'
      });
    }
    
    let leads = [];
    
    if (tenant_id) {
      leads = getLeadsByTenant(tenant_id);
    } else {
      // Obtenir de tous les tenants
      const tenants = ['DEFAULT', 'demo', 'test'];
      
      for (const tenant of tenants) {
        const tenantLeads = getLeadsByTenant(tenant);
        leads.push(...tenantLeads.map(lead => ({ ...lead, tenant_id: tenant })));
      }
    }
    
    // Filtrer par statut si spécifié
    if (status) {
      leads = leads.filter(lead => lead.status === status);
    }
    
    // Limiter le nombre de résultats
    leads = leads.slice(0, parseInt(limit));
    
    // Masquer les téléphones
    const maskedLeads = leads.map(lead => ({
      ...lead,
      phone: lead.phone.slice(0, -4) + '****'
    }));
    
    console.log('[DEBUG_LEADS_GENERATED]', {
      total: maskedLeads.length,
      tenant_id,
      status
    });
    
    res.json({
      leads: maskedLeads,
      metadata: {
        debug_at: new Date(),
        test_mode: true,
        total_found: maskedLeads.length
      }
    });
    
  } catch (error) {
    console.log('[DEBUG_LEADS_ERROR]', error.message);
    
    res.status(500).json({
      error: 'debug_leads_error',
      message: 'Failed to get leads',
      details: error.message
    });
  }
});

// GET /api/debug/test-report - Tableau de validation
router.get('/test-report', async (req, res) => {
  try {
    console.log('[DEBUG_TEST_REPORT_REQUESTED]');
    
    if (!getFlag('AGENT_TEST_MODE')) {
      return res.status(403).json({
        error: 'test_mode_disabled',
        message: 'Test report only available in test mode'
      });
    }
    
    // Collecter les stats de tous les modules de test
    const testModeStats = getTestModeStats();
    const traceStats = getTraceStats();
    const limiterStats = getLimiterStats();
    const validatorStats = getValidatorStats();
    const wrapperStats = getWrapperStats();
    const simulatorStats = getSimulatorStats();
    const scenarioStats = getScenarioStats();
    const validationReport = getValidationReport();
    
    // Calculer les métriques globales
    const globalMetrics = {
      leadsTested: testModeStats.stats?.totalLogs || 0,
      successFlow: scenarioStats.stats?.successfulRuns || 0,
      errors: wrapperStats.stats?.errorsCaught + testModeStats.stats?.errors || 0,
      duplicates: validatorStats.stats?.duplicatesDetected || 0,
      conversionOk: scenarioStats.stats?.successfulRuns > 0
    };
    
    // Calculer le statut global
    let overallStatus = 'healthy';
    const issues = [];
    
    if (globalMetrics.errors > 0) {
      overallStatus = 'warning';
      issues.push(`${globalMetrics.errors} errors detected`);
    }
    
    if (globalMetrics.duplicates > 0) {
      overallStatus = 'warning';
      issues.push(`${globalMetrics.duplicates} duplicates detected`);
    }
    
    if (globalMetrics.leadsTested === 0) {
      overallStatus = 'warning';
      issues.push('No leads tested');
    }
    
    if (!globalMetrics.conversionOk) {
      overallStatus = 'warning';
      issues.push('No successful conversions');
    }
    
    console.log('[DEBUG_TEST_REPORT_GENERATED]', {
      overallStatus,
      leadsTested: globalMetrics.leadsTested,
      successFlow: globalMetrics.successFlow,
      errors: globalMetrics.errors,
      duplicates: globalMetrics.duplicates
    });
    
    res.json({
      overall: {
        status: overallStatus,
        metrics: globalMetrics,
        issues,
        testMode: true
      },
      modules: {
        testModeLogger: testModeStats,
        traceManager: traceStats,
        testModeLimiter: limiterStats,
        duplicateValidator: validatorStats,
        errorWrapper: wrapperStats,
        paymentSimulator: simulatorStats,
        testScenarios: scenarioStats
      },
      validation: validationReport,
      recommendations: generateTestRecommendations(globalMetrics, {
        testModeStats,
        validatorStats,
        wrapperStats,
        scenarioStats
      }),
      metadata: {
        generated_at: new Date(),
        test_mode: true
      }
    });
    
  } catch (error) {
    console.log('[DEBUG_TEST_REPORT_ERROR]', error.message);
    
    res.status(500).json({
      error: 'test_report_error',
      message: 'Failed to generate test report',
      details: error.message
    });
  }
});

// POST /api/debug/run-scenario - Exécuter scénario de test
router.post('/run-scenario', async (req, res) => {
  try {
    const { scenarioName, options = {} } = req.body;
    
    console.log('[DEBUG_RUN_SCENARIO_REQUESTED]', { scenarioName, options });
    
    if (!getFlag('AGENT_TEST_MODE')) {
      return res.status(403).json({
        error: 'test_mode_disabled',
        message: 'Scenario execution only available in test mode'
      });
    }
    
    if (!scenarioName) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'scenarioName parameter required'
      });
    }
    
    const { runTestScenario } = require('../services/testScenarios');
    const result = await runTestScenario(scenarioName, options);
    
    console.log('[DEBUG_RUN_SCENARIO_COMPLETED]', {
      scenarioName,
      success: result.success,
      stepsCompleted: result.stepsCompleted
    });
    
    res.json({
      success: true,
      result,
      metadata: {
        executed_at: new Date(),
        test_mode: true
      }
    });
    
  } catch (error) {
    console.log('[DEBUG_RUN_SCENARIO_ERROR]', error.message);
    
    res.status(500).json({
      error: 'run_scenario_error',
      message: 'Failed to run scenario',
      details: error.message
    });
  }
});

// GET /api/debug/scenarios - Lister scénarios disponibles
router.get('/scenarios', async (req, res) => {
  try {
    console.log('[DEBUG_SCENARIOS_REQUESTED]');
    
    if (!getFlag('AGENT_TEST_MODE')) {
      return res.status(403).json({
        error: 'test_mode_disabled',
        message: 'Scenarios only available in test mode'
      });
    }
    
    const { getAvailableScenarios, getScenarioResults } = require('../services/testScenarios');
    const availableScenarios = getAvailableScenarios();
    const recentResults = getScenarioResults();
    
    console.log('[DEBUG_SCENARIOS_GENERATED]', {
      available: availableScenarios.count,
      recentResults: recentResults.count
    });
    
    res.json({
      availableScenarios,
      recentResults: recentResults.results.slice(0, 10), // 10 derniers résultats
      metadata: {
        generated_at: new Date(),
        test_mode: true
      }
    });
    
  } catch (error) {
    console.log('[DEBUG_SCENARIOS_ERROR]', error.message);
    
    res.status(500).json({
      error: 'scenarios_error',
      message: 'Failed to get scenarios',
      details: error.message
    });
  }
});

module.exports = router;
