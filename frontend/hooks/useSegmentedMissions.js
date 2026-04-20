import { useMemo } from 'react';
import useUserSegmentation from './useUserSegmentation';

// Stratégies de missions par segment
const MISSION_STRATEGIES = {
  new_user: {
    difficulty: 'beginner',
    types: ['tutorial', 'discovery', 'first_steps'],
    duration: 'short',          // 5-10 minutes
    xpMultiplier: 1.5,         // Bonus XP pour encourager
    guidance: 'detailed',       // Instructions détaillées
    rewards: ['xp', 'badges', 'tutorial_unlocks']
  },
  
  active_user: {
    difficulty: 'intermediate',
    types: ['daily', 'weekly', 'skill_building'],
    duration: 'medium',        // 15-30 minutes
    xpMultiplier: 1.0,         // XP standard
    guidance: 'minimal',       // Instructions minimales
    rewards: ['xp', 'streak_bonus', 'level_up']
  },
  
  inactive_user: {
    difficulty: 'easy',
    types: ['re_engagement', 'quick_wins', 'come_back'],
    duration: 'very_short',    // 2-5 minutes
    xpMultiplier: 2.0,         // Double XP pour motiver
    guidance: 'detailed',       // Instructions détaillées
    rewards: ['xp', 'bonus_items', 'welcome_back']
  },
  
  premium_user: {
    difficulty: 'advanced',
    types: ['premium', 'exclusive', 'master_class'],
    duration: 'long',           // 30-60 minutes
    xpMultiplier: 1.2,         // Léger bonus premium
    guidance: 'minimal',       // Instructions minimales
    rewards: ['xp', 'premium_items', 'exclusive_content']
  },
  
  churn_risk: {
    difficulty: 'very_easy',
    types: ['intervention', 'retention', 'special'],
    duration: 'very_short',    // 1-3 minutes
    xpMultiplier: 3.0,         // Triple XP pour retenir
    guidance: 'hand_holding',   // Guide pas à pas
    rewards: ['xp', 'special_offers', 'retention_bonus']
  },
  
  power_user: {
    difficulty: 'expert',
    types: ['challenge', 'mastery', 'innovation'],
    duration: 'variable',      // 10-120 minutes
    xpMultiplier: 1.3,         // Bonus pour l'expertise
    guidance: 'autonomous',    // Autonomie totale
    rewards: ['xp', 'achievements', 'leaderboard_points']
  }
};

