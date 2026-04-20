# Analytics Service Amélioré - KidAI

## 📊 Vue d'ensemble

Service d'analytics complet avec tracking de sessions, rétention et conversion premium, intégré à Firebase Analytics.

## 🚀 Fonctionnalités

### 📱 Session Tracking
- **Démarrage/fin de session** automatique
- **Durée de session** calculée en temps réel
- **Événements de session** trackés
- **Informations appareil** collectées

### 📈 Retention Tracking
- **Calcul J1, J7, J30** automatique
- **Cohort analysis** par date d'inscription
- **Métriques d'engagement** (sessions, durée)
- **CRON quotidien** pour le calcul automatique

### 💰 Conversion Tracking
- **Types de conversion**: trial, purchase, premium_plus
- **Source tracking** (offres, notifications, etc.)
- **Time to conversion** calculé
- **Segment utilisateur** au moment de la conversion

### 🔥 Firebase Analytics Integration
- **Double tracking** (Firestore + Firebase Analytics)
- **Événements standards** et personnalisés
- **Paramètres enrichis** (user_id, session_id, etc.)
- **Dashboard Firebase** disponible

## 📋 Structure des données

### 📊 AnalyticsEvent
```typescript
interface AnalyticsEvent {
  eventName: string;
  userId: string;
  params: Record<string, any>;
  timestamp: admin.firestore.Timestamp;
  sessionId?: string;
  sessionDuration?: number;
  userType?: string;
}
```

### 📱 SessionData
```typescript
interface SessionData {
  sessionId: string;
  userId: string;
  startTime: admin.firestore.Timestamp;
  endTime?: admin.firestore.Timestamp;
  duration?: number;
  events: string[];
  deviceInfo?: Record<string, any>;
  userType?: string;
}
```

### 📈 RetentionData
```typescript
interface RetentionData {
  userId: string;
  cohortDate: admin.firestore.Timestamp;
  day1Active: boolean;
  day7Active: boolean;
  day30Active: boolean;
  lastActiveAt: admin.firestore.Timestamp;
  totalSessions: number;
  totalDuration: number;
}
```

### 💰 ConversionData
```typescript
interface ConversionData {
  userId: string;
  convertedAt: admin.firestore.Timestamp;
  conversionType: 'premium_trial' | 'premium_purchase' | 'premium_plus';
  conversionSource: string;
  timeToConversion: number;
  userSegment: string;
}
```

## 🔧 Fonctions principales

### 📱 Session Management

#### `startSession`
```typescript
export const startSession = functions.https.onCall(async (data: {
  deviceInfo?: Record<string, any>;
  userType?: string;
}, context) => {
  // Crée une nouvelle session
  // Génère sessionId unique
  // Track event 'session_start'
  // Met à jour le document utilisateur
});
```

**Utilisation:**
```javascript
const startSessionFunc = httpsCallable(functions, 'startSession');
const result = await startSessionFunc({
  deviceInfo: getDeviceInfo(),
  userType: 'new_user'
});
```

#### `endSession`
```typescript
export const endSession = functions.https.onCall(async (data: {
  sessionId: string;
  endTime?: number;
}, context) => {
  // Calcule la durée de session
  // Met à jour la session
  // Track event 'session_end'
  // Met à jour les statistiques utilisateur
});
```

**Utilisation:**
```javascript
const endSessionFunc = httpsCallable(functions, 'endSession');
const result = await endSessionFunc({
  sessionId: currentSessionId,
  endTime: Date.now()
});
```

### 📈 Retention Tracking

#### `calculateRetention`
```typescript
export const calculateRetention = functions.https.onCall(async (data: {
  cohortDate?: string;
  userId?: string;
}, context) => {
  // Calcule J1, J7, J30
  // Sauvegarde dans collection 'retention'
  // Envoie vers Firebase Analytics
  // Retourne les données de rétention
});
```

**Utilisation:**
```javascript
const calculateRetentionFunc = httpsCallable(functions, 'calculateRetention');
const result = await calculateRetentionFunc({
  userId: 'current'
});
// result.retention = { day1Active: true, day7Active: false, day30Active: false }
```

#### `dailyRetentionCalculation` (CRON)
```typescript
export const dailyRetentionCalculation = functions.pubsub
  .schedule('0 2 * * *') // Tous les jours à 2h UTC
  .onRun(async (context) => {
    // Calcule la rétention pour tous les utilisateurs actifs
    // Traite par lots de 50
    // Log les statistiques
  });
```

### 💰 Conversion Tracking

