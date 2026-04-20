import { useState, useEffect, useCallback, useMemo } from 'react';
import firestoreOptimizer from './firestoreOptimizer';

// Hook pour les lectures Firestore optimisées
const useFirestoreOptimized = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Lecture de document optimisée
  const getDocument = useCallback(async (docRef) => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await firestoreOptimizer.getDocument(docRef);
      return { success: true, data };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, []);

  // Lecture multiple optimisée
  const getDocuments = useCallback(async (docRefs) => {
    setLoading(true);
    setError(null);
    
    try {
      const results = await firestoreOptimizer.getDocuments(docRefs);
      return { success: true, data: results };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, []);

  // Lecture de collection optimisée
  const getCollection = useCallback(async (collectionRef, options = {}) => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await firestoreOptimizer.getCollection(collectionRef, options);
      return { success: true, data };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, []);

  // Écoute optimisée
  const useDocument = useCallback((docRef, callback, options = {}) => {
    return firestoreOptimizer.onSnapshot(docRef, callback, options);
  }, []);

  // Préchargement
  const preloadDocuments = useCallback(async (docRefs) => {
    try {
      await firestoreOptimizer.preloadDocuments(docRefs);
      return { success: true };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    }
  }, []);

  // Cache management
  const clearCache = useCallback((docId = null) => {
    firestoreOptimizer.clearCache(docId);
  }, []);

  const getCacheStats = useCallback(() => {
    return firestoreOptimizer.getCacheStats();
  }, []);

  const optimizeCache = useCallback(() => {
    firestoreOptimizer.optimizeCache();
  }, []);

  return {
    loading,
    error,
    getDocument,
    getDocuments,
    getCollection,
    useDocument,
    preloadDocuments,
    clearCache,
    getCacheStats,
    optimizeCache
  };
};

export default useFirestoreOptimized;
