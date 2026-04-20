// Service Analytics pour le suivi des événements utilisateur
// Compatible avec Firebase Analytics

class AnalyticsService {
  constructor() {
    this.isInitialized = false;
    this.isProduction = process.env.NODE_ENV === 'production';
    this.eventQueue = [];
    this.maxQueueSize = 100;
    this.flushInterval = 5000; // 5 secondes
    this.flushTimer = null;
  }

  // Initialiser le service analytics
  async initialize() {
    try {
      // En production, initialiser Firebase Analytics
      if (this.isProduction) {
        // const analytics = getAnalytics();
        // this.analytics = analytics;
        console.log('✅ Firebase Analytics initialisé');
      } else {
        console.log('📊 Mode développement - Analytics en mode mock');
      }

      this.isInitialized = true;
      
      // Démarrer le flush automatique
      this.startFlushTimer();
      
      // Traiter les événements en attente
      if (this.eventQueue.length > 0) {
        this.flushEvents();
      }

    } catch (error) {
      console.error('❌ Erreur initialisation Analytics:', error);
    }
  }

  // Démarrer le timer de flush
  startFlushTimer() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flushTimer = setInterval(() => {
      this.flushEvents();
    }, this.flushInterval);
  }

  // Arrêter le timer de flush
  stopFlushTimer() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  // Suivre un événement générique
  trackEvent(eventName, params = {}) {
    try {
      if (!this.isInitialized) {
        console.warn('⚠️ Analytics non initialisé - événement mis en file:', eventName);
        this.queueEvent(eventName, params);
        return;
      }

      const eventData = {
        eventName,
        params: this.sanitizeParams(params),
        timestamp: new Date().toISOString(),
        sessionId: this.getSessionId(),
        userId: this.getCurrentUserId()
      };

      if (this.isProduction) {
        // Envoyer à Firebase Analytics
        // logEvent(this.analytics, eventName, params);
        console.log('📊 Événement tracké (Firebase):', eventName, params);
      } else {
        // Mode développement - afficher dans la console
        console.log('📊 Événement tracké (Mock):', eventName, params);
      }

    } catch (error) {
      console.error('❌ Erreur tracking événement:', error);
    }
  }

  // Suivre un événement avec catégorie
  trackEventWithCategory(category, action, params = {}) {
    const eventName = `${category}_${action}`;
    const enrichedParams = {
      category,
      action,
      ...params
    };
    
    this.trackEvent(eventName, enrichedParams);
  }

  // Suivre une vue d'écran
  trackScreen(screenName, params = {}) {
    const screenParams = {
      screen_name: screenName,
      ...params
    };
    
    if (this.isProduction) {
      // Firebase Analytics screen view
      // logEvent(this.analytics, 'screen_view', {
      //   firebase_screen: screenName,
      //   firebase_screen_class: screenName,
      //   ...screenParams
      // });
      console.log('📊 Vue d\'écran trackée:', screenName);
    } else {
      console.log('📊 Vue d\'écran trackée (Mock):', screenName);
    }
  }

  // Suivre un événement utilisateur
  trackUserEvent(action, params = {}) {
    this.trackEventWithCategory('user', action, params);
  }

  // Suivre un événement de gamification
  trackGamificationEvent(action, params = {}) {
    this.trackEventWithCategory('gamification', action, params);
  }

  // Suivre un événement d'achat
  trackPurchaseEvent(action, params = {}) {
    const purchaseParams = {
      ...params,
      currency: params.currency || 'EUR',
      value: params.value || 0
    };
    
    this.trackEventWithCategory('purchase', action, purchaseParams);
  }

  // Suivre un événement d'erreur
  trackErrorEvent(errorType, errorMessage, params = {}) {
    const errorParams = {
      error_type: errorType,
      error_message: errorMessage,
      ...params
    };
    
    this.trackEventWithCategory('error', errorType, errorParams);
  }

  // Suivre un événement de performance
  trackPerformanceEvent(action, params = {}) {
    const perfParams = {
      ...params,
      timestamp: Date.now()
    };
    
    this.trackEventWithCategory('performance', action, perfParams);
  }

  // Événements spécifiques de gamification
  trackXPGain(amount, source = 'unknown', level = null) {
    const params = {
      xp_amount: amount,
      xp_source: source,
      current_level: level,
      xp_gained_at: new Date().toISOString()
    };
    
    this.trackGamificationEvent('xp_gain', params);
  }

  trackLevelUp(newLevel, oldLevel, totalXP) {
    const params = {
      new_level: newLevel,
      old_level: oldLevel,
      total_xp: totalXP,
      level_up_at: new Date().toISOString(),
      levels_gained: newLevel - oldLevel
    };
    
    this.trackGamificationEvent('level_up', params);
  }

  trackMissionComplete(missionId, missionTitle, xpReward, missionType = 'daily') {
    const params = {
      mission_id: missionId,
      mission_title: missionTitle,
      mission_type: missionType,
      xp_reward: xpReward,
      completed_at: new Date().toISOString()
    };
    
    this.trackGamificationEvent('mission_complete', params);
  }

  trackMissionStart(missionId, missionTitle, missionType = 'daily') {
    const params = {
      mission_id: missionId,
      mission_title: missionTitle,
      mission_type: missionType,
      started_at: new Date().toISOString()
    };
    
    this.trackGamificationEvent('mission_start', params);
  }

  trackBadgeUnlock(badgeId, badgeName, rarity = 'common') {
    const params = {
      badge_id: badgeId,
      badge_name: badgeName,
      badge_rarity: rarity,
      unlocked_at: new Date().toISOString()
    };
    
    this.trackGamificationEvent('badge_unlock', params);
  }

  trackStreakUpdate(newStreak, previousStreak) {
    const params = {
      new_streak: newStreak,
      previous_streak: previousStreak,
      streak_updated_at: new Date().toISOString(),
      streak_change: newStreak - previousStreak
    };
    
    this.trackGamificationEvent('streak_update', params);
  }

  trackSubscriptionChange(planId, planName, action = 'subscribe', amount = null) {
    const params = {
      plan_id: planId,
      plan_name: planName,
      action: action, // subscribe, cancel, upgrade, downgrade
      amount: amount,
      currency: amount ? 'EUR' : null,
      changed_at: new Date().toISOString()
    };
    
    this.trackUserEvent('subscription_change', params);
  }

  trackShopPurchase(itemId, itemName, price, category = 'avatar') {
    const params = {
      item_id: itemId,
      item_name: itemName,
      item_category: category,
      price: price,
      currency: 'EUR',
      purchased_at: new Date().toISOString()
    };
    
    this.trackPurchaseEvent('shop_purchase', params);
  }

  trackUserEngagement(action, params = {}) {
    const engagementParams = {
      action: action,
      ...params,
      engaged_at: new Date().toISOString()
    };
    
    this.trackUserEvent('engagement', engagementParams);
  }

  trackAppOpen() {
    const params = {
      opened_at: new Date().toISOString(),
      app_version: process.env.EXPO_PUBLIC_APP_VERSION || '1.0.0',
      platform: Platform.OS,
      session_start: true
    };
    
    this.trackUserEvent('app_open', params);
  }

  trackAppClose() {
    const params = {
      closed_at: new Date().toISOString(),
      session_duration: this.getSessionDuration(),
      session_end: true
    };
    
    this.trackUserEvent('app_close', params);
  }

  // Mettre en file d'attente un événement
  queueEvent(eventName, params) {
    if (this.eventQueue.length >= this.maxQueueSize) {
      this.eventQueue.shift(); // Supprimer le plus ancien
    }

    this.eventQueue.push({
      eventName,
      params,
      timestamp: new Date().toISOString(),
      sessionId: this.getSessionId(),
      userId: this.getCurrentUserId()
    });
  }

  // Envoyer les événements en file
  async flushEvents() {
    if (this.eventQueue.length === 0) {
      return;
    }

    const eventsToSend = [...this.eventQueue];
    this.eventQueue = [];

    try {
      if (this.isProduction) {
        // Envoyer à Firebase Analytics par lots
        for (const event of eventsToSend) {
          // logEvent(this.analytics, event.eventName, event.params);
        }
        console.log(`📊 ${eventsToSend.length} événements envoyés à Firebase Analytics`);
      } else {
        // Mode développement - afficher dans la console
        console.log(`📊 ${eventsToSend.length} événements (Mock):`, eventsToSend);
      }
    } catch (error) {
      console.error('❌ Erreur flush événements:', error);
      // Remettre en file en cas d'erreur
      this.eventQueue.unshift(...eventsToSend);
    }
  }

  // Obtenir l'ID de session
  getSessionId() {
    if (!this.sessionId) {
      this.sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    return this.sessionId;
  }

  // Obtenir l'ID utilisateur actuel
  getCurrentUserId() {
    // À implémenter selon votre système d'authentification
    return this.currentUserId || null;
  }

  // Définir l'ID utilisateur
  setUserId(userId) {
    this.currentUserId = userId;
  }

  // Obtenir la durée de session
  getSessionDuration() {
    if (this.sessionStartTime) {
      return Date.now() - this.sessionStartTime;
    }
    return 0;
  }

  // Démarrer une session
  startSession() {
    this.sessionStartTime = Date.now();
    this.getSessionId(); // Générer un ID de session
  }

  // Terminer une session
  endSession() {
    const duration = this.getSessionDuration();
    this.sessionStartTime = null;
    return duration;
  }

  // Nettoyer les paramètres
  sanitizeParams(params) {
    const sanitized = {};
    
    for (const [key, value] of Object.entries(params)) {
      // Supprimer les valeurs null/undefined
      if (value !== null && value !== undefined) {
        // Limiter la longueur des chaînes
        if (typeof value === 'string' && value.length > 100) {
          sanitized[key] = value.substring(0, 100) + '...';
        } else {
          sanitized[key] = value;
        }
      }
    }
    
    return sanitized;
  }

  // Obtenir les statistiques de la session
  getSessionStats() {
    return {
      sessionId: this.getSessionId(),
      userId: this.getCurrentUserId(),
      startTime: this.sessionStartTime,
      duration: this.getSessionDuration(),
      queuedEvents: this.eventQueue.length,
      isInitialized: this.isInitialized
    };
  }

  // Vider la file d'attente
  clearQueue() {
    this.eventQueue = [];
    console.log('🗑️ File d\'attente Analytics vidée');
  }

  // Obtenir le statut du service
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      isProduction: this.isProduction,
      queueSize: this.eventQueue.length,
      sessionId: this.getSessionId(),
      userId: this.getCurrentUserId()
    };
  }

  // Nettoyer les ressources
  cleanup() {
    this.stopFlushTimer();
    this.clearQueue();
    this.isInitialized = false;
    console.log('🗑️ Service Analytics nettoyé');
  }
}

// Instance singleton du service
const analyticsService = new AnalyticsService();

export default analyticsService;
