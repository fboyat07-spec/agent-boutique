# Configuration des Environnements Firebase

## 🌍 Vue d'ensemble

Système complet de configuration des environnements pour Firebase Functions KidAI avec gestion des variables d'environnement, détection automatique et configuration sécurisée.

## 📁 Structure

```
/functions/config
  ├── environments.js         # Configuration principale des environnements
  └── README_ENVIRONMENTS.md # Documentation

/functions
  ├── .env.example          # Exemple de variables d'environnement
  └── firebase.json         # Configuration Firebase avec variables
```

## 🌍 Environnements Disponibles

### 🛠️ Development (dev)
```javascript
{
  name: 'development',
  shortName: 'dev',
  isProduction: false,
  isStaging: false,
  isDevelopment: true,
  debug: true,
  verbose: true,
  logLevel: 'debug',
  
  // Test mode activé
  testMode: {
    enabled: true,
    allowBypass: true,
    allowAdminAccess: true,
    allowDebugMode: true,
    mockData: true,
    skipAuth: false
  },
  
  // Monitoring limité
  monitoring: {
    enabled: true,
    logLevel: 'debug',
    alerting: false,
    metrics: true
  },
  
  // Coûts désactivés
  costControl: {
    enabled: false,
    limits: {
      dailyCalls: 10000,
      monthlyCalls: 100000
    }
  }
}
```

### 🚀 Staging
```javascript
{
  name: 'staging',
  shortName: 'staging',
  isProduction: false,
  isStaging: true,
  isDevelopment: false,
  debug: true,
  verbose: true,
  logLevel: 'info',
  
  // Test mode limité
  testMode: {
    enabled: true,
    allowBypass: false,
    allowAdminAccess: true,
    allowDebugMode: true,
    mockData: false,
    skipAuth: false
  },
  
  // Monitoring complet
  monitoring: {
    enabled: true,
    logLevel: 'info',
    alerting: true,
    metrics: true
  },
  
  // Coûts activés avec limites élevées
  costControl: {
    enabled: true,
    limits: {
      dailyCalls: 5000,
      monthlyCalls: 50000
    }
  }
}
```

### 🏭 Production (prod)
```javascript
{
  name: 'production',
  shortName: 'prod',
  isProduction: true,
  isStaging: false,
  isDevelopment: false,
  debug: false,
  verbose: false,
  logLevel: 'error',
  
  // Test mode TOUJOURS désactivé
  testMode: {
    enabled: false,
    allowBypass: false,
    allowAdminAccess: false,
    allowDebugMode: false,
    mockData: false,
    skipAuth: false
  },
  
  // Monitoring strict
  monitoring: {
    enabled: true,
    logLevel: 'error',
    alerting: true,
    metrics: true
  },
  
  // Coûts activés avec limites strictes
  costControl: {
    enabled: true,
    limits: {
      dailyCalls: 1000,
      monthlyCalls: 20000
    }
  }
}
```

## 🔧 Utilitaire getEnvironment()

### 📊 Import et utilisation
```javascript
const { getEnvironment } = require('./config/environments');

// Obtenir la configuration complète
const env = getEnvironment();
console.log('Environment:', env.name); // 'development', 'staging', 'production'

// Utilitaires de détection
const { isDevelopment, isStaging, isProduction } = require('./config/environments');

if (isDevelopment()) {
  console.log('Running in development mode');
}

if (isProduction()) {
  console.log('Running in production mode');
}
```

### 🎯 Accèsurs de configuration
```javascript
const {
  getEnvironment,
  getLogLevel,
  getTestModeConfig,
  getMonitoringConfig,
  getCostControlConfig,
  getFirebaseConfig,
  getFunctionsConfig
} = require('./config/environments');

// Configuration Firebase
const firebaseConfig = getFirebaseConfig();
console.log('Firebase config:', firebaseConfig);

// Configuration des fonctions
const functionsConfig = getFunctionsConfig();
console.log('Functions config:', functionsConfig);

// Configuration du test mode
const testModeConfig = getTestModeConfig();
console.log('Test mode enabled:', testModeConfig.enabled);

// Configuration du monitoring
const monitoringConfig = getMonitoringConfig();
console.log('Monitoring enabled:', monitoringConfig.enabled);
```

## 🔧 Configuration des Variables

