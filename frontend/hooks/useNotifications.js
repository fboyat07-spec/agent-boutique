import { useState, useEffect, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebaseClean';

// Configuration des notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const useNotifications = (userId) => {
  const [expoPushToken, setExpoPushToken] = useState(null);
  const [notification, setNotification] = useState(null);
  const [permissionStatus, setPermissionStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Configurer les notifications au montage
  useEffect(() => {
    configureNotifications();
    
    // Écouter les notifications reçues
    const subscription = Notifications.addNotificationReceivedListener(notification => {
      console.log('📱 Notification reçue:', notification);
      setNotification(notification);
    });

    // Écouter les interactions avec les notifications
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('📱 Notification cliquée:', response);
      handleNotificationResponse(response);
    });

    return () => {
      subscription.remove();
      responseSubscription.remove();
    };
  }, []);

  // Configurer les notifications
  const configureNotifications = async () => {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Notifications par défaut',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
        sound: 'default',
        enableLights: true,
        enableVibrate: true,
      });

      // Canal pour les streaks
      await Notifications.setNotificationChannelAsync('streak', {
        name: 'Alertes Streak',
        description: 'Notifications pour maintenir ton streak',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 100, 50, 100],
        lightColor: '#FF9800',
        sound: 'default',
        enableLights: true,
        enableVibrate: true,
      });

      // Canal pour les missions
      await Notifications.setNotificationChannelAsync('missions', {
        name: 'Missions Quotidiennes',
        description: 'Rappels pour tes missions quotidiennes',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 50],
        lightColor: '#4CAF50',
        sound: 'default',
        enableLights: true,
        enableVibrate: true,
      });

      // Canal pour les level up
      await Notifications.setNotificationChannelAsync('levelup', {
        name: 'Level Up',
        description: 'Félicitations pour tes nouveaux niveaux',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 100, 100, 100, 100],
        lightColor: '#9C27B0',
        sound: 'levelup_sound',
        enableLights: true,
        enableVibrate: true,
      });
    }
  };

  // Enregistrer pour les notifications push
  const registerForPushNotifications = useCallback(async () => {
    if (!userId) {
      setError('Utilisateur non connecté');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      // Vérifier si l'appareil supporte les notifications
      if (!Device.isDevice) {
        setError('Les notifications push ne fonctionnent que sur des appareils physiques');
        return null;
      }

      // Demander la permission
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      setPermissionStatus(finalStatus);

      if (finalStatus !== 'granted') {
        setError('Permission de notification refusée');
        return null;
      }

      // Obtenir le token Expo
      const token = (await Notifications.getExpoPushTokenAsync()).data;
      console.log('📱 Token Expo obtenu:', token);

      // Sauvegarder le token dans Firestore
      await savePushToken(userId, token);

      setExpoPushToken(token);
      console.log('✅ Notifications push enregistrées avec succès');
      
      return token;

    } catch (error) {
      console.error('❌ Erreur enregistrement notifications:', error);
      setError(error.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Sauvegarder le token push dans Firestore
  const savePushToken = async (userId, token) => {
    try {
      const userDocRef = doc(db, 'users', userId);
      
      await updateDoc(userDocRef, {
        pushToken: token,
        pushTokenUpdatedAt: new Date(),
        notificationSettings: {
          enabled: true,
          streakAlerts: true,
          missionReminders: true,
          levelUpNotifications: true,
          updatedAt: new Date()
        }
      });

      console.log('💾 Token push sauvegardé dans Firestore');
      
    } catch (error) {
      console.error('❌ Erreur sauvegarde token push:', error);
      throw error;
    }
  };

  // Gérer la réponse à une notification
  const handleNotificationResponse = useCallback((response) => {
    const data = response.notification.request.content.data;
    
    switch (data.type) {
      case 'streak_alert':
        console.log('🔥 Alerte streak cliquée');
        // Naviguer vers l'écran principal
        break;
      case 'mission_reminder':
        console.log('✅ Rappel mission cliqué');
        // Naviguer vers les missions
        break;
      case 'level_up':
        console.log('🎉 Level up cliqué');
        // Naviguer vers le profil
        break;
      default:
        console.log('📱 Notification cliquée:', data);
    }
  }, []);

  // Envoyer une notification locale
  const sendLocalNotification = useCallback(async (title, body, data = {}, channelId = 'default') => {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data,
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null, // Notification immédiate
        identifier: `local_${Date.now()}`,
      });

      console.log('📱 Notification locale envoyée:', title);
      
    } catch (error) {
      console.error('❌ Erreur notification locale:', error);
    }
  }, []);

  // Programmer une notification locale
  const scheduleLocalNotification = useCallback(async (title, body, trigger, data = {}, channelId = 'default') => {
    try {
      const identifier = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data,
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.DEFAULT,
        },
        trigger,
        identifier: `scheduled_${Date.now()}`,
      });

      console.log('📱 Notification programmée:', title, 'ID:', identifier);
      return identifier;
      
    } catch (error) {
      console.error('❌ Erreur programmation notification:', error);
      return null;
    }
  }, []);

  // Annuler une notification programmée
  const cancelScheduledNotification = useCallback(async (identifier) => {
    try {
      await Notifications.cancelScheduledNotificationAsync(identifier);
      console.log('📱 Notification annulée:', identifier);
      
    } catch (error) {
      console.error('❌ Erreur annulation notification:', error);
    }
  }, []);

  // Notifications prédéfinies
  const notifications = {
    // Alerte streak
    sendStreakAlert: useCallback(async (streakDays) => {
      await sendLocalNotification(
        '🔥 Ton streak est en danger !',
        `Reviens garder ton streak de ${streakDays} jours !`,
        { type: 'streak_alert', streakDays },
        'streak'
      );
    }, [sendLocalNotification]),

    // Rappel mission
    sendMissionReminder: useCallback(async (missionsCount) => {
      await sendLocalNotification(
        '✅ Missions quotidiennes',
        `Il te reste ${missionsCount} missions à compléter aujourd'hui !`,
        { type: 'mission_reminder', missionsCount },
        'missions'
      );
    }, [sendLocalNotification]),

    // Level up
    sendLevelUpNotification: useCallback(async (newLevel) => {
      await sendLocalNotification(
        '🎉 Level Up !',
        `Félicitations ! Tu as atteint le niveau ${newLevel} !`,
        { type: 'level_up', newLevel },
        'levelup'
      );
    }, [sendLocalNotification]),

    // Mission complétée
    sendMissionCompleted: useCallback(async (missionTitle, xpReward) => {
      await sendLocalNotification(
        '✅ Mission complétée !',
        `${missionTitle} - +${xpReward} XP`,
        { type: 'mission_completed', missionTitle, xpReward },
        'missions'
      );
    }, [sendLocalNotification]),

    // Badge débloqué
    sendBadgeUnlocked: useCallback(async (badgeName) => {
      await sendLocalNotification(
        '🏆 Badge débloqué !',
        `Félicitations ! Tu as débloqué le badge "${badgeName}" !`,
        { type: 'badge_unlocked', badgeName },
        'default'
      );
    }, [sendLocalNotification])
  };

  // Programmer des rappels automatiques
  const scheduleReminders = useCallback(async () => {
    if (!permissionStatus || permissionStatus !== 'granted') {
      console.log('⚠️ Permission de notification non accordée');
      return;
    }

    try {
      // Rappel quotidien à 9h
      const morningReminder = new Date();
      morningReminder.setHours(9, 0, 0, 0);
      
      if (morningReminder <= new Date()) {
        morningReminder.setDate(morningReminder.getDate() + 1);
      }

      await scheduleLocalNotification(
        '🌅 Bonjour !',
        'N\'oublie pas de compléter tes missions quotidiennes !',
        morningReminder,
        { type: 'daily_reminder' },
        'missions'
      );

      // Rappel du soir à 20h
      const eveningReminder = new Date();
      eveningReminder.setHours(20, 0, 0, 0);
      
      if (eveningReminder <= new Date()) {
        eveningReminder.setDate(eveningReminder.getDate() + 1);
      }

      await scheduleLocalNotification(
        '🌆 Soirée !',
        'As-tu complété toutes tes missions aujourd\'hui ?',
        eveningReminder,
        { type: 'evening_reminder' },
        'missions'
      );

      console.log('📱 Rappels quotidiens programmés');
      
    } catch (error) {
      console.error('❌ Erreur programmation rappels:', error);
    }
  }, [permissionStatus, scheduleLocalNotification]);

  // Mettre à jour les préférences de notification
  const updateNotificationSettings = useCallback(async (settings) => {
    if (!userId) {
      setError('Utilisateur non connecté');
      return null;
    }

    try {
      const userDocRef = doc(db, 'users', userId);
      
      await updateDoc(userDocRef, {
        notificationSettings: {
          ...settings,
          updatedAt: new Date()
        }
      });

      console.log('⚙️ Préférences de notification mises à jour');
      
    } catch (error) {
      console.error('❌ Erreur mise à jour préférences:', error);
      setError(error.message);
    }
  }, [userId]);

  // Obtenir les badges de notification
  const getNotificationBadges = useCallback(async () => {
    try {
      const badgeCount = await Notifications.getBadgeCountAsync();
      return badgeCount;
    } catch (error) {
      console.error('❌ Erreur récupération badges:', error);
      return 0;
    }
  }, []);

  // Effacer les badges de notification
  const clearNotificationBadges = useCallback(async () => {
    try {
      await Notifications.setBadgeCountAsync(0);
      console.log('📱 Badges de notification effacés');
    } catch (error) {
      console.error('❌ Erreur effacement badges:', error);
    }
  }, []);

  return {
    // État
    expoPushToken,
    notification,
    permissionStatus,
    loading,
    error,
    
    // Actions principales
    registerForPushNotifications,
    savePushToken,
    
    // Notifications locales
    sendLocalNotification,
    scheduleLocalNotification,
    cancelScheduledNotification,
    
    // Notifications prédéfinies
    ...notifications,
    
    // Gestion
    scheduleReminders,
    updateNotificationSettings,
    
    // Badges
    getNotificationBadges,
    clearNotificationBadges,
    
    // Utilitaires
    configureNotifications,
    handleNotificationResponse
  };
};

export default useNotifications;
