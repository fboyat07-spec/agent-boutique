import { useMemo } from 'react';
import useUserSegmentation from './useUserSegmentation';
import useNotifications from './useNotifications';

// Stratégies de notification par segment
const NOTIFICATION_STRATEGIES = {
  new_user: {
    frequency: 'high',          // Fréquent pour les nouveaux
    types: ['onboarding', 'tutorial', 'first_mission', 'welcome'],
    timing: 'immediate',        // Immédiat après action
    tone: 'friendly',           // Ton amical et encourageant
    channels: ['onboarding', 'missions', 'levelup']
  },
  
  active_user: {
    frequency: 'medium',        // Modéré pour les actifs
    types: ['mission_reminder', 'streak_alert', 'levelup', 'badge'],
    timing: 'scheduled',         // Planifié régulier
    tone: 'motivational',       // Ton motivant
    channels: ['missions', 'streak', 'levelup']
  },
  
  inactive_user: {
    frequency: 'low',           // Faible pour les inactifs
    types: ['re_engagement', 'missed_you', 'come_back'],
    timing: 'strategic',         // Moments stratégiques
    tone: 'concerned',          // Ton préoccupé mais positif
    channels: ['re_engagement']
  },
  
  premium_user: {
    frequency: 'premium',        // Exclusif pour les premiums
    types: ['premium_features', 'exclusive_content', 'early_access'],
    timing: 'exclusive',         // Moments exclusifs
    tone: 'exclusive',           // Ton premium et valorisant
    channels: ['premium', 'exclusive']
  },
  
  churn_risk: {
    frequency: 'intensive',     // Intensif pour les à risque
    types: ['churn_prevention', 'special_offer', 'we_miss_you'],
    timing: 'urgent',            // Urgent
    tone: 'caring',             // Ton attentionné
    channels: ['churn_prevention', 'special_offers']
  },
  
  power_user: {
    frequency: 'selective',     // Sélectif pour les power users
    types: ['achievement', 'leaderboard', 'advanced_features'],
    timing: 'milestone',        // Jalons importants
    tone: 'respectful',         // Ton respectueux
    channels: ['achievements', 'leaderboard']
  }
};

// Messages de notification par segment et type
const NOTIFICATION_MESSAGES = {
  new_user: {
    onboarding: {
      title: '🎉 Bienvenue dans KidAI !',
      body: 'Commence ton aventure avec ta première mission !',
      data: { type: 'onboarding', priority: 'high' }
    },
    tutorial: {
      title: '📚 Découvre les bases',
      body: 'Apprends à utiliser KidAI comme un pro !',
      data: { type: 'tutorial', priority: 'medium' }
    },
    first_mission: {
      title: '✅ Ta première mission t\'attend !',
      body: 'Complète-la pour gagner ton premier XP',
      data: { type: 'first_mission', priority: 'high' }
    },
    welcome: {
      title: '👋 Salut {pseudo} !',
      body: 'Prêt à commencer ton apprentissage ?',
      data: { type: 'welcome', priority: 'medium' }
    }
  },
  
  active_user: {
    mission_reminder: {
      title: '✅ Missions en attente',
      body: 'Il te reste {count} mission{count > 1 ? \'s\' : \'\'} à compléter aujourd\'hui',
      data: { type: 'mission_reminder', priority: 'medium' }
    },
    streak_alert: {
      title: '🔥 Ton streak est en danger !',
      body: 'Reviens garder ton streak de {streak} jours !',
      data: { type: 'streak_alert', priority: 'high' }
    },
    levelup: {
      title: '🎉 Level Up !',
      body: 'Félicitations ! Tu as atteint le niveau {level} !',
      data: { type: 'levelup', priority: 'high' }
    },
    badge: {
      title: '🏆 Nouveau badge !',
      body: 'Tu as débloqué le badge "{badge}" !',
      data: { type: 'badge', priority: 'medium' }
    }
  },
  
  inactive_user: {
    re_engagement: {
      title: '👋 On te retrouve ?',
      body: 'Ça fait {days} jours qu\'on ne t\'a pas vu ! Reviens vite !',
      data: { type: 're_engagement', priority: 'normal' }
    },
    missed_you: {
      title: '💭 Tu nous manques !',
      body: 'Tes missions quotidiennes t\'attendent',
      data: { type: 'missed_you', priority: 'low' }
    },
    come_back: {
      title: '🌟 Reviens briller !',
      body: 'Ton streak de {streak} jours t\'attend',
      data: { type: 'come_back', priority: 'normal' }
    }
  },
  
  premium_user: {
    premium_features: {
      title: '⭐ Nouvelle fonctionnalité Premium !',
      body: 'Découvrez {feature} disponible pour les membres Premium',
      data: { type: 'premium_features', priority: 'high' }
    },
    exclusive_content: {
      title: '🎁 Contenu exclusif !',
      body: 'Nouveau cours premium disponible : {content}',
      data: { type: 'exclusive_content', priority: 'high' }
    },
    early_access: {
      title: '🚀 Accès anticipé !',
      body: 'Essaye {feature} avant tout le monde',
      data: { type: 'early_access', priority: 'medium' }
    }
  },
  
  churn_risk: {
    churn_prevention: {
      title: '🔥 Ne pars pas !',
      body: 'On a une offre spéciale pour toi : -50% sur Premium',
      data: { type: 'churn_prevention', priority: 'urgent' }
    },
    special_offer: {
      title: '💎 Offre exclusive !',
      body: 'Profite de Premium à -70% pour cette semaine seulement',
      data: { type: 'special_offer', priority: 'urgent' }
    },
    we_miss_you: {
      title: '💝 Tu nous manques !',
      body: 'Reviens et gagne un bonus de 100 XP',
      data: { type: 'we_miss_you', priority: 'high' }
    }
  },
  
  power_user: {
    achievement: {
      title: '🏆 Nouveau record !',
      body: 'Tu as atteint {achievement} !',
      data: { type: 'achievement', priority: 'medium' }
    },
    leaderboard: {
      title: '🏆 Classement mis à jour',
      body: 'Tu es maintenant {rank} sur le leaderboard !',
      data: { type: 'leaderboard', priority: 'low' }
    },
    advanced_features: {
      title: '🚀 Nouveaux outils avancés',
      body: 'Découvrez nos nouvelles fonctionnalités pour experts',
      data: { type: 'advanced_features', priority: 'medium' }
    }
  }
};

