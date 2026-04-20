import { useState, useEffect, useCallback } from 'react';
import analyticsService from './analyticsService';

const useAnalytics = (userId) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [sessionStats, setSessionStats] = useState(null);
  const [eventQueue, setEventQueue] = useState([]);

  // Initialiser le service analytics
  useEffect(() => {
    const initializeAnalytics = async () => {
      try {
        // Définir l'ID utilisateur
        if (userId) {
          analyticsService.setUserId(userId);
        }

        // Initialiser le service
        await analyticsService.initialize();
        setIsInitialized(true);

        // Démarrer la session
        analyticsService.startSession();

        // Suivre l'ouverture de l'app
        analyticsService.trackAppOpen();

        // Obtenir les statistiques de session
        setSessionStats(analyticsService.getSessionStats());

        console.log('✅ Analytics initialisé pour utilisateur:', userId);
      } catch (error) {
        console.error('❌ Erreur initialisation analytics:', error);
        setIsInitialized(false);
      }
    };

    initializeAnalytics();

    // Nettoyage au démontage
    return () => {
      analyticsService.trackAppClose();
      analyticsService.endSession();
      analyticsService.cleanup();
    };
  }, [userId]);

  // Fonction principale de tracking
  const trackEvent = useCallback((eventName, params = {}) => {
    if (!isInitialized) {
      console.warn('⚠️ Analytics non initialisé - événement ignoré:', eventName);
      return;
    }

    analyticsService.trackEvent(eventName, params);
  }, [isInitialized]);

  // Fonction avec catégorie
  const trackEventWithCategory = useCallback((category, action, params = {}) => {
    if (!isInitialized) return;

    analyticsService.trackEventWithCategory(category, action, params);
  }, [isInitialized]);

  // Tracking des vues d'écran
  const trackScreen = useCallback((screenName, params = {}) => {
    if (!isInitialized) return;

    analyticsService.trackScreen(screenName, params);
  }, [isInitialized]);

  // Tracking des événements utilisateur
  const trackUserEvent = useCallback((action, params = {}) => {
    if (!isInitialized) return;

    analyticsService.trackUserEvent(action, params);
  }, [isInitialized]);

  // Tracking des événements de gamification
  const trackGamificationEvent = useCallback((action, params = {}) => {
    if (!isInitialized) return;

    analyticsService.trackGamificationEvent(action, params);
  }, [isInitialized]);

  // Tracking des achats
  const trackPurchaseEvent = useCallback((action, params = {}) => {
    if (!isInitialized) return;

    analyticsService.trackPurchaseEvent(action, params);
  }, [isInitialized]);

  // Tracking des erreurs
  const trackErrorEvent = useCallback((errorType, errorMessage, params = {}) => {
    if (!isInitialized) return;

    analyticsService.trackErrorEvent(errorType, errorMessage, params);
  }, [isInitialized]);

  // Tracking de performance
  const trackPerformanceEvent = useCallback((action, params = {}) => {
    if (!isInitialized) return;

    analyticsService.trackPerformanceEvent(action, params);
  }, [isInitialized]);

  // Fonctions spécifiques de gamification
  const trackXPGain = useCallback((amount, source = 'unknown', level = null) => {
    if (!isInitialized) return;

    analyticsService.trackXPGain(amount, source, level);
  }, [isInitialized]);

  const trackLevelUp = useCallback((newLevel, oldLevel, totalXP) => {
    if (!isInitialized) return;

    analyticsService.trackLevelUp(newLevel, oldLevel, totalXP);
  }, [isInitialized]);

  const trackMissionComplete = useCallback((missionId, missionTitle, xpReward, missionType = 'daily') => {
    if (!isInitialized) return;

    analyticsService.trackMissionComplete(missionId, missionTitle, xpReward, missionType);
  }, [isInitialized]);

  const trackMissionStart = useCallback((missionId, missionTitle, missionType = 'daily') => {
    if (!isInitialized) return;

    analyticsService.trackMissionStart(missionId, missionTitle, missionType);
  }, [isInitialized]);

  const trackBadgeUnlock = useCallback((badgeId, badgeName, rarity = 'common') => {
    if (!isInitialized) return;

    analyticsService.trackBadgeUnlock(badgeId, badgeName, rarity);
  }, [isInitialized]);

  const trackStreakUpdate = useCallback((newStreak, previousStreak) => {
    if (!isInitialized) return;

    analyticsService.trackStreakUpdate(newStreak, previousStreak);
  }, [isInitialized]);

  // Tracking des abonnements
  const trackSubscriptionChange = useCallback((planId, planName, action = 'subscribe', amount = null) => {
    if (!isInitialized) return;

    analyticsService.trackSubscriptionChange(planId, planName, action, amount);
  }, [isInitialized]);

  // Tracking du shop
  const trackShopPurchase = useCallback((itemId, itemName, price, category = 'avatar') => {
    if (!isInitialized) return;

    analyticsService.trackShopPurchase(itemId, itemName, price, category);
  }, [isInitialized]);

  // Tracking de l'engagement
  const trackUserEngagement = useCallback((action, params = {}) => {
    if (!isInitialized) return;

    analyticsService.trackUserEngagement(action, params);
  }, [isInitialized]);

  // Forcer le flush des événements
  const flushEvents = useCallback(() => {
    if (!isInitialized) return;

    analyticsService.flushEvents();
  }, [isInitialized]);

  // Vider la file d'attente
  const clearQueue = useCallback(() => {
    if (!isInitialized) return;

    analyticsService.clearQueue();
    setEventQueue([]);
  }, [isInitialized]);

  // Obtenir les statistiques du service
  const getAnalyticsStatus = useCallback(() => {
    return analyticsService.getStatus();
  }, [isInitialized]);

  // Obtenir les statistiques de session
  const getSessionStatistics = useCallback(() => {
    return analyticsService.getSessionStats();
  }, [isInitialized]);

  // Mettre à jour les statistiques de session
  useEffect(() => {
    if (isInitialized) {
      const stats = analyticsService.getSessionStats();
      setSessionStats(stats);
      setEventQueue(stats.queuedEvents || []);
    }
  }, [isInitialized]);

  // Tracking automatique des événements courants
  const trackCommonEvents = useCallback((eventType, data) => {
    switch (eventType) {
      case 'xp_gain':
        trackXPGain(data.amount, data.source, data.level);
        break;
      case 'level_up':
        trackLevelUp(data.newLevel, data.oldLevel, data.totalXP);
        break;
      case 'mission_complete':
        trackMissionComplete(data.missionId, data.missionTitle, data.xpReward, data.missionType);
        break;
      case 'mission_start':
        trackMissionStart(data.missionId, data.missionTitle, data.missionType);
        break;
      case 'badge_unlock':
        trackBadgeUnlock(data.badgeId, data.badgeName, data.rarity);
        break;
      case 'streak_update':
        trackStreakUpdate(data.newStreak, data.previousStreak);
        break;
      case 'subscription_change':
        trackSubscriptionChange(data.planId, data.planName, data.action, data.amount);
        break;
      case 'shop_purchase':
        trackShopPurchase(data.itemId, data.itemName, data.price, data.category);
        break;
      case 'screen_view':
        trackScreen(data.screenName, data.params);
        break;
      case 'user_engagement':
        trackUserEngagement(data.action, data.params);
        break;
      case 'error':
        trackErrorEvent(data.errorType, data.errorMessage, data.params);
        break;
      default:
        trackEvent(data.eventName || eventType, data.params || {});
    }
  }, [
    trackXPGain, trackLevelUp, trackMissionComplete, trackMissionStart,
    trackBadgeUnlock, trackStreakUpdate, trackSubscriptionChange,
    trackShopPurchase, trackScreen, trackUserEngagement,
    trackErrorEvent, trackEvent
  ]);

  return {
    // État
    isInitialized,
    sessionStats,
    eventQueue,
    
    // Fonctions principales
    trackEvent,
    trackEventWithCategory,
    trackScreen,
    trackUserEvent,
    trackGamificationEvent,
    trackPurchaseEvent,
    trackErrorEvent,
    trackPerformanceEvent,
    
    // Fonctions spécifiques
    trackXPGain,
    trackLevelUp,
    trackMissionComplete,
    trackMissionStart,
    trackBadgeUnlock,
    trackStreakUpdate,
    trackSubscriptionChange,
    trackShopPurchase,
    trackUserEngagement,
    
    // Utilitaires
    trackCommonEvents,
    flushEvents,
    clearQueue,
    getAnalyticsStatus,
    getSessionStatistics
  };
};

export default useAnalytics;
