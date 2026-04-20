# Segmentation Utilisateur KidAI

## 🎯 Objectif

Créer un système de segmentation intelligent pour personnaliser l'expérience utilisateur selon leur profil d'engagement et leur comportement.

## 📊 Segments Utilisateur

### 1. **New User** - `new_user`
- **Critère**: Inscrit depuis moins de 7 jours, XP < 100
- **Objectif**: Guider l'utilisateur dans ses premiers pas
- **Caractéristiques**: Besoin d'onboarding, encouragement fréquent

### 2. **Active User** - `active_user`
- **Critère**: Activité récente (< 7 jours), 100-5000 XP, 5+ missions
- **Objectif**: Maintenir l'engagement régulier
- **Caractéristiques**: Utilisation constante, progression stable

### 3. **Inactive User** - `inactive_user`
- **Critère**: Inactivité 7-30 jours
- **Objectif**: Réactiver l'utilisateur
- **Caractéristiques**: À risque de churn, besoin de motivation

### 4. **Premium User** - `premium_user`
- **Critère**: Abonnement payant (planId !== 'free')
- **Objectif**: Valoriser l'investissement, upgrader vers Premium Plus
- **Caractéristiques**: Très engagé, accès aux fonctionnalités avancées

### 5. **Churning User** - `churn_risk`
- **Critère**: Inactivité 3-7 jours
- **Objectif**: Prévenir le désabonnement
- **Caractéristiques**: À risque imminent, besoin d'intervention

### 6. **Power User** - `power_user`
- **Critère**: XP > 5000, 50+ missions, streak > 7 jours
- **Objectif**: Récompenser l'expertise, fidéliser
- **Caractéristiques**: Très avancé, influence communautaire

## 🔧 Hook `useUserSegmentation.js`

### Fonction principale
```javascript
const segment = getUserSegment(userData);
```

### Utilisation
```javascript
const { 
  segment,           // Segment actuel
  criteria,          // Critères du segment
  metrics,           // Métriques calculées
  isAtRisk,          // À risque de churn ?
  isEngaged,         // Utilisateur engagé ?
  isNew,             // Nouvel utilisateur ?
  isInactive,        // Inactif ?
  isPremium,         // Abonnement premium ?
  isPowerUser        // Power user ?
} = useUserSegmentation(userData);
```

### Métriques calculées
```javascript
metrics: {
  daysSinceCreation,        // Jours depuis l'inscription
  hoursSinceLastActivity,   // Heures depuis dernière activité
  daysSinceLastActivity,    // Jours depuis dernière activité
  currentXP,                // XP actuel
  currentLevel,             // Niveau actuel
  currentStreak,            // Streak actuel
  missionsCompleted,        // Missions complétées
  isPremium,                // Abonnement premium ?
  subscriptionPlan          // Plan d'abonnement
}
```

## 📱 Notifications Segmentées

### Hook `useSegmentedNotifications.js`

### Stratégies par segment
```javascript
// New User: Fréquent, ton amical, immédiat
NOTIFICATION_STRATEGIES.new_user = {
  frequency: 'high',
  types: ['onboarding', 'tutorial', 'first_mission'],
  timing: 'immediate',
  tone: 'friendly'
};

// Inactive User: Faible, ton préoccupé, stratégique
NOTIFICATION_STRATEGIES.inactive_user = {
  frequency: 'low',
  types: ['re_engagement', 'missed_you'],
  timing: 'strategic',
  tone: 'concerned'
};

// Churn Risk: Intensif, ton attentionné, urgent
NOTIFICATION_STRATEGIES.churn_risk = {
  frequency: 'intensive',
  types: ['churn_prevention', 'special_offer'],
  timing: 'urgent',
  tone: 'caring'
};
```

### Messages personnalisés
```javascript
// Exemple pour New User
NOTIFICATION_MESSAGES.new_user.onboarding = {
  title: '🎉 Bienvenue dans KidAI !',
  body: 'Commence ton aventure avec ta première mission !',
  data: { type: 'onboarding', priority: 'high' }
};

// Exemple pour Churn Risk
NOTIFICATION_MESSAGES.churn_risk.churn_prevention = {
  title: '🔥 Ne pars pas !',
  body: 'On a une offre spéciale pour toi : -50% sur Premium',
  data: { type: 'churn_prevention', priority: 'urgent' }
};
```

