const { logger } = require("firebase-functions/v2");

// Configuration du mode test
const TEST_MODE_CONFIG = {
  // Environnements
  environments: {
    DEVELOPMENT: 'development',
    STAGING: 'staging',
    PRODUCTION: 'production'
  },
  
  // Sources de configuration
  configSources: {
    ENV_VAR: 'env_var',
    FIREBASE_CONFIG: 'firebase_config',
    HEADER: 'header',
    PARAMETER: 'parameter'
  },
  
  // Mock users pour les tests
  mockUsers: {
    admin: {
      uid: 'test_admin_123',
      email: 'admin@test.kidai.com',
      displayName: 'Test Admin',
      role: 'admin',
      permissions: ['read', 'write', 'admin'],
      xp: 10000,
      level: 25,
      streak: 30,
      subscription: {
        planId: 'premium_plus',
        status: 'active'
      }
    },
    premium: {
      uid: 'test_premium_123',
      email: 'premium@test.kidai.com',
      displayName: 'Test Premium',
      role: 'premium',
      permissions: ['read', 'write'],
      xp: 5000,
      level: 15,
      streak: 14,
      subscription: {
        planId: 'premium',
        status: 'active'
      }
    },
    regular: {
      uid: 'test_regular_123',
      email: 'regular@test.kidai.com',
      displayName: 'Test Regular',
      role: 'user',
      permissions: ['read', 'write'],
      xp: 500,
      level: 5,
      streak: 3,
      subscription: {
        planId: 'free',
        status: 'active'
      }
    },
    new: {
      uid: 'test_new_123',
      email: 'new@test.kidai.com',
      displayName: 'Test New User',
      role: 'user',
      permissions: ['read', 'write'],
      xp: 0,
      level: 1,
      streak: 0,
      subscription: {
        planId: 'free',
        status: 'active'
      }
    }
  },
  
  // Configuration détaillée des logs
  logging: {
    development: {
      level: 'debug',
      includeStackTrace: true,
      includeMemoryUsage: true,
      includePerformanceMetrics: true,
      includeRequestDetails: true,
      includeResponseDetails: true,
      batchInterval: 1000, // 1 seconde
      maxLogSize: 10000
    },
    staging: {
      level: 'info',
      includeStackTrace: true,
      includeMemoryUsage: true,
      includePerformanceMetrics: true,
      includeRequestDetails: false,
      includeResponseDetails: false,
      batchInterval: 5000, // 5 secondes
      maxLogSize: 5000
    },
    production: {
      level: 'warn',
      includeStackTrace: false,
      includeMemoryUsage: false,
      includePerformanceMetrics: false,
      includeRequestDetails: false,
      includeResponseDetails: false,
      batchInterval: 10000, // 10 secondes
      maxLogSize: 1000
    }
  }
};

// Classe pour gérer le mode test
class TestModeManager {
  constructor() {
    this.environment = this.detectEnvironment();
    this.config = this.loadConfig();
    this.mockUserData = new Map();
    this.testMetrics = {
      functionCalls: 0,
      mockAuthUsages: 0,
      environmentSwitches: 0,
      lastReset: new Date()
    };
  }

  // Détecter l'environnement actuel
  detectEnvironment() {
    // 1. Variable d'environnement
    if (process.env.NODE_ENV === 'development') {
      return TEST_MODE_CONFIG.environments.DEVELOPMENT;
    }
    
    if (process.env.NODE_ENV === 'staging') {
      return TEST_MODE_CONFIG.environments.STAGING;
    }
    
    if (process.env.NODE_ENV === 'production') {
      return TEST_MODE_CONFIG.environments.PRODUCTION;
    }
    
    // 2. Configuration Firebase
    if (process.env.FIREBASE_CONFIG) {
      const firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG);
      if (firebaseConfig.projectId?.includes('dev') || firebaseConfig.projectId?.includes('test')) {
        return TEST_MODE_CONFIG.environments.DEVELOPMENT;
      }
      if (firebaseConfig.projectId?.includes('staging')) {
        return TEST_MODE_CONFIG.environments.STAGING;
      }
    }
    
    // 3. Par défaut, développement en local
    if (process.env.FUNCTIONS_EMULATOR === 'true') {
      return TEST_MODE_CONFIG.environments.DEVELOPMENT;
    }
    
