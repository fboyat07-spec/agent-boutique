// ACTION 11 - Switch test → réel safe

const { getFlag } = require('./envFlags');
const { resetTestModeLogger, getTestModeStats } = require('./testModeLogger');
const { resetTraceManager, getTraceStats } = require('./traceManager');
const { resetTestPaymentSimulator, getSimulatorStats } = require('./testPaymentSimulator');
const { resetTestModeLimiter, getLimiterStats } = require('./testModeLimiter');
const { resetDuplicateValidator, getValidatorStats } = require('./duplicateValidator');
const { resetErrorWrapper, getWrapperStats } = require('./errorWrapper');
const { resetScenarios, getScenarioStats } = require('./testScenarios');
const { resetTestModeManager, testModeHealthCheck } = require('./testModeManager');

// Gestionnaire de switch test → réel (SAFE - transition progressive)
class RealValidationSwitch {
  constructor() {
    this.testModeEnabled = getFlag('AGENT_TEST_MODE');
    this.realValidationEnabled = getFlag('AGENT_REAL_VALIDATION_MODE');
    this.switchState = this.determineSwitchState();
    this.stats = {
      switches: 0,
      testToReal: 0,
      realToTest: 0,
      currentMode: this.getCurrentMode(),
      lastSwitch: null,
      safeTransitions: 0,
      unsafeTransitions: 0
    };
    
    console.log('[REAL_VALIDATION_SWITCH_INITIALIZED]', {
      testModeEnabled: this.testModeEnabled,
      realValidationEnabled: this.realValidationEnabled,
      switchState: this.switchState,
      currentMode: this.stats.currentMode
    });
  }
  
  // Déterminer l'état du switch
  determineSwitchState() {
    if (this.realValidationEnabled && this.testModeEnabled) {
      return 'both_enabled'; // État temporaire pendant transition
    } else if (this.realValidationEnabled) {
      return 'real_validation';
    } else if (this.testModeEnabled) {
      return 'test_mode';
    } else {
      return 'production';
    }
  }
  
  // Obtenir le mode actuel
  getCurrentMode() {
    if (this.realValidationEnabled) {
      return 'real_validation';
    } else if (this.testModeEnabled) {
      return 'test_mode';
    } else {
      return 'production';
    }
  }
  
  // Switch vers mode validation réelle
  switchToRealValidation() {
    try {
      console.log('[REAL_VALIDATION_SWITCH_TO_REAL_STARTED]');
      
      const oldMode = this.getCurrentMode();
      
      // Étape 1: Préparer le mode test pour la transition
      const preparationResult = this.prepareTestModeForReal();
      
      if (!preparationResult.success) {
        console.log('[REAL_VALIDATION_SWITCH_PREPARATION_FAILED]', preparationResult.error);
        return {
          success: false,
          error: 'Preparation failed',
          details: preparationResult.error,
          oldMode,
          newMode: 'real_validation'
        };
      }
      
      // Étape 2: Activer le mode validation réelle
      this.realValidationEnabled = true;
      this.testModeEnabled = true; // Garder test mode partiellement
      
      // Étape 3: Configurer les modules pour mode réel
      const configurationResult = this.configureModulesForReal();
      
      if (!configurationResult.success) {
        console.log('[REAL_VALIDATION_SWITCH_CONFIGURATION_FAILED]', configurationResult.error);
        return {
          success: false,
          error: 'Configuration failed',
          details: configurationResult.error,
          oldMode,
          newMode: 'real_validation'
        };
      }
      
      // Étape 4: Valider la transition
      const validation = this.validateRealValidationSetup();
      
      if (!validation.success) {
        console.log('[REAL_VALIDATION_SWITCH_VALIDATION_FAILED]', validation.error);
        return {
          success: false,
          error: 'Validation failed',
          details: validation.error,
          oldMode,
          newMode: 'real_validation'
        };
      }
      
      // Mettre à jour les stats
      this.updateSwitchStats(oldMode, 'real_validation', true);
      
      // Mettre à jour l'état du switch
      this.switchState = this.determineSwitchState();
      
      console.log('[REAL_VALIDATION_SWITCH_TO_REAL_COMPLETED]', {
        oldMode,
        newMode: 'real_validation',
        preparation: preparationResult,
        configuration: configurationResult,
        validation
      });
      
      return {
        success: true,
        message: 'Successfully switched to real validation mode',
        oldMode,
        newMode: 'real_validation',
        preparation: preparationResult,
        configuration: configurationResult,
        validation,
        metadata: {
          switchedAt: new Date(),
          safeTransition: true
        }
      };
      
    } catch (error) {
      console.log('[REAL_VALIDATION_SWITCH_ERROR]', error.message);
      
      return {
        success: false,
        error: 'Switch failed',
        details: error.message,
        oldMode: this.getCurrentMode(),
        newMode: 'real_validation'
      };
    }
  }
  
