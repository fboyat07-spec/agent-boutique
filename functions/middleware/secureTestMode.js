const { logger } = require("firebase-functions/v2");
const admin = require("firebase-admin");

// Configuration sécurisée du mode test
const SECURE_TEST_CONFIG = {
  // Environnements autorisés
  allowedEnvironments: ['development', 'staging'],
  productionEnvironment: 'production',
  
  // Actions interdites en production
  forbiddenInProduction: [
    'mockAuth',
    'testMetrics',
    'detailedLogging',
    'bypassRateLimit',
    'resetMetrics',
    'switchEnvironment',
    'runTestScenarios'
  ],
  
  // Actions nécessitant une authentification stricte
  requireStrictAuth: [
    'adminActions',
    'userManagement',
    'dataModification',
    'systemConfiguration'
  ],
  
  // Headers de test interdits
  forbiddenHeaders: [
    'x-mock-user',
    'x-test-mode',
    'x-bypass-auth',
    'x-skip-validation'
  ],
  
  // Configuration par environnement
  environmentConfig: {
    production: {
      enableMockAuth: false,
      enableTestMetrics: false,
      enableDetailedLogging: false,
      enableBypassRateLimit: false,
      enforceStrictAuth: true,
      validateAllRequests: true,
      logAllFailures: true
    },
    staging: {
      enableMockAuth: true,
      enableTestMetrics: true,
      enableDetailedLogging: true,
      enableBypassRateLimit: false,
      enforceStrictAuth: true,
      validateAllRequests: true,
      logAllFailures: true
    },
    development: {
      enableMockAuth: true,
      enableTestMetrics: true,
      enableDetailedLogging: true,
      enableBypassRateLimit: true,
      enforceStrictAuth: false,
      validateAllRequests: false,
      logAllFailures: false
    }
  }
};

// Classe pour la gestion sécurisée du mode test
class SecureTestModeManager {
  constructor() {
    this.environment = this.detectEnvironmentSecurely();
    this.config = this.getSecureConfig();
    this.securityMetrics = {
      blockedRequests: 0,
      unauthorizedAttempts: 0,
      forbiddenHeaderAttempts: 0,
      environmentViolations: 0,
      lastSecurityCheck: new Date()
    };
  }

  // Détecter l'environnement de manière sécurisée (côté serveur uniquement)
  detectEnvironmentSecurely() {
    // 1. Variable d'environnement NODE_ENV (priorité 1)
    const nodeEnv = process.env.NODE_ENV?.toLowerCase();
    if (nodeEnv && ['development', 'staging', 'production'].includes(nodeEnv)) {
      logger.info(`🔍 Environment detected from NODE_ENV: ${nodeEnv}`);
      return nodeEnv;
    }

    // 2. Configuration Firebase Functions (priorité 2)
    try {
      const functionsConfig = require('firebase-functions/compat').config();
      if (functionsConfig.env?.environment) {
        const configEnv = functionsConfig.env.environment.toLowerCase();
        if (['development', 'staging', 'production'].includes(configEnv)) {
          logger.info(`🔍 Environment detected from Firebase config: ${configEnv}`);
          return configEnv;
        }
      }
    } catch (error) {
      logger.warn("⚠️ Error reading Firebase config:", error.message);
    }

    // 3. Variable d'environnement FIREBASE_PROJECT (priorité 3)
    const projectId = process.env.FIREBASE_CONFIG?.project_id || process.env.GCLOUD_PROJECT;
    if (projectId) {
      if (projectId.includes('prod') || projectId.includes('production')) {
        logger.info(`🔍 Environment detected from project ID: production`);
        return 'production';
      } else if (projectId.includes('staging') || projectId.includes('stage')) {
        logger.info(`🔍 Environment detected from project ID: staging`);
        return 'staging';
      } else if (projectId.includes('dev') || projectId.includes('test')) {
        logger.info(`🔍 Environment detected from project ID: development`);
        return 'development';
      }
    }

    // 4. Par défaut: production (sécurité maximale)
    logger.warn("⚠️ Environment could not be detected, defaulting to PRODUCTION for security");
    return 'production';
  }

