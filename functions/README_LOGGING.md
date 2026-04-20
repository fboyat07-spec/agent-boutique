# Système de Logs Structuré - Firebase Functions

## 📝 Vue d'ensemble

Système complet de logging structuré pour les Firebase Functions KidAI avec entrées/sorties, succès/erreurs, format standardisé et alertes critiques.

## 📁 Structure

```
/functions/middleware
  ├── structuredLogger.js    # Logger structuré principal
  ├── alertManager.js        # Gestionnaire d'alertes
  └── README_LOGGING.md     # Documentation
```

## 🏗️ Architecture du Logging

### 📊 Entrées de Log Structurées

Chaque entrée de log contient les champs obligatoires :

```javascript
{
  // Métadonnées obligatoires
  timestamp: Timestamp,
  level: 'info' | 'warn' | 'error' | 'critical',
  category: 'auth' | 'user' | 'mission' | 'xp' | 'badge' | 'security',
  action: 'xp_gained' | 'mission_completed' | 'user_created',
  message: 'Description de l\'événement',
  
  // Contexte d'exécution
  functionName: 'addXp',
  region: 'europe-west1',
  executionId: 'exec_1234567890_abc123',
  
  // Métadonnées système
  runtime: 'nodejs18',
  memoryUsage: { rss, heapTotal, heapUsed, external },
  uptime: 12345,
  
  // Données utilisateur
  userId: 'user123',
  userAgent: 'Mozilla/5.0...',
  ip: '192.168.1.1',
  
  // Données additionnelles
  data: { ... },
  
  // Métadonnées de performance
  duration: 150,
  startTime: 1640995200000,
  endTime: 1640995200150,
  
  // Métadonnées d'erreur (si applicable)
  error: {
    name: 'Error',
    message: 'Message d\'erreur',
    code: 'ERROR_CODE',
    stack: 'Stack trace...'
  }
}
```

## 🔧 Utilisation dans les Fonctions

### 📊 Exemple complet avec `addXp.js`

```javascript
// Import des middlewares
const { createLogger, LOG_CONFIG } = require("../middleware/structuredLogger");
const { alertManager, ALERT_CONFIG } = require("../middleware/alertManager");

// Dans la fonction
exports.addXp = onCall({
  region: "europe-west1",
  cors: true,
}, async (request) => {
  // Créer un logger structuré
  const structuredLogger = createLogger({
    functionName: 'addXp',
    region: 'europe-west1',
    executionId: request.headers['x-execution-id']
  });

  // Logger le début
  structuredLogger.setFunctionStartTime();
  structuredLogger.logFunctionStart({
    userId: request.auth?.uid,
    amount: request.data?.amount,
    source: request.data?.source
  });

  try {
    // ... logique de la fonction ...

    // Logger le succès
    const duration = Date.now() - structuredLogger._functionStartTime;
    structuredLogger.logFunctionEnd(response, duration);
    
    // Logger l'événement business
    structuredLogger.logBusinessEvent(userId, LOG_CONFIG.actions.XP_GAINED, {
      amount,
      source,
      previousXP: response.data.previousXP,
      newXP: response.data.newXP,
      leveledUp: response.data.leveledUp,
      duration
    });

    return response;

  } catch (error) {
    // Logger l'erreur
    structuredLogger.logFunctionError(error, {
      userId,
      amount,
      source
    });

    // Créer une alerte critique si nécessaire
    if (error.message.includes('critical') || error.message.includes('database')) {
      await alertManager.createAlert(
        ALERT_CONFIG.levels.ERROR,
        ALERT_CONFIG.types.SYSTEM_ERROR,
        "Erreur critique dans addXp",
        `Une erreur critique est survenue: ${error.message}`,
        { userId, amount, source, error }
      );
    }

    throw error;
  } finally {
    // Nettoyer le logger
    structuredLogger.cleanup();
  }
});
```

## 📋 Niveaux et Catégories

