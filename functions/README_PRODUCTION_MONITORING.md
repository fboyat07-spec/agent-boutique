# 📊 Monitoring Production - Firebase Functions

## 📊 Vue d'ensemble

Système complet de monitoring production pour Firebase Functions KidAI avec logs structurés, métriques temps réel, et alertes automatiques pour garantir la stabilité et la performance en production.

## 📁 Structure

```
/functions/middleware
  ├── productionMonitoring.js           # Gestionnaire principal de monitoring production
  ├── productionMonitoringMiddleware.js # Middleware de monitoring production
  └── README_PRODUCTION_MONITORING.md   # Documentation

/functions/src/services
  └── productionMonitoringService.js   # Services de monitoring production
```

## 📊 Configuration du Monitoring Production

### **🎯 Seuils d'alertes**
```javascript
const PRODUCTION_MONITORING_CONFIG = {
  thresholds: {
    errorRate: 5.0,        // 5% de taux d'erreur
    latency: {
      warning: 1000,      // 1 seconde
      critical: 2000      // 2 secondes
    },
    throughput: {
      min: 10,           // 10 requêtes/minute minimum
      max: 1000          // 1000 requêtes/minute maximum
    },
    memory: {
      warning: 70,        // 70% d'utilisation mémoire
      critical: 90        // 90% d'utilisation mémoire
    },
    cpu: {
      warning: 70,        // 70% d'utilisation CPU
      critical: 90        // 90% d'utilisation CPU
    }
  }
};
```

### **📊 Logs structurés**
```javascript
logging: {
  structured: true,
  fields: {
    required: ['timestamp', 'userId', 'action', 'duration', 'status', 'functionName'],
    optional: ['error', 'metadata', 'requestId', 'ip', 'userAgent', 'region']
  },
  retention: {
    logs: 30 * 24 * 60 * 60 * 1000,    // 30 jours
    metrics: 90 * 24 * 60 * 60 * 1000,  // 90 jours
    alerts: 365 * 24 * 60 * 60 * 1000 // 1 an
  }
}
```

### **🚨 Système d'alertes**
```javascript
alerts: {
  enabled: true,
  channels: ['slack', 'email', 'webhook'],
  cooldown: 5 * 60 * 1000,    // 5 minutes entre les alertes similaires
  maxAlertsPerHour: 10,
  escalation: {
    enabled: true,
    levels: ['warning', 'critical', 'emergency'],
    thresholds: {
      warning: { count: 1, window: 5 * 60 * 1000 },
      critical: { count: 3, window: 15 * 60 * 1000 },
      emergency: { count: 5, window: 30 * 60 * 1000 }
    }
  }
}
```

## 🚀 Implémentation du Monitoring Production

### **📊 Gestionnaire principal**
```javascript
class ProductionMonitoringManager {
  // Enregistrer une exécution de fonction
  async recordExecution(functionName, userId, action, duration, status, error = null, metadata = {}) {
    const timestamp = new Date();
    const requestId = metadata.requestId || this.generateRequestId();
    
    // Mettre à jour les métriques en temps réel
    this.updateRealTimeMetrics(functionName, userId, action, duration, status, error);
    
    // Créer le log structuré
    const logEntry = this.createStructuredLog({
      timestamp,
      requestId,
      userId,
      action,
      duration,
      status,
      functionName,
      error,
      metadata
    });
    
    // Logger dans Firestore
    await this.logToFirestore(logEntry);
    
    // Logger dans la console Firebase
    this.logToConsole(logEntry);
    
    // Vérifier les seuils d'alertes
    await this.checkThresholds(functionName, duration, status, error);
  }

  // Créer un log structuré
  createStructuredLog({ timestamp, requestId, userId, action, duration, status, functionName, error, metadata }) {
    const logEntry = {
      // Champs obligatoires
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      requestId,
      userId,
      action,
      duration,
      status,
      functionName,
      
      // Champs optionnels
      metadata: {
        ...metadata,
        environment: process.env.ENVIRONMENT || 'production',
        version: process.env.FUNCTION_VERSION || '1.0.0',
        region: process.env.FUNCTION_REGION || 'europe-west1'
      },
      
      // Informations système
      system: {
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        uptime: process.uptime(),
        pid: process.pid
      }
    };
    
    // Ajouter l'erreur si présente
    if (error) {
      logEntry.error = {
        message: error.message,
        stack: error.stack,
        code: error.code,
        severity: this.getErrorSeverity(error)
      };
    }
    
    return logEntry;
  }
}
```

