// ACTION 8 - Protection anti erreur silencieuse

const { getFlag } = require('./envFlags');
const { logError } = require('./testModeLogger');
const { markTraceError } = require('./traceManager');

// Wrapper pour protection anti erreur silencieuse (SAFE - try/catch + logging)
class ErrorWrapper {
  constructor() {
    this.enabled = getFlag('AGENT_TEST_MODE');
    this.stats = {
      totalWraps: 0,
      errorsCaught: 0,
      successfulExecutions: 0,
      byType: new Map()
    };
    
    console.log('[ERROR_WRAPPER_INITIALIZED]', {
      enabled: this.enabled
    });
  }
  
  // Wrapper générique pour fonction avec protection erreur
  wrapFunction(functionName, func, context = {}) {
    if (!this.enabled) {
      return func; // Retourner la fonction originale si mode test désactivé
    }
    
    return async (...args) => {
      this.stats.totalWraps++;
      
      try {
        console.log(`[ERROR_WRAPPER_EXECUTING]`, {
          functionName,
          argsCount: args.length,
          context
        });
        
        const result = await func(...args);
        
        this.stats.successfulExecutions++;
        
        console.log(`[ERROR_WRAPPER_SUCCESS]`, {
          functionName,
          executionTime: Date.now()
        });
        
        return result;
        
      } catch (error) {
        this.stats.errorsCaught++;
        
        // Stats par type
        const errorType = error.constructor.name;
        this.stats.byType.set(errorType, (this.stats.byType.get(errorType) || 0) + 1);
        
        console.log(`[ERROR_WRAPPER_CAUGHT]`, {
          functionName,
          errorType,
          errorMessage: error.message,
          stack: error.stack?.substring(0, 500) // Limiter la taille du stack
        });
        
        // Logger l'erreur
        const phone = this.extractPhoneFromArgs(args);
        const tenant_id = this.extractTenantFromArgs(args);
        const lead_id = this.extractLeadIdFromArgs(args);
        
        logError(functionName, phone, tenant_id, lead_id, error, {
          args: args.map(arg => this.sanitizeArg(arg)),
          context
        });
        
        // Marquer l'erreur dans la trace
        const traceId = this.extractTraceIdFromArgs(args);
        if (traceId) {
          markTraceError(traceId, error, { functionName, context });
        }
        
        // Retourner une valeur par défaut selon le type de fonction
        const fallbackResult = this.getFallbackResult(functionName, error);
        
        console.log(`[ERROR_WRAPPER_FALLBACK]`, {
          functionName,
          fallbackResult,
          errorType
        });
        
        return fallbackResult;
      }
    };
  }
  
  // Wrapper pour webhook
  wrapWebhook(webhookHandler) {
    if (!this.enabled) {
      return webhookHandler;
    }
    
    return async (req, res) => {
      const functionName = 'webhook_handler';
      
      try {
        console.log(`[ERROR_WRAPPER_WEBHOOK_START]`, {
          method: req.method,
          url: req.url,
          bodySize: JSON.stringify(req.body).length
        });
        
        const result = await webhookHandler(req, res);
        
        this.stats.successfulExecutions++;
        
        console.log(`[ERROR_WRAPPER_WEBHOOK_SUCCESS]`, {
          statusCode: res.statusCode
        });
        
        return result;
        
      } catch (error) {
        this.stats.errorsCaught++;
        
        console.log(`[ERROR_WRAPPER_WEBHOOK_ERROR]`, {
          errorType: error.constructor.name,
          errorMessage: error.message,
          body: this.sanitizeArg(req.body)
        });
        
        // Logger l'erreur
        logError(functionName, null, null, null, error, {
          method: req.method,
          url: req.url,
          body: this.sanitizeArg(req.body)
        });
        
        // Répondre avec erreur 500 mais avec détails en mode test
        if (!res.headersSent) {
          res.status(500).json({
            error: 'webhook_error',
            message: 'Internal server error in webhook',
            testMode: true,
            details: {
              errorType: error.constructor.name,
              errorMessage: error.message
            }
          });
        }
        
        return null;
      }
    };
  }
  
