import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

// Interfaces pour les analytics
interface AnalyticsEvent {
  eventName: string;
  userId: string;
  params: Record<string, any>;
  timestamp: admin.firestore.Timestamp;
  sessionId?: string;
  userAgent?: string;
  platform?: string;
  sessionDuration?: number;
  userType?: string;
}

interface SessionData {
  sessionId: string;
  userId: string;
  startTime: admin.firestore.Timestamp;
  endTime?: admin.firestore.Timestamp;
  duration?: number;
  events: string[];
  deviceInfo?: Record<string, any>;
  userType?: string;
}

interface RetentionData {
  userId: string;
  cohortDate: admin.firestore.Timestamp;
  day1Active: boolean;
  day7Active: boolean;
  day30Active: boolean;
  lastActiveAt: admin.firestore.Timestamp;
  totalSessions: number;
  totalDuration: number;
}

interface ConversionData {
  userId: string;
  convertedAt: admin.firestore.Timestamp;
  conversionType: 'premium_trial' | 'premium_purchase' | 'premium_plus';
  conversionSource: string;
  timeToConversion: number;
  userSegment: string;
}

// Service Firebase Analytics
const firebaseAnalytics = admin.analytics();

// Fonction pour tracker un événement analytics
export const trackAnalyticsEvent = async (
  eventName: string,
  params: Record<string, any>,
  userId?: string,
  sessionId?: string,
  sessionDuration?: number,
  userType?: string
): Promise<void> => {
  try {
    const event: AnalyticsEvent = {
      eventName,
      userId: userId || 'anonymous',
      params,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      sessionId,
      sessionDuration,
      userType
    };

    // Ajouter l'événement à la collection analytics
    await db.collection('analytics').add(event);

    // Envoyer vers Firebase Analytics
    if (userId && userId !== 'anonymous') {
      await firebaseAnalytics.logEvent(eventName, {
        user_id: userId,
        session_id: sessionId,
        engagement_time_msec: sessionDuration,
        user_type: userType,
        ...params
      });
    }

    console.log(`📊 Analytics event tracked: ${eventName} for user ${userId || 'anonymous'}`);

  } catch (error) {
    console.error('❌ Erreur tracking analytics event:', error);
  }
};

// Démarrer une session utilisateur
export const startSession = functions.https.onCall(async (data: {
  deviceInfo?: Record<string, any>;
  userType?: string;
}, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentification requise.');
  }

  const userId = context.auth.uid;
  const { deviceInfo, userType } = data;

  try {
    const sessionId = `${userId}_${Date.now()}`;
    
    const sessionData: SessionData = {
      sessionId,
      userId,
      startTime: admin.firestore.FieldValue.serverTimestamp(),
      events: [],
      deviceInfo,
      userType
    };

    // Créer la session
    await db.collection('sessions').doc(sessionId).set(sessionData);

    // Tracker l'événement de début de session
    await trackAnalyticsEvent('session_start', {
      deviceInfo,
      userType
    }, userId, sessionId, 0, userType);

    // Mettre à jour le document utilisateur
    await db.collection('users').doc(userId).update({
      currentSessionId: sessionId,
      lastSessionStart: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`📱 Session started: ${sessionId} for user ${userId}`);

    return {
      success: true,
      sessionId
    };

  } catch (error) {
    console.error('❌ Erreur start session:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Erreur lors du démarrage de la session.',
      error instanceof Error ? error.message : 'Erreur inconnue'
    );
  }
});

// Terminer une session utilisateur
export const endSession = functions.https.onCall(async (data: {
  sessionId: string;
  endTime?: number;
}, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentification requise.');
  }

  const userId = context.auth.uid;
  const { sessionId, endTime } = data;

  try {
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    
    if (!sessionDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Session non trouvée.');
    }

    const sessionData = sessionDoc.data() as SessionData;
    const startTime = sessionData.startTime.toDate();
    const sessionEndTime = endTime ? new Date(endTime) : new Date();
    const duration = Math.floor((sessionEndTime.getTime() - startTime.getTime()) / 1000);

    // Mettre à jour la session
    await db.collection('sessions').doc(sessionId).update({
      endTime: admin.firestore.Timestamp.fromDate(sessionEndTime),
      duration,
      events: admin.firestore.FieldValue.arrayUnion('session_end')
    });

    // Tracker l'événement de fin de session
    await trackAnalyticsEvent('session_end', {
      session_duration: duration,
      events_count: sessionData.events.length
    }, userId, sessionId, duration, sessionData.userType);

    // Mettre à jour les statistiques utilisateur
    await db.collection('users').doc(userId).update({
      totalSessions: admin.firestore.FieldValue.increment(1),
      totalSessionTime: admin.firestore.FieldValue.increment(duration),
      lastSessionEnd: admin.firestore.FieldValue.serverTimestamp(),
      averageSessionTime: admin.firestore.FieldValue.increment(duration),
      currentSessionId: admin.firestore.FieldValue.delete()
    });

    console.log(`📱 Session ended: ${sessionId} for user ${userId}, duration: ${duration}s`);

    return {
      success: true,
      duration
    };

  } catch (error) {
    console.error('❌ Erreur end session:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Erreur lors de la fin de session.',
      error instanceof Error ? error.message : 'Erreur inconnue'
    );
  }
});

