const { logger } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const { secureTestModeManager, SECURE_TEST_CONFIG } = require("./secureTestMode");
const { rateLimit } = require("./rateLimit");
const { createLogger, LOG_CONFIG } = require("./structuredLogger");
const { alertManager, ALERT_CONFIG } = require("./alertManager");
const { idempotencyManager, IDEMPOTENCY_CONFIG } = require("./idempotency");
const { createMonitoringMiddleware } = require("./monitoringMiddleware");
const { advancedMonitoring } = require("./advancedMonitoring");
const { createCostControlMiddleware } = require("./costControlMiddleware");
const { costControlManager } = require("./costControl");
const { createProductionMonitoringMiddleware } = require("./productionMonitoringMiddleware");
const { productionMonitoringManager } = require("./productionMonitoring");

// Configuration du middleware global
const GLOBAL_MIDDLEWARE_CONFIG = {
  // Fonctions qui nécessitent le middleware
  protectedFunctions: [
    'addXp',
    'completeMission', 
    'checkBadges',
    'getUserProgress',
    'getAvailableMissions',
    'getAllBadges',
    'getUserBadges'
  ],
  
  // Options par défaut
  defaultOptions: {
    requireAuth: true,
    enforceRateLimit: true,
    validateEnvironment: true,
    enableLogging: true,
    enableSecurityAlerts: true,
    timeoutMs: 30000 // 30 secondes
  },
  
  // Options spécifiques par fonction
  functionOptions: {
    addXp: {
      requireAuth: true,
      enforceRateLimit: true,
      rateLimitAction: 'addXp',
      securityLevel: 'high',
      enableIdempotency: true,
      enableMonitoring: true,
      enableCostControl: true,
      enableProductionMonitoring: true
    },
    completeMission: {
      requireAuth: true,
      enforceRateLimit: true,
      rateLimitAction: 'completeMission',
      securityLevel: 'high',
      enableIdempotency: true,
      enableMonitoring: true,
      enableCostControl: true,
      enableProductionMonitoring: true
    },
    checkBadges: {
      requireAuth: true,
      enforceRateLimit: false,
      rateLimitAction: 'checkBadges',
      securityLevel: 'medium',
      enableIdempotency: true,
      enableMonitoring: true,
      enableCostControl: true,
      enableProductionMonitoring: true
    },
    getUserProgress: {
      requireAuth: true,
      enforceRateLimit: false,
      rateLimitAction: 'getUserProgress',
      securityLevel: 'medium',
      enableIdempotency: false,
      enableMonitoring: true,
      enableCostControl: true,
      enableProductionMonitoring: true
    },
    getAvailableMissions: {
      requireAuth: true,
      enforceRateLimit: false,
      rateLimitAction: 'getAvailableMissions',
      securityLevel: 'low',
      enableIdempotency: false,
      enableMonitoring: true,
      enableCostControl: true,
      enableProductionMonitoring: true
    },
    getAllBadges: {
      requireAuth: false,
      enforceRateLimit: false,
      rateLimitAction: 'getAllBadges',
      securityLevel: 'low',
      enableIdempotency: false,
      enableMonitoring: true,
      enableCostControl: false,
      enableProductionMonitoring: false
    },
    getUserBadges: {
      requireAuth: true,
      enforceRateLimit: false,
      rateLimitAction: 'getUserBadges',
      securityLevel: 'medium',
      enableIdempotency: false,
      enableMonitoring: true,
      enableCostControl: true,
      enableProductionMonitoring: true
    }
  }
};

// Classe principale du middleware global
class GlobalMiddleware {
  constructor() {
    this.metrics = {
      totalRequests: 0,
      blockedRequests: 0,
      authFailures: 0,
      rateLimitBlocks: 0,
      environmentViolations: 0,
      averageProcessingTime: 0,
      lastReset: new Date()
    };
  }

