import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import fetch from 'node-fetch';

const db = admin.firestore();

// Vérifier l'authentification de l'utilisateur
const authenticateUser = (request: any): { userId: string; error?: string } => {
  if (!request.auth) {
    throw new HttpsError(
      'unauthenticated',
      'Authentification requise'
    );
  }

  const userId = request.auth.uid;
  if (!userId) {
    throw new HttpsError(
      'unauthenticated',
      'UID utilisateur manquant'
    );
  }

  return { userId };
};

// Interface pour les données de notification
interface NotificationData {
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: string;
  priority?: 'high' | 'normal' | 'low';
  channelId?: string;
}

// Interface pour les tokens push
interface PushToken {
  token: string;
  userId: string;
  updatedAt: admin.firestore.Timestamp;
}

// Envoyer une notification push à un utilisateur
export const sendPushNotification = async (
  userId: string,
  notification: NotificationData
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Récupérer le token push de l'utilisateur
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return { success: false, error: 'Utilisateur non trouvé' };
    }

    const userData = userDoc.data()!;
    const pushToken = userData.pushToken;

    if (!pushToken) {
      console.log(`⚠️ Pas de token push pour l'utilisateur ${userId}`);
      return { success: false, error: 'Pas de token push' };
    }

    // Vérifier si les notifications sont activées
    const notificationSettings = userData.notificationSettings;
    if (notificationSettings && !notificationSettings.enabled) {
      console.log(`⚠️ Notifications désactivées pour l'utilisateur ${userId}`);
      return { success: false, error: 'Notifications désactivées' };
    }

    // Préparer le message
    const message = {
      to: pushToken,
      sound: notification.sound || 'default',
      title: notification.title,
      body: notification.body,
      data: {
        userId,
        ...notification.data
      },
      priority: notification.priority || 'high',
      channelId: notification.channelId || 'default',
      _displayInForeground: true,
    };

    // Envoyer via Expo API
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const result = await response.json() as any;

    if (result.data.status === 'ok') {
      console.log(`✅ Notification push envoyée à ${userId}:`, notification.title);
      return { success: true };
    } else {
      console.error(`❌ Erreur envoi notification à ${userId}:`, result);
      
      // Si le token est invalide, le supprimer
      if (result.data.status === 'error' && result.data.message.includes('DeviceNotRegistered')) {
        await db.collection('users').doc(userId).update({
          pushToken: admin.firestore.FieldValue.delete(),
          pushTokenUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`🗑️ Token invalide supprimé pour ${userId}`);
      }
      
      return { success: false, error: result.data.message };
    }

  } catch (error) {
    console.error(`❌ Erreur envoi notification push à ${userId}:`, error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Erreur inconnue' 
    };
  }
};

// Envoyer des notifications en lot
export const sendBulkNotifications = async (
  notifications: Array<{ userId: string; notification: NotificationData }>
): Promise<{ success: number; failed: number; errors: string[] }> => {
  const results = { success: 0, failed: 0, errors: [] as string[] };

  for (const { userId, notification } of notifications) {
    const result = await sendPushNotification(userId, notification);
    
    if (result.success) {
      results.success++;
    } else {
      results.failed++;
      results.errors.push(`${userId}: ${result.error}`);
    }
  }

  console.log(`📊 Notifications en lot: ${results.success} succès, ${results.failed} échecs`);
  return results;
};

// Vérifier les utilisateurs inactifs et envoyer des rappels
export const checkInactiveUsers = onRequest(async (request, response) => {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    // Récupérer les utilisateurs inactifs depuis 24h
    const inactiveUsersSnapshot = await db
      .collection('users')
      .where('lastActivity', '<', twentyFourHoursAgo)
      .where('pushToken', '!=', null)
      .get();

    const notifications = inactiveUsersSnapshot.docs.map(doc => ({
      userId: doc.id,
      notification: {
        title: '👋 On te retrouve ?',
        body: 'Ça fait un moment qu\'on ne t\'a pas vu ! Reviens compléter tes missions quotidiennes !',
        data: { type: 'inactive_reminder' },
        channelId: 'missions',
        priority: 'normal' as const
      }
    }));

    if (notifications.length > 0) {
      const results = await sendBulkNotifications(notifications);
      
      response.status(200).json({
        success: true,
        message: `${notifications.length} utilisateurs inactifs vérifiés`,
        results
      });
    } else {
      response.status(200).json({
        success: true,
        message: 'Aucun utilisateur inactif trouvé'
      });
    }

  } catch (error) {
    console.error('❌ Erreur check inactive users:', error);
    response.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue'
    });
  }
});

