const { logger } = require("firebase-functions/v2");
const { onCall } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { applyGlobalMiddleware } = require("../middleware/globalMiddleware");

// Initialiser Firebase Admin si pas déjà fait
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Configuration des badges
const BADGE_CONFIG = {
  // Badges XP
  first_xp: {
    id: 'first_xp',
    name: 'Premiers Pas',
    description: 'Gagner ton premier XP',
    icon: '🎯',
    category: 'xp',
    rarity: 'common',
    condition: {
      type: 'xp',
      value: 1,
      operator: '>='
    }
  },
  
  xp_100: {
    id: 'xp_100',
    name: 'Apprenti',
    description: 'Atteindre 100 XP',
    icon: '📚',
    category: 'xp',
    rarity: 'common',
    condition: {
      type: 'xp',
      value: 100,
      operator: '>='
    }
  },
  
  xp_500: {
    id: 'xp_500',
    name: 'Expert',
    description: 'Atteindre 500 XP',
    icon: '🎓',
    category: 'xp',
    rarity: 'rare',
    condition: {
      type: 'xp',
      value: 500,
      operator: '>='
    }
  },
  
  xp_1000: {
    id: 'xp_1000',
    name: 'Maître',
    description: 'Atteindre 1000 XP',
    icon: '🏆',
    category: 'xp',
    rarity: 'epic',
    condition: {
      type: 'xp',
      value: 1000,
      operator: '>='
    }
  },
  
  // Badges de niveau
  level_5: {
    id: 'level_5',
    name: 'Débutant Confirmé',
    description: 'Atteindre le niveau 5',
    icon: '⭐',
    category: 'level',
    rarity: 'common',
    condition: {
      type: 'level',
      value: 5,
      operator: '>='
    }
  },
  
  level_10: {
    id: 'level_10',
    name: 'Intermédiaire',
    description: 'Atteindre le niveau 10',
    icon: '⭐⭐',
    category: 'level',
    rarity: 'uncommon',
    condition: {
      type: 'level',
      value: 10,
      operator: '>='
    }
  },
  
  level_25: {
    id: 'level_25',
    name: 'Avancé',
    description: 'Atteindre le niveau 25',
    icon: '⭐⭐⭐',
    category: 'level',
    rarity: 'rare',
    condition: {
      type: 'level',
      value: 25,
      operator: '>='
    }
  },
  
  // Badges de streak
  streak_3: {
    id: 'streak_3',
    name: 'Début de Streak',
    description: 'Maintenir un streak de 3 jours',
    icon: '🔥',
    category: 'streak',
    rarity: 'common',
    condition: {
      type: 'streak',
      value: 3,
      operator: '>='
    }
  },
  
  streak_7: {
    id: 'streak_7',
    name: 'Streak Hebdomadaire',
    description: 'Maintenir un streak de 7 jours',
    icon: '🔥🔥',
    category: 'streak',
    rarity: 'uncommon',
    condition: {
      type: 'streak',
      value: 7,
      operator: '>='
    }
  },
  
  streak_30: {
    id: 'streak_30',
    name: 'Streak Mensuel',
    description: 'Maintenir un streak de 30 jours',
    icon: '🔥🔥🔥',
    category: 'streak',
    rarity: 'epic',
    condition: {
      type: 'streak',
      value: 30,
      operator: '>='
    }
  },
  
  // Badges de missions
  first_mission: {
    id: 'first_mission',
    name: 'Première Mission',
    description: 'Compléter ta première mission',
    icon: '✅',
    category: 'mission',
    rarity: 'common',
    condition: {
      type: 'missions_completed',
      value: 1,
      operator: '>='
    }
  },
  
  missions_10: {
    id: 'missions_10',
    name: 'Missionnaire',
    description: 'Compléter 10 missions',
    icon: '🎯',
    category: 'mission',
    rarity: 'uncommon',
    condition: {
      type: 'missions_completed',
      value: 10,
      operator: '>='
    }
  },
  
  missions_50: {
    id: 'missions_50',
    name: 'Expert en Missions',
    description: 'Compléter 50 missions',
    icon: '🏆',
    category: 'mission',
    rarity: 'rare',
    condition: {
      type: 'missions_completed',
      value: 50,
      operator: '>='
    }
  },
  
  // Badges spéciaux
  early_adopter: {
    id: 'early_adopter',
    name: 'Pionnier',
    description: 'S\'inscrire durant la période bêta',
    icon: '🚀',
    category: 'special',
    rarity: 'legendary',
    condition: {
      type: 'early_adopter',
      value: true,
      operator: '=='
    }
  },
  
  perfect_week: {
    id: 'perfect_week',
    name: 'Semaine Parfaite',
    description: 'Compléter toutes les missions quotidiennes pendant une semaine',
    icon: '💯',
    category: 'special',
    rarity: 'epic',
    condition: {
      type: 'perfect_week',
      value: true,
      operator: '=='
    }
  }
};