### 🎯 Niveaux de Log
```javascript
const LOG_CONFIG = {
  levels: {
    DEBUG: 'debug',      // Informations de débogage
    INFO: 'info',        // Informations générales
    WARN: 'warn',        // Avertissements
    ERROR: 'error',      // Erreurs non critiques
    CRITICAL: 'critical' // Erreurs critiques
  }
};
```

### 📂 Catégories de Log
```javascript
const LOG_CONFIG = {
  categories: {
    AUTH: 'auth',           // Authentification
    USER: 'user',           // Actions utilisateur
    MISSION: 'mission',     // Missions
    XP: 'xp',              // Gains d'XP
    BADGE: 'badge',         // Badges
    SECURITY: 'security',   // Événements de sécurité
    PERFORMANCE: 'performance', // Performance
    SYSTEM: 'system',       // Événements système
    BUSINESS: 'business'    // Événements business
  }
};
```

### 🎯 Actions Spécifiques
```javascript
const LOG_CONFIG = {
  actions: {
    // XP
    XP_GAINED: 'xp_gained',
    XP_LOST: 'xp_lost',
    LEVEL_UP: 'level_up',
    
    // Missions
    MISSION_STARTED: 'mission_started',
    MISSION_COMPLETED: 'mission_completed',
    MISSION_FAILED: 'mission_failed',
    
    // Badges
    BADGE_UNLOCKED: 'badge_unlocked',
    
    // User
    USER_LOGIN: 'user_login',
    USER_LOGOUT: 'user_logout',
    
    // Security
    UNAUTHORIZED_ACCESS: 'unauthorized_access',
    RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
    
    // System
    FUNCTION_START: 'function_start',
    FUNCTION_END: 'function_end',
    FUNCTION_ERROR: 'function_error'
  }
};
```

## 🚨 Système d'Alertes

### 📊 Configuration des Alertes
```javascript
const ALERT_CONFIG = {
  levels: {
    INFO: 'info',
    WARNING: 'warning',
    ERROR: 'error',
    CRITICAL: 'critical',
    EMERGENCY: 'emergency'
  },
  
  types: {
    SYSTEM_ERROR: 'system_error',
    SECURITY_BREACH: 'security_breach',
    PERFORMANCE_DEGRADATION: 'performance_degradation',
    BUSINESS_ANOMALY: 'business_anomaly',
    USER_IMPACT: 'user_impact'
  },
  
  channels: {
    EMAIL: 'email',
    SLACK: 'slack',
    WEBHOOK: 'webhook',
    SMS: 'sms'
  }
};
```

### 🚨 Création d'Alertes
```javascript
// Alerte de sécurité
await alertManager.createAlert(
  ALERT_CONFIG.levels.WARNING,
  ALERT_CONFIG.types.SECURITY_BREACH,
  "Tentative d'accès non autorisé",
  "Un utilisateur non authentifié a tenté d'appeler la fonction",
  {
    action: 'addXp',
    ip: request.rawRequest?.ip,
    userAgent: request.rawRequest?.headers?.['user-agent']
  }
);

// Alerte système critique
await alertManager.createAlert(
  ALERT_CONFIG.levels.CRITICAL,
  ALERT_CONFIG.types.SYSTEM_ERROR,
  "Erreur de base de données",
  "Impossible de se connecter à Firestore",
  {
    error: { name, message, stack },
    affectedUsers: ['user1', 'user2', 'user3'],
    estimatedDowntime: 300000 // 5 minutes
  }
);
```

### 📈 Escalade Automatique
```javascript
const ALERT_CONFIG = {
  escalation: {
    level1: { delay: 5 * 60 * 1000, channels: ['email'] },      // 5 minutes
    level2: { delay: 15 * 60 * 1000, channels: ['email', 'slack'] }, // 15 minutes
    level3: { delay: 30 * 60 * 1000, channels: ['email', 'slack', 'sms'] } // 30 minutes
  }
};
```