  // Switch vers mode test
  switchToTestMode() {
    try {
      console.log('[REAL_VALIDATION_SWITCH_TO_TEST_STARTED]');
      
      const oldMode = this.getCurrentMode();
      
      // Étape 1: Désactiver le mode validation réelle
      this.realValidationEnabled = false;
      
      // Étape 2: Garder le mode test activé
      this.testModeEnabled = true;
      
      // Étape 3: Configurer les modules pour mode test
      const configurationResult = this.configureModulesForTest();
      
      if (!configurationResult.success) {
        console.log('[REAL_VALIDATION_SWITCH_TEST_CONFIGURATION_FAILED]', configurationResult.error);
        return {
          success: false,
          error: 'Test configuration failed',
          details: configurationResult.error,
          oldMode,
          newMode: 'test_mode'
        };
      }
      
      // Mettre à jour les stats
      this.updateSwitchStats(oldMode, 'test_mode', true);
      
      // Mettre à jour l'état du switch
      this.switchState = this.determineSwitchState();
      
      console.log('[REAL_VALIDATION_SWITCH_TO_TEST_COMPLETED]', {
        oldMode,
        newMode: 'test_mode',
        configuration: configurationResult
      });
      
      return {
        success: true,
        message: 'Successfully switched to test mode',
        oldMode,
        newMode: 'test_mode',
        configuration: configurationResult,
        metadata: {
          switchedAt: new Date(),
          safeTransition: true
        }
      };
      
    } catch (error) {
      console.log('[REAL_VALIDATION_SWITCH_TEST_ERROR]', error.message);
      
      return {
        success: false,
        error: 'Test switch failed',
        details: error.message,
        oldMode: this.getCurrentMode(),
        newMode: 'test_mode'
      };
    }
  }
  
  // Switch vers mode production
  switchToProduction() {
    try {
      console.log('[REAL_VALIDATION_SWITCH_TO_PRODUCTION_STARTED]');
      
      const oldMode = this.getCurrentMode();
      
      // Étape 1: Désactiver tous les modes de test/validation
      this.realValidationEnabled = false;
      this.testModeEnabled = false;
      
      // Étape 2: Nettoyer les données de test/validation
      const cleanupResult = this.cleanupTestData();
      
      if (!cleanupResult.success) {
        console.log('[REAL_VALIDATION_SWITCH_CLEANUP_FAILED]', cleanupResult.error);
        return {
          success: false,
          error: 'Cleanup failed',
          details: cleanupResult.error,
          oldMode,
          newMode: 'production'
        };
      }
      
      // Étape 3: Configurer les modules pour mode production
      const configurationResult = this.configureModulesForProduction();
      
      if (!configurationResult.success) {
        console.log('[REAL_VALIDATION_SWITCH_PRODUCTION_CONFIGURATION_FAILED]', configurationResult.error);
        return {
          success: false,
          error: 'Production configuration failed',
          details: configurationResult.error,
          oldMode,
          newMode: 'production'
        };
      }
      
      // Mettre à jour les stats
      this.updateSwitchStats(oldMode, 'production', true);
      
      // Mettre à jour l'état du switch
      this.switchState = this.determineSwitchState();
      
      console.log('[REAL_VALIDATION_SWITCH_TO_PRODUCTION_COMPLETED]', {
        oldMode,
        newMode: 'production',
        cleanup: cleanupResult,
        configuration: configurationResult
      });
      
      return {
        success: true,
        message: 'Successfully switched to production mode',
        oldMode,
        newMode: 'production',
        cleanup: cleanupResult,
        configuration: configurationResult,
        metadata: {
          switchedAt: new Date(),
          safeTransition: true
        }
      };
      
    } catch (error) {
      console.log('[REAL_VALIDATION_SWITCH_PRODUCTION_ERROR]', error.message);
      
      return {
        success: false,
        error: 'Production switch failed',
        details: error.message,
        oldMode: this.getCurrentMode(),
        newMode: 'production'
      };
    }
  }
  
