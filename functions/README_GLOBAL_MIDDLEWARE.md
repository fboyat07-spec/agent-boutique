# Middleware Global - Firebase Functions

## 🌐 Vue d'ensemble

Middleware global réutilisable et DRY pour Firebase Functions KidAI avec validation d'authentification, d'environnement, rate limiting et logging structuré automatiques.

## 📁 Structure

```
/functions/middleware
  ├── globalMiddleware.js    # Middleware global principal
  └── README_GLOBAL_MIDDLEWARE.md  # Documentation
```

## 🔧 Architecture du Middleware

### 📊 Configuration centralisée
```javascript
const GLOBAL_MIDDLEWARE_CONFIG = {
  // Fonctions protégées par le middleware
  protectedFunctions: [
    'addXp', 'completeMission', 'checkBadges',
    'getUserProgress', 'getAvailableMissions',
    'getAllBadges', 'getUserBadges'
  ],
  
  // Options par défaut
  defaultOptions: {
    requireAuth: true,
    enforceRateLimit: true,
    validateEnvironment: true,
    enableLogging: true,
    enableSecurityAlerts: true,
    timeoutMs: 30000
  },
  
  // Options spécifiques par fonction
  functionOptions: {
    addXp: {
      requireAuth: true,
      enforceRateLimit: true,
      rateLimitAction: 'addXp',
      securityLevel: 'high'
    },
    completeMission: {
      requireAuth: true,
      enforceRateLimit: true,
      rateLimitAction: 'completeMission',
      securityLevel: 'high'
    },
    checkBadges: {
      requireAuth: true,
      enforceRateLimit: false,
      rateLimitAction: 'checkBadges',
      securityLevel: 'medium'
    },
    getAllBadges: {
      requireAuth: false,  // Public endpoint
      enforceRateLimit: false,
      securityLevel: 'low'
    }
  }
};
```

## 🚀 Utilisation Simple

### 📊 Application automatique
```javascript
// Importer le middleware global
const { applyGlobalMiddleware } = require("../middleware/globalMiddleware");

// Appliquer à n'importe quelle fonction
exports.addXp = onCall({
  region: "europe-west1",
  cors: true,
}, applyGlobalMiddleware('addXp'), // ✅ Middleware appliqué automatiquement
  async (request, response) => {
    // Le middleware a déjà validé:
    // - L'environnement
    // - L'authentification  
    // - Le rate limiting
    // - Créé le logger structuré
    
    const { logger } = request;
    const { authValidation } = request;
    const userId = request.auth.uid;
    
    // Logique métier uniquement
    const { amount, source } = request.data;
    
    logger.info(`Traitement addXp pour ${userId}`, {
      amount, source
    });
    
    return { success: true, data: { processed: true } };
  }
);
```

### 🔧 Fonctions individuelles (usage manuel)
```javascript
const { checkAuth, checkEnvironment, checkRateLimit } = require("../middleware/globalMiddleware");

// Usage manuel si nécessaire
exports.myFunction = onCall({
  region: "europe-west1",
  cors: true,
}, async (request) => {
  // Validation manuelle
  const authResult = await checkAuth(request);
  if (!authResult) {
    throw new Error("Authentification requise");
  }
  
  const envResult = await checkEnvironment(request);
  if (!envResult) {
    throw new Error("Erreur d'environnement");
  }
  
  const rateLimitResult = await checkRateLimit(request, 'myAction');
  if (!rateLimitResult.allowed) {
    throw new Error(rateLimitResult.reason);
  }
  
  // Logique métier
  return { success: true };
});
```

## 🛡️ Fonctionnalités du Middleware

### 1. **Validation d'Environnement**
```javascript
async checkEnvironment(request, logger) {
  const envValidation = secureTestModeManager.validateEnvironment();
  
  if (!envValidation.isValid) {
    // Alerte critique pour violations d'environnement
    await alertManager.createAlert(
      ALERT_CONFIG.levels.CRITICAL,
      ALERT_CONFIG.types.SECURITY_VIOLATION,
      "Environment validation failed",
      `Violations: ${envValidation.violations.join(', ')}`
    );
    
    return {
      success: false,
      error: `Environment validation failed: ${envValidation.violations.join(', ')}`,
      statusCode: 500
    };
  }
  
  return { success: true };
}
```

### 2. **Validation d'Authentification**
```javascript
async checkAuth(request, logger) {
  const authValidation = secureTestModeManager.validateAuth(request);
  
  if (!authValidation.isValid) {
    // Alerte de sécurité pour tentatives non autorisées
    await alertManager.createAlert(
      ALERT_CONFIG.levels.WARNING,
      ALERT_CONFIG.types.SECURITY_BREACH,
      "Authentication validation failed",
      `Violations: ${authValidation.violations.join(', ')}`
    );
    
    return {
      success: false,
      error: `Authentication failed: ${authValidation.violations.join(', ')}`,
      statusCode: 401
    };
  }
  
  // Ajouter les données d'authentification à la requête
  request.authValidation = authValidation;
  
  return { success: true };
}
```

