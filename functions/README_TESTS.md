# Tests Automatisés - Firebase Functions

## 🧪 Vue d'ensemble

Suite de tests automatisés complète pour les Firebase Functions KidAI avec Jest, mocks Firestore, tests de performance et validation complète des fonctionnalités.

## 📁 Structure des Tests

```
/functions/tests
  ├── firebase.test.js      # Mock Firebase Admin et Firestore
  ├── addXp.test.js       # Tests pour la fonction addXp
  ├── completeMission.test.js # Tests pour la fonction completeMission
  ├── checkBadges.test.js    # Tests pour la fonction checkBadges
  ├── jest.config.js       # Configuration Jest
  ├── setup.js             # Setup global des tests
  ├── teardown.js          # Teardown global des tests
  └── README_TESTS.md      # Documentation des tests
```

## 🎯 Cas de Test Couverts

### 📊 Tests Fonctionnels
- **Cas normaux**: Succès des fonctions avec données valides
- **Cas d'erreur**: Validation des erreurs et messages d'erreur
- **Cas limites**: Valeurs extrêmes et conditions limites
- **Cas d'authentification**: Utilisateurs authentifiés vs non authentifiés
- **Cas d'idempotence**: Double appel avec même requestId

### 🚀 Tests de Performance
- **Temps d'exécution**: Vérification des seuils de performance
- **Tests de charge**: Appels simultanés et stress tests
- **Tests de mémoire**: Utilisation mémoire et fuites
- **Tests de concurrence**: Gestion des appels parallèles

### 🔧 Tests de Validation
- **Validation des entrées**: Types de données et valeurs attendues
- **Validation des prérequis**: Niveaux, XP, missions complétées
- **Validation de cohérence**: État des données utilisateur
- **Validation des erreurs**: Messages d'erreur et codes d'erreur

## 🚀 Exécution des Tests

### 📊 Installation des Dépendances
```bash
# Installer les dépendances de développement
npm install --save-dev jest @babel/core @babel/preset-env babel-jest eslint eslint-config-prettier prettier supertest

# Ou utiliser yarn
yarn add --dev jest @babel/core @babel/preset-env babel-jest eslint eslint-config-prettier prettier supertest
```

### 🧪 Lancer les Tests
```bash
# Lancer tous les tests
npm test

# Lancer les tests en mode watch (rechargement automatique)
npm run test:watch

# Lancer les tests avec couverture de code
npm run test:coverage

# Lancer les tests pour l'intégration continue
npm run test:ci

# Lancer les tests en mode débogage
npm run test:debug

# Lancer un test spécifique
npm run test:specific -- --testNamePattern="addXp"

# Lancer les tests avec output détaillé
npm run test:verbose

# Nettoyer le cache Jest
npm run test:clear
```

### 📊 Rapports de Couverture
```bash
# Générer un rapport de couverture HTML
npm run test:coverage

# Rapport généré dans coverage/index.html
# Seuils: 80% pour branches, functions, lines, statements
```

## 🔧 Configuration Jest

### 📊 Configuration Principale
```javascript
module.exports = {
  // Environnement de test
  testEnvironment: 'node',
  
  // Timeout pour les tests
  testTimeout: 10000,
  
  // Fichiers de test
  testMatch: ['**/tests/**/*.test.js'],
  
  // Configuration de couverture
  collectCoverage: true,
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  
  // Setup et teardown
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  teardownFilesAfterEnv: ['<rootDir>/tests/teardown.js']
};
```

### 🎯 Mocks Configurés
```javascript
// Mock Firebase Admin
const mockFirebase = () => {
  const app = initializeApp({
    projectId: 'test-project',
    databaseURL: 'https://test-project.firebaseio.com',
    credential: {
      client_email: 'test@test-project.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\nmock-key\n-----END PRIVATE KEY-----\n-----'
    }
  });

  return {
    app,
    db: getFirestore(app),
    functions: getFunctions(app)
  };
};

// Mock Firestore
const mockFirestore = () => {
  const mockData = new Map();
  
  return {
    collection: (collectionName) => ({
      doc: (docId) => ({
        get: () => Promise.resolve({
          exists: mockData.has(`${collectionName}/${docId}`),
          data: () => mockData.get(`${collectionName}/${docId}`) || null
        }),
        set: (data) => {
          mockData.set(`${collectionName}/${docId}`, data);
          return Promise.resolve();
        }
      })
    })
  };
};
```

