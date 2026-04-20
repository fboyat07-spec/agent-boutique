const { logger } = require("firebase-functions/v2");
const admin = require("firebase-admin");

const db = admin.firestore();

// Configuration de l'idempotence
const IDEMPOTENCY_CONFIG = {
  // Collection pour stocker les actions récentes
  collectionName: 'recentActions',
  
  // TTL pour les actions (24 heures)
  ttlMs: 24 * 60 * 60 * 1000,
  
  // Actions qui nécessitent l'idempotence
  idempotentActions: [
    'addXp',
    'completeMission',
    'checkBadges',
    'unlockBadge',
    'updateStreak',
    'purchaseItem',
    'useItem'
  ],
  
  // Configuration par action
  actionConfig: {
    addXp: {
      ttlMs: 5 * 60 * 1000,        // 5 minutes
      maxRetries: 3,
      checkWindowMs: 30 * 1000      // 30 secondes
    },
    completeMission: {
      ttlMs: 10 * 60 * 1000,       // 10 minutes
      maxRetries: 5,
      checkWindowMs: 60 * 1000      // 1 minute
    },
    checkBadges: {
      ttlMs: 2 * 60 * 1000,        // 2 minutes
      maxRetries: 2,
      checkWindowMs: 15 * 1000      // 15 secondes
    }
  }
};

// Classe pour gérer l'idempotence
class IdempotencyManager {
  constructor() {
    this.metrics = {
      totalChecks: 0,
      duplicatesFound: 0,
      duplicatesBlocked: 0,
      averageCheckTime: 0,
      lastCleanup: new Date()
    };
  }

  // Générer une clé d'idempotence
  generateIdempotencyKey(userId, action, data = {}) {
    const timestamp = Date.now();
    const dataHash = this.hashData(data);
    
    return `${userId}_${action}_${timestamp}_${dataHash}`;
  }

  // Hasher les données pour créer une clé unique
  hashData(data) {
    const crypto = require('crypto');
    const dataString = JSON.stringify(data, Object.keys(data).sort());
    return crypto.createHash('sha256').update(dataString).digest('hex').substring(0, 16);
  }

  // Vérifier si une action est déjà en cours
  async checkPendingAction(idempotencyKey, action) {
    const startTime = Date.now();
    this.metrics.totalChecks++;

    try {
      const actionDoc = await db.collection(IDEMPOTENCY_CONFIG.collectionName)
        .doc(idempotencyKey)
        .get();

      if (actionDoc.exists) {
        const actionData = actionDoc.data();
        
        // Vérifier si l'action est en cours ou complétée
        if (actionData.status === 'pending' || actionData.status === 'completed') {
          this.metrics.duplicatesFound++;
          
          logger.warn('🔄 Duplicate action detected', {
            idempotencyKey,
            action,
            status: actionData.status,
            createdAt: actionData.createdAt,
            userId: actionData.userId
          });

          return {
            isDuplicate: true,
            status: actionData.status,
            data: actionData,
            message: `Action already ${actionData.status}`
          };
        }
      }

      return { isDuplicate: false };

    } catch (error) {
      logger.error('❌ Error checking pending action', {
        idempotencyKey,
        action,
        error: error.message
      });

      return { isDuplicate: false, error: error.message };
    } finally {
      const checkTime = Date.now() - startTime;
      this.updateAverageCheckTime(checkTime);
    }
  }

  // Marquer une action comme en cours
  async markActionPending(idempotencyKey, userId, action, data = {}) {
    try {
      const actionData = {
        idempotencyKey,
        userId,
        action,
        data,
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        retryCount: 0,
        lastRetry: null,
        metadata: {
          userAgent: data.userAgent,
          ip: data.ip,
          region: data.region
        }
      };

      await db.collection(IDEMPOTENCY_CONFIG.collectionName)
        .doc(idempotencyKey)
        .set(actionData);

      logger.info('📝 Action marked as pending', {
        idempotencyKey,
        userId,
        action
      });

      return { success: true };

    } catch (error) {
      logger.error('❌ Error marking action pending', {
        idempotencyKey,
        userId,
        action,
        error: error.message
      });

      return { success: false, error: error.message };
    }
  }

  // Marquer une action comme complétée
  async markActionCompleted(idempotencyKey, result = {}) {
    try {
      const updateData = {
        status: 'completed',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        result: result,
        processingTime: Date.now()
      };

      await db.collection(IDEMPOTENCY_CONFIG.collectionName)
        .doc(idempotencyKey)
        .update(updateData);

      logger.info('✅ Action marked as completed', {
        idempotencyKey,
        result
      });

      return { success: true };

    } catch (error) {
      logger.error('❌ Error marking action completed', {
        idempotencyKey,
        error: error.message
      });

      return { success: false, error: error.message };
    }
  }

  // Marquer une action comme échouée
  async markActionFailed(idempotencyKey, error) {
    try {
      const updateData = {
        status: 'failed',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        failedAt: admin.firestore.FieldValue.serverTimestamp(),
        error: {
          message: error.message,
          stack: error.stack,
          code: error.code
        }
      };

      await db.collection(IDEMPOTENCY_CONFIG.collectionName)
        .doc(idempotencyKey)
        .update(updateData);

      logger.error('❌ Action marked as failed', {
        idempotencyKey,
        error: error.message
      });

      return { success: true };

    } catch (updateError) {
      logger.error('❌ Error marking action failed', {
        idempotencyKey,
        updateError: updateError.message
      });

      return { success: false, error: updateError.message };
    }
  }