// Vérifier les streaks en danger
export const checkStreakAlerts = onRequest(async (request, response) => {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Récupérer les utilisateurs avec un streak > 0 mais pas d'activité aujourd'hui
    const usersWithStreakSnapshot = await db
      .collection('users')
      .where('streak', '>', 0)
      .where('lastActivity', '<', today)
      .where('pushToken', '!=', null)
      .get();

    const notifications = usersWithStreakSnapshot.docs.map(doc => {
      const userData = doc.data()!;
      const streakDays = userData.streak || 0;
      
      return {
        userId: doc.id,
        notification: {
          title: '🔥 Ton streak est en danger !',
          body: `Reviens garder ton streak de ${streakDays} jours !`,
          data: { 
            type: 'streak_alert', 
            streakDays,
            lastStreakDate: userData.lastActivity
          },
          channelId: 'streak',
          priority: 'high' as const,
          sound: 'default'
        }
      };
    });

    if (notifications.length > 0) {
      const results = await sendBulkNotifications(notifications);
      
      response.status(200).json({
        success: true,
        message: `${notifications.length} alertes streak envoyées`,
        results
      });
    } else {
      response.status(200).json({
        success: true,
        message: 'Aucune alerte streak nécessaire'
      });
    }

  } catch (error) {
    console.error('❌ Erreur check streak alerts:', error);
    response.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue'
    });
  }
});

// Envoyer un rappel de mission quotidienne
export const sendMissionReminder = onCall(async (request) => {
  // Vérifier l'authentification
  const { userId } = authenticateUser(request);
  
  // Utiliser request.data pour les données
  const data = request.data || {};
  const targetUserId = data.userId || userId;

  try {
    const userDoc = await db.collection('users').doc(targetUserId).get();
    
    if (!userDoc.exists) {
      throw new HttpsError(
        'not-found',
        'Utilisateur non trouvé'
      );
    }

    const userData = userDoc.data()!;
    const missions = userData.missions || { daily: [] };
    
    // Compter les missions non complétées
    const incompleteMissions = missions.daily.filter((mission: any) => !mission.completed).length;

    if (incompleteMissions > 0) {
      const notification = {
        title: '✅ Missions en attente',
        body: `Il te reste ${incompleteMissions} mission${incompleteMissions > 1 ? 's' : ''} à compléter aujourd'hui !`,
        data: { 
          type: 'mission_reminder', 
          incompleteMissions 
        },
        channelId: 'missions',
        priority: 'normal' as const
      };

      const result = await sendNotification(targetUserId, notification);
      
      return {
        success: result.success,
        message: result.success ? 
          `Rappel envoyé (${incompleteMissions} missions restantes)` : 
          result.error
      };
    } else {
      return {
        success: true,
        message: 'Toutes les missions sont déjà complétées !'
      };
    }

  } catch (error) {
    console.error('❌ Erreur envoi rappel mission:', error);
    
    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError(
      'internal',
      'Erreur lors de l\'envoi du rappel de mission',
      error instanceof Error ? error.message : 'Erreur inconnue'
    );
  }
});

// Envoyer une notification de level up
export const levelUpNotification = onCall(async (request) => {
  // Vérifier l'authentification
  const { userId } = authenticateUser(request);
  
  // Utiliser request.data pour les données
  const data = request.data || {};
  const targetUserId = data.userId || userId;
  const { newLevel, oldLevel } = data;

  try {
    const notification = {
      title: '🎉 Level Up !',
      body: `Félicitations ! Tu as atteint le niveau ${newLevel} !`,
      data: { 
        type: 'level_up', 
        newLevel, 
        oldLevel,
        levelUpDate: new Date().toISOString()
      },
      channelId: 'levelup',
      priority: 'high' as const,
      sound: 'levelup_sound'
    };

    const result = await sendPushNotification(userId, notification);
    
    return {
      success: result.success,
      message: result.success ? 
        `Notification level up envoyée (niveau ${newLevel})` : 
        result.error
    };

  } catch (error) {
    console.error('❌ Erreur envoi notification level up:', error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError(
      'internal',
      'Erreur lors de l\'envoi de la notification de level up',
      error instanceof Error ? error.message : 'Erreur inconnue'
    );
  }
});

// Mettre à jour les préférences de notification
export const updateNotificationSettings = onCall(async (request) => {
  // Vérifier l'authentification
  const { userId } = authenticateUser(request);
  
  // Utiliser request.data pour les données
  const data = request.data || {};
  const { 
    enabled, 
    streakAlerts, 
    missionReminders, 
    levelUpNotifications 
  } = data;

  try {
    const userDocRef = db.collection('users').doc(userId);
    
    await userDocRef.update({
      notificationSettings: {
        enabled: data.enabled,
        streakAlerts: data.streakAlerts,
        missionReminders: data.missionReminders,
        levelUpNotifications: data.levelUpNotifications,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }
    });

    console.log(`⚙️ Préférences de notification mises à jour pour ${userId}`);

    return {
      success: true,
      message: 'Préférences de notification mises à jour'
    };

  } catch (error) {
    console.error('❌ Erreur mise à jour préférences notification:', error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError(
      'internal',
      'Erreur lors de la mise à jour des préférences de notification',
      error instanceof Error ? error.message : 'Erreur inconnue'
    );
  }
});

// Fonction CRON pour les vérifications automatiques (si déployé)
export const scheduledNotifications = functions.https.onRequest(async (req, res) => {
  try {
    // Vérifier les streaks (matin à 9h)
    await checkStreakAlerts(req, res);
    
    // Vérifier les utilisateurs inactifs (soir à 20h)
    // await checkInactiveUsers(req, res);

  } catch (error) {
    console.error('❌ Erreur scheduled notifications:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue'
    });
  }
});
