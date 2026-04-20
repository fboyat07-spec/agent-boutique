// Définition des plans d'abonnement
const SUBSCRIPTION_PLANS = {
  free: {
    id: 'free',
    name: 'Gratuit',
    price: 0,
    duration: null,
    features: {
      xpMultiplier: 1.0,
      maxDailyMissions: 3,
      maxBadges: 20,
      avatarAccess: 'basic',
      leaderboardAccess: true,
      analyticsAccess: false,
      prioritySupport: false,
      customThemes: false,
      adsFree: false
    }
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    price: 999, // $9.99
    duration: 30, // 30 jours
    features: {
      xpMultiplier: 1.5,
      maxDailyMissions: 5,
      maxBadges: 50,
      avatarAccess: 'all',
      leaderboardAccess: true,
      analyticsAccess: true,
      prioritySupport: true,
      customThemes: true,
      adsFree: true
    }
  },
  premium_plus: {
    id: 'premium_plus',
    name: 'Premium Plus',
    price: 1999, // $19.99
    duration: 30, // 30 jours
    features: {
      xpMultiplier: 2.0,
      maxDailyMissions: 10,
      maxBadges: 100,
      avatarAccess: 'all',
      leaderboardAccess: true,
      analyticsAccess: true,
      prioritySupport: true,
      customThemes: true,
      adsFree: true,
      exclusiveAvatars: true,
      earlyAccess: true
    }
  },
  lifetime: {
    id: 'lifetime',
    name: 'Premium à Vie',
    price: 9999, // $99.99
    duration: null, // à vie
    features: {
      xpMultiplier: 2.5,
      maxDailyMissions: 20,
      maxBadges: 200,
      avatarAccess: 'all',
      leaderboardAccess: true,
      analyticsAccess: true,
      prioritySupport: true,
      customThemes: true,
      adsFree: true,
      exclusiveAvatars: true,
      earlyAccess: true,
      betaAccess: true
    }
  }
};

// Obtenir un plan par son ID
const getSubscriptionPlan = (planId) => {
  return SUBSCRIPTION_PLANS[planId] || SUBSCRIPTION_PLANS.free;
};

// Obtenir tous les plans disponibles
const getAllSubscriptionPlans = () => {
  return Object.values(SUBSCRIPTION_PLANS);
};

// Vérifier si un utilisateur est premium
const isPremium = (userData) => {
  if (!userData || !userData.subscription) {
    return false;
  }

  const subscription = userData.subscription;
  const now = new Date();
  const isActive = subscription.status === 'active' && 
                   (!subscription.expiresAt || new Date(subscription.expiresAt) > now);

  return isActive && subscription.id !== 'free';
};

// Obtenir le plan actuel de l'utilisateur
const getCurrentPlan = (userData) => {
  if (!userData || !userData.subscription) {
    return SUBSCRIPTION_PLANS.free;
  }

  const subscription = userData.subscription;
  const plan = getSubscriptionPlan(subscription.planId);
  
  // Vérifier si l'abonnement est expiré
  const now = new Date();
  const isExpired = subscription.expiresAt && new Date(subscription.expiresAt) <= now;
  
  if (isExpired) {
    return SUBSCRIPTION_PLANS.free;
  }

  return plan;
};

// Obtenir les fonctionnalités de l'utilisateur
const getUserFeatures = (userData) => {
  const plan = getCurrentPlan(userData);
  return plan.features;
};

// Calculer le multiplicateur d'XP
const getXPMultiplier = (userData) => {
  const features = getUserFeatures(userData);
  return features.xpMultiplier;
};

// Calculer le bonus d'XP
const getXPBonus = (baseXP, userData) => {
  const multiplier = getXPMultiplier(userData);
  const bonusXP = Math.round(baseXP * (multiplier - 1));
  
  return {
    baseXP,
    multiplier,
    bonusXP,
    totalXP: baseXP + bonusXP
  };
};

// Vérifier si l'utilisateur peut accéder à une fonctionnalité
const canAccessFeature = (userData, feature) => {
  const features = getUserFeatures(userData);
  
  switch (feature) {
    case 'premium_avatars':
      return features.avatarAccess === 'all' || features.avatarAccess === 'premium';
    case 'analytics':
      return features.analyticsAccess;
    case 'priority_support':
      return features.prioritySupport;
    case 'custom_themes':
      return features.customThemes;
    case 'exclusive_content':
      return features.earlyAccess || features.betaAccess;
    case 'no_ads':
      return features.adsFree;
    default:
      return true;
  }
};