// Hook pour les notifications segmentées
const useSegmentedNotifications = (userId, userData) => {
  const segmentation = useUserSegmentation(userData);
  const { sendLocalNotification, scheduleLocalNotification } = useNotifications(userId);

  // Obtenir la stratégie de notification pour le segment actuel
  const getNotificationStrategy = useMemo(() => {
    const segmentKey = segmentation.segment.replace('_user', '');
    return NOTIFICATION_STRATEGIES[segmentKey] || NOTIFICATION_STRATEGIES.active_user;
  }, [segmentation.segment]);

  // Obtenir les messages de notification pour le segment
  const getNotificationMessages = useMemo(() => {
    const segmentKey = segmentation.segment.replace('_user', '');
    return NOTIFICATION_MESSAGES[segmentKey] || NOTIFICATION_MESSAGES.active_user;
  }, [segmentation.segment]);

  // Envoyer une notification segmentée
  const sendSegmentedNotification = useCallback(async (type, customData = {}) => {
    const strategy = getNotificationStrategy;
    const messages = getNotificationMessages;
    
    // Vérifier si le type est autorisé pour ce segment
    if (!strategy.types.includes(type)) {
      console.warn(`⚠️ Type de notification "${type}" non autorisé pour le segment "${segmentation.segment}"`);
      return false;
    }

    // Obtenir le message template
    const messageTemplate = messages[type];
    if (!messageTemplate) {
      console.error(`❌ Message template non trouvé pour le type "${type}"`);
      return false;
    }

    // Personnaliser le message avec les données utilisateur
    const personalizedMessage = {
      ...messageTemplate,
      title: messageTemplate.title.replace(/\{(\w+)\}/g, (match, key) => {
        switch (key) {
          case 'pseudo': return userData?.username || 'KidAI User';
          case 'level': return segmentation.metrics.currentLevel?.toString() || '1';
          case 'streak': return segmentation.metrics.currentStreak?.toString() || '0';
          case 'days': return segmentation.metrics.daysSinceLastActivity?.toString() || '0';
          case 'count': return segmentation.metrics.missionsCompleted?.toString() || '0';
          case 'rank': return 'top 10'; // À calculer avec le leaderboard
          case 'achievement': return '1000 XP';
          case 'feature': return 'Advanced Analytics';
          case 'content': return 'Machine Learning Basics';
          default: return match;
        }
      }),
      body: messageTemplate.body.replace(/\{(\w+)\}/g, (match, key) => {
        switch (key) {
          case 'pseudo': return userData?.username || 'KidAI User';
          case 'level': return segmentation.metrics.currentLevel?.toString() || '1';
          case 'streak': return segmentation.metrics.currentStreak?.toString() || '0';
          case 'days': return segmentation.metrics.daysSinceLastActivity?.toString() || '0';
          case 'count': return segmentation.metrics.missionsCompleted?.toString() || '0';
          case 'rank': return 'top 10';
          case 'achievement': return '1000 XP';
          case 'feature': return 'Advanced Analytics';
          case 'content': return 'Machine Learning Basics';
          default: return match;
        }
      }),
      data: {
        ...messageTemplate.data,
        segment: segmentation.segment,
        userId,
        ...customData
      }
    };

    // Envoyer la notification
    try {
      await sendLocalNotification(
        personalizedMessage.title,
        personalizedMessage.body,
        personalizedMessage.data,
        strategy.channels[0] || 'default'
      );
      
      console.log(`✅ Notification segmentée envoyée: ${segmentation.segment} - ${type}`);
      return true;
      
    } catch (error) {
      console.error('❌ Erreur envoi notification segmentée:', error);
      return false;
    }
  }, [segmentation, getNotificationStrategy, getNotificationMessages, sendLocalNotification, userData]);

  // Programmer des notifications automatiques selon le segment
  const scheduleSegmentedNotifications = useCallback(async () => {
    const strategy = getNotificationStrategy;
    const messages = getNotificationMessages;
    
    // Nettoyer les notifications précédentes
    // (implémenter la logique de nettoyage si nécessaire)
    
    switch (segmentation.segment) {
      case 'new_user':
        // Notifications d'onboarding fréquentes
        await scheduleLocalNotification(
          messages.onboarding.title,
          messages.onboarding.body,
          new Date(Date.now() + 60 * 60 * 1000), // Dans 1h
          { ...messages.onboarding.data, scheduled: true },
          'onboarding'
        );
        
        await scheduleLocalNotification(
          messages.first_mission.title,
          messages.first_mission.body,
          new Date(Date.now() + 3 * 60 * 60 * 1000), // Dans 3h
          { ...messages.first_mission.data, scheduled: true },
          'missions'
        );
        break;
        
      case 'active_user':
        // Rappels de missions quotidiens
        await scheduleLocalNotification(
          messages.mission_reminder.title,
          messages.mission_reminder.body.replace('{count}', '3'),
          new Date(Date.now() + 24 * 60 * 60 * 1000), // Demain
          { ...messages.mission_reminder.data, scheduled: true },
          'missions'
        );
        break;
        
      case 'inactive_user':
        // Notifications de réengagement espacées
        await scheduleLocalNotification(
          messages.re_engagement.title,
          messages.re_engagement.body.replace('{days}', segmentation.metrics.daysSinceLastActivity.toString()),
          new Date(Date.now() + 24 * 60 * 60 * 1000), // Demain
          { ...messages.re_engagement.data, scheduled: true },
          're_engagement'
        );
        break;
        
      case 'premium_user':
        // Notifications exclusives hebdomadaires
        await scheduleLocalNotification(
          messages.premium_features.title,
          messages.premium_features.body.replace('{feature}', 'Analytics Avancés'),
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Dans 1 semaine
          { ...messages.premium_features.data, scheduled: true },
          'premium'
        );
        break;
        
      case 'churn_risk':
        // Notifications urgentes
        await scheduleLocalNotification(
          messages.churn_prevention.title,
          messages.churn_prevention.body,
          new Date(Date.now() + 6 * 60 * 60 * 1000), // Dans 6h
          { ...messages.churn_prevention.data, scheduled: true },
          'churn_prevention'
        );
        
        await scheduleLocalNotification(
          messages.special_offer.title,
          messages.special_offer.body,
          new Date(Date.now() + 24 * 60 * 60 * 1000), // Demain
          { ...messages.special_offer.data, scheduled: true },
          'special_offers'
        );
        break;
        
      case 'power_user':
        // Notifications de jalons
        await scheduleLocalNotification(
          messages.leaderboard.title,
          messages.leaderboard.body,
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Dans 1 semaine
          { ...messages.leaderboard.data, scheduled: true },
          'leaderboard'
        );
        break;
    }
    
    console.log(`📅 Notifications programmées pour le segment: ${segmentation.segment}`);
  }, [segmentation, getNotificationStrategy, getNotificationMessages, scheduleLocalNotification]);

  // Obtenir les recommandations de notification
  const getNotificationRecommendations = useMemo(() => {
    const strategy = getNotificationStrategy;
    
    return {
      frequency: strategy.frequency,
      types: strategy.types,
      timing: strategy.timing,
      tone: strategy.tone,
      channels: strategy.channels,
      nextRecommendedTime: getNextNotificationTime(segmentation.metrics.daysSinceLastActivity),
      maxDailyNotifications: getMaxDailyNotifications(strategy.frequency)
    };
  }, [segmentation, getNotificationStrategy]);

  return {
    segmentation,
    strategy: getNotificationStrategy,
    messages: getNotificationMessages,
    recommendations: getNotificationRecommendations,
    
    // Actions
    sendSegmentedNotification,
    scheduleSegmentedNotifications
  };
};

// Fonctions utilitaires pour les notifications
const getNextNotificationTime = (daysSinceLastActivity) => {
  if (daysSinceLastActivity === 0) return 'immediate'; // Aujourd'hui
  if (daysSinceLastActivity <= 3) return 'evening'; // Soir
  if (daysSinceLastActivity <= 7) return 'morning'; // Matin
  return 'weekly'; // Hebdomadaire
};

const getMaxDailyNotifications = (frequency) => {
  switch (frequency) {
    case 'intensive': return 5;
    case 'high': return 3;
    case 'medium': return 2;
    case 'low': return 1;
    case 'premium': return 4;
    case 'selective': return 2;
    default: return 2;
  }
};

export default useSegmentedNotifications;