## 📊 Exemples de Tests

### 🎯 Test Normal - addXp
```javascript
test('devrait ajouter 50 XP avec succès', async () => {
  const addXp = mockFunctions.httpsCallable(mockFunctions.functions, 'addXp');
  
  const result = await addXp({
    amount: 50,
    source: 'mission_completion'
  }, {
    auth: testData.users['test_user_123']
  });

  expect(result.success).toBe(true);
  expect(result.data.newXP).toBe(1050);
  expect(result.data.previousXP).toBe(1000);
  expect(result.data.amount).toBe(50);
  expect(result.data.leveledUp).toBe(false);
});
```

### 🚨 Test d'Erreur - addXp
```javascript
test('devrait rejeter un montant négatif', async () => {
  const addXp = mockFunctions.httpsCallable(mockFunctions.functions, 'addXp');
  
  await expect(addXp({
    amount: -50,
    source: 'manual'
  }, {
    auth: testData.users['test_user_123']
  })).rejects.toThrow('Montant XP invalide');
});
```

### 🔄 Test d'Idempotence - addXp
```javascript
test('devrait gérer le double appel avec le même montant', async () => {
  const addXp = mockFunctions.httpsCallable(mockFunctions.functions, 'addXp');
  
  // Premier appel
  const result1 = await addXp({
    amount: 50,
    source: 'manual'
  }, {
    auth: testData.users['test_user_123'],
    headers: { 'x-request-id': 'test-request-123' }
  });

  expect(result1.success).toBe(true);
  expect(result1.data.newXP).toBe(1050);

  // Deuxième appel avec même request-id
  const result2 = await addXp({
    amount: 50,
    source: 'manual'
  }, {
    auth: testData.users['test_user_123'],
    headers: { 'x-request-id': 'test-request-123' }
  });

  // Le deuxième appel devrait retourner le même résultat
  expect(result2.success).toBe(true);
  expect(result2.data.newXP).toBe(1050);
  expect(result2.idempotency.isDuplicate).toBe(true);
});
```

### 🚀 Test de Performance
```javascript
test('devrait s\'exécuter en moins de 100ms', async () => {
  const addXp = mockFunctions.httpsCallable(mockFunctions.functions, 'addXp');
  
  const startTime = Date.now();
  
  const result = await addXp({
    amount: 50,
    source: 'manual'
  }, {
    auth: testData.users['test_user_123']
  });

  const duration = Date.now() - startTime;
  
  expect(result.success).toBe(true);
  expect(duration).toBeLessThan(100);
});
```

### 📊 Test de Charge
```javascript
test('devrait gérer 100 appels simultanés', async () => {
  const addXp = mockFunctions.httpsCallable(mockFunctions.functions, 'addXp');
  
  const promises = Array.from({ length: 100 }, (_, i) => 
    addXp({
      amount: 10 + i,
      source: 'stress_test'
    }, {
      auth: testData.users['test_user_123'],
      headers: { 'x-request-id': `stress-test-${i}` }
    })
  );

  const results = await Promise.allSettled(promises);
  
  // Tous devraient réussir
  const successful = results.filter(r => r.status === 'fulfilled' && r.value.success);
  expect(successful.length).toBe(100);
});
```

## 📊 Données de Test