// Obtenir les missions quotidiennes selon l'abonnement
const getDailyMissionsForUser = (userData) => {
  const features = getUserFeatures(userData);
  const maxMissions = features.maxDailyMissions;
  
  // Missions de base
  const baseMissions = [
    {
      id: 'daily_interact',
      title: 'Interagir avec l\'IA',
      description: 'Pose 3 questions à l\'IA et obtiens des réponses',
      xpReward: 10,
      completed: false,
      type: 'interaction',
      target: 3,
      current: 0
    },
    {
      id: 'daily_learn_concept',
      title: 'Apprendre un nouveau concept',
      description: 'Découvre et apprends un nouveau concept',
      xpReward: 15,
      completed: false,
      type: 'learning',
      target: 1,
      current: 0
    },
    {
      id: 'daily_practice',
      title: 'Pratiquer 15 minutes',
      description: 'Entraîne-toi pendant 15 minutes',
      xpReward: 20,
      completed: false,
      type: 'practice',
      target: 15,
      current: 0
    }
  ];

  // Ajouter des missions premium si l'utilisateur est premium
  if (maxMissions > 3) {
    baseMissions.push(
      {
        id: 'daily_challenge',
        title: 'Défi Quotidien',
        description: 'Releve un défi personnalisé',
        xpReward: 30,
        completed: false,
        type: 'challenge',
        target: 1,
        current: 0
      }
    );
  }

  // Ajouter plus de missions pour les plans supérieurs
  if (maxMissions > 5) {
    baseMissions.push(
      {
        id: 'daily_collaborate',
        title: 'Collaborer avec un ami',
        description: 'Travaille en équipe sur un projet',
        xpReward: 25,
        completed: false,
        type: 'collaboration',
        target: 1,
        current: 0
      },
      {
        id: 'daily_create',
        title: 'Créer du contenu',
        description: 'Crée et partage ton propre contenu',
        xpReward: 35,
        completed: false,
        type: 'creation',
        target: 1,
        current: 0
      }
    );
  }

  // Limiter au nombre maximum de missions
  return baseMissions.slice(0, maxMissions);
};

// Calculer les récompenses de mission selon l'abonnement
const getMissionRewards = (userData, baseReward) => {
  const multiplier = getXPMultiplier(userData);
  return Math.round(baseReward * multiplier);
};

// Obtenir le prix d'un plan dans la devise locale
const getLocalizedPrice = (plan, currency = 'EUR') => {
  const localizedPrices = {
    EUR: { symbol: '€', rate: 1.0 },
    USD: { symbol: '$', rate: 1.1 },
    GBP: { symbol: '£', rate: 0.85 }
  };

  const currencyData = localizedPrices[currency] || localizedPrices.EUR;
  const localizedPrice = Math.round(plan.price * currencyData.rate);

  return {
    amount: localizedPrice,
    symbol: currencyData.symbol,
    currency,
    formatted: `${currencyData.symbol}${localizedPrice}`
  };
};

// Obtenir la date d'expiration formatée
const getFormattedExpirationDate = (userData) => {
  if (!userData || !userData.subscription || !userData.subscription.expiresAt) {
    return null;
  }

  const expirationDate = new Date(userData.subscription.expiresAt);
  return expirationDate.toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

// Obtenir les jours restants
const getDaysUntilExpiration = (userData) => {
  if (!userData || !userData.subscription || !userData.subscription.expiresAt) {
    return null;
  }

  const now = new Date();
  const expirationDate = new Date(userData.subscription.expiresAt);
  const diffTime = expirationDate - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return Math.max(0, diffDays);
};

// Vérifier si l'abonnement est sur le point d'expirer
const isExpiringSoon = (userData, daysThreshold = 7) => {
  const daysLeft = getDaysUntilExpiration(userData);
  return daysLeft !== null && daysLeft <= daysThreshold;
};

// Obtenir les statistiques d'abonnement
const getSubscriptionStats = (userData) => {
  const plan = getCurrentPlan(userData);
  const isPremiumUser = isPremium(userData);
  const daysLeft = getDaysUntilExpiration(userData);
  
  return {
    planId: plan.id,
    planName: plan.name,
    isPremium: isPremiumUser,
    isExpired: daysLeft === 0,
    expiresAt: userData.subscription?.expiresAt || null,
    daysUntilExpiration: daysLeft,
    isExpiringSoon: isExpiringSoon(userData),
    features: plan.features,
    xpMultiplier: plan.features.xpMultiplier,
    maxMissions: plan.features.maxDailyMissions,
    maxBadges: plan.features.maxBadges
  };
};

export {
  SUBSCRIPTION_PLANS,
  getSubscriptionPlan,
  getAllSubscriptionPlans,
  isPremium,
  getCurrentPlan,
  getUserFeatures,
  getXPMultiplier,
  getXPBonus,
  canAccessFeature,
  getDailyMissionsForUser,
  getMissionRewards,
  getLocalizedPrice,
  getFormattedExpirationDate,
  getDaysUntilExpiration,
  isExpiringSoon,
  getSubscriptionStats
};