  // Middleware principal
  createMiddleware(functionName) {
    return async (request, response, next) => {
      const startTime = Date.now();
      this.metrics.totalRequests++;

      try {
        // Obtenir les options pour cette fonction
        const options = this.getFunctionOptions(functionName);
        
        // Créer le logger structuré
        const structuredLogger = createLogger({
          functionName,
          region: 'europe-west1',
          executionId: request.headers['x-execution-id'] || undefined
        });

        // Ajouter le logger et les options à la requête
        request.logger = structuredLogger;
        request.middlewareOptions = options;
        request.globalMiddleware = this;

        // Logger le début de la requête
        if (options.enableLogging) {
          structuredLogger.logFunctionStart({
            functionName,
            userId: request.auth?.uid,
            ip: request.rawRequest?.ip,
            userAgent: request.rawRequest?.headers?.['user-agent']
          });
        }

        // 1. Validation de l'environnement
        if (options.validateEnvironment) {
          const envResult = await this.checkEnvironment(request, structuredLogger);
          if (!envResult.success) {
            return this.sendErrorResponse(response, envResult.error, envResult.statusCode);
          }
        }

        // 2. Validation de l'authentification
        if (options.requireAuth) {
          const authResult = await this.checkAuth(request, structuredLogger);
          if (!authResult.success) {
            return this.sendErrorResponse(response, authResult.error, authResult.statusCode);
          }
        }

        // 3. Idempotence
        if (options.enableIdempotency) {
          const idempotencyMiddleware = idempotencyManager.createIdempotencyMiddleware(functionName);
          
          // Appliquer le middleware d'idempotence
          const idempotencyResult = await new Promise((resolve, reject) => {
            idempotencyMiddleware(request, response, (error) => {
              if (error) {
                reject(error);
              } else {
                resolve();
              }
            });
          });

          // Si le middleware d'idempotence a déjà répondu, ne pas continuer
          if (response.headersSent) {
            return;
          }
        }

        // 4. Rate limiting
        if (options.enforceRateLimit) {
          const rateLimitResult = await this.checkRateLimit(request, structuredLogger, options);
          if (!rateLimitResult.success) {
            return this.sendErrorResponse(response, rateLimitResult.error, rateLimitResult.statusCode);
          }
        }

        // 5. Monitoring avancé
        if (options.enableMonitoring) {
          const monitoringMiddleware = createMonitoringMiddleware(functionName);
          
          // Appliquer le middleware de monitoring
          const monitoringResult = await new Promise((resolve, reject) => {
            monitoringMiddleware(request, response, (error) => {
              if (error) {
                reject(error);
              } else {
                resolve();
              }
            });
          });

          // Si le monitoring a déjà répondu, ne pas continuer
          if (response.headersSent) {
            return;
          }
        }

        // 6. Contrôle des coûts
        if (options.enableCostControl) {
          const costControlMiddleware = createCostControlMiddleware(functionName);
          
          // Appliquer le middleware de contrôle des coûts
          const costControlResult = await new Promise((resolve, reject) => {
            costControlMiddleware(request, response, (error) => {
              if (error) {
                reject(error);
              } else {
                resolve();
              }
            });
          });

          // Si le contrôle des coûts a déjà répondu, ne pas continuer
          if (response.headersSent) {
            return;
          }
        }

        // 7. Production monitoring
        if (options.enableProductionMonitoring) {
          const productionMonitoringMiddleware = createProductionMonitoringMiddleware(functionName);
          
          // Appliquer le middleware de monitoring production
          const productionMonitoringResult = await new Promise((resolve, reject) => {
            productionMonitoringMiddleware(request, response, (error) => {
              if (error) {
                reject(error);
              } else {
                resolve();
              }
            });
          });

          // Si le monitoring production a déjà répondu, ne pas continuer
          if (response.headersSent) {
            return;
          }
        }

        // 8. Timeout handling
        const timeoutId = setTimeout(() => {
          if (!response.headersSent) {
            this.sendErrorResponse(response, 'Request timeout', 408);
          }
        }, options.timeoutMs);

        // Intercepter la fin de la requête
        const originalSend = response.send;
        const originalJson = response.json;

        response.send = (data) => {
          clearTimeout(timeoutId);
          this.logSuccess(structuredLogger, functionName, startTime, data);
          return originalSend.call(response, data);
        };

        response.json = (data) => {
          clearTimeout(timeoutId);
          this.logSuccess(structuredLogger, functionName, startTime, data);
          return originalJson.call(response, data);
        };

        // Continuer vers la fonction
        next();

      } catch (error) {
        this.logError(request, functionName, error, startTime);
        this.sendErrorResponse(response, error.message, 500);
      }
    };
  }

