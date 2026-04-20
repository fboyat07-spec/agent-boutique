const { logger } = require("firebase-functions/v2");
const { onCall } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { secureTestModeManager, SECURE_TEST_CONFIG } = require("../middleware/secureTestMode");

const db = admin.firestore();

// Service sécurisé pour la gestion du mode test
exports.getSecureTestConfig = onCall({
  region: "europe-west1",
  cors: true,
}, async (request) => {
  try {
    // Sécurité: Valider l'environnement côté serveur
    const envValidation = secureTestModeManager.validateEnvironment();
    if (!envValidation.isValid) {
      logger.error('🚨 Environment validation failed in getSecureTestConfig', {
        violations: envValidation.violations
      });
      throw new Error(`Environment validation failed: ${envValidation.violations.join(', ')}`);
    }

    // Sécurité: Valider l'authentification
    const authValidation = secureTestModeManager.validateAuth(request);
    if (!authValidation.isAuthenticated) {
      logger.error('🚨 Unauthorized access to getSecureTestConfig', {
        environment: secureTestModeManager.environment
      });
      throw new Error("Authentication required for test config access");
    }

    // Sécurité: En production, ne jamais exposer la configuration de test
    if (secureTestModeManager.environment === 'production') {
      logger.error('🚨 Test config access attempted in production', {
        uid: request.auth.uid,
        ip: request.rawRequest?.ip
      });
      throw new Error("Test config access not allowed in production");
    }

    const config = secureTestModeManager.getSecurityMetrics();
    
    logger.info("🔧 Secure test config requested", {
      environment: config.environment,
      isProduction: config.config.isProduction,
      uid: request.auth.uid
    });

    return {
      success: true,
      data: {
        environment: config.environment,
        isProduction: config.config.isProduction,
        isStaging: config.config.isStaging,
        isDevelopment: config.config.isDevelopment,
        features: {
          mockAuth: config.config.enableMockAuth,
          testMetrics: config.config.enableTestMetrics,
          detailedLogging: config.config.enableDetailedLogging,
          bypassRateLimit: config.config.enableBypassRateLimit
        },
        // Ne jamais exposer les détails sensibles
        securityLevel: config.config.isProduction ? 'maximum' : 'standard'
      }
    };

  } catch (error) {
    logger.error("Erreur récupération config sécurisée test:", error);
    
    return {
      success: false,
      error: error.message
    };
  }
});

// Obtenir les métriques de test
exports.getTestMetrics = onCall({
  region: "europe-west1",
  cors: true,
}, async (request) => {
  try {
    const metrics = testModeManager.getTestMetrics();
    
    logger.info("📊 Test metrics requested", {
      functionCalls: metrics.functionCalls,
      mockAuthUsages: metrics.mockAuthUsages
    });

    return {
      success: true,
      data: metrics
    };

  } catch (error) {
    logger.error("Erreur récupération métriques test:", error);
    
    return {
      success: false,
      error: error.message
    };
  }
});

// Réinitialiser les métriques de test
exports.resetTestMetrics = onCall({
  region: "europe-west1",
  cors: true,
}, async (request) => {
  try {
    testModeManager.resetTestMetrics();
    
    logger.info("🔄 Test metrics reset");

    return {
      success: true,
      data: {
        message: "Métriques de test réinitialisées",
        resetAt: new Date()
      }
    };

  } catch (error) {
    logger.error("Erreur réinitialisation métriques test:", error);
    
    return {
      success: false,
      error: error.message
    };
  }
});

// Changer d'environnement (uniquement en dev/staging)
exports.switchEnvironment = onCall({
  region: "europe-west1",
  cors: true,
}, async (request) => {
  try {
    const { newEnvironment } = request.data;
    
    if (!newEnvironment) {
      throw new Error("Nouvel environnement requis");
    }

    const result = testModeManager.switchEnvironment(newEnvironment);
    
    logger.info("🔄 Environment switched", {
      from: result.previous,
      to: result.current
    });

    return {
      success: true,
      data: result
    };

  } catch (error) {
    logger.error("Erreur changement environnement:", error);
    
    return {
      success: false,
      error: error.message
    };
  }
});

// Obtenir les utilisateurs mock disponibles
exports.getMockUsers = onCall({
  region: "europe-west1",
  cors: true,
}, async (request) => {
  try {
    const mockUsers = {};
    
    Object.keys(TEST_MODE_CONFIG.mockUsers).forEach(userType => {
      mockUsers[userType] = {
        ...TEST_MODE_CONFIG.mockUsers[userType],
        // Masquer les données sensibles
        token: undefined,
        firebase: undefined
      };
    });

    logger.info("👥 Mock users requested", {
      availableUsers: Object.keys(mockUsers)
    });

    return {
      success: true,
      data: {
        mockUsers,
        availableTypes: Object.keys(TEST_MODE_CONFIG.mockUsers)
      }
    };

  } catch (error) {
    logger.error("Erreur récupération mock users:", error);
    
    return {
      success: false,
      error: error.message
    };
  }
});