### **🔧 Middleware de monitoring**
```javascript
const createProductionMonitoringMiddleware = (functionName) => {
  return async (request, response, next) => {
    const startTime = Date.now();
    const userId = request.auth?.uid || 'anonymous';
    const requestId = request.headers['x-request-id'] || productionMonitoringManager.generateRequestId();
    
    // Ajouter les informations de monitoring à la requête
    request.monitoring = {
      startTime,
      requestId,
      functionName,
      userId
    };
    
    // Intercepter la réponse pour enregistrer les métriques
    const originalSend = response.send;
    const originalJson = response.json;
    
    const recordMetrics = (data, statusCode = 200) => {
      const endTime = Date.now();
      const duration = endTime - startTime;
      const status = statusCode >= 400 ? 'error' : 'success';
      const error = statusCode >= 400 ? new Error(`HTTP ${statusCode}`) : null;
      
      // Enregistrer l'exécution
      productionMonitoringManager.recordExecution(
        functionName,
        userId,
        'function_call',
        duration,
        status,
        error,
        {
          requestId,
          statusCode,
          userAgent: request.headers['user-agent'],
          ip: request.headers['x-forwarded-for'] || request.ip,
          region: process.env.FUNCTION_REGION || 'europe-west1',
          requestData: request.data,
          responseData: data
        }
      );
    };
    
    response.send = (data) => {
      recordMetrics(data, response.statusCode || 200);
      return originalSend.call(response, data);
    };
    
    response.json = (data) => {
      recordMetrics(data, response.statusCode || 200);
      return originalJson.call(response, data);
    };
    
    next();
  };
};
```

## 📊 Logs Structurés

### **📋 Structure des logs**
```javascript
{
  // Champs obligatoires
  timestamp: "2024-03-22T15:30:00.000Z",
  requestId: "req_1711145400000_abc123def",
  userId: "user123",
  action: "addXp",
  duration: 245,
  status: "success",
  functionName: "addXp",
  
  // Champs optionnels
  metadata: {
    environment: "production",
    version: "1.0.0",
    region: "europe-west1",
    amount: 50,
    source: "mission_completion"
  },
  
  // Informations système
  system: {
    memoryUsage: {
      rss: 50331648,
      heapTotal: 20971520,
      heapUsed: 15728640,
      external: 1048576
    },
    cpuUsage: {
      user: 1234567,
      system: 2345678
    },
    uptime: 3600,
    pid: 12345
  },
  
  // En cas d'erreur
  error: {
    message: "Montant XP invalide",
    stack: "Error: Montant XP invalide\n    at addXp (/workspace/functions/xp/addXp.js:94:15)",
    code: "INVALID_ARGUMENT",
    severity: "error"
  }
}
```

### **📊 Collections Firestore**
```javascript
// Logs principaux
collection('production_logs')
  .add({
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    requestId: "req_1711145400000_abc123def",
    userId: "user123",
    action: "addXp",
    duration: 245,
    status: "success",
    functionName: "addXp",
    metadata: { amount: 50, source: "mission_completion" },
    system: { memoryUsage: {...}, cpuUsage: {...} }
  });

// Métriques agrégées par minute
collection('production_metrics')
  .doc(`minute_${Math.floor(Date.now() / 60000)}`)
  .set({
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    window: 'minute',
    requests: 150,
    errors: 3,
    totalDuration: 12500,
    uniqueUsers: ["user1", "user2", "user3"],
    functionCalls: [
      { name: "addXp", count: 45 },
      { name: "completeMission", count: 30 },
      { name: "checkBadges", count: 75 }
    ]
  });

// Alertes
collection('production_alerts')
  .add({
    id: "alert_1711145400000_xyz789",
    type: "HIGH_ERROR_RATE",
    severity: "critical",
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    details: {
      currentRate: 7.5,
      threshold: 5.0,
      functionName: "addXp",
      window: "5 minutes"
    },
    environment: "production",
    resolved: false,
    acknowledged: false
  });
```

## 📊 Métriques Collectées

### **⏱️ Temps d'exécution**
```javascript
// Métriques en temps réel
const metrics = productionMonitoringManager.getCurrentMetrics();
console.log('Execution Metrics:', {
  averageExecutionTime: 245.5,  // ms
  totalRequests: 1500,
  totalErrors: 15,
  errorRate: 1.0,           // %
  uptime: 86400,              // secondes
  activeUsers: 45,
  functionCalls: {
    addXp: 450,
    completeMission: 300,
    checkBadges: 750
  }
});
```

