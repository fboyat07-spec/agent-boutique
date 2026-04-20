import { useState, useCallback, useRef } from 'react';

// Hook pour gérer l'idempotence côté frontend
const useIdempotency = () => {
  const [pendingRequests, setPendingRequests] = useState(new Map());
  const [requestHistory, setRequestHistory] = useState([]);
  const requestCache = useRef(new Map());

  // Générer un ID de requête unique
  const generateRequestId = useCallback((userId, action, data = {}) => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const dataHash = hashData(data);
    
    return `${userId}_${action}_${timestamp}_${random}_${dataHash}`;
  }, []);

  // Hasher les données pour créer une clé unique
  const hashData = useCallback((data) => {
    const dataString = JSON.stringify(data, Object.keys(data).sort());
    let hash = 0;
    for (let i = 0; i < dataString.length; i++) {
      const char = dataString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }, []);

  // Vérifier si une requête est en cours
  const isRequestPending = useCallback((requestId) => {
    return pendingRequests.has(requestId);
  }, [pendingRequests]);

  // Marquer une requête comme en cours
  const markRequestPending = useCallback((requestId, promise) => {
    setPendingRequests(prev => new Map(prev.set(requestId, {
      promise,
      timestamp: Date.now(),
      status: 'pending'
    })));
  }, []);

  // Marquer une requête comme complétée
  const markRequestCompleted = useCallback((requestId, result) => {
    setPendingRequests(prev => {
      const newMap = new Map(prev);
      const request = newMap.get(requestId);
      
      if (request) {
        newMap.set(requestId, {
          ...request,
          status: 'completed',
          result,
          completedAt: Date.now()
        });
      }
      
      return newMap;
    });

    // Ajouter à l'historique
    setRequestHistory(prev => [
      {
        requestId,
        status: 'completed',
        result,
        timestamp: Date.now()
      },
      ...prev.slice(0, 49) // Garder les 50 dernières
    ]);

    // Nettoyer après 5 secondes
    setTimeout(() => {
      setPendingRequests(prev => {
        const newMap = new Map(prev);
        newMap.delete(requestId);
        return newMap;
      });
    }, 5000);
  }, []);

  // Marquer une requête comme échouée
  const markRequestFailed = useCallback((requestId, error) => {
    setPendingRequests(prev => {
      const newMap = new Map(prev);
      const request = newMap.get(requestId);
      
      if (request) {
        newMap.set(requestId, {
          ...request,
          status: 'failed',
          error,
          failedAt: Date.now()
        });
      }
      
      return newMap;
    });

    // Ajouter à l'historique
    setRequestHistory(prev => [
      {
        requestId,
        status: 'failed',
        error,
        timestamp: Date.now()
      },
      ...prev.slice(0, 49)
    ]);

    // Nettoyer après 5 secondes
    setTimeout(() => {
      setPendingRequests(prev => {
        const newMap = new Map(prev);
        newMap.delete(requestId);
        return newMap;
      });
    }, 5000);
  }, []);

  // Exécuter une requête avec idempotence
  const executeIdempotentRequest = useCallback(async (
    requestFunction,
    userId,
    action,
    data = {},
    options = {}
  ) => {
    const {
      timeout = 30000, // 30 secondes
      retries = 0,
      useCache = true,
      cacheTTL = 30000 // 30 secondes
    } = options;

    // Générer la clé d'idempotence
    const requestId = generateRequestId(userId, action, data);
    
    // Vérifier le cache
    if (useCache) {
      const cached = requestCache.current.get(requestId);
      if (cached && (Date.now() - cached.timestamp < cacheTTL)) {
        console.log(`📋 Cache hit for ${action}`, { requestId });
        return cached.result;
      }
    }

    // Vérifier si la requête est déjà en cours
    if (isRequestPending(requestId)) {
      console.log(`⏳ Request already pending for ${action}`, { requestId });
      
      // Attendre la fin de la requête en cours
      const pendingRequest = pendingRequests.get(requestId);
      if (pendingRequest && pendingRequest.promise) {
        try {
          const result = await pendingRequest.promise;
          return result;
        } catch (error) {
          throw error;
        }
      }
    }

    // Créer la promesse de la requête
    const requestPromise = (async () => {
      try {
        // Préparer les headers avec la clé d'idempotence
        const headers = {
          'Content-Type': 'application/json',
          'X-Request-ID': requestId,
          'X-Idempotency-Key': requestId
        };

        // Exécuter la fonction avec retry
        let lastError;
        for (let attempt = 0; attempt <= retries; attempt++) {
          try {
            const result = await requestFunction(data, headers);
            
            // Marquer comme complétée
            markRequestCompleted(requestId, result);
            
            // Mettre en cache
            if (useCache) {
              requestCache.current.set(requestId, {
                result,
                timestamp: Date.now()
              });
            }
            
            return result;

          } catch (error) {
            lastError = error;
            
            if (attempt < retries) {
              console.warn(`⚠️ Request failed, retrying (${attempt + 1}/${retries + 1})`, {
                requestId,
                action,
                error: error.message
              });
              
              // Attendre avant de réessayer
              await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
            } else {
              console.error(`❌ Request failed after ${retries + 1} attempts`, {
                requestId,
                action,
                error: error.message
              });
            }
          }
        }

        // Marquer comme échouée
        markRequestFailed(requestId, lastError);
        throw lastError;

      } catch (error) {
        markRequestFailed(requestId, error);
        throw error;
      }
    })();

    // Marquer comme en cours
    markRequestPending(requestId, requestPromise);

    try {
      return await requestPromise;
    } finally {
      // Nettoyer le cache périodiquement
      if (requestCache.current.size > 100) {
        const cutoff = Date.now() - cacheTTL;
        for (const [key, value] of requestCache.current.entries()) {
          if (value.timestamp < cutoff) {
            requestCache.current.delete(key);
          }
        }
      }
    }
  }, [
    generateRequestId,
    isRequestPending,
    markRequestPending,
    markRequestCompleted,
    markRequestFailed,
    pendingRequests
  ]);

  // Annuler une requête en cours
  const cancelRequest = useCallback((requestId) => {
    const request = pendingRequests.get(requestId);
    if (request) {
      markRequestFailed(requestId, new Error('Request cancelled'));
    }
  }, [pendingRequests, markRequestFailed]);

  // Vider les requêtes en cours
  const clearPendingRequests = useCallback(() => {
    setPendingRequests(new Map());
    requestCache.current.clear();
  }, []);

  // Obtenir les statistiques
  const getStats = useCallback(() => {
    const pending = Array.from(pendingRequests.values());
    const completed = requestHistory.filter(r => r.status === 'completed');
    const failed = requestHistory.filter(r => r.status === 'failed');

    return {
      pending: pending.length,
      completed: completed.length,
      failed: failed.length,
      cacheSize: requestCache.current.size,
      totalHistory: requestHistory.length,
      successRate: requestHistory.length > 0 
        ? (completed.length / requestHistory.length) * 100 
        : 0
    };
  }, [pendingRequests, requestHistory]);

  // Nettoyer l'historique
  const clearHistory = useCallback(() => {
    setRequestHistory([]);
  }, []);

  return {
    // État
    pendingRequests,
    requestHistory,
    
    // Actions principales
    executeIdempotentRequest,
    
    // Utilitaires
    generateRequestId,
    isRequestPending,
    markRequestPending,
    markRequestCompleted,
    markRequestFailed,
    cancelRequest,
    clearPendingRequests,
    
    // Statistiques
    getStats,
    clearHistory
  };
};

export default useIdempotency;