## 📊 Collections Firestore

### 📝 `structured_logs`
```javascript
{
  timestamp: Timestamp,
  level: 'info',
  category: 'xp',
  action: 'xp_gained',
  message: 'User gained 50 XP',
  functionName: 'addXp',
  region: 'europe-west1',
  executionId: 'exec_1234567890_abc123',
  userId: 'user123',
  data: {
    amount: 50,
    source: 'mission_completion',
    previousXP: 150,
    newXP: 200,
    leveledUp: false
  },
  duration: 150,
  memoryUsage: { rss: 50000000, heapUsed: 30000000 },
  uptime: 12345
}
```

### 🚨 `alerts`
```javascript
{
  alertId: 'alert_1234567890_abc123',
  level: 'warning',
  type: 'security_breach',
  title: 'Tentative d\'accès non autorisé',
  message: 'Un utilisateur non authentifié a tenté d\'appeler la fonction',
  status: 'active',
  acknowledged: false,
  resolved: false,
  createdAt: Timestamp,
  details: {
    action: 'addXp',
    ip: '192.168.1.1',
    userAgent: 'Mozilla/5.0...'
  },
  impact: {
    severity: 'medium',
    affectedUsers: 0,
    businessImpact: 'low'
  }
}
```

### 📧 `notifications`
```javascript
{
  alertId: 'alert_1234567890_abc123',
  channel: 'email',
  type: 'initial',
  alert: {
    id: 'alert_1234567890_abc123',
    level: 'warning',
    title: 'Tentative d\'accès non autorisé'
  },
  sentAt: Timestamp
}
```

## 📈 Monitoring et Analytics

### 📊 Dashboard de Logs
```javascript
// Obtenir les logs récents
const recentLogs = await db.collection('structured_logs')
  .orderBy('timestamp', 'desc')
  .limit(100)
  .get();

// Filtrer par niveau
const errorLogs = await db.collection('structured_logs')
  .where('level', '==', 'error')
  .orderBy('timestamp', 'desc')
  .limit(50)
  .get();

// Filtrer par utilisateur
const userLogs = await db.collection('structured_logs')
  .where('userId', '==', 'user123')
  .orderBy('timestamp', 'desc')
  .limit(100)
  .get();
```

### 📊 Statistiques d'Alertes
```javascript
// Obtenir les statistiques d'alertes
const alertStats = await alertManager.getAlertStats('24h');

console.log('Stats alertes:', {
  total: alertStats.total,
  byLevel: alertStats.byLevel,
  byType: alertStats.byType,
  escalatedCount: alertStats.escalatedCount,
  averageResolutionTime: alertStats.averageResolutionTime
});
```

### 📊 Performance Monitoring
```javascript
// Logs de performance
const performanceLogs = await db.collection('structured_logs')
  .where('category', '==', 'performance')
  .orderBy('timestamp', 'desc')
  .limit(100)
  .get();

// Analyse des temps de réponse
const responseTimes = performanceLogs.docs.map(doc => doc.data().duration);
const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
```

## 🔧 Configuration

### Variables d'environnement
```bash
# Activer/désactiver le logging structuré
STRUCTURED_LOGGING_ENABLED=true

# Configuration du batch
LOG_BATCH_SIZE=10
LOG_BATCH_INTERVAL=5000

# Configuration des alertes
ALERT_ESCALATION_ENABLED=true
ALERT_EMAIL_ENABLED=true
ALERT_SLACK_ENABLED=true
```

### Configuration Firebase
```json
{
  "firestore": {
    "indexes": [
      {
        "collectionGroup": "structured_logs",
        "queryScope": "COLLECTION",
        "fields": [
          {"fieldPath": "timestamp", "order": "DESCENDING"},
          {"fieldPath": "level", "order": "ASCENDING"},
          {"fieldPath": "userId", "order": "ASCENDING"}
        ]
      },
      {
        "collectionGroup": "alerts",
        "queryScope": "COLLECTION",
        "fields": [
          {"fieldPath": "status", "order": "ASCENDING"},
          {"fieldPath": "createdAt", "order": "DESCENDING"},
          {"fieldPath": "level", "order": "DESCENDING"}
        ]
      }
    ]
  }
}
```