  // Obtenir la configuration sécurisée selon l'environnement
  getSecureConfig() {
    const baseConfig = SECURE_TEST_CONFIG.environmentConfig[this.environment];
    
    if (!baseConfig) {
      logger.error(`❌ Invalid environment: ${this.environment}, defaulting to production security`);
      return SECURE_TEST_CONFIG.environmentConfig.production;
    }

    return {
      ...baseConfig,
      environment: this.environment,
      isProduction: this.environment === 'production',
      isStaging: this.environment === 'staging',
      isDevelopment: this.environment === 'development',
      
      // Sécurité
      allowedEnvironments: SECURE_TEST_CONFIG.allowedEnvironments,
      forbiddenInProduction: SECURE_TEST_CONFIG.forbiddenInProduction,
      requireStrictAuth: SECURE_TEST_CONFIG.requireStrictAuth,
      forbiddenHeaders: SECURE_TEST_CONFIG.forbiddenHeaders
    };
  }

  // Valider l'environnement (côté serveur uniquement)
  validateEnvironment() {
    const validation = {
      isValid: true,
      environment: this.environment,
      violations: [],
      securityLevel: 'high'
    };

    // Vérifier si l'environnement est valide
    if (!['development', 'staging', 'production'].includes(this.environment)) {
      validation.isValid = false;
      validation.violations.push(`Invalid environment: ${this.environment}`);
      validation.securityLevel = 'critical';
    }

    // En production, vérifications supplémentaires
    if (this.environment === 'production') {
      // Vérifier que les fonctionnalités de test sont désactivées
      if (this.config.enableMockAuth) {
        validation.isValid = false;
        validation.violations.push('Mock auth enabled in production');
        validation.securityLevel = 'critical';
      }

      if (this.config.enableTestMetrics) {
        validation.isValid = false;
        validation.violations.push('Test metrics enabled in production');
        validation.securityLevel = 'critical';
      }

      if (this.config.enableBypassRateLimit) {
        validation.isValid = false;
        validation.violations.push('Rate limit bypass enabled in production');
        validation.securityLevel = 'critical';
      }
    }

    // Logger les résultats de validation
    if (!validation.isValid) {
      logger.error('🚨 Environment validation failed', {
        environment: this.environment,
        violations: validation.violations,
        securityLevel: validation.securityLevel
      });
      
      this.securityMetrics.environmentViolations++;
    } else {
      logger.info('✅ Environment validation passed', {
        environment: this.environment,
        securityLevel: validation.securityLevel
      });
    }

    this.securityMetrics.lastSecurityCheck = new Date();
    return validation;
  }

  // Valider l'authentification de manière sécurisée
  validateAuth(request) {
    const validation = {
      isValid: true,
      isAuthenticated: false,
      isMockAuth: false,
      violations: [],
      authData: null
    };

    // Vérifier les headers interdits
    const forbiddenHeaders = this.checkForbiddenHeaders(request);
    if (forbiddenHeaders.length > 0) {
      validation.isValid = false;
      validation.violations.push(`Forbidden headers detected: ${forbiddenHeaders.join(', ')}`);
      this.securityMetrics.forbiddenHeaderAttempts++;
      
      logger.error('🚨 Forbidden headers detected', {
        headers: forbiddenHeaders,
        ip: request.ip,
        userAgent: request.headers['user-agent']
      });
    }

    // En production, authentification stricte requise
    if (this.config.enforceStrictAuth && !request.auth) {
      validation.isValid = false;
      validation.violations.push('Authentication required in this environment');
      this.securityMetrics.unauthorizedAttempts++;
      
      logger.error('🚨 Unauthorized access attempt', {
        environment: this.environment,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        path: request.path
      });
    }

    // Vérifier si c'est un mock auth (uniquement en dev/staging)
    if (request.auth && request.auth.customClaims?.isMock) {
      if (this.environment === 'production') {
        validation.isValid = false;
        validation.violations.push('Mock auth detected in production');
        this.securityMetrics.environmentViolations++;
        
        logger.error('🚨 Mock auth detected in production', {
          uid: request.auth.uid,
          ip: request.ip,
          userAgent: request.headers['user-agent']
        });
      } else {
        validation.isMockAuth = true;
        logger.info('🧪 Mock auth detected (allowed)', {
          environment: this.environment,
          uid: request.auth.uid,
          mockType: request.auth.customClaims.mockType
        });
      }
    }

    // Valider l'authentification Firebase
    if (request.auth) {
      validation.isAuthenticated = true;
      validation.authData = {
        uid: request.auth.uid,
        email: request.auth.email,
        emailVerified: request.auth.email_verified,
        displayName: request.auth.displayName,
        customClaims: request.auth.customClaims
      };

      // Vérifications supplémentaires en production
      if (this.environment === 'production') {
        if (!request.auth.email_verified) {
          validation.isValid = false;
          validation.violations.push('Email not verified in production');
        }

        if (request.auth.customClaims?.isMock) {
          validation.isValid = false;
          validation.violations.push('Mock claims detected in production');
        }
      }
    }

    return validation;
  }