### 📊 Variables d'environnement (.env)
```bash
# Environnement principal
ENVIRONMENT=development
NODE_ENV=development

# Configuration Firebase
FIREBASE_PROJECT_ID=kidai-dev
FIREBASE_DATABASE_URL=https://kidai-dev-default-rtdb.firebaseio.com
FIREBASE_STORAGE_BUCKET=kidai-dev.appspot.com

# Services externes
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK
EMAIL_SERVICE=dev
ANALYTICS_SERVICE=dev

# Monitoring
MONITORING_ENABLED=true
MONITORING_LOG_LEVEL=debug
MONITORING_ALERTING=false

# Contrôle des coûts
COST_CONTROL_ENABLED=false
COST_DAILY_CALLS=10000
COST_MONTHLY_CALLS=100000

# Test mode (TOUJOURS FALSE EN PRODUCTION)
TEST_MODE_ENABLED=true
TEST_MODE_BYPASS=true
TEST_MODE_ADMIN=true
TEST_MODE_DEBUG=true

# Features
FEATURE_NEW_UI=true
FEATURE_BETA_FEATURES=true
FEATURE_DEBUG_TOOLS=true
FEATURE_ANALYTICS=false
```

### 🔧 Configuration Firebase (firebase.json)
```json
{
  "functions": {
    "source": "src",
    "runtime": "nodejs18",
    "region": "europe-west1",
    "memory": "256MB",
    "timeout": "540s",
    "env": [
      {
        "variable": "ENVIRONMENT",
        "value": "${ENVIRONMENT}",
        "available": [
          { "value": "development" },
          { "value": "staging" },
          { "value": "production" }
        ]
      },
      {
        "variable": "TEST_MODE_ENABLED",
        "value": "${TEST_MODE_ENABLED}"
      },
      {
        "variable": "MONITORING_ENABLED",
        "value": "${MONITORING_ENABLED}"
      },
      {
        "variable": "COST_CONTROL_ENABLED",
        "value": "${COST_CONTROL_ENABLED}"
      }
    ]
  }
}
```

## 🚀 Déploiement par Environnement

### 🛠️ Development
```bash
# Déployer en développement (émulateurs locaux)
firebase emulators:start

# Variables d'environnement
export ENVIRONMENT=development
export NODE_ENV=development
export TEST_MODE_ENABLED=true
export MONITORING_ENABLED=true
export COST_CONTROL_ENABLED=false

# Déploiement
firebase deploy --only functions --project kidai-dev
```

### 🚀 Staging
```bash
# Déployer en staging
export ENVIRONMENT=staging
export NODE_ENV=staging
export TEST_MODE_ENABLED=true
export MONITORING_ENABLED=true
export MONITORING_ALERTING=true
export COST_CONTROL_ENABLED=true
export COST_DAILY_CALLS=5000

firebase deploy --only functions --project kidai-staging
```

### 🏭 Production
```bash
# Déployer en production
export ENVIRONMENT=production
export NODE_ENV=production
export TEST_MODE_ENABLED=false
export MONITORING_ENABLED=true
export MONITORING_ALERTING=true
export COST_CONTROL_ENABLED=true
export COST_DAILY_CALLS=1000

firebase deploy --only functions --project kidai-prod
```

## 🔧 Configuration des Services

### 📊 Firebase Functions
```javascript
// Utiliser functions.config() pour les variables Firebase
const { functions } = require("firebase-functions/v2");
const config = functions.config();

// Accès aux variables
const environment = config.ENVIRONMENT;
const testModeEnabled = config.TEST_MODE_ENABLED === 'true';
const monitoringEnabled = config.MONITORING_ENABLED === 'true';
const costControlEnabled = config.COST_CONTROL_ENABLED === 'true';
```

### 🎯 Utilitaire getEnvironment() avec functions.config()
```javascript
const { getEnvironment } = require('./config/environments');

// La fonction détecte automatiquement l'environnement
const env = getEnvironment();

// Utilisation dans les fonctions
exports.myFunction = functions.https.onCall(async (data, context) => {
  const env = getEnvironment();
  
  if (env.isProduction && env.testMode.enabled) {
    throw new Error('Test mode cannot be enabled in production');
  }
  
  // Log selon l'environnement
  if (env.debug) {
    console.log('Debug mode enabled');
  }
  
  // Utiliser la configuration
  const monitoringConfig = getMonitoringConfig();
  if (monitoringConfig.enabled) {
    // Activer le monitoring
  }
  
  return { success: true };
});
```

## ✅ Validation et Sécurité