## 📱 Intégration avec Firebase Logging

### 🔄 Double Logging
```javascript
// Le système envoie les logs à Firebase Functions ET Firestore
logger.info(message, logEntry); // Firebase Functions
await db.collection('structured_logs').add(logEntry); // Firestore
```

### 📊 Format Compatible
```javascript
// Les logs sont formatés pour être compatibles avec Firebase Logging
const logEntry = {
  severity: 'INFO', // Niveau Firebase
  jsonPayload: structuredLogData // Données structurées
};
```

### 📈 Monitoring Firebase
```javascript
// Les logs apparaissent dans la console Firebase
// Avec structure JSON pour filtrage et recherche
```

## 🚀 Bonnes Pratiques

### ✅ À faire
1. **Logger systématiquement** les entrées/sorties de fonctions
2. **Utiliser les catégories** appropriées pour chaque log
3. **Inclure le contexte** (userId, action, durée)
4. **Créer des alertes** pour les erreurs critiques
5. **Nettoyer les données** sensibles avant logging
6. **Utiliser le batch** pour les écritures Firestore

### ❌ À éviter
1. **Logger les mots de passe** ou données sensibles
2. **Ignorer les erreurs** sans logging
3. **Utiliser des messages** trop génériques
4. **Oublier le cleanup** des ressources
5. **Surcharger les logs** avec données inutiles

## 📊 Exemples d'Utilisation

### 📊 Logging d'Action Utilisateur
```javascript
// Gain d'XP
structuredLogger.logBusinessEvent(userId, LOG_CONFIG.actions.XP_GAINED, {
  amount: 50,
  source: 'mission_completion',
  missionId: 'mission_123',
  previousXP: 150,
  newXP: 200
});

// Complétion de mission
structuredLogger.logBusinessEvent(userId, LOG_CONFIG.actions.MISSION_COMPLETED, {
  missionId: 'mission_123',
  missionTitle: 'Mission Quotidienne',
  xpRewarded: 50,
  completionTime: 180
});
```

### 🚨 Logging d'Erreur Critique
```javascript
// Erreur de base de données
structuredLogger.critical(
  LOG_CONFIG.categories.SYSTEM,
  'database_connection_failed',
  'Impossible de se connecter à Firestore',
  {
    error: {
      name: 'ConnectionError',
      message: 'Connection timeout',
      code: 'TIMEOUT'
    },
    affectedUsers: ['user1', 'user2', 'user3'],
    retryCount: 3
  }
);
```

### 📊 Logging de Performance
```javascript
// Performance de fonction
structuredLogger.logPerformanceMetric('function_duration', {
  functionName: 'addXp',
  duration: 150,
  memoryUsage: process.memoryUsage(),
  databaseOperations: 2,
  cacheHits: 1
});
```

## 📈 Résultats Attendus

### 📊 Visibilité Complète
- **100% des fonctions** avec logging structuré
- **Entrées/sorties** systématiquement loggées
- **Erreurs critiques** avec alertes automatiques
- **Performance** tracking en temps réel

### 🚨 Alertes Intelligentes
- **Escalade automatique** selon la sévérité
- **Notifications multi-canales** (email, Slack, SMS)
- **Impact analysis** automatique
- **Resolution tracking** complet

### 📈 Analytics Puissants
- **Dashboard temps réel** des logs
- **Filtrage avancé** par catégorie/niveau
- **Trends analysis** des erreurs
- **Performance monitoring** détaillé

Le système de logging structuré garantit une **visibilité complète** des opérations avec **alertes intelligentes** et **analytics puissants** pour une surveillance proactive ! 📝✨
