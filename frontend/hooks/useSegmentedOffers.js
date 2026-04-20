import { useMemo } from 'react';
import useUserSegmentation from './useUserSegmentation';

// Stratégies d'offres par segment
const OFFER_STRATEGIES = {
  new_user: {
    type: 'acquisition',
    urgency: 'medium',
    discount: 20,
    trialDays: 7,
    messaging: 'welcome',
    focus: 'discovery',
    conversionGoal: 'premium_trial'
  },
  
  active_user: {
    type: 'retention',
    urgency: 'low',
    discount: 15,
    trialDays: 0,
    messaging: 'benefit',
    focus: 'enhancement',
    conversionGoal: 'premium_upgrade'
  },
  
  inactive_user: {
    type: 'reactivation',
    urgency: 'high',
    discount: 50,
    trialDays: 14,
    messaging: 'miss_you',
    focus: 'come_back',
    conversionGoal: 're_engagement'
  },
  
  premium_user: {
    type: 'upsell',
    urgency: 'low',
    discount: 10,
    trialDays: 0,
    messaging: 'exclusive',
    focus: 'premium_plus',
    conversionGoal: 'premium_plus_upgrade'
  },
  
  churn_risk: {
    type: 'retention',
    urgency: 'urgent',
    discount: 70,
    trialDays: 30,
    messaging: 'dont_go',
    focus: 'special_offer',
    conversionGoal: 'save_subscription'
  },
  
  power_user: {
    type: 'loyalty',
    urgency: 'low',
    discount: 25,
    trialDays: 0,
    messaging: 'appreciation',
    focus: 'advanced_features',
    conversionGoal: 'premium_plus'
  }
};

// Templates d'offres par segment
const OFFER_TEMPLATES = {
  new_user: {
    welcome_trial: {
      title: '🎉 Essai Premium Gratuit !',
      description: 'Découvre toutes les fonctionnalités Premium pendant 7 jours',
      benefits: [
        'Accès illimité aux cours',
        'Missions exclusives',
        'Support prioritaire',
        'Analytics avancés'
      ],
      discount: 0,
      trialDays: 7,
      cta: 'Commencer l\'essai gratuit',
      urgency: 'limited_time',
      expiresAfter: '7 days'
    },
    discovery_offer: {
      title: '🚀 Lance-to Premium',
      description: '-20% sur ton premier mois Premium',
      benefits: [
        'Prix réduit pour les nouveaux',
        'Toutes les fonctionnalités',
        'Annulation à tout moment'
      ],
      discount: 20,
      trialDays: 0,
      cta: 'Profiter de -20%',
      urgency: 'new_user_only',
      expiresAfter: '14 days'
    }
  },
  
  active_user: {
    upgrade_offer: {
      title: '⭐ Passe à Premium',
      description: '-15% sur ton abonnement Premium',
      benefits: [
        'Fonctionnalités avancées',
        'Missions exclusives',
        'Support personnalisé',
        'Contenu premium'
      ],
      discount: 15,
      trialDays: 0,
      cta: 'Mettre à niveau',
      urgency: 'limited_time',
      expiresAfter: '7 days'
    },
    value_pack: {
      title: '💎 Pack Valeur',
      description: '3 mois Premium pour le prix de 2',
      benefits: [
        'Économise 33%',
        'Prix bloqué',
        'Tous les avantages Premium',
        'Sans engagement'
      ],
      discount: 33,
      trialDays: 0,
      cta: 'Profiter du pack',
      urgency: 'best_value',
      expiresAfter: '10 days'
    }
  },
  
  inactive_user: {
    come_back_offer: {
      title: '👋 On te retrouve !',
      description: '-50% sur ton premier mois Premium',
      benefits: [
        'Offre de bienvenue',
        'Toutes les fonctionnalités',
        'Annulation facile',
        'Support dédié'
      ],
      discount: 50,
      trialDays: 14,
      cta: 'Reviens avec -50%',
      urgency: 'miss_you',
      expiresAfter: '5 days'
    },
    special_bonus: {
      title: '🎁 Bonus spécial pour toi',
      description: 'Essai Premium 14 jours + 100 XP bonus',
      benefits: [
        '14 jours gratuits',
        '100 XP bonus',
        'Missions exclusives',
        'Sans engagement'
      ],
      discount: 0,
      trialDays: 14,
      cta: 'Claim ton bonus',
      urgency: 'special_offer',
      expiresAfter: '3 days'
    }
  },
  
  premium_user: {
    premium_plus: {
      title: '⭐⭐ Passe à Premium Plus',
      description: '-10% sur Premium Plus (encore plus de fonctionnalités)',
      benefits: [
        'Toutes les fonctionnalités Premium',
        'Sessions privées 1-to-1',
        'Contenu exclusif',
        'Analytics avancés'
      ],
      discount: 10,
      trialDays: 0,
      cta: 'Passer à Premium Plus',
      urgency: 'upgrade_path',
      expiresAfter: '14 days'
    },
    loyalty_reward: {
      title: '🏆 Récompense de fidélité',
      description: '-25% sur ton prochain mois Premium Plus',
      benefits: [
        'Remerciement pour ta fidélité',
        'Prix réduit',
        'Fonctionnalités exclusives',
        'Support VIP'
      ],
      discount: 25,
      trialDays: 0,
      cta: 'Réclamer ta récompense',
      urgency: 'loyalty',
      expiresAfter: '7 days'
    }
  },
  
  churn_risk: {
    urgent_offer: {
      title: '🔥 Ne pars pas !',
      description: '-70% sur Premium Plus pour te retenir',
      benefits: [
        'Offre exceptionnelle',
        'Toutes les fonctionnalités',
        'Support prioritaire',
        'Annulation à tout moment'
      ],
      discount: 70,
      trialDays: 30,
      cta: 'Profiter de -70%',
      urgency: 'urgent',
      expiresAfter: '24 hours'
    },
    save_subscription: {
      title: '💝 Sauve ton abonnement',
      description: 'Premium Plus à prix réduit pendant 6 mois',
      benefits: [
        'Prix bloqué',
        'Économie garantie',
        'Tous les avantages',
        'Sans risque'
      ],
      discount: 40,
      trialDays: 0,
      cta: 'Sauver mon abonnement',
      urgency: 'last_chance',
      expiresAfter: '48 hours'
    }
  },
  
  power_user: {
    expert_pack: {
      title: '🎯 Pack Expert',
      description: 'Premium Plus avec fonctionnalités avancées',
      benefits: [
        'Outils d\'analyse avancés',
        'API access',
        'Export de données',
        'Support expert'
      ],
      discount: 25,
      trialDays: 0,
      cta: 'Passer au niveau expert',
      urgency: 'power_user',
      expiresAfter: '10 days'
    },
    partnership_offer: {
      title: '🤝 Devenons partenaires',
      description: 'Programme partenaires avec avantages exclusifs',
      benefits: [
        'Revenus partagés',
        'Accès anticipé',
        'Badge partenaire',
        'Communauté exclusive'
      ],
      discount: 30,
      trialDays: 0,
      cta: 'Devenir partenaire',
      urgency: 'exclusive',
      expiresAfter: '14 days'
    }
  }
};

