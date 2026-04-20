# Mode Test Sécurisé - Firebase Functions

## 🔒 Vue d'ensemble

Système de mode test complètement sécurisé avec validation côté serveur uniquement, interdiction totale des fonctionnalités de test en production, et authentification stricte.

## 📁 Structure

```
/functions/middleware
  ├── secureTestMode.js    # Gestionnaire sécurisé du mode test
  └── README_SECURE_TEST_MODE.md  # Documentation

/functions/src/services
  └── testModeService.js  # Services sécurisés de test
```

## 🛡️ Principes de Sécurité

### 🔍 Validation côté serveur uniquement
```javascript
// ❌ JAMAIS exposer la configuration au client
const testConfig = testModeManager.getConfig(); // DANGEREUX

// ✅ TOUJOURS valider côté serveur
const envValidation = secureTestModeManager.validateEnvironment();
const authValidation = secureTestModeManager.validateAuth(request);
```

### 🚫 Interdiction stricte en production
```javascript
// ❌ FONCTIONNALITÉS INTERDITES EN PRODUCTION
const forbiddenInProduction = [
  'mockAuth',           // Mock authentication
  'testMetrics',        // Test metrics
  'detailedLogging',     // Detailed logging
  'bypassRateLimit',    // Rate limit bypass
  'resetMetrics',       // Reset metrics
  'switchEnvironment',   // Environment switching
  'runTestScenarios'    // Test scenarios
];
```

### 🔐 Authentification stricte
```javascript
// ❌ Headers de test interdits en production
const forbiddenHeaders = [
  'x-mock-user',
  'x-test-mode',
  'x-bypass-auth',
  'x-skip-validation'
];

// ✅ Validation stricte de l'authentification
const authValidation = secureTestModeManager.validateAuth(request);
if (!authValidation.isValid) {
  throw new Error(`Authentication failed: ${authValidation.violations.join(', ')}`);
}
```

## 🔧 Architecture Sécurisée

### 📊 Détection d'environnement sécurisée
```javascript
class SecureTestModeManager {
  detectEnvironmentSecurely() {
    // 1. Variable d'environnement NODE_ENV (priorité 1)
    const nodeEnv = process.env.NODE_ENV?.toLowerCase();
    if (nodeEnv && ['development', 'staging', 'production'].includes(nodeEnv)) {
      return nodeEnv;
    }

    // 2. Configuration Firebase Functions (priorité 2)
    try {
      const functionsConfig = require('firebase-functions/compat').config();
      if (functionsConfig.env?.environment) {
        return functionsConfig.env.environment.toLowerCase();
      }
    } catch (error) {
      logger.warn("Error reading Firebase config:", error.message);
    }

    // 3. ID de projet Firebase (priorité 3)
    const projectId = process.env.FIREBASE_CONFIG?.project_id || process.env.GCLOUD_PROJECT;
    if (projectId.includes('prod') || projectId.includes('production')) {
      return 'production';
    }

    // 4. Par défaut: PRODUCTION (sécurité maximale)
    return 'production';
  }
}
```

### 🛡️ Validation d'environnement
```javascript
validateEnvironment() {
  const validation = {
    isValid: true,
    environment: this.environment,
    violations: [],
    securityLevel: 'high'
  };

  // En production, vérifications supplémentaires
  if (this.environment === 'production') {
    if (this.config.enableMockAuth) {
      validation.isValid = false;
      validation.violations.push('Mock auth enabled in production');
      validation.securityLevel = 'critical';
    }

    if (this.config.enableTestMetrics) {
      validation.isValid = false;
      validation.violations.push('Test metrics enabled in production');
      validation.securityLevel = 'critical';
    }
  }

  return validation;
}
```

### 🔐 Validation d'authentification sécurisée
```javascript
validateAuth(request) {
  const validation = {
    isValid: true,
    isAuthenticated: false,
    isMockAuth: false,
    violations: [],
    authData: null
  };

  // Vérifier les headers interdits
  const forbiddenHeaders = this.checkForbiddenHeaders(request);
  if (forbiddenHeaders.length > 0) {
    validation.isValid = false;
    validation.violations.push(`Forbidden headers: ${forbiddenHeaders.join(', ')}`);
  }

  // En production, authentification stricte requise
  if (this.config.enforceStrictAuth && !request.auth) {
    validation.isValid = false;
    validation.violations.push('Authentication required');
  }

  // Vérifier si c'est un mock auth (uniquement en dev/staging)
  if (request.auth && request.auth.customClaims?.isMock) {
    if (this.environment === 'production') {
      validation.isValid = false;
      validation.violations.push('Mock auth detected in production');
    } else {
      validation.isMockAuth = true;
    }
  }

  return validation;
}
```

## 🚀 Implémentation Sécurisée

