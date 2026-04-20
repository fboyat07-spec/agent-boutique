import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import performanceOptimizer from './performanceOptimizer';

// Hook pour les composants optimisés
const usePerformanceOptimized = (componentName) => {
  const [metrics, setMetrics] = useState(null);
  const mountTimeRef = useRef(null);

  // Mesurer le temps de montage
  useEffect(() => {
    if (!componentName) return;
    
    const endMount = performanceOptimizer.measureComponentMount(componentName);
    mountTimeRef.current = endMount;
    
    // Nettoyer au démontage
    return () => {
      if (mountTimeRef.current) {
        mountTimeRef.current();
      }
    };
  }, [componentName]);

  // Compteur de re-rendus optimisé
  const renderCount = useCallback(() => {
    if (componentName) {
      performanceOptimizer.renderCounter(componentName);
    }
  }, [componentName]);

  // Exécuter à chaque rendu
  renderCount();

  // Fonction de mesure de rendu
  const measureRender = useCallback((renderFunction) => {
    if (componentName) {
      return performanceOptimizer.measureRenderTime(componentName, renderFunction);
    }
    return renderFunction();
  }, [componentName]);

  // Debounce optimisé
  const debounce = useCallback((func, delay) => {
    return performanceOptimizer.debounce(func, delay);
  }, []);

  // Throttle optimisé
  const throttle = useCallback((func, limit) => {
    return performanceOptimizer.throttle(func, limit);
  }, []);

  // Optimisation d'événements
  const optimizeEventHandler = useCallback((handler, delay = 100) => {
    return performanceOptimizer.optimizeEventHandler(handler, delay);
  }, []);

  // Optimisation de chargement de données
  const optimizeDataLoad = useCallback((loadFunction, options) => {
    return performanceOptimizer.optimizeDataLoad(loadFunction, options);
  }, []);

  // Obtenir les métriques
  const getMetrics = useCallback(() => {
    const report = performanceOptimizer.getPerformanceReport();
    setMetrics(report);
    return report;
  }, []);

  return {
    metrics,
    measureRender,
    debounce,
    throttle,
    optimizeEventHandler,
    optimizeDataLoad,
    getMetrics
  };
};

export default usePerformanceOptimized;