// Hook pour les offres segmentées
const useSegmentedOffers = (userId, userData) => {
  const segmentation = useUserSegmentation(userData);

  // Obtenir la stratégie d'offres pour le segment actuel
  const getOfferStrategy = useMemo(() => {
    const segmentKey = segmentation.segment.replace('_user', '');
    return OFFER_STRATEGIES[segmentKey] || OFFER_STRATEGIES.active_user;
  }, [segmentation.segment]);

  // Obtenir les templates d'offres pour le segment
  const getOfferTemplates = useMemo(() => {
    const segmentKey = segmentation.segment.replace('_user', '');
    return OFFER_TEMPLATES[segmentKey] || OFFER_TEMPLATES.active_user;
  }, [segmentation.segment]);

  // Générer une offre personnalisée
  const generateSegmentedOffer = useCallback((offerType, customData = {}) => {
    const strategy = getOfferStrategy;
    const templates = getOfferTemplates;
    
    // Vérifier si le type est disponible pour ce segment
    if (!templates[offerType]) {
      console.warn(`⚠️ Type d'offre "${offerType}" non disponible pour le segment "${segmentation.segment}"`);
      return null;
    }

    // Obtenir le template d'offre
    const template = templates[offerType];
    
    // Personnaliser l'offre selon le segment
    const personalizedOffer = {
      ...template,
      id: `${segmentation.segment}_${offerType}_${Date.now()}`,
      type: offerType,
      segment: segmentation.segment,
      
      // Adapter le prix selon le segment
      originalPrice: getBasePrice(segmentation.segment),
      discountedPrice: calculateDiscountedPrice(
        getBasePrice(segmentation.segment),
        template.discount || strategy.discount
      ),
      
      // Adapter la durée d'essai
      trialDays: template.trialDays || strategy.trialDays,
      
      // Ajouter des données personnalisées
      userData: {
        level: segmentation.metrics.currentLevel,
        xp: segmentation.metrics.currentXP,
        streak: segmentation.metrics.currentStreak,
        missionsCompleted: segmentation.metrics.missionsCompleted,
        subscriptionPlan: segmentation.metrics.subscriptionPlan,
        daysSinceLastActivity: segmentation.metrics.daysSinceLastActivity,
        ...customData
      },
      
      // Ajouter des métadonnées
      metadata: {
        generatedAt: new Date().toISOString(),
        strategy: strategy,
        template: template,
        personalized: true,
        conversionGoal: strategy.conversionGoal
      }
    };

    console.log(`✅ Offre segmentée générée: ${segmentation.segment} - ${offerType}`);
    return personalizedOffer;
  }, [segmentation, getOfferStrategy, getOfferTemplates]);

  // Obtenir les offres recommandées
  const getOfferRecommendations = useMemo(() => {
    const strategy = getOfferStrategy;
    const templates = getOfferTemplates;
    
    const recommendations = [];
    
    // Recommander des offres basées sur le segment et les métriques
    Object.keys(templates).forEach(offerType => {
      const template = templates[offerType];
      const priority = calculateOfferPriority(offerType, template, segmentation);
      
      recommendations.push({
        type: offerType,
        template,
        priority,
        recommended: priority > 0.7,
        urgency: template.urgency || strategy.urgency
      });
    });
    
    // Trier par priorité
    recommendations.sort((a, b) => b.priority - a.priority);
    
    return recommendations.slice(0, 3); // Top 3 recommandations
  }, [segmentation, getOfferStrategy, getOfferTemplates]);

  // Obtenir les offres actives
  const getActiveOffers = useCallback(() => {
    const offers = [];
    
    // Générer les offres recommandées
    const recommendations = getOfferRecommendations;
    
    recommendations.forEach(rec => {
      if (rec.recommended) {
        const offer = generateSegmentedOffer(rec.type);
        if (offer) {
          offers.push(offer);
        }
      }
    });
    
    return offers;
  }, [segmentation, getOfferRecommendations, generateSegmentedOffer]);

  // Vérifier si une offre est applicable
  const isOfferApplicable = useCallback((offer) => {
    if (!offer) return false;
    
    // Vérifier si le segment correspond
    if (offer.segment !== segmentation.segment) return false;
    
    // Vérifier si l'utilisateur est éligible
    if (segmentation.isPremium && offer.type === 'welcome_trial') {
      return false; // Les premiums n'ont pas besoin d'essai
    }
    
    if (!segmentation.isPremium && offer.type === 'premium_plus') {
      return false; // Nécessite d'être premium d'abord
    }
    
    return true;
  }, [segmentation]);

  // Calculer le taux de conversion potentiel
  const getConversionProbability = useCallback((offer) => {
    if (!isOfferApplicable(offer)) return 0;
    
    let probability = 0.5; // Base probability
    
    // Ajuster selon le segment
    switch (segmentation.segment) {
      case 'new_user':
        probability = 0.3; // Moins enclinés à payer
        break;
      case 'active_user':
        probability = 0.6; // Plus enclins à mettre à niveau
        break;
      case 'inactive_user':
        probability = 0.4; // Peu enclins mais bonne offre
        break;
      case 'premium_user':
        probability = 0.7; // Très enclins à upgrader
        break;
      case 'churn_risk':
        probability = 0.8; // Très enclins si bonne offre
        break;
      case 'power_user':
        probability = 0.75; // Très enclins aux offres premium
        break;
    }
    
    // Ajuster selon l'urgence
    if (offer.urgency === 'urgent') probability += 0.2;
    if (offer.urgency === 'high') probability += 0.1;
    
    // Ajuster selon le discount
    if (offer.discount >= 50) probability += 0.15;
    if (offer.discount >= 30) probability += 0.1;
    
    return Math.min(probability, 0.95);
  }, [segmentation, isOfferApplicable]);

  return {
    segmentation,
    strategy: getOfferStrategy,
    templates: getOfferTemplates,
    recommendations: getOfferRecommendations,
    activeOffers: getActiveOffers(),
    
    // Actions
    generateSegmentedOffer,
    isOfferApplicable,
    getConversionProbability
  };
};

