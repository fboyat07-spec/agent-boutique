// Service d'optimisation des performances globales
class PerformanceOptimizer {
  constructor() {
    this.metrics = new Map();
    this.renderCount = new Map();
    this.componentMountTime = new Map();
    this.isMonitoring = false;
    this.performanceThresholds = {
      renderTime: 16, // 60fps = 16ms max
      componentMountTime: 100, // 100ms max
      memoryUsage: 50 * 1024 * 1024, // 50MB max
      networkRequests: 10 // 10 requests max per second
    };
  }

  // Démarrer la surveillance
  startMonitoring() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    console.log('🚀 Surveillance des performances démarrée');
    
    // Surveiller les re-renders
    this.monitorRerenders();
    
    // Surveiller la mémoire
    this.monitorMemory();
    
    // Surveiller le réseau
    this.monitorNetwork();
  }

  // Arrêter la surveillance
  stopMonitoring() {
    this.isMonitoring = false;
    console.log('⏹️ Surveillance des performances arrêtée');
  }

  // Surveiller les re-renders de composants
  monitorRerenders() {
    if (!this.isMonitoring) return;

    // Hook pour compter les re-renders
    this.renderCounter = (componentName) => {
      const count = this.renderCount.get(componentName) || 0;
      this.renderCount.set(componentName, count + 1);
      
      if (count > 10) {
        console.warn(`⚠️ Composant ${componentName} a re-rendu ${count + 1} fois`);
      }
    };
  }

  // Surveiller l'utilisation mémoire
  monitorMemory() {
    if (!this.isMonitoring || !performance.memory) return;

    const checkMemory = () => {
      if (!this.isMonitoring) return;
      
      const memory = performance.memory;
      const usedMemory = memory.usedJSHeapSize;
      const totalMemory = memory.totalJSHeapSize;
      const memoryUsage = (usedMemory / totalMemory) * 100;

      this.metrics.set('memoryUsage', {
        used: usedMemory,
        total: totalMemory,
        percentage: memoryUsage,
        timestamp: Date.now()
      });

      if (memoryUsage > 80) {
        console.warn(`⚠️ Usage mémoire élevé: ${memoryUsage.toFixed(2)}%`);
      }

      setTimeout(checkMemory, 5000); // Vérifier toutes les 5 secondes
    };

    checkMemory();
  }

  // Surveiller les requêtes réseau
  monitorNetwork() {
    if (!this.isMonitoring) return;

    // Intercepter les requêtes fetch
    const originalFetch = window.fetch;
    let requestCount = 0;
    let lastReset = Date.now();

    window.fetch = async (...args) => {
      requestCount++;
      
      // Réinitialiser le compteur chaque seconde
      if (Date.now() - lastReset > 1000) {
        requestCount = 1;
        lastReset = Date.now();
      }

      if (requestCount > this.performanceThresholds.networkRequests) {
        console.warn(`⚠️ Trop de requêtes réseau: ${requestCount}/s`);
      }

      return originalFetch(...args);
    };
  }

  // Mesurer le temps de rendu d'un composant
  measureRenderTime(componentName, renderFunction) {
    const startTime = performance.now();
    
    const result = renderFunction();
    
    const endTime = performance.now();
    const renderTime = endTime - startTime;
    
    this.metrics.set(`${componentName}_renderTime`, {
      time: renderTime,
      timestamp: Date.now()
    });

    if (renderTime > this.performanceThresholds.renderTime) {
      console.warn(`⚠️ Rendu lent pour ${componentName}: ${renderTime.toFixed(2)}ms`);
    }

    return result;
  }

  // Mesurer le temps de montage d'un composant
  measureComponentMount(componentName) {
    const startTime = performance.now();
    
    return () => {
      const endTime = performance.now();
      const mountTime = endTime - startTime;
      
      this.componentMountTime.set(componentName, {
        time: mountTime,
        timestamp: Date.now()
      });

      if (mountTime > this.performanceThresholds.componentMountTime) {
        console.warn(`⚠️ Montage lent pour ${componentName}: ${mountTime.toFixed(2)}ms`);
      }
    };
  }

  // Optimiser les re-rendus avec debounce
  debounce(func, delay) {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func(...args), delay);
    };
  }

  // Optimiser les appels fréquents avec throttle
  throttle(func, limit) {
    let inThrottle;
    return (...args) => {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  // Optimiser les mises à jour d'état
  batchStateUpdates(updates) {
    // Utiliser requestAnimationFrame pour grouper les mises à jour
    return new Promise(resolve => {
      requestAnimationFrame(() => {
        resolve(updates);
      });
    });
  }

  // Optimiser les images
  optimizeImage(src, options = {}) {
    const {
      width = 800,
      height = 600,
      quality = 0.8,
      format = 'webp'
    } = options;

    // Ajouter des paramètres d'optimisation
    const optimizedSrc = `${src}?w=${width}&h=${height}&q=${quality}&f=${format}`;
    
    return optimizedSrc;
  }

  // Optimiser les animations
  optimizeAnimation(callback, duration) {
    const startTime = performance.now();
    
    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      callback(progress);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame(animate);
  }

  // Optimiser le chargement des données
  optimizeDataLoad(loadFunction, options = {}) {
    const {
      cache = true,
      cacheTimeout = 5 * 60 * 1000, // 5 minutes
      retryCount = 3,
      retryDelay = 1000
    } = options;

    return async (...args) => {
      const cacheKey = JSON.stringify(args);
      
      // Vérifier le cache
      if (cache && this.dataCache && this.dataCache.has(cacheKey)) {
        const cached = this.dataCache.get(cacheKey);
        
        if (Date.now() - cached.timestamp < cacheTimeout) {
          console.log('📄 Cache HIT pour données');
          return cached.data;
        }
      }

      // Charger avec retry
      let lastError;
      
      for (let i = 0; i < retryCount; i++) {
        try {
          const data = await loadFunction(...args);
          
          // Mettre en cache
          if (cache) {
            if (!this.dataCache) this.dataCache = new Map();
            this.dataCache.set(cacheKey, {
              data,
              timestamp: Date.now()
            });
          }
          
          return data;
        } catch (error) {
          lastError = error;
          
          if (i < retryCount - 1) {
            console.warn(`⚠️ Erreur chargement, retry ${i + 1}/${retryCount}`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          }
        }
      }
      
      throw lastError;
    };
  }

  // Optimiser les requêtes Firestore
  optimizeFirestoreQuery(query, options = {}) {
    const {
      limit = 20,
      orderBy = 'createdAt',
      direction = 'desc',
      cache = true
    } = options;

    // Ajouter des limites pour éviter les gros chargements
    if (limit) {
      query = query.limit(limit);
    }

    // Ajouter un ordre pour la cohérence
    if (orderBy) {
      query = query.orderBy(orderBy, direction);
    }

    return query;
  }

  // Optimiser les listes virtuelles
  optimizeVirtualList(items, itemHeight, containerHeight) {
    const visibleCount = Math.ceil(containerHeight / itemHeight) + 2; // +2 pour le buffering
    const startIndex = Math.max(0, Math.floor(this.scrollTop / itemHeight) - 1);
    const endIndex = Math.min(items.length, startIndex + visibleCount);
    
    return {
      items: items.slice(startIndex, endIndex),
      startIndex,
      endIndex,
      totalHeight: items.length * itemHeight
    };
  }

  // Optimiser les événements
  optimizeEventHandler(handler, delay = 100) {
    let timeoutId;
    
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => handler(...args), delay);
    };
  }

  // Obtenir les métriques de performance
  getMetrics() {
    return {
      renderCounts: Object.fromEntries(this.renderCount),
      componentMountTimes: Object.fromEntries(this.componentMountTime),
      metrics: Object.fromEntries(this.metrics),
      timestamp: Date.now()
    };
  }

  // Obtenir un rapport de performance
  getPerformanceReport() {
    const metrics = this.getMetrics();
    
    const report = {
      summary: {
        totalRerenders: Object.values(metrics.renderCounts).reduce((sum, count) => sum + count, 0),
        averageMountTime: Object.values(metrics.componentMountTimes).reduce((sum, time) => sum + time.time, 0) / Object.keys(metrics.componentMountTimes).length || 0,
        memoryUsage: metrics.metrics.memoryUsage?.percentage || 0
      },
      problematicComponents: [],
      recommendations: []
    };

    // Identifier les composants problématiques
    Object.entries(metrics.renderCounts).forEach(([component, count]) => {
      if (count > 10) {
        report.problematicComponents.push({
          component,
          issue: 'Too many rerenders',
          count
        });
      }
    });

    Object.entries(metrics.componentMountTimes).forEach(([component, data]) => {
      if (data.time > this.performanceThresholds.componentMountTime) {
        report.problematicComponents.push({
          component,
          issue: 'Slow mount time',
          time: data.time
        });
      }
    });

    // Générer des recommandations
    if (report.summary.totalRerenders > 50) {
      report.recommendations.push('Consider using React.memo for frequently rerendering components');
    }

    if (report.summary.averageMountTime > 50) {
      report.recommendations.push('Optimize component initialization and heavy computations');
    }

    if (report.summary.memoryUsage > 80) {
      report.recommendations.push('Memory usage is high, consider cleanup and optimization');
    }

    return report;
  }

  // Nettoyer les ressources
  cleanup() {
    this.metrics.clear();
    this.renderCount.clear();
    this.componentMountTime.clear();
    
    if (this.dataCache) {
      this.dataCache.clear();
    }
    
    console.log('🧹 Performance optimizer nettoyé');
  }
}

// Instance singleton
const performanceOptimizer = new PerformanceOptimizer();

export default performanceOptimizer;
