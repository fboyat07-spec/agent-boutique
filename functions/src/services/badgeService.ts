import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { trackAnalyticsEvent } from "./analyticsService";

const db = admin.firestore();

// Interface pour les conditions de badge
interface BadgeCondition {
  type: 'xp' | 'level' | 'streak' | 'missions' | 'special';
  value: number;
  operator: 'gte' | 'eq' | 'lte';
}

// Interface pour les badges
interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  requirements: BadgeCondition[];
  unlocked?: boolean;
  unlockedAt?: admin.firestore.Timestamp;
}

// Interface pour le résultat de vérification de badges
interface CheckBadgesResult {
  success: boolean;
  badgesUnlocked: string[];
  totalBadges: number;
  error?: string;
}

// Définition des badges disponibles
const BADGES: Badge[] = [
  // Badges de niveau
  {
    id: 'level_5',
    name: 'Apprenti',
    description: 'Atteindre le niveau 5',
    icon: '🎓',
    rarity: 'common',
    requirements: [
      { type: 'level', value: 5, operator: 'gte' }
    ]
  },
  {
    id: 'level_10',
    name: 'Expert',
    description: 'Atteindre le niveau 10',
    icon: '🎯',
    rarity: 'rare',
    requirements: [
      { type: 'level', value: 10, operator: 'gte' }
    ]
  },
  {
    id: 'level_20',
    name: 'Maître',
    description: 'Atteindre le niveau 20',
    icon: '🏆',
    rarity: 'epic',
    requirements: [
      { type: 'level', value: 20, operator: 'gte' }
    ]
  },
  
  // Badges d'XP
  {
    id: 'xp_1000',
    name: 'Millénaire',
    description: 'Accumuler 1000 XP',
    icon: '💯',
    rarity: 'common',
    requirements: [
      { type: 'xp', value: 1000, operator: 'gte' }
    ]
  },
  {
    id: 'xp_10000',
    name: 'Dix Millième',
    description: 'Accumuler 10,000 XP',
    icon: '🌟',
    rarity: 'rare',
    requirements: [
      { type: 'xp', value: 10000, operator: 'gte' }
    ]
  },
  {
    id: 'xp_100000',
    name: 'Centenaire',
    description: 'Accumuler 100,000 XP',
    icon: '👑',
    rarity: 'epic',
    requirements: [
      { type: 'xp', value: 100000, operator: 'gte' }
    ]
  },
  
  // Badges de streak
  {
    id: 'streak_7',
    name: 'Semaine Parfaite',
    description: 'Maintenir un streak de 7 jours',
    icon: '🔥',
    rarity: 'common',
    requirements: [
      { type: 'streak', value: 7, operator: 'gte' }
    ]
  },
  {
    id: 'streak_30',
    name: 'Mois d\'Enfer',
    description: 'Maintenir un streak de 30 jours',
    icon: '💪',
    rarity: 'rare',
    requirements: [
      { type: 'streak', value: 30, operator: 'gte' }
    ]
  },
  {
    id: 'streak_100',
    name: 'Centenaire',
    description: 'Maintenir un streak de 100 jours',
    icon: '🏅',
    rarity: 'epic',
    requirements: [
      { type: 'streak', value: 100, operator: 'gte' }
    ]
  },
  
  // Badges de missions
  {
    id: 'missions_10',
    name: 'Débutant',
    description: 'Compléter 10 missions',
    icon: '✅',
    rarity: 'common',
    requirements: [
      { type: 'missions', value: 10, operator: 'gte' }
    ]
  },
  {
    id: 'missions_50',
    name: 'Missionnaire',
    description: 'Compléter 50 missions',
    icon: '🎖️',
    rarity: 'rare',
    requirements: [
      { type: 'missions', value: 50, operator: 'gte' }
    ]
  },
  {
    id: 'missions_100',
    name: 'Expert des Missions',
    description: 'Compléter 100 missions',
    icon: '🎯',
    rarity: 'epic',
    requirements: [
      { type: 'missions', value: 100, operator: 'gte' }
    ]
  },
  
  // Badges spéciaux
  {
    id: 'first_mission',
    name: 'Premiers Pas',
    description: 'Compléter votre première mission',
    icon: '👶',
    rarity: 'common',
    requirements: [
      { type: 'missions', value: 1, operator: 'gte' }
    ]
  },
  {
    id: 'perfect_day',
    name: 'Journée Parfaite',
    description: 'Compléter toutes les missions quotidiennes en un jour',
    icon: '⭐',
    rarity: 'rare',
    requirements: [
      { type: 'special', value: 1, operator: 'eq' }
    ]
  },
  {
    id: 'early_bird',
    name: 'Matinal',
    description: 'Compléter une mission avant 8h du matin',
    icon: '🌅',
    rarity: 'rare',
    requirements: [
      { type: 'special', value: 1, operator: 'eq' }
    ]
  }
];

