const { logger } = require("firebase-functions/v2");
const { onCall } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { applyGlobalMiddleware } = require("../middleware/globalMiddleware");

// Initialiser Firebase Admin si pas déjà fait
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Importer les fonctions XP
const { calculateProgressToNextLevel } = require('../xp/addXp');

// Configuration des missions
const MISSION_CONFIG = {
  // XP de base par type de mission
  baseXP: {
    daily: 20,
    weekly: 100,
    tutorial: 25,
    challenge: 150,
    bonus: 50
  },
  
  // Multiplicateurs par difficulté
  difficultyMultiplier: {
    easy: 0.8,
    medium: 1.0,
    hard: 1.5,
    expert: 2.0
  },
  
  // Bonus de streak
  streakBonus: {
    3: 1.2,    // +20% XP pour streak de 3 jours
    7: 1.5,    // +50% XP pour streak de 7 jours
    30: 2.0    // +100% XP pour streak de 30 jours
  }
};

// Calculer l'XP de récompense pour une mission
const calculateMissionXP = (mission, userStreak = 0) => {
  const { type, difficulty, baseReward } = mission;
  
  // XP de base
  let xpReward = baseReward || MISSION_CONFIG.baseXP[type] || 20;
  
  // Appliquer le multiplicateur de difficulté
  const difficultyMultiplier = MISSION_CONFIG.difficultyMultiplier[difficulty] || 1.0;
  xpReward = Math.floor(xpReward * difficultyMultiplier);
  
  // Appliquer le bonus de streak
  let streakMultiplier = 1.0;
  Object.entries(MISSION_CONFIG.streakBonus).forEach(([streakDays, multiplier]) => {
    if (userStreak >= parseInt(streakDays)) {
      streakMultiplier = multiplier;
    }
  });
  
  xpReward = Math.floor(xpReward * streakMultiplier);
  
  return {
    baseXP: baseReward || MISSION_CONFIG.baseXP[type] || 20,
    difficultyMultiplier,
    streakMultiplier,
    finalXP: xpReward,
    breakdown: {
      base: baseReward || MISSION_CONFIG.baseXP[type] || 20,
      difficulty: Math.floor(xpReward / difficultyMultiplier - (baseReward || MISSION_CONFIG.baseXP[type] || 20)),
      streak: Math.floor(xpReward - (xpReward / streakMultiplier))
    }
  };
};

// Vérifier si une mission peut être complétée
const validateMissionCompletion = (mission, userData) => {
  const { id, type, requirements = {} } = mission;
  
  // Vérifier si la mission existe
  if (!id || !type) {
    throw new Error("Mission invalide: ID ou type manquant");
  }
  
  // Vérifier si la mission n'est pas déjà complétée
  const completedMissions = userData.missions?.completed || [];
  if (completedMissions.includes(id)) {
    throw new Error("Mission déjà complétée");
  }
  
  // Vérifier si c'est une mission quotidienne déjà faite aujourd'hui
  if (type === 'daily') {
    const today = new Date().toDateString();
    const lastDailyCompletion = userData.lastDailyCompletion?.toDate()?.toDateString();
    if (lastDailyCompletion === today) {
      throw new Error("Mission quotidienne déjà complétée aujourd'hui");
    }
  }
  
  // Vérifier les prérequis
  if (requirements.level && userData.level < requirements.level) {
    throw new Error(`Niveau requis: ${requirements.level}`);
  }
  
  if (requirements.xp && userData.xp < requirements.xp) {
    throw new Error(`XP requis: ${requirements.xp}`);
  }
  
  return true;
};

