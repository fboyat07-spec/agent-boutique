import { useState, useEffect, useCallback } from 'react';
import feedbackService from './feedbackService';

const useFeedback = () => {
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isHapticsEnabled, setIsHapticsEnabled] = useState(true);
  const [vibrationIntensity, setVibrationIntensity] = useState('medium');
  const [serviceStatus, setServiceStatus] = useState(null);

  // Initialiser le service au montage
  useEffect(() => {
    const status = feedbackService.getStatus();
    setIsAudioEnabled(status.audioEnabled);
    setIsHapticsEnabled(status.hapticsEnabled);
    setVibrationIntensity(status.vibrationIntensity);
    setServiceStatus(status);
  }, []);

  // Feedback d'achat dans le shop
  const purchaseFeedback = useCallback(async (options = {}) => {
    return await feedbackService.purchaseFeedback(options);
  }, []);

  // Feedback de gain XP
  const xpGainFeedback = useCallback(async (options = {}) => {
    return await feedbackService.xpGainFeedback(options);
  }, []);

  // Feedback de mission complétée
  const missionCompleteFeedback = useCallback(async (options = {}) => {
    return await feedbackService.missionCompleteFeedback(options);
  }, []);

  // Feedback de badge débloqué
  const badgeUnlockFeedback = useCallback(async (options = {}) => {
    return await feedbackService.badgeUnlockFeedback(options);
  }, []);

  // Feedback d'erreur
  const errorFeedback = useCallback(async (options = {}) => {
    return await feedbackService.errorFeedback(options);
  }, []);

  // Feedback de notification
  const notificationFeedback = useCallback(async (options = {}) => {
    return await feedbackService.notificationFeedback(options);
  }, []);

  // Feedback de chargement
  const loadingFeedback = useCallback(async (options = {}) => {
    return await feedbackService.loadingFeedback(options);
  }, []);

  // Feedback de navigation
  const navigationFeedback = useCallback(async (options = {}) => {
    return await feedbackService.navigationFeedback(options);
  }, []);

  // Feedback personnalisé
  const customFeedback = useCallback(async (options = {}) => {
    return await feedbackService.customFeedback(options);
  }, []);

  // Feedback combiné
  const combinedFeedback = useCallback(async (options = {}) => {
    return await feedbackService.combinedFeedback(options);
  }, []);

  // Activer/Désactiver l'audio
  const setAudioEnabled = useCallback((enabled) => {
    feedbackService.setAudioEnabled(enabled);
    setIsAudioEnabled(enabled);
  }, []);

  // Activer/Désactiver les haptiques
  const setHapticsEnabled = useCallback((enabled) => {
    feedbackService.setHapticsEnabled(enabled);
    setIsHapticsEnabled(enabled);
  }, []);

  // Définir l'intensité des vibrations
  const setVibrationIntensity = useCallback((intensity) => {
    feedbackService.setVibrationIntensity(intensity);
    setVibrationIntensity(intensity);
  }, []);

  // Jouer un son spécifique
  const playSound = useCallback(async (soundName) => {
    return await feedbackService.playSound(soundName);
  }, []);

  // Déclencher une vibration spécifique
  const triggerVibration = useCallback(async (type = 'medium') => {
    return await feedbackService.triggerVibration(type);
  }, []);

  // Obtenir le statut du service
  const getStatus = useCallback(() => {
    return feedbackService.getStatus();
  }, []);

  // Nettoyer les ressources
  const cleanup = useCallback(async () => {
    return await feedbackService.cleanup();
  }, []);

  // Feedback rapide pour les actions courantes
  const quickFeedback = {
    // Achat réussi
    purchaseSuccess: useCallback(async (amount, itemName) => {
      return await purchaseFeedback({ amount, itemName, success: true });
    }, [purchaseFeedback]),

    // Achat échoué
    purchaseError: useCallback(async (itemName, error) => {
      return await purchaseFeedback({ itemName, success: false, errorType: 'payment', message: error });
    }, [purchaseFeedback]),

    // Gain XP simple
    xpGain: useCallback(async (amount, source) => {
      return await xpGainFeedback({ amount, source, levelUp: false });
    }, [xpGainFeedback]),

    // Level up
    levelUp: useCallback(async (newLevel, totalXP) => {
      return await xpGainFeedback({ amount: totalXP, source: 'level_up', levelUp: true });
    }, [xpGainFeedback]),

    // Mission complétée
    missionComplete: useCallback(async (missionTitle, xpReward) => {
      return await missionCompleteFeedback({ missionTitle, xpReward });
    }, [missionCompleteFeedback]),

    // Badge débloqué
    badgeUnlocked: useCallback(async (badgeName, rarity) => {
      return await badgeUnlockFeedback({ badgeName, rarity });
    }, [badgeUnlockFeedback]),

    // Erreur générale
    error: useCallback(async (message) => {
      return await errorFeedback({ message, errorType: 'general' });
    }, [errorFeedback]),

    // Succès
    success: useCallback(async (message) => {
      return await errorFeedback({ message, errorType: 'success' });
    }, [errorFeedback]),

    // Notification
    notification: useCallback(async (title, type = 'info') => {
      return await notificationFeedback({ title, type });
    }, [notificationFeedback]),

    // Navigation
    navigate: useCallback(async (screen, action = 'navigate') => {
      return await navigationFeedback({ screen, action });
    }, [navigationFeedback]),

    // Chargement
    loading: useCallback(async (action, step, total) => {
      return await loadingFeedback({ action, step, total });
    }, [loadingFeedback])
  };

  return {
    // État
    isAudioEnabled,
    isHapticsEnabled,
    vibrationIntensity,
    serviceStatus,

    // Contrôles
    setAudioEnabled,
    setHapticsEnabled,
    setVibrationIntensity,

    // Actions principales
    purchaseFeedback,
    xpGainFeedback,
    missionCompleteFeedback,
    badgeUnlockFeedback,
    errorFeedback,
    notificationFeedback,
    loadingFeedback,
    navigationFeedback,
    customFeedback,
    combinedFeedback,

    // Utilitaires
    playSound,
    triggerVibration,
    getStatus,
    cleanup,

    // Feedbacks rapides
    quickFeedback
  };
};

export default useFeedback;