  // Obtenir les options pour une fonction
  getFunctionOptions(functionName) {
    return {
      ...GLOBAL_MIDDLEWARE_CONFIG.defaultOptions,
      ...GLOBAL_MIDDLEWARE_CONFIG.functionOptions[functionName] || {}
    };
  }

  // 1. Vérification de l'environnement
  async checkEnvironment(request, logger) {
    try {
      const envValidation = secureTestModeManager.validateEnvironment();
      
      if (!envValidation.isValid) {
        this.metrics.environmentViolations++;
        
        logger.error('🚨 Environment validation failed', {
          violations: envValidation.violations,
          securityLevel: envValidation.securityLevel
        });

        // Alerte critique en cas de violation d'environnement
        if (envValidation.securityLevel === 'critical') {
          await alertManager.createAlert(
            ALERT_CONFIG.levels.CRITICAL,
            ALERT_CONFIG.types.SECURITY_VIOLATION,
            "Environment validation failed",
            `Environment validation violations: ${envValidation.violations.join(', ')}`,
            {
              violations: envValidation.violations,
              securityLevel: envValidation.securityLevel,
              ip: request.rawRequest?.ip,
              timestamp: new Date()
            }
          );
        }

        return {
          success: false,
          error: `Environment validation failed: ${envValidation.violations.join(', ')}`,
          statusCode: 500
        };
      }

      logger.info('✅ Environment validation passed', {
        environment: secureTestModeManager.environment,
        securityLevel: envValidation.securityLevel
      });

      return { success: true };

    } catch (error) {
      logger.error('❌ Environment check error', { error: error.message });
      return {
        success: false,
        error: 'Environment check failed',
        statusCode: 500
      };
    }
  }

  // 2. Vérification de l'authentification
  async checkAuth(request, logger) {
    try {
      const authValidation = secureTestModeManager.validateAuth(request);
      
      if (!authValidation.isValid) {
        this.metrics.authFailures++;
        
        logger.error('🚨 Authentication validation failed', {
          violations: authValidation.violations,
          environment: secureTestModeManager.environment,
          ip: request.rawRequest?.ip
        });

        // Alerte de sécurité pour les tentatives non autorisées
        if (authValidation.violations.some(v => v.includes('unauthorized') || v.includes('forbidden'))) {
          await alertManager.createAlert(
            ALERT_CONFIG.levels.WARNING,
            ALERT_CONFIG.types.SECURITY_BREACH,
            "Authentication validation failed",
            `Authentication violations: ${authValidation.violations.join(', ')}`,
            {
              violations: authValidation.violations,
              ip: request.rawRequest?.ip,
              userAgent: request.rawRequest?.headers?.['user-agent'],
              environment: secureTestModeManager.environment,
              timestamp: new Date()
            }
          );
        }

        return {
          success: false,
          error: `Authentication failed: ${authValidation.violations.join(', ')}`,
          statusCode: 401
        };
      }

      // Ajouter les données d'authentification à la requête
      request.authValidation = authValidation;

      logger.info('✅ Authentication validation passed', {
        isAuthenticated: authValidation.isAuthenticated,
        isMockAuth: authValidation.isMockAuth,
        userId: authValidation.authData?.uid
      });

      return { success: true };

    } catch (error) {
      logger.error('❌ Authentication check error', { error: error.message });
      return {
        success: false,
        error: 'Authentication check failed',
        statusCode: 500
      };
    }
  }