  // Wrapper pour envoi de message
  wrapMessageSender(messageSender) {
    if (!this.enabled) {
      return messageSender;
    }
    
    return async (phone, message, options = {}) => {
      const functionName = 'message_sender';
      
      try {
        console.log(`[ERROR_WRAPPER_MESSAGE_SEND_START]`, {
          phone: this.maskPhone(phone),
          messageLength: message?.length || 0,
          options
        });
        
        const result = await messageSender(phone, message, options);
        
        this.stats.successfulExecutions++;
        
        console.log(`[ERROR_WRAPPER_MESSAGE_SEND_SUCCESS]`, {
          phone: this.maskPhone(phone),
          result: result ? 'success' : 'failed'
        });
        
        return result;
        
      } catch (error) {
        this.stats.errorsCaught++;
        
        console.log(`[ERROR_WRAPPER_MESSAGE_SEND_ERROR]`, {
          phone: this.maskPhone(phone),
          errorType: error.constructor.name,
          errorMessage: error.message
        });
        
        // Logger l'erreur
        logError(functionName, phone, options.tenant_id, options.lead_id, error, {
          messageLength: message?.length || 0,
          options
        });
        
        // Retourner fallback pour message
        return {
          success: false,
          error: error.message,
          testMode: true,
          fallback: 'message_not_sent'
        };
      }
    };
  }
  
  // Wrapper pour scheduler
  wrapScheduler(schedulerFunction) {
    if (!this.enabled) {
      return schedulerFunction;
    }
    
    return async (...args) => {
      const functionName = 'scheduler_function';
      
      try {
        console.log(`[ERROR_WRAPPER_SCHEDULER_START]`, {
          argsCount: args.length
        });
        
        const result = await schedulerFunction(...args);
        
        this.stats.successfulExecutions++;
        
        console.log(`[ERROR_WRAPPER_SCHEDULER_SUCCESS]`, {
          result: result ? 'completed' : 'failed'
        });
        
        return result;
        
      } catch (error) {
        this.stats.errorsCaught++;
        
        console.log(`[ERROR_WRAPPER_SCHEDULER_ERROR]`, {
          errorType: error.constructor.name,
          errorMessage: error.message
        });
        
        // Logger l'erreur
        logError(functionName, null, null, null, error, {
          args: args.map(arg => this.sanitizeArg(arg))
        });
        
        // Ne pas arrêter le scheduler en cas d'erreur
        console.log(`[ERROR_WRAPPER_SCHEDULER_CONTINUE]`, {
          message: 'Scheduler continues despite error'
        });
        
        return null;
      }
    };
  }
  
  // Obtenir les stats du wrapper
  getWrapperStats() {
    if (!this.enabled) {
      return { enabled: false };
    }
    
    const totalExecutions = this.stats.totalWraps;
    const errorRate = totalExecutions > 0 ? 
      (this.stats.errorsCaught / totalExecutions) * 100 : 0;
    
    const byTypeStats = {};
    for (const [errorType, count] of this.stats.byType.entries()) {
      byTypeStats[errorType] = count;
    }
    
    return {
      enabled: this.enabled,
      stats: {
        totalWraps: this.stats.totalWraps,
        errorsCaught: this.stats.errorsCaught,
        successfulExecutions: this.stats.successfulExecutions,
        errorRate: Math.round(errorRate * 100) / 100
      },
      byType: byTypeStats,
      uptime: process.uptime()
    };
  }
  
  // Obtenir le rapport d'erreurs
  getErrorReport() {
    if (!this.enabled) {
      return { enabled: false };
    }
    
    const stats = this.getWrapperStats();
    
    // Analyser les types d'erreurs
    const errorAnalysis = this.analyzeErrors();
    
    // Recommandations
    const recommendations = this.generateRecommendations(stats, errorAnalysis);
    
    return {
      enabled: this.enabled,
      stats: stats.stats,
      errorAnalysis,
      recommendations,
      metadata: {
        generated_at: new Date(),
        test_mode: true
      }
    };
  }
  
  // Analyser les erreurs
  analyzeErrors() {
    const analysis = {
      mostCommonError: null,
      errorDistribution: {},
      criticalErrors: 0
    };
    
    let maxCount = 0;
    
    for (const [errorType, count] of this.stats.byType.entries()) {
      analysis.errorDistribution[errorType] = count;
      
      if (count > maxCount) {
        maxCount = count;
        analysis.mostCommonError = errorType;
      }
      
      // Erreurs critiques
      if (errorType.includes('TypeError') || errorType.includes('ReferenceError')) {
        analysis.criticalErrors += count;
      }
    }
    
    return analysis;
  }
  
  // Générer des recommandations
  generateRecommendations(stats, errorAnalysis) {
    const recommendations = [];
    
    if (stats.stats.errorRate > 20) {
      recommendations.push('High error rate detected - review code quality and input validation');
    }
    
    if (errorAnalysis.criticalErrors > 0) {
      recommendations.push('Critical errors found - fix undefined/null reference errors');
    }
    
    if (errorAnalysis.mostCommonError) {
      recommendations.push(`Most common error: ${errorAnalysis.mostCommonError} - investigate pattern`);
    }
    
    if (stats.stats.totalWraps < 10) {
      recommendations.push('Low test coverage - run more test scenarios');
    }
    
    return recommendations;
  }
  
