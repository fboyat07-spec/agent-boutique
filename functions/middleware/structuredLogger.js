const { logger } = require("firebase-functions/v2");
const admin = require("firebase-admin");

const db = admin.firestore();

// Configuration du logging structuré
const LOG_CONFIG = {
  // Niveaux de log
  levels: {
    DEBUG: 'debug',
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error',
    CRITICAL: 'critical'
  },
  
  // Catégories de log
  categories: {
    AUTH: 'auth',
    USER: 'user',
    MISSION: 'mission',
    XP: 'xp',
    BADGE: 'badge',
    SECURITY: 'security',
    PERFORMANCE: 'performance',
    SYSTEM: 'system',
    BUSINESS: 'business'
  },
  
  // Actions spécifiques
  actions: {
    // XP
    XP_GAINED: 'xp_gained',
    XP_LOST: 'xp_lost',
    LEVEL_UP: 'level_up',
    LEVEL_DOWN: 'level_down',
    
    // Missions
    MISSION_STARTED: 'mission_started',
    MISSION_COMPLETED: 'mission_completed',
    MISSION_FAILED: 'mission_failed',
    MISSION_ABANDONED: 'mission_abandoned',
    
    // Badges
    BADGE_UNLOCKED: 'badge_unlocked',
    BADGE_PROGRESS: 'badge_progress',
    
    // User
    USER_CREATED: 'user_created',
    USER_UPDATED: 'user_updated',
    USER_DELETED: 'user_deleted',
    USER_LOGIN: 'user_login',
    USER_LOGOUT: 'user_logout',
    
    // Security
    UNAUTHORIZED_ACCESS: 'unauthorized_access',
    RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
    SUSPICIOUS_ACTIVITY: 'suspicious_activity',
    SECURITY_VIOLATION: 'security_violation',
    
    // System
    FUNCTION_START: 'function_start',
    FUNCTION_END: 'function_end',
    FUNCTION_ERROR: 'function_error',
    BATCH_START: 'batch_start',
    BATCH_END: 'batch_end'
  },
  
  // Configuration Firebase Logging
  firebase: {
    structured: true,
    includeStackTrace: true,
    maxStackTraceLines: 10,
    batchSize: 10,
    batchInterval: 5000 // 5 secondes
  }
};

// Buffer pour les logs en batch
const logBuffer = [];
let batchTimeout = null;

// Classe pour le logging structuré
class StructuredLogger {
  constructor(context = {}) {
    this.context = context;
    this.functionName = context.functionName || 'unknown';
    this.region = context.region || 'unknown';
    this.executionId = context.executionId || this.generateExecutionId();
  }

  // Générer un ID d'exécution unique
  generateExecutionId() {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Créer une entrée de log structurée
  createLogEntry(level, category, action, message, data = {}) {
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    
    const logEntry = {
      // Métadonnées obligatoires
      timestamp,
      level,
      category,
      action,
      message,
      
      // Contexte d'exécution
      functionName: this.functionName,
      region: this.region,
      executionId: this.executionId,
      
      // Métadonnées système
      runtime: 'nodejs18',
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
      
      // Données utilisateur (si disponible)
      userId: data.userId || null,
      userAgent: data.userAgent || null,
      ip: data.ip || null,
      
      // Données additionnelles
      data: this.sanitizeData(data),
      
      // Métadonnées de performance
      duration: data.duration || null,
      startTime: data.startTime || null,
      endTime: data.endTime || null,
      
      // Métadonnées d'erreur (si applicable)
      error: data.error ? {
        name: data.error.name,
        message: data.error.message,
        code: data.error.code,
        stack: data.error.stack
      } : null
    };

    return logEntry;
  }

  // Nettoyer les données sensibles
  sanitizeData(data) {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sanitized = { ...data };
    
    // Masquer les champs sensibles
    const sensitiveFields = [
      'password', 'token', 'apiKey', 'secret', 'key',
      'authorization', 'auth', 'credential', 'private'
    ];

    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });

    // Limiter la taille des objets
    const maxDataSize = 1000; // caractères
    const dataString = JSON.stringify(sanitized);
    
    if (dataString.length > maxDataSize) {
      return {
        ...sanitized,
        _truncated: true,
        _originalSize: dataString.length,
        data: JSON.parse(dataString.substring(0, maxDataSize) + '"}')
      };
    }

