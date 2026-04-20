import { useState, useEffect, useCallback } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';

const useAnalyticsEnhanced = (userId) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [eventQueue, setEventQueue] = useState([]);
  const [retentionData, setRetentionData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const functions = getFunctions();

  // Initialiser le service analytics amélioré
  useEffect(() => {
    if (userId) {
      initializeAnalytics();
    }
  }, [userId]);

  const initializeAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);

      // Récupérer les informations sur l'appareil
      const deviceInfo = getDeviceInfo();
      const userType = determineUserType();

      // Démarrer une session
      const startSessionFunc = httpsCallable(functions, 'startSession');
      const result = await startSessionFunc({
        deviceInfo,
        userType
      });

      if (result.data.success) {
        setCurrentSessionId(result.data.sessionId);
        setSessionStartTime(Date.now());
        setIsInitialized(true);

        // Tracker l'ouverture de l'app
        await trackEvent('app_open', {
          device_info: deviceInfo,
          user_type: userType,
          session_id: result.data.sessionId
        });

        console.log('✅ Analytics amélioré initialisé:', result.data.sessionId);
      }

    } catch (error) {
      console.error('❌ Erreur initialisation analytics amélioré:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Terminer la session
  const endSession = useCallback(async () => {
    if (!currentSessionId || !sessionStartTime) return;

    try {
      const sessionDuration = Math.floor((Date.now() - sessionStartTime) / 1000);

      const endSessionFunc = httpsCallable(functions, 'endSession');
      const result = await endSessionFunc({
        sessionId: currentSessionId,
        endTime: Date.now()
      });

      if (result.data.success) {
        // Tracker la fin de session
        await trackEvent('session_end', {
          session_id: currentSessionId,
          session_duration: sessionDuration,
          events_count: eventQueue.length
        });

        console.log(`✅ Session terminée: ${currentSessionId}, durée: ${sessionDuration}s`);
      }

      setCurrentSessionId(null);
      setSessionStartTime(null);
      setEventQueue([]);

    } catch (error) {
      console.error('❌ Erreur fin de session:', error);
    }
  }, [currentSessionId, sessionStartTime, eventQueue]);

  // Fonction principale de tracking
  const trackEvent = useCallback(async (eventName, params = {}) => {
    if (!isInitialized || !userId) {
      console.warn('⚠️ Analytics non initialisé ou userId manquant');
      return;
    }

    try {
      const trackEventFunc = httpsCallable(functions, 'trackAnalyticsEvent');
      
      // Ajouter des informations de session
      const enhancedParams = {
        ...params,
        session_id: currentSessionId,
        session_duration: sessionStartTime ? Math.floor((Date.now() - sessionStartTime) / 1000) : 0,
        user_type: determineUserType(),
        device_info: getDeviceInfo()
      };

      await trackEventFunc({
        eventName,
        params: enhancedParams,
        userId,
        sessionId: currentSessionId,
        sessionDuration: enhancedParams.session_duration,
        userType: enhancedParams.user_type
      });

      // Ajouter à la queue locale
      setEventQueue(prev => [...prev, { eventName, params: enhancedParams, timestamp: Date.now() }]);

      console.log(`📊 Event tracked: ${eventName}`);

    } catch (error) {
      console.error('❌ Erreur tracking event:', error);
    }
  }, [isInitialized, userId, currentSessionId, sessionStartTime]);

  // Calculer la rétention
  const calculateRetention = useCallback(async () => {
    if (!userId) return;

    try {
      setLoading(true);
      setError(null);

      const calculateRetentionFunc = httpsCallable(functions, 'calculateRetention');
      const result = await calculateRetentionFunc({
        userId
      });

      if (result.data.success) {
        setRetentionData(result.data.retention);

        // Tracker le calcul de rétention
        await trackEvent('retention_calculated', {
          day1_active: result.data.retention.day1Active,
          day7_active: result.data.retention.day7Active,
          day30_active: result.data.retention.day30Active,
          total_sessions: result.data.retention.totalSessions,
          total_duration: result.data.retention.totalDuration
        });

        console.log('📊 Rétention calculée:', result.data.retention);
      }

    } catch (error) {
      console.error('❌ Erreur calcul rétention:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [userId, trackEvent]);

  // Tracker la conversion premium
  const trackPremiumConversion = useCallback(async (conversionType, conversionSource, offerId) => {
    if (!userId) return;

    try {
      setLoading(true);
      setError(null);

      const trackConversionFunc = httpsCallable(functions, 'trackPremiumConversion');
      const result = await trackConversionFunc({
        conversionType,
        conversionSource,
        offerId
      });

      if (result.data.success) {
        // Tracker la conversion
        await trackEvent('premium_conversion', {
          conversion_type: conversionType,
          conversion_source: conversionSource,
          offer_id: offerId,
          user_segment: result.data.conversion.userSegment,
          time_to_conversion: result.data.conversion.timeToConversion
        });

        console.log('💰 Conversion premium trackée:', result.data.conversion);
        return result.data.conversion;
      }

    } catch (error) {
      console.error('❌ Erreur tracking conversion premium:', error);
      setError(error.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [userId, trackEvent]);

  // Obtenir les statistiques analytics
  const getAnalyticsStats = useCallback(async (options = {}) => {
    try {
      setLoading(true);
      setError(null);

      const getStatsFunc = httpsCallable(functions, 'getAnalyticsStats');
      const result = await getStatsFunc({
        eventName: options.eventName,
        startDate: options.startDate,
        endDate: options.endDate,
        limit: options.limit,
        includeRetention: options.includeRetention || false,
        includeConversions: options.includeConversions || false
      });

      if (result.data.success) {
        console.log('📊 Stats analytics récupérées:', result.data);
        return result.data;
      }

    } catch (error) {
      console.error('❌ Erreur récupération stats analytics:', error);
      setError(error.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Fonctions de tracking spécifiques
  const trackScreenView = useCallback(async (screenName, params = {}) => {
    await trackEvent('screen_view', {
      screen_name: screenName,
      ...params
    });
  }, [trackEvent]);

  const trackUserAction = useCallback(async (action, params = {}) => {
    await trackEvent('user_action', {
      action,
      ...params
    });
  }, [trackEvent]);

  const trackEngagement = useCallback(async (engagementType, params = {}) => {
    await trackEvent('engagement', {
      engagement_type: engagementType,
      ...params
    });
  }, [trackEvent]);

  const trackError = useCallback(async (errorType, errorMessage, params = {}) => {
    await trackEvent('error', {
      error_type: errorType,
      error_message: errorMessage,
      ...params
    });
  }, [trackEvent]);

  const trackPerformance = useCallback(async (metricName, value, params = {}) => {
    await trackEvent('performance', {
      metric_name: metricName,
      value,
      ...params
    });
  }, [trackEvent]);

  // Nettoyage au démontage
  useEffect(() => {
    return () => {
      if (currentSessionId) {
        endSession();
      }
    };
  }, [currentSessionId, endSession]);

  return {
    // État
    isInitialized,
    currentSessionId,
    sessionStartTime,
    eventQueue,
    retentionData,
    loading,
    error,

    // Actions principales
    trackEvent,
    endSession,
    calculateRetention,
    trackPremiumConversion,
    getAnalyticsStats,

    // Actions spécifiques
    trackScreenView,
    trackUserAction,
    trackEngagement,
    trackError,
    trackPerformance
  };
};

// Fonctions utilitaires
const getDeviceInfo = () => {
  return {
    platform: Platform.OS,
    version: Platform.Version,
    brand: Device.brand,
    model: Device.model,
    isEmulator: !Device.isDevice,
    appVersion: '1.0.0', // À récupérer depuis package.json
    buildNumber: '1', // À récupérer depuis package.json
    screenWidth: Dimensions.get('window').width,
    screenHeight: Dimensions.get('window').height,
    timezone: new Date().getTimezoneOffset()
  };
};

const determineUserType = () => {
  // Logique pour déterminer le type d'utilisateur
  // Peut être basé sur des préférences, l'abonnement, etc.
  return 'regular'; // Par défaut
};

export default useAnalyticsEnhanced;
