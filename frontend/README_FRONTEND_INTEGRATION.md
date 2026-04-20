# Frontend Integration - Firebase Functions

## 🚀 Vue d'ensemble

Intégration complète du frontend avec les Firebase Functions v2 pour remplacer la logique locale par des appels serveurs sécurisés.

## 📁 Structure des hooks

```
/frontend/hooks
  ├── useFirebaseFunctions.js    # Hook principal pour appels Firebase Functions
  ├── useUserDataServer.js        # Remplacement de useUserData avec appels serveur
  ├── useXPManager.js           # Gestion spécialisée de l'XP
  ├── useMissionManager.js       # Gestion spécialisée des missions
  └── useAnalytics.js           # Analytics existant (compatible)
```

## 🔧 Hook Principal: `useFirebaseFunctions.js`

### Fonctionnalités
- **Appels sécurisés** via Firebase Functions v2
- **Gestion des erreurs** centralisée
- **Loading states** automatiques
- **Retry logic** intégré

### Utilisation
```javascript
import useFirebaseFunctions from './hooks/useFirebaseFunctions';

const MyComponent = ({ userId }) => {
  const {
    callAddXp,
    callCompleteMission,
    callCheckBadges,
    loading,
    error,
    clearError
  } = useFirebaseFunctions();

  const handleAddXP = async () => {
    const result = await callAddXp(50, 'mission_completion', {
      missionId: 'mission_123',
      difficulty: 'medium'
    });

    if (result.success) {
      console.log('XP ajouté:', result.data);
    } else {
      console.error('Erreur:', result.error);
    }
  };

  return (
    <View>
      <Button onPress={handleAddXP} disabled={loading}>
        {loading ? 'Chargement...' : 'Ajouter 50 XP'}
      </Button>
      {error && <Text>Error: {error}</Text>}
    </View>
  );
};
```

## 📊 Gestion de l'XP: `useXPManager.js`

### Fonctionnalités spécialisées
- **addXP()**: Ajout d'XP basique
- **addMissionXP()**: XP pour mission complétée
- **addBonusXP()**: XP bonus (streak, etc.)
- **addStreakXP()**: XP de streak avec multiplicateurs
- **addLevelUpXP()**: XP de level up

### Utilisation
```javascript
import useXPManager from './hooks/useXPManager';

const GameComponent = ({ userId, mission }) => {
  const {
    addMissionXP,
    addStreakXP,
    getTimeToNextLevel,
    loading,
    lastXPUpdate
  } = useXPManager(userId);

  const handleMissionComplete = async () => {
    const result = await addMissionXP(mission, {
      completionTime: 180,
      perfect: true
    });

    if (result.success) {
      console.log('Mission complétée:', result.data);
      console.log('Level up:', result.data.leveledUp);
    }
  };

  const handleStreakBonus = async () => {
    const result = await addStreakXP(7, 10); // 7 jours streak, 10 XP base
    
    if (result.success) {
      console.log('Streak XP ajouté:', result.data);
    }
  };

  return (
    <View>
      <Button onPress={handleMissionComplete} disabled={loading}>
        Compléter Mission
      </Button>
      <Button onPress={handleStreakBonus}>
        Bonus Streak
      </Button>
      {lastXPUpdate && (
        <Text>Dernier XP: +{lastXPUpdate.amount} ({lastXPUpdate.source})</Text>
      )}
    </View>
  );
};
```

## 🎯 Gestion des Missions: `useMissionManager.js`

### Fonctionnalités spécialisées
- **completeMission()**: Complétion de mission
- **completeMissionWithValidation()**: Avec validation locale
- **getDailyMissions()**: Missions quotidiennes
- **getChallengeMissions()**: Missions défi
- **startMission()**: Tracking début mission
- **abandonMission()**: Abandon de mission

