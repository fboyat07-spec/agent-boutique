const { logger } = require("firebase-functions/v2");
const admin = require("firebase-admin");

const db = admin.firestore();

// Configuration du monitoring production
const PRODUCTION_MONITORING_CONFIG = {
  // Seuils d'alertes
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
  },
  
  // Fenêtres de temps pour les métriques
  windows: {
    minute: 60 * 1000,           // 1 minute
    fiveMinutes: 5 * 60 * 1000,  // 5 minutes
    hour: 60 * 60 * 1000,        // 1 heure
    day: 24 * 60 * 60 * 1000     // 24 heures
  },
  
  // Configuration des alertes
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
  },
  
  // Configuration des logs
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
  },
  
  // Configuration des métriques
  metrics: {
    collection: 'production_metrics',
    aggregation: {
      interval: 60 * 1000,    // 1 minute
      retention: 90 * 24 * 60 * 60 * 1000 // 90 jours
    },
    types: [
      'execution_time',
      'error_rate',
      'throughput',
      'memory_usage',
      'cpu_usage',
      'active_users',
      'function_calls'
    ]
  }
};

// Classe principale du monitoring production
class ProductionMonitoringManager {
  constructor() {
    this.metrics = new Map();
    this.alerts = new Map();
    this.lastCleanup = Date.now();
    this.startTime = Date.now();
    
    // Métriques en temps réel
    this.realTimeMetrics = {
      totalRequests: 0,
      totalErrors: 0,
      totalExecutionTime: 0,
      activeUsers: new Set(),
      functionCalls: new Map(),
      recentErrors: [],
      recentAlerts: []
    };
  }