    return sanitized;
  }

  // Logger une entrée
  async log(level, category, action, message, data = {}) {
    try {
      const logEntry = this.createLogEntry(level, category, action, message, data);
      
      // Logger dans Firebase Functions
      const firebaseLevel = this.getFirebaseLogLevel(level);
      logger[firebaseLevel](message, logEntry);

      // Ajouter au buffer pour batch Firestore
      logBuffer.push({
        ...logEntry,
        timestamp: new Date().toISOString() // Convertir pour Firestore
      });

      // Logger dans Firestore (batch)
      this.scheduleBatchWrite();

      // Alertes pour les erreurs critiques
      if (level === LOG_CONFIG.levels.CRITICAL) {
        await this.sendCriticalAlert(logEntry);
      }

      return logEntry;

    } catch (error) {
      // Fallback: logger simple si le logging structuré échoue
      console.error('Erreur dans le logging structuré:', error);
      logger.error(`[LOGGING_ERROR] ${message}`, { error: error.message });
    }
  }

  // Obtenir le niveau de log Firebase approprié
  getFirebaseLogLevel(level) {
    switch (level) {
      case LOG_CONFIG.levels.DEBUG:
        return 'debug';
      case LOG_CONFIG.levels.INFO:
        return 'info';
      case LOG_CONFIG.levels.WARN:
        return 'warn';
      case LOG_CONFIG.levels.ERROR:
        return 'error';
      case LOG_CONFIG.levels.CRITICAL:
        return 'error';
      default:
        return 'info';
    }
  }

  // Programmer l'écriture batch dans Firestore
  scheduleBatchWrite() {
    if (batchTimeout) {
      clearTimeout(batchTimeout);
    }

    batchTimeout = setTimeout(async () => {
      await this.writeBatchToFirestore();
    }, LOG_CONFIG.firebase.batchInterval);
  }

  // Écrire le batch dans Firestore
  async writeBatchToFirestore() {
    if (logBuffer.length === 0) {
      return;
    }

    try {
      const batch = db.batch();
      const logsToWrite = logBuffer.splice(0, LOG_CONFIG.firebase.batchSize);

      logsToWrite.forEach(logEntry => {
        const logRef = db.collection('structured_logs').doc();
        batch.set(logRef, logEntry);
      });

      await batch.commit();

      console.log(`📝 Batch de logs écrit: ${logsToWrite.length} entrées`);

    } catch (error) {
      console.error('Erreur écriture batch logs:', error);
      logger.error('BATCH_LOG_ERROR', { error: error.message });
    }
  }

  // Envoyer une alerte critique
  async sendCriticalAlert(logEntry) {
    try {
      // Créer une alerte dans Firestore
      await db.collection('critical_alerts').add({
        ...logEntry,
        alertId: this.generateAlertId(),
        status: 'active',
        acknowledged: false,
        acknowledgedBy: null,
        acknowledgedAt: null,
        resolved: false,
        resolvedBy: null,
        resolvedAt: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Logger l'alerte
      logger.error('🚨 CRITICAL ALERT', logEntry);

      // TODO: Envoyer notification (email, Slack, etc.)
      await this.notifyCriticalAlert(logEntry);

    } catch (error) {
      console.error('Erreur envoi alerte critique:', error);
    }
  }

  // Générer un ID d'alerte
  generateAlertId() {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Notifier l'alerte critique (à implémenter)
  async notifyCriticalAlert(logEntry) {
    // TODO: Implémenter la notification (email, Slack, webhook, etc.)
    console.log('📧 Notification alerte critique:', {
      alertId: logEntry.executionId,
      action: logEntry.action,
      message: logEntry.message,
      userId: logEntry.userId
    });
  }

  // Méthodes de logging pratiques
  debug(category, action, message, data) {
    return this.log(LOG_CONFIG.levels.DEBUG, category, action, message, data);
  }

  info(category, action, message, data) {
    return this.log(LOG_CONFIG.levels.INFO, category, action, message, data);
  }

  warn(category, action, message, data) {
    return this.log(LOG_CONFIG.levels.WARN, category, action, message, data);
  }

  error(category, action, message, data) {
    return this.log(LOG_CONFIG.levels.ERROR, category, action, message, data);
  }

  critical(category, action, message, data) {
    return this.log(LOG_CONFIG.levels.CRITICAL, category, action, message, data);
  }

  // Logging spécifique aux fonctions
  logFunctionStart(functionData = {}) {
    return this.info(
      LOG_CONFIG.categories.SYSTEM,
      LOG_CONFIG.actions.FUNCTION_START,
      `Function ${this.functionName} started`,
      {
        startTime: Date.now(),
        ...functionData
      }
    );
  }

  logFunctionEnd(result = {}, duration = null) {
    return this.info(
      LOG_CONFIG.categories.SYSTEM,
      LOG_CONFIG.actions.FUNCTION_END,
      `Function ${this.functionName} completed`,
      {
        endTime: Date.now(),
        duration: duration || (Date.now() - (this._functionStartTime || Date.now())),
        result: typeof result === 'object' ? result : { value: result }
      }
    );
  }

  logFunctionError(error, context = {}) {
    return this.error(
      LOG_CONFIG.categories.SYSTEM,
      LOG_CONFIG.actions.FUNCTION_ERROR,
      `Function ${this.functionName} failed: ${error.message}`,
      {
        error: {
          name: error.name,
          message: error.message,
          code: error.code,
          stack: error.stack
        },
        ...context
      }
    );
  }

  // Logging spécifique aux actions utilisateur
  logUserAction(userId, action, details = {}) {
    return this.info(
      LOG_CONFIG.categories.USER,
      action,
      `User action: ${action}`,
      {
        userId,
        ...details
      }
    );
  }

  logSecurityEvent(userId, action, details = {}) {
    return this.warn(
      LOG_CONFIG.categories.SECURITY,
      action,
      `Security event: ${action}`,
      {
        userId,
        severity: 'high',
        ...details
      }
    );
  }

  logPerformanceMetric(action, metrics = {}) {
    return this.info(
      LOG_CONFIG.categories.PERFORMANCE,
      action,
      `Performance metric: ${action}`,
      {
        metrics,
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime()
      }
    );
  }

  // Logging spécifique au business
  logBusinessEvent(userId, action, businessData = {}) {
    return this.info(
      LOG_CONFIG.categories.BUSINESS,
      action,
      `Business event: ${action}`,
      {
        userId,
        businessData,
        timestamp: Date.now()
      }
    );
  }

  // Définir le temps de début de fonction
  setFunctionStartTime() {
    this._functionStartTime = Date.now();
  }

  // Nettoyer les ressources
  cleanup() {
    if (batchTimeout) {
      clearTimeout(batchTimeout);
    }
    
    // Écrire les logs restants
    if (logBuffer.length > 0) {
      this.writeBatchToFirestore();
    }
  }
}

// Middleware pour ajouter le logging automatique aux fonctions
const createLoggingMiddleware = (options = {}) => {
  return (req, res, next) => {
    // Créer un logger avec le contexte de la requête
    const logger = new StructuredLogger({
      functionName: req.originalUrl || 'unknown',
      region: req.headers['x-region'] || 'unknown',
      executionId: req.headers['x-execution-id'] || undefined
    });

    // Ajouter le logger à la requête
    req.logger = logger;

    // Logger le début de la fonction
    logger.setFunctionStartTime();
    logger.logFunctionStart({
      method: req.method,
      url: req.originalUrl,
      userAgent: req.headers['user-agent'],
      ip: req.ip || req.connection.remoteAddress
    });

    // Intercepter la fin de la requête
    const originalSend = res.send;
    res.send = function(data) {
      // Logger la fin de la fonction
      const duration = Date.now() - logger._functionStartTime;
      logger.logFunctionEnd(data, duration);

      // Nettoyer
      logger.cleanup();

      // Appeler la méthode originale
      originalSend.call(this, data);
    };

    // Intercepter les erreurs
    const originalError = res.error || res.onerror;
    const errorHandler = (error) => {
      // Logger l'erreur
      logger.logFunctionError(error, {
        method: req.method,
        url: req.originalUrl,
        userAgent: req.headers['user-agent'],
        ip: req.ip || req.connection.remoteAddress
      });

      // Nettoyer
      logger.cleanup();

      // Appeler le gestionnaire d'erreur original
      if (originalError) {
        originalError.call(this, error);
      }
    };

    res.error = errorHandler;
    res.onerror = errorHandler;

    next();
  };
};

// Fonction pour créer un logger avec contexte
const createLogger = (context = {}) => {
  return new StructuredLogger(context);
};

// Logger global par défaut
const defaultLogger = new StructuredLogger();

// Nettoyer les logs à la fin du processus
process.on('SIGTERM', () => {
  defaultLogger.cleanup();
});

process.on('SIGINT', () => {
  defaultLogger.cleanup();
});

// Exporter les utilitaires
module.exports = {
  StructuredLogger,
  createLogger,
  createLoggingMiddleware,
  defaultLogger,
  LOG_CONFIG
};