// Fonctions utilitaires pour les offres
const getBasePrice = (segment) => {
  const prices = {
    new_user: 9.99,
    active_user: 9.99,
    inactive_user: 9.99,
    premium_user: 19.99,
    churn_risk: 19.99,
    power_user: 19.99
  };
  
  return prices[segment] || 9.99;
};

const calculateDiscountedPrice = (basePrice, discount) => {
  return Math.round(basePrice * (1 - discount / 100) * 100) / 100;
};

const calculateOfferPriority = (offerType, template, segmentation) => {
  let priority = 0.5; // Base priority
  
  // Ajuster selon le segment
  switch (segmentation.segment) {
    case 'new_user':
      if (offerType === 'welcome_trial') priority = 0.9;
      if (offerType === 'discovery_offer') priority = 0.8;
      break;
      
    case 'inactive_user':
      if (offerType === 'come_back_offer') priority = 0.95;
      if (offerType === 'special_bonus') priority = 0.9;
      break;
      
    case 'churn_risk':
      if (offerType === 'urgent_offer') priority = 1.0;
      if (offerType === 'save_subscription') priority = 0.95;
      break;
      
    case 'premium_user':
      if (offerType === 'premium_plus') priority = 0.85;
      if (offerType === 'loyalty_reward') priority = 0.9;
      break;
      
    case 'power_user':
      if (offerType === 'expert_pack') priority = 0.8;
      if (offerType === 'partnership_offer') priority = 0.85;
      break;
  }
  
  // Ajuster selon l'urgence
  if (template.urgency === 'urgent') priority += 0.1;
  if (template.urgency === 'high') priority += 0.05;
  
  // Ajuster selon le discount
  if (template.discount >= 50) priority += 0.1;
  if (template.discount >= 30) priority += 0.05;
  
  return Math.min(priority, 1.0);
};

export default useSegmentedOffers;