// Templates de missions par segment
const MISSION_TEMPLATES = {
  new_user: {
    tutorial: {
      title: '🎓 Découvre KidAI',
      description: 'Apprends les bases de l\'application',
      objectives: [
        'Explore l\'interface principale',
        'Complète ton profil',
        'Lance ta première conversation'
      ],
      xpReward: 25,
      duration: 10,
      steps: [
        { title: 'Explore l\'accueil', description: 'Découvre les différentes sections' },
        { title: 'Complète ton profil', description: 'Ajoute ton avatar et tes préférences' },
        { title: 'Première conversation', description: 'Lance ton premier chat avec l\'IA' }
      ]
    },
    discovery: {
      title: '🔍 Exploration',
      description: 'Découvre toutes les fonctionnalités',
      objectives: [
        'Teste les missions quotidiennes',
        'Consulte ton profil',
        'Regarde le classement'
      ],
      xpReward: 30,
      duration: 15
    },
    first_steps: {
      title: '👶 Premiers pas',
      description: 'Fais tes premiers pas dans KidAI',
      objectives: [
        'Gagne ton premier XP',
        'Débloque ton premier badge',
        'Complète une mission quotidienne'
      ],
      xpReward: 35,
      duration: 12
    }
  },
  
  active_user: {
    daily: {
      title: '📅 Mission quotidienne',
      description: 'Maintiens ton rythme d\'apprentissage',
      objectives: [
        'Complète 3 conversations',
        'Apprends un nouveau concept',
        'Révise une notion précédente'
      ],
      xpReward: 20,
      duration: 20
    },
    weekly: {
      title: '📆 Défi de la semaine',
      description: 'Pousse tes limites cette semaine',
      objectives: [
        'Complète 5 missions quotidiennes',
        'Atteins un nouvel objectif',
        'Partage tes progrès'
      ],
      xpReward: 100,
      duration: 45
    },
    skill_building: {
      title: '🛠️ Construction de compétences',
      description: 'Développe une compétence spécifique',
      objectives: [
        'Choisis une compétence à améliorer',
        'Pratique pendant 30 minutes',
        'Teste tes nouvelles connaissances'
      ],
      xpReward: 50,
      duration: 35
    }
  },
  
  inactive_user: {
    re_engagement: {
      title: '👋 On est contents de te revoir !',
      description: 'Une mission facile pour te remettre en route',
      objectives: [
        'Dis bonjour à KidAI',
        'Pose une question simple',
        'Regarde tes progrès'
      ],
      xpReward: 50,
      duration: 5
    },
    quick_wins: {
      title: '⚡ Victoire rapide',
      description: 'Gagne des points rapidement',
      objectives: [
        'Lance une conversation',
        'Réponds à 3 questions',
        'Gagne 10 XP'
      ],
      xpReward: 40,
      duration: 3
    },
    come_back: {
      title: '🌟 Reviens briller',
      description: 'Reprends là où tu t\'es arrêté',
      objectives: [
        'Consulte ton profil',
        'Vois tes missions',
        'Lance une activité'
      ],
      xpReward: 60,
      duration: 8
    }
  },
  
  premium_user: {
    premium: {
      title: '⭐ Mission Premium',
      description: 'Contenu exclusif pour les membres Premium',
      objectives: [
        'Accède aux cours avancés',
        'Utilise les outils Premium',
        'Participe aux sessions exclusives'
      ],
      xpReward: 80,
      duration: 40
    },
    exclusive: {
      title: '🎯 Défi exclusif',
      description: 'Défi disponible uniquement pour les Premium',
      objectives: [
        'Maîtrise un concept avancé',
        'Crée du contenu original',
        'Mentore un autre utilisateur'
      ],
      xpReward: 120,
      duration: 60
    },
    master_class: {
      title: '🎓 Master class',
      description: 'Session d\'apprentissage avancée',
      objectives: [
        'Suis un cours expert',
        'Applique les concepts',
        'Crée un projet personnel'
      ],
      xpReward: 150,
      duration: 90
    }
  },
  
  churn_risk: {
    intervention: {
      title: '🔥 Mission spéciale pour toi',
      description: 'On a préparé quelque chose de spécial',
      objectives: [
        'Accepte notre cadeau de bienvenue',
        'Lance une conversation',
        'Gagne un bonus exceptionnel'
      ],
      xpReward: 100,
      duration: 2
    },
    retention: {
      title: '💝 Mission de rétention',
      description: 'On veut que tu restes avec nous',
      objectives: [
        'Découvre nos nouveautés',
        'Teste une nouvelle fonctionnalité',
        'Donne ton feedback'
      ],
      xpReward: 75,
      duration: 10
    },
    special: {
      title: '🎁 Offre spéciale',
      description: 'Une mission avec récompenses exceptionnelles',
      objectives: [
        'Accepte l\'offre spéciale',
        'Complète une mission simple',
        'Débloque un bonus exclusif'
      ],
      xpReward: 200,
      duration: 5
    }
  },
  
  power_user: {
    challenge: {
      title: '🏆 Défi expert',
      description: 'Pousse tes compétences à leur maximum',
      objectives: [
        'Maîtrise un concept complexe',
        'Crée un projet avancé',
        'Enseigne à la communauté'
      ],
      xpReward: 200,
      duration: 120
    },
    mastery: {
      title: '🎯 Maîtrise',
      description: 'Atteins l\'excellence dans un domaine',
      objectives: [
        'Choisis un domaine de maîtrise',
        'Pratique intensivement',
        'Démontre ton expertise'
      ],
      xpReward: 300,
      duration: 180
    },
    innovation: {
      title: '🚀 Innovation',
      description: 'Crée quelque chose de nouveau',
      objectives: [
        'Identifie un problème',
        'Propose une solution',
        'Crée un prototype'
      ],
      xpReward: 250,
      duration: 150
    }
  }
};

