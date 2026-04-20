# Mode Test - Firebase Functions

## 🧪 Vue d'ensemble

Système complet de mode test pour les Firebase Functions KidAI avec gestion des environnements, mock users, logs détaillés et scénarios de test.

## 📁 Structure

```
/functions/middleware
  ├── testMode.js           # Gestionnaire du mode test
  └── README_TEST_MODE.md   # Documentation

/functions/src/services
  └── testModeService.js    # Services de test
```

## 🌍 Environnements

### 📊 Configuration des environnements
```javascript
const TEST_MODE_CONFIG = {
  environments: {
    DEVELOPMENT: 'development',  // Dev local avec émulateurs
    STAGING: 'staging',        // Staging avec données de test
    PRODUCTION: 'production'    // Production (sécurité maximale)
  }
};
```

### 🔍 Détection automatique de l'environnement
```javascript
// 1. Variable d'environnement
process.env.NODE_ENV === 'development'

// 2. Configuration Firebase
process.env.FIREBASE_CONFIG.projectId?.includes('dev')

// 3. Émulateur Firebase
process.env.FUNCTIONS_EMULATOR === 'true'

// 4. Par défaut: production
```

## 🎯 Fonctionnalités par Environnement

### 🛠️ Development (dev)
```javascript
{
  enableMockAuth: true,           // Mock auth activé
  enableDetailedLogging: true,    // Logs complets
  enableTestMetrics: true,        // Métriques de test
  enableBypassRateLimit: true,    // Bypass rate limit
  logging: {
    level: 'debug',               // Logs de débogage
    includeStackTrace: true,       // Stack traces
    includeMemoryUsage: true,     // Usage mémoire
    includePerformanceMetrics: true, // Performance
    batchInterval: 1000          // 1 seconde
  }
}
```

### 🧪 Staging
```javascript
{
  enableMockAuth: true,           // Mock auth activé
  enableDetailedLogging: true,    // Logs détaillés
  enableTestMetrics: true,        // Métriques de test
  enableBypassRateLimit: false,   // Rate limit activé
  logging: {
    level: 'info',                // Logs info
    includeStackTrace: true,       // Stack traces
    includeMemoryUsage: true,     // Usage mémoire
    batchInterval: 5000          // 5 secondes
  }
}
```
### 🚀 Production
```javascript
{
  enableMockAuth: false,          // Mock auth désactivé
  enableDetailedLogging: false,   // Logs minimaux
  enableTestMetrics: false,       // Pas de métriques de test
  enableBypassRateLimit: false,   // Rate limit activé
  logging: {
    level: 'warn',                // Logs warnings uniquement
    includeStackTrace: false,      // Pas de stack traces
    batchInterval: 10000         // 10 secondes
  }
}
```

## 👥 Mock Users

### 📊 Types d'utilisateurs mock
```javascript
const mockUsers = {
  admin: {
    uid: 'test_admin_123',
    email: 'admin@test.kidai.com',
    role: 'admin',
    permissions: ['read', 'write', 'admin'],
    xp: 10000,
    level: 25,
    streak: 30,
    subscription: { planId: 'premium_plus', status: 'active' }
  },
  
  premium: {
    uid: 'test_premium_123',
    email: 'premium@test.kidai.com',
    role: 'premium',
    permissions: ['read', 'write'],
    xp: 5000,
    level: 15,
    streak: 14,
    subscription: { planId: 'premium', status: 'active' }
  },
  
  regular: {
    uid: 'test_regular_123',
    email: 'regular@test.kidai.com',
    role: 'user',
    permissions: ['read', 'write'],
    xp: 500,
    level: 5,
    streak: 3,
    subscription: { planId: 'free', status: 'active' }
  },
  
  new: {
    uid: 'test_new_123',
    email: 'new@test.kidai.com',
    role: 'user',
    permissions: ['read', 'write'],
    xp: 0,
    level: 1,
    streak: 0,
    subscription: { planId: 'free', status: 'active' }
  }
};
```

## 🔧 Utilisation

### 📊 Intégration dans les fonctions
```javascript
// Import du mode test
const { testModeManager, TEST_MODE_CONFIG } = require("../middleware/testMode");

// Dans la fonction
exports.addXp = onCall({
  region: "europe-west1",
  cors: true,
}, async (request) => {
  // Obtenir la configuration du mode test
  const testConfig = testModeManager.getConfig();
  
  // Mode test: vérifier si on doit bypass l'authentification
  if (!request.auth && testConfig.config.enableMockAuth) {
    const mockUserHeader = request.headers['x-mock-user'];
    if (mockUserHeader) {
      request.auth = testModeManager.createMockAuth(mockUserHeader);
      request.isMockAuth = true;
    }
  }
  
  // Vérifier l'authentification (sauf en mode test avec bypass)
  if (!request.auth && testConfig.config.security.enforceAuth) {
    throw new Error("Authentification requise");
  }
  
  // ... logique de la fonction ...
});
```

