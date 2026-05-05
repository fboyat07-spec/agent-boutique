// ACTION 11 - Protection erreurs silencieuses

const BusinessLogger = require('./businessLogger');

// Wrapper pour protéger les fonctions critiques
function safeWrapper(functionName, fn, fallback = null) {
  return async (...args) => {
    try {
      const result = await fn(...args);
      return result;
    } catch (error) {
      console.log(`[${functionName.toUpperCase()}_ERROR]`, {
        error: error.message,
        stack: error.stack?.split('\n')[1], // Première ligne de stack seulement
        argsCount: args.length
      });
      
      BusinessLogger.logWebhookError(error.message, {
        context: `${functionName}_safe_wrapper`,
        argsCount: args.length
      });
      
      // Utiliser fallback si disponible
      if (fallback && typeof fallback === 'function') {
        try {
          const fallbackResult = await fallback(...args);
          console.log(`[${functionName.toUpperCase()}_FALLBACK_SUCCESS]`);
          return fallbackResult;
        } catch (fallbackError) {
          console.log(`[${functionName.toUpperCase()}_FALLBACK_FAILED]`, {
            error: fallbackError.message
          });
          return null;
        }
      }
      
      return null;
    }
  };
}

// Protection webhook WhatsApp
async function safeWebhookProcessing(webhookBody, processor) {
  const startTime = Date.now();
  
  try {
    console.log('[WEBHOOK_SAFE_START]', {
      bodySize: JSON.stringify(webhookBody).length,
      timestamp: new Date().toISOString()
    });
    
    const result = await processor(webhookBody);
    
    const duration = Date.now() - startTime;
    console.log('[WEBHOOK_SAFE_SUCCESS]', {
      duration,
      timestamp: new Date().toISOString()
    });
    
    return result;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.log('[WEBHOOK_SAFE_ERROR]', {
      error: error.message,
      duration,
      timestamp: new Date().toISOString()
    });
    
    BusinessLogger.logWebhookError(error.message, {
      context: 'webhook_safe_processing',
      duration
    });
    
    // Ne jamais propager l'erreur du webhook
    return { success: false, error: error.message };
  }
}

// Protection scheduler
async function safeSchedulerRun(schedulerName, runFunction) {
  const startTime = Date.now();
  let processed = 0;
  let sent = 0;
  let errors = 0;
  
  try {
    console.log(`[${schedulerName.toUpperCase()}_SAFE_START]`, {
      timestamp: new Date().toISOString()
    });
    
    const result = await runFunction();
    
    // Extraire stats si disponibles
    if (result && typeof result === 'object') {
      processed = result.processed || 0;
      sent = result.sent || 0;
      errors = result.errors || 0;
    }
    
    const duration = Date.now() - startTime;
    
    console.log(`[${schedulerName.toUpperCase()}_SAFE_SUCCESS]`, {
      processed,
      sent,
      errors,
      duration,
      timestamp: new Date().toISOString()
    });
    
    BusinessLogger.logSchedulerRunSummary(schedulerName, processed, sent, errors, duration);
    
    return result;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    errors++;
    
    console.log(`[${schedulerName.toUpperCase()}_SAFE_ERROR]`, {
      error: error.message,
      processed,
      sent,
      errors,
      duration,
      timestamp: new Date().toISOString()
    });
    
    BusinessLogger.logWebhookError(error.message, {
      context: `${schedulerName}_safe_run`,
      duration,
      processed,
      sent,
      errors
    });
    
    // Retourner stats même en cas d'erreur
    return { processed, sent, errors, error: error.message };
  }
}