### Utilisation
```javascript
const {
  segmentation,
  strategy,
  messages,
  sendSegmentedNotification,
  scheduleSegmentedNotifications
} = useSegmentedNotifications(userId, userData);

// Envoyer une notification segmentée
await sendSegmentedNotification('onboarding');

// Programmer des notifications automatiques
await scheduleSegmentedNotifications();
```

## 🎯 Missions Segmentées

### Hook `useSegmentedMissions.js`

### Stratégies par segment
```javascript
// New User: Faciles, guidées, bonus XP
MISSION_STRATEGIES.new_user = {
  difficulty: 'beginner',
  types: ['tutorial', 'discovery'],
  duration: 'short',
  xpMultiplier: 1.5,
  guidance: 'detailed'
};

// Power User: Difficiles, autonomes, reconnaissance
MISSION_STRATEGIES.power_user = {
  difficulty: 'expert',
  types: ['challenge', 'mastery'],
  duration: 'variable',
  xpMultiplier: 1.3,
  guidance: 'autonomous'
};
```

### Templates de missions
```javascript
// Mission tutoriel pour New User
MISSION_TEMPLATES.new_user.tutorial = {
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
    { title: 'Explore l\'accueil', description: 'Découvre les sections' },
    { title: 'Complète ton profil', description: 'Ajoute avatar et préférences' }
  ]
};
```

### Utilisation
```javascript
const {
  segmentation,
  strategy,
  templates,
  recommendations,
  generateSegmentedMission,
  getAdaptedDailyMissions
} = useSegmentedMissions(userId, userData);

// Générer une mission personnalisée
const mission = generateSegmentedMission('tutorial');

// Obtenir les missions quotidiennes adaptées
const dailyMissions = getAdaptedDailyMissions();
```

## 💎 Offres Segmentées

### Hook `useSegmentedOffers.js`

### Stratégies par segment
```javascript
// New User: Acquisition, essai gratuit, bienvenue
OFFER_STRATEGIES.new_user = {
  type: 'acquisition',
  urgency: 'medium',
  discount: 20,
  trialDays: 7,
  messaging: 'welcome',
  conversionGoal: 'premium_trial'
};

// Churn Risk: Rétention, urgence, discount élevé
OFFER_STRATEGIES.churn_risk = {
  type: 'retention',
  urgency: 'urgent',
  discount: 70,
  trialDays: 30,
  messaging: 'dont_go',
  conversionGoal: 'save_subscription'
};
```

### Templates d'offres
```javascript
// Offre d'essai pour New User
OFFER_TEMPLATES.new_user.welcome_trial = {
  title: '🎉 Essai Premium Gratuit !',
  description: 'Découvre toutes les fonctionnalités Premium pendant 7 jours',
  benefits: [
    'Accès illimité aux cours',
    'Missions exclusives',
    'Support prioritaire'
  ],
  discount: 0,
  trialDays: 7,
  cta: 'Commencer l\'essai gratuit'
};

// Offre urgente pour Churn Risk
OFFER_TEMPLATES.churn_risk.urgent_offer = {
  title: '🔥 Ne pars pas !',
  description: '-70% sur Premium Plus pour te retenir',
  discount: 70,
  trialDays: 30,
  cta: 'Profiter de -70%',
  urgency: 'urgent'
};
```

### Utilisation
```javascript
const {
  segmentation,
  strategy,
  templates,
  recommendations,
  activeOffers,
  generateSegmentedOffer,
  getConversionProbability
} = useSegmentedOffers(userId, userData);

// Générer une offre personnalisée
const offer = generateSegmentedOffer('welcome_trial');

// Vérifier la probabilité de conversion
const probability = getConversionProbability(offer);
```

## 🔄 Intégration Complète