### 🧪 Appels avec mock user
```javascript
// En développement/staging
const response = await addXp({
  amount: 50,
  source: 'test'
}, {
  headers: {
    'x-mock-user': 'admin'  // Utilise le mock admin
  }
});

// Sans mock user (authentification normale)
const response = await addXp({
  amount: 50,
  source: 'manual'
});
```

## 📊 Services de Test

### 🔧 `getTestConfig`
```javascript
// Obtenir la configuration actuelle
const result = await getTestConfig();

console.log(result.data);
// {
//   environment: 'development',
//   config: {
//     enableMockAuth: true,
//     enableDetailedLogging: true,
//     enableTestMetrics: true,
//     enableBypassRateLimit: true
//   }
// }
```

### 📈 `getTestMetrics`
```javascript
// Obtenir les métriques de test
const result = await getTestMetrics();

console.log(result.data);
// {
//   functionCalls: 25,
//   mockAuthUsages: 8,
//   environmentSwitches: 2,
//   uptime: 3600000,
//   environment: 'development'
// }
```

### 🔄 `resetTestMetrics`
```javascript
// Réinitialiser les métriques
const result = await resetTestMetrics();

console.log(result.data);
// {
//   message: "Métriques de test réinitialisées",
//   resetAt: "2024-03-22T10:30:00.000Z"
// }
```

### 🌍 `switchEnvironment`
```javascript
// Changer d'environnement (dev/staging uniquement)
const result = await switchEnvironment('staging');

console.log(result.data);
// {
//   previous: 'development',
//   current: 'staging',
//   config: { ... }
// }
```

### 👥 `getMockUsers`
```javascript
// Obtenir les utilisateurs mock disponibles
const result = await getMockUsers();

console.log(result.data);
// {
//   mockUsers: {
//     admin: { uid, email, role, xp, level, ... },
//     premium: { uid, email, role, xp, level, ... },
//     regular: { uid, email, role, xp, level, ... },
//     new: { uid, email, role, xp, level, ... }
//   },
//   availableTypes: ['admin', 'premium', 'regular', 'new']
// }
```

### 🔑 `createMockToken`
```javascript
// Créer un token mock
const result = await createMockToken({
  userType: 'premium',
  customData: {
    xp: 7500,
    level: 18
  }
});

console.log(result.data);
// {
//   mockAuth: { uid, email, role, permissions, ... },
//   token: 'mock_token_premium_1234567890',
//   userType: 'premium',
//   environment: 'development'
// }
```

### ✅ `validateAction`
```javascript
// Valider une action dans l'environnement actuel
const result = await validateAction({
  action: 'mockAuth',
  context: { userId: 'test_user' }
});

console.log(result.data);
// {
//   action: 'mockAuth',
//   isAllowed: true,
//   environment: 'development',
//   context: { userId: 'test_user' }
// }
```

## 🧪 Scénarios de Test

### 📊 `runTestScenario`
```javascript
// Simuler un gain d'XP
const result = await runTestScenario({
  scenario: 'xp_gain_simulation',
  parameters: {
    amount: 50,
    userType: 'premium',
    iterations: 5
  }
});

// Simuler une complétion de mission
const result = await runTestScenario({
  scenario: 'mission_completion_simulation',
  parameters: {
    missionId: 'test_mission_123',
    userType: 'regular',
    iterations: 3
  }
});

// Simuler un level up
const result = await runTestScenario({
  scenario: 'level_up_simulation',
  parameters: {
    targetLevel: 10,
    userType: 'admin'
  }
});

// Simuler une erreur
const result = await runTestScenario({
  scenario: 'error_simulation',
  parameters: {
    errorType: 'database',
    severity: 'high'
  }
});

// Simuler un test de charge
const result = await runTestScenario({
  scenario: 'load_test',
  parameters: {
    concurrentRequests: 20,
    userType: 'regular'
  }
});
```

## 📊 Logs Détaillés

### 🔍 Logs en développement
```javascript
// Requête complète
{
  method: 'POST',
  url: '/addXp',
  headers: { 'content-type': 'application/json', 'x-mock-user': 'admin' },
  query: {},
  body: { amount: 50, source: 'test' },
  ip: '127.0.0.1',
  userAgent: 'Mozilla/5.0...',
  timestamp: '2024-03-22T10:30:00.000Z',
  environment: 'development',
  isMockAuth: true
}

// Réponse complète
{
  statusCode: 200,
  headers: { 'content-type': 'application/json' },
  body: { success: true, data: { newXP: 550 } },
  timestamp: '2024-03-22T10:30:00.150Z',
  duration: 150
}

// Performance
{
  functionName: 'addXp',
  duration: 150,
  memoryUsage: { rss: 50000000, heapUsed: 30000000 },
  uptime: 12345
}
```

