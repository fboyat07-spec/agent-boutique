# Monitoring Avancé - Firebase Functions

## 📊 Vue d'ensemble

Système complet de monitoring avancé pour les Firebase Functions KidAI avec tracking des temps d'exécution, taux d'erreur, métriques système, alertes automatiques et rapports détaillés.

## 📁 Structure

```
/functions/middleware
  ├── advancedMonitoring.js    # Système de monitoring avancé
  ├── monitoringMiddleware.js # Middleware de monitoring léger
  └── README_ADVANCED_MONITORING.md # Documentation

/functions/src/services
  └── monitoringService.js   # Services de monitoring
```

## 📊 Configuration du Monitoring

### 🎯 Seuils de Performance
```javascript
const ADVANCED_MONITORING_CONFIG = {
  thresholds: {
    responseTime: {
      warning: 1000,    // 1 seconde
      critical: 3000     // 3 secondes
    },
    errorRate: {
      warning: 5,        // 5%
      critical: 10       // 10%
    },
    memoryUsage: {
      warning: 0.7,       // 70%
      critical: 0.9        // 90%
    },
    cpuUsage: {
      warning: 0.7,       // 70%
      critical: 0.9        // 90%
    }
  }
};
```

### 📈 Fenêtres de Temps
```javascript
timeWindows: {
  minute: 60 * 1000,      // 1 minute
  fiveMinutes: 5 * 60 * 1000, // 5 minutes
  hour: 60 * 60 * 1000,     // 1 heure
  day: 24 * 60 * 60 * 1000 // 24 heures
}
```

### 🚨 Configuration des Alertes
```javascript
alerts: {
  email: {
    enabled: true,
    recipients: ['admin@kidai.com', 'devops@kidai.com'],
    threshold: 'critical'
  },
  slack: {
    enabled: true,
    webhook: process.env.SLACK_WEBHOOK_URL,
    channel: '#alerts',
    threshold: 'warning'
  },
  webhook: {
    enabled: true,
    url: process.env.MONITORING_WEBHOOK_URL,
    threshold: 'warning'
  }
}
```

## 🚀 Implémentation du Monitoring

### 📊 Classe Principale de Monitoring
```javascript
class AdvancedMonitoringManager {
  constructor() {
    this.metrics = {
      // Métriques de performance
      responseTimes: new Map(),
      errorCounts: new Map(),
      successCounts: new Map(),
      
      // Métriques système
      memoryUsage: [],
      cpuUsage: [],
      activeConnections: 0,
      
      // Métriques par fonction
      functionMetrics: new Map(),
      
      // Timestamps
      startTime: Date.now(),
      lastReport: Date.now(),
      lastCleanup: Date.now()
    };
  }

  // Enregistrer le temps de réponse
  recordResponseTime(functionName, duration, statusCode, error = null) {
    const times = this.metrics.responseTimes.get(functionName) || [];
    times.push({
      timestamp: Date.now(),
      duration,
      statusCode,
      error: error ? error.message : null
    });

    // Vérifier les seuils
    this.checkResponseTimeThresholds(functionName, duration);
  }

  // Enregistrer une erreur
  recordError(functionName, error, context = {}) {
    const errors = this.metrics.errorCounts.get(functionName) || [];
    errors.push({
      timestamp: Date.now(),
      error: error.message,
      stack: error.stack,
      context
    });

    // Vérifier les seuils de taux d'erreur
    this.checkErrorRateThresholds(functionName);
  }

  // Enregistrer un succès
  recordSuccess(functionName, context = {}) {
    const successes = this.metrics.successCounts.get(functionName) || [];
    successes.push({
      timestamp: Date.now(),
      context
    });
  }

  // Envoyer une alerte
  async sendAlert(severity, type, details) {
    const alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      severity,
      type,
      details,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      resolved: false
    };

    // Sauvegarder l'alerte
    await db.collection('monitoring_alerts').add(alert);
    
    // Envoyer les notifications
    await this.sendNotifications(alert);
  }
}
```

### 🔧 Middleware de Monitoring Léger
```javascript
const createMonitoringMiddleware = (functionName) => {
  return async (request, response, next) => {
    const startTime = Date.now();
    
    try {
      // Intercepter la réponse pour mesurer le temps
      const originalSend = response.send;
      const originalJson = response.json;
      
      response.send = (data) => {
        const duration = Date.now() - startTime;
        const statusCode = response.statusCode || 200;
        
        // Enregistrer les métriques
        if (statusCode < 400) {
          advancedMonitoring.recordSuccess(functionName, {
            duration,
            statusCode,
            dataSize: JSON.stringify(data).length
          });
        }
        
        advancedMonitoring.recordResponseTime(functionName, duration, statusCode);
        return originalSend.call(response, data);
      };
      
      next();
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Enregistrer l'erreur
      advancedMonitoring.recordError(functionName, error, {
        duration,
        userAgent: request.headers['user-agent'],
        ip: request.rawRequest?.ip
      });
      
      next(error);
    }
  };
};
```