  // 3. Rate limiting
  async checkRateLimit(request, logger, options) {
    try {
      if (!request.auth?.uid) {
        return { success: true }; // Pas de rate limit sans auth
      }

      const rateLimitResult = await rateLimit(
        request.auth.uid,
        options.rateLimitAction,
        request
      );
      
      if (!rateLimitResult.allowed) {
        this.metrics.rateLimitBlocks++;
        
        logger.warn('⚠️ Rate limit exceeded', {
          userId: request.auth.uid,
          action: options.rateLimitAction,
          rateLimitDetails: rateLimitResult,
          ip: request.rawRequest?.ip
        });

        return {
          success: false,
          error: rateLimitResult.reason || 'Rate limit exceeded',
          statusCode: 429
        };
      }

      logger.info('✅ Rate limit check passed', {
        userId: request.auth.uid,
        action: options.rateLimitAction,
        remainingCalls: rateLimitResult.remainingCalls
      });

      return { success: true };

    } catch (error) {
      logger.error('❌ Rate limit check error', { error: error.message });
      return {
        success: false,
        error: 'Rate limit check failed',
        statusCode: 500
      };
    }
  }

  // Envoyer une réponse d'erreur
  sendErrorResponse(response, message, statusCode = 500) {
    this.metrics.blockedRequests++;
    
    if (!response.headersSent) {
      response.status(statusCode).json({
        success: false,
        error: message,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Logger le succès
  logSuccess(logger, functionName, startTime, data) {
    const duration = Date.now() - startTime;
    this.updateAverageProcessingTime(duration);
    
    if (logger) {
      logger.logFunctionEnd(data, duration);
    }
  }

  // Logger les erreurs
  logError(request, functionName, error, startTime) {
    const duration = Date.now() - startTime;
    this.updateAverageProcessingTime(duration);
    
    if (request.logger) {
      request.logger.logFunctionError(error, {
        functionName,
        userId: request.auth?.uid,
        ip: request.rawRequest?.ip
      });
    }
  }

  // Mettre à jour le temps moyen de traitement
  updateAverageProcessingTime(duration) {
    const total = this.metrics.averageProcessingTime * (this.metrics.totalRequests - 1) + duration;
    this.metrics.averageProcessingTime = total / this.metrics.totalRequests;
  }

  // Obtenir les métriques du middleware
  getMetrics() {
    return {
      ...this.metrics,
      uptime: Date.now() - this.metrics.lastReset.getTime()
    };
  }

  // Réinitialiser les métriques
  resetMetrics() {
    this.metrics = {
      totalRequests: 0,
      blockedRequests: 0,
      authFailures: 0,
      rateLimitBlocks: 0,
      environmentViolations: 0,
      averageProcessingTime: 0,
      lastReset: new Date()
    };
  }

  // Health check du middleware
  healthCheck() {
    const metrics = this.getMetrics();
    const errorRate = metrics.totalRequests > 0 
      ? (metrics.blockedRequests / metrics.totalRequests) * 100 
      : 0;

    return {
      status: errorRate < 10 ? 'healthy' : 'degraded',
      metrics,
      errorRate: Math.round(errorRate * 100) / 100,
      environment: secureTestModeManager.environment,
      timestamp: new Date()
    };
  }
}

// Instance globale du middleware
const globalMiddleware = new GlobalMiddleware();

// Fonction pour appliquer le middleware à une fonction
const applyGlobalMiddleware = (functionName) => {
  return globalMiddleware.createMiddleware(functionName);
};

// Fonctions utilitaires individuelles (pour usage manuel si nécessaire)
const checkAuth = async (request, logger = null) => {
  const result = await globalMiddleware.checkAuth(request, logger);
  return result.success ? request.authValidation : null;
};

const checkEnvironment = async (request, logger = null) => {
  const envValidation = secureTestModeManager.validateEnvironment();
  return envValidation.isValid ? envValidation : null;
};

const checkRateLimit = async (request, action, logger = null) => {
  if (!request.auth?.uid) return { allowed: true };
  
  const result = await rateLimit(request.auth.uid, action, request);
  return result;
};

// Exporter les utilitaires
module.exports = {
  GlobalMiddleware,
  globalMiddleware,
  applyGlobalMiddleware,
  checkAuth,
  checkEnvironment,
  checkRateLimit,
  GLOBAL_MIDDLEWARE_CONFIG
};