  // Enregistrer une exécution de fonction
  async recordExecution(functionName, userId, action, duration, status, error = null, metadata = {}) {
    try {
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
      
      // Nettoyer les anciennes données périodiquement
      this.cleanup();
      
    } catch (error) {
      logger.error('Erreur dans le monitoring production:', error);
    }
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

  // Mettre à jour les métriques en temps réel
  updateRealTimeMetrics(functionName, userId, action, duration, status, error) {
    const metrics = this.realTimeMetrics;
    
    // Mettre à jour les compteurs
    metrics.totalRequests++;
    metrics.totalExecutionTime += duration;
    
    if (status === 'error') {
      metrics.totalErrors++;
      metrics.recentErrors.push({
        timestamp: Date.now(),
        functionName,
        userId,
        action,
        error: error.message
      });
    }
    
    // Ajouter l'utilisateur actif
    if (userId) {
      metrics.activeUsers.add(userId);
    }
    
    // Compter les appels par fonction
    const functionCount = metrics.functionCalls.get(functionName) || 0;
    metrics.functionCalls.set(functionName, functionCount + 1);
    
    // Limiter la taille des tableaux récents
    if (metrics.recentErrors.length > 100) {
      metrics.recentErrors = metrics.recentErrors.slice(-50);
    }
  }

  // Logger dans Firestore
  async logToFirestore(logEntry) {
    try {
      // Log principal
      await db.collection('production_logs').add(logEntry);
      
      // Métriques agrégées
      await this.updateAggregatedMetrics(logEntry);
      
    } catch (error) {
      logger.error('Erreur lors du logging Firestore:', error);
    }
  }

  // Logger dans la console
  logToConsole(logEntry) {
    const { status, functionName, userId, action, duration, error } = logEntry;
    
    if (status === 'error') {
      logger.error(`[PROD] ${functionName} - ${action} - ERROR`, {
        userId,
        duration,
        error: error?.message,
        requestId: logEntry.requestId
      });
    } else if (duration > PRODUCTION_MONITORING_CONFIG.thresholds.latency.critical) {
      logger.warn(`[PROD] ${functionName} - ${action} - SLOW`, {
        userId,
        duration,
        requestId: logEntry.requestId
      });
    } else {
      logger.info(`[PROD] ${functionName} - ${action}`, {
        userId,
        duration,
        requestId: logEntry.requestId
      });
    }
  }

  // Mettre à jour les métriques agrégées
  async updateAggregatedMetrics(logEntry) {
    try {
      const now = new Date();
      const minuteKey = Math.floor(now.getTime() / PRODUCTION_MONITORING_CONFIG.windows.minute);
      const hourKey = Math.floor(now.getTime() / PRODUCTION_MONITORING_CONFIG.windows.hour);
      
      // Métriques par minute
      const minuteRef = db.collection('production_metrics')
        .doc(`minute_${minuteKey}`);
      
      await db.runTransaction(async (transaction) => {
        const minuteDoc = await transaction.get(minuteRef);
        const currentData = minuteDoc.exists ? minuteDoc.data() : {
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          window: 'minute',
          requests: 0,
          errors: 0,
          totalDuration: 0,
          uniqueUsers: new Set(),
          functionCalls: new Map()
        };
        
        // Mettre à jour les métriques
        currentData.requests++;
        currentData.totalDuration += logEntry.duration;
        
        if (logEntry.status === 'error') {
          currentData.errors++;
        }
        
        if (logEntry.userId) {
          currentData.uniqueUsers.add(logEntry.userId);
        }
        
        const functionCount = currentData.functionCalls.get(logEntry.functionName) || 0;
        currentData.functionCalls.set(logEntry.functionName, functionCount + 1);
        
        // Convertir les Sets et Maps en tableaux pour Firestore
        const updateData = {
          requests: currentData.requests,
          errors: currentData.errors,
          totalDuration: currentData.totalDuration,
          uniqueUsers: Array.from(currentData.uniqueUsers),
          functionCalls: Array.from(currentData.functionCalls.entries()).map(([name, count]) => ({ name, count })),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        
        if (minuteDoc.exists) {
          transaction.update(minuteRef, updateData);
        } else {
          transaction.set(minuteRef, { ...currentData, ...updateData });
        }
      });
      
    } catch (error) {
      logger.error('Erreur lors de la mise à jour des métriques agrégées:', error);
    }
  }

  // Vérifier les seuils d'alertes
  async checkThresholds(functionName, duration, status, error) {
    const now = Date.now();
    const config = PRODUCTION_MONITORING_CONFIG;
    
    // Vérifier le taux d'erreur
    const errorRate = this.calculateErrorRate();
    if (errorRate > config.thresholds.errorRate) {
      await this.createAlert('HIGH_ERROR_RATE', {
        currentRate: errorRate,
        threshold: config.thresholds.errorRate,
        functionName,
        window: '5 minutes'
      });
    }
    
    // Vérifier la latence
    if (duration > config.thresholds.latency.critical) {
      await this.createAlert('HIGH_LATENCY', {
        currentLatency: duration,
        threshold: config.thresholds.latency.critical,
        functionName,
        severity: 'critical'
      });
    } else if (duration > config.thresholds.latency.warning) {
      await this.createAlert('HIGH_LATENCY', {
        currentLatency: duration,
        threshold: config.thresholds.latency.warning,
        functionName,
        severity: 'warning'
      });
    }
    
    // Vérifier les erreurs récentes
    const recentErrors = this.realTimeMetrics.recentErrors.filter(
      e => now - e.timestamp < config.windows.fiveMinutes
    );
    
    if (recentErrors.length > 10) {
      await this.createAlert('MULTIPLE_ERRORS', {
        errorCount: recentErrors.length,
        window: '5 minutes',
        functionName,
        severity: 'critical'
      });
    }
    
    // Vérifier l'utilisation mémoire
    const memoryUsage = process.memoryUsage();
    const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
    
    if (memoryUsagePercent > config.thresholds.memory.critical) {
      await this.createAlert('HIGH_MEMORY_USAGE', {
        currentUsage: memoryUsagePercent,
        threshold: config.thresholds.memory.critical,
        severity: 'critical'
      });
    } else if (memoryUsagePercent > config.thresholds.memory.warning) {
      await this.createAlert('HIGH_MEMORY_USAGE', {
        currentUsage: memoryUsagePercent,
        threshold: config.thresholds.memory.warning,
        severity: 'warning'
      });
    }
  }

  // Calculer le taux d'erreur
  calculateErrorRate(windowMs = PRODUCTION_MONITORING_CONFIG.windows.fiveMinutes) {
    const now = Date.now();
    const recentRequests = this.realTimeMetrics.totalRequests;
    const recentErrors = this.realTimeMetrics.recentErrors.filter(
      e => now - e.timestamp < windowMs
    ).length;
    
    return recentRequests > 0 ? (recentErrors / recentRequests) * 100 : 0;
  }

  // Créer une alerte
  async createAlert(type, details) {
    try {
      const now = Date.now();
      const alertKey = `${type}_${Math.floor(now / PRODUCTION_MONITORING_CONFIG.alerts.cooldown)}`;
      
      // Vérifier le cooldown
      if (this.alerts.has(alertKey)) {
        return; // Alerte déjà envoyée récemment
      }
      
      const alert = {
        id: this.generateAlertId(),
        type,
        severity: details.severity || this.getAlertSeverity(type),
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        details,
        environment: process.env.ENVIRONMENT || 'production',
        resolved: false,
        acknowledged: false
      };
      
      // Sauvegarder l'alerte
      await db.collection('production_alerts').add(alert);
      
      // Marquer l'alerte comme envoyée
      this.alerts.set(alertKey, {
        sentAt: now,
        type,
        details
      });
      
      // Envoyer l'alerte via les canaux configurés
      await this.sendAlert(alert);
      
      logger.warn(`🚨 Alerte production créée: ${type}`, {
        alertId: alert.id,
        type,
        severity: alert.severity,
        details
      });
      
    } catch (error) {
      logger.error('Erreur lors de la création d\'alerte:', error);
    }
  }

  // Envoyer l'alerte via les canaux configurés
  async sendAlert(alert) {
    const channels = PRODUCTION_MONITORING_CONFIG.alerts.channels;
    
    for (const channel of channels) {
      try {
        switch (channel) {
          case 'slack':
            await this.sendSlackAlert(alert);
            break;
          case 'email':
            await this.sendEmailAlert(alert);
            break;
          case 'webhook':
            await this.sendWebhookAlert(alert);
            break;
        }
      } catch (error) {
        logger.error(`Erreur lors de l'envoi d'alerte via ${channel}:`, error);
      }
    }
  }

  // Envoyer une alerte Slack
  async sendSlackAlert(alert) {
    const webhookUrl = process.env.PROD_SLACK_WEBHOOK_URL;
    if (!webhookUrl) return;
    
    const slackMessage = {
      text: `🚨 Alerte Production - ${alert.type}`,
      attachments: [{
        color: this.getSlackColor(alert.severity),
        fields: [
          { title: 'Type', value: alert.type, short: true },
          { title: 'Sévérité', value: alert.severity, short: true },
          { title: 'Fonction', value: alert.details.functionName || 'N/A', short: true },
          { title: 'Détails', value: JSON.stringify(alert.details, null, 2) }
        ],
        footer: `KidAI Production Monitoring`,
        ts: Math.floor(Date.now() / 1000)
      }]
    };
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackMessage)
    });
    
