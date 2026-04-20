import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { addXp } from "./xpService";
import { checkBadges } from "./badgeService";
import { trackAnalyticsEvent } from "./analyticsService";

const db = admin.firestore();

// Interface pour les données de mission
interface MissionData {
  missionId: string;
  metadata?: Record<string, any>;
}

// Interface pour le résultat de complétion de mission
interface CompleteMissionResult {
  success: boolean;
  missionCompleted: boolean;
  xpReward: number;
  newXP?: number;
  newLevel?: number;
  leveledUp?: boolean;
  badgesUnlocked?: string[];
  error?: string;
}

// Templates de missions quotidiennes
const DAILY_MISSIONS = [
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

// Générer les missions quotidiennes
function generateDailyMissions(): any[] {
  const today = new Date();
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  
  // Utiliser le seed pour générer des missions cohérentes pour la journée
  const shuffled = [...DAILY_MISSIONS].sort(() => 0.5 - Math.sin(seed));
  
  // Sélectionner 3 missions de base
  const baseMissions = shuffled.slice(0, 3);
  
  // Ajouter des missions bonus selon le "seed"
  if (seed % 3 === 0) {
    baseMissions.push(shuffled[3]); // Défi quotidien
  }
  
  if (seed % 5 === 0) {
    baseMissions.push(shuffled[4]); // Création
  }
  
  return baseMissions.map((mission, index) => ({
    ...mission,
    id: `${mission.id}_${today.toISOString().split('T')[0]}`,
    completed: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    order: index
  }));
}

// Fonction principale pour compléter une mission
export const completeMission = functions.https.onCall(async (data: MissionData, context) => {
  // Vérifier l'authentification
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'L\'utilisateur doit être authentifié pour compléter une mission.'
    );
  }

  const userId = context.auth.uid;
  const { missionId, metadata = {} } = data;

  // Valider les données d'entrée
  if (!missionId || typeof missionId !== 'string') {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'L\'ID de mission est requis.'
    );
  }

  try {
    // Récupérer le document utilisateur
    const userDocRef = db.collection('users').doc(userId);
    const userDoc = await userDocRef.get();

    if (!userDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Utilisateur non trouvé.'
      );
    }

    const userData = userDoc.data()!;
    const missions = userData.missions || { daily: [], lastReset: null };

    // Vérifier si les missions quotidiennes doivent être réinitialisées
    const today = new Date().toDateString();
    const lastReset = missions.lastReset ? missions.lastReset.toDate().toDateString() : null;

    if (lastReset !== today) {
      // Réinitialiser les missions quotidiennes
      const newDailyMissions = generateDailyMissions();
      
      await userDocRef.update({
        'missions.daily': newDailyMissions,
        'missions.lastReset': admin.firestore.FieldValue.serverTimestamp()
      });

      // Mettre à jour les missions locales
      missions.daily = newDailyMissions;
    }

    // Trouver la mission à compléter
    const missionIndex = missions.daily.findIndex((mission: any) => mission.id === missionId);
    
    if (missionIndex === -1) {
      return {
        success: true,
        missionCompleted: false,
        xpReward: 0,
        error: 'Mission non trouvée ou expirée.'
      };
    }

    const mission = missions.daily[missionIndex];

    // Vérifier si la mission est déjà complétée
    if (mission.completed) {
      return {
        success: true,
        missionCompleted: false,
        xpReward: 0,
        error: 'Mission déjà complétée.'
      };
    }

    // Marquer la mission comme complétée
    mission.completed = true;
    mission.completedAt = admin.firestore.FieldValue.serverTimestamp();
    mission.metadata = { ...mission.metadata, ...metadata };

    // Calculer la récompense XP
    let xpReward = mission.xpReward || 0;

    // Appliquer les bonus d'abonnement
    if (userData.subscription?.planId !== 'free') {
      const xpMultiplier = userData.subscription?.planId === 'premium_plus' ? 2.0 : 1.5;
      xpReward = Math.round(xpReward * xpMultiplier);
      mission.bonusXP = xpReward - mission.xpReward;
      mission.multiplier = xpMultiplier;
    }

    // Mettre à jour Firestore
    await userDocRef.update({
      'missions.daily': missions.daily,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Ajouter l'XP à l'utilisateur
    const xpResult = await addXp(
      { amount: xpReward, source: 'mission_complete', metadata: { missionId, missionTitle: mission.title } },
      context
    );

    const result: CompleteMissionResult = {
      success: true,
      missionCompleted: true,
      xpReward,
      newXP: xpResult.newXP,
      newLevel: xpResult.newLevel,
      leveledUp: xpResult.leveledUp
    };

    // Vérifier les badges
    const badgeResult = await checkBadges(userId);
    if (badgeResult.badgesUnlocked && badgeResult.badgesUnlocked.length > 0) {
      result.badgesUnlocked = badgeResult.badgesUnlocked;
    }

    // Tracker l'événement analytics
    await trackAnalyticsEvent('mission_complete', {
      userId,
      missionId,
      missionTitle: mission.title,
      missionType: mission.type,
      xpReward,
      completedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`✅ Mission complétée: User ${userId}, Mission: ${mission.title}, XP: +${xpReward}`);

    return result;

  } catch (error) {
    console.error('❌ Erreur complétion mission:', error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError(
      'internal',
      'Erreur lors de la complétion de la mission.',
      error.message
    );
  }
});

// Fonction pour obtenir les missions quotidiennes
export const getDailyMissions = functions.https.onCall(async (data: { userId?: string }, context) => {
  const targetUserId = data.userId || context.auth?.uid;
  
  if (!targetUserId) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Utilisateur non authentifié.'
    );
  }

  // Vérifier les permissions
  if (targetUserId !== context.auth?.uid) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Permission refusée.'
    );
  }

  try {
    const userDoc = await db.collection('users').doc(targetUserId).get();
    
    if (!userDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Utilisateur non trouvé.'
      );
    }

    const userData = userDoc.data()!;
    const missions = userData.missions || { daily: [], lastReset: null };

    // Vérifier si les missions doivent être réinitialisées
    const today = new Date().toDateString();
    const lastReset = missions.lastReset ? missions.lastReset.toDate().toDateString() : null;

    if (lastReset !== today) {
      // Générer de nouvelles missions
      const newDailyMissions = generateDailyMissions();
      
      await db.collection('users').doc(targetUserId).update({
        'missions.daily': newDailyMissions,
        'missions.lastReset': admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        missions: newDailyMissions,
        isNewDay: true
      };
    }

    return {
      missions: missions.daily,
      isNewDay: false
    };

  } catch (error) {
    console.error('❌ Erreur get daily missions:', error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError(
      'internal',
      'Erreur lors de la récupération des missions quotidiennes.',
      error.message
    );
  }
});