// Hook pour les missions segmentées
const useSegmentedMissions = (userId, userData) => {
  const segmentation = useUserSegmentation(userData);

  // Obtenir la stratégie de missions pour le segment actuel
  const getMissionStrategy = useMemo(() => {
    const segmentKey = segmentation.segment.replace('_user', '');
    return MISSION_STRATEGIES[segmentKey] || MISSION_STRATEGIES.active_user;
  }, [segmentation.segment]);

  // Obtenir les templates de missions pour le segment
  const getMissionTemplates = useMemo(() => {
    const segmentKey = segmentation.segment.replace('_user', '');
    return MISSION_TEMPLATES[segmentKey] || MISSION_TEMPLATES.active_user;
  }, [segmentation.segment]);

  // Générer une mission personnalisée
  const generateSegmentedMission = useCallback((missionType, customData = {}) => {
    const strategy = getMissionStrategy;
    const templates = getMissionTemplates;
    
    // Vérifier si le type est disponible pour ce segment
    if (!strategy.types.includes(missionType)) {
      console.warn(`⚠️ Type de mission "${missionType}" non disponible pour le segment "${segmentation.segment}"`);
      return null;
    }

    // Obtenir le template de mission
    const template = templates[missionType];
    if (!template) {
      console.error(`❌ Template de mission non trouvé pour le type "${missionType}"`);
      return null;
    }

    // Personnaliser la mission selon le segment
    const personalizedMission = {
      ...template,
      id: `${segmentation.segment}_${missionType}_${Date.now()}`,
      type: missionType,
      segment: segmentation.segment,
      
      // Adapter les récompenses selon le segment
      xpReward: Math.round(template.xpReward * strategy.xpMultiplier),
      
      // Ajouter des récompenses spécifiques au segment
      rewards: [
        ...strategy.rewards,
        ...(segmentation.isPremium ? ['premium_points'] : []),
        ...(segmentation.isPowerUser ? ['expert_recognition'] : [])
      ],
      
      // Adapter la difficulté
      difficulty: strategy.difficulty,
      estimatedDuration: strategy.duration,
      
      // Ajouter des données personnalisées
      userData: {
        level: segmentation.metrics.currentLevel,
        xp: segmentation.metrics.currentXP,
        streak: segmentation.metrics.currentStreak,
        missionsCompleted: segmentation.metrics.missionsCompleted,
        ...customData
      },
      
      // Ajouter des instructions selon le niveau de guidance
      instructions: getInstructionsByGuidanceLevel(strategy.guidance, template),
      
      // Ajouter des objectifs adaptés
      objectives: adaptObjectivesToSegment(template.objectives, segmentation),
      
      // Métadonnées
      metadata: {
        generatedAt: new Date().toISOString(),
        strategy: strategy,
        template: template,
        personalized: true
      }
    };

    console.log(`✅ Mission segmentée générée: ${segmentation.segment} - ${missionType}`);
    return personalizedMission;
  }, [segmentation, getMissionStrategy, getMissionTemplates]);

  // Obtenir des recommandations de missions
  const getMissionRecommendations = useMemo(() => {
    const strategy = getMissionStrategy;
    const templates = getMissionTemplates;
    
    const recommendations = [];
    
    // Recommander des missions basées sur le segment et les métriques
    Object.keys(templates).forEach(missionType => {
      if (strategy.types.includes(missionType)) {
        const template = templates[missionType];
        const priority = calculateMissionPriority(missionType, template, segmentation);
        
        recommendations.push({
          type: missionType,
          template,
          priority,
          recommended: priority > 0.7
        });
      }
    });
    
    // Trier par priorité
    recommendations.sort((a, b) => b.priority - a.priority);
    
    return recommendations.slice(0, 5); // Top 5 recommandations
  }, [segmentation, getMissionStrategy, getMissionTemplates]);

  // Adapter les missions quotidiennes
  const getAdaptedDailyMissions = useCallback(() => {
    const strategy = getMissionStrategy;
    const templates = getMissionTemplates;
    
    // Selon le segment, générer des missions quotidiennes adaptées
    const dailyMissions = [];
    
    switch (segmentation.segment) {
      case 'new_user':
        // Missions très guidées pour les nouveaux
        dailyMissions.push(
          generateSegmentedMission('tutorial'),
          generateSegmentedMission('discovery')
        );
        break;
        
      case 'active_user':
        // Missions standards pour les actifs
        dailyMissions.push(
          generateSegmentedMission('daily'),
          generateSegmentedMission('skill_building')
        );
        break;
        
      case 'inactive_user':
        // Missions très faciles pour les inactifs
        dailyMissions.push(
          generateSegmentedMission('re_engagement'),
          generateSegmentedMission('quick_wins')
        );
        break;
        
      case 'premium_user':
        // Missions premium pour les abonnés
        dailyMissions.push(
          generateSegmentedMission('premium'),
          generateSegmentedMission('exclusive')
        );
        break;
        
      case 'churn_risk':
        // Missions de rétention pour les à risque
        dailyMissions.push(
          generateSegmentedMission('intervention'),
          generateSegmentedMission('special')
        );
        break;
        
      case 'power_user':
        // Missions avancées pour les experts
        dailyMissions.push(
          generateSegmentedMission('challenge'),
          generateSegmentedMission('mastery')
        );
        break;
        
      default:
        // Par défaut: missions actives
        dailyMissions.push(
          generateSegmentedMission('daily')
        );
        break;
    }
    
    return dailyMissions.filter(Boolean); // Filtrer les null
  }, [segmentation, generateSegmentedMission]);

  return {
    segmentation,
    strategy: getMissionStrategy,
    templates: getMissionTemplates,
    recommendations: getMissionRecommendations,
    
    // Actions
    generateSegmentedMission,
    getAdaptedDailyMissions
  };
};

