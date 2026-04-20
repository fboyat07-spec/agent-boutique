import { useMemo } from 'react';
import { differenceInDays, differenceInHours, differenceInMinutes } from 'date-fns';

// Définition des segments utilisateur
export const USER_SEGMENTS = {
  NEW_USER: 'new_user',
  ACTIVE_USER: 'active_user', 
  INACTIVE_USER: 'inactive_user',
  PREMIUM_USER: 'premium_user',
  CHURNING_USER: 'churning_user',
  POWER_USER: 'power_user'
};

// Critères de segmentation
const SEGMENT_CRITERIA = {
  // Nouvel utilisateur : inscrit depuis moins de 7 jours
  [USER_SEGMENTS.NEW_USER]: {
    maxDaysSinceCreation: 7,
    minXP: 0,
    maxXP: 100,
    description: 'Utilisateur inscrit depuis moins de 7 jours'
  },
  
  // Utilisateur actif : activité récente et engagement modéré
  [USER_SEGMENTS.ACTIVE_USER]: {
    minDaysSinceLastActivity: 0,
    maxDaysSinceLastActivity: 7,
    minXP: 100,
    maxXP: 5000,
    minMissionsCompleted: 5,
    description: 'Utilisateur actif avec engagement régulier'
  },
  
  // Utilisateur inactif : pas d'activité depuis 7+ jours
  [USER_SEGMENTS.INACTIVE_USER]: {
    minDaysSinceLastActivity: 7,
    maxDaysSinceLastActivity: 30,
    description: 'Utilisateur inactif depuis 7+ jours'
  },
  
  // Utilisateur premium : abonnement payant
  [USER_SEGMENTS.PREMIUM_USER]: {
    hasPremiumSubscription: true,
    description: 'Utilisateur avec abonnement premium'
  },
  
  // Utilisateur à risque de churn : inactivité 3-7 jours
  [USER_SEGMENTS.CHURNING_USER]: {
    minDaysSinceLastActivity: 3,
    maxDaysSinceLastActivity: 7,
    description: 'Utilisateur à risque de désabonnement'
  },
  
  // Power user : très engagé avec beaucoup d'XP
  [USER_SEGMENTS.POWER_USER]: {
    minXP: 5000,
    minMissionsCompleted: 50,
    minStreak: 7,
    description: 'Utilisateur très engagé et avancé'
  }
};

// Fonction principale de segmentation
export const getUserSegment = (userData) => {
  if (!userData) {
    return USER_SEGMENTS.NEW_USER; // Par défaut
  }

  const now = new Date();
  const createdAt = userData.createdAt?.toDate() || new Date();
  const lastActivity = userData.lastActivity?.toDate() || new Date();
  
  const daysSinceCreation = differenceInDays(now, createdAt);
  const hoursSinceLastActivity = differenceInHours(now, lastActivity);
  const daysSinceLastActivity = differenceInDays(now, lastActivity);
  
  const currentXP = userData.xp || 0;
  const currentLevel = userData.level || 1;
  const currentStreak = userData.streak || 0;
  const missionsCompleted = userData.missions?.daily?.filter(m => m.completed).length || 0;
  
  const isPremium = userData.subscription?.planId !== 'free';
  const subscriptionPlan = userData.subscription?.planId || 'free';

  // Priorité 1: Premium user (segment le plus important)
  if (isPremium && SEGMENT_CRITERIA[USER_SEGMENTS.PREMIUM_USER].hasPremiumSubscription) {
    return USER_SEGMENTS.PREMIUM_USER;
  }
  
  // Priorité 2: Power user (très engagé)
  if (
    currentXP >= SEGMENT_CRITERIA[USER_SEGMENTS.POWER_USER].minXP &&
    missionsCompleted >= SEGMENT_CRITERIA[USER_SEGMENTS.POWER_USER].minMissionsCompleted &&
    currentStreak >= SEGMENT_CRITERIA[USER_SEGMENTS.POWER_USER].minStreak
  ) {
    return USER_SEGMENTS.POWER_USER;
  }
  
  // Priorité 3: New user (récemment inscrit)
  if (
    daysSinceCreation <= SEGMENT_CRITERIA[USER_SEGMENTS.NEW_USER].maxDaysSinceCreation &&
    currentXP >= SEGMENT_CRITERIA[USER_SEGMENTS.NEW_USER].minXP &&
    currentXP <= SEGMENT_CRITERIA[USER_SEGMENTS.NEW_USER].maxXP
  ) {
    return USER_SEGMENTS.NEW_USER;
  }
  
  // Priorité 4: Churning user (à risque)
  if (
    daysSinceLastActivity >= SEGMENT_CRITERIA[USER_SEGMENTS.CHURNING_USER].minDaysSinceLastActivity &&
    daysSinceLastActivity <= SEGMENT_CRITERIA[USER_SEGMENTS.CHURNING_USER].maxDaysSinceLastActivity
  ) {
    return USER_SEGMENTS.CHURNING_USER;
  }
  
  // Priorité 5: Inactive user (inactif depuis longtemps)
  if (
    daysSinceLastActivity >= SEGMENT_CRITERIA[USER_SEGMENTS.INACTIVE_USER].minDaysSinceLastActivity &&
    daysSinceLastActivity <= SEGMENT_CRITERIA[USER_SEGMENTS.INACTIVE_USER].maxDaysSinceLastActivity
  ) {
    return USER_SEGMENTS.INACTIVE_USER;
  }
  
  // Par défaut: Active user
  return USER_SEGMENTS.ACTIVE_USER;
};