// Calculer la rétention (J1, J7, J30)
export const calculateRetention = functions.https.onCall(async (data: {
  cohortDate?: string;
  userId?: string;
}, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentification requise.');
  }

  const userId = data.userId || context.auth.uid;
  const cohortDate = data.cohortDate;

  try {
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Utilisateur non trouvé.');
    }

    const userData = userDoc.data();
    const createdAt = userData.createdAt?.toDate() || new Date();
    const lastActivity = userData.lastActivity?.toDate() || new Date();
    
    // Calculer les jours depuis l'inscription
    const daysSinceCreation = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
    
    // Calculer la rétention
    const retentionData: RetentionData = {
      userId,
      cohortDate: admin.firestore.Timestamp.fromDate(createdAt),
      day1Active: daysSinceCreation >= 1,
      day7Active: daysSinceCreation >= 7,
      day30Active: daysSinceCreation >= 30,
      lastActiveAt: admin.firestore.Timestamp.fromDate(lastActivity),
      totalSessions: userData.totalSessions || 0,
      totalDuration: userData.totalSessionTime || 0
    };

    // Sauvegarder les données de rétention
    await db.collection('retention').doc(userId).set(retentionData, { merge: true });

    // Envoyer vers Firebase Analytics
    await firebaseAnalytics.logEvent('retention_calculated', {
      user_id: userId,
      day1_active: retentionData.day1Active,
      day7_active: retentionData.day7Active,
      day30_active: retentionData.day30Active,
      total_sessions: retentionData.totalSessions,
      total_duration: retentionData.totalDuration
    });

    console.log(`📊 Retention calculated for user ${userId}: D1=${retentionData.day1Active}, D7=${retentionData.day7Active}, D30=${retentionData.day30Active}`);

    return {
      success: true,
      retention: retentionData
    };

  } catch (error) {
    console.error('❌ Erreur calculate retention:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Erreur lors du calcul de rétention.',
      error instanceof Error ? error.message : 'Erreur inconnue'
    );
  }
});

// Tracker la conversion premium
export const trackPremiumConversion = functions.https.onCall(async (data: {
  conversionType: 'premium_trial' | 'premium_purchase' | 'premium_plus';
  conversionSource: string;
  offerId?: string;
}, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentification requise.');
  }

  const userId = context.auth.uid;
  const { conversionType, conversionSource, offerId } = data;

  try {
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Utilisateur non trouvé.');
    }

    const userData = userDoc.data();
    const createdAt = userData.createdAt?.toDate() || new Date();
    const timeToConversion = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

    // Déterminer le segment utilisateur
    const userSegment = getUserSegment(userData);

    const conversionData: ConversionData = {
      userId,
      convertedAt: admin.firestore.FieldValue.serverTimestamp(),
      conversionType,
      conversionSource,
      timeToConversion,
      userSegment
    };

    // Sauvegarder la conversion
    await db.collection('conversions').doc(userId).set(conversionData, { merge: true });

    // Mettre à jour le document utilisateur
    await db.collection('users').doc(userId).update({
      subscription: {
        planId: conversionType === 'premium_plus' ? 'premium_plus' : 'premium',
        status: 'active',
        startDate: admin.firestore.FieldValue.serverTimestamp(),
        conversionSource,
        offerId
      },
      hasConverted: true,
      conversionDate: admin.firestore.FieldValue.serverTimestamp(),
      conversionType
    });

    // Envoyer vers Firebase Analytics
    await firebaseAnalytics.logEvent('premium_conversion', {
      user_id: userId,
      conversion_type: conversionType,
      conversion_source: conversionSource,
      time_to_conversion: timeToConversion,
      user_segment: userSegment,
      offer_id: offerId
    });

    // Tracker l'événement analytics
    await trackAnalyticsEvent('premium_conversion', {
      conversion_type: conversionType,
      conversion_source: conversionSource,
      time_to_conversion: timeToConversion,
      user_segment: userSegment,
      offer_id: offerId
    }, userId, undefined, undefined, userSegment);

    console.log(`💰 Premium conversion tracked: ${conversionType} for user ${userId}`);

    return {
      success: true,
      conversion: conversionData
    };

  } catch (error) {
    console.error('❌ Erreur track premium conversion:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Erreur lors du tracking de conversion premium.',
      error instanceof Error ? error.message : 'Erreur inconnue'
    );
  }
});