### 3. **Rate Limiting**
```javascript
async checkRateLimit(request, logger, options) {
  if (!request.auth?.uid) {
    return { success: true }; // Pas de rate limit sans auth
  }

  const rateLimitResult = await rateLimit(
    request.auth.uid,
    options.rateLimitAction,
    request
  );
  
  if (!rateLimitResult.allowed) {
    return {
      success: false,
      error: rateLimitResult.reason || 'Rate limit exceeded',
      statusCode: 429
    };
  }
  
  return { success: true };
}
```

### 4. **Logging Structuré**
```javascript
// Logger créé automatiquement
const structuredLogger = createLogger({
  functionName,
  region: 'europe-west1',
  executionId: request.headers['x-execution-id']
});

// Ajouté à la requête
request.logger = structuredLogger;

// Logging automatique du début/fin
structuredLogger.logFunctionStart({
  functionName,
  userId: request.auth?.uid,
  ip: request.rawRequest?.ip
});

structuredLogger.logFunctionEnd(data, duration);
```

## 📊 Métriques Intégrées

### 📈 Métriques automatiques
```javascript
const metrics = {
  totalRequests: 0,           // Total des requêtes
  blockedRequests: 0,         // Requêtes bloquées
  authFailures: 0,           // Échecs d'authentification
  rateLimitBlocks: 0,         // Blocages rate limit
  environmentViolations: 0,    // Violations d'environnement
  averageProcessingTime: 0,    // Temps moyen de traitement
  lastReset: new Date()        // Dernière réinitialisation
};
```

### 📊 Health check
```javascript
const healthCheck = globalMiddleware.healthCheck();

console.log('Health Check:', {
  status: 'healthy',           // 'healthy' | 'degraded'
  metrics,
  errorRate: 2.5,           // Pourcentage d'erreurs
  environment: 'production',
  timestamp: new Date()
});
```

## 🔧 Configuration par Fonction

### 📊 `addXp` - Sécurité maximale
```javascript
addXp: {
  requireAuth: true,           // ✅ Authentification requise
  enforceRateLimit: true,       // ✅ Rate limit activé
  rateLimitAction: 'addXp',    // Action spécifique
  securityLevel: 'high'         // Niveau de sécurité élevé
}
```

### 🎯 `completeMission` - Sécurité élevée
```javascript
completeMission: {
  requireAuth: true,           // ✅ Authentification requise
  enforceRateLimit: true,       // ✅ Rate limit activé
  rateLimitAction: 'completeMission', // Action spécifique
  securityLevel: 'high'         // Niveau de sécurité élevé
}
```

### 🔍 `checkBadges` - Sécurité moyenne
```javascript
checkBadges: {
  requireAuth: true,           // ✅ Authentification requise
  enforceRateLimit: false,      // 🚫 Pas de rate limit
  rateLimitAction: 'checkBadges', // Action spécifique
  securityLevel: 'medium'       // Niveau de sécurité moyen
}
```

### 🌐 `getAllBadges` - Accès public
```javascript
getAllBadges: {
  requireAuth: false,          // 🚫 Pas d'authentification requise
  enforceRateLimit: false,      // 🚫 Pas de rate limit
  rateLimitAction: 'getAllBadges', // Action spécifique
  securityLevel: 'low'          // Niveau de sécurité bas
}
```

## 🚀 Implémentation DRY

### ✅ Avant duplication de code
```javascript
// ❌ Dans chaque fonction (duplication)
exports.addXp = onCall(async (request) => {
  // Validation environnement
  const envValidation = secureTestModeManager.validateEnvironment();
  if (!envValidation.isValid) {
    throw new Error(`Environment validation failed: ${envValidation.violations.join(', ')}`);
  }

  // Validation authentification
  const authValidation = secureTestModeManager.validateAuth(request);
  if (!authValidation.isValid) {
    throw new Error(`Authentication failed: ${authValidation.violations.join(', ')}`);
  }

  // Rate limiting
  const rateLimitResult = await rateLimit(request.auth.uid, 'addXp', request);
  if (!rateLimitResult.allowed) {
    throw new Error(rateLimitResult.reason);
  }

  // Logger
  const logger = createLogger({ functionName: 'addXp' });
  logger.logFunctionStart({ userId: request.auth.uid });

  // Logique métier...
});

// ❌ Répété dans completeMission, checkBadges, etc.
```

