const { logger } = require("firebase-functions/v2");
const { onCall } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { rateLimit } = require("../middleware/rateLimit");
const { logSecurityEvent } = require("../middleware/securityLogger");
const { createLogger, LOG_CONFIG } = require("../middleware/structuredLogger");
const { alertManager, ALERT_CONFIG } = require("../middleware/alertManager");
const { secureTestModeManager, SECURE_TEST_CONFIG } = require("../middleware/secureTestMode");

// Initialiser Firebase Admin si pas déjà fait
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Configuration des niveaux et XP
const LEVEL_CONFIG = {
  baseXP: 100,
  multiplier: 1.5,
  formula: 'exponential' // exponential, linear, logarithmic
};

// Calculer l'XP nécessaire pour un niveau donné
const calculateXPForLevel = (level) => {
  const { baseXP, multiplier, formula } = LEVEL_CONFIG;
  
  switch (formula) {
    case 'linear':
      return baseXP * level;
    case 'logarithmic':
      return Math.floor(baseXP * Math.log(level + 1) * multiplier);
    case 'exponential':
    default:
      return Math.floor(baseXP * Math.pow(multiplier, level - 1));
  }
};

// Calculer le niveau actuel basé sur l'XP
const calculateLevelFromXP = (xp) => {
  let level = 1;
  let xpForCurrentLevel = 0;
  
  while (xp >= xpForCurrentLevel) {
    level++;
    xpForCurrentLevel = calculateXPForLevel(level);
  }
  
  return level - 1;
};

// Calculer la progression vers le prochain niveau
const calculateProgressToNextLevel = (currentXP) => {
  const currentLevel = calculateLevelFromXP(currentXP);
  const xpForCurrentLevel = calculateXPForLevel(currentLevel);
  const xpForNextLevel = calculateXPForLevel(currentLevel + 1);
  
  const progressXP = currentXP - xpForCurrentLevel;
  const totalXPNeeded = xpForNextLevel - xpForCurrentLevel;
  
  return {
    currentLevel,
    currentXP,
    xpForCurrentLevel,
    xpForNextLevel,
    progressXP,
    totalXPNeeded,
    progressPercentage: Math.floor((progressXP / totalXPNeeded) * 100)
  };
};