### 👥 Utilisateurs de Test
```javascript
const testData = {
  users: {
    'test_user_123': {
      uid: 'test_user_123',
      email: 'test@example.com',
      email_verified: true,
      displayName: 'Test User',
      xp: 1000,
      level: 5,
      streak: 3,
      missionsCompleted: 5,
      badges: ['badge_1', 'badge_2'],
      subscription: {
        planId: 'premium',
        status: 'active',
        expiresAt: new Date('2024-12-31')
      }
    },
    'test_admin_456': {
      uid: 'test_admin_456',
      email: 'admin@example.com',
      email_verified: true,
      displayName: 'Test Admin',
      xp: 5000,
      level: 15,
      streak: 10,
      missionsCompleted: 50,
      badges: ['badge_1', 'badge_2', 'badge_3'],
      subscription: {
        planId: 'premium_plus',
        status: 'active',
        expiresAt: new Date('2025-12-31')
      }
    }
  }
};
```

### 🎯 Missions de Test
```javascript
const testData = {
  missions: {
    'mission_1': {
      id: 'mission_1',
      title: 'Mission Quotidienne',
      description: 'Complétez une activité quotidienne',
      type: 'daily',
      difficulty: 'easy',
      xpReward: 50,
      requirements: {
        level: 1,
        xp: 0
      },
      status: 'active'
    },
    'mission_2': {
      id: 'mission_2',
      title: 'Mission Hédomadaire',
      description: 'Complétez 5 activités cette semaine',
      type: 'weekly',
      difficulty: 'medium',
      xpReward: 150,
      requirements: {
        level: 3,
        xp: 500
      },
      status: 'active'
    }
  }
};
```

### 🏅 Badges de Test
```javascript
const testData = {
  badges: {
    'badge_1': {
      id: 'badge_1',
      name: 'Débutant',
      description: 'Premier niveau atteint',
      icon: '🌟',
      requirements: {
        level: 1
      },
      unlockedAt: new Date('2024-01-01')
    },
    'badge_2': {
      id: 'badge_2',
      name: 'Explorateur',
      description: '10 missions complétées',
      icon: '🗺️',
      requirements: {
        missionsCompleted: 10
      },
      unlockedAt: new Date('2024-02-01')
    }
  }
};
```

## ✅ Bonnes Pratiques

### 🎯 À faire
1. **Écrire des tests descriptifs** avec des noms clairs
2. **Tester les cas limites** et les conditions d'erreur
3. **Utiliser des mocks réalistes** qui simulent le comportement réel
4. **Maintenir les tests isolés** et indépendants
5. **Vérifier la couverture de code** et viser 80%+
6. **Utiliser beforeEach/afterEach** pour nettoyer l'état
7. **Tester les performances** et les cas de charge

### ❌ À éviter
1. **Tests dépendants** de l'ordre d'exécution
2. **Tests avec des données magiques** non explicites
3. **Ignorer les cas d'erreur** et les limites
4. **Tests trop complexes** qui testent plusieurs choses à la fois
5. **Mocks irréalistes** qui ne correspondent pas à la réalité
6. **Oublier de nettoyer** après les tests

## 🚀 Intégration Continue

### 📊 Configuration GitHub Actions
```yaml
name: Tests Firebase Functions

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run tests
      run: npm run test:ci
    
    - name: Upload coverage
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage/lcov.info
```

### 📊 Scripts de Validation
```bash
# Valider le code avant les tests
npm run lint

# Valider le formatage
npm run format

# Valider et tester
npm run validate

# Tests complets avec couverture
npm run test:coverage
```

## ✅ Résultats Attendus

### 📊 Couverture de Code
- **80%+** de couverture pour toutes les fonctions
- **100%** des cas normaux couverts
- **95%+** des cas d'erreur couverts
- **90%+** des cas de performance couverts

### 🚀 Qualité des Tests
- **Tests isolés** et indépendants
- **Mocks réalistes** et cohérents
- **Cas limites** testés complètement
- **Performance** validée avec seuils
- **Idempotence** testée pour toutes les fonctions

### 🔄 Maintenance Facilitée
- **Tests rapides** (< 100ms par test)
- **Exécution parallèle** des tests indépendants
- **Rapports clairs** et détaillés
- **Intégration continue** automatisée
- **Débogage facile** avec configuration Jest

Les tests automatisés garantissent une **qualité de code élevée** avec une **couverture complète** et une **maintenance facilitée** pour les Firebase Functions KidAI ! 🧪✨
