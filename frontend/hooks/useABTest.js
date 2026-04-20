import { useState, useEffect, useCallback } from 'react';
import abTestService from './abTestService';

const useABTest = (userId) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Initialiser le service
  useEffect(() => {
    const initialize = async () => {
      if (!userId) return;
      
      setLoading(true);
      setError(null);
      
      try {
        const result = await abTestService.initialize(userId);
        setIsInitialized(result.success);
        
        if (!result.success) {
          setError(result.error);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, [userId]);

  // Assigner une variante
  const assignVariant = useCallback(async (featureName, forceVariant = null) => {
    if (!isInitialized) {
      console.warn('⚠️ A/B Testing non initialisé');
      return null;
    }

    try {
      return await abTestService.assignVariant(featureName, forceVariant);
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, [isInitialized]);

  // Obtenir la variante
  const getFeatureVariant = useCallback((featureName) => {
    if (!isInitialized) return null;
    return abTestService.getFeatureVariant(featureName);
  }, [isInitialized]);

  // Obtenir avec fallback
  const getVariantWithFallback = useCallback((featureName, fallbackVariant = 'control') => {
    if (!isInitialized) return fallbackVariant;
    return abTestService.getVariantWithFallback(featureName, fallbackVariant);
  }, [isInitialized]);

  // Vérifier groupe contrôle/test
  const isControlGroup = useCallback((featureName) => {
    if (!isInitialized) return true;
    return abTestService.isControlGroup(featureName);
  }, [isInitialized]);

  const isTestGroup = useCallback((featureName) => {
    if (!isInitialized) return false;
    return abTestService.isTestGroup(featureName);
  }, [isInitialized]);

  return {
    isInitialized,
    loading,
    error,
    assignVariant,
    getFeatureVariant,
    getVariantWithFallback,
    isControlGroup,
    isTestGroup,
    getAllVariants: () => abTestService.getAllUserVariants(),
    getStatus: () => abTestService.getStatus()
  };
};

export default useABTest;