    // 4. Par défaut, production
    return TEST_MODE_CONFIG.environments.PRODUCTION;
  }

  // Charger la configuration selon l'environnement
  loadConfig() {
    const baseConfig = {
      environment: this.environment,
      isDevelopment: this.environment === TEST_MODE_CONFIG.environments.DEVELOPMENT,
      isStaging: this.environment === TEST_MODE_CONFIG.environments.STAGING,
      isProduction: this.environment === TEST_MODE_CONFIG.environments.PRODUCTION,
      
      // Flags de fonctionnalités
      enableMockAuth: this.environment !== TEST_MODE_CONFIG.environments.PRODUCTION,
      enableDetailedLogging: this.environment !== TEST_MODE_CONFIG.environments.PRODUCTION,
      enableTestMetrics: this.environment !== TEST_MODE_CONFIG.environments.PRODUCTION,
      enableBypassRateLimit: this.environment === TEST_MODE_CONFIG.environments.DEVELOPMENT,
      
      // Configuration des logs
      logging: TEST_MODE_CONFIG.logging[this.environment] || TEST_MODE_CONFIG.logging.production,
      
      // Configuration de sécurité
      security: {
        enforceAuth: this.environment === TEST_MODE_CONFIG.environments.PRODUCTION,
        enforceRateLimit: this.environment === TEST_MODE_CONFIG.environments.PRODUCTION,
        validateInputs: true,
        sanitizeOutputs: true
      }
    };

    // Surcharge avec les variables d'environnement
    if (process.env.ENABLE_MOCK_AUTH === 'false') {
      baseConfig.enableMockAuth = false;
    }
    
    if (process.env.ENABLE_DETAILED_LOGGING === 'true') {
      baseConfig.enableDetailedLogging = true;
    }
    
    if (process.env.BYPASS_RATE_LIMIT === 'true') {
      baseConfig.enableBypassRateLimit = true;
    }

    return baseConfig;
  }

  // Obtenir un utilisateur mock
  getMockUser(userType = 'regular') {
    const mockUser = TEST_MODE_CONFIG.mockUsers[userType];
    
    if (!mockUser) {
      throw new Error(`Type d'utilisateur mock non trouvé: ${userType}`);
    }

    // Ajouter les métadonnées de test
    return {
      ...mockUser,
      token: `mock_token_${userType}_${Date.now()}`,
      iss: 'https://securetoken.google.com/kidai-test',
      aud: 'kidai-test',
      auth_time: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 heure
      iat: Math.floor(Date.now() / 1000),
      sub: mockUser.uid,
      firebase: {
        identities: {
          email: [mockUser.email]
        },
        sign_in_provider: 'mock'
      }
    };
  }

  // Créer un mock auth pour les tests
  createMockAuth(userType = 'regular', customData = {}) {
    if (!this.config.enableMockAuth) {
      throw new Error('Mock auth non activé dans cet environnement');
    }

    const mockUser = this.getMockUser(userType);
    const customUser = { ...mockUser, ...customData };

    // Logger l'utilisation du mock auth
    if (this.config.enableTestMetrics) {
      this.testMetrics.mockAuthUsages++;
    }

    return {
      uid: customUser.uid,
      token: customUser.token,
      email: customUser.email,
      email_verified: true,
      displayName: customUser.displayName,
      photoURL: null,
      firebase: customUser.firebase,
      customClaims: {
        role: customUser.role,
        permissions: customUser.permissions,
        isMock: true,
        mockType: userType
      }
    };
  }

  // Middleware pour le mode test
  createTestMiddleware() {
    return (req, res, next) => {
      // Ajouter la configuration de test à la requête
      req.testMode = this.config;
      req.testManager = this;

      // Vérifier si un mock auth est demandé
      const mockUserHeader = req.headers['x-mock-user'];
      if (mockUserHeader && this.config.enableMockAuth) {
        try {
          req.auth = this.createMockAuth(mockUserHeader);
          req.isMockAuth = true;
          
          logger.info(`Mock auth activé: ${mockUserHeader}`, {
            mockUser: mockUserHeader,
            uid: req.auth.uid,
            environment: this.environment
          });
        } catch (error) {
          logger.error('Erreur création mock auth:', error);
          return res.status(400).json({
            error: 'Mock auth invalide',
            details: error.message
          });
        }
      }

      // Logger les détails de la requête en développement
      if (this.config.enableDetailedLogging) {
        this.logRequestDetails(req);
      }

      // Intercepter la réponse pour les logs
      if (this.config.enableDetailedLogging) {
        this.interceptResponse(req, res);
      }

      // Mettre à jour les métriques
      if (this.config.enableTestMetrics) {
        this.testMetrics.functionCalls++;
      }

      next();
    };
  }

  // Logger les détails de la requête
  logRequestDetails(req) {
    const logData = {
      method: req.method,
      url: req.originalUrl,
      headers: this.sanitizeHeaders(req.headers),
      query: req.query,
      body: this.sanitizeBody(req.body),
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      timestamp: new Date().toISOString(),
      environment: this.environment,
      isMockAuth: req.isMockAuth || false
    };

    logger.info('🔍 Request details', logData);
  }

  // Intercepter la réponse pour les logs
  interceptResponse(req, res) {
    const originalSend = res.send;
    const originalJson = res.json;

    res.send = function(data) {
      if (this.config.enableDetailedLogging) {
        this.logResponseDetails(req, res, data);
      }
      return originalSend.call(this, data);
    }.bind(this);

    res.json = function(data) {
      if (this.config.enableDetailedLogging) {
        this.logResponseDetails(req, res, data);
      }
      return originalJson.call(this, data);
    }.bind(this);
  }

  // Logger les détails de la réponse
  logResponseDetails(req, res, data) {
    const logData = {
      statusCode: res.statusCode,
      headers: res.getHeaders(),
      body: this.sanitizeBody(data),
      timestamp: new Date().toISOString(),
      environment: this.environment,
      duration: Date.now() - req.startTime
    };

    logger.info('📤 Response details', logData);
  }

  // Nettoyer les headers sensibles
  sanitizeHeaders(headers) {
    const sanitized = { ...headers };
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];
    
    sensitiveHeaders.forEach(header => {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  // Nettoyer le body sensible
  sanitizeBody(body) {
    if (!body || typeof body !== 'object') {
      return body;
    }

    const sanitized = { ...body };
    const sensitiveFields = ['password', 'token', 'apiKey', 'secret', 'key'];
    
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  // Obtenir les métriques de test
  getTestMetrics() {
    return {
      ...this.testMetrics,
      environment: this.environment,
      config: this.config,
      uptime: Date.now() - this.testMetrics.lastReset.getTime()
    };
  }

  // Réinitialiser les métriques
  resetTestMetrics() {
    this.testMetrics = {
      functionCalls: 0,
      mockAuthUsages: 0,
      environmentSwitches: 0,
      lastReset: new Date()
    };

    logger.info('🔄 Test metrics reset', {
      environment: this.environment,
      resetAt: this.testMetrics.lastReset
    });
  }

  // Changer d'environnement (uniquement en dev/staging)
  switchEnvironment(newEnvironment) {
    if (this.environment === TEST_MODE_CONFIG.environments.PRODUCTION) {
      throw new Error('Impossible de changer d\'environnement en production');
    }

    const validEnvironments = Object.values(TEST_MODE_CONFIG.environments);
    if (!validEnvironments.includes(newEnvironment)) {
      throw new Error(`Environnement invalide: ${newEnvironment}`);
    }

    const oldEnvironment = this.environment;
    this.environment = newEnvironment;
    this.config = this.loadConfig();
    this.testMetrics.environmentSwitches++;

    logger.info(`🔄 Environment switched`, {
      from: oldEnvironment,
      to: newEnvironment,
      switchCount: this.testMetrics.environmentSwitches
    });

    return {
      previous: oldEnvironment,
      current: newEnvironment,
      config: this.config
    };
  }

  // Valider si une action est autorisée dans l'environnement actuel
  validateAction(action, context = {}) {
    const validations = {
      mockAuth: () => this.config.enableMockAuth,
      bypassRateLimit: () => this.config.enableBypassRateLimit,
      detailedLogging: () => this.config.enableDetailedLogging,
      testMetrics: () => this.config.enableTestMetrics
    };

    const validator = validations[action];
    if (!validator) {
      throw new Error(`Action de validation inconnue: ${action}`);
    }

    const isAllowed = validator();
    
    if (!isAllowed) {
      logger.warn(`⚠️ Action non autorisée dans cet environnement`, {
        action,
        environment: this.environment,
        context
      });
    }

    return isAllowed;
  }

  // Créer un wrapper de fonction pour les tests
  wrapFunction(originalFunction, options = {}) {
    const {
      enableMockAuth = true,
      enableDetailedLogging = true,
      enableMetrics = true,
      customValidators = {}
    } = options;

    return async (req, res) => {
      const startTime = Date.now();
      const functionName = originalFunction.name || 'anonymous';

      try {
        // Logger le début
        if (this.config.enableDetailedLogging && enableDetailedLogging) {
          logger.info(`🚀 Function start: ${functionName}`, {
            environment: this.environment,
            isMockAuth: req.isMockAuth || false,
            userId: req.auth?.uid,
            startTime
          });
        }

        // Exécuter les validateurs personnalisés
        if (customValidators.before) {
          await customValidators.before(req, this);
        }

        // Exécuter la fonction originale
        const result = await originalFunction(req, res);

        // Logger le succès
        if (this.config.enableDetailedLogging && enableDetailedLogging) {
          const duration = Date.now() - startTime;
          logger.info(`✅ Function success: ${functionName}`, {
            environment: this.environment,
            duration,
            userId: req.auth?.uid
          });
        }

        // Mettre à jour les métriques
        if (this.config.enableTestMetrics && enableMetrics) {
          this.testMetrics.functionCalls++;
        }

        // Exécuter les validateurs personnalisés après
        if (customValidators.after) {
          await customValidators.after(req, result, this);
        }

        return result;

      } catch (error) {
        // Logger l'erreur
        if (this.config.enableDetailedLogging && enableDetailedLogging) {
          const duration = Date.now() - startTime;
          logger.error(`❌ Function error: ${functionName}`, {
            environment: this.environment,
            duration,
            error: error.message,
            stack: error.stack,
            userId: req.auth?.uid
          });
        }

        throw error;
      }
    };
  }

  // Obtenir la configuration actuelle
  getConfig() {
    return {
      environment: this.environment,
      config: this.config,
      metrics: this.testMetrics,
      availableMockUsers: Object.keys(TEST_MODE_CONFIG.mockUsers)
    };
  }
}

// Instance globale du gestionnaire de mode test
const testModeManager = new TestModeManager();

// Exporter les utilitaires
module.exports = {
  TestModeManager,
  testModeManager,
  TEST_MODE_CONFIG
};
