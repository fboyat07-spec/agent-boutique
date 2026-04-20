const { logger } = require("firebase-functions/v2");
const { costControlManager, COST_CONTROL_CONFIG } = require("./costControl");

// Middleware de contrôle des coûts
const createCostControlMiddleware = (functionName) => {
  return async (request, response, next) => {
    const startTime = Date.now();
    
    try {
      // Vérifier l'authentification
      if (!request.auth || !request.auth.uid) {
        return response.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const userId = request.auth.uid;
      
      // Vérifier si l'utilisateur est bloqué
      if (costControlManager.isUserBlocked(userId)) {
        const blocked = costControlManager.blockedUsers.get(userId);
        return response.status(429).json({
          success: false,
          error: 'User temporarily blocked due to cost limits',
          code: 'USER_BLOCKED',
          blockedUntil: blocked.blockedUntil,
          reason: blocked.reason
        });
      }

      // Vérifier les limites d'appels
      const limitCheck = await costControlManager.checkUserLimits(userId, functionName);
      
      if (!limitCheck.allowed) {
        const statusCode = limitCheck.blocked ? 429 : 429;
        
        return response.status(statusCode).json({
          success: false,
          error: limitCheck.reason,
          code: 'COST_LIMIT_EXCEEDED',
          details: limitCheck,
          timestamp: new Date().toISOString()
        });
      }

      // Optimiser les lectures Firestore si nécessaire
      if (request.data && request.data._optimizeReads) {
        const readOptimization = await costControlManager.optimizeFirestoreReads(
          userId, 
          functionName, 
          request.data._optimizeReads
        );
        
        if (!readOptimization.allowed) {
          return response.status(429).json({
            success: false,
            error: readOptimization.reason,
            code: 'READ_LIMIT_EXCEEDED',
            optimization: readOptimization.optimization
          });
        }
        
        // Ajouter les informations d'optimisation à la requête
        request._optimizedReads = readOptimization;
      }

      // Optimiser les écritures Firestore si nécessaire
      if (request.data && request.data._optimizeWrites) {
        const writeOptimization = await costControlManager.optimizeFirestoreWrites(
          userId, 
          functionName, 
          request.data._optimizeWrites
        );
        
        if (!writeOptimization.allowed) {
          return response.status(429).json({
            success: false,
            error: writeOptimization.reason,
            code: 'WRITE_LIMIT_EXCEEDED',
            optimization: writeOptimization.optimization
          });
        }
        
        // Ajouter les informations d'optimisation à la requête
        request._optimizedWrites = writeOptimization;
      }

      // Intercepter la réponse pour calculer les coûts
      const originalSend = response.send;
      const originalJson = response.json;
      
      response.send = (data) => {
        const duration = Date.now() - startTime;
        const statusCode = response.statusCode || 200;
        
        // Calculer et enregistrer les coûts
        recordOperationCosts(request, data, duration, statusCode);
        
        return originalSend.call(response, data);
      };
      
      response.json = (data) => {
        const duration = Date.now() - startTime;
        const statusCode = response.statusCode || 200;
        
        // Calculer et enregistrer les coûts
        recordOperationCosts(request, data, duration, statusCode);
        
        return originalJson.call(response, data);
      };

      // Continuer vers la fonction
      next();
      
    } catch (error) {
      logger.error('Erreur middleware contrôle coûts:', error);
      
      return response.status(500).json({
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        timestamp: new Date().toISOString()
      });
    }
  };

  // Estimer le nombre d'opérations Firestore
  estimateFirestoreOperations(request, response) {
    // Logique d'estimation basée sur la fonction et les données
    const functionName = request.functionName || 'unknown';
    const functionConfig = COST_CONTROL_CONFIG.functionLimits[functionName];
    
    if (!functionConfig) {
      return {
        reads: 1,
        writes: 1,
        deletes: 0,
        documentReads: 1,
        documentWrites: 1
      };
    }
    
    // Estimations par fonction
    const estimates = {
      addXp: {
        reads: 2,    // Lecture utilisateur + vérifications
        writes: 1,   // Mise à jour utilisateur
        deletes: 0,
        documentReads: 2,
        documentWrites: 1
      },
      completeMission: {
        reads: 3,    // Lecture utilisateur + mission + prérequis
        writes: 2,   // Mise à jour utilisateur + logs
        deletes: 0,
        documentReads: 3,
        documentWrites: 2
      },
      checkBadges: {
        reads: 4,    // Lecture utilisateur + badges + vérifications
        writes: 1,   // Mise à jour badges si nécessaire
        deletes: 0,
        documentReads: 4,
        documentWrites: 1
      },
      getUserProgress: {
        reads: 2,    // Lecture utilisateur + progression
        writes: 0,   // Pas d'écriture
        deletes: 0,
        documentReads: 2,
        documentWrites: 0
      },
      getAvailableMissions: {
        reads: 1,    // Lecture missions disponibles
        writes: 0,   // Pas d'écriture
        deletes: 0,
        documentReads: 1,
        documentWrites: 0
      }
    };
    
    return estimates[functionName] || {
      reads: 1,
      writes: 1,
      deletes: 0,
      documentReads: 1,
      documentWrites: 1
    };
  }
}

// Enregistrer les coûts d'opération
async function recordOperationCosts(request, responseData, duration, statusCode) {
  try {
    const userId = request.auth.uid;
    const functionName = request.functionName || 'unknown';
    
    // Estimer le nombre d'opérations Firestore
    const operationEstimate = estimateFirestoreOperations(request, responseData);
    
    // Calculer les coûts
    const operationCost = costControlManager.calculateOperationCost(
      operationEstimate.reads,
      operationEstimate.writes,
      operationEstimate.deletes,
      operationEstimate.documentReads,
      operationEstimate.documentWrites
    );
    
    // Enregistrer les coûts
    await costControlManager.recordUserCosts(userId, functionName, operationCost);
    
    // Logger les coûts pour le débogage
    logger.info('Coûts opération enregistrés:', {
      userId,
      functionName,
      duration,
      statusCode,
      operations: operationEstimate,
      costs: operationCost,
      optimizations: {
        reads: request._optimizedReads?.optimization,
        writes: request._optimizedWrites?.optimization
      }
    });
    
  } catch (error) {
    logger.error('Erreur enregistrement coûts:', error);
  }
}
};

module.exports = {
  createCostControlMiddleware
};