## 📊 Métriques Collectées

### 🎯 Métriques de Performance
```javascript
// Temps de réponse par fonction
{
  functionName: 'addXp',
  metrics: {
    requestCount: 150,
    successCount: 145,
    errorCount: 5,
    errorRate: 3.33,
    averageResponseTime: 245.5,
    p95ResponseTime: 450,
    p99ResponseTime: 780,
    minResponseTime: 120,
    maxResponseTime: 1200
  }
}

// Distribution des temps de réponse
{
  "0-100ms": 15,
  "100-500ms": 85,
  "500-1000ms": 35,
  "1000-2000ms": 12,
  "2000ms+": 3
}
```

### 📈 Métriques Système
```javascript
// Utilisation mémoire
{
  timestamp: Date.now(),
  memory: {
    rss: 50000000,      // Résident Set Size
    heapUsed: 30000000,  // Heap utilisé
    heapTotal: 40000000, // Heap total
    external: 5000000,    // Externe
    percentage: 75.0     // Pourcentage utilisé
  }
}

// Utilisation CPU
{
  timestamp: Date.now(),
  cpu: {
    user: 1500000,    // Temps utilisateur (μs)
    system: 500000,   // Temps système (μs)
    idle: 3000000,    // Temps idle (μs)
    percentage: 40.0    // Pourcentage utilisé
  }
}
```

### 🚨 Métriques d'Alertes
```javascript
// Alertes par type
{
  critical: {
    count: 2,
    lastAlert: Date.now(),
    types: ['response_time', 'error_rate']
  },
  warning: {
    count: 5,
    lastAlert: Date.now(),
    types: ['memory_usage', 'response_time']
  },
  info: {
    count: 12,
    lastAlert: Date.now(),
    types: ['system_health']
  }
}
```

## 🚨 Système d'Alertes

### 📧 Types d'Alertes
```javascript
// Alerte de temps de réponse critique
{
  id: "alert_1640995200000_abc123",
  severity: "critical",
  type: "response_time",
  details: {
    functionName: "addXp",
    duration: 3500,
    threshold: 3000,
    message: "Response time 3500ms exceeds critical threshold 3000ms"
  },
  timestamp: Timestamp("2024-03-22T10:30:00Z"),
  resolved: false
}

// Alerte de taux d'erreur critique
{
  id: "alert_1640995200000_def456",
  severity: "critical",
  type: "error_rate",
  details: {
    functionName: "completeMission",
    errorRate: 12.5,
    total: 40,
    errors: 5,
    threshold: 10,
    message: "Error rate 12.5% exceeds critical threshold 10%"
  },
  timestamp: Timestamp("2024-03-22T10:25:00Z"),
  resolved: false
}

// Alerte d'utilisation mémoire
{
  id: "alert_1640995200000_ghi789",
  severity: "warning",
  type: "memory_usage",
  details: {
    heapUsageRatio: 0.85,
    heapUsed: 34000000,
    heapTotal: 40000000,
    message: "Memory usage 85% exceeds warning threshold 70%"
  },
  timestamp: Timestamp("2024-03-22T10:20:00Z"),
  resolved: false
}
```

### 📧 Envoi des Notifications
```javascript
// Notification Slack
{
  text: "🚨 CRITICAL ALERT",
  attachments: [{
    color: "#ff0000",
    fields: [
      { title: "Type", value: "response_time", short: true },
      { title: "Severity", value: "critical", short: true },
      { title: "Function", value: "addXp", short: true },
      { title: "Details", value: "Response time 3500ms exceeds critical threshold 3000ms", short: false }
    ]
  }]
}

// Notification Email
{
  to: ["admin@kidai.com", "devops@kidai.com"],
  subject: "🚨 CRITICAL ALERT: Response Time",
  html: `
    <h2>🚨 Critical Alert</h2>
    <p><strong>Type:</strong> response_time</p>
    <p><strong>Function:</strong> addXp</p>
    <p><strong>Duration:</strong> 3500ms</p>
    <p><strong>Threshold:</strong> 3000ms</p>
    <p><strong>Message:</strong> Response time exceeds critical threshold</p>
  `
}

// Notification Webhook
{
  alertId: "alert_1640995200000_abc123",
  severity: "critical",
  type: "response_time",
  details: {
    functionName: "addXp",
    duration: 3500,
    threshold: 3000
  },
  timestamp: "2024-03-22T10:30:00.000Z"
}
```