### 📊 Dans `addXp.js` - Exemple complet
```javascript
exports.addXp = onCall({
  region: "europe-west1",
  cors: true,
}, async (request) => {
  // 1. Sécurité: Valider l'environnement côté serveur uniquement
  const envValidation = secureTestModeManager.validateEnvironment();
  if (!envValidation.isValid) {
    logger.error('🚨 Environment validation failed', {
      violations: envValidation.violations,
      securityLevel: envValidation.securityLevel
    });
    throw new Error(`Environment validation failed: ${envValidation.violations.join(', ')}`);
  }

  // 2. Sécurité: Valider l'authentification de manière sécurisée
  const authValidation = secureTestModeManager.validateAuth(request);
  if (!authValidation.isValid) {
    logger.error('🚨 Authentication validation failed', {
      violations: authValidation.violations,
      environment: secureTestModeManager.environment
    });
    throw new Error(`Authentication validation failed: ${authValidation.violations.join(', ')}`);
  }

  // 3. Sécurité: En production, aucune authentification mock n'est autorisée
  if (secureTestModeManager.environment === 'production' && authValidation.isMockAuth) {
    const error = new Error("Mock authentication not allowed in production");
    
    // Logger l'erreur critique
    structuredLogger.critical(
      LOG_CONFIG.categories.SECURITY,
      LOG_CONFIG.actions.SECURITY_VIOLATION,
      "Mock auth detected in production",
      {
        uid: request.auth.uid,
        ip: request.rawRequest?.ip,
        environment: secureTestModeManager.environment,
        error
      }
    );
    
    // Créer une alerte critique
    await alertManager.createAlert(
      ALERT_CONFIG.levels.CRITICAL,
      ALERT_CONFIG.types.SECURITY_BREACH,
      "Mock authentication detected in production",
      "A mock authentication attempt was detected in production environment",
      {
        uid: request.auth.uid,
        ip: request.rawRequest?.ip,
        environment: secureTestModeManager.environment,
        timestamp: new Date()
      }
    );
    
    throw error;
  }

  // ... logique de la fonction ...
});
```

## 📊 Services Sécurisés

### 🔧 `getSecureTestConfig` - Configuration sécurisée
```javascript
exports.getSecureTestConfig = onCall({
  region: "europe-west1",
  cors: true,
}, async (request) => {
  try {
    // Sécurité: Valider l'environnement côté serveur
    const envValidation = secureTestModeManager.validateEnvironment();
    if (!envValidation.isValid) {
      throw new Error(`Environment validation failed: ${envValidation.violations.join(', ')}`);
    }

    // Sécurité: Valider l'authentification
    const authValidation = secureTestModeManager.validateAuth(request);
    if (!authValidation.isAuthenticated) {
      throw new Error("Authentication required for test config access");
    }

    // Sécurité: En production, ne jamais exposer la configuration de test
    if (secureTestModeManager.environment === 'production') {
      throw new Error("Test config access not allowed in production");
    }

    const config = secureTestModeManager.getSecurityMetrics();
    
    return {
      success: true,
      data: {
        environment: config.environment,
        isProduction: config.config.isProduction,
        // Ne jamais exposer les détails sensibles
        securityLevel: config.config.isProduction ? 'maximum' : 'standard'
      }
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});
```

## 🔒 Configuration Sécurisée

### 📊 Variables d'environnement
```bash
# Environnement (détection automatique)
NODE_ENV=production

# Configuration sécurisée par défaut
DEFAULT_TO_PRODUCTION=true

# Headers de sécurité
FORBIDDEN_TEST_HEADERS=x-mock-user,x-test-mode,x-bypass-auth
```

### 🛡️ Configuration par environnement
```javascript
const SECURE_TEST_CONFIG = {
  environmentConfig: {
    production: {
      enableMockAuth: false,          // 🚫 TOUJOURS false
      enableTestMetrics: false,        // 🚫 TOUJOURS false
      enableDetailedLogging: false,    // 🚫 TOUJOURS false
      enableBypassRateLimit: false,    // 🚫 TOUJOURS false
      enforceStrictAuth: true,         // ✅ TOUJOURS true
      validateAllRequests: true,       // ✅ TOUJOURS true
      logAllFailures: true            // ✅ TOUJOURS true
    },
    staging: {
      enableMockAuth: true,           // ✅ Autorisé en staging
      enableTestMetrics: true,        // ✅ Autorisé en staging
      enableDetailedLogging: true,    // ✅ Autorisé en staging
      enableBypassRateLimit: false,   // 🚫 Jamais en staging
      enforceStrictAuth: true,         // ✅ Authentification stricte
      validateAllRequests: true,       // ✅ Validation complète
      logAllFailures: true            // ✅ Logger les échecs
    },
    development: {
      enableMockAuth: true,           // ✅ Autorisé en dev
      enableTestMetrics: true,        // ✅ Autorisé en dev
      enableDetailedLogging: true,    // ✅ Autorisé en dev
      enableBypassRateLimit: true,    // ✅ Autorisé en dev
      enforceStrictAuth: false,        // 🚫 Pas en dev
      validateAllRequests: false,      // 🚫 Pas en dev
      logAllFailures: false           // 🚫 Pas en dev
    }
  }
};
```

## 🚨 Alertes de Sécurité