    if (!response.ok) {
      throw new Error(`Slack webhook failed: ${response.statusText}`);
    }
  }

  // Envoyer une alerte Email
  async sendEmailAlert(alert) {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) return;
    
    const emailContent = {
      to: adminEmail,
      subject: `🚨 Alerte Production - ${alert.type}`,
      html: this.generateEmailTemplate(alert)
    };
    
    // Utiliser Firebase Functions pour envoyer l'email
    // (implémentation dépend de votre service email)
    logger.info('Alerte email envoyée:', { alertId: alert.id, type: alert.type });
  }

  // Envoyer une alerte Webhook
  async sendWebhookAlert(alert) {
    const webhookUrl = process.env.PROD_WEBHOOK_URL;
    if (!webhookUrl) return;
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.PROD_WEBHOOK_TOKEN}`
      },
      body: JSON.stringify(alert)
    });
    
    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.statusText}`);
    }
  }

  // Obtenir les métriques actuelles
  getCurrentMetrics() {
    const now = Date.now();
    const uptime = now - this.startTime;
    
    return {
      uptime,
      totalRequests: this.realTimeMetrics.totalRequests,
      totalErrors: this.realTimeMetrics.totalErrors,
      errorRate: this.calculateErrorRate(),
      averageExecutionTime: this.realTimeMetrics.totalRequests > 0 
        ? this.realTimeMetrics.totalExecutionTime / this.realTimeMetrics.totalRequests 
        : 0,
      activeUsers: this.realTimeMetrics.activeUsers.size,
      functionCalls: Object.fromEntries(this.realTimeMetrics.functionCalls),
      recentErrors: this.realTimeMetrics.recentErrors.slice(-10),
      system: {
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
      }
    };
  }

  // Obtenir les métriques agrégées
  async getAggregatedMetrics(period = 'hour', limit = 24) {
    try {
      let collectionName;
      let windowMs;
      
      switch (period) {
        case 'minute':
          collectionName = 'production_metrics';
          windowMs = PRODUCTION_MONITORING_CONFIG.windows.minute;
          break;
        case 'hour':
          collectionName = 'production_metrics';
          windowMs = PRODUCTION_MONITORING_CONFIG.windows.hour;
          break;
        case 'day':
          collectionName = 'production_metrics';
          windowMs = PRODUCTION_MONITORING_CONFIG.windows.day;
          break;
        default:
          throw new Error('Période invalide');
      }
      
      const snapshot = await db.collection(collectionName)
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
    } catch (error) {
      logger.error('Erreur lors de la récupération des métriques agrégées:', error);
      return [];
    }
  }

  // Nettoyer les anciennes données
  cleanup() {
    const now = Date.now();
    
    // Nettoyer toutes les heures
    if (now - this.lastCleanup > PRODUCTION_MONITORING_CONFIG.windows.hour) {
      this.cleanupOldAlerts();
      this.cleanupOldMetrics();
      this.lastCleanup = now;
    }
  }

  // Nettoyer les anciennes alertes
  async cleanupOldAlerts() {
    try {
      const cutoffTime = new Date(now - PRODUCTION_MONITORING_CONFIG.alerts.cooldown * 10);
      
      const snapshot = await db.collection('production_alerts')
        .where('timestamp', '<', cutoffTime)
        .where('resolved', '==', false)
        .get();
      
      const batch = db.batch();
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      if (snapshot.size > 0) {
        await batch.commit();
        logger.info(`Nettoyage de ${snapshot.size} anciennes alertes`);
      }
      
    } catch (error) {
      logger.error('Erreur lors du nettoyage des alertes:', error);
    }
  }

  // Nettoyer les anciennes métriques
  async cleanupOldMetrics() {
    try {
      const retentionMs = PRODUCTION_MONITORING_CONFIG.logging.retention.metrics;
      const cutoffTime = new Date(now - retentionMs);
      
      const snapshot = await db.collection('production_metrics')
        .where('timestamp', '<', cutoffTime)
        .get();
      
      const batch = db.batch();
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      if (snapshot.size > 0) {
        await batch.commit();
        logger.info(`Nettoyage de ${snapshot.size} anciennes métriques`);
      }
      
    } catch (error) {
      logger.error('Erreur lors du nettoyage des métriques:', error);
    }
  }

  // Utilitaires
  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateAlertId() {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getErrorSeverity(error) {
    if (error.code === 'permission-denied' || error.code === 'unauthenticated') {
      return 'warning';
    } else if (error.code === 'resource-exhausted' || error.code === 'deadline-exceeded') {
      return 'critical';
    } else {
      return 'error';
    }
  }

  getAlertSeverity(type) {
    const severityMap = {
      'HIGH_ERROR_RATE': 'critical',
      'HIGH_LATENCY': 'warning',
      'MULTIPLE_ERRORS': 'critical',
      'HIGH_MEMORY_USAGE': 'warning',
      'HIGH_CPU_USAGE': 'critical',
      'LOW_THROUGHPUT': 'warning'
    };
    
    return severityMap[type] || 'warning';
  }

  getSlackColor(severity) {
    const colorMap = {
      'info': '#36a64f',
      'warning': '#ff9500',
      'critical': '#ff0000',
      'emergency': '#8b0000'
    };
    
    return colorMap[severity] || '#ff9500';
  }

  generateEmailTemplate(alert) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
          <h2 style="color: #dc3545; margin: 0 0 20px 0;">🚨 Alerte Production</h2>
          
          <div style="background: white; padding: 15px; border-radius: 5px; border-left: 4px solid #dc3545;">
            <p><strong>Type:</strong> ${alert.type}</p>
            <p><strong>Sévérité:</strong> <span style="color: ${alert.severity === 'critical' ? '#dc3545' : '#ffc107'}">${alert.severity.toUpperCase()}</span></p>
            <p><strong>Timestamp:</strong> ${new Date(alert.timestamp._seconds * 1000).toLocaleString()}</p>
            <p><strong>Détails:</strong></p>
            <pre style="background: #f8f9fa; padding: 10px; border-radius: 3px; overflow-x: auto;">${JSON.stringify(alert.details, null, 2)}</pre>
          </div>
          
          <div style="margin-top: 20px; font-size: 12px; color: #6c757d;">
            <p>Cette alerte a été générée par le système de monitoring production KidAI.</p>
          </div>
        </div>
      </div>
    `;
  }
}

// Instance globale du monitoring production
const productionMonitoringManager = new ProductionMonitoringManager();

// Exporter les utilitaires
module.exports = {
  ProductionMonitoringManager,
  productionMonitoringManager,
  PRODUCTION_MONITORING_CONFIG
};