### **📈 Taux d'erreur**
```javascript
// Calcul du taux d'erreur sur différentes fenêtres
const errorRates = {
  lastMinute: productionMonitoringManager.calculateErrorRate(60 * 1000),      // 1 minute
  last5Minutes: productionMonitoringManager.calculateErrorRate(5 * 60 * 1000), // 5 minutes
  lastHour: productionMonitoringManager.calculateErrorRate(60 * 60 * 1000), // 1 heure
  lastDay: productionMonitoringManager.calculateErrorRate(24 * 60 * 60 * 1000) // 24 heures
};

console.log('Error Rates:', errorRates);
// { lastMinute: 2.5, last5Minutes: 3.2, lastHour: 2.8, lastDay: 1.9 }
```

### **🚨 Alertes automatiques**
```javascript
// Alerte taux d'erreur > 5%
if (errorRate > PRODUCTION_MONITORING_CONFIG.thresholds.errorRate) {
  await productionMonitoringManager.createAlert('HIGH_ERROR_RATE', {
    currentRate: errorRate,
    threshold: PRODUCTION_MONITORING_CONFIG.thresholds.errorRate,
    functionName: 'addXp',
    window: '5 minutes'
  });
}

// Alerte latence > seuil
if (duration > PRODUCTION_MONITORING_CONFIG.thresholds.latency.critical) {
  await productionMonitoringManager.createAlert('HIGH_LATENCY', {
    currentLatency: duration,
    threshold: PRODUCTION_MONITORING_CONFIG.thresholds.latency.critical,
    functionName: 'addXp',
    severity: 'critical'
  });
}

// Alerte utilisation mémoire
if (memoryUsagePercent > PRODUCTION_MONITORING_CONFIG.thresholds.memory.critical) {
  await productionMonitoringManager.createAlert('HIGH_MEMORY_USAGE', {
    currentUsage: memoryUsagePercent,
    threshold: PRODUCTION_MONITORING_CONFIG.thresholds.memory.critical,
    severity: 'critical'
  });
}
```

## 🚨 Système d'Alertes

### **📧 Canaux de notification**
```javascript
// Configuration des canaux
const channels = ['slack', 'email', 'webhook'];

// Alerte Slack
await productionMonitoringManager.sendSlackAlert({
  type: 'HIGH_ERROR_RATE',
  severity: 'critical',
  details: { currentRate: 7.5, threshold: 5.0 },
  functionName: 'addXp'
});

// Alerte Email
await productionMonitoringManager.sendEmailAlert({
  type: 'HIGH_LATENCY',
  severity: 'warning',
  details: { currentLatency: 1500, threshold: 1000 },
  functionName: 'completeMission'
});

// Alerte Webhook
await productionMonitoringManager.sendWebhookAlert({
  type: 'HIGH_MEMORY_USAGE',
  severity: 'critical',
  details: { currentUsage: 85, threshold: 90 },
  functionName: 'checkBadges'
});
```

### **📊 Types d'alertes**
```javascript
// Alerte taux d'erreur élevé
{
  id: "alert_1711145400000_xyz789",
  type: "HIGH_ERROR_RATE",
  severity: "critical",
  timestamp: "2024-03-22T15:30:00.000Z",
  details: {
    currentRate: 7.5,
    threshold: 5.0,
    functionName: "addXp",
    window: "5 minutes"
  },
  environment: "production",
  resolved: false,
  acknowledged: false
}

// Alerte latence élevée
{
  id: "alert_1711145400001_abc456",
  type: "HIGH_LATENCY",
  severity: "warning",
  timestamp: "2024-03-22T15:35:00.000Z",
  details: {
    currentLatency: 1500,
    threshold: 1000,
    functionName: "completeMission",
    severity: "warning"
  },
  environment: "production",
  resolved: false,
  acknowledged: false
}

// Alerte utilisation mémoire
{
  id: "alert_1711145400002_def789",
  type: "HIGH_MEMORY_USAGE",
  severity: "critical",
  timestamp: "2024-03-22T15:40:00.000Z",
  details: {
    currentUsage: 85,
    threshold: 90,
    severity: "critical"
  },
  environment: "production",
  resolved: false,
  acknowledged: false
}
```