### Utilisation
```javascript
import useMissionManager from './hooks/useMissionManager';

const MissionComponent = ({ userId }) => {
  const {
    completeMission,
    getDailyMissions,
    getMissionRecommendations,
    startMission,
    abandonMission,
    loading,
    lastMissionCompleted
  } = useMissionManager(userId);

  const [dailyMissions, setDailyMissions] = useState([]);

  useEffect(() => {
    loadDailyMissions();
  }, []);

  const loadDailyMissions = async () => {
    const result = await getDailyMissions();
    if (result.success) {
      setDailyMissions(result.data.missions);
    }
  };

  const handleCompleteMission = async (missionId) => {
    const result = await completeMission(missionId, {
      completionTime: 120,
      perfect: false
    });

    if (result.success) {
      console.log('Mission complétée:', result.data);
      // Recharger les missions
      loadDailyMissions();
    }
  };

  const handleStartMission = async (missionId) => {
    const result = await startMission(missionId, {
      startTime: new Date()
    });

    if (result.success) {
      console.log('Mission démarrée:', result.data);
    }
  };

  return (
    <View>
      {dailyMissions.map(mission => (
        <MissionCard
          key={mission.id}
          mission={mission}
          onComplete={() => handleCompleteMission(mission.id)}
          onStart={() => handleStartMission(mission.id)}
          onAbandon={() => abandonMission(mission.id, 'trop_difficile')}
          loading={loading}
        />
      ))}
      
      {lastMissionCompleted && (
        <Text>
          Dernière mission: {lastMissionCompleted.missionTitle} 
          (+{lastMissionCompleted.xpRewarded} XP)
        </Text>
      )}
    </View>
  );
};
```

## 🔄 Hook Complet: `useUserDataServer.js`

### Remplacement direct de `useUserData.js`
```javascript
import useUserDataServer from './hooks/useUserDataServer';

const App = ({ userId }) => {
  const {
    userData,
    loading,
    error,
    addXp,
    completeMission,
    checkBadges,
    getAvailableMissions,
    progressPercentage
  } = useUserDataServer(userId);

  // Même interface que useUserData.js mais avec appels serveur
  return (
    <View>
      <Text>Niveau: {userData.level}</Text>
      <Text>XP: {userData.xp}</Text>
      <Text>Progression: {progressPercentage}%</Text>
      
      <Button onPress={() => addXp(50, 'bonus')}>
        Ajouter 50 XP
      </Button>
      
      <Button onPress={() => completeMission('mission_123')}>
        Compléter Mission
      </Button>
      
      <Button onPress={() => checkBadges(true)}>
        Vérifier Badges
      </Button>
    </View>
  );
};
```

## 🔄 Migration Guide

### 1. Remplacer les imports
```javascript
// Avant
import useUserData from './hooks/useUserData';

// Après
import useUserDataServer from './hooks/useUserDataServer';
// Ou utiliser les hooks spécialisés
import useXPManager from './hooks/useXPManager';
import useMissionManager from './hooks/useMissionManager';
```

### 2. Mettre à jour les appels de fonction
```javascript
// Avant (écriture directe Firestore)
await updateDoc(userRef, {
  xp: currentXP + amount
});

// Après (appel Firebase Function)
const result = await callAddXp(amount, source, metadata);
if (result.success) {
  // Le state est automatiquement mis à jour
}
```

### 3. Gérer les états de chargement
```javascript
// Avant
const [loading, setLoading] = useState(false);

// Après (géré automatiquement)
const { loading, error } = useFirebaseFunctions();
```

## 🛡️ Sécurité Améliorée

### Validation côté serveur
- **Authentification vérifiée** dans chaque fonction
- **Validation des données** côté serveur
- **Transactions atomiques** pour la cohérence

### Plus d'écritures directes
- **Remplacement des écritures** Firestore directes
- **Logique métier centralisée** côté serveur
- **Réduction des risques** de corruption

## 📊 Analytics Intégré

### Tracking automatique
```javascript
// Dans useXPManager
trackXPGain(amount, source, metadata);

// Dans useMissionManager  
trackMissionComplete(missionId, title, xp, completionData);

// Dans useFirebaseFunctions
// Analytics envoyés automatiquement pour chaque appel
```

## 🎯 Cas d'Usage Avancés

