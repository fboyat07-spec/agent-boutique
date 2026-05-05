// ACTION 11 - Désactivation facile

const { getFlag } = require('./envFlags');

// Gestionnaire central du mode test (SAFE - désactivation facile)
class TestModeManager {
  constructor() {
    this.enabled = getFlag('AGENT_TEST_MODE');
    this.modules = new Map();
    this.cleanupCallbacks = new Map();
    
    console.log('[TEST_MODE_MANAGER_INITIALIZED]', {
      enabled: this.enabled
    });
    
    // Enregistrer tous les modules de test
    this.registerTestModules();
  }
  
  // Enregistrer les modules de test
  registerTestModules() {
    // Logger test mode
    this.modules.set('testModeLogger', {
      name: 'Test Mode Logger',
      reset: () => {
        const { resetTestModeLogger } = require('./testModeLogger');
        return resetTestModeLogger();
      },
      cleanup: (maxAge) => {
        const { cleanupTestLogs } = require('./testModeLogger');
        return cleanupTestLogs(maxAge);
      },
      getStats: () => {
        const { getTestModeStats } = require('./testModeLogger');
        return getTestModeStats();
      }
    });
    
    // Trace manager
    this.modules.set('traceManager', {
      name: 'Trace Manager',
      reset: () => {
        const { resetTraceManager } = require('./traceManager');
        return resetTraceManager();
      },
      cleanup: (maxAge) => {
        const { cleanupTraces } = require('./traceManager');
        return cleanupTraces(maxAge);
      },
      getStats: () => {
        const { getTraceStats } = require('./traceManager');
        return getTraceStats();
      }
    });
    
    // Payment simulator
    this.modules.set('paymentSimulator', {
      name: 'Payment Simulator',
      reset: () => {
        const { resetTestPaymentSimulator } = require('./testPaymentSimulator');
        return resetTestPaymentSimulator();
      },
      cleanup: (maxAge) => {
        const { cleanupTestPayments } = require('./testPaymentSimulator');
        return cleanupTestPayments(maxAge);
      },
      getStats: () => {
        const { getSimulatorStats } = require('./testPaymentSimulator');
        return getSimulatorStats();
      }
    });
    
    // Test limiter
    this.modules.set('testModeLimiter', {
      name: 'Test Mode Limiter',
      reset: () => {
        const { resetLimiter } = require('./testModeLimiter');
        return resetLimiter();
      },
      cleanup: null, // Pas de cleanup nécessaire
      getStats: () => {
        const { getLimiterStats } = require('./testModeLimiter');
        return getLimiterStats();
      }
    });
    
    // Duplicate validator
    this.modules.set('duplicateValidator', {
      name: 'Duplicate Validator',
      reset: () => {
        const { resetValidatorStats } = require('./duplicateValidator');
        return resetValidatorStats();
      },
      cleanup: null, // Pas de cleanup nécessaire
      getStats: () => {
        const { getValidatorStats } = require('./duplicateValidator');
        return getValidatorStats();
      }
    });
    
    // Error wrapper
    this.modules.set('errorWrapper', {
      name: 'Error Wrapper',
      reset: () => {
        const { resetWrapperStats } = require('./errorWrapper');
        return resetWrapperStats();
      },
      cleanup: null, // Pas de cleanup nécessaire
      getStats: () => {
        const { getWrapperStats } = require('./errorWrapper');
        return getWrapperStats();
      }
    });
    
    // Test scenarios
    this.modules.set('testScenarios', {
      name: 'Test Scenarios',
      reset: () => {
        const { resetScenarios } = require('./testScenarios');
        return resetScenarios();
      },
      cleanup: (maxAge) => {
        const { cleanupScenarios } = require('./testScenarios');
        return cleanupScenarios(maxAge);
      },
      getStats: () => {
        const { getScenarioStats } = require('./testScenarios');
        return getScenarioStats();
      }
    });
    
    console.log('[TEST_MODE_MANAGER_MODULES_REGISTERED]', {
      modulesCount: this.modules.size
    });
  }
  
  // Vérifier si le mode test est activé
  isTestModeEnabled() {
    return this.enabled;
  }
  
  // Obtenir le statut de tous les modules
  getModulesStatus() {
    const status = {
      enabled: this.enabled,
      modules: {},
      summary: {
        totalModules: this.modules.size,
        activeModules: 0,
        errors: 0
      }
    };
    
    for (const [moduleId, module] of this.modules.entries()) {
      try {
        const stats = module.getStats();
        
        status.modules[moduleId] = {
          name: module.name,
          enabled: stats.enabled || true,
          stats: stats
        };
        
        if (stats.enabled !== false) {
          status.summary.activeModules++;
        }
        
      } catch (error) {
        status.modules[moduleId] = {
          name: module.name,
          enabled: false,
          error: error.message
        };
        
        status.summary.errors++;
      }
    }
    
    return status;
  }
  
