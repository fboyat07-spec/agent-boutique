const { logger } = require("firebase-functions/v2");
const { advancedMonitoring, ADVANCED_MONITORING_CONFIG } = require("./advancedMonitoring");

// Middleware de monitoring pour les fonctions Firebase
const createMonitoringMiddleware = (functionName) => {
  return async (request, response, next) => {
    const startTime = Date.now();
    
    try {
      // Intercepter la réponse pour mesurer le temps
      const originalSend = response.send;
      const originalJson = response.json;
      
      response.send = (data) => {
        const duration = Date.now() - startTime;
        const statusCode = response.statusCode || 200;
        
        // Enregistrer les métriques
        if (statusCode < 400) {
          advancedMonitoring.recordSuccess(functionName, {
            duration,
            statusCode,
            dataSize: JSON.stringify(data).length
          });
        }
        
        advancedMonitoring.recordResponseTime(functionName, duration, statusCode);
        return originalSend.call(response, data);
      };
      
      response.json = (data) => {
        const duration = Date.now() - startTime;
        const statusCode = response.statusCode || 200;
        
        // Enregistrer les métriques
        if (statusCode < 400) {
          advancedMonitoring.recordSuccess(functionName, {
            duration,
            statusCode,
            dataSize: JSON.stringify(data).length
          });
        }
        
        advancedMonitoring.recordResponseTime(functionName, duration, statusCode);
        return originalJson.call(response, data);
      };
      
      next();
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Enregistrer l'erreur
      advancedMonitoring.recordError(functionName, error, {
        duration,
        userAgent: request.headers['user-agent'],
        ip: request.rawRequest?.ip
      });
      
      next(error);
    }
  };
};

module.exports = {
  createMonitoringMiddleware
};
