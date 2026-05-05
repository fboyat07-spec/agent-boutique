// ACTION 8 - Cache léger dashboard

class DashboardCache {
  constructor() {
    this.enabled = process.env.DASHBOARD_CACHE_ENABLED === 'true';
    this.cache = new Map(); // key -> { data, timestamp, ttl }
    this.defaultTTL = 30000; // 30 secondes par défaut
    this.maxSize = 1000; // Max 1000 entrées
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0,
      errors: 0
    };
    
    // Cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Toutes les minutes
    
    console.log('[DASHBOARD_CACHE_INITIALIZED]', {
      enabled: this.enabled,
      defaultTTL: this.defaultTTL,
      maxSize: this.maxSize
    });
  }
  
  // Obtenir depuis le cache
  get(key) {
    if (!this.enabled) {
      return null;
    }
    
    try {
      const entry = this.cache.get(key);
      
      if (!entry) {
        this.stats.misses++;
        return null;
      }
      
      // Vérifier si expiré
      if (Date.now() > entry.expiresAt) {
        this.cache.delete(key);
        this.stats.misses++;
        return null;
      }
      
      this.stats.hits++;
      return entry.data;
      
    } catch (error) {
      this.stats.errors++;
      console.log('[DASHBOARD_CACHE_GET_ERROR]', {
        key,
        error: error.message
      });
      return null;
    }
  }
  
  // Mettre en cache
  set(key, data, ttl = null) {
    if (!this.enabled) {
      return false;
    }
    
    try {
      const cacheTTL = ttl || this.defaultTTL;
      const expiresAt = Date.now() + cacheTTL;
      
      // Si cache plein, supprimer les plus anciennes entrées
      if (this.cache.size >= this.maxSize) {
        this.evictOldest();
      }
      
      this.cache.set(key, {
        data,
        timestamp: Date.now(),
        expiresAt,
        ttl: cacheTTL
      });
      
      this.stats.sets++;
      return true;
      
    } catch (error) {
      this.stats.errors++;
      console.log('[DASHBOARD_CACHE_SET_ERROR]', {
        key,
        error: error.message
      });
      return false;
    }
  }
  
  // Supprimer une entrée
  delete(key) {
    if (!this.enabled) {
      return false;
    }
    
    const deleted = this.cache.delete(key);
    
    if (deleted) {
      console.log('[DASHBOARD_CACHE_DELETED]', { key });
    }
    
    return deleted;
  }
  
  // Vider le cache
  clear(tenant_id = null) {
    if (!this.enabled) {
      return 0;
    }
    
    let cleared = 0;
    
    if (tenant_id) {
      // Supprimer seulement les entrées pour ce tenant
      const keysToDelete = [];
      
      for (const [key, entry] of this.cache.entries()) {
        if (key.includes(`tenant_${tenant_id}_`) || key.includes(`tenant_id=${tenant_id}`)) {
          keysToDelete.push(key);
        }
      }
      
      for (const key of keysToDelete) {
        this.cache.delete(key);
        cleared++;
      }
      
      console.log('[DASHBOARD_CACHE_CLEARED_TENANT]', {
        tenant_id,
        cleared
      });
      
    } else {
      // Supprimer tout
      cleared = this.cache.size;
      this.cache.clear();
      
      console.log('[DASHBOARD_CACHE_CLEARED_ALL]', { cleared });
    }
    
    return cleared;
  }
  
  // Wrapper pour fonction avec cache
  async cachedFunction(key, fn, ttl = null) {
    // Tenter d'obtenir depuis le cache
    const cached = this.get(key);
    
    if (cached !== null) {
      console.log('[DASHBOARD_CACHE_HIT]', { key });
      return cached;
    }
    
    // Exécuter la fonction
    try {
      const result = await fn();
      
      // Mettre en cache
      this.set(key, result, ttl);
      
      console.log('[DASHBOARD_CACHE_MISS_COMPUTED]', { key });
      return result;
      
    } catch (error) {
      console.log('[DASHBOARD_CACHE_FUNCTION_ERROR]', {
        key,
        error: error.message
      });
      throw error;
    }
  }
  
  // Obtenir stats du cache
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0 ? 
      (this.stats.hits / (this.stats.hits + this.stats.misses)) * 100 : 0;
    
    return {
      enabled: this.enabled,
      cache: {
        size: this.cache.size,
        maxSize: this.maxSize,
        utilization: this.cache.size > 0 ? 
          Math.round((this.cache.size / this.maxSize) * 10000) / 100 : 0
      },
      stats: {
        hits: this.stats.hits,
        misses: this.stats.misses,
        sets: this.stats.sets,
        evictions: this.stats.evictions,
        errors: this.stats.errors,
        hitRate: Math.round(hitRate * 100) / 100
      },
      uptime: process.uptime()
    };
  }
  
  // Nettoyer les entrées expirées
  cleanup() {
    if (!this.enabled) {
      return;
    }
    
    const now = Date.now();
    const keysToDelete = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        keysToDelete.push(key);
      }
    }
    
    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
    
    if (keysToDelete.length > 0) {
      console.log('[DASHBOARD_CACHE_CLEANUP]', {
        cleaned: keysToDelete.length,
        remaining: this.cache.size
      });
    }
  }
  
  // Évincer les entrées les plus anciennes
  evictOldest() {
    if (this.cache.size === 0) {
      return;
    }
    
    // Trouver l'entrée la plus ancienne
    let oldestKey = null;
    let oldestTimestamp = Infinity;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
      
      console.log('[DASHBOARD_CACHE_EVICTED]', {
        key: oldestKey,
        age: Date.now() - oldestTimestamp
      });
    }
  }
  
  // Health check
  healthCheck() {
    const stats = this.getStats();
    
    const health = {
      status: 'healthy',
      enabled: stats.enabled,
      issues: [],
      recommendations: []
    };
    
    // Vérifier utilisation
    if (stats.cache.utilization > 80) {
      health.issues.push('High cache utilization');
      health.recommendations.push('Consider increasing cache size or reducing TTL');
    }
    
    // Vérifier hit rate
    if (stats.stats.hitRate < 50 && (stats.stats.hits + stats.stats.misses) > 100) {
      health.issues.push('Low cache hit rate');
      health.recommendations.push('Review cache keys and TTL settings');
    }
    
    // Vérifier taux d'erreur
    const errorRate = stats.stats.sets > 0 ? 
      (stats.stats.errors / stats.stats.sets) * 100 : 0;
    
    if (errorRate > 5) {
      health.issues.push('High error rate');
      health.recommendations.push('Check cache implementation and data integrity');
    }
    
    // Vérifier évincements fréquents
    if (stats.stats.evictions > stats.stats.sets * 0.1) {
      health.issues.push('High eviction rate');
      health.recommendations.push('Increase cache size or optimize key usage');
    }
    
    if (health.issues.length > 0) {
      health.status = 'warning';
    }
    
    return {
      ...health,
      stats: {
        size: stats.cache.size,
        utilization: stats.cache.utilization,
        hitRate: stats.stats.hitRate,
        errorRate: Math.round(errorRate * 100) / 100
      }
    };
  }
  
  // Réinitialiser stats
  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0,
      errors: 0
    };
    
    console.log('[DASHBOARD_CACHE_STATS_RESET]');
  }
  
  // Détruire
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.cache.clear();
    
    console.log('[DASHBOARD_CACHE_DESTROYED]');
  }
}

// Instance globale du cache
if (!global.dashboardCache) {
  global.dashboardCache = new DashboardCache();
}

// Fonctions principales
function getCachedData(key) {
  return global.dashboardCache.get(key);
}

function setCachedData(key, data, ttl) {
  return global.dashboardCache.set(key, data, ttl);
}

function deleteCachedData(key) {
  return global.dashboardCache.delete(key);
}

function clearCache(tenant_id) {
  return global.dashboardCache.clear(tenant_id);
}

async function withCache(key, fn, ttl) {
  return await global.dashboardCache.cachedFunction(key, fn, ttl);
}

// Stats et monitoring
function getCacheStats() {
  return global.dashboardCache.getStats();
}

function cacheHealthCheck() {
  return global.dashboardCache.healthCheck();
}

// Administration
function resetCacheStats() {
  return global.dashboardCache.resetStats();
}

module.exports = {
  getCachedData,
  setCachedData,
  deleteCachedData,
  clearCache,
  withCache,
  getCacheStats,
  cacheHealthCheck,
  resetCacheStats,
  DashboardCache
};