// Créer un token mock pour les tests
exports.createMockToken = onCall({
  region: "europe-west1",
  cors: true,
}, async (request) => {
  try {
    const { userType = 'regular', customData = {} } = request.data;
    
    // Valider que le mock auth est activé
    const config = testModeManager.getConfig();
    if (!config.config.enableMockAuth) {
      throw new Error("Mock auth non activé dans cet environnement");
    }

    const mockAuth = testModeManager.createMockAuth(userType, customData);
    
    logger.info("🔑 Mock token created", {
      userType,
      uid: mockAuth.uid,
      environment: config.environment
    });

    return {
      success: true,
      data: {
        mockAuth,
        token: mockAuth.token,
        userType,
        environment: config.environment
      }
    };

  } catch (error) {
    logger.error("Erreur création mock token:", error);
    
    return {
      success: false,
      error: error.message
    };
  }
});

// Valider une action dans l'environnement actuel
exports.validateAction = onCall({
  region: "europe-west1",
  cors: true,
}, async (request) => {
  try {
    const { action, context = {} } = request.data;
    
    if (!action) {
      throw new Error("Action requise");
    }

    const isAllowed = testModeManager.validateAction(action, context);
    
    logger.info("✅ Action validated", {
      action,
      isAllowed,
      environment: testModeManager.getConfig().environment
    });

    return {
      success: true,
      data: {
        action,
        isAllowed,
        environment: testModeManager.getConfig().environment,
        context
      }
    };

  } catch (error) {
    logger.error("Erreur validation action:", error);
    
    return {
      success: false,
      error: error.message
    };
  }
});

// Fonction de test pour simuler des scénarios
exports.runTestScenario = onCall({
  region: "europe-west1",
  cors: true,
}, async (request) => {
  try {
    const { scenario, parameters = {} } = request.data;
    
    if (!scenario) {
      throw new Error("Scénario requis");
    }

    const config = testModeManager.getConfig();
    const results = [];

    switch (scenario) {
      case 'xp_gain_simulation':
        results.push(await simulateXPGain(parameters));
        break;
        
      case 'mission_completion_simulation':
        results.push(await simulateMissionCompletion(parameters));
        break;
        
      case 'level_up_simulation':
        results.push(await simulateLevelUp(parameters));
        break;
        
      case 'error_simulation':
        results.push(await simulateError(parameters));
        break;
        
      case 'load_test':
        results.push(await simulateLoadTest(parameters));
        break;
        
      default:
        throw new Error(`Scénario inconnu: ${scenario}`);
    }

    logger.info("🧪 Test scenario completed", {
      scenario,
      resultsCount: results.length,
      environment: config.environment
    });

    return {
      success: true,
      data: {
        scenario,
        results,
        environment: config.environment,
        executedAt: new Date()
      }
    };

  } catch (error) {
    logger.error("Erreur exécution scénario test:", error);
    
    return {
      success: false,
      error: error.message
    };
  }
});

// Simuler un gain d'XP
async function simulateXPGain(parameters) {
  const { amount = 50, userType = 'regular', iterations = 1 } = parameters;
  const results = [];
  
  for (let i = 0; i < iterations; i++) {
    try {
      const mockAuth = testModeManager.createMockAuth(userType);
      
      // Simuler l'appel à addXp
      const result = {
        iteration: i + 1,
        userType,
        amount,
        userId: mockAuth.uid,
        timestamp: new Date(),
        status: 'success'
      };
      
      results.push(result);
      
    } catch (error) {
      results.push({
        iteration: i + 1,
        userType,
        amount,
        error: error.message,
        timestamp: new Date(),
        status: 'error'
      });
    }
  }
  
  return {
    scenario: 'xp_gain_simulation',
    parameters,
    results,
    summary: {
      total: iterations,
      success: results.filter(r => r.status === 'success').length,
      errors: results.filter(r => r.status === 'error').length
    }
  };
}

// Simuler une complétion de mission
async function simulateMissionCompletion(parameters) {
  const { missionId = 'test_mission_123', userType = 'regular', iterations = 1 } = parameters;
  const results = [];
  
  for (let i = 0; i < iterations; i++) {
    try {
      const mockAuth = testModeManager.createMockAuth(userType);
      
      const result = {
        iteration: i + 1,
        userType,
        missionId,
        userId: mockAuth.uid,
        timestamp: new Date(),
        status: 'success'
      };
      
      results.push(result);
      
    } catch (error) {
      results.push({
        iteration: i + 1,
        userType,
        missionId,
        error: error.message,
        timestamp: new Date(),
        status: 'error'
      });
    }
  }
  
  return {
    scenario: 'mission_completion_simulation',
    parameters,
    results,
    summary: {
      total: iterations,
      success: results.filter(r => r.status === 'success').length,
      errors: results.filter(r => r.status === 'error').length
    }
  };
}

