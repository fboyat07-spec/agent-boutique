import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { sendBulkNotifications } from "./notificationService";

const db = admin.firestore();

// Réinitialiser les missions quotidiennes (tous les jours à minuit)
export const resetDailyMissions = functions.pubsub
  .schedule('0 0 * * *') // Tous les jours à minuit UTC
  .timeZone('Europe/Paris')
  .onRun(async (context) => {
    console.log('🔄 Début de la réinitialisation des missions quotidiennes');
    
    const startTime = Date.now();
    let resetCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    try {
      // Récupérer tous les utilisateurs actifs (activité récente)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const activeUsersSnapshot = await db
        .collection('users')
        .where('lastActivity', '>=', thirtyDaysAgo)
        .get();

      console.log(`📊 ${activeUsersSnapshot.size} utilisateurs actifs trouvés`);

      // Templates de missions quotidiennes
      const missionTemplates = [
        {
          id: 'daily_interact',
          title: 'Interagir avec l\'IA',
          description: 'Pose 3 questions à l\'IA et obtiens des réponses',
          xpReward: 10,
          type: 'interaction',
          target: 3,
          current: 0
        },
        {
          id: 'daily_learn_concept',
          title: 'Apprendre un nouveau concept',
          description: 'Découvre et apprends un nouveau concept',
          xpReward: 15,
          type: 'learning',
          target: 1,
          current: 0
        },
        {
          id: 'daily_practice',
          title: 'Pratiquer 15 minutes',
          description: 'Entraîne-toi pendant 15 minutes',
          xpReward: 20,
          type: 'practice',
          target: 15,
          current: 0
        },
        {
          id: 'daily_challenge',
          title: 'Défi Quotidien',
          description: 'Releve un défi personnalisé',
          xpReward: 30,
          type: 'challenge',
          target: 1,
          current: 0
        },
        {
          id: 'daily_create',
          title: 'Créer du contenu',
          description: 'Crée et partage ton propre contenu',
          xpReward: 25,
          type: 'creation',
          target: 1,
          current: 0
        }
      ];

      // Générer des missions variées selon le jour
      const today = new Date();
      const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
      
      // Utiliser le seed pour générer des missions cohérentes
      const shuffled = [...missionTemplates].sort(() => 0.5 - Math.sin(seed));
      
      // Sélectionner 3 missions de base
      const baseMissions = shuffled.slice(0, 3);
      
      // Ajouter des missions bonus selon le "seed"
      if (seed % 3 === 0) {
        baseMissions.push(shuffled[3]); // Défi quotidien
      }
      
      if (seed % 5 === 0) {
        baseMissions.push(shuffled[4]); // Création
      }

      // Préparer les nouvelles missions
      const newDailyMissions = baseMissions.map((mission, index) => ({
        ...mission,
        id: `${mission.id}_${today.toISOString().split('T')[0]}`,
        completed: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        order: index
      }));

      // Traiter les utilisateurs par lots pour optimiser les coûts
      const batchSize = 50;
      const batches = [];
      
      for (let i = 0; i < activeUsersSnapshot.docs.length; i += batchSize) {
        batches.push(activeUsersSnapshot.docs.slice(i, i + batchSize));
      }

      // Traiter chaque lot
      for (const batch of batches) {
        const batchPromises = batch.map(async (userDoc) => {
          try {
            const userData = userDoc.data()!;
            const userId = userDoc.id;
            
            // Vérifier si l'utilisateur a déjà des missions aujourd'hui
            const currentMissions = userData.missions || { daily: [], lastReset: null };
            const lastReset = currentMissions.lastReset ? currentMissions.lastReset.toDate() : null;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            // Si déjà réinitialisé aujourd'hui, ignorer
            if (lastReset && lastReset >= today) {
              return { userId, status: 'already_reset', skipped: true };
            }

            // Réinitialiser les missions
            await db.collection('users').doc(userId).update({
              missions: {
                daily: newDailyMissions,
                lastReset: admin.firestore.FieldValue.serverTimestamp()
              },
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            resetCount++;
            return { userId, status: 'reset', missionsCount: newDailyMissions.length };
            
          } catch (error) {
            errorCount++;
            const userId = userDoc.id;
            const errorMsg = `Erreur reset missions pour ${userId}: ${error instanceof Error ? error.message : 'Erreur inconnue'}`;
            errors.push(errorMsg);
            console.error(errorMsg);
            return { userId, status: 'error', error: errorMsg };
          }
        });

        // Attendre que le lot soit terminé
        await Promise.all(batchPromises);
        
        // Pause entre les lots pour éviter les pics d'utilisation
        if (batches.indexOf(batch) < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log(`✅ Réinitialisation missions terminée:`);
      console.log(`   - Utilisateurs traités: ${activeUsersSnapshot.size}`);
      console.log(`   - Missions réinitialisées: ${resetCount}`);
      console.log(`   - Erreurs: ${errorCount}`);
      console.log(`   - Durée: ${duration}ms`);
      console.log(`   - Coût estimé: ${Math.ceil(activeUsersSnapshot.size / 100)} opérations Firestore`);

      return {
        success: true,
        message: 'Missions quotidiennes réinitialisées avec succès',
        stats: {
          totalUsers: activeUsersSnapshot.size,
          resetCount,
          errorCount,
          duration,
          missionsPerUser: newDailyMissions.length,
          cost: Math.ceil(activeUsersSnapshot.size / 100)
        },
        errors: errors.slice(0, 10) // Limiter les erreurs dans la réponse
      };

    } catch (error) {
      console.error('❌ Erreur critique réinitialisation missions:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue',
        stats: {
          totalUsers: 0,
          resetCount: 0,
          errorCount: 1,
          duration: Date.now() - startTime
        }
      };
    }
  });

// Envoyer les notifications de réengagement (toutes les 24h)
export const sendReEngagementNotifications = functions.pubsub
  .schedule('0 12 * * *') // Tous les jours à 12h UTC
  .timeZone('Europe/Paris')
  .onRun(async (context) => {
    console.log('📧 Début de l\'envoi des notifications de réengagement');
    
    const startTime = Date.now();
    let sentCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    try {
      // Utilisateurs inactifs depuis 24h à 72h
      const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const inactiveUsersSnapshot = await db
        .collection('users')
        .where('lastActivity', '<=', twentyFourHoursAgo)
        .where('lastActivity', '>=', seventyTwoHoursAgo)
        .where('pushToken', '!=', null)
        .where('notificationSettings.enabled', '==', true)
        .limit(100) // Limiter pour contrôler les coûts
        .get();

      console.log(`📊 ${inactiveUsersSnapshot.size} utilisateurs inactifs trouvés`);

      // Créer les notifications personnalisées
      const notifications = inactiveUsersSnapshot.docs.map(doc => {
        const userData = doc.data()!;
        const userId = doc.id;
        const hoursInactive = Math.floor((Date.now() - userData.lastActivity.toDate().getTime()) / (60 * 60 * 1000));
        
        // Message personnalisé selon la durée d'inactivité
        let title, body, priority;
        
        if (hoursInactive <= 48) {
          title = '👋 On te retrouve ?';
          body = `Ça fait ${hoursInactive}h qu\'on ne t\'a pas vu ! Reviens compléter tes missions quotidiennes !`;
          priority = 'normal';
        } else {
          title = '🔥 Ton streak te manque !';
          body = `Ton streak de ${userData.streak || 0} jours t\'attend ! Reviens garder ton rythme !`;
          priority = 'high';
        }

        return {
          userId,
          notification: {
            title,
            body,
            data: { 
              type: 're_engagement', 
              hoursInactive,
              lastStreak: userData.streak || 0,
              lastActivity: userData.lastActivity
            },
            channelId: 'missions',
            priority,
            sound: 'default'
          }
        };
      });

      // Envoyer les notifications par lots
      const batchSize = 10; // Plus petit pour les notifications push
      const batches = [];
      
      for (let i = 0; i < notifications.length; i += batchSize) {
        batches.push(notifications.slice(i, i + batchSize));
      }

      for (const batch of batches) {
        try {
          const results = await sendBulkNotifications(batch);
          
          sentCount += results.success;
          skippedCount += results.failed;
          
          // Ajouter les erreurs si nécessaire
          if (results.errors && results.errors.length > 0) {
            errors.push(...results.errors);
            errorCount += results.errors.length;
          }
          
        } catch (error) {
          errorCount += batch.length;
          const errorMsg = `Erreur lot de notifications: ${error instanceof Error ? error.message : 'Erreur inconnue'}`;
          errors.push(errorMsg);
          console.error(errorMsg);
        }
        
        // Pause entre les lots pour éviter les limites de rate
        if (batches.indexOf(batch) < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 seconde entre les lots
        }
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log(`✅ Notifications de réengagement envoyées:`);
      console.log(`   - Notifications envoyées: ${sentCount}`);
      console.log(`   - Notifications ignorées: ${skippedCount}`);
      console.log(`   - Erreurs: ${errorCount}`);
      console.log(`   - Durée: ${duration}ms`);
      console.log(`   - Coût estimé: ${sentCount} appels Expo API`);

      return {
        success: true,
        message: 'Notifications de réengagement envoyées avec succès',
        stats: {
          totalTargeted: notifications.length,
          sentCount,
          skippedCount,
          errorCount,
          duration,
          cost: sentCount // Chaque notification push a un coût
        },
        errors: errors.slice(0, 10)
      };

    } catch (error) {
      console.error('❌ Erreur critique notifications réengagement:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue',
        stats: {
          totalTargeted: 0,
          sentCount: 0,
          skippedCount: 0,
          errorCount: 1,
          duration: Date.now() - startTime
        }
      };
    }
  });

// Nettoyer les anciennes données (tous les dimanches à 2h du matin)
export const cleanupOldData = functions.pubsub
  .schedule('0 2 * * 0') // Tous les dimanches à 2h UTC
  .timeZone('Europe/Paris')
  .onRun(async (context) => {
    console.log('🧹 Début du nettoyage des anciennes données');
    
    const startTime = Date.now();
    let deletedAnalytics = 0;
    let deletedSessions = 0;
    let errorCount = 0;

    try {
      // Nettoyer les anciens logs d'analytics (plus de 90 jours)
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      
      const oldAnalyticsQuery = await db
        .collection('analytics')
        .where('timestamp', '<', ninetyDaysAgo)
        .limit(1000) // Limiter pour éviter les timeouts
        .get();

      if (!oldAnalyticsQuery.empty) {
        const batch = db.batch();
        
        oldAnalyticsQuery.docs.forEach(doc => {
          batch.delete(doc.ref);
          deletedAnalytics++;
        });
        
        await batch.commit();
      }

      // Nettoyer les anciennes sessions (plus de 30 jours)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const oldSessionsQuery = await db
        .collection('sessions')
        .where('createdAt', '<', thirtyDaysAgo)
        .limit(500) // Limiter pour éviter les timeouts
        .get();

      if (!oldSessionsQuery.empty) {
        const batch = db.batch();
        
        oldSessionsQuery.docs.forEach(doc => {
          batch.delete(doc.ref);
          deletedSessions++;
        });
        
        await batch.commit();
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log(`✅ Nettoyage terminé:`);
      console.log(`   - Analytics supprimés: ${deletedAnalytics}`);
      console.log(`   - Sessions supprimées: ${deletedSessions}`);
      console.log(`   - Durée: ${duration}ms`);

      return {
        success: true,
        message: 'Nettoyage des anciennes données terminé',
        stats: {
          deletedAnalytics,
          deletedSessions,
          duration,
          cost: Math.ceil((deletedAnalytics + deletedSessions) / 100)
        }
      };

    } catch (error) {
      console.error('❌ Erreur nettoyage données:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue',
        stats: {
          deletedAnalytics: 0,
          deletedSessions: 0,
          duration: Date.now() - startTime
        }
      };
    }
  });

// Fonction de test pour vérifier les scheduled functions
export const testScheduledFunctions = functions.https.onRequest(async (req, res) => {
  const functionName = req.query.function as string;
  
  console.log(`🧪 Test de la fonction: ${functionName}`);
  
  try {
    let result;
    
    switch (functionName) {
      case 'resetDailyMissions':
        result = await resetDailyMissions({} as any);
        break;
      case 'sendReEngagementNotifications':
        result = await sendReEngagementNotifications({} as any);
        break;
      case 'cleanupOldData':
        result = await cleanupOldData({} as any);
        break;
      default:
        result = {
          success: false,
          error: 'Fonction non trouvée. Options: resetDailyMissions, sendReEngagementNotifications, cleanupOldData'
        };
    }
    
    res.status(200).json({
      success: true,
      function: functionName,
      result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error(`❌ Erreur test ${functionName}:`, error);
    
    res.status(500).json({
      success: false,
      function: functionName,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
      timestamp: new Date().toISOString()
    });
  }
});