// Vérifier si une condition de badge est remplie
const checkBadgeCondition = (condition, userData) => {
  const { type, value, operator } = condition;
  
  let userValue;
  
  // Récupérer la valeur utilisateur selon le type
  switch (type) {
    case 'xp':
      userValue = userData.xp || 0;
      break;
    case 'level':
      userValue = userData.level || 1;
      break;
    case 'streak':
      userValue = userData.streak || 0;
      break;
    case 'missions_completed':
      userValue = userData.missions?.totalCompleted || 0;
      break;
    case 'early_adopter':
      userValue = userData.createdAt?.toDate() < new Date('2024-12-31') ? true : false;
      break;
    case 'perfect_week':
      // Logique complexe à implémenter
      userValue = false; // Pour l'instant
      break;
    default:
      return false;
  }
  
  // Appliquer l'opérateur
  switch (operator) {
    case '>=':
      return userValue >= value;
    case '>':
      return userValue > value;
    case '==':
      return userValue === value;
    case '<=':
      return userValue <= value;
    case '<':
      return userValue < value;
    default:
      return false;
  }
};

// Vérifier tous les badges pour un utilisateur
const checkAllBadges = (userData) => {
  const unlockedBadges = [];
  const existingBadges = userData.badges || [];
  const existingBadgeIds = existingBadges.map(badge => badge.id);
  
  Object.values(BADGE_CONFIG).forEach(badge => {
    // Ne pas vérifier les badges déjà débloqués
    if (existingBadgeIds.includes(badge.id)) {
      return;
    }
    
    // Vérifier la condition
    if (checkBadgeCondition(badge.condition, userData)) {
      unlockedBadges.push({
        ...badge,
        unlockedAt: admin.firestore.FieldValue.serverTimestamp(),
        unlockSource: 'automatic_check'
      });
    }
  });
  
  return unlockedBadges;
};