### Exemple d'utilisation dans l'application
```javascript
import useUserSegmentation from './hooks/useUserSegmentation';
import useSegmentedNotifications from './hooks/useSegmentedNotifications';
import useSegmentedMissions from './hooks/useSegmentedMissions';
import useSegmentedOffers from './hooks/useSegmentedOffers';

const UserProfile = ({ userId, userData }) => {
  const segmentation = useUserSegmentation(userData);
  const notifications = useSegmentedNotifications(userId, userData);
  const missions = useSegmentedMissions(userId, userData);
  const offers = useSegmentedOffers(userId, userData);

  useEffect(() => {
    // Programmer les notifications selon le segment
    notifications.scheduleSegmentedNotifications();
    
    // Afficher les offres recommandées
    if (offers.activeOffers.length > 0) {
      setShowOffers(true);
    }
  }, [segmentation.segment]);

  const handleMissionComplete = () => {
    // Envoyer une notification de récompense segmentée
    notifications.sendSegmentedNotification('mission_completed');
  };

  return (
    <View>
      <Text>Segment: {segmentation.segment}</Text>
      
      {/* Missions adaptées */}
      <MissionList missions={missions.getAdaptedDailyMissions()} />
      
      {/* Offres recommandées */}
      {offers.activeOffers.map(offer => (
        <OfferCard key={offer.id} offer={offer} />
      ))}
    </View>
  );
};
```

## 📊 Analytics et Monitoring

### Événements de segmentation
```javascript
// Tracking des changements de segment
analytics.track('segment_changed', {
  from: 'new_user',
  to: 'active_user',
  userId,
  metrics: segmentation.metrics
});

// Tracking des interactions segmentées
analytics.track('segmented_notification_sent', {
  segment: segmentation.segment,
  type: 'onboarding',
  userId
});

analytics.track('segmented_offer_viewed', {
  segment: segmentation.segment,
  offerType: 'welcome_trial',
  conversionProbability: 0.8
});
```

### KPIs à suivre
- **Taux de conversion par segment**
- **Temps moyen dans chaque segment**
- **Taux de rétention par segment**
- **Revenue moyen par segment**
- **Engagement par segment**

## 🎯 Cas d'Usage

### 1. Nouvel utilisateur
```javascript
if (segmentation.isNew) {
  // Envoyer notifications d'onboarding
  notifications.sendSegmentedNotification('welcome');
  notifications.sendSegmentedNotification('first_mission');
  
  // Générer missions tutoriel
  const tutorialMission = missions.generateSegmentedMission('tutorial');
  
  // Offrir essai gratuit
  const trialOffer = offers.generateSegmentedOffer('welcome_trial');
}
```

### 2. Utilisateur à risque
```javascript
if (segmentation.isAtRisk) {
  // Envoyer notification urgente
  notifications.sendSegmentedNotification('churn_prevention');
  
  // Mission très facile avec gros bonus
  const easyMission = missions.generateSegmentedMission('intervention');
  
  // Offre exceptionnelle
  const urgentOffer = offers.generateSegmentedOffer('urgent_offer');
}
```

### 3. Power User
```javascript
if (segmentation.isPowerUser) {
  // Notifications de reconnaissance
  notifications.sendSegmentedNotification('achievement');
  
  // Missions expertes
  const challengeMission = missions.generateSegmentedMission('challenge');
  
  // Offres premium avancées
  const expertOffer = offers.generateSegmentedOffer('expert_pack');
}
```

## 🔧 Personnalisation

### Ajouter un nouveau segment
```javascript
// Dans useUserSegmentation.js
export const USER_SEGMENTS = {
  // ... segments existants
  VIP_USER: 'vip_user'
};

const SEGMENT_CRITERIA = {
  // ... critères existants
  [USER_SEGMENTS.VIP_USER]: {
    minXP: 10000,
    hasPremiumSubscription: true,
    minSubscriptionMonths: 6
  }
};
```

### Ajouter une nouvelle stratégie
```javascript
// Dans chaque hook de segmentation
const NOTIFICATION_STRATEGIES = {
  // ... stratégies existantes
  vip_user: {
    frequency: 'exclusive',
    types: ['vip_content', 'early_access'],
    timing: 'exclusive',
    tone: 'premium'
  }
};
```

## 🚀 Performance et Optimisation

### Optimisations
- **Cache des segments** pour éviter les recalculs
- **Lazy loading** des templates
- **Batch processing** pour les notifications groupées
- **Analytics async** pour ne pas bloquer l'UI

### Monitoring
- **Temps de segmentation** < 10ms
- **Taux de conversion** par segment
- **Coût par campagne** segmentée
- **ROI** des stratégies segmentées

La segmentation KidAI permet une **personnalisation complète** de l'expérience utilisateur avec **notifications, missions et offres adaptées** à chaque profil ! 🎯✨