### 🔒 Validation automatique
```javascript
// La configuration est validée automatiquement
const { validateEnvironment, initializeEnvironment } = require('./config/environments');

try {
  initializeEnvironment();
  console.log('Environment initialized successfully');
} catch (error) {
  console.error('Environment initialization failed:', error);
  process.exit(1);
}
```

### 🛡️ Sécurité du test mode
```javascript
// Le test mode est automatiquement désactivé en production
if (env.isProduction && env.testMode.enabled) {
  throw new Error('Test mode must be disabled in production');
}

// Validation des configurations critiques
if (env.isProduction && env.debug) {
  throw new Error('Debug mode must be disabled in production');
}
```

## 📊 Configuration par Service

### 🎯 Monitoring
```javascript
// Configuration selon l'environnement
const monitoringConfig = getMonitoringConfig();

if (monitoringConfig.enabled) {
  // Activer le monitoring
  console.log(`Monitoring enabled with level: ${monitoringConfig.logLevel}`);
  
  if (monitoringConfig.alerting) {
    // Activer les alertes
    console.log('Alerting enabled');
  }
}
```

### 💰 Contrôle des coûts
```javascript
// Configuration selon l'environnement
const costConfig = getCostControlConfig();

if (costConfig.enabled) {
  // Activer le contrôle des coûts
  console.log(`Cost control enabled with limits:`, costConfig.limits);
  
  // Appliquer les limites
  const dailyLimit = costConfig.limits.dailyCalls;
  const monthlyLimit = costConfig.limits.monthlyCalls;
}
```

### 🧪 Test mode
```javascript
// Configuration selon l'environnement
const testConfig = getTestModeConfig();

if (testConfig.enabled) {
  // Activer le test mode
  console.log('Test mode enabled');
  
  if (testConfig.allowBypass) {
    console.log('Test mode bypass allowed');
  }
  
  if (testConfig.mockData) {
    console.log('Mock data enabled');
  }
}
```

## 🚀 Bonnes Pratiques

### ✅ À faire
1. **Utiliser getEnvironment()** pour accéder à la configuration
2. **Valider l'environnement** avant le déploiement
3. **Utiliser les variables d'environnement** pour les secrets
4. **Désactiver le test mode** en production
5. **Configurer les limites** selon l'environnement
6. **Utiliser les features flags** pour les nouvelles fonctionnalités

### ❌ À éviter
1. **Coder en dur** les valeurs de configuration
2. **Activer le test mode** en production
3. **Utiliser les secrets** directement dans le code
4. **Ignorer la validation** de l'environnement
5. **Déployer avec** des variables manquantes

## 🔧 Débogage et Développement

### 🛠️ Mode développement
```javascript
const env = getEnvironment();

if (env.isDevelopment) {
  // Activer le débogage
  console.log('Development mode enabled');
  console.log('Debug:', env.debug);
  console.log('Verbose:', env.verbose);
  console.log('Test mode:', env.testMode.enabled);
  
  // Activer les outils de débogage
  if (env.features.enableDebugTools) {
    // Outils de débogage
  }
}
```

### 📊 Logs selon l'environnement
```javascript
const env = getEnvironment();

// Niveau de log selon l'environnement
const logLevel = env.logLevel;

if (logLevel === 'debug') {
  console.log('Debug information');
} else if (logLevel === 'info') {
  console.info('Information');
} else if (logLevel === 'error') {
  console.error('Error information');
}
```

## ✅ Avantages du Système

### 🌍 Flexibilité
- **3 environnements** prédéfinis (dev, staging, prod)
- **Configuration automatique** selon l'environnement
- **Variables d'environnement** flexibles
- **Détection automatique** de l'environnement

### 🔒 Sécurité
- **Test mode désactivé** automatiquement en production
- **Validation automatique** de la configuration
- **Variables secrètes** gérées séparément
- **Contrôle d'accès** selon l'environnement

### 🚀 Productivité
- **Utilitaire getEnvironment()** simple à utiliser
- **Configuration centralisée** et maintenable
- **Débogage intégré** selon l'environnement
- **Déploiement simplifié** par environnement

### 📊 Monitoring
- **Configuration adaptée** selon l'environnement
- **Alertes activées** en staging/production
- **Coûts contrôlés** en production
- **Logs détaillés** en développement

Le système d'environnements garantit une **configuration flexible** et **sécurisée** pour tous les déploiements Firebase Functions ! 🌍✨
