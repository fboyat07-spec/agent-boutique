const { logger } = require("firebase-functions/v2");
const admin = require("firebase-admin");

const db = admin.firestore();

// Configuration du gestionnaire d'alertes
const ALERT_CONFIG = {
  // Niveaux d'alerte
  levels: {
    INFO: 'info',
    WARNING: 'warning',
    ERROR: 'error',
    CRITICAL: 'critical',
    EMERGENCY: 'emergency'
  },
  
  // Types d'alerte
  types: {
    SYSTEM_ERROR: 'system_error',
    SECURITY_BREACH: 'security_breach',
    PERFORMANCE_DEGRADATION: 'performance_degradation',
    BUSINESS_ANOMALY: 'business_anomaly',
    USER_IMPACT: 'user_impact',
    DATA_CORRUPTION: 'data_corruption',
    SERVICE_UNAVAILABLE: 'service_unavailable'
  },
  
  // Canaux de notification
  channels: {
    EMAIL: 'email',
    SLACK: 'slack',
    WEBHOOK: 'webhook',
    SMS: 'sms',
    PUSH_NOTIFICATION: 'push_notification'
  },
  
  // Configuration des seuils
  thresholds: {
    // Erreurs par minute
    errorsPerMinute: 10,
    // Temps de réponse (ms)
    responseTimeThreshold: 5000,
    // Taux d'erreur (%)
    errorRateThreshold: 5,
    // Utilisateurs affectés
    affectedUsersThreshold: 10
  },
  
  // Escalade automatique
  escalation: {
    level1: { delay: 5 * 60 * 1000, channels: ['email'] },      // 5 minutes
    level2: { delay: 15 * 60 * 1000, channels: ['email', 'slack'] }, // 15 minutes
    level3: { delay: 30 * 60 * 1000, channels: ['email', 'slack', 'sms'] } // 30 minutes
  }
};

// Classe pour gérer les alertes
class AlertManager {
  constructor() {
    this.activeAlerts = new Map();
    this.alertHistory = [];
    this.notificationQueue = [];
    this.escalationTimers = new Map();
  }

  // Créer une nouvelle alerte
  async createAlert(level, type, title, message, details = {}) {
    try {
      const alertId = this.generateAlertId();
      const timestamp = admin.firestore.FieldValue.serverTimestamp();
      
      const alert = {
        alertId,
        level,
        type,
        title,
        message,
        details: this.sanitizeDetails(details),
        status: 'active',
        acknowledged: false,
        acknowledgedBy: null,
        acknowledgedAt: null,
        resolved: false,
        resolvedBy: null,
        resolvedAt: null,
        escalated: false,
        escalationLevel: 0,
        notificationsSent: [],
        createdAt: timestamp,
        updatedAt: timestamp,
        affectedUsers: details.affectedUsers || [],
        impact: this.calculateImpact(details)
      };

      // Sauvegarder dans Firestore
      await db.collection('alerts').doc(alertId).set(alert);
      
      // Ajouter à la mémoire
      this.activeAlerts.set(alertId, alert);
      
      // Logger l'alerte
      logger.error(`🚨 ALERT CREATED: ${title}`, alert);
      
      // Envoyer les notifications initiales
      await this.sendInitialNotifications(alert);
      
      // Démarrer l'escalade automatique
      this.startEscalation(alert);
      
      return alert;

    } catch (error) {
      logger.error('Erreur création alerte:', error);
      throw new Error(`Erreur lors de la création de l'alerte: ${error.message}`);
    }
  }