## 🔧 Intégration avec le Middleware Global

### **📊 Configuration dans le middleware global**
```javascript
// Dans globalMiddleware.js
const { createProductionMonitoringMiddleware } = require("./productionMonitoringMiddleware");
const { productionMonitoringManager } = require("./productionMonitoring");

functionOptions: {
  addXp: {
    requireAuth: true,
    enforceRateLimit: true,
    enableIdempotency: true,
    enableMonitoring: true,
    enableCostControl: true,
    enableProductionMonitoring: true // ✅ Monitoring production activé
  },
  completeMission: {
    requireAuth: true,
    enforceRateLimit: true,
    enableIdempotency: true,
    enableMonitoring: true,
    enableCostControl: true,
    enableProductionMonitoring: true // ✅ Monitoring production activé
  }
}
```

### **📈 Application automatique**
```javascript
// Dans le middleware principal
if (options.enableProductionMonitoring) {
  const productionMonitoringMiddleware = createProductionMonitoringMiddleware(functionName);
  
  const productionMonitoringResult = await new Promise((resolve, reject) => {
    productionMonitoringMiddleware(request, response, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });

  if (response.headersSent) {
    return; // Le monitoring production a déjà répondu
  }
}
```

## 📊 Dashboard de Monitoring

### **📈 Métriques en temps réel**
```javascript
// Obtenir les métriques actuelles
const currentMetrics = productionMonitoringManager.getCurrentMetrics();

console.log('Production Metrics:', {
  uptime: 86400,              // secondes depuis le démarrage
  totalRequests: 1500,
  totalErrors: 15,
  errorRate: 1.0,             // %
  averageExecutionTime: 245.5,  // ms
  activeUsers: 45,
  functionCalls: {
    addXp: 450,
    completeMission: 300,
    checkBadges: 750
  },
  system: {
    memory: {
      used: 15728640,
      total: 20971520,
      usage: 75.0               // %
    },
    cpu: {
      user: 1234567,
      system: 2345678,
      usage: 65.0               // %
    }
  }
});
```

### **📊 Métriques agrégées**
```javascript
// Obtenir les métriques par heure
const hourlyMetrics = await productionMonitoringManager.getAggregatedMetrics('hour', 24);

console.log('Hourly Metrics:', hourlyMetrics.map(metric => ({
  timestamp: metric.timestamp,
  requests: metric.requests,
  errors: metric.errors,
  errorRate: (metric.errors / metric.requests) * 100,
  averageDuration: metric.totalDuration / metric.requests,
  uniqueUsers: metric.uniqueUsers.length,
  topFunctions: metric.functionCalls.sort((a, b) => b.count - a.count).slice(0, 5)
})));
```

## ✅ Avantages du Monitoring Production

### **📊 Visibilité complète**
- **Logs structurés** avec tous les champs requis
- **Métriques temps réel** des performances
- **Alertes automatiques** sur seuils critiques
- **Dashboard complet** de monitoring

### **🚨 Détection proactive**
- **Taux d'erreur** surveillé en continu
- **Latence** mesurée et alertée
- **Utilisation ressources** surveillée
- **Escalade automatique** des alertes

### **📈 Performance optimisée**
- **Impact minimal** sur les performances des fonctions
- **Collecte asynchrone** des métriques
- **Agrégation automatique** des données
- **Nettoyage automatique** des anciennes données

### **🔧 Intégration Firebase**
- **Compatible Firebase Functions** v2
- **Stockage Firestore** optimisé
- **Console Firebase** intégrée
- **Configuration flexible** par environnement

## ✅ Résultats Attendus

### **📊 Monitoring complet**
- **100% des appels** tracés avec logs structurés
- **Métriques temps réel** des performances
- **Alertes immédiates** en cas d'anomalies
- **Dashboard interactif** de monitoring

### **🚨 Alertes efficaces**
- **Taux d'erreur > 5%** détecté et alerté
- **Latence > seuil** mesurée et notifiée
- **Utilisation ressources** surveillée
- **Escalade automatique** selon la sévérité

### **📈 Performance maintenue**
- **Impact < 5ms** sur le temps d'exécution
- **Collecte asynchrone** des métriques
- **Agrégation efficace** des données
- **Nettoyage automatique** des anciennes données

Le monitoring production garantit une **visibilité complète** et une **détection proactive** des problèmes en production avec des **alertes automatiques** et des **métriques détaillées** ! 📊✨