// Obtenir les statistiques analytics améliorées
export const getAnalyticsStats = functions.https.onCall(async (data: { 
  eventName?: string; 
  startDate?: string; 
  endDate?: string; 
  limit?: number;
  includeRetention?: boolean;
  includeConversions?: boolean;
}, context) => {
  // Vérifier l'authentification (admin uniquement)
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentification requise.');
  }

  const { eventName, startDate, endDate, limit = 1000, includeRetention, includeConversions } = data;

  try {
    let query = db.collection('analytics');

    // Filtrer par nom d'événement
    if (eventName) {
      query = query.where('eventName', '==', eventName);
    }

    // Filtrer par date
    if (startDate) {
      query = query.where('timestamp', '>=', new Date(startDate));
    }

    if (endDate) {
      query = query.where('timestamp', '<=', new Date(endDate));
    }

    // Limiter les résultats
    query = query.limit(limit);

    const snapshot = await query.get();
    const events = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    let result: any = {
      success: true,
      events,
      total: events.length
    };

    // Inclure les données de rétention
    if (includeRetention) {
      const retentionSnapshot = await db.collection('retention').get();
      const retentionData = retentionSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      result.retention = {
        data: retentionData,
        stats: calculateRetentionStats(retentionData)
      };
    }

    // Inclure les données de conversion
    if (includeConversions) {
      const conversionSnapshot = await db.collection('conversions').get();
      const conversionData = conversionSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      result.conversions = {
        data: conversionData,
        stats: calculateConversionStats(conversionData)
      };
    }

    return result;

  } catch (error) {
    console.error('❌ Erreur get analytics stats:', error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError(
      'internal',
      'Erreur lors de la récupération des statistiques analytics.',
      error instanceof Error ? error.message : 'Erreur inconnue'
    );
  }
});

// Fonction utilitaire pour déterminer le segment utilisateur
function getUserSegment(userData: any): string {
  const now = new Date();
  const createdAt = userData.createdAt?.toDate() || new Date();
  const lastActivity = userData.lastActivity?.toDate() || new Date();
  
  const daysSinceCreation = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
  const daysSinceLastActivity = Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));
  
  const currentXP = userData.xp || 0;
  const isPremium = userData.subscription?.planId !== 'free';

  if (isPremium) return 'premium_user';
  if (daysSinceCreation <= 7) return 'new_user';
  if (daysSinceLastActivity >= 7) return 'inactive_user';
  if (daysSinceLastActivity >= 3) return 'churn_risk';
  if (currentXP > 5000) return 'power_user';
  return 'active_user';
}

// Calculer les statistiques de rétention
function calculateRetentionStats(retentionData: any[]) {
  const totalUsers = retentionData.length;
  const day1Active = retentionData.filter(r => r.day1Active).length;
  const day7Active = retentionData.filter(r => r.day7Active).length;
  const day30Active = retentionData.filter(r => r.day30Active).length;

  return {
    totalUsers,
    day1Rate: totalUsers > 0 ? (day1Active / totalUsers) * 100 : 0,
    day7Rate: totalUsers > 0 ? (day7Active / totalUsers) * 100 : 0,
    day30Rate: totalUsers > 0 ? (day30Active / totalUsers) * 100 : 0,
    averageSessions: totalUsers > 0 ? retentionData.reduce((sum, r) => sum + r.totalSessions, 0) / totalUsers : 0,
    averageDuration: totalUsers > 0 ? retentionData.reduce((sum, r) => sum + r.totalDuration, 0) / totalUsers : 0
  };
}

// Calculer les statistiques de conversion
function calculateConversionStats(conversionData: any[]) {
  const totalConversions = conversionData.length;
  const trials = conversionData.filter(c => c.conversionType === 'premium_trial').length;
  const purchases = conversionData.filter(c => c.conversionType === 'premium_purchase').length;
  const plusUpgrades = conversionData.filter(c => c.conversionType === 'premium_plus').length;

  const avgTimeToConversion = totalConversions > 0 ? 
    conversionData.reduce((sum, c) => sum + c.timeToConversion, 0) / totalConversions : 0;

  return {
    totalConversions,
    trials,
    purchases,
    plusUpgrades,
    trialRate: totalConversions > 0 ? (trials / totalConversions) * 100 : 0,
    purchaseRate: totalConversions > 0 ? (purchases / totalConversions) * 100 : 0,
    plusRate: totalConversions > 0 ? (plusUpgrades / totalConversions) * 100 : 0,
    avgTimeToConversion
  };
}

// Fonction CRON pour calculer la rétention quotidienne
export const dailyRetentionCalculation = functions.pubsub
  .schedule('0 2 * * *') // Tous les jours à 2h UTC
  .timeZone('Europe/Paris')
  .onRun(async (context) => {
    console.log('🔄 Début du calcul de rétention quotidienne');

    try {
      // Récupérer tous les utilisateurs actifs
      const usersSnapshot = await db
        .collection('users')
        .where('lastActivity', '>=', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000))
        .get();

      const batchSize = 50;
      const batches = [];

      for (let i = 0; i < usersSnapshot.docs.length; i += batchSize) {
        batches.push(usersSnapshot.docs.slice(i, i + batchSize));
      }

      for (const batch of batches) {
        await Promise.all(batch.map(async (userDoc) => {
          const userId = userDoc.id;
          await calculateRetention({ userId }, { auth: { uid: 'system' } } as any);
        }));
      }

      console.log(`✅ Rétention calculée pour ${usersSnapshot.size} utilisateurs`);

    } catch (error) {
      console.error('❌ Erreur calcul rétention quotidienne:', error);
    }
  });
