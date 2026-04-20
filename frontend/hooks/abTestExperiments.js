// Définition des expériences A/B Testing
import abTestService from './abTestService';

// Initialiser toutes les expériences
export const initializeExperiments = () => {
  // Expérience 1: XP Boost
  abTestService.defineExperiment('xp_boost', ['control', 'boost_1_5x', 'boost_2x'], {
    trafficSplit: 'equal',
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    description: 'Test de multiplicateur d\'XP',
    targetUsers: {
      level: { min: 1, max: 20 }
    }
  });

  // Expérience 2: Mission Rewards
  abTestService.defineExperiment('mission_rewards', ['normal', 'enhanced', 'premium'], {
    trafficSplit: 'weighted',
    weights: [50, 30, 20], // 50% normal, 30% enhanced, 20% premium
    description: 'Test de récompenses de missions',
    targetUsers: {
      level: { min: 3 }
    }
  });

  // Expérience 3: Shop Discounts
  abTestService.defineExperiment('shop_discounts', ['no_discount', 'small_discount', 'large_discount'], {
    trafficSplit: 'percentage',
    weights: [40, 35, 25], // 40% aucune, 35% petite, 25% grande
    description: 'Test de réductions shop',
    targetUsers: {
      subscription: 'free' // Uniquement pour les utilisateurs gratuits
    }
  });

  // Expérience 4: UI Layout
  abTestService.defineExperiment('ui_layout', ['classic', 'modern', 'compact'], {
    trafficSplit: 'equal',
    description: 'Test de layout interface',
    excludeUsers: {
      subscription: 'premium' // Exclure les utilisateurs premium
    }
  });

  // Expérience 5: Notification Frequency
  abTestService.defineExperiment('notification_frequency', ['daily', 'weekly', 'smart'], {
    trafficSplit: 'equal',
    description: 'Test de fréquence notifications',
    targetUsers: {
      level: { min: 5 }
    }
  });

  // Expérience 6: Avatar Customization
  abTestService.defineExperiment('avatar_unlock', ['level_based', 'xp_based', 'mission_based'], {
    trafficSplit: 'equal',
    description: 'Test de déblocage avatars',
    targetUsers: {
      level: { min: 2 }
    }
  });

  // Expérience 7: Learning Path Suggestions
  abTestService.defineExperiment('learning_suggestions', ['basic', 'ai_powered', 'social'], {
    trafficSplit: 'weighted',
    weights: [40, 40, 20],
    description: 'Test de suggestions de parcours',
    targetUsers: {
      level: { min: 1, max: 15 }
    }
  });

  // Expérience 8: Streak Bonuses
  abTestService.defineExperiment('streak_bonuses', ['standard', 'enhanced', 'mega'], {
    trafficSplit: 'equal',
    description: 'Test de bonus de streak',
    targetUsers: {
      level: { min: 3 }
    }
  });

  console.log('🧪 Expériences A/B Testing initialisées');
};

// Obtenir la configuration d'une expérience
export const getExperimentConfig = (featureName) => {
  const stats = abTestService.getExperimentStats(featureName);
  return stats ? stats.experiment : null;
};

// Obtenir les statistiques d'une expérience
export const getExperimentStats = (featureName) => {
  return abTestService.getExperimentStats(featureName);
};

// Obtenir toutes les expériences actives
export const getAllExperiments = () => {
  return abTestService.getStatus().activeExperiments;
};

// Fonctions utilitaires pour les variantes spécifiques
export const getXPMultiplier = (variant) => {
  switch (variant) {
    case 'boost_1_5x':
      return 1.5;
    case 'boost_2x':
      return 2.0;
    case 'control':
    default:
      return 1.0;
  }
};

export const getMissionRewardMultiplier = (variant) => {
  switch (variant) {
    case 'enhanced':
      return 1.25;
    case 'premium':
      return 1.5;
    case 'normal':
    default:
      return 1.0;
  }
};

export const getShopDiscount = (variant) => {
  switch (variant) {
    case 'small_discount':
      return 0.1; // 10%
    case 'large_discount':
      return 0.25; // 25%
    case 'no_discount':
    default:
      return 0.0;
  }
};

export const getUILayoutConfig = (variant) => {
  switch (variant) {
    case 'modern':
      return {
        theme: 'modern',
        cardStyle: 'rounded',
        colors: 'vibrant'
      };
    case 'compact':
      return {
        theme: 'compact',
        cardStyle: 'minimal',
        colors: 'monochrome'
      };
    case 'classic':
    default:
      return {
        theme: 'classic',
        cardStyle: 'standard',
        colors: 'default'
      };
  }
};

export const getNotificationFrequency = (variant) => {
  switch (variant) {
    case 'daily':
      return { interval: 'daily', time: '09:00' };
    case 'weekly':
      return { interval: 'weekly', day: 'monday', time: '09:00' };
    case 'smart':
      return { interval: 'adaptive', algorithm: 'ai' };
    default:
      return { interval: 'daily', time: '09:00' };
  }
};

export const getAvatarUnlockCondition = (variant) => {
  switch (variant) {
    case 'xp_based':
      return { type: 'xp', thresholds: [100, 500, 1000, 2500] };
    case 'mission_based':
      return { type: 'missions', thresholds: [5, 15, 30, 50] };
    case 'level_based':
    default:
      return { type: 'level', thresholds: [2, 5, 10, 15] };
  }
};

export const getLearningSuggestionType = (variant) => {
  switch (variant) {
    case 'ai_powered':
      return { type: 'ai', algorithm: 'neural_network' };
    case 'social':
      return { type: 'social', based_on: 'peer_progress' };
    case 'basic':
    default:
      return { type: 'basic', algorithm: 'linear' };
  }
};

export const getStreakBonusMultiplier = (variant) => {
  switch (variant) {
    case 'enhanced':
      return 1.5;
    case 'mega':
      return 2.0;
    case 'standard':
    default:
      return 1.0;
  }
};

// Initialiser les expériences au chargement
if (typeof window !== 'undefined') {
  initializeExperiments();
}