### ✅ Après middleware global (DRY)
```javascript
// ✅ Une seule ligne par fonction
exports.addXp = onCall({
  region: "europe-west1",
  cors: true,
}, applyGlobalMiddleware('addXp'), // ✅ Middleware appliqué automatiquement
  async (request, response) => {
    // ✅ Tout est déjà validé et configuré
    const { logger } = request;
    const { authValidation } = request;
    const userId = request.auth.uid;

    // ✅ Logique métier uniquement
    const { amount, source } = request.data;
    logger.info(`Traitement addXp pour ${userId}`, { amount, source });

    return { success: true, data: { processed: true } };
  }
);

// ✅ Appliqué à toutes les fonctions sans duplication
exports.completeMission = onCall({}, applyGlobalMiddleware('completeMission'), async (req, res) => { /* ... */ });
exports.checkBadges = onCall({}, applyGlobalMiddleware('checkBadges'), async (req, res) => { /* ... */ });
```

## 📊 Monitoring et Alertes

### 🚨 Alertes automatiques
```javascript
// Violation d'environnement → Alerte CRITIQUE
await alertManager.createAlert(
  ALERT_CONFIG.levels.CRITICAL,
  ALERT_CONFIG.types.SECURITY_VIOLATION,
  "Environment validation failed",
  `Violations: ${envValidation.violations.join(', ')}`
);

// Échec d'authentification → Alerte WARNING
await alertManager.createAlert(
  ALERT_CONFIG.levels.WARNING,
  ALERT_CONFIG.types.SECURITY_BREACH,
  "Authentication validation failed",
  `Violations: ${authValidation.violations.join(', ')}`
);

// Rate limit dépassé → Log WARNING
logger.warn('Rate limit exceeded', {
  userId: request.auth.uid,
  action: options.rateLimitAction,
  rateLimitDetails: rateLimitResult
});
```

### 📈 Dashboard de métriques
```javascript
const metrics = globalMiddleware.getMetrics();

console.log('Middleware Metrics:', {
  totalRequests: metrics.totalRequests,
  blockedRequests: metrics.blockedRequests,
  authFailures: metrics.authFailures,
  rateLimitBlocks: metrics.rateLimitBlocks,
  environmentViolations: metrics.environmentViolations,
  averageProcessingTime: metrics.averageProcessingTime,
  errorRate: (metrics.blockedRequests / metrics.totalRequests) * 100
});
```

## 🔧 Utilitaires Avancés

### 📊 Obtenir les options d'une fonction
```javascript
const options = globalMiddleware.getFunctionOptions('addXp');

console.log('Function Options:', {
  requireAuth: options.requireAuth,
  enforceRateLimit: options.enforceRateLimit,
  rateLimitAction: options.rateLimitAction,
  securityLevel: options.securityLevel,
  timeoutMs: options.timeoutMs
});
```

### 🔄 Réinitialiser les métriques
```javascript
globalMiddleware.resetMetrics();

console.log('Metrics reset:', {
  resetAt: new Date(),
  previousMetrics: previousMetrics
});
```

### 🏥 Health check complet
```javascript
const health = globalMiddleware.healthCheck();

if (health.status === 'degraded') {
  // Envoyer une alerte si le système est dégradé
  await alertManager.createAlert(
    ALERT_CONFIG.levels.WARNING,
    ALERT_CONFIG.types.PERFORMANCE_DEGRADATION,
    "Middleware performance degraded",
    `Error rate: ${health.errorRate}%`
  );
}
```

## ✅ Bonnes Pratiques

### 🎯 À faire
1. **Utiliser `applyGlobalMiddleware`** pour toutes les fonctions protégées
2. **Configurer les options** spécifiques par fonction dans `functionOptions`
3. **Utiliser `request.logger`** pour le logging structuré
4. **Surveiller les métriques** du middleware régulièrement
5. **Configurer les alertes** pour les violations critiques

### ❌ À éviter
1. **Dupliquer le code** de validation dans chaque fonction
2. **Ignorer les options** de configuration par fonction
3. **Oublier d'appliquer** le middleware aux nouvelles fonctions
4. **Désactiver les alertes** de sécurité
5. **Contourner le middleware** pour des raccourcis

## 📊 Résultats Attendus

### ✅ Code DRY
- **90% de réduction** du code de validation dupliqué
- **Maintenance centralisée** des règles de sécurité
- **Configuration unique** pour toutes les fonctions
- **Mise à jour automatique** des validations

### 🛡️ Sécurité Uniforme
- **Validation cohérente** dans toutes les fonctions
- **Alertes automatiques** pour toutes les violations
- **Logging structuré** uniforme
- **Rate limiting** appliqué systématiquement

### 📈 Monitoring Complet
- **Métriques centralisées** du middleware
- **Health checks** automatiques
- **Performance tracking** intégré
- **Alertes intelligentes** basées sur les métriques

Le middleware global garantit un **code DRY**, une **sécurité uniforme** et un **monitoring complet** avec une implémentation simple et réutilisable ! 🌐✨
