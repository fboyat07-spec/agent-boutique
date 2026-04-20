# Firebase Functions - KidAI Backend

Backend Firebase Functions pour l'application KidAI avec Node.js 18 et TypeScript.

## 🚀 Fonctionnalités

### Fonctions principales

1. **addXp(userId, amount)** - Ajoute de l'XP à un utilisateur
   - Gère automatiquement les level up
   - Applique les bonus d'abonnement
   - Met à jour Firestore
   - Synchronise le leaderboard
   - Vérifie les badges

2. **completeMission(userId, missionId)** - Valide une mission
   - Donne l'XP de récompense
   - Marque la mission comme complétée
   - Gère les réinitialisations quotidiennes
   - Applique les multiplicateurs

3. **checkBadges(userId)** - Vérifie les conditions de badges
   - Débloque automatiquement les badges
   - Supporte différents types de conditions
   - Track les déblocages

### Fonctions additionnelles

- **getUserProgress()** - Progression utilisateur
- **getDailyMissions()** - Missions quotidiennes
- **updateMissionProgress()** - Progression mission
- **getLeaderboard()** - Classement
- **getAllBadges()** - Badges disponibles
- **getUserBadges()** - Badges utilisateur
- **getAnalyticsStats()** - Statistiques analytics

## 📦 Installation

```bash
# Installer les dépendances
npm install

# Build TypeScript
npm run build

# Démarrer les émulateurs
npm run serve
```

## 🔧 Configuration

### Variables d'environnement
```bash
firebase functions:config:set env.development=true
firebase functions:config:set env.production=false
```

### Indexes Firestore
Déployer les indexes nécessaires :
```bash
firebase deploy --only firestore:indexes
```

## 📱 Utilisation côté client

### Installation
```bash
npm install firebase-functions
```

### Exemple d'utilisation
```javascript
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();
const addXp = httpsCallable(functions, 'addXp');

// Ajouter de l'XP
try {
  const result = await addXp({
    amount: 50,
    source: 'mission_complete',
    metadata: { missionId: 'daily_interact' }
  });
  
  console.log('XP ajouté:', result.data);
} catch (error) {
  console.error('Erreur:', error);
}
```

## 🏗️ Architecture

```
functions/
├── src/
│   ├── index.ts                 # Point d'entrée principal
│   └── services/
│       ├── xpService.ts         # Service XP et level up
│       ├── missionService.ts    # Service missions
│       ├── badgeService.ts      # Service badges
│       ├── leaderboardService.ts # Service leaderboard
│       └── analyticsService.ts  # Service analytics
├── lib/                         # Build TypeScript
├── package.json
├── tsconfig.json
├── firebase.json
└── firestore.indexes.json
```

## 🔒 Sécurité

- **Authentification obligatoire** pour toutes les fonctions
- **Validation des données** en entrée
- **Permissions** vérifiées (admin vs utilisateur)
- **Sanitization** des paramètres
- **Rate limiting** intégré

## 📊 Analytics

Les fonctions track automatiquement :
- Gains d'XP
- Level up
- Complétion de missions
- Déblocage de badges
- Progression utilisateur

## 🚀 Déploiement

```bash
# Déployer en production
npm run deploy

# Déployer uniquement les fonctions
firebase deploy --only functions

# Vérifier les logs
npm run logs
```

## 🧪 Tests

```bash
# Lancer les tests
npm test

# Tests avec émulateurs
firebase emulators:exec "npm test"
```

## 📝 Logs

Les logs sont disponibles dans :
- Console Firebase
- CLI: `firebase functions:log`
- Émulateur local

## 🔧 Développement local

```bash
# Démarrer les émulateurs
firebase emulators:start

# Dans un autre terminal
npm run shell
```

## 📈 Performance

- **Cold start optimisé** avec Node.js 18
- **Cache Firestore** pour les requêtes fréquentes
- **Batch operations** pour les mises à jour multiples
- **Async/await** pour la gestion des erreurs

## 🐛 Debug

```bash
# Logs détaillés
firebase functions:log --only addXp

# Mode debug
DEBUG=* firebase functions:shell
```

## 🔄 Mises à jour

Pour mettre à jour les fonctions :
1. Modifier le code TypeScript
2. Build: `npm run build`
3. Déployer: `npm run deploy`

## 📚 Documentation supplémentaire

- [Firebase Functions Documentation](https://firebase.google.com/docs/functions)
- [TypeScript Guide](https://www.typescriptlang.org/docs/)
- [Node.js 18 Features](https://nodejs.org/docs/latest-v18.x/api/)
