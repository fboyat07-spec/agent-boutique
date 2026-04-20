const { logger } = require("firebase-functions/v2");
const admin = require("firebase-admin");

const db = admin.firestore();

// Configuration du monitoring avancé
const ADVANCED_MONITORING_CONFIG = {
  // Seuils de performance
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
  },
  
  // Fenêtres de temps pour les métriques
  timeWindows: {
    minute: 60 * 1000,      // 1 minute
    fiveMinutes: 5 * 60 * 1000, // 5 minutes
    hour: 60 * 60 * 1000,     // 1 heure
    day: 24 * 60 * 60 * 1000 // 24 heures
  },
  
  // Configuration des alertes
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
  },
  
  // Fréquence des rapports
  reporting: {
    summaryInterval: 60 * 1000,      // Toutes les minutes
    detailedInterval: 5 * 60 * 1000, // Toutes les 5 minutes
    dailyReport: true,               // Rapport quotidien
    weeklyReport: true               // Rapport hebdomadaire
  }
};

// Classe pour le monitoring avancé
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
    
    this.alerts = {
      lastAlerts: new Map(),
      alertCooldowns: new Map(),
      sentAlerts: []
    };
  }

  // Démarrer le monitoring
  start() {
    logger.info("🚀 Advanced monitoring started", {
      startTime: new Date(this.metrics.startTime),
      thresholds: ADVANCED_MONITORING_CONFIG.thresholds
    });

    // Démarrer la collecte de métriques
    this.startMetricsCollection();
    this.startSystemMonitoring();
    this.startScheduledReports();
  }

  // Collecter les métriques de performance
  startMetricsCollection() {
    setInterval(() => {
      this.collectSystemMetrics();
    }, 30000); // Toutes les 30 secondes
  }

  // Monitoring du système
  startSystemMonitoring() {
    setInterval(() => {
      this.checkSystemHealth();
    }, 60000); // Toutes les minutes
  }

  // Rapports programmés
  startScheduledReports() {
    // Rapport résumé toutes les minutes
    setInterval(() => {
      this.generateSummaryReport();
    }, ADVANCED_MONITORING_CONFIG.reporting.summaryInterval);

    // Rapport détaillé toutes les 5 minutes
    setInterval(() => {
      this.generateDetailedReport();
    }, ADVANCED_MONITORING_CONFIG.reporting.detailedInterval);
  }

  // Enregistrer le temps de réponse
  recordResponseTime(functionName, duration, statusCode, error = null) {
    const now = Date.now();
    const window = ADVANCED_MONITORING_CONFIG.timeWindows.minute;
    
    if (!this.metrics.responseTimes.has(functionName)) {
      this.metrics.responseTimes.set(functionName, []);
    }
    
    const times = this.metrics.responseTimes.get(functionName);
    times.push({
      timestamp: now,
      duration,
      statusCode,
      error: error ? error.message : null,
      window: Math.floor(now / window) * window
    });
    
    // Garder seulement les 1000 dernières entrées
    if (times.length > 1000) {
      this.metrics.responseTimes.set(functionName, times.slice(-1000));
    }

    // Vérifier les seuils
    this.checkResponseTimeThresholds(functionName, duration);
  }

  // Vérifier les seuils de temps de réponse
  checkResponseTimeThresholds(functionName, duration) {
    const thresholds = ADVANCED_MONITORING_CONFIG.thresholds.responseTime;
    
    if (duration > thresholds.critical) {
      this.sendAlert('critical', 'response_time', {
        functionName,
        duration,
        threshold: thresholds.critical,
        message: `Response time ${duration}ms exceeds critical threshold ${thresholds.critical}ms`
      });
    } else if (duration > thresholds.warning) {
      this.sendAlert('warning', 'response_time', {
        functionName,
        duration,
        threshold: thresholds.warning,
        message: `Response time ${duration}ms exceeds warning threshold ${thresholds.warning}ms`
      });
    }
  }

  // Enregistrer une erreur
  recordError(functionName, error, context = {}) {
    const now = Date.now();
    const window = ADVANCED_MONITORING_CONFIG.timeWindows.minute;
    
    if (!this.metrics.errorCounts.has(functionName)) {
      this.metrics.errorCounts.set(functionName, []);
    }
    
    const errors = this.metrics.errorCounts.get(functionName);
    errors.push({
      timestamp: now,
      error: error.message,
      stack: error.stack,
      context,
      window: Math.floor(now / window) * window
    });
    
    // Garder seulement les 1000 dernières erreurs
    if (errors.length > 1000) {
      this.metrics.errorCounts.set(functionName, errors.slice(-1000));
    }

    // Vérifier les seuils de taux d'erreur
    this.checkErrorRateThresholds(functionName);
  }

  // Vérifier les seuils de taux d'erreur
  checkErrorRateThresholds(functionName) {
    const errors = this.metrics.errorCounts.get(functionName) || [];
    const successes = this.metrics.successCounts.get(functionName) || [];
    const total = errors.length + successes.length;
    
    if (total < 10) return; // Pas assez de données
    
    const errorRate = (errors.length / total) * 100;
    const thresholds = ADVANCED_MONITORING_CONFIG.thresholds.errorRate;
    
    if (errorRate > thresholds.critical) {
      this.sendAlert('critical', 'error_rate', {
        functionName,
        errorRate,
        total,
        threshold: thresholds.critical,
        message: `Error rate ${errorRate}% exceeds critical threshold ${thresholds.critical}%`
      });
    } else if (errorRate > thresholds.warning) {
      this.sendAlert('warning', 'error_rate', {
        functionName,
        errorRate,
        total,
        threshold: thresholds.warning,
        message: `Error rate ${errorRate}% exceeds warning threshold ${thresholds.warning}%`
      });
    }
  }

  // Enregistrer un succès
  recordSuccess(functionName, context = {}) {
    const now = Date.now();
    const window = ADVANCED_MONITORING_CONFIG.timeWindows.minute;
    
    if (!this.metrics.successCounts.has(functionName)) {
      this.metrics.successCounts.set(functionName, []);
    }
    
    const successes = this.metrics.successCounts.get(functionName);
    successes.push({
      timestamp: now,
      context,
      window: Math.floor(now / window) * window
    });
    
    // Garder seulement les 1000 derniers succès
    if (successes.length > 1000) {
      this.metrics.successCounts.set(functionName, successes.slice(-1000));
    }
  }

  // Collecter les métriques système
  collectSystemMetrics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    this.metrics.memoryUsage.push({
      timestamp: Date.now(),
      rss: memUsage.rss,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external
    });
    
    this.metrics.cpuUsage.push({
      timestamp: Date.now(),
      user: cpuUsage.user,
      system: cpuUsage.system,
      idle: cpuUsage.idle
    });
    
    // Garder seulement les 1000 dernières entrées
    if (this.metrics.memoryUsage.length > 1000) {
      this.metrics.memoryUsage = this.metrics.memoryUsage.slice(-1000);
    }
    if (this.metrics.cpuUsage.length > 1000) {
      this.metrics.cpuUsage = this.metrics.cpuUsage.slice(-1000);
    }

    // Vérifier les seuils système
    this.checkSystemThresholds(memUsage, cpuUsage);
  }

  // Vérifier les seuils système
  checkSystemThresholds(memUsage, cpuUsage) {
    const thresholds = ADVANCED_MONITORING_CONFIG.thresholds;
    
    const heapUsageRatio = memUsage.heapUsed / memUsage.heapTotal;
    
    if (heapUsageRatio > thresholds.memoryUsage.critical) {
      this.sendAlert('critical', 'memory_usage', {
        heapUsageRatio,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        message: `Memory usage ${(heapUsageRatio * 100).toFixed(1)}% exceeds critical threshold ${(thresholds.memoryUsage.critical * 100).toFixed(1)}%`
      });
    } else if (heapUsageRatio > thresholds.memoryUsage.warning) {
      this.sendAlert('warning', 'memory_usage', {
        heapUsageRatio,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        message: `Memory usage ${(heapUsageRatio * 100).toFixed(1)}% exceeds warning threshold ${(thresholds.memoryUsage.warning * 100).toFixed(1)}%`
      });
    }
  }

  // Envoyer une alerte
  async sendAlert(severity, type, details) {
    const alertKey = `${type}_${severity}`;
    const now = Date.now();
    
    // Vérifier le cooldown
    const lastAlert = this.alerts.lastAlerts.get(alertKey);
    if (lastAlert && (now - lastAlert) < 60000) { // 1 minute cooldown
      return;
    }
    
    this.alerts.lastAlerts.set(alertKey, now);
    
    const alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      severity,
      type,
      details,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      resolved: false,
      resolvedAt: null,
      resolvedBy: null
    };

    try {
      // Sauvegarder l'alerte
      await db.collection('monitoring_alerts').add(alert);
      
      // Envoyer les notifications
      await this.sendNotifications(alert);
      
      // Logger l'alerte
      logger.error(`🚨 ${severity.toUpperCase()} ALERT: ${type}`, details);
      
    } catch (error) {
      logger.error('❌ Error sending alert:', error);
    }
  }

  // Envoyer les notifications
  async sendNotifications(alert) {
    const config = ADVANCED_MONITORING_CONFIG.alerts;
    
    // Notification email
    if (config.email.enabled && 
        (alert.severity === 'critical' || 
         config.email.threshold === alert.severity)) {
      await this.sendEmailAlert(alert);
    }
    
    // Notification Slack
    if (config.slack.enabled && 
        (alert.severity === 'critical' || 
         config.slack.threshold === alert.severity)) {
      await this.sendSlackAlert(alert);
    }
    
    // Notification webhook
    if (config.webhook.enabled && 
        (alert.severity === 'critical' || 
         config.webhook.threshold === alert.severity)) {
      await this.sendWebhookAlert(alert);
    }
  }

  // Envoyer une alerte email
  async sendEmailAlert(alert) {
    try {
      // TODO: Implémenter l'envoi d'email
      logger.info('📧 Email alert sent:', alert);
    } catch (error) {
      logger.error('❌ Error sending email alert:', error);
    }
  }

  // Envoyer une alerte Slack
  async sendSlackAlert(alert) {
    try {
      const payload = {
        text: `🚨 ${alert.severity.toUpperCase()} ALERT`,
        attachments: [{
          color: this.getSlackColor(alert.severity),
          fields: [
            { title: 'Type', value: alert.type, short: true },
            { title: 'Severity', value: alert.severity, short: true },
            { title: 'Details', value: JSON.stringify(alert.details, null, 2), short: false },
            { title: 'Timestamp', value: alert.timestamp, short: true }
          ]
        }]
      };

      // TODO: Implémenter l'envoi Slack
      logger.info('💬 Slack alert sent:', payload);
    } catch (error) {
      logger.error('❌ Error sending Slack alert:', error);
    }
  }

  // Envoyer une alerte webhook
  async sendWebhookAlert(alert) {
    try {
      const response = await fetch(ADVANCED_MONITORING_CONFIG.alerts.webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.WEBHOOK_AUTH_TOKEN}`
        },
        body: JSON.stringify(alert)
      });

      if (!response.ok) {
        throw new Error(`Webhook request failed: ${response.status}`);
      }

      logger.info('🔗 Webhook alert sent:', alert);
    } catch (error) {
      logger.error('❌ Error sending webhook alert:', error);
    }
  }

  // Obtenir la couleur Slack selon la sévérité
  getSlackColor(severity) {
    const colors = {
      critical: '#ff0000', // rouge
      warning: '#ff9500',  // orange
      info: '#36a64f'    // vert
    };
    return colors[severity] || '#808080'; // gris par défaut
  }

  // Vérifier la santé du système
  checkSystemHealth() {
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();
    
    const health = {
      status: 'healthy',
      uptime: uptime,
      memory: {
        used: memUsage.heapUsed,
        total: memUsage.heapTotal,
        percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100
      },
      timestamp: new Date()
    };

    if (health.memory.percentage > 90) {
      health.status = 'degraded';
    }

    return health;
  }

  // Générer un rapport résumé
  generateSummaryReport() {
    const now = Date.now();
    const window = ADVANCED_MONITORING_CONFIG.timeWindows.minute;
    
    const summary = {
      timestamp: now,
      window: Math.floor(now / window) * window,
      totalRequests: this.getTotalRequests(window),
      totalErrors: this.getTotalErrors(window),
      averageResponseTime: this.getAverageResponseTime(window),
      topErrors: this.getTopErrors(window),
      systemHealth: this.checkSystemHealth()
    };

    // Sauvegarder le rapport
    db.collection('monitoring_reports').add({
      type: 'summary',
      ...summary
    });

    logger.info('📊 Summary report generated:', summary);
    this.metrics.lastReport = now;
  }

  // Générer un rapport détaillé
  generateDetailedReport() {
    const now = Date.now();
    const window = ADVANCED_MONITORING_CONFIG.timeWindows.fiveMinutes;
    
    const report = {
      timestamp: now,
      window: Math.floor(now / window) * window,
      functionMetrics: this.getFunctionMetrics(window),
      systemMetrics: this.getSystemMetrics(window),
      alerts: this.getRecentAlerts()
    };

    // Sauvegarder le rapport
    db.collection('monitoring_reports').add({
      type: 'detailed',
      ...report
    });

    logger.info('📈 Detailed report generated:', report);
  }

  // Obtenir le nombre total de requêtes
  getTotalRequests(timeWindow) {
    let total = 0;
    
    for (const [functionName, times] of this.metrics.responseTimes.entries()) {
      const recentTimes = times.filter(t => 
        Date.now() - t.timestamp < timeWindow
      );
      total += recentTimes.length;
    }
    
    return total;
  }

  // Obtenir le nombre total d'erreurs
  getTotalErrors(timeWindow) {
    let total = 0;
    
    for (const [functionName, errors] of this.metrics.errorCounts.entries()) {
      const recentErrors = errors.filter(e => 
        Date.now() - e.timestamp < timeWindow
      );
      total += recentErrors.length;
    }
    
    return total;
  }

  // Obtenir le temps de réponse moyen
  getAverageResponseTime(timeWindow) {
    let totalDuration = 0;
    let totalCount = 0;
    
    for (const [functionName, times] of this.metrics.responseTimes.entries()) {
      const recentTimes = times.filter(t => 
        Date.now() - t.timestamp < timeWindow
      );
      
      recentTimes.forEach(t => {
        totalDuration += t.duration;
        totalCount++;
      });
    }
    
    return totalCount > 0 ? totalDuration / totalCount : 0;
  }

  // Obtenir les erreurs principales
  getTopErrors(timeWindow) {
    const errorCounts = {};
    
    for (const [functionName, errors] of this.metrics.errorCounts.entries()) {
      const recentErrors = errors.filter(e => 
        Date.now() - e.timestamp < timeWindow
      );
      
      recentErrors.forEach(e => {
        errorCounts[e.error] = (errorCounts[e.error] || 0) + 1;
      });
    }
    
    return Object.entries(errorCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([error, count]) => ({ error, count }));
  }

  // Obtenir les métriques par fonction
  getFunctionMetrics(timeWindow) {
    const functionMetrics = {};
    
    for (const functionName of this.metrics.responseTimes.keys()) {
      const times = this.metrics.responseTimes.get(functionName) || [];
      const errors = this.metrics.errorCounts.get(functionName) || [];
      const successes = this.metrics.successCounts.get(functionName) || [];
      
      const recentTimes = times.filter(t => 
        Date.now() - t.timestamp < timeWindow
      );
      const recentErrors = errors.filter(e => 
        Date.now() - e.timestamp < timeWindow
      );
      const recentSuccesses = successes.filter(s => 
        Date.now() - s.timestamp < timeWindow
      );
      
      const durations = recentTimes.map(t => t.duration);
      const averageDuration = durations.length > 0 
        ? durations.reduce((a, b) => a + b, 0) / durations.length 
        : 0;
      
      const totalRequests = recentTimes.length + recentErrors.length + recentSuccesses.length;
      const errorRate = totalRequests > 0 
        ? (recentErrors.length / totalRequests) * 100 
        : 0;
      
      functionMetrics[functionName] = {
        requestCount: totalRequests,
        successCount: recentSuccesses.length,
        errorCount: recentErrors.length,
        errorRate,
        averageResponseTime: averageDuration,
        p95ResponseTime: this.calculatePercentile(durations, 95),
        p99ResponseTime: this.calculatePercentile(durations, 99)
      };
    }
    
    return functionMetrics;
  }

  // Obtenir les métriques système
  getSystemMetrics(timeWindow) {
    const recentMemory = this.metrics.memoryUsage.filter(m => 
      Date.now() - m.timestamp < timeWindow
    );
    const recentCpu = this.metrics.cpuUsage.filter(c => 
      Date.now() - c.timestamp < timeWindow
    );
    
    return {
      memory: {
        average: recentMemory.length > 0 
          ? recentMemory.reduce((sum, m) => sum + m.heapUsed, 0) / recentMemory.length 
          : 0,
        peak: recentMemory.length > 0 
          ? Math.max(...recentMemory.map(m => m.heapUsed)) 
          : 0,
        averageUsagePercentage: recentMemory.length > 0 
          ? recentMemory.reduce((sum, m) => sum + (m.heapUsed / m.heapTotal), 0) / recentMemory.length * 100 
          : 0
      },
      cpu: {
        averageUser: recentCpu.length > 0 
          ? recentCpu.reduce((sum, c) => sum + c.user, 0) / recentCpu.length 
          : 0,
        averageSystem: recentCpu.length > 0 
          ? recentCpu.reduce((sum, c) => sum + c.system, 0) / recentCpu.length 
          : 0,
        averageIdle: recentCpu.length > 0 
          ? recentCpu.reduce((sum, c) => sum + c.idle, 0) / recentCpu.length 
          : 0
      }
    };
  }

  // Calculer un percentile
  calculatePercentile(values, percentile) {
    if (values.length === 0) return 0;
    
    const sorted = values.sort((a, b) => a - b);
    const index = Math.floor(sorted.length * percentile / 100);
    return sorted[index] || 0;
  }

  // Obtenir les alertes récentes
  getRecentAlerts() {
    const now = Date.now();
    const recentAlerts = [];
    
    for (const [key, alert] of this.alerts.lastAlerts.entries()) {
      if (now - alert < 24 * 60 * 60 * 1000) { // 24 heures
        recentAlerts.push({ key, ...alert });
      }
    }
    
    return recentAlerts.slice(-50); // 50 dernières alertes
  }

  // Obtenir toutes les métriques
  getMetrics() {
    return {
      ...this.metrics,
      uptime: Date.now() - this.metrics.startTime,
      lastReport: this.metrics.lastReport,
      lastCleanup: this.metrics.lastCleanup
    };
  }

  // Nettoyer les anciennes métriques
  cleanup() {
    const cutoffTime = Date.now() - 24 * 60 * 60 * 1000; // 24 heures
    
    // Nettoyer les métriques anciennes
    for (const [key, value] of this.metrics.responseTimes.entries()) {
      const filtered = value.filter(t => t.timestamp > cutoffTime);
      this.metrics.responseTimes.set(key, filtered);
    }
    
    for (const [key, value] of this.metrics.errorCounts.entries()) {
      const filtered = value.filter(e => e.timestamp > cutoffTime);
      this.metrics.errorCounts.set(key, filtered);
    }
    
    this.metrics.memoryUsage = this.metrics.memoryUsage.filter(m => m.timestamp > cutoffTime);
    this.metrics.cpuUsage = this.metrics.cpuUsage.filter(c => c.timestamp > cutoffTime);
    
    this.metrics.lastCleanup = Date.now();
    
    logger.info('🧹 Metrics cleanup completed');
  }
}

// Instance globale du monitoring avancé
const advancedMonitoring = new AdvancedMonitoringManager();

// Exporter les utilitaires
module.exports = {
  AdvancedMonitoringManager,
  advancedMonitoring,
  ADVANCED_MONITORING_CONFIG
};