// Protection envoi message
async function safeMessageSend(phone, message, senderFunction, priority = 'normal') {
  const startTime = Date.now();
  
  try {
    console.log('[MESSAGE_SAFE_START]', {
      phone: phone.substring(0, -4) + '****',
      messageLength: message.length,
      priority,
      timestamp: new Date().toISOString()
    });
    
    const result = await senderFunction(phone, message);
    
    const duration = Date.now() - startTime;
    console.log('[MESSAGE_SAFE_SUCCESS]', {
      phone: phone.substring(0, -4) + '****',
      duration,
      priority,
      timestamp: new Date().toISOString()
    });
    
    return result;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    console.log('[MESSAGE_SAFE_ERROR]', {
      phone: phone.substring(0, -4) + '****',
      error: error.message,
      duration,
      priority,
      timestamp: new Date().toISOString()
    });
    
    BusinessLogger.logWebhookError(error.message, {
      context: 'message_safe_send',
      phone: phone.substring(0, -4) + '****',
      priority,
      duration
    });
    
    // Ne jamais propager l'erreur d'envoi de message
    return { success: false, error: error.message };
  }
}

// Protection base de données
async function safeDatabaseOperation(operationName, dbFunction) {
  const startTime = Date.now();
  
  try {
    console.log(`[DB_SAFE_START_${operationName.toUpperCase()}]`, {
      timestamp: new Date().toISOString()
    });
    
    const result = await dbFunction();
    
    const duration = Date.now() - startTime;
    console.log(`[DB_SAFE_SUCCESS_${operationName.toUpperCase()}]`, {
      duration,
      timestamp: new Date().toISOString()
    });
    
    return result;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    console.log(`[DB_SAFE_ERROR_${operationName.toUpperCase()}]`, {
      error: error.message,
      duration,
      timestamp: new Date().toISOString()
    });
    
    BusinessLogger.logWebhookError(error.message, {
      context: `db_safe_${operationName}`,
      duration
    });
    
    // Retourner null pour les erreurs DB
    return null;
  }
}

// Protection API externe
async function safeAPICall(apiName, apiFunction, fallbackData = null) {
  const startTime = Date.now();
  
  try {
    console.log(`[API_SAFE_START_${apiName.toUpperCase()}]`, {
      timestamp: new Date().toISOString()
    });
    
    const result = await apiFunction();
    
    const duration = Date.now() - startTime;
    console.log(`[API_SAFE_SUCCESS_${apiName.toUpperCase()}]`, {
      duration,
      timestamp: new Date().toISOString()
    });
    
    return result;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    console.log(`[API_SAFE_ERROR_${apiName.toUpperCase()}]`, {
      error: error.message,
      duration,
      timestamp: new Date().toISOString()
    });
    
    BusinessLogger.logWebhookError(error.message, {
      context: `api_safe_${apiName}`,
      duration
    });
    
    // Utiliser fallback si disponible
    if (fallbackData !== null) {
      console.log(`[API_SAFE_FALLBACK_${apiName.toUpperCase()}]`, {
        fallbackType: typeof fallbackData
      });
      return fallbackData;
    }
    
    return null;
  }
}

// Wrapper générique pour promesses
function safePromise(promise, context = 'unknown') {
  return promise
    .then(result => {
      console.log(`[SAFE_PROMISE_SUCCESS_${context.toUpperCase()}]`);
      return result;
    })
    .catch(error => {
      console.log(`[SAFE_PROMISE_ERROR_${context.toUpperCase()}]`, {
        error: error.message
      });
      
      BusinessLogger.logWebhookError(error.message, {
        context: `safe_promise_${context}`
      });
      
      return null;
    });
}

// Stats de protection
function getProtectionStats() {
  return {
    wrappersActive: [
      'webhook',
      'scheduler', 
      'message',
      'database',
      'api'
    ],
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  };
}

// Health check des protections
function protectionHealthCheck() {
  return {
    status: 'healthy',
    protections: getProtectionStats(),
    recommendations: []
  };
}

module.exports = {
  safeWrapper,
  safeWebhookProcessing,
  safeSchedulerRun,
  safeMessageSend,
  safeDatabaseOperation,
  safeAPICall,
  safePromise,
  getProtectionStats,
  protectionHealthCheck
};