// Hook pour la segmentation utilisateur
const useUserSegmentation = (userData) => {
  const segmentation = useMemo(() => {
    const segment = getUserSegment(userData);
    
    // Informations détaillées sur la segmentation
    const now = new Date();
    const createdAt = userData?.createdAt?.toDate() || new Date();
    const lastActivity = userData?.lastActivity?.toDate() || new Date();
    
    const daysSinceCreation = differenceInDays(now, createdAt);
    const hoursSinceLastActivity = differenceInHours(now, lastActivity);
    const daysSinceLastActivity = differenceInDays(now, lastActivity);
    
    return {
      segment,
      criteria: SEGMENT_CRITERIA[segment],
      metrics: {
        daysSinceCreation,
        hoursSinceLastActivity,
        daysSinceLastActivity,
        currentXP: userData?.xp || 0,
        currentLevel: userData?.level || 1,
        currentStreak: userData?.streak || 0,
        missionsCompleted: userData?.missions?.daily?.filter(m => m.completed).length || 0,
        isPremium: userData?.subscription?.planId !== 'free',
        subscriptionPlan: userData?.subscription?.planId || 'free'
      },
      // Propriétés dérivées
      isAtRisk: segment === USER_SEGMENTS.CHURNING_USER,
      isEngaged: segment === USER_SEGMENTS.ACTIVE_USER || segment === USER_SEGMENTS.POWER_USER,
      isNew: segment === USER_SEGMENTS.NEW_USER,
      isInactive: segment === USER_SEGMENTS.INACTIVE_USER,
      isPremium: segment === USER_SEGMENTS.PREMIUM_USER,
      isPowerUser: segment === USER_SEGMENTS.POWER_USER
    };
  }, [userData]);

  return segmentation;
};

// Fonctions utilitaires pour les campagnes de segmentation
export const segmentationUtils = {
  // Vérifier si un utilisateur appartient à un segment
  isUserInSegment: (userData, targetSegment) => {
    const segment = getUserSegment(userData);
    return segment === targetSegment;
  },

  // Vérifier si un utilisateur appartient à plusieurs segments
  isUserInSegments: (userData, targetSegments) => {
    const segment = getUserSegment(userData);
    return targetSegments.includes(segment);
  },

  // Obtenir les segments éligibles pour une campagne
  getEligibleSegments: (campaignSegments) => {
    return campaignSegments.filter(segment => Object.values(USER_SEGMENTS).includes(segment));
  },

  // Filtrer une liste d'utilisateurs par segment
  filterUsersBySegment: (users, targetSegment) => {
    return users.filter(user => getUserSegment(user) === targetSegment);
  },

  // Obtenir des statistiques de segmentation
  getSegmentationStats: (users) => {
    const stats = {};
    
    Object.values(USER_SEGMENTS).forEach(segment => {
      stats[segment] = {
        count: 0,
        percentage: 0
      };
    });

    users.forEach(user => {
      const segment = getUserSegment(user);
      if (stats[segment]) {
        stats[segment].count++;
      }
    });

    // Calculer les pourcentages
    const totalUsers = users.length;
    Object.keys(stats).forEach(segment => {
      stats[segment].percentage = totalUsers > 0 ? (stats[segment].count / totalUsers) * 100 : 0;
    });

    return stats;
  }
};

export default useUserSegmentation;