  // Désactiver complètement le mode test
  disableTestMode() {
    if (!this.enabled) {
      return { success: false, reason: 'already_disabled' };
    }
    
    console.log('[TEST_MODE_MANAGER_DISABLING]', {
      modulesCount: this.modules.size
    });
    
    try {
      // Réinitialiser tous les modules
      const resetResults = {};
      
      for (const [moduleId, module] of this.modules.entries()) {
        try {
          if (module.reset) {
            const result = module.reset();
            resetResults[moduleId] = { success: true, result };
          } else {
            resetResults[moduleId] = { success: true, message: 'No reset needed' };
          }
        } catch (error) {
          resetResults[moduleId] = { success: false, error: error.message };
        }
      }
      
      // Nettoyer toutes les données
      const cleanupResults = {};
      
      for (const [moduleId, module] of this.modules.entries()) {
        try {
          if (module.cleanup) {
            const result = module.cleanup(0); // Cleanup immédiat
            cleanupResults[moduleId] = { success: true, cleaned: result };
          } else {
            cleanupResults[moduleId] = { success: true, message: 'No cleanup needed' };
          }
        } catch (error) {
          cleanupResults[moduleId] = { success: false, error: error.message };
        }
      }
      
      this.enabled = false;
      
      console.log('[TEST_MODE_MANAGER_DISABLED]', {
        resetResults,
        cleanupResults
      });
      
      return {
        success: true,
        message: 'Test mode disabled successfully',
        resetResults,
        cleanupResults,
        disabledAt: new Date()
      };
      
    } catch (error) {
      console.log('[TEST_MODE_MANAGER_DISABLE_ERROR]', error.message);
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // Activer le mode test
  enableTestMode() {
    if (this.enabled) {
      return { success: false, reason: 'already_enabled' };
    }
    
    console.log('[TEST_MODE_MANAGER_ENABLING]');
    
    try {
      this.enabled = true;
      
      console.log('[TEST_MODE_MANAGER_ENABLED]', {
        enabledAt: new Date()
      });
      
      return {
        success: true,
        message: 'Test mode enabled successfully',
        enabledAt: new Date()
      };
      
    } catch (error) {
      console.log('[TEST_MODE_MANAGER_ENABLE_ERROR]', error.message);
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // Réinitialiser tous les modules
  resetAllModules() {
    console.log('[TEST_MODE_MANAGER_RESETTING_ALL]', {
      modulesCount: this.modules.size
    });
    
    const results = {};
    
    for (const [moduleId, module] of this.modules.entries()) {
      try {
        if (module.reset) {
          const result = module.reset();
          results[moduleId] = { success: true, result };
        } else {
          results[moduleId] = { success: true, message: 'No reset needed' };
        }
      } catch (error) {
        results[moduleId] = { success: false, error: error.message };
      }
    }
    
    console.log('[TEST_MODE_MANAGER_RESET_ALL_COMPLETED]', { results });
    
    return results;
  }
  
  // Nettoyer tous les modules
  cleanupAllModules(maxAge = 24 * 60 * 60 * 1000) { // 24 heures par défaut
    console.log('[TEST_MODE_MANAGER_CLEANING_ALL]', {
      maxAge,
      modulesCount: this.modules.size
    });
    
    const results = {};
    let totalCleaned = 0;
    
    for (const [moduleId, module] of this.modules.entries()) {
      try {
        if (module.cleanup) {
          const result = module.cleanup(maxAge);
          results[moduleId] = { success: true, cleaned: result };
          totalCleaned += result;
        } else {
          results[moduleId] = { success: true, message: 'No cleanup needed' };
        }
      } catch (error) {
        results[moduleId] = { success: false, error: error.message };
      }
    }
    
    console.log('[TEST_MODE_MANAGER_CLEAN_ALL_COMPLETED]', {
      results,
      totalCleaned
    });
    
    return {
      results,
      totalCleaned
    };
  }
  
  // Obtenir un rapport complet du mode test
  getTestModeReport() {
    const modulesStatus = this.getModulesStatus();
    
    // Calculer les métriques globales
    const globalMetrics = this.calculateGlobalMetrics(modulesStatus);
    
    // Générer des recommandations
    const recommendations = this.generateRecommendations(modulesStatus, globalMetrics);
    
    return {
      enabled: this.enabled,
      modules: modulesStatus.modules,
      summary: modulesStatus.summary,
      globalMetrics,
      recommendations,
      metadata: {
        generatedAt: new Date(),
        testMode: true
      }
    };
  }
  
  // Calculer les métriques globales
  calculateGlobalMetrics(modulesStatus) {
    const metrics = {
      totalLogs: 0,
      totalTraces: 0,
      totalErrors: 0,
      totalActions: 0,
      memoryUsage: 0
    };
    
    for (const [moduleId, status] of Object.entries(modulesStatus.modules)) {
      if (status.enabled && status.stats) {
        const stats = status.stats;
        
        // Agréger les métriques selon le type de module
        switch (moduleId) {
          case 'testModeLogger':
            metrics.totalLogs = stats.stats?.totalLogs || 0;
            metrics.totalErrors = stats.stats?.errors || 0;
            break;
          case 'traceManager':
            metrics.totalTraces = stats.stats?.tracesCreated || 0;
            break;
          case 'testModeLimiter':
            metrics.totalActions = stats.counters?.actionsToday || 0;
            break;
          case 'errorWrapper':
            metrics.totalErrors += stats.stats?.errorsCaught || 0;
            break;
        }
      }
    }
    
    return metrics;
  }
  
  // Générer des recommandations
  generateRecommendations(modulesStatus, globalMetrics) {
    const recommendations = [];
    
    if (!this.enabled) {
      recommendations.push({
        type: 'info',
        message: 'Test mode is currently disabled',
        action: 'Enable test mode to run validation tests',
        priority: 'low'
      });
      return recommendations;
    }
    
    // Recommandations basées sur les métriques
    if (globalMetrics.totalErrors > 0) {
      recommendations.push({
        type: 'warning',
        message: `${globalMetrics.totalErrors} errors detected in test mode`,
        action: 'Review error logs and fix issues before production',
        priority: 'high'
      });
    }
    
    if (globalMetrics.totalLogs === 0) {
      recommendations.push({
        type: 'info',
        message: 'No test logs generated yet',
        action: 'Run test scenarios to generate validation data',
        priority: 'medium'
      });
    }
    
    if (globalMetrics.totalTraces > 1000) {
      recommendations.push({
        type: 'warning',
        message: 'High number of traces stored',
        action: 'Consider cleaning up old traces to free memory',
        priority: 'medium'
      });
    }
    
    // Recommandations par module
    for (const [moduleId, status] of Object.entries(modulesStatus.modules)) {
      if (status.error) {
        recommendations.push({
          type: 'critical',
          message: `Module ${status.name} has errors`,
          action: `Fix ${moduleId} module issues`,
          priority: 'high'
        });
      }
    }
    
    // Recommandation générale si tout va bien
    if (globalMetrics.totalErrors === 0 && globalMetrics.totalLogs > 0) {
      recommendations.push({
        type: 'success',
        message: 'Test mode is running smoothly',
        action: 'Continue monitoring and run comprehensive tests',
        priority: 'low'
      });
    }
    
    return recommendations;
  }
  
  // Vérifier la santé du mode test
  healthCheck() {
    const modulesStatus = this.getModulesStatus();
    
    const health = {
      status: 'healthy',
      enabled: this.enabled,
      issues: [],
      recommendations: []
    };
    
    if (!this.enabled) {
      health.status = 'disabled';
      health.issues.push('Test mode is disabled');
      health.recommendations.push('Enable test mode for validation');
    } else {
      // Vérifier les erreurs de modules
      if (modulesStatus.summary.errors > 0) {
        health.status = 'warning';
        health.issues.push(`${modulesStatus.summary.errors} modules have errors`);
        health.recommendations.push('Fix module errors');
      }
      
      // Vérifier si les modules sont actifs
      if (modulesStatus.summary.activeModules < modulesStatus.summary.totalModules) {
        health.status = 'warning';
        health.issues.push('Some modules are inactive');
        health.recommendations.push('Check module configurations');
      }
    }
    
    return health;
  }
}

// Instance globale du gestionnaire
if (!global.testModeManager) {
  global.testModeManager = new TestModeManager();
}

// Fonctions principales
function isTestModeEnabled() {
  return global.testModeManager.isTestModeEnabled();
}

function getModulesStatus() {
  return global.testModeManager.getModulesStatus();
}

function disableTestMode() {
  return global.testModeManager.disableTestMode();
}

function enableTestMode() {
  return global.testModeManager.enableTestMode();
}

function resetAllTestModules() {
  return global.testModeManager.resetAllModules();
}

function cleanupAllTestModules(maxAge) {
  return global.testModeManager.cleanupAllModules(maxAge);
}

function getTestModeReport() {
  return global.testModeManager.getTestModeReport();
}

function testModeHealthCheck() {
  return global.testModeManager.healthCheck();
}

module.exports = {
  isTestModeEnabled,
  getModulesStatus,
  disableTestMode,
  enableTestMode,
  resetAllTestModules,
  cleanupAllTestModules,
  getTestModeReport,
  testModeHealthCheck,
  TestModeManager
};