## 📊 Rapports Automatisés

### 📈 Rapport Résumé (toutes les minutes)
```javascript
{
  type: "summary",
  timestamp: Date.now(),
  window: Math.floor(Date.now() / (60 * 1000)) * (60 * 1000),
  totalRequests: 1250,
  totalErrors: 45,
  averageResponseTime: 245.5,
  topErrors: [
    { error: "Database timeout", count: 15 },
    { error: "Invalid input", count: 8 },
    { error: "Rate limit exceeded", count: 6 }
  ],
  systemHealth: {
    status: "healthy",
    memory: { percentage: 75.0 },
    uptime: 86400000
  }
}
```

### 📊 Rapport Détaillé (toutes les 5 minutes)
```javascript
{
  type: "detailed",
  timestamp: Date.now(),
  window: Math.floor(Date.now() / (5 * 60 * 1000)) * (5 * 60 * 1000),
  functionMetrics: {
    addXp: {
      requestCount: 150,
      successCount: 145,
      errorCount: 5,
      errorRate: 3.33,
      averageResponseTime: 245.5,
      p95ResponseTime: 450,
      p99ResponseTime: 780
    },
    completeMission: {
      requestCount: 80,
      successCount: 78,
      errorCount: 2,
      errorRate: 2.5,
      averageResponseTime: 320.0,
      p95ResponseTime: 580,
      p99ResponseTime: 920
    }
  },
  systemMetrics: {
    memory: {
      average: 30000000,
      peak: 35000000,
      averageUsagePercentage: 75.0
    },
    cpu: {
      averageUser: 1500000,
      averageSystem: 500000,
      averageIdle: 3000000
    }
  },
  alerts: [
    {
      id: "alert_1640995200000_abc123",
      severity: "critical",
      type: "response_time",
      timestamp: "2024-03-22T10:30:00Z"
    }
  ]
}
```

## 🔧 Intégration avec le Middleware Global

### 📊 Configuration dans le Middleware Global
```javascript
// Dans globalMiddleware.js
const { createMonitoringMiddleware } = require("./monitoringMiddleware");
const { advancedMonitoring } = require("./advancedMonitoring");

functionOptions: {
  addXp: {
    requireAuth: true,
    enforceRateLimit: true,
    rateLimitAction: 'addXp',
    securityLevel: 'high',
    enableIdempotency: true,
    enableMonitoring: true // ✅ Monitoring activé
  },
  completeMission: {
    requireAuth: true,
    enforceRateLimit: true,
    rateLimitAction: 'completeMission',
    securityLevel: 'high',
    enableIdempotency: true,
    enableMonitoring: true // ✅ Monitoring activé
  }
}

// Application du middleware de monitoring
if (options.enableMonitoring) {
  const monitoringMiddleware = createMonitoringMiddleware(functionName);
  
  const monitoringResult = await new Promise((resolve, reject) => {
    monitoringMiddleware(request, response, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });

  if (response.headersSent) {
    return; // Le monitoring a déjà répondu
  }
}
```

## 📊 Dashboard de Monitoring

### 📈 Vue d'Ensemble
```javascript
// Health check complet
const healthCheck = advancedMonitoring.healthCheck();

console.log('Monitoring Health:', {
  status: 'healthy', // 'healthy' | 'degraded' | 'critical'
  uptime: 86400000,
  metrics: {
    totalRequests: 1250,
    averageResponseTime: 245.5,
    errorRate: 3.6
  },
  system: {
    memory: { percentage: 75.0 },
    cpu: { percentage: 40.0 }
  },
  alerts: {
    critical: 2,
    warning: 5,
    info: 12
  }
});
```

### 📊 Métriques par Fonction
```javascript
// Métriques détaillées par fonction
const functionMetrics = advancedMonitoring.getFunctionMetrics(ADVANCED_MONITORING_CONFIG.timeWindows.hour);

console.log('Function Metrics:', {
  addXp: {
    requestCount: 150,
    successCount: 145,
    errorCount: 5,
    errorRate: 3.33,
    averageResponseTime: 245.5,
    p95ResponseTime: 450,
    p99ResponseTime: 780,
    topErrors: [
      { error: "Database timeout", count: 3 },
      { error: "Invalid amount", count: 2 }
    ]
  },
  completeMission: {
    requestCount: 80,
    successCount: 78,
    errorCount: 2,
    errorRate: 2.5,
    averageResponseTime: 320.0,
    p95ResponseTime: 580,
    p99ResponseTime: 920,
    topErrors: [
      { error: "Mission not found", count: 1 },
      { error: "Requirements not met", count: 1 }
    ]
  }
});
```