  // Mettre à jour une alerte
  async updateAlert(alertId, updates = {}) {
    try {
      const alertRef = db.collection('alerts').doc(alertId);
      const alertDoc = await alertRef.get();
      
      if (!alertDoc.exists) {
        throw new Error('Alerte non trouvée');
      }

      const alert = alertDoc.data();
      const updatedAlert = {
        ...alert,
        ...updates,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      await alertRef.update(updatedAlert);
      
      // Mettre à jour en mémoire
      if (this.activeAlerts.has(alertId)) {
        this.activeAlerts.set(alertId, updatedAlert);
      }

      logger.info(`📝 ALERT UPDATED: ${alert.title}`, { alertId, updates });
      
      return updatedAlert;

    } catch (error) {
      logger.error('Erreur mise à jour alerte:', error);
      throw new Error(`Erreur lors de la mise à jour de l'alerte: ${error.message}`);
    }
  }

  // Acknowledger une alerte
  async acknowledgeAlert(alertId, acknowledgedBy, notes = '') {
    try {
      const updateData = {
        acknowledged: true,
        acknowledgedBy,
        acknowledgedAt: admin.firestore.FieldValue.serverTimestamp(),
        acknowledgmentNotes: notes,
        status: 'acknowledged'
      };

      const alert = await this.updateAlert(alertId, updateData);
      
      // Arrêter l'escalade
      this.stopEscalation(alertId);
      
      // Envoyer la notification d'acknowledgment
      await this.sendAcknowledgmentNotification(alert, acknowledgedBy);
      
      logger.info(`✅ ALERT ACKNOWLEDGED: ${alert.title}`, { alertId, acknowledgedBy });
      
      return alert;

    } catch (error) {
      logger.error('Erreur acknowledgment alerte:', error);
      throw new Error(`Erreur lors de l'acknowledgment de l'alerte: ${error.message}`);
    }
  }

  // Résoudre une alerte
  async resolveAlert(alertId, resolvedBy, resolution = '') {
    try {
      const updateData = {
        resolved: true,
        resolvedBy,
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        resolution,
        status: 'resolved'
      };

      const alert = await this.updateAlert(alertId, updateData);
      
      // Retirer des alertes actives
      this.activeAlerts.delete(alertId);
      
      // Arrêter l'escalade
      this.stopEscalation(alertId);
      
      // Envoyer la notification de résolution
      await this.sendResolutionNotification(alert, resolvedBy, resolution);
      
      logger.info(`✅ ALERT RESOLVED: ${alert.title}`, { alertId, resolvedBy });
      
      return alert;

    } catch (error) {
      logger.error('Erreur résolution alerte:', error);
      throw new Error(`Erreur lors de la résolution de l'alerte: ${error.message}`);
    }
  }

  // Envoyer les notifications initiales
  async sendInitialNotifications(alert) {
    const channels = ALERT_CONFIG.escalation.level1.channels;
    
    for (const channel of channels) {
      try {
        await this.sendNotification(alert, channel, 'initial');
        alert.notificationsSent.push({ channel, type: 'initial', sentAt: new Date() });
      } catch (error) {
        logger.error(`Erreur notification ${channel}:`, error);
      }
    }
  }

  // Envoyer une notification
  async sendNotification(alert, channel, type = 'update') {
    try {
      const notification = {
        alertId: alert.alertId,
        channel,
        type,
        alert: {
          id: alert.alertId,
          level: alert.level,
          type: alert.type,
          title: alert.title,
          message: alert.message,
          details: alert.details,
          createdAt: alert.createdAt,
          impact: alert.impact
        },
        sentAt: new Date()
      };

      // Sauvegarder la notification
      await db.collection('notifications').add(notification);

      // Envoyer selon le canal
      switch (channel) {
        case ALERT_CONFIG.channels.EMAIL:
          await this.sendEmailNotification(notification);
          break;
        case ALERT_CONFIG.channels.SLACK:
          await this.sendSlackNotification(notification);
          break;
        case ALERT_CONFIG.channels.WEBHOOK:
          await this.sendWebhookNotification(notification);
          break;
        case ALERT_CONFIG.channels.SMS:
          await this.sendSMSNotification(notification);
          break;
        default:
          logger.warn(`Canal de notification non supporté: ${channel}`);
      }

      logger.info(`📧 Notification envoyée: ${channel}`, { alertId: alert.alertId });

    } catch (error) {
      logger.error(`Erreur envoi notification ${channel}:`, error);
      throw error;
    }
  }

  // Envoyer une notification email
  async sendEmailNotification(notification) {
    // TODO: Implémenter l'envoi d'email
    const emailContent = this.generateEmailContent(notification);
    
    logger.info(`📧 Email notification préparée:`, {
      to: 'admin@kidai.com',
      subject: `Alert: ${notification.alert.title}`,
      content: emailContent
    });
    
    // Simulation d'envoi d'email
    return { success: true, messageId: `email_${Date.now()}` };
  }

  // Envoyer une notification Slack
  async sendSlackNotification(notification) {
    // TODO: Implémenter l'envoi Slack
    const slackMessage = this.generateSlackMessage(notification);
    
    logger.info(`💬 Slack notification préparée:`, slackMessage);
    
    // Simulation d'envoi Slack
    return { success: true, messageId: `slack_${Date.now()}` };
  }

  // Envoyer une notification webhook
  async sendWebhookNotification(notification) {
    // TODO: Implémenter l'envoi webhook
    const webhookPayload = this.generateWebhookPayload(notification);
    
    logger.info(`🔗 Webhook notification préparée:`, webhookPayload);
    
    // Simulation d'envoi webhook
    return { success: true, messageId: `webhook_${Date.now()}` };
  }

  // Envoyer une notification SMS
  async sendSMSNotification(notification) {
    // TODO: Implémenter l'envoi SMS
    const smsContent = this.generateSMSContent(notification);
    
    logger.info(`📱 SMS notification préparée:`, smsContent);
    
    // Simulation d'envoi SMS
    return { success: true, messageId: `sms_${Date.now()}` };
  }

  // Démarrer l'escalade automatique
  startEscalation(alert) {
    const escalationConfig = ALERT_CONFIG.escalation;
    
    // Niveau 1 (5 minutes)
    const level1Timer = setTimeout(async () => {
      if (!alert.acknowledged && !alert.resolved) {
        await this.escalateAlert(alert.alertId, 1);
      }
    }, escalationConfig.level1.delay);
    
    this.escalationTimers.set(`${alert.alertId}_level1`, level1Timer);
    
    // Niveau 2 (15 minutes)
    const level2Timer = setTimeout(async () => {
      if (!alert.acknowledged && !alert.resolved) {
        await this.escalateAlert(alert.alertId, 2);
      }
    }, escalationConfig.level2.delay);
    
    this.escalationTimers.set(`${alert.alertId}_level2`, level2Timer);
    
    // Niveau 3 (30 minutes)
    const level3Timer = setTimeout(async () => {
      if (!alert.acknowledged && !alert.resolved) {
        await this.escalateAlert(alert.alertId, 3);
      }
    }, escalationConfig.level3.delay);
    
    this.escalationTimers.set(`${alert.alertId}_level3`, level3Timer);
  }

  // Escalader une alerte
  async escalateAlert(alertId, level) {
    try {
      const escalationConfig = ALERT_CONFIG.escalation[`level${level}`];
      
      const updateData = {
        escalated: true,
        escalationLevel: level,
        escalatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      const alert = await this.updateAlert(alertId, updateData);
      
      // Envoyer les notifications d'escalade
      for (const channel of escalationConfig.channels) {
        await this.sendNotification(alert, channel, 'escalation');
      }
      
      logger.error(`🚨 ALERT ESCALATED: Level ${level}`, { alertId, level });
      
      return alert;

    } catch (error) {
      logger.error('Erreur escalade alerte:', error);
    }
  }

  // Arrêter l'escalade
  stopEscalation(alertId) {
    const timers = ['level1', 'level2', 'level3'];
    
    timers.forEach(level => {
      const timerKey = `${alertId}_${level}`;
      const timer = this.escalationTimers.get(timerKey);
      
      if (timer) {
        clearTimeout(timer);
        this.escalationTimers.delete(timerKey);
      }
    });
  }

  // Calculer l'impact d'une alerte
  calculateImpact(details) {
    let impact = {
      severity: 'low',
      affectedUsers: 0,
      estimatedDowntime: 0,
      businessImpact: 'none',
      userExperience: 'normal'
    };

    // Nombre d'utilisateurs affectés
    if (details.affectedUsers) {
      impact.affectedUsers = details.affectedUsers.length;
      
      if (impact.affectedUsers > 100) {
        impact.severity = 'critical';
        impact.businessImpact = 'high';
        impact.userExperience = 'degraded';
      } else if (impact.affectedUsers > 10) {
        impact.severity = 'high';
        impact.businessImpact = 'medium';
        impact.userExperience = 'affected';
      } else if (impact.affectedUsers > 1) {
        impact.severity = 'medium';
        impact.businessImpact = 'low';
      }
    }

    // Temps d'arrêt estimé
    if (details.estimatedDowntime) {
      impact.estimatedDowntime = details.estimatedDowntime;
      
      if (impact.estimatedDowntime > 3600000) { // > 1 heure
        impact.severity = 'critical';
        impact.businessImpact = 'high';
      } else if (impact.estimatedDowntime > 300000) { // > 5 minutes
        impact.severity = 'high';
        impact.businessImpact = 'medium';
      }
    }

    // Type d'erreur système
    if (details.errorType === 'database_connection') {
      impact.severity = 'critical';
      impact.businessImpact = 'high';
      impact.userExperience = 'unavailable';
    } else if (details.errorType === 'authentication') {
      impact.severity = 'high';
      impact.businessImpact = 'high';
      impact.userExperience = 'blocked';
    }

    return impact;
  }

  // Nettoyer les détails sensibles
  sanitizeDetails(details) {
    if (!details || typeof details !== 'object') {
      return details;
    }

    const sanitized = { ...details };
    
    // Masquer les champs sensibles
    const sensitiveFields = [
      'password', 'token', 'apiKey', 'secret', 'key',
      'authorization', 'auth', 'credential', 'private'
    ];

    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  // Générer un ID d'alerte
  generateAlertId() {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Générer le contenu email
  generateEmailContent(notification) {
    const alert = notification.alert;
    
    return {
      to: 'admin@kidai.com',
      subject: `[${alert.level.toUpperCase()}] ${alert.title}`,
      html: `
        <h2>Alert: ${alert.title}</h2>
        <p><strong>Level:</strong> ${alert.level}</p>
        <p><strong>Type:</strong> ${alert.type}</p>
        <p><strong>Message:</strong> ${alert.message}</p>
        <p><strong>Created:</strong> ${alert.createdAt}</p>
        <p><strong>Impact:</strong> ${JSON.stringify(alert.impact)}</p>
        <h3>Details:</h3>
        <pre>${JSON.stringify(alert.details, null, 2)}</pre>
      `
    };
  }

  // Générer le message Slack
  generateSlackMessage(notification) {
    const alert = notification.alert;
    
    return {
      text: `🚨 Alert: ${alert.title}`,
      attachments: [{
        color: this.getSlackColor(alert.level),
        fields: [
          { title: 'Level', value: alert.level, short: true },
          { title: 'Type', value: alert.type, short: true },
          { title: 'Message', value: alert.message, short: false },
          { title: 'Impact', value: JSON.stringify(alert.impact), short: false }
        ],
        timestamp: Math.floor(new Date(alert.createdAt).getTime() / 1000)
      }]
    };
  }

  // Générer le payload webhook
  generateWebhookPayload(notification) {
    return {
      alert: notification.alert,
      notification: {
        channel: notification.channel,
        type: notification.type,
        sentAt: notification.sentAt
      }
    };
  }

  // Générer le contenu SMS
  generateSMSContent(notification) {
    const alert = notification.alert;
    
    return `[${alert.level.toUpperCase()}] ${alert.title}: ${alert.message}`;
  }

  // Obtenir la couleur Slack selon le niveau
  getSlackColor(level) {
    switch (level) {
      case ALERT_CONFIG.levels.INFO:
        return '#36a64f'; // green
      case ALERT_CONFIG.levels.WARNING:
        return '#ff9500'; // orange
      case ALERT_CONFIG.levels.ERROR:
        return '#ff0000'; // red
      case ALERT_CONFIG.levels.CRITICAL:
        return '#8b0000'; // dark red
      case ALERT_CONFIG.levels.EMERGENCY:
        return '#000000'; // black
      default:
        return '#808080'; // gray
    }
  }

  // Obtenir les alertes actives
  async getActiveAlerts(filters = {}) {
    try {
      let query = db.collection('alerts')
        .where('status', '==', 'active')
        .orderBy('createdAt', 'desc');

      // Appliquer les filtres
      if (filters.level) {
        query = query.where('level', '==', filters.level);
      }
      
      if (filters.type) {
        query = query.where('type', '==', filters.type);
      }

      const snapshot = await query.get();
      const alerts = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      return alerts;

    } catch (error) {
      logger.error('Erreur récupération alertes actives:', error);
      throw error;
    }
  }

  // Obtenir les statistiques d'alertes
  async getAlertStats(timeRange = '24h') {
    try {
      const now = new Date();
      let startTime;
      
      switch (timeRange) {
        case '1h':
          startTime = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case '24h':
          startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        default:
          startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      }

      const snapshot = await db.collection('alerts')
        .where('createdAt', '>=', startTime)
        .get();

      const alerts = snapshot.docs.map(doc => doc.data());
      
      const stats = {
        total: alerts.length,
        byLevel: {},
        byType: {},
        byStatus: {},
        averageResolutionTime: 0,
        escalatedCount: 0
      };

      alerts.forEach(alert => {
        // Par niveau
        stats.byLevel[alert.level] = (stats.byLevel[alert.level] || 0) + 1;
        
        // Par type
        stats.byType[alert.type] = (stats.byType[alert.type] || 0) + 1;
        
        // Par statut
        stats.byStatus[alert.status] = (stats.byStatus[alert.status] || 0) + 1;
        
        // Escalade
        if (alert.escalated) {
          stats.escalatedCount++;
        }
        
        // Temps de résolution
        if (alert.resolved && alert.createdAt) {
          const resolutionTime = new Date(alert.resolvedAt) - new Date(alert.createdAt);
          stats.averageResolutionTime += resolutionTime;
        }
      });

      if (stats.total > 0) {
        stats.averageResolutionTime = Math.floor(stats.averageResolutionTime / stats.total);
      }

      return stats;

    } catch (error) {
      logger.error('Erreur statistiques alertes:', error);
      throw error;
    }
  }
}

// Instance globale du gestionnaire d'alertes
const alertManager = new AlertManager();

// Exporter les utilitaires
module.exports = {
  AlertManager,
  alertManager,
  ALERT_CONFIG
};