// Fonction principale addXp avec middleware global
exports.addXp = onCall({
  region: "europe-west1",
  cors: true,
}, applyGlobalMiddleware('addXp'), // Appliquer le middleware global automatiquement
  async (request, response) => {
    // Le middleware global a déjà validé:
    // - L'environnement
    // - L'authentification  
    // - Le rate limiting
    // - Créé le logger structuré
    
    const { logger } = request;
    const { authValidation } = request;
    const userId = request.auth.uid;
    const { amount, source = "manual", metadata = {} } = request.data;

  // Le rate limiting est déjà géré par le middleware global
    // Plus besoin de le valider ici

  // Valider les données d'entrée
  if (!amount || typeof amount !== 'number' || amount <= 0) {
    logger.error("Montant XP invalide", { userId, amount });
    throw new Error("Montant XP invalide");
  }

  try {
    logger.info(`Ajout de ${amount} XP pour l'utilisateur ${userId}`, {
      userId,
      amount,
      source,
      metadata
    });

    // Transaction atomique unique - PAS DE DOUBLE LECTURE
    const result = await db.runTransaction(async (transaction) => {
      const userRef = db.collection('users').doc(userId);
      
      // LECTURE UNIQUE DANS LA TRANSACTION
      const userDoc = await transaction.get(userRef);
      
      if (!userDoc.exists) {
        throw new Error("Utilisateur non trouvé dans la transaction");
      }

      const userData = userDoc.data();
      const currentXP = userData.xp || 0;
      const newXP = currentXP + amount;

      // Vérification de double exécution avec idempotence
      const idempotencyKey = `${userId}_addXp_${amount}_${source}_${Date.now()}`;
      const lastXPUpdate = userData.lastXPUpdate?.toDate();
      const now = new Date();
      
      // Vérifier si la dernière mise à jour est trop récente
      if (lastXPUpdate && (now - lastXPUpdate) < 1000) {
        logger.warn("⚠️ Double exécution détectée via timestamp", {
          userId,
          lastXPUpdate,
          now,
          diff: now - lastXPUpdate
        });
        throw new Error("Double exécution détectée");
      }

      // Calculer les informations de niveau
      const currentLevelInfo = calculateProgressToNextLevel(currentXP);
      const newLevelInfo = calculateProgressToNextLevel(newXP);
      
      // Vérifier si level up
      const leveledUp = newLevelInfo.currentLevel > currentLevelInfo.currentLevel;
      const levelsGained = newLevelInfo.currentLevel - currentLevelInfo.currentLevel;

      // Préparer les données de mise à jour
      const updateData = {
        xp: newXP,
        level: newLevelInfo.currentLevel,
        xpForCurrentLevel: newLevelInfo.xpForCurrentLevel,
        xpForNextLevel: newLevelInfo.xpForNextLevel,
        progressPercentage: newLevelInfo.progressPercentage,
        lastActivity: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastXPUpdate: admin.firestore.FieldValue.serverTimestamp(), // Anti double exécution
        totalXPGained: admin.firestore.FieldValue.increment(amount),
        xpGainedToday: admin.firestore.FieldValue.increment(amount)
      };

      // Ajouter les bonus si level up
      if (leveledUp) {
        updateData.levelUpHistory = admin.firestore.FieldValue.arrayUnion({
          level: newLevelInfo.currentLevel,
          previousLevel: currentLevelInfo.currentLevel,
          levelsGained,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          source,
          bonusXP: levelsGained > 1 ? levelsGained * 50 : 0
        });

        logger.info(`Level up! ${currentLevelInfo.currentLevel} → ${newLevelInfo.currentLevel}`, {
          userId,
          previousLevel: currentLevelInfo.currentLevel,
          newLevel: newLevelInfo.currentLevel,
          levelsGained
        });
      }

      // Mettre à jour le streak d'activité
      const today = now.toDateString();
      const lastActivity = userData.lastActivity?.toDate();
      const lastActivityDate = lastActivity?.toDateString();
      
      if (lastActivityDate !== today) {
        // Nouveau jour d'activité
        updateData.streak = (userData.streak || 0) + 1;
        updateData.lastActivityDate = today;
        
        logger.info(`Nouveau jour d'activité, streak: ${updateData.streak}`, {
          userId,
          streak: updateData.streak
        });
      } else {
        // Même jour, pas de changement de streak
        updateData.streak = userData.streak || 0;
      }

      // Appliquer la mise à jour atomique
      transaction.update(userRef, updateData);

      return {
        success: true,
        previousXP: currentXP,
        newXP,
        amount,
        source,
        level: newLevelInfo.currentLevel,
        progress: newLevelInfo,
        leveledUp,
        levelsGained,
        streak: updateData.streak,
        bonusXP: leveledUp && levelsGained > 1 ? levelsGained * 50 : 0,
        idempotencyKey
      };
    });

    // Logger l'événement d'analytics
    await db.collection('analytics').add({
      eventName: 'xp_gained',
      userId,
      params: {
        amount,
        source,
        previousXP: currentXP,
        newXP,
        leveledUp,
        levelsGained,
        currentLevel: newLevelInfo.currentLevel,
        metadata
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    // Préparer la réponse
    const response = {
      success: true,
      data: {
        previousXP: currentXP,
        newXP,
        amount,
        source,
        level: newLevelInfo.currentLevel,
        progress: newLevelInfo,
        leveledUp,
        levelsGained,
        streak: updateData.streak,
        bonusXP: leveledUp && levelsGained > 1 ? levelsGained * 50 : 0
      }
    };

    logger.info(`XP ajouté avec succès`, {
      userId,
      response
    });

    // Logger le succès de la fonction
    const duration = Date.now() - structuredLogger._functionStartTime;
    structuredLogger.logFunctionEnd(response, duration);
    
    // Logger l'événement business
    structuredLogger.logBusinessEvent(userId, LOG_CONFIG.actions.XP_GAINED, {
      amount,
      source,
      previousXP: response.data.previousXP,
      newXP: response.data.newXP,
      leveledUp: response.data.leveledUp,
      levelsGained: response.data.levelsGained,
      duration
    });

    return response;

  } catch (error) {
    // Logger l'erreur de la fonction
    structuredLogger.logFunctionError(error, {
      userId,
      amount,
      source,
      metadata
    });

    // Créer une alerte pour les erreurs critiques
    if (error.message.includes('critical') || error.message.includes('database')) {
      await alertManager.createAlert(
        ALERT_CONFIG.levels.ERROR,
        ALERT_CONFIG.types.SYSTEM_ERROR,
        "Erreur critique dans addXp",
        `Une erreur critique est survenue: ${error.message}`,
        {
          userId,
          amount,
          source,
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack
          },
          timestamp: new Date()
        }
      );
    }

    logger.error("Erreur lors de l'ajout d'XP", {
      userId,
      amount,
      error: error.message,
      stack: error.stack
    });

    throw new Error(`Erreur lors de l'ajout d'XP: ${error.message}`);
  } finally {
    // Nettoyer le logger
    structuredLogger.cleanup();
  }
});

// Fonction utilitaire pour obtenir la progression d'un utilisateur
exports.getUserProgress = onCall({
  region: "europe-west1",
  cors: true,
}, async (request) => {
  if (!request.auth) {
    throw new Error("Authentification requise");
  }

  const userId = request.auth.uid;

  try {
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      throw new Error("Utilisateur non trouvé");
    }

    const userData = userDoc.data();
    const currentXP = userData.xp || 0;
    const progress = calculateProgressToNextLevel(currentXP);

    return {
      success: true,
      data: {
        xp: currentXP,
        level: progress.currentLevel,
        progress,
        streak: userData.streak || 0,
        totalXPGained: userData.totalXPGained || 0,
        lastActivity: userData.lastActivity
      }
    };

  } catch (error) {
    logger.error("Erreur lors de la récupération de la progression", {
      userId,
      error: error.message
    });

    throw new Error(`Erreur lors de la récupération de la progression: ${error.message}`);
  }
});

// Exporter les utilitaires pour les autres modules
module.exports = {
  calculateXPForLevel,
  calculateLevelFromXP,
  calculateProgressToNextLevel,
  LEVEL_CONFIG
};