### 📊 Logs en staging
```javascript
// Logs moins détaillés mais avec stack traces
{
  functionName: 'addXp',
  duration: 120,
  memoryUsage: { rss: 45000000, heapUsed: 28000000 },
  error: { name: 'Error', message: '...', stack: '...' }
}
```

### 📊 Logs en production
```javascript
// Logs minimaux, uniquement les warnings et erreurs
{
  functionName: 'addXp',
  duration: 100,
  level: 'warn',
  message: 'Rate limit exceeded'
}
```

## 🔧 Configuration

### Variables d'environnement
```bash
# Environnement
NODE_ENV=development

# Mode test
ENABLE_MOCK_AUTH=true
ENABLE_DETAILED_LOGGING=true
BYPASS_RATE_LIMIT=true

# Configuration Firebase
FIREBASE_CONFIG={"projectId":"kidai-dev","region":"europe-west1"}

# Émulateurs
FUNCTIONS_EMULATOR=true
```

### Configuration Firebase
```json
{
  "functions": {
    "runtime": "nodejs18",
    "region": "europe-west1",
    "env": {
      "NODE_ENV": "development",
      "ENABLE_MOCK_AUTH": "true",
      "ENABLE_DETAILED_LOGGING": "true"
    }
  }
}
```

## 🚀 Déploiement

### 🛠️ Développement local
```bash
# Démarrer les émulateurs
firebase emulators:start

# Variables d'environnement
export NODE_ENV=development
export ENABLE_MOCK_AUTH=true

# Déployer en mode dev
firebase deploy --only functions --env development
```

### 🧪 Staging
```bash
# Déployer en staging
firebase deploy --only functions --env staging

# Configuration staging
firebase functions:config:set NODE_ENV=staging
firebase functions:config:set ENABLE_MOCK_AUTH=true
```

### 🚀 Production
```bash
# Déployer en production
firebase deploy --only functions --env production

# Configuration production
firebase functions:config:set NODE_ENV=production
firebase functions:config:set ENABLE_MOCK_AUTH=false
```

## 📈 Monitoring

### 📊 Dashboard de test
```javascript
// Obtenir l'état du mode test
const healthCheck = await testModeHealthCheck();

console.log(healthCheck.data);
// {
//   status: 'healthy',
//   environment: 'development',
//   features: {
//     mockAuth: true,
//     detailedLogging: true,
//     testMetrics: true,
//     bypassRateLimit: true
//   },
//   metrics: {
//     functionCalls: 150,
//     mockAuthUsages: 45,
//     uptime: 3600000
//   }
// }
```

### 📊 Métriques de performance
```javascript
// Performance par environnement
const performanceMetrics = {
  development: {
    averageResponseTime: 150,
    memoryUsage: 50000000,
    errorRate: 0.02
  },
  staging: {
    averageResponseTime: 120,
    memoryUsage: 45000000,
    errorRate: 0.01
  },
  production: {
    averageResponseTime: 100,
    memoryUsage: 40000000,
    errorRate: 0.005
  }
};
```

## ✅ Bonnes Pratiques

### 🎯 À faire
1. **Utiliser les mock users** pour les tests automatisés
2. **Logger différemment** selon l'environnement
3. **Valider les actions** avant exécution
4. **Surveiller les métriques** de test
5. **Nettoyer les données** de test régulièrement

### ❌ À éviter
1. **Activer le mode test** en production
2. **Utiliser les vrais tokens** dans les tests
3. **Oublier de nettoyer** les métriques
4. **Mélanger les environnements** dans le code
5. **Exposer les données sensibles** dans les logs

## 🔒 Sécurité

### 🛡️ Protections intégrées
- **Pas de mock auth** en production
- **Validation des actions** par environnement
- **Sanitization** des données sensibles
- **Rate limit** activé en production
- **Logs minimaux** en production

### 🔐 Validation des permissions
```javascript
// Vérifier si l'action est autorisée
const isAllowed = testModeManager.validateAction('mockAuth');
if (!isAllowed) {
  throw new Error("Action non autorisée dans cet environnement");
}
```

## 📊 Résultats Attendus

### 🧪 Testing Efficace
- **Mock users** pour tous les scénarios
- **Scénarios automatisés** complets
- **Tests de charge** intégrés
- **Simulation d'erreurs** contrôlée

### 📊 Logs Optimisés
- **Développement**: Logs complets pour débogage
- **Staging**: Logs détaillés avec performance
- **Production**: Logs minimaux et sécurisés

### 🚀 Déploiement Sécurisé
- **Environnements isolés**
- **Configuration automatique**
- **Validation des permissions**
- **Monitoring continu**

Le mode test garantit un **développement efficace** avec **logs détaillés** et **mock users** tout en maintenant une **sécurité maximale** en production ! 🧪✨