// Fonction principale completeMission avec middleware global
exports.completeMission = onCall({
  region: "europe-west1",
  cors: true,
}, applyGlobalMiddleware('completeMission'), // Appliquer le middleware global automatiquement
  async (request, response) => {
    // Le middleware global a déjà validé:
    // - L'environnement
    // - L'authentification  
    // - Le rate limiting
    // - Créé le logger structuré
    
    const { logger } = request;
    const { authValidation } = request;
    const userId = request.auth.uid;
    const { missionId, completionData = {} } = request.data;

  // Valider les données d'entrée
  if (!missionId) {
    logger.error("Mission ID manquant", { userId });
    throw new Error("Mission ID requis");
  }

  try {
    logger.info(`Tentative de complétion de mission ${missionId} par utilisateur ${userId}`, {
      userId,
      missionId,
      completionData
    });

    // Transaction atomique unique - PAS DE DOUBLE LECTURE
    const result = await db.runTransaction(async (transaction) => {
      const userRef = db.collection('users').doc(userId);
      const missionRef = db.collection('missions').doc(missionId);
      
      // LECTURE UNIQUE DANS LA TRANSACTION
      const [userDoc, missionDoc] = await Promise.all([
        transaction.get(userRef),
        transaction.get(missionRef)
      ]);

      if (!userDoc.exists) {
        throw new Error("Utilisateur non trouvé dans la transaction");
      }

      if (!missionDoc.exists) {
        throw new Error("Mission non trouvée dans la transaction");
      }

      const userData = userDoc.data();
      const mission = missionDoc.data();

      // Valider la complétion de mission
      validateMissionCompletion(mission, userData);

      // Vérification de double exécution avec idempotence
      const idempotencyKey = `${userId}_completeMission_${missionId}_${Date.now()}`;
      const lastMissionCompletion = userData.missions?.lastCompleted?.toDate();
      const now = new Date();
      
      // Vérifier si la dernière complétion est trop récente
      if (lastMissionCompletion && (now - lastMissionCompletion) < 5000) {
        logger.warn("⚠️ Double exécution de mission détectée via timestamp", {
          userId,
          missionId,
          lastMissionCompletion,
          now,
          diff: now - lastMissionCompletion
        });
        throw new Error("Double exécution de mission détectée");
      }

      // Vérifier si la mission n'est pas déjà complétée
      const completedMissions = userData.missions?.completed || [];
      if (completedMissions.includes(missionId)) {
        throw new Error("Mission déjà complétée");
      }

      // Vérifier si c'est une mission quotidienne déjà faite aujourd'hui
      if (mission.type === 'daily') {
        const today = now.toDateString();
        const lastDailyCompletion = userData.lastDailyCompletion?.toDate()?.toDateString();
        if (lastDailyCompletion === today) {
          throw new Error("Mission quotidienne déjà complétée aujourd'hui");
        }
      }

      // Calculer l'XP de récompense
      const xpCalculation = calculateMissionXP(mission, userData.streak || 0);
      
      logger.info(`Calcul XP pour mission ${missionId}`, {
        userId,
        missionId,
        xpCalculation
      });

      // LOGIQUE XP DIRECTE DANS LA TRANSACTION - PAS D'APPEL RÉCURSIF
      const currentXP = userData.xp || 0;
      const newXP = currentXP + xpCalculation.finalXP;
      
      // Calculer les informations de niveau
      const currentLevelInfo = calculateProgressToNextLevel(currentXP);
      const newLevelInfo = calculateProgressToNextLevel(newXP);
      
      // Vérifier si level up
      const leveledUp = newLevelInfo.currentLevel > currentLevelInfo.currentLevel;
      const levelsGained = newLevelInfo.currentLevel - currentLevelInfo.currentLevel;

      // Préparer les données de mise à jour complètes
      const updateData = {
        // Mise à jour XP
        xp: newXP,
        level: newLevelInfo.currentLevel,
        xpForCurrentLevel: newLevelInfo.xpForCurrentLevel,
        xpForNextLevel: newLevelInfo.xpForNextLevel,
        progressPercentage: newLevelInfo.progressPercentage,
        lastXPUpdate: admin.firestore.FieldValue.serverTimestamp(),
        totalXPGained: admin.firestore.FieldValue.increment(xpCalculation.finalXP),
        xpGainedToday: admin.firestore.FieldValue.increment(xpCalculation.finalXP),
        
        // Mise à jour mission
        'missions.completed': admin.firestore.FieldValue.arrayUnion(missionId),
        'missions.lastCompleted': admin.firestore.FieldValue.serverTimestamp(),
        'missions.totalCompleted': admin.firestore.FieldValue.increment(1),
        lastMissionCompletionId: missionId, // Anti double exécution
        lastMissionCompletionAt: admin.firestore.FieldValue.serverTimestamp(),
        
        // Activité générale
        lastActivity: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      // Ajouter les bonus XP si level up
      if (leveledUp) {
        updateData.levelUpHistory = admin.firestore.FieldValue.arrayUnion({
          level: newLevelInfo.currentLevel,
          previousLevel: currentLevelInfo.currentLevel,
          levelsGained,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          source: 'mission_completion',
          bonusXP: levelsGained > 1 ? levelsGained * 50 : 0
        });

        logger.info(`Level up via mission! ${currentLevelInfo.currentLevel} → ${newLevelInfo.currentLevel}`, {
          userId,
          missionId,
          previousLevel: currentLevelInfo.currentLevel,
          newLevel: newLevelInfo.currentLevel,
          levelsGained
        });
      }

      // Gérer les missions quotidiennes
      if (mission.type === 'daily') {
        const today = now.toDateString();
        const lastActivity = userData.lastActivity?.toDate();
        const lastActivityDate = lastActivity?.toDateString();
        
        updateData.lastDailyCompletion = admin.firestore.FieldValue.serverTimestamp();
        updateData['missions.dailyStreak'] = admin.firestore.FieldValue.increment(1);
        updateData['missions.lastDailyId'] = missionId;
        
        if (lastActivityDate !== today) {
          updateData.streak = (userData.streak || 0) + 1;
          updateData.lastActivityDate = today;
        } else {
          updateData.streak = userData.streak || 0;
        }
      } else {
        // Mettre à jour le streak d'activité pour les autres types de missions
        const today = now.toDateString();
        const lastActivity = userData.lastActivity?.toDate();
        const lastActivityDate = lastActivity?.toDateString();
        
        if (lastActivityDate !== today) {
          updateData.streak = (userData.streak || 0) + 1;
          updateData.lastActivityDate = today;
        } else {
          updateData.streak = userData.streak || 0;
        }
      }

      // Appliquer la mise à jour atomique COMPLÈTE
      transaction.update(userRef, updateData);

      return {
        success: true,
        missionId,
        missionTitle: mission.title,
        missionType: mission.type,
        xpRewarded: xpCalculation.finalXP,
        xpBreakdown: xpCalculation.breakdown,
        previousXP: currentXP,
        newXP,
        newLevel: newLevelInfo.currentLevel,
        progress: newLevelInfo,
        leveledUp,
        levelsGained,
        streak: updateData.streak,
        bonusXP: leveledUp && levelsGained > 1 ? levelsGained * 50 : 0,
        completionData,
        idempotencyKey
      };
    });

    // Logger l'événement d'analytics
    await db.collection('analytics').add({
      eventName: 'mission_completed',
      userId,
      params: {
        missionId,
        missionType: mission.type,
        missionTitle: mission.title,
        difficulty: mission.difficulty,
        xpRewarded: xpCalculation.finalXP,
        xpBreakdown: xpCalculation.breakdown,
        userLevel: xpResult.data.level,
        userStreak: userData.streak || 0,
        completionTime: completionData.completionTime || 0,
        success: true
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    // Préparer la réponse
    const response = {
      success: true,
      data: {
        missionId,
        missionTitle: mission.title,
        missionType: mission.type,
        xpRewarded: xpCalculation.finalXP,
        xpBreakdown: xpCalculation.breakdown,
        newXP: xpResult.data.newXP,
        newLevel: xpResult.data.level,
        progress: xpResult.data.progress,
        leveledUp: xpResult.data.leveledUp,
        levelsGained: xpResult.data.levelsGained || 0,
        streak: xpResult.data.streak,
        bonusXP: xpResult.data.bonusXP || 0,
        completionData
      }
    };

    logger.info(`Mission complétée avec succès`, {
      userId,
      missionId,
      response
    });

    return response;

  } catch (error) {
    logger.error("Erreur lors de la complétion de mission", {
      userId,
      missionId,
      error: error.message,
      stack: error.stack
    });

    throw new Error(`Erreur lors de la complétion de mission: ${error.message}`);
  }
});

// Fonction pour obtenir les missions disponibles
exports.getAvailableMissions = onCall({
  region: "europe-west1",
  cors: true,
}, async (request) => {
  if (!request.auth) {
    throw new Error("Authentification requise");
  }

  const userId = request.auth.uid;
  const { type, difficulty } = request.data;

  try {
    // Récupérer l'utilisateur
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      throw new Error("Utilisateur non trouvé");
    }

    const userData = userDoc.data();
    const completedMissions = userData.missions?.completed || [];
    const userLevel = userData.level || 1;

    // Construire la requête pour les missions
    let query = db.collection('missions').where('active', '==', true);

    if (type) {
      query = query.where('type', '==', type);
    }

    if (difficulty) {
      query = query.where('difficulty', '==', difficulty);
    }

    // Filtrer par niveau requis
    query = query.where('requirements.level', '<=', userLevel);

    const missionsSnapshot = await query.get();
    const availableMissions = [];

    missionsSnapshot.forEach(doc => {
      const mission = doc.data();
      
      // Exclure les missions déjà complétées
      if (!completedMissions.includes(doc.id)) {
        // Calculer l'XP de récompense
        const xpCalculation = calculateMissionXP(mission, userData.streak || 0);
        
        availableMissions.push({
          id: doc.id,
          ...mission,
          xpReward: xpCalculation.finalXP,
          xpBreakdown: xpCalculation.breakdown,
          canComplete: true
        });
      }
    });

    return {
      success: true,
      data: {
        missions: availableMissions,
        total: availableMissions.length,
        userLevel,
        completedMissions: completedMissions.length
      }
    };

  } catch (error) {
    logger.error("Erreur lors de la récupération des missions", {
      userId,
      error: error.message
    });

    throw new Error(`Erreur lors de la récupération des missions: ${error.message}`);
  }
});

// Exporter les utilitaires pour les autres modules
module.exports = {
  calculateMissionXP,
  validateMissionCompletion,
  MISSION_CONFIG
};