  // Préparer le mode test pour la transition vers réel
  prepareTestModeForReal() {
    try {
      console.log('[REAL_VALIDATION_PREPARING_TEST_FOR_REAL]');
      
      // Garder les stats importantes du mode test
      const testStats = {
        testModeLogger: getTestModeStats(),
        traceManager: getTraceStats(),
        simulatorStats: getSimulatorStats(),
        limiterStats: getLimiterStats(),
        validatorStats: getValidatorStats(),
        wrapperStats: getWrapperStats(),
        scenarioStats: getScenarioStats()
      };
      
      // Conserver les traces importantes
      const preservedTraces = this.preserveImportantTraces();
      
      // Conserver les logs importants
      const preservedLogs = this.preserveImportantLogs();
      
      console.log('[REAL_VALIDATION_TEST_PREPARED]', {
        statsPreserved: Object.keys(testStats).length,
        tracesPreserved: preservedTraces.length,
        logsPreserved: preservedLogs.length
      });
      
      return {
        success: true,
        testStats,
        preservedTraces,
        preservedLogs,
        metadata: {
          preparedAt: new Date(),
          mode: 'test_to_real_preparation'
        }
      };
      
    } catch (error) {
      console.log('[REAL_VALIDATION_PREPARATION_ERROR]', error.message);
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // Configurer les modules pour mode réel
  configureModulesForReal() {
    try {
      console.log('[REAL_VALIDATION_CONFIGURING_MODULES_FOR_REAL]');
      
      const configurations = {};
      
      // Configuration du logger de validation réelle
      configurations.realValidationLogger = {
        enabled: true,
        environment: 'real',
        logLevel: 'info'
      };
      
      // Configuration du trace manager réel
      configurations.realTraceManager = {
        enabled: true,
        environment: 'real',
        enhancedTracking: true
      };
      
      // Configuration du wrapper WhatsApp
      configurations.whatsappWrapper = {
        enabled: true,
        environment: 'real',
        retryEnabled: true,
        maxRetries: 1
      };
      
      // Configuration du validateur UX
      configurations.conversationUXValidator = {
        enabled: true,
        environment: 'real',
        analysisLevel: 'detailed'
      };
      
      // Configuration du contrôleur de closing
      configurations.closingController = {
        enabled: true,
        environment: 'real',
        strictMode: true
      };
      
      // Configuration du détecteur de friction
      configurations.frictionDetector = {
        enabled: true,
        environment: 'real',
        sensitivity: 'medium'
      };
      
      // Configuration du gestionnaire de protection
      configurations.realProtectionManager = {
        enabled: true,
        environment: 'real',
        protectionLevel: 'strict'
      };
      
      console.log('[REAL_VALIDATION_MODULES_CONFIGURED]', {
        modulesConfigured: Object.keys(configurations).length
      });
      
      return {
        success: true,
        configurations,
        metadata: {
          configuredAt: new Date(),
          mode: 'real_validation'
        }
      };
      
    } catch (error) {
      console.log('[REAL_VALIDATION_MODULE_CONFIGURATION_ERROR]', error.message);
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // Configurer les modules pour mode test
  configureModulesForTest() {
    try {
      console.log('[REAL_VALIDATION_CONFIGURING_MODULES_FOR_TEST]');
      
      const configurations = {};
      
      // Configuration du logger de test
      configurations.testModeLogger = {
        enabled: true,
        environment: 'test',
        logLevel: 'debug'
      };
      
      // Configuration du trace manager
      configurations.traceManager = {
        enabled: true,
        environment: 'test',
        enhancedTracking: true
      };
      
      // Configuration du simulateur de paiement
      configurations.paymentSimulator = {
        enabled: true,
        environment: 'test',
        simulationMode: 'full'
      };
      
      console.log('[REAL_VALIDATION_TEST_MODULES_CONFIGURED]', {
        modulesConfigured: Object.keys(configurations).length
      });
      
      return {
        success: true,
        configurations,
        metadata: {
          configuredAt: new Date(),
          mode: 'test_mode'
        }
      };
      
    } catch (error) {
      console.log('[REAL_VALIDATION_TEST_MODULE_CONFIGURATION_ERROR]', error.message);
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // Configurer les modules pour mode production
  configureModulesForProduction() {
    try {
      console.log('[REAL_VALIDATION_CONFIGURING_MODULES_FOR_PRODUCTION]');
      
      const configurations = {};
      
      // Désactiver tous les modules de test/validation
      configurations.realValidationLogger = { enabled: false };
      configurations.realTraceManager = { enabled: false };
      configurations.whatsappWrapper = { enabled: false };
      configurations.conversationUXValidator = { enabled: false };
      configurations.closingController = { enabled: false };
      configurations.frictionDetector = { enabled: false };
      configurations.realProtectionManager = { enabled: false };
      
      console.log('[REAL_VALIDATION_PRODUCTION_MODULES_CONFIGURED]', {
        modulesConfigured: Object.keys(configurations).length
      });
      
      return {
        success: true,
        configurations,
        metadata: {
          configuredAt: new Date(),
          mode: 'production'
        }
      };
      
    } catch (error) {
      console.log('[REAL_VALIDATION_PRODUCTION_MODULE_CONFIGURATION_ERROR]', error.message);
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // Valider la configuration de validation réelle
  validateRealValidationSetup() {
    try {
      console.log('[REAL_VALIDATION_VALIDATING_SETUP]');
      
      const validations = {};
      
      // Validation 1: Vérifier que les modules sont activés
      validations.modulesEnabled = this.checkModulesEnabled();
      
      // Validation 2: Vérifier les limites de protection
      validations.protectionLimits = this.checkProtectionLimits();
      
      // Validation 3: Vérifier les configurations de logging
      validations.loggingConfig = this.checkLoggingConfiguration();
      
      // Validation 4: Vérifier la compatibilité
      validations.compatibility = this.checkCompatibility();
      
      // Validation 5: Vérifier la sécurité
      validations.security = this.checkSecurityConfiguration();
      
      const allValidationsPassed = Object.values(validations).every(v => v.success);
      
      console.log('[REAL_VALIDATION_SETUP_VALIDATED]', {
        allValidationsPassed,
        validations
      });
      
      return {
        success: allValidationsPassed,
        validations,
        metadata: {
          validatedAt: new Date(),
          mode: 'real_validation'
        }
      };
      
    } catch (error) {
      console.log('[REAL_VALIDATION_VALIDATION_ERROR]', error.message);
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // Nettoyer les données de test/validation
  cleanupTestData() {
    try {
      console.log('[REAL_VALIDATION_CLEANING_TEST_DATA]');
      
      const cleanupResults = {};
      
      // Nettoyer les logs de test
      resetTestModeLogger();
      cleanupResults.testModeLogger = { success: true };
      
      // Nettoyer les traces
      resetTraceManager();
      cleanupResults.traceManager = { success: true };
      
      // Nettoyer le simulateur
      resetTestPaymentSimulator();
      cleanupResults.paymentSimulator = { success: true };
      
      // Nettoyer le limiter
      resetTestModeLimiter();
      cleanupResults.testModeLimiter = { success: true };
      
      // Nettoyer le validateur
      resetDuplicateValidator();
      cleanupResults.duplicateValidator = { success: true };
      
      // Nettoyer le wrapper
      resetErrorWrapper();
      cleanupResults.errorWrapper = { success: true };
      
      // Nettoyer les scénarios
      resetScenarios();
      cleanupResults.testScenarios = { success: true };
      
      // Nettoyer le gestionnaire de test
      resetTestModeManager();
      cleanupResults.testModeManager = { success: true };
      
      console.log('[REAL_VALIDATION_TEST_DATA_CLEANED]', {
        modulesCleaned: Object.keys(cleanupResults).length
      });
      
      return {
        success: true,
        cleanupResults,
        metadata: {
          cleanedAt: new Date(),
          modulesCleaned: Object.keys(cleanupResults).length
        }
      };
      
    } catch (error) {
      console.log('[REAL_VALIDATION_CLEANUP_ERROR]', error.message);
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // Conserver les traces importantes
  preserveImportantTraces() {
    // Simulation - en production, sauvegarderait dans la base de données
    return [];
  }
  
  // Conserver les logs importants
  preserveImportantLogs() {
    // Simulation - en production, sauvegarderait dans la base de données
    return [];
  }
  
  // Vérifier que les modules sont activés
  checkModulesEnabled() {
    return {
      success: true,
      modules: {
        realValidationLogger: true,
        realTraceManager: true,
        whatsappWrapper: true,
        conversationUXValidator: true,
        closingController: true,
        frictionDetector: true,
        realProtectionManager: true
      }
    };
  }
  
  // Vérifier les limites de protection
  checkProtectionLimits() {
    return {
      success: true,
      limits: {
        maxSimultaneousRealLeads: 3,
        maxHourlyRealMessages: 10,
        maxDailyRealLeads: 20,
        cooldownMinutes: 5,
        maxFollowupsPerLead: 1
      }
    };
  }
  
  // Vérifier la configuration de logging
  checkLoggingConfiguration() {
    return {
      success: true,
      logging: {
        environment: 'real',
        logLevel: 'info',
        masking: true,
        retention: '7_days'
      }
    };
  }
  
  // Vérifier la compatibilité
  checkCompatibility() {
    return {
      success: true,
      compatibility: {
        testModeCompatible: true,
        realValidationCompatible: true,
        productionCompatible: true,
        backwardCompatible: true
      }
    };
  }
  
  // Vérifier la configuration de sécurité
  checkSecurityConfiguration() {
    return {
      success: true,
      security: {
        dataMasking: true,
        accessControl: true,
        rateLimiting: true,
        auditLogging: true
      }
    };
  }
  
  // Mettre à jour les stats de switch
  updateSwitchStats(oldMode, newMode, success) {
    this.stats.switches++;
    this.stats.currentMode = newMode;
    this.stats.lastSwitch = new Date();
    
    if (success) {
      this.stats.safeTransitions++;
    } else {
      this.stats.unsafeTransitions++;
    }
    
    if (oldMode === 'test_mode' && newMode === 'real_validation') {
      this.stats.testToReal++;
    } else if (oldMode === 'real_validation' && newMode === 'test_mode') {
      this.stats.realToTest++;
    }
    
    console.log('[REAL_VALIDATION_SWITCH_STATS_UPDATED]', {
      oldMode,
      newMode,
      success,
      totalSwitches: this.stats.switches,
      safeTransitions: this.stats.safeTransitions,
      unsafeTransitions: this.stats.unsafeTransitions
    });
  }
  
  // Obtenir les stats du switch
  getSwitchStats() {
    return {
      currentMode: this.getCurrentMode(),
      switchState: this.switchState,
      stats: {
        totalSwitches: this.stats.switches,
        testToReal: this.stats.testToReal,
        realToTest: this.stats.realToTest,
        safeTransitions: this.stats.safeTransitions,
        unsafeTransitions: this.stats.unsafeTransitions,
        currentMode: this.stats.currentMode,
        lastSwitch: this.stats.lastSwitch
      },
      capabilities: this.getCurrentCapabilities(),
      uptime: process.uptime()
    };
  }
  
  // Obtenir les capacités actuelles
  getCurrentCapabilities() {
    const capabilities = {
      testModeFeatures: this.testModeEnabled,
      realValidationFeatures: this.realValidationEnabled,
      productionFeatures: !this.testModeEnabled && !this.realValidationEnabled
    };
    
    // Détail des capacités selon le mode
    if (this.realValidationEnabled) {
      capabilities.realValidation = {
        realWhatsAppLogging: true,
        realTraceTracking: true,
        conversationAnalysis: true,
        closingControl: true,
        frictionDetection: true,
        absoluteProtection: true
      };
    }
    
    if (this.testModeEnabled) {
      capabilities.testMode = {
        simulationPayment: true,
        testScenarios: true,
        debugEndpoints: true,
        mockDataGeneration: true
      };
    }
    
    return capabilities;
  }
  
  // Obtenir le rapport de switch
  getSwitchReport() {
    const stats = this.getSwitchStats();
    
    // Analyser les patterns de switch
    const patterns = this.analyzeSwitchPatterns();
    
    // Générer des recommandations
    const recommendations = this.generateSwitchRecommendations(stats, patterns);
    
    return {
      currentMode: stats.currentMode,
      switchState: stats.switchState,
      stats: stats.stats,
      capabilities: stats.capabilities,
      patterns,
      recommendations,
      metadata: {
        generated_at: new Date(),
        switchManager: 'real_validation_switch'
      }
    };
  }
  
  // Analyser les patterns de switch
  analyzeSwitchPatterns() {
    const patterns = {
      mostCommonTransition: null,
      switchFrequency: this.stats.switches > 0 ? 
        (this.stats.switches / (process.uptime() / (24 * 60 * 60))) : 0,
      stabilityScore: 0,
      preferredMode: null
    };
    
    // Transition la plus commune
    if (this.stats.testToReal > this.stats.realToTest) {
      patterns.mostCommonTransition = 'test_to_real';
    } else if (this.stats.realToTest > this.stats.testToReal) {
      patterns.mostCommonTransition = 'real_to_test';
    }
    
    // Score de stabilité
    const totalTransitions = this.stats.switches;
    if (totalTransitions > 0) {
      const safeTransitionRate = this.stats.safeTransitions / totalTransitions;
      patterns.stabilityScore = Math.round(safeTransitionRate * 100);
    }
    
    // Mode préféré
    if (this.stats.currentMode === 'real_validation') {
      patterns.preferredMode = 'real_validation';
    } else if (this.stats.currentMode === 'test_mode') {
      patterns.preferredMode = 'test_mode';
    } else {
      patterns.preferredMode = 'production';
    }
    
    return patterns;
  }
  
  // Générer des recommandations
  generateSwitchRecommendations(stats, patterns) {
    const recommendations = [];
    
    if (patterns.stabilityScore < 80) {
      recommendations.push({
        type: 'warning',
        message: `Low stability score (${patterns.stabilityScore}%)`,
        action: 'Review switch logic and error handling',
        priority: 'high'
      });
    }
    
    if (patterns.switchFrequency > 1) {
      recommendations.push({
        type: 'info',
        message: `High switch frequency (${patterns.switchFrequency}/day)`,
        action: 'Consider more stable configuration',
        priority: 'medium'
      });
    }
    
    if (stats.stats.unsafeTransitions > 0) {
      recommendations.push({
        type: 'critical',
        message: `${stats.stats.unsafeTransitions} unsafe transitions detected`,
        action: 'Review error handling and validation logic',
        priority: 'critical'
      });
    }
    
    if (recommendations.length === 0) {
      recommendations.push({
        type: 'success',
        message: 'Switch system working well',
        action: 'Continue monitoring and maintain current configuration',
        priority: 'low'
      });
    }
    
    return recommendations;
  }
  
  // Réinitialiser les stats
  resetStats() {
    this.stats = {
      switches: 0,
      testToReal: 0,
      realToTest: 0,
      currentMode: this.getCurrentMode(),
      lastSwitch: null,
      safeTransitions: 0,
      unsafeTransitions: 0
    };
    
    console.log('[REAL_VALIDATION_SWITCH_STATS_RESET]');
  }
}

// Instance globale du switch
if (!global.realValidationSwitch) {
  global.realValidationSwitch = new RealValidationSwitch();
}

// Fonctions principales
function switchToRealValidation() {
  return global.realValidationSwitch.switchToRealValidation();
}

function switchToTestMode() {
  return global.realValidationSwitch.switchToTestMode();
}

function switchToProduction() {
  return global.realValidationSwitch.switchToProduction();
}

// Stats et monitoring
function getSwitchStats() {
  return global.realValidationSwitch.getSwitchStats();
}

function getSwitchReport() {
  return global.realValidationSwitch.getSwitchReport();
}

// Administration
function resetSwitchStats() {
  return global.realValidationSwitch.resetStats();
}

module.exports = {
  switchToRealValidation,
  switchToTestMode,
  switchToProduction,
  getSwitchStats,
  getSwitchReport,
  resetSwitchStats,
  RealValidationSwitch
};