// Fonction pour mettre à jour la progression d'une mission
export const updateMissionProgress = functions.https.onCall(async (data: { 
  missionId: string; 
  progress: number; 
  metadata?: Record<string, any> 
}, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'L\'utilisateur doit être authentifié.'
    );
  }

  const userId = context.auth.uid;
  const { missionId, progress, metadata = {} } = data;

  if (!missionId || progress === undefined) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'ID de mission et progression requis.'
    );
  }

  try {
    const userDocRef = db.collection('users').doc(userId);
    const userDoc = await userDocRef.get();

    if (!userDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Utilisateur non trouvé.'
      );
    }

    const userData = userDoc.data()!;
    const missions = userData.missions || { daily: [], lastReset: null };

    // Trouver la mission
    const missionIndex = missions.daily.findIndex((mission: any) => mission.id === missionId);
    
    if (missionIndex === -1) {
      throw new functions.https.HttpsError(
        'not-found',
        'Mission non trouvée.'
      );
    }

    const mission = missions.daily[missionIndex];
    
    // Mettre à jour la progression
    mission.current = progress;
    mission.lastUpdated = admin.firestore.FieldValue.serverTimestamp();
    mission.metadata = { ...mission.metadata, ...metadata };

    // Vérifier si la mission est complétée
    const isCompleted = progress >= mission.target;
    
    if (isCompleted && !mission.completed) {
      mission.completed = true;
      mission.completedAt = admin.firestore.FieldValue.serverTimestamp();
      
      // Ajouter l'XP automatiquement
      const xpResult = await addXp(
        { amount: mission.xpReward, source: 'mission_auto_complete', metadata: { missionId, missionTitle: mission.title } },
        context
      );

      await userDocRef.update({
        'missions.daily': missions.daily,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`✅ Mission auto-complétée: User ${userId}, Mission: ${mission.title}, XP: +${mission.xpReward}`);

      return {
        success: true,
        missionCompleted: true,
        xpReward: mission.xpReward,
        newXP: xpResult.newXP,
        newLevel: xpResult.newLevel
      };
    } else {
      await userDocRef.update({
        'missions.daily': missions.daily,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        success: true,
        missionCompleted: false,
        progress,
        target: mission.target
      };
    }

  } catch (error) {
    console.error('❌ Erreur update mission progress:', error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError(
      'internal',
      'Erreur lors de la mise à jour de la progression.',
      error.message
    );
  }
});