// Simuler un level up
async function simulateLevelUp(parameters) {
  const { targetLevel = 5, userType = 'regular' } = parameters;
  const results = [];
  
  try {
    const mockAuth = testModeManager.createMockAuth(userType);
    
    const result = {
      userType,
      targetLevel,
      userId: mockAuth.uid,
      timestamp: new Date(),
      status: 'success'
    };
    
    results.push(result);
    
  } catch (error) {
    results.push({
      userType,
      targetLevel,
      error: error.message,
      timestamp: new Date(),
      status: 'error'
    });
  }
  
  return {
    scenario: 'level_up_simulation',
    parameters,
    results,
    summary: {
      total: 1,
      success: results.filter(r => r.status === 'success').length,
      errors: results.filter(r => r.status === 'error').length
    }
  };
}

// Simuler une erreur
async function simulateError(parameters) {
  const { errorType = 'general', severity = 'medium' } = parameters;
  
  const errors = {
    general: new Error("Erreur générale de test"),
    database: new Error("Erreur de base de données"),
    network: new Error("Erreur réseau"),
    validation: new Error("Erreur de validation"),
    authentication: new Error("Erreur d'authentification")
  };
  
  const error = errors[errorType] || errors.general;
  
  logger.error("🧪 Simulated error", {
    errorType,
    severity,
    message: error.message
  });
  
  return {
    scenario: 'error_simulation',
    parameters,
    error: {
      type: errorType,
      severity,
      message: error.message,
      timestamp: new Date()
    },
    status: 'simulated'
  };
}

// Simuler un test de charge
async function simulateLoadTest(parameters) {
  const { concurrentRequests = 10, userType = 'regular' } = parameters;
  const results = [];
  
  const startTime = Date.now();
  
  const promises = Array.from({ length: concurrentRequests }, async (_, index) => {
    try {
      const mockAuth = testModeManager.createMockAuth(userType);
      
      const result = {
        requestId: index + 1,
        userType,
        userId: mockAuth.uid,
        startTime: Date.now(),
        status: 'success'
      };
      
      // Simuler un temps de traitement
      await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
      
      result.endTime = Date.now();
      result.duration = result.endTime - result.startTime;
      
      return result;
      
    } catch (error) {
      return {
        requestId: index + 1,
        userType,
        error: error.message,
        startTime: Date.now(),
        endTime: Date.now(),
        status: 'error'
      };
    }
  });
  
  const requestResults = await Promise.allSettled(promises);
  
  requestResults.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      results.push(result.value);
    } else {
      results.push({
        requestId: index + 1,
        error: result.reason.message,
        status: 'error'
      });
    }
  });
  
  const endTime = Date.now();
  const totalDuration = endTime - startTime;
  
  return {
    scenario: 'load_test_simulation',
    parameters,
    results,
    summary: {
      total: concurrentRequests,
      success: results.filter(r => r.status === 'success').length,
      errors: results.filter(r => r.status === 'error').length,
      totalDuration,
      averageDuration: results
        .filter(r => r.duration)
        .reduce((sum, r) => sum + r.duration, 0) / results.filter(r => r.duration).length,
      requestsPerSecond: concurrentRequests / (totalDuration / 1000)
    }
  };
}

// Health check du mode test
exports.testModeHealthCheck = onCall({
  region: "europe-west1",
  cors: true,
}, async (request) => {
  try {
    const config = testModeManager.getConfig();
    const metrics = testModeManager.getTestMetrics();
    
    const health = {
      status: 'healthy',
      environment: config.environment,
      features: {
        mockAuth: config.config.enableMockAuth,
        detailedLogging: config.config.enableDetailedLogging,
        testMetrics: config.config.enableTestMetrics,
        bypassRateLimit: config.config.enableBypassRateLimit
      },
      metrics: {
        functionCalls: metrics.functionCalls,
        mockAuthUsages: metrics.mockAuthUsages,
        uptime: metrics.uptime
      },
      timestamp: new Date()
    };
    
    logger.info("🏥 Test mode health check", health);

    return {
      success: true,
      data: health
    };

  } catch (error) {
    logger.error("Erreur health check mode test:", error);
    
    return {
      success: false,
      error: error.message,
      status: 'unhealthy'
    };
  }
});