// Fonction principale checkBadges avec middleware global
exports.checkBadges = onCall({
  region: "europe-west1",
  cors: true,
}, applyGlobalMiddleware('checkBadges'), // Appliquer le middleware global automatiquement
  async (request, response) => {
    // Le middleware global a déjà validé:
    // - L'environnement
    // - L'authentification  
    // - Le rate limiting (si configuré)
    // - Créé le logger structuré
    
    const { logger } = request;
    const { authValidation } = request;
    const userId = request.auth.uid;
    const { force = false } = request.data;

  try {
    logger.info(`Vérification des badges pour l'utilisateur ${userId}`, {
      userId,
      force
    });

    // Récupérer le document utilisateur
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      logger.error("Utilisateur non trouvé", { userId });
      throw new Error("Utilisateur non trouvé");
    }

    const userData = userDoc.data();
    const existingBadges = userData.badges || [];
    
    // Vérifier si on doit forcer la vérification ou si c'est automatique
    const shouldCheck = force || 
                        (userData.xp && userData.xp > (userData.lastBadgeCheckXP || 0)) ||
                        (userData.level && userData.level > (userData.lastBadgeCheckLevel || 0)) ||
                        (userData.streak && userData.streak > (userData.lastBadgeCheckStreak || 0));

    if (!shouldCheck) {
      logger.info("Aucune nouvelle condition de badge détectée", { userId });
      return {
        success: true,
        data: {
          badges: existingBadges,
          newBadges: [],
          message: "Aucun nouveau badge à débloquer"
        }
      };
    }

    // Vérifier tous les badges
    const newBadges = checkAllBadges(userData);
    
    if (newBadges.length === 0) {
      logger.info("Aucun nouveau badge débloqué", { userId });
      
      // Mettre à jour les dernières valeurs vérifiées
      await db.collection('users').doc(userId).update({
        lastBadgeCheckXP: userData.xp || 0,
        lastBadgeCheckLevel: userData.level || 1,
        lastBadgeCheckStreak: userData.streak || 0,
        lastBadgeCheckAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        success: true,
        data: {
          badges: existingBadges,
          newBadges: [],
          message: "Aucun nouveau badge à débloquer"
        }
      };
    }

    // Ajouter les nouveaux badges à l'utilisateur
    const updatedBadges = [...existingBadges, ...newBadges];
    
    // Mettre à jour le document utilisateur
    const updateData = {
      badges: updatedBadges,
      lastBadgeCheckXP: userData.xp || 0,
      lastBadgeCheckLevel: userData.level || 1,
      lastBadgeCheckStreak: userData.streak || 0,
      lastBadgeCheckAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.runTransaction(async (transaction) => {
      const userRef = db.collection('users').doc(userId);
      transaction.update(userRef, updateData);
    });

    // Logger les nouveaux badges dans analytics
    for (const badge of newBadges) {
      await db.collection('analytics').add({
        eventName: 'badge_unlocked',
        userId,
        params: {
          badgeId: badge.id,
          badgeName: badge.name,
          badgeCategory: badge.category,
          badgeRarity: badge.rarity,
          unlockSource: badge.unlockSource
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      logger.info(`Nouveau badge débloqué: ${badge.name}`, {
        userId,
        badgeId: badge.id,
        badgeName: badge.name
      });
    }

    const response = {
      success: true,
      data: {
        badges: updatedBadges,
        newBadges,
        totalBadges: updatedBadges.length,
        message: `${newBadges.length} nouveau(x) badge(s) débloqué(s)`
      }
    };

    logger.info(`Vérification des badges terminée`, {
      userId,
      newBadgesCount: newBadges.length,
      totalBadges: updatedBadges.length
    });

    return response;

  } catch (error) {
    logger.error("Erreur lors de la vérification des badges", {
      userId,
      error: error.message,
      stack: error.stack
    });

    throw new Error(`Erreur lors de la vérification des badges: ${error.message}`);
  }
});

// Fonction pour obtenir tous les badges disponibles
exports.getAllBadges = onCall({
  region: "europe-west1",
  cors: true,
}, async (request) => {
  // Cette fonction ne nécessite pas d'authentification (publique)
  try {
    const badges = Object.values(BADGE_CONFIG);
    
    return {
      success: true,
      data: {
        badges,
        total: badges.length,
        categories: [...new Set(badges.map(b => b.category))],
        rarities: [...new Set(badges.map(b => b.rarity))]
      }
    };

  } catch (error) {
    logger.error("Erreur lors de la récupération des badges", {
      error: error.message
    });

    throw new Error(`Erreur lors de la récupération des badges: ${error.message}`);
  }
});

// Fonction pour obtenir les badges d'un utilisateur
exports.getUserBadges = onCall({
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
    const badges = userData.badges || [];

    // Ajouter les informations complètes des badges
    const badgesWithDetails = badges.map(userBadge => {
      const badgeConfig = BADGE_CONFIG[userBadge.id];
      return {
        ...userBadge,
        ...badgeConfig
      };
    });

    return {
      success: true,
      data: {
        badges: badgesWithDetails,
        total: badgesWithDetails.length,
        categories: [...new Set(badgesWithDetails.map(b => b.category))],
        rarities: [...new Set(badgesWithDetails.map(b => b.rarity))]
      }
    };

  } catch (error) {
    logger.error("Erreur lors de la récupération des badges utilisateur", {
      userId,
      error: error.message
    });

    throw new Error(`Erreur lors de la récupération des badges utilisateur: ${error.message}`);
  }
});

// Exporter les utilitaires pour les autres modules
module.exports = {
  BADGE_CONFIG,
  checkBadgeCondition,
  checkAllBadges
};