### 🔍 Détection de violations
```javascript
// Mock auth en production
if (this.environment === 'production' && authValidation.isMockAuth) {
  await alertManager.createAlert(
    ALERT_CONFIG.levels.CRITICAL,
    ALERT_CONFIG.types.SECURITY_BREACH,
    "Mock authentication detected in production",
    "A mock authentication attempt was detected in production environment",
    {
      uid: request.auth.uid,
      ip: request.rawRequest?.ip,
      environment: this.environment,
      timestamp: new Date()
    }
  );
}

// Headers interdits
if (forbiddenHeaders.length > 0) {
  await alertManager.createAlert(
    ALERT_CONFIG.levels.WARNING,
    ALERT_CONFIG.types.SECURITY_VIOLATION,
    "Forbidden headers detected",
    `Test headers detected in ${this.environment} environment`,
    {
      headers: forbiddenHeaders,
      ip: request.rawRequest?.ip,
      environment: this.environment
    }
  );
}
```

### 📊 Métriques de sécurité
```javascript
const securityMetrics = {
  blockedRequests: 0,           // Requêtes bloquées
  unauthorizedAttempts: 0,       // Tentatives non autorisées
  forbiddenHeaderAttempts: 0,    // Headers interdits détectés
  environmentViolations: 0,      // Violations d'environnement
  lastSecurityCheck: new Date()    // Dernière vérification
};
```

## ✅ Bonnes Pratiques de Sécurité

### 🎯 À faire TOUJOURS
1. **Valider l'environnement** côté serveur uniquement
2. **Utiliser `secureTestModeManager`** pour toutes les validations
3. **Vérifier l'authentification** avec `validateAuth()`
4. **Logger les violations** de sécurité
5. **Créer des alertes** pour les violations critiques
6. **Ne jamais exposer** la configuration au client

### ❌ À ne JAMAIS faire
1. **Exposer `testConfig`** au client
2. **Autoriser mock auth** en production
3. **Ignorer les validations** de sécurité
4. **Utiliser les headers** de test en production
5. **Désactiver les alertes** de sécurité
6. **Contourner les validations** côté serveur

## 🔧 Déploiement Sécurisé

### 🚀 Configuration de production
```bash
# Variables d'environnement sécurisées
export NODE_ENV=production
export DEFAULT_TO_PRODUCTION=true
export FORBIDDEN_TEST_HEADERS=x-mock-user,x-test-mode,x-bypass-auth

# Configuration Firebase
firebase functions:config:set NODE_ENV=production
firebase functions:config:set DEFAULT_TO_PRODUCTION=true
```

### 📋 Checklist de déploiement
- [ ] `NODE_ENV=production` configuré
- [ ] Mock auth désactivé en production
- [ ] Validations de sécurité activées
- [ ] Alertes de sécurité configurées
- [ ] Logs de sécurité activés
- [ ] Headers de test bloqués
- [ ] Authentification stricte activée

## 📊 Monitoring de Sécurité

### 📈 Dashboard de sécurité
```javascript
// Obtenir les métriques de sécurité
const securityMetrics = secureTestModeManager.getSecurityMetrics();

console.log('Security Dashboard:', {
  environment: securityMetrics.environment,
  blockedRequests: securityMetrics.blockedRequests,
  unauthorizedAttempts: securityMetrics.unauthorizedAttempts,
  forbiddenHeaderAttempts: securityMetrics.forbiddenHeaderAttempts,
  environmentViolations: securityMetrics.environmentViolations,
  securityLevel: securityMetrics.config.isProduction ? 'maximum' : 'standard'
});
```

### 🔍 Health check de sécurité
```javascript
// Vérifier la santé du système de sécurité
const healthCheck = secureTestModeManager.securityHealthCheck();

console.log('Security Health:', {
  status: healthCheck.status,
  environment: healthCheck.environment,
  securityLevel: healthCheck.securityLevel,
  violations: healthCheck.violations || [],
  metrics: healthCheck.metrics
});
```

## 🛡️ Résultats de Sécurité

### ✅ Sécurité garantie
- **Zéro exposition** de la configuration au client
- **Validation stricte** côté serveur uniquement
- **Interdiction totale** des fonctionnalités de test en production
- **Authentification stricte** avec validation complète
- **Alertes automatiques** pour toutes les violations
- **Logging complet** des événements de sécurité

### 🚨 Détection immédiate
- **Mock auth** en production → alerte critique
- **Headers de test** en production → alerte warning
- **Violations d'environnement** → blocage immédiat
- **Tentatives non autorisées** → blocage et logging
- **Configuration invalide** → erreur critique

### 📊 Visibilité complète
- **Dashboard de sécurité** en temps réel
- **Métriques détaillées** des violations
- **Health checks** automatiques
- **Alertes intelligentes** avec escalation
- **Audit trail** complet de tous les accès

Le mode test sécurisé garantit une **sécurité maximale** avec **zéro risque** de contournement côté client et **détection immédiate** de toute violation ! 🔒✨
