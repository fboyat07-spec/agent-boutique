const { logger } = require("firebase-functions/v2");
const { productionMonitoringManager } = require("./productionMonitoring");

// Middleware de monitoring production
const createProductionMonitoringMiddleware = (functionName) => {
  return async (request, response, next) => {
    const startTime = Date.now();
    const userId = request.auth?.uid || 'anonymous';
    const requestId = request.headers['x-request-id'] || productionMonitoringManager.generateRequestId();
    
    // Ajouter les informations de monitoring à la requête
    request.monitoring = {
      startTime,
      requestId,
      functionName,
      userId
    };
    
    // Intercepter la réponse pour enregistrer les métriques
    const originalSend = response.send;
    const originalJson = response.json;
    
    const recordMetrics = (data, statusCode = 200) => {
      const endTime = Date.now();
      const duration = endTime - startTime;
      const status = statusCode >= 400 ? 'error' : 'success';
      const error = statusCode >= 400 ? new Error(`HTTP ${statusCode}`) : null;
      
      // Enregistrer l'exécution
      productionMonitoringManager.recordExecution(
        functionName,
        userId,
        'function_call',
        duration,
        status,
        error,
        {
          requestId,
          statusCode,
          userAgent: request.headers['user-agent'],
          ip: request.headers['x-forwarded-for'] || request.ip,
          region: process.env.FUNCTION_REGION || 'europe-west1',
          requestData: request.data,
          responseData: data
        }
      );
    };
    
    response.send = (data) => {
      recordMetrics(data, response.statusCode || 200);
      return originalSend.call(response, data);
    };
    
    response.json = (data) => {
      recordMetrics(data, response.statusCode || 200);
      return originalJson.call(response, data);
    };
    
    // Intercepter les erreurs
    const originalOnError = response.onerror;
    response.onerror = (error) => {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      productionMonitoringManager.recordExecution(
        functionName,
        userId,
        'function_call',
        duration,
        'error',
        error,
        {
          requestId,
          errorType: 'response_error',
          userAgent: request.headers['user-agent'],
          ip: request.headers['x-forwarded-for'] || request.ip
        }
      );
      
      if (originalOnError) {
        originalOnError.call(response, error);
      }
    };
    
    // Continuer vers la fonction
    next();
  };
};

// Exporter le middleware
module.exports = {
  createProductionMonitoringMiddleware
};