#### `trackPremiumConversion`
```typescript
export const trackPremiumConversion = functions.https.onCall(async (data: {
  conversionType: 'premium_trial' | 'premium_purchase' | 'premium_plus';
  conversionSource: string;
  offerId?: string;
}, context) => {
  // Détermine le segment utilisateur
  // Calcule time to conversion
  // Sauvegarde dans collection 'conversions'
  // Met à jour l'abonnement utilisateur
  // Envoie vers Firebase Analytics
});
```

**Utilisation:**
```javascript
const trackConversionFunc = httpsCallable(functions, 'trackPremiumConversion');
const result = await trackConversionFunc({
  conversionType: 'premium_purchase',
  conversionSource: 'welcome_offer',
  offerId: 'offer_123'
});
```

### 📊 Analytics Stats

#### `getAnalyticsStats`
```typescript
export const getAnalyticsStats = functions.https.onCall(async (data: { 
  eventName?: string; 
  startDate?: string; 
  endDate?: string; 
  limit?: number;
  includeRetention?: boolean;
  includeConversions?: boolean;
}, context) => {
  // Récupère les événements analytics
  // Inclut les données de rétention si demandé
  // Inclut les données de conversion si demandé
  // Calcule les statistiques
});
```

**Utilisation:**
```javascript
const getStatsFunc = httpsCallable(functions, 'getAnalyticsStats');
const result = await getStatsFunc({
  startDate: '2024-03-01',
  endDate: '2024-03-31',
  includeRetention: true,
  includeConversions: true
});
```

## 📱 Frontend Integration

### Hook `useAnalyticsEnhanced.js`

#### Installation
```javascript
import useAnalyticsEnhanced from '../hooks/useAnalyticsEnhanced';

const MyComponent = ({ userId }) => {
  const {
    isInitialized,
    currentSessionId,
    trackEvent,
    trackScreenView,
    trackUserAction,
    trackPremiumConversion,
    calculateRetention
  } = useAnalyticsEnhanced(userId);

  // Utilisation...
};
```

#### Fonctions disponibles
```javascript
// Tracking événement personnalisé
await trackEvent('mission_completed', {
  mission_id: 'mission_123',
  xp_rewarded: 50,
  difficulty: 'medium'
});

// Tracking vue d'écran
await trackScreenView('home_screen', {
  user_level: 5,
  active_streak: 3
});

// Tracking action utilisateur
await trackUserAction('button_click', {
  button_id: 'start_mission',
  screen: 'missions_list'
});

// Tracking conversion premium
await trackPremiumConversion('premium_purchase', 'welcome_offer', 'offer_123');

// Calcul rétention
await calculateRetention();
```

## 🔥 Firebase Analytics Integration

### Événements envoyés automatiquement
```javascript
// Session tracking
await firebaseAnalytics.logEvent('session_start', {
  user_id: userId,
  session_id: sessionId,
  user_type: userType
});

// Rétention tracking
await firebaseAnalytics.logEvent('retention_calculated', {
  user_id: userId,
  day1_active: true,
  day7_active: false,
  day30_active: false
});

// Conversion tracking
await firebaseAnalytics.logEvent('premium_conversion', {
  user_id: userId,
  conversion_type: 'premium_purchase',
  conversion_source: 'welcome_offer',
  time_to_conversion: 7
});
```

### Dashboard Firebase
- **Events**: Tous les événements trackés
- **User Properties**: Type utilisateur, segment
- **Conversions**: Funnels de conversion
- **Retention**: Cohort analysis
- **Audience**: Démographie et comportement

## 📊 Collections Firestore

### `analytics`
```javascript
{
  eventName: 'mission_completed',
  userId: 'user123',
  params: { mission_id: 'mission_123', xp_rewarded: 50 },
  timestamp: Timestamp,
  sessionId: 'user123_1711234567890',
  sessionDuration: 120,
  userType: 'active_user'
}
```

### `sessions`
```javascript
{
  sessionId: 'user123_1711234567890',
  userId: 'user123',
  startTime: Timestamp,
  endTime: Timestamp,
  duration: 120,
  events: ['session_start', 'mission_completed', 'session_end'],
  deviceInfo: { platform: 'ios', version: '17.0' },
  userType: 'active_user'
}
```

### `retention`
```javascript
{
  userId: 'user123',
  cohortDate: Timestamp,
  day1Active: true,
  day7Active: false,
  day30Active: false,
  lastActiveAt: Timestamp,
  totalSessions: 15,
  totalDuration: 1800
}
```