  // Obtenir la valeur de fallback selon le type de fonction
  getFallbackResult(functionName, error) {
    const fallbacks = {
      'webhook_handler': { success: false, error: error.message, testMode: true },
      'message_sender': { success: false, error: error.message, testMode: true },
      'scheduler_function': null,
      'lead_processor': { success: false, error: error.message, testMode: true },
      'payment_handler': { success: false, error: error.message, testMode: true }
    };
    
    return fallbacks[functionName] || { 
      success: false, 
      error: error.message, 
      testMode: true,
      fallback: true 
    };
  }
  
  // Extraire le téléphone des arguments
  extractPhoneFromArgs(args) {
    for (const arg of args) {
      if (typeof arg === 'object' && arg !== null) {
        if (arg.phone) return arg.phone;
        if (arg.body && arg.body.phone) return arg.body.phone;
      }
      if (typeof arg === 'string' && /^\d+$/.test(arg)) {
        return arg;
      }
    }
    return null;
  }
  
  // Extraire le tenant_id des arguments
  extractTenantFromArgs(args) {
    for (const arg of args) {
      if (typeof arg === 'object' && arg !== null) {
        if (arg.tenant_id) return arg.tenant_id;
        if (arg.body && arg.body.tenant_id) return arg.body.tenant_id;
        if (arg.query && arg.query.tenant_id) return arg.query.tenant_id;
      }
    }
    return null;
  }
  
  // Extraire le lead_id des arguments
  extractLeadIdFromArgs(args) {
    for (const arg of args) {
      if (typeof arg === 'object' && arg !== null) {
        if (arg.lead_id) return arg.lead_id;
        if (arg.body && arg.body.lead_id) return arg.body.lead_id;
        if (arg.id) return arg.id;
      }
    }
    return null;
  }
  
  // Extraire le trace_id des arguments
  extractTraceIdFromArgs(args) {
    for (const arg of args) {
      if (typeof arg === 'object' && arg !== null) {
        if (arg.traceId) return arg.traceId;
        if (arg.trace_id) return arg.trace_id;
      }
    }
    return null;
  }
  
  // Nettoyer un argument pour le logging
  sanitizeArg(arg) {
    if (!arg || typeof arg !== 'object') {
      return arg;
    }
    
    const sanitized = { ...arg };
    
    // Masquer les champs sensibles
    if (sanitized.phone) {
      sanitized.phone = this.maskPhone(sanitized.phone);
    }
    
    if (sanitized.password) {
      sanitized.password = '****';
    }
    
    if (sanitized.token) {
      sanitized.token = '****';
    }
    
    // Limiter la taille des objets
    const jsonStr = JSON.stringify(sanitized);
    if (jsonStr.length > 1000) {
      return { ...sanitized, _truncated: true };
    }
    
    return sanitized;
  }
  
  // Masquer téléphone pour logs
  maskPhone(phone) {
    if (!phone || typeof phone !== 'string') return 'unknown';
    return phone.slice(0, -4) + '****';
  }
  
  // Réinitialiser les stats
  resetStats() {
    this.stats = {
      totalWraps: 0,
      errorsCaught: 0,
      successfulExecutions: 0,
      byType: new Map()
    };
    
    console.log('[ERROR_WRAPPER_STATS_RESET]');
  }
}

// Instance globale du wrapper
if (!global.errorWrapper) {
  global.errorWrapper = new ErrorWrapper();
}

// Fonctions principales
function wrapFunction(functionName, func, context) {
  return global.errorWrapper.wrapFunction(functionName, func, context);
}

function wrapWebhook(webhookHandler) {
  return global.errorWrapper.wrapWebhook(webhookHandler);
}

function wrapMessageSender(messageSender) {
  return global.errorWrapper.wrapMessageSender(messageSender);
}

function wrapScheduler(schedulerFunction) {
  return global.errorWrapper.wrapScheduler(schedulerFunction);
}

// Stats et monitoring
function getWrapperStats() {
  return global.errorWrapper.getWrapperStats();
}

function getErrorReport() {
  return global.errorWrapper.getErrorReport();
}

// Administration
function resetWrapperStats() {
  return global.errorWrapper.resetStats();
}

module.exports = {
  wrapFunction,
  wrapWebhook,
  wrapMessageSender,
  wrapScheduler,
  getWrapperStats,
  getErrorReport,
  resetWrapperStats,
  ErrorWrapper
};
