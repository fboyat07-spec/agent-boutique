import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { checkBadges } from "./badgeService";
import { syncLeaderboard } from "./leaderboardService";
import { trackAnalyticsEvent } from "./analyticsService";

const db = admin.firestore();

// Interface pour les données XP
interface XPData {
  amount: number;
  source: string;
  metadata?: Record<string, any>;
}

// Interface pour le résultat d'ajout d'XP
interface AddXPResult {
  success: boolean;
  newXP: number;
  newLevel: number;
  leveledUp: boolean;
  previousLevel?: number;
  badgesUnlocked?: string[];
  error?: string;
}

// Tableau des niveaux XP
const XP_TABLE = {
  1: 0,
  2: 100,
  3: 300,
  4: 600,
  5: 1200,
  6: 2500,
  7: 5000,
  8: 10000,
  9: 20000,
  10: 40000,
  11: 80000,
  12: 160000,
  13: 320000,
  14: 640000,
  15: 1280000,
  16: 2560000,
  17: 5120000,
  18: 10240000,
  19: 20480000,
  20: 40960000
};

// Calculer le niveau en fonction du XP
function calculateLevel(xp: number): number {
  let level = 1;
  
  for (const [levelKey, requiredXP] of Object.entries(XP_TABLE)) {
    const levelNum = parseInt(levelKey);
    if (xp >= requiredXP) {
      level = levelNum;
    } else {
      break;
    }
  }
  
  return level;
}

// Calculer le XP nécessaire pour le prochain niveau
function getXPForNextLevel(currentLevel: number): number {
  return XP_TABLE[currentLevel + 1] || Infinity;
}

// Calculer le XP nécessaire pour le niveau actuel
function getXPForCurrentLevel(currentLevel: number): number {
  return XP_TABLE[currentLevel] || 0;
}

// Fonction principale pour ajouter de l'XP
export const addXp = functions.https.onCall(async (data: XPData, context) => {
  // Vérifier l'authentification
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'L\'utilisateur doit être authentifié pour ajouter de l\'XP.'
    );
  }

  const userId = context.auth.uid;
  const { amount, source, metadata = {} } = data;

  // Valider les données d'entrée
  if (!amount || amount <= 0) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Le montant d\'XP doit être positif.'
    );
  }

  if (!source || typeof source !== 'string') {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'La source d\'XP est requise.'
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
    const currentXP = userData.xp || 0;
    const currentLevel = userData.level || 1;
    const newXP = currentXP + amount;

    // Calculer le nouveau niveau
    const newLevel = calculateLevel(newXP);
    const leveledUp = newLevel > currentLevel;

    // Préparer les mises à jour
    const updates: any = {
      xp: newXP,
      level: newLevel,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // Ajouter les métadonnées de l'XP
    if (metadata) {
      updates.lastXPGain = {
        amount,
        source,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        metadata
      };
    }

    // Mettre à jour le streak si l'XP vient d'une activité quotidienne
    if (source === 'daily_activity') {
      updates.lastActivity = admin.firestore.FieldValue.serverTimestamp();
      
      // Calculer le streak
      const lastActivity = userData.lastActivity?.toDate();
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      if (lastActivity) {
        const lastActivityDate = new Date(lastActivity.getFullYear(), lastActivity.getMonth(), lastActivity.getDate());
        const yesterdayDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
        
        if (lastActivityDate.getTime() === yesterdayDate.getTime()) {
          // Activité consécutive
          updates.streak = (userData.streak || 0) + 1;
        } else if (lastActivityDate.getTime() < yesterdayDate.getTime()) {
          // Streak rompu
          updates.streak = 1;
        }
        // Sinon, même jour, pas de changement de streak
      } else {
        updates.streak = 1;
      }
    }

    // Appliquer le multiplicateur XP si l'utilisateur est premium
    if (userData.subscription?.planId !== 'free') {
      const xpMultiplier = userData.subscription?.planId === 'premium_plus' ? 2.0 : 1.5;
      const bonusXP = Math.round(amount * (xpMultiplier - 1));
      updates.xp = newXP + bonusXP;
      updates.lastXPGain.bonusXP = bonusXP;
      updates.lastXPGain.multiplier = xpMultiplier;
    }

    // Mettre à jour Firestore
    await userDocRef.update(updates);

    const result: AddXPResult = {
      success: true,
      newXP: updates.xp,
      newLevel: newLevel,
      leveledUp
    };

    // Gérer le level up
    if (leveledUp) {
      result.previousLevel = currentLevel;
      
      // Ajouter un badge de level up
      await userDocRef.update({
        badges: admin.firestore.FieldValue.arrayUnion(`level_${newLevel}_badge`)
      });

      // Tracker l'événement analytics
      await trackAnalyticsEvent('level_up', {
        userId,
        oldLevel: currentLevel,
        newLevel,
        totalXP: updates.xp,
        source
      });

      console.log(`🎉 Level up! User ${userId}: ${currentLevel} → ${newLevel}`);
    }

    // Vérifier les badges
    const badgeResult = await checkBadges(userId);
    if (badgeResult.badgesUnlocked && badgeResult.badgesUnlocked.length > 0) {
      result.badgesUnlocked = badgeResult.badgesUnlocked;
    }

    // Synchroniser avec le leaderboard
    await syncLeaderboard(userId, {
      xp: updates.xp,
      level: newLevel,
      username: userData.username,
      avatar: userData.avatar
    });

    // Tracker l'événement analytics
    await trackAnalyticsEvent('xp_gain', {
      userId,
      amount,
      source,
      newXP: updates.xp,
      newLevel,
      leveledUp
    });

    console.log(`✅ XP ajouté: User ${userId}, +${amount} XP (${source}), Total: ${updates.xp} XP, Level: ${newLevel}`);

    return result;

  } catch (error) {
    console.error('❌ Erreur ajout XP:', error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError(
      'internal',
      'Erreur lors de l\'ajout d\'XP.',
      error.message
    );
  }
});

// Fonction pour obtenir la progression d'un utilisateur
export const getUserProgress = functions.https.onCall(async (data: { userId?: string }, context) => {
  // Si userId n'est pas fourni, utiliser l'utilisateur authentifié
  const targetUserId = data.userId || context.auth?.uid;
  
  if (!targetUserId) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Utilisateur non authentifié.'
    );
  }

  // Vérifier les permissions (admin ou utilisateur lui-même)
  if (targetUserId !== context.auth?.uid) {
    // TODO: Vérifier si l'utilisateur est admin
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
    const currentXP = userData.xp || 0;
    const currentLevel = userData.level || 1;
    
    const xpForNextLevel = getXPForNextLevel(currentLevel);
    const xpForCurrentLevel = getXPForCurrentLevel(currentLevel);
    const progressPercentage = xpForNextLevel > xpForCurrentLevel ? 
      ((currentXP - xpForCurrentLevel) / (xpForNextLevel - xpForCurrentLevel)) * 100 : 100;

    return {
      currentXP,
      currentLevel,
      xpForNextLevel,
      xpForCurrentLevel,
      progressPercentage,
      streak: userData.streak || 0,
      badges: userData.badges || [],
      lastActivity: userData.lastActivity
    };

  } catch (error) {
    console.error('❌ Erreur get user progress:', error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError(
      'internal',
      'Erreur lors de la récupération de la progression.',
      error.message
    );
  }
});