  // Vérifier les headers interdits
  checkForbiddenHeaders(request) {
    const forbidden = [];
    
    for (const header of SECURE_TEST_CONFIG.forbiddenHeaders) {
      if (request.headers[header]) {
        forbidden.push(header);
      }
    }
    
    return forbidden;
  }

  // Valider une action selon l'environnement
  validateAction(action, context = {}) {
    const validation = {
      isAllowed: true,
      environment: this.environment,
      action,
      violations: []
    };

    // Actions interdites en production
    if (this.environment === 'production') {
      if (SECURE_TEST_CONFIG.forbiddenInProduction.includes(action)) {
        validation.isAllowed = false;
        validation.violations.push(`Action ${action} forbidden in production`);
        
        logger.error('🚨 Forbidden action in production', {
          action,
          environment: this.environment,
          context
        });
      }
    }

    // Actions nécessitant une authentification stricte
    if (SECURE_TEST_CONFIG.requireStrictAuth.includes(action)) {
      if (!context.isAuthenticated) {
        validation.isAllowed = false;
        validation.violations.push(`Action ${action} requires authentication`);
        
        logger.error('🚨 Action requires authentication', {
          action,
          environment: this.environment,
          context
        });
      }
    }

    return validation;
  }

  // Middleware de sécurité principal
  createSecurityMiddleware() {
    return (req, res, next) => {
      try {
        // Valider l'environnement
        const envValidation = this.validateEnvironment();
        if (!envValidation.isValid) {
          this.securityMetrics.blockedRequests++;
          
          return res.status(500).json({
            error: 'Environment validation failed',
            violations: envValidation.violations,
            securityLevel: envValidation.securityLevel
          });
        }

        // Ajouter la configuration sécurisée à la requête
        req.secureConfig = this.config;
        req.securityManager = this;

        // Valider l'authentification
        const authValidation = this.validateAuth(req);
        req.authValidation = authValidation;

        if (!authValidation.isValid) {
          this.securityMetrics.blockedRequests++;
          
          return res.status(401).json({
            error: 'Authentication validation failed',
            violations: authValidation.violations,
            environment: this.environment
          });
        }

        // Logger les requêtes en développement/staging
        if (this.environment !== 'production') {
          logger.info('🔍 Request validated', {
            environment: this.environment,
            isAuthenticated: authValidation.isAuthenticated,
            isMockAuth: authValidation.isMockAuth,
            path: req.path,
            method: req.method
          });
        }

        next();

      } catch (error) {
        logger.error('❌ Security middleware error', {
          error: error.message,
          environment: this.environment
        });

        this.securityMetrics.blockedRequests++;
        
        return res.status(500).json({
          error: 'Security middleware error',
          environment: this.environment
        });
      }
    };
  }

  // Obtenir les métriques de sécurité
  getSecurityMetrics() {
    return {
      ...this.securityMetrics,
      environment: this.environment,
      config: this.config,
      uptime: Date.now() - this.securityMetrics.lastSecurityCheck.getTime()
    };
  }

  // Réinitialiser les métriques de sécurité
  resetSecurityMetrics() {
    this.securityMetrics = {
      blockedRequests: 0,
      unauthorizedAttempts: 0,
      forbiddenHeaderAttempts: 0,
      environmentViolations: 0,
      lastSecurityCheck: new Date()
    };

    logger.info('🔄 Security metrics reset', {
      environment: this.environment,
      resetAt: this.securityMetrics.lastSecurityCheck
    });
  }

  // Health check de sécurité
  securityHealthCheck() {
    const envValidation = this.validateEnvironment();
    
    const health = {
      status: envValidation.isValid ? 'healthy' : 'unhealthy',
      environment: this.environment,
      securityLevel: envValidation.securityLevel,
      config: this.config,
      metrics: this.securityMetrics,
      timestamp: new Date()
    };

    if (!envValidation.isValid) {
      health.violations = envValidation.violations;
    }

    return health;
  }
}

// Instance globale du gestionnaire sécurisé
const secureTestModeManager = new SecureTestModeManager();

// Exporter les utilitaires
module.exports = {
  SecureTestModeManager,
  secureTestModeManager,
  SECURE_TEST_CONFIG
};