// Fonctions utilitaires pour les missions
const getInstructionsByGuidanceLevel = (guidanceLevel, template) => {
  switch (guidanceLevel) {
    case 'hand_holding':
      return {
        stepByStep: true,
        hints: true,
        examples: true,
        videoTutorial: true,
        voiceGuidance: true
      };
      
    case 'detailed':
      return {
        stepByStep: true,
        hints: true,
        examples: true,
        videoTutorial: false,
        voiceGuidance: false
      };
      
    case 'minimal':
      return {
        stepByStep: false,
        hints: false,
        examples: false,
        videoTutorial: false,
        voiceGuidance: false
      };
      
    case 'autonomous':
      return {
        stepByStep: false,
        hints: false,
        examples: false,
        videoTutorial: false,
        voiceGuidance: false,
        selfDirected: true
      };
      
    default:
      return {};
  }
};

const adaptObjectivesToSegment = (objectives, segmentation) => {
  if (segmentation.isNew) {
    // Ajouter plus de détails pour les nouveaux
    return objectives.map(obj => ({
      ...obj,
      details: `Instructions détaillées pour ${obj}`,
      helpAvailable: true
    }));
  }
  
  if (segmentation.isPowerUser) {
    // Rendre les objectifs plus ambitieux pour les experts
    return objectives.map(obj => ({
      ...obj,
      challenge: `Version avancée: ${obj}`,
      bonus: Objectif bonus pour experts
    }));
  }
  
  return objectives;
};

const calculateMissionPriority = (missionType, template, segmentation) => {
  let priority = 0.5; // Base priority
  
  // Ajuster selon le segment
  switch (segmentation.segment) {
    case 'new_user':
      if (missionType === 'tutorial') priority = 0.9;
      if (missionType === 'discovery') priority = 0.8;
      break;
      
    case 'inactive_user':
      if (missionType === 're_engagement') priority = 0.95;
      if (missionType === 'quick_wins') priority = 0.9;
      break;
      
    case 'churn_risk':
      if (missionType === 'intervention') priority = 1.0;
      if (missionType === 'special') priority = 0.95;
      break;
      
    case 'premium_user':
      if (missionType === 'premium') priority = 0.85;
      if (missionType === 'exclusive') priority = 0.9;
      break;
      
    case 'power_user':
      if (missionType === 'challenge') priority = 0.8;
      if (missionType === 'mastery') priority = 0.85;
      break;
  }
  
  // Ajuster selon les métriques utilisateur
  if (segmentation.metrics.currentLevel < 3 && template.difficulty === 'beginner') {
    priority += 0.1;
  }
  
  if (segmentation.metrics.currentStreak > 7) {
    priority += 0.05;
  }
  
  return Math.min(priority, 1.0);
};

export default useSegmentedMissions;
