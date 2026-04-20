import { useState, useCallback, useRef, useEffect } from 'react';

// Hook pour le cache simple côté frontend
const useDataCache = (maxSize = 100, ttlMs = 5 * 60 * 1000) => { // 5 minutes TTL par défaut
  const [cache, setCache] = useState(new Map());
  const [stats, setStats] = useState({
    hits: 0,
    misses: 0,
    sets: 0,
    evictions: 0
  });

  // Référence pour éviter les re-renders
  const cacheRef = useRef(cache);
  const statsRef = useRef(stats);

  // Synchroniser les refs avec l'état
  useEffect(() => {
    cacheRef.current = cache;
  }, [cache]);

  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);

  // Nettoyer les entrées expirées
  const cleanupExpired = useCallback(() => {
    const now = Date.now();
    const newCache = new Map();
    let evictions = 0;

    for (const [key, value] of cacheRef.current.entries()) {
      if (value.expiresAt > now) {
        newCache.set(key, value);
      } else {
        evictions++;
      }
    }

    if (evictions > 0) {
      setCache(newCache);
      setStats(prev => ({
        ...prev,
        evictions: prev.evictions + evictions
      }));
    }

    return evictions;
  }, []);

  // Nettoyage périodique
  useEffect(() => {
    const interval = setInterval(cleanupExpired, ttlMs / 2); // Nettoyer toutes les 2.5 minutes
    return () => clearInterval(interval);
  }, [cleanupExpired, ttlMs]);

  // Obtenir une valeur du cache
  const get = useCallback((key) => {
    const cached = cacheRef.current.get(key);
    
    if (!cached) {
      setStats(prev => ({ ...prev, misses: prev.misses + 1 }));
      return null;
    }

    // Vérifier si l'entrée est expirée
    if (cached.expiresAt < Date.now()) {
      cacheRef.current.delete(key);
      setCache(new Map(cacheRef.current));
      setStats(prev => ({ ...prev, misses: prev.misses + 1 }));
      return null;
    }

    setStats(prev => ({ ...prev, hits: prev.hits + 1 }));
    return cached.data;
  }, []);

  // Mettre une valeur dans le cache
  const set = useCallback((key, data, customTtl = ttlMs) => {
    const now = Date.now();
    
    // Si le cache est plein, supprimer les entrées les plus anciennes
    if (cacheRef.current.size >= maxSize) {
      const entries = Array.from(cacheRef.current.entries());
      const oldestKey = entries[0][0];
      cacheRef.current.delete(oldestKey);
      
      setStats(prev => ({ ...prev, evictions: prev.evictions + 1 }));
    }

    const cacheEntry = {
      data,
      createdAt: now,
      expiresAt: now + customTtl,
      accessCount: 1,
      lastAccessed: now
    };

    cacheRef.current.set(key, cacheEntry);
    setCache(new Map(cacheRef.current));
    setStats(prev => ({ ...prev, sets: prev.sets + 1 }));

    return data;
  }, [maxSize, ttlMs]);

  // Mettre à jour une valeur dans le cache
  const update = useCallback((key, data) => {
    const cached = cacheRef.current.get(key);
    
    if (!cached) {
      return set(key, data);
    }

    const updatedEntry = {
      ...cached,
      data,
      lastAccessed: Date.now(),
      accessCount: cached.accessCount + 1
    };

    cacheRef.current.set(key, updatedEntry);
    setCache(new Map(cacheRef.current));

    return data;
  }, [set]);

  // Supprimer une valeur du cache
  const remove = useCallback((key) => {
    const deleted = cacheRef.current.delete(key);
    
    if (deleted) {
      setCache(new Map(cacheRef.current));
    }

    return deleted;
  }, []);

  // Vider le cache
  const clear = useCallback(() => {
    cacheRef.current.clear();
    setCache(new Map());
    setStats(prev => ({ ...prev, evictions: prev.evictions + cacheRef.current.size }));
  }, []);

  // Obtenir ou définir une valeur (pattern get-or-set)
  const getOrSet = useCallback(async (key, fetchFunction, customTtl = ttlMs) => {
    const cached = get(key);
    
    if (cached !== null) {
      return cached;
    }

    try {
      const data = await fetchFunction();
      return set(key, data, customTtl);
    } catch (error) {
      console.error(`Erreur lors du fetch pour la clé ${key}:`, error);
      throw error;
    }
  }, [get, set, ttlMs]);

  // Précharger plusieurs clés
  const preload = useCallback(async (keys, fetchFunction) => {
    const promises = keys.map(async (key) => {
      const cached = get(key);
      if (cached !== null) {
        return { key, data: cached, cached: true };
      }

      try {
        const data = await fetchFunction(key);
        set(key, data);
        return { key, data, cached: false };
      } catch (error) {
        console.error(`Erreur lors du preload pour la clé ${key}:`, error);
        return { key, error, cached: false };
      }
    });

    return Promise.all(promises);
  }, [get, set]);

  // Obtenir les statistiques du cache
  const getStats = useCallback(() => {
    const hitRate = statsRef.current.hits + statsRef.current.misses > 0 
      ? (statsRef.current.hits / (statsRef.current.hits + statsRef.current.misses)) * 100 
      : 0;

    return {
      ...statsRef.current,
      size: cacheRef.current.size,
      maxSize,
      hitRate: Math.round(hitRate * 100) / 100,
      ttl: ttlMs
    };
  }, [maxSize, ttlMs]);

  // Obtenir les clés les plus utilisées
  const getHotKeys = useCallback((limit = 10) => {
    const entries = Array.from(cacheRef.current.entries())
      .map(([key, value]) => ({
        key,
        accessCount: value.accessCount,
        lastAccessed: value.lastAccessed,
        createdAt: value.createdAt
      }))
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, limit);

    return entries;
  }, []);

  // Exporter/Importer le cache (pour persistance)
  const exportCache = useCallback(() => {
    const now = Date.now();
    const exportable = {};

    for (const [key, value] of cacheRef.current.entries()) {
      if (value.expiresAt > now) {
        exportable[key] = {
          data: value.data,
          expiresAt: value.expiresAt,
          createdAt: value.createdAt,
          accessCount: value.accessCount
        };
      }
    }

    return {
      cache: exportable,
      stats: statsRef.current,
      exportedAt: now
    };
  }, []);

  const importCache = useCallback((exportedData) => {
    if (!exportedData || !exportedData.cache) {
      return false;
    }

    const now = Date.now();
    const newCache = new Map();
    let imported = 0;

    for (const [key, value] of Object.entries(exportedData.cache)) {
      if (value.expiresAt > now) {
        newCache.set(key, {
          data: value.data,
          createdAt: value.createdAt,
          expiresAt: value.expiresAt,
          accessCount: value.accessCount || 1,
          lastAccessed: now
        });
        imported++;
      }
    }

    setCache(newCache);
    setStats(exportedData.stats || { hits: 0, misses: 0, sets: 0, evictions: 0 });

    console.log(`Cache importé: ${imported} entrées restaurées`);
    return true;
  }, []);

  return {
    // État
    cache,
    stats: getStats(),
    
    // Actions principales
    get,
    set,
    update,
    remove,
    clear,
    
    // Actions avancées
    getOrSet,
    preload,
    cleanupExpired,
    
    // Utilitaires
    getStats: getStats(),
    getHotKeys,
    exportCache,
    importCache
  };
};

// Cache global partagé pour toute l'application
const globalCache = useDataCache(200, 10 * 60 * 1000); // 200 entrées, 10 minutes TTL

// Hook pour utiliser le cache global
export const useGlobalCache = () => globalCache;

export default useDataCache;