  // Nettoyer les anciennes actions
  async cleanupOldActions() {
    try {
      const cutoffTime = new Date(Date.now() - IDEMPOTENCY_CONFIG.ttlMs);
      
      const oldActionsSnapshot = await db.collection(IDEMPOTENCY_CONFIG.collectionName)
        .where('createdAt', '<', cutoffTime)
        .get();

      const batch = db.batch();
      let deletedCount = 0;

      oldActionsSnapshot.forEach(doc => {
        batch.delete(doc.ref);
        deletedCount++;
      });

      await batch.commit();

      this.metrics.lastCleanup = new Date();

      logger.info('🧹 Cleaned up old actions', {
        deletedCount,
        cutoffTime
      });

      return { success: true, deletedCount };

    } catch (error) {
      logger.error('❌ Error cleaning up old actions', {
        error: error.message
      });

      return { success: false, error: error.message };
    }
  }

  // Obtenir les actions récentes d'un utilisateur
  async getRecentUserActions(userId, action = null, limit = 10) {
    try {
      let query = db.collection(IDEMPOTENCY_CONFIG.collectionName)
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(limit);

      if (action) {
        query = query.where('action', '==', action);
      }

      const snapshot = await query.get();
      const actions = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      return { success: true, actions };

    } catch (error) {
      logger.error('❌ Error getting recent user actions', {
        userId,
        action,
        error: error.message
      });

      return { success: false, error: error.message };
    }
  }

  // Middleware d'idempotence
  createIdempotencyMiddleware(action) {
    return async (request, response, next) => {
      // Vérifier si l'action nécessite l'idempotence
      if (!IDEMPOTENCY_CONFIG.idempotentActions.includes(action)) {
        return next();
      }

      // Générer la clé d'idempotence
      const userId = request.auth?.uid;
      const requestId = request.headers['x-request-id'] || request.headers['x-idempotency-key'];
      
      if (!userId) {
        return next();
      }

      // Utiliser le requestId fourni ou en générer un
      const idempotencyKey = requestId || 
        this.generateIdempotencyKey(userId, action, request.data);

      // Ajouter la clé à la requête
      request.idempotencyKey = idempotencyKey;
      request.idempotencyAction = action;

      try {
        // Vérifier si l'action est déjà en cours
        const duplicateCheck = await this.checkPendingAction(idempotencyKey, action);
        
        if (duplicateCheck.isDuplicate) {
          this.metrics.duplicatesBlocked++;
          
          // Si l'action est complétée, retourner le résultat
          if (duplicateCheck.status === 'completed') {
            return response.status(200).json({
              success: true,
              data: duplicateCheck.data.result,
              idempotency: {
                isDuplicate: true,
                originalRequest: duplicateCheck.data
              }
            });
          }
          
          // Si l'action est en cours, retourner 202
          if (duplicateCheck.status === 'pending') {
            return response.status(202).json({
              success: false,
              message: 'Action already in progress',
              idempotency: {
                isDuplicate: true,
                status: 'pending'
              }
            });
          }
        }

        // Marquer l'action comme en cours
        await this.markActionPending(idempotencyKey, userId, action, {
          userAgent: request.headers['user-agent'],
          ip: request.rawRequest?.ip,
          region: request.rawRequest?.headers['x-region']
        });

        // Intercepter la réponse pour marquer comme complétée/échouée
        const originalSend = response.send;
        const originalJson = response.json;

        const markCompleted = (data) => {
          this.markActionCompleted(idempotencyKey, data);
        };

        const markFailed = (error) => {
          this.markActionFailed(idempotencyKey, error);
        };

        response.send = (data) => {
          if (response.statusCode < 400) {
            markCompleted(data);
          } else {
            markFailed(new Error(data));
          }
          return originalSend.call(response, data);
        };

        response.json = (data) => {
          if (response.statusCode < 400) {
            markCompleted(data);
          } else {
            markFailed(new Error(data));
          }
          return originalJson.call(response, data);
        };

        next();

      } catch (error) {
        logger.error('❌ Idempotency middleware error', {
          action,
          idempotencyKey,
          error: error.message
        });

        return response.status(500).json({
          success: false,
          error: 'Idempotency check failed',
          idempotencyKey
        });
      }
    };
  }

  // Mettre à jour le temps moyen de vérification
  updateAverageCheckTime(checkTime) {
    const total = this.metrics.averageCheckTime * (this.metrics.totalChecks - 1) + checkTime;
    this.metrics.averageCheckTime = total / this.metrics.totalChecks;
  }

  // Obtenir les métriques
  getMetrics() {
    return {
      ...this.metrics,
      uptime: Date.now() - this.metrics.lastCleanup.getTime()
    };
  }

  // Réinitialiser les métriques
  resetMetrics() {
    this.metrics = {
      totalChecks: 0,
      duplicatesFound: 0,
      duplicatesBlocked: 0,
      averageCheckTime: 0,
      lastCleanup: new Date()
    };
  }

  // Health check
  healthCheck() {
    const metrics = this.getMetrics();
    const duplicateRate = metrics.totalChecks > 0 
      ? (metrics.duplicatesFound / metrics.totalChecks) * 100 
      : 0;

    return {
      status: duplicateRate < 20 ? 'healthy' : 'degraded',
      metrics,
      duplicateRate: Math.round(duplicateRate * 100) / 100,
      timestamp: new Date()
    };
  }
}

// Instance globale du gestionnaire d'idempotence
const idempotencyManager = new IdempotencyManager();

// Nettoyage périodique
setInterval(async () => {
  await idempotencyManager.cleanupOldActions();
}, 60 * 60 * 1000); // Nettoyer toutes les heures

// Exporter les utilitaires
module.exports = {
  IdempotencyManager,
  idempotencyManager,
  IDEMPOTENCY_CONFIG
};