// Vérifier si une condition est remplie
function checkCondition(condition: BadgeCondition, userData: any, context: any): boolean {
  const { type, value, operator } = condition;
  
  let actualValue: number;
  
  switch (type) {
    case 'xp':
      actualValue = userData.xp || 0;
      break;
    case 'level':
      actualValue = userData.level || 1;
      break;
    case 'streak':
      actualValue = userData.streak || 0;
      break;
    case 'missions':
      // Compter les missions complétées
      actualValue = 0;
      if (userData.missions && userData.missions.daily) {
        actualValue = userData.missions.daily.filter((mission: any) => mission.completed).length;
      }
      break;
    case 'special':
      // Logique spéciale selon le contexte
      if (condition.value === 1 && context.perfectDay) {
        actualValue = 1;
      } else if (condition.value === 1 && context.earlyMorning) {
        actualValue = 1;
      } else {
        actualValue = 0;
      }
      break;
    default:
      return false;
  }
  
  switch (operator) {
    case 'gte':
      return actualValue >= value;
    case 'eq':
      return actualValue === value;
    case 'lte':
      return actualValue <= value;
    default:
      return false;
  }
}

// Vérifier si un badge est débloqué
function isBadgeUnlocked(badge: Badge, userData: any, context: any): boolean {
  return badge.requirements.every(condition => checkCondition(condition, userData, context));
}

// Fonction principale pour vérifier les badges
export const checkBadges = functions.https.onCall(async (data: { userId?: string }, context) => {
  // Vérifier l'authentification
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'L\'utilisateur doit être authentifié pour vérifier les badges.'
    );
  }

  const userId = data.userId || context.auth.uid;

  if (!userId) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'ID utilisateur requis.'
    );
  }

  try {
    // Récupérer le document utilisateur
    const userDoc = await db.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Utilisateur non trouvé.'
      );
    }

    const userData = userDoc.data()!;
    const currentBadges = userData.badges || [];
    
    // Préparer le contexte pour les badges spéciaux
    const specialContext = {
      perfectDay: false,
      earlyMorning: false
    };

    // Vérifier si journée parfaite
    if (userData.missions && userData.missions.daily) {
      const dailyMissions = userData.missions.daily;
      const completedToday = dailyMissions.filter((mission: any) => mission.completed).length;
      specialContext.perfectDay = completedToday >= 3; // Au moins 3 missions complétées
    }

    // Vérifier si mission matinale (avant 8h)
    const now = new Date();
    if (now.getHours() < 8 && userData.lastActivity) {
      const lastActivity = userData.lastActivity.toDate();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (lastActivity >= today) {
        specialContext.earlyMorning = true;
      }
    }

    // Vérifier chaque badge
    const badgesUnlocked: string[] = [];
    
    for (const badge of BADGES) {
      // Ignorer les badges déjà débloqués
      if (currentBadges.includes(badge.id)) {
        continue;
      }

      // Vérifier si le badge est débloqué
      if (isBadgeUnlocked(badge, userData, specialContext)) {
        // Ajouter le badge à l'utilisateur
        await db.collection('users').doc(userId).update({
          badges: admin.firestore.FieldValue.arrayUnion(badge.id),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        badgesUnlocked.push(badge.id);

        // Tracker l'événement analytics
        await trackAnalyticsEvent('badge_unlock', {
          userId,
          badgeId: badge.id,
          badgeName: badge.name,
          badgeRarity: badge.rarity
        });

        console.log(`🏆 Badge débloqué: User ${userId}, Badge: ${badge.name} (${badge.id})`);
      }
    }

    const result: CheckBadgesResult = {
      success: true,
      badgesUnlocked,
      totalBadges: currentBadges.length + badgesUnlocked.length
    };

    return result;

  } catch (error) {
    console.error('❌ Erreur vérification badges:', error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError(
      'internal',
      'Erreur lors de la vérification des badges.',
      error instanceof Error ? error.message : 'Erreur inconnue'
    );
  }
});

// Fonction pour obtenir tous les badges disponibles
export const getAllBadges = functions.https.onCall(async (data, context) => {
  // Vérifier l'authentification
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'L\'utilisateur doit être authentifié.'
    );
  }

  try {
    // Retourner tous les badges disponibles
    return {
      success: true,
      badges: BADGES.map(badge => ({
        id: badge.id,
        name: badge.name,
        description: badge.description,
        icon: badge.icon,
        rarity: badge.rarity,
        requirements: badge.requirements
      }))
    };

  } catch (error) {
    console.error('❌ Erreur get all badges:', error);
    
    throw new functions.https.HttpsError(
      'internal',
      'Erreur lors de la récupération des badges.',
      error instanceof Error ? error.message : 'Erreur inconnue'
    );
  }
});

// Fonction pour obtenir les badges d'un utilisateur
export const getUserBadges = functions.https.onCall(async (data: { userId?: string }, context) => {
  const userId = data.userId || context.auth?.uid;
  
  if (!userId) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Utilisateur non authentifié.'
    );
  }

  // Vérifier les permissions
  if (userId !== context.auth?.uid) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Permission refusée.'
    );
  }

  try {
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Utilisateur non trouvé.'
      );
    }

    const userData = userDoc.data()!;
    const userBadges = userData.badges || [];

    // Obtenir les détails des badges
    const badgesWithDetails = userBadges.map((badgeId: string) => {
      const badge = BADGES.find(b => b.id === badgeId);
      return badge || {
        id: badgeId,
        name: 'Badge Inconnu',
        description: 'Badge non trouvé',
        icon: '❓',
        rarity: 'common'
      };
    });

    return {
      success: true,
      badges: badgesWithDetails,
      totalBadges: badgesWithDetails.length
    };

  } catch (error) {
    console.error('❌ Erreur get user badges:', error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError(
      'internal',
      'Erreur lors de la récupération des badges utilisateur.',
      error instanceof Error ? error.message : 'Erreur inconnue'
    );
  }
});