### 1. Système de récompenses complexe
```javascript
const RewardSystem = ({ userId }) => {
  const { addBonusXP, addStreakXP, addLevelUpXP } = useXPManager(userId);

  const handleComplexReward = async () => {
    // XP de base
    await addBonusXP('daily_login', 10, 'Connexion quotidienne');
    
    // Bonus streak
    await addStreakXP(5, 15); // 5 jours streak, 15 XP base
    
    // Bonus level up
    await addLevelUpXP(10, 8); // Niveau 10, précédent niveau 8
  };
};
```

### 2. Système de missions avancé
```javascript
const AdvancedMissionSystem = ({ userId }) => {
  const {
    completeMissionWithValidation,
    getMissionRecommendations,
    startMission,
    abandonMission
  } = useMissionManager(userId);

  const handleAdvancedMission = async () => {
    // Validation locale avant appel serveur
    const mission = {
      id: 'advanced_mission',
      requirements: { level: 5, xp: 100 }
    };
    
    const result = await completeMissionWithValidation(mission, {
      completionTime: 300,
      perfect: true,
      hints_used: 0
    });
    
    if (result.success) {
      // Mission complétée avec succès
    }
  };
};
```

### 3. Dashboard analytics temps réel
```javascript
const AnalyticsDashboard = ({ userId }) => {
  const { getUserProgress, getXPStats } = useXPManager(userId);
  const { getMissionStats } = useMissionManager(userId);

  const [stats, setStats] = useState(null);

  useEffect(() => {
    const loadStats = async () => {
      const progress = await getUserProgress();
      const xpStats = getXPStats();
      const missionStats = getMissionStats();
      
      setStats({
        progress: progress.data,
        xp: xpStats,
        missions: missionStats
      });
    };
    
    loadStats();
    const interval = setInterval(loadStats, 30000); // Toutes les 30 secondes
    
    return () => clearInterval(interval);
  }, [getUserProgress, getXPStats, getMissionStats]);

  return (
    <View>
      <Text>XP Total: {stats?.progress?.xp}</Text>
      <Text>Niveau: {stats?.progress?.level}</Text>
      <Text>Dernier XP: +{stats?.xp?.amount}</Text>
      <Text>Dernière mission: {stats?.missions?.lastMission?.missionTitle}</Text>
    </View>
  );
};
```

## 🔧 Configuration

### Firebase Functions Configuration
```javascript
// Dans firebase.json
{
  "functions": {
    "source": "functions",
    "runtime": "nodejs18",
    "region": "europe-west1"
  }
}
```

### Variables d'environnement
```javascript
// Dans les hooks
const functions = getFunctions();
functions.useEmulator('localhost', 5001); // Pour le développement
```

## 🚀 Déploiement

### 1. Déployer les fonctions backend
```bash
cd functions
npm run deploy
```

### 2. Mettre à jour le frontend
```bash
# Les hooks sont déjà prêts à l'emploi
npm install
```

### 3. Tester l'intégration
```bash
# Démarrer les émulateurs pour les tests
firebase emulators:start
```

## ✅ Avantages de l'Intégration

### Sécurité
- ✅ **Validation centralisée** côté serveur
- ✅ **Pas d'écritures directes** Firestore
- ✅ **Authentification vérifiée** systématiquement
- ✅ **Transactions atomiques** pour la cohérence

### Performance
- ✅ **Calculs côté serveur** (plus puissant)
- ✅ **Cache intelligent** des résultats
- ✅ **Réduction du traffic** Firestore
- ✅ **Optimisation des requêtes**

### Maintenabilité
- ✅ **Code modulaire** et réutilisable
- ✅ **Logique métier centralisée**
- ✅ **Gestion des erreurs** unifiée
- ✅ **Testing facilité** des fonctions

### Scalabilité
- ✅ **Scaling automatique** avec Firebase Functions
- ✅ **Pas de limitation** client-side
- ✅ **Monitoring intégré** des performances
- ✅ **Déploiement progressif** possible

Le frontend est maintenant **entièrement intégré** avec les Firebase Functions pour une architecture sécurisée, performante et scalable ! 🚀✨