### `conversions`
```javascript
{
  userId: 'user123',
  convertedAt: Timestamp,
  conversionType: 'premium_purchase',
  conversionSource: 'welcome_offer',
  timeToConversion: 7,
  userSegment: 'active_user'
}
```

## 📈 KPIs et Métriques

### Session Metrics
- **Average Session Duration**: Temps moyen par session
- **Sessions per User**: Nombre de sessions par utilisateur
- **Session Frequency**: Fréquence des sessions
- **Bounce Rate**: Taux de rebond

### Retention Metrics
- **Day 1 Retention**: % utilisateurs actifs J1
- **Day 7 Retention**: % utilisateurs actifs J7
- **Day 30 Retention**: % utilisateurs actifs J30
- **Cohort Analysis**: Rétention par cohorte

### Conversion Metrics
- **Conversion Rate**: Taux de conversion global
- **Trial to Purchase**: % trial → purchase
- **Purchase to Premium Plus**: % purchase → premium_plus
- **Time to Conversion**: Temps moyen avant conversion

### Engagement Metrics
- **DAU/MAU**: Daily/Monthly Active Users
- **Stickiness**: DAU/MAU ratio
- **Event Frequency**: Fréquence des événements
- **Feature Adoption**: Adoption par fonctionnalité

## 🚀 Déploiement

### Déployer les fonctions
```bash
cd functions
npm run build
firebase deploy --only functions
```

### Déployer le CRON
```bash
# Le CRON est inclus dans le déploiement des fonctions
firebase deploy --only functions:dailyRetentionCalculation
```

### Vérifier les indexes
```bash
firebase deploy --only firestore:indexes
```

## 🔧 Configuration

### Variables d'environnement
```bash
firebase functions:config:set env.analytics.enabled=true
firebase functions:config:set env.analytics.retention_days=90
firebase functions:config:set env.analytics.batch_size=50
```

### Firebase Analytics
- Activer Firebase Analytics dans la console
- Configurer les user properties
- Définir les événements de conversion
- Configurer les audiences

## 📱 Monitoring

### Logs Firebase Functions
```bash
firebase functions:log --only startSession
firebase functions:log --only calculateRetention
firebase functions:log --only trackPremiumConversion
```

### Dashboard Firebase
- **Analytics**: Events et user properties
- **Performance**: Temps de réponse des fonctions
- **Usage**: Nombre d'appels par fonction
- **Errors**: Taux d'erreur par fonction

## 🎯 Cas d'usage

### 1. Onboarding tracking
```javascript
// Démarrer session
await trackEvent('onboarding_started');

// Étape pseudo
await trackEvent('onboarding_step_completed', {
  step: 'pseudo',
  step_number: 1
});

// Étape avatar
await trackEvent('onboarding_step_completed', {
  step: 'avatar',
  step_number: 2
});

// Fin onboarding
await trackEvent('onboarding_completed', {
  total_duration: 180,
  steps_completed: 4
});
```

### 2. Mission tracking
```javascript
// Début mission
await trackEvent('mission_started', {
  mission_id: 'mission_123',
  mission_type: 'daily',
  difficulty: 'medium'
});

// Mission complétée
await trackEvent('mission_completed', {
  mission_id: 'mission_123',
  xp_rewarded: 50,
  completion_time: 300,
  success: true
});
```

### 3. Conversion tracking
```javascript
// Clic sur offre
await trackEvent('offer_clicked', {
  offer_id: 'welcome_offer',
  offer_type: 'discount',
  discount_percentage: 20
});

// Début trial
await trackPremiumConversion('premium_trial', 'welcome_offer', 'offer_123');

// Achat premium
await trackPremiumConversion('premium_purchase', 'trial_end', 'offer_456');
```

## ✅ Bonnes pratiques

### Performance
- **Batch processing** pour les calculs de rétention
- **Lazy loading** des données analytics
- **Cache** des statistiques fréquemment utilisées
- **Async operations** pour ne pas bloquer l'UI

### Sécurité
- **Validation** des données d'entrée
- **Rate limiting** sur les fonctions analytics
- **Sanitization** des paramètres
- **Permissions** admin pour les stats

### Qualité
- **TypeScript** pour la sécurité des types
- **Tests unitaires** pour les fonctions critiques
- **Monitoring** des erreurs et performances
- **Documentation** complète des API

L'analytics service amélioré KidAI offre un **tracking complet** avec **sessions, rétention et conversion** intégré à **Firebase Analytics** pour des insights puissants ! 📊✨
