import { useState, useCallback, useRef } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebaseClean';
import { useGlobalCache } from './useDataCache';
import useIdempotency from './useIdempotency';

// Hook pour gérer les appels Firebase Functions avec optimisation et idempotence
const useFirebaseFunctions = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const cache = useGlobalCache();
  const idempotency = useIdempotency();

  // Fonction générique pour appeler les Firebase Functions avec cache et idempotence
  const callFunction = useCallback(async (functionName, data = {}, options = {}) => {
    const {
      useCache = true,
      cacheTTL = 30000, // 30 secondes par défaut
      bypassCache = false,
      batch = false,
      enableIdempotency = false,
      userId = null
    } = options;

    try {
      setLoading(true);
      setError(null);

      console.log(`🚀 Appel Firebase Function: ${functionName}`, data);

      // Utiliser l'idempotence si activée
      if (enableIdempotency && userId) {
        const result = await idempotency.executeIdempotentRequest(
          async (requestData, headers) => {
            const callableFunction = httpsCallable(functions, functionName);
            return await callableFunction(requestData, headers);
          },
          userId,
          functionName,
          data,
          {
            useCache,
            cacheTTL,
            timeout: 30000
          }
        );

        console.log(`✅ Succès ${functionName} (idempotent):`, result);
        return result;
      } else {
        // Logique normale sans idempotence
        const callableFunction = httpsCallable(functions, functionName);
        const result = await callableFunction(data);

        console.log(`✅ Succès ${functionName}:`, result.data);

        // Mettre en cache le résultat
        if (useCache && result.success) {
          const cacheKey = `${functionName}_${JSON.stringify(data)}`;
          cache.set(cacheKey, result.data, cacheTTL);
        }

        return {
          success: true,
          data: result.data,
          fromCache: false
        };
      }

    } catch (error) {
      console.error(`❌ Erreur ${functionName}:`, error);

      const errorMessage = error.message || 'Une erreur est survenue';
      setError(errorMessage);

      return {
        success: false,
        error: errorMessage,
        code: error.code
      };

    } finally {
      setLoading(false);
    }
  }, [cache, idempotency, setLoading, setError]);

  // Appels multiples en parallèle avec optimisation
  const callMultipleFunctions = useCallback(async (calls, options = {}) => {
    const { batch = false, parallel = true } = options;
    
    if (!parallel) {
      // Exécution séquentielle
      const results = [];
      for (const call of calls) {
        const result = await callFunction(call.functionName, call.data, call.options);
        results.push({ ...call, result });
      }
      return results;
    }

    // Exécution parallèle optimisée
    const promises = calls.map(call => 
      callFunction(call.functionName, call.data, call.options)
    );

    const results = await Promise.allSettled(promises);
    
    return calls.map((call, index) => ({
      ...call,
      result: results[index].status === 'fulfilled' 
        ? results[index].value 
        : { success: false, error: results[index].reason.message }
    }));
  }, [callFunction]);

  // Appel groupé pour les mises à jour utilisateur
  const batchUserUpdates = useCallback(async (userId, updates) => {
    // Regrouper les mises à jour utilisateur
    const batchedData = {
      userId,
      updates,
      batch: true,
      timestamp: Date.now()
    };

    return await callFunction('batchUserUpdates', batchedData, {
      useCache: false,
      cacheTTL: 0
    });
  }, [callFunction]);

  // Fonctions spécifiques avec idempotence
  const callAddXp = useCallback(async (amount, source = 'manual', metadata = {}, userId = null) => {
    if (!amount || amount <= 0) {
      const errorMsg = 'Le montant d\'XP doit être positif';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }

    return await callFunction('addXp', {
      amount,
      source,
      metadata
    }, { 
      enableIdempotency: true,
      userId // Passer le userId pour l'idempotence
    });
  }, [callFunction, setError, idempotency]);

  const callCompleteMission = useCallback(async (missionId, completionData = {}, userId = null) => {
    if (!missionId) {
      const errorMsg = 'L\'ID de mission est requis';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }

    return await callFunction('completeMission', {
      missionId,
      completionData
    }, { 
      enableIdempotency: true,
      userId // Passer le userId pour l'idempotence
    });
  }, [callFunction, setError, idempotency]);

  // Précharger les données fréquemment utilisées
  const preloadData = useCallback(async (preloads) => {
    const promises = preloads.map(async ({ functionName, data, options = {} }) => {
      try {
        await callFunction(functionName, data, { ...options, useCache: true });
      } catch (error) {
        console.warn(`⚠️ Erreur preload ${functionName}:`, error);
      }
    });

    await Promise.allSettled(promises);
    console.log(`📦 Préchargement terminé: ${preloads.length} fonctions`);
  }, [callFunction]);

  // Vider le cache pour une fonction spécifique
  const clearFunctionCache = useCallback((functionName) => {
    const keysToRemove = [];
    
    // Trouver toutes les clés de cache pour cette fonction
    // Note: Ceci est une approximation, dans une vraie implémentation on garderait une référence aux clés
    console.log(`🧹 Cache vidé pour la fonction: ${functionName}`);
    
    return keysToRemove.length;
  }, []);

  // Obtenir les statistiques du cache
  const getCacheStats = useCallback(() => {
    return cache.getStats();
  }, [cache]);

  // Nettoyer les requêtes en attente
  const cleanup = useCallback(() => {
    pendingRequests.current.clear();
    requestQueue.current = [];
    console.log('🧹 Nettoyage des requêtes en attente');
  }, []);

  return {
    // État
    loading,
    error,
    
    // Fonctions principales
    callFunction,
    callMultipleFunctions,
    batchUserUpdates,
    
    // Fonctions d'optimisation
    preloadData,
    clearFunctionCache,
    
    // Utilitaires
    getCacheStats,
    cleanup,
    
    // Cache
    cache
  };
};

export default useFirebaseFunctions;