### 📈 Métriques Système
```javascript
// Métriques système sur 1 heure
const systemMetrics = advancedMonitoring.getSystemMetrics(ADVANCED_MONITORING_CONFIG.timeWindows.hour);

console.log('System Metrics:', {
  memory: {
    average: 30000000,
    peak: 35000000,
    averageUsagePercentage: 75.0,
    trend: 'stable' // 'increasing' | 'decreasing' | 'stable'
  },
  cpu: {
    averageUser: 1500000,
    averageSystem: 500000,
    averageIdle: 3000000,
    averageUsagePercentage: 40.0,
    trend: 'stable'
  },
  connections: {
    active: 25,
    peak: 35,
    average: 20
  }
});
```

## ✅ Avantages du Monitoring Avancé

### 📊 Visibilité Complète
- **Temps de réponse** tracking avec percentiles (P95, P99)
- **Taux d'erreur** calculé en temps réel
- **Métriques système** (mémoire, CPU, connexions)
- **Alertes automatiques** avec seuils configurables
- **Rapports automatisés** résumés et détaillés

### 🚨 Alertes Intelligentes
- **Seuils multiples** (warning, critical) par métrique
- **Cooldown automatique** pour éviter les alertes en double
- **Notifications multi-canales** (email, Slack, webhook)
- **Contexte complet** avec détails de l'erreur
- **Escalade automatique** basée sur la sévérité

### 📈 Performance Optimisée
- **Impact minimal** sur les performances des fonctions
- **Collecte asynchrone** des métriques système
- **Nettoyage automatique** des anciennes métriques
- **Batch processing** pour les écritures Firestore
- **Cache des métriques** pour les requêtes fréquentes

### 🔧 Maintenance Facilitée
- **Configuration centralisée** des seuils et alertes
- **Health checks** automatisés
- **Rapports programmés** sans intervention manuelle
- **Dashboard temps réel** des métriques
- **Historique complet** pour l'analyse de tendances

## 🔧 Configuration de Déploiement

### Variables d'Environnement
```bash
# Configuration des alertes
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
MONITORING_WEBHOOK_URL=https://api.kidai.com/webhooks/monitoring
WEBHOOK_AUTH_TOKEN=your_auth_token

# Configuration des seuils
MONITORING_RESPONSE_TIME_WARNING=1000
MONITORING_RESPONSE_TIME_CRITICAL=3000
MONITORING_ERROR_RATE_WARNING=5
MONITORING_ERROR_RATE_CRITICAL=10

# Configuration des rapports
MONITORING_SUMMARY_INTERVAL=60000
MONITORING_DETAILED_INTERVAL=300000
```

### Configuration Firebase
```json
{
  "functions": {
    "runtime": "nodejs18",
    "region": "europe-west1",
    "env": {
      "SLACK_WEBHOOK_URL": {
        "value": "https://hooks.slack.com/services/..."
      },
      "MONITORING_WEBHOOK_URL": {
        "value": "https://api.kidai.com/webhooks/monitoring"
      },
      "WEBHOOK_AUTH_TOKEN": {
        "value": "your_auth_token"
      }
    }
  }
}
```

## ✅ Résultats Attendus

### 📊 Monitoring Complet
- **100% des fonctions** monitoringées avec métriques détaillées
- **Temps réel** des performances et erreurs
- **Alertes automatiques** pour les problèmes critiques
- **Rapports automatisés** pour l'analyse continue

### 🚨 Détection Proactive
- **Alertes immédiates** en cas de dépassement de seuils
- **Escalade automatique** basée sur la sévérité
- **Notifications multi-canales** pour une couverture maximale
- **Historique complet** pour l'analyse des tendances

### 📈 Performance Optimisée
- **Impact minimal** sur les performances des fonctions
- **Collecte efficace** des métriques système
- **Nettoyage automatique** pour éviter la saturation
- **Scalabilité** pour des milliers de requêtes par minute

Le monitoring avancé garantit une **visibilité complète** des performances avec **alertes intelligentes** et une **maintenance facilitée** pour une surveillance proactive ! 📊✨
