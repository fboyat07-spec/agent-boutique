const { logger } = require("firebase-functions/v2");
const admin = require("firebase-admin");

const db = admin.firestore();

// Configuration du logging de sécurité
const SECURITY_LOG_CONFIG = {
  // Niveaux de sévérité
  severity: {
    LOW: 'low',
    MEDIUM: 'medium', 
    HIGH: 'high',
    CRITICAL: 'critical'
  },
  
  // Types d'événements
  eventTypes: {
    RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
    SUSPICIOUS_ACTIVITY: 'suspicious_activity',
    XP_INCONSISTENCY: 'xp_inconsistency',
    BLOCKED_USER: 'blocked_user',
    UNAUTHORIZED_ACCESS: 'unauthorized_access',
    INVALID_REQUEST: 'invalid_request',
    SECURITY_VIOLATION: 'security_violation'
  },
  
  // Rétention des logs
  retention: {
    days: 90, // Garder 90 jours de logs
    maxLogsPerUser: 1000 // Max 1000 logs par utilisateur
  }
};

// Logger les événements de sécurité
const logSecurityEvent = async (userId, eventType, details, severity = 'medium') => {
  try {
    const securityLog = {
      userId,
      eventType,
      severity,
      details,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      userAgent: details.userAgent || 'unknown',
      ip: details.ip || 'unknown',
      sessionId: details.sessionId || 'unknown',
      location: details.location || null,
      deviceInfo: details.deviceInfo || null
    };

    // Ajouter à la collection security_logs
    await db.collection('security_logs').add(securityLog);

    // Logger Firebase Functions
    const logLevel = getLogLevel(severity);
    logger[logLevel](`🔒 ${eventType}`, {
      userId,
      eventType,
      severity,
      details
    });

    // Pour les événements critiques, logger immédiatement
    if (severity === SECURITY_LOG_CONFIG.severity.CRITICAL) {
      await handleCriticalSecurityEvent(userId, eventType, details);
    }

    return { success: true, logId: securityLog.id };

  } catch (error) {
    logger.error("❌ Erreur logging sécurité", {
      userId,
      eventType,
      error: error.message
    });
    
    return { success: false, error: error.message };
  }
};

// Gérer les événements de sécurité critiques
const handleCriticalSecurityEvent = async (userId, eventType, details) => {
  try {
    // Créer une alerte de sécurité
    await db.collection('security_alerts').add({
      userId,
      eventType,
      severity: SECURITY_LOG_CONFIG.severity.CRITICAL,
      details,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      status: 'active',
      assignedTo: null,
      resolvedAt: null
    });

    // Notifier les administrateurs (à implémenter)
    await notifySecurityTeam(userId, eventType, details);

    logger.error("🚨 ALERTE DE SÉCURITÉ CRITIQUE", {
      userId,
      eventType,
      details
    });

  } catch (error) {
    logger.error("❌ Erreur gestion événement critique", {
      userId,
      eventType,
      error: error.message
    });
  }
};

// Notifier l'équipe de sécurité (à configurer)
const notifySecurityTeam = async (userId, eventType, details) => {
  // TODO: Implémenter la notification (email, Slack, etc.)
  logger.info("📧 Notification sécurité envoyée", {
    userId,
    eventType,
    details
  });
};

// Obtenir le niveau de logging approprié
const getLogLevel = (severity) => {
  switch (severity) {
    case SECURITY_LOG_CONFIG.severity.LOW:
      return 'info';
    case SECURITY_LOG_CONFIG.severity.MEDIUM:
      return 'warn';
    case SECURITY_LOG_CONFIG.severity.HIGH:
      return 'error';
    case SECURITY_LOG_CONFIG.severity.CRITICAL:
      return 'error';
    default:
      return 'info';
  }
};

// Analyser les patterns de sécurité
const analyzeSecurityPatterns = async (userId, timeRange = '24h') => {
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

    // Récupérer les logs de sécurité de l'utilisateur
    const securityLogsSnapshot = await db.collection('security_logs')
      .where('userId', '==', userId)
      .where('timestamp', '>=', startTime)
      .orderBy('timestamp', 'desc')
      .get();

    const logs = securityLogsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Analyser les patterns
    const analysis = {
      userId,
      timeRange,
      totalEvents: logs.length,
      eventTypeCounts: {},
      severityCounts: {},
      suspiciousScore: 0,
      patterns: [],
      recommendations: []
    };

    // Compter les événements par type et sévérité
    logs.forEach(log => {
      analysis.eventTypeCounts[log.eventType] = (analysis.eventTypeCounts[log.eventType] || 0) + 1;
      analysis.severityCounts[log.severity] = (analysis.severityCounts[log.severity] || 0) + 1;
    });

    // Calculer le score de suspicion
    analysis.suspiciousScore = calculateSuspiciousScore(analysis);

    // Détecter les patterns
    analysis.patterns = detectPatterns(logs);

    // Générer des recommandations
    analysis.recommendations = generateRecommendations(analysis);

    // Logger l'analyse
    await db.collection('security_analyses').add({
      userId,
      timeRange,
      analysis,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true, analysis };

  } catch (error) {
    logger.error("❌ Erreur analyse sécurité", {
      userId,
      timeRange,
      error: error.message
    });

    return { success: false, error: error.message };
  }
};

// Calculer le score de suspicion
const calculateSuspiciousScore = (analysis) => {
  let score = 0;

  // Points pour les événements de rate limit
  const rateLimitEvents = analysis.eventTypeCounts[SECURITY_LOG_CONFIG.eventTypes.RATE_LIMIT_EXCEEDED] || 0;
  score += rateLimitEvents * 10;

  // Points pour les activités suspectes
  const suspiciousEvents = analysis.eventTypeCounts[SECURITY_LOG_CONFIG.eventTypes.SUSPICIOUS_ACTIVITY] || 0;
  score += suspiciousEvents * 25;

  // Points pour les incohérences XP
  const xpInconsistencies = analysis.eventTypeCounts[SECURITY_LOG_CONFIG.eventTypes.XP_INCONSISTENCY] || 0;
  score += xpInconsistencies * 20;

  // Points pour les violations de sécurité
  const securityViolations = analysis.eventTypeCounts[SECURITY_LOG_CONFIG.eventTypes.SECURITY_VIOLATION] || 0;
  score += securityViolations * 50;

  // Bonus pour les événements critiques
  const criticalEvents = analysis.severityCounts[SECURITY_LOG_CONFIG.severity.CRITICAL] || 0;
  score += criticalEvents * 100;

  return score;
};

// Détecter les patterns dans les logs
const detectPatterns = (logs) => {
  const patterns = [];

  // Pattern 1: Fréquence anormale
  if (logs.length > 100) {
    patterns.push({
      type: 'high_frequency',
      description: 'Fréquence d\'activité anormale détectée',
      severity: 'medium',
      count: logs.length
    });
  }

  // Pattern 2: Répétition d'événements
  const eventTypeCounts = {};
  logs.forEach(log => {
    eventTypeCounts[log.eventType] = (eventTypeCounts[log.eventType] || 0) + 1;
  });

  Object.entries(eventTypeCounts).forEach(([eventType, count]) => {
    if (count > 10) {
      patterns.push({
        type: 'repetitive_events',
        description: `Événement ${eventType} répété ${count} fois`,
        severity: 'medium',
        eventType,
        count
      });
    }
  });

  // Pattern 3: Activité nocturne
  const nightLogs = logs.filter(log => {
    const hour = new Date(log.timestamp.toDate()).getHours();
    return hour < 6 || hour > 23;
  });

  if (nightLogs.length > 10) {
    patterns.push({
      type: 'night_activity',
      description: 'Activité nocturne suspecte',
      severity: 'low',
      count: nightLogs.length
    });
  }

  // Pattern 4: Changements d'IP/User-Agent
  const ipChanges = detectIPChanges(logs);
  if (ipChanges.length > 0) {
    patterns.push({
      type: 'ip_changes',
      description: 'Changements d\'adresse IP détectés',
      severity: 'high',
      changes: ipChanges
    });
  }

  return patterns;
};

// Détecter les changements d'IP
const detectIPChanges = (logs) => {
  const ipChanges = [];
  let lastIP = null;

  logs.forEach(log => {
    if (log.ip && log.ip !== 'unknown' && lastIP && log.ip !== lastIP) {
      ipChanges.push({
        from: lastIP,
        to: log.ip,
        timestamp: log.timestamp
      });
    }
    lastIP = log.ip;
  });

  return ipChanges;
};

// Générer des recommandations
const generateRecommendations = (analysis) => {
  const recommendations = [];

  if (analysis.suspiciousScore > 100) {
    recommendations.push({
      type: 'investigate_user',
      description: 'Score de suspicion élevé, investigation requise',
      priority: 'high'
    });
  }

  if (analysis.eventTypeCounts[SECURITY_LOG_CONFIG.eventTypes.RATE_LIMIT_EXCEEDED] > 5) {
    recommendations.push({
      type: 'rate_limit_adjustment',
      description: 'Ajuster les limites de rate pour cet utilisateur',
      priority: 'medium'
    });
  }

  if (analysis.eventTypeCounts[SECURITY_LOG_CONFIG.eventTypes.XP_INCONSISTENCY] > 3) {
    recommendations.push({
      type: 'xp_validation',
      description: 'Valider manuellement les gains d\'XP de cet utilisateur',
      priority: 'high'
    });
  }

  const patterns = analysis.patterns || [];
  const highSeverityPatterns = patterns.filter(p => p.severity === 'high');
  
  if (highSeverityPatterns.length > 0) {
    recommendations.push({
      type: 'security_review',
      description: 'Patterns de sécurité critiques détectés, review requis',
      priority: 'critical'
    });
  }

  return recommendations;
};

// Nettoyer les anciens logs de sécurité
const cleanupOldSecurityLogs = async () => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - SECURITY_LOG_CONFIG.retention.days);

    // Supprimer les anciens logs
    const oldLogsSnapshot = await db.collection('security_logs')
      .where('timestamp', '<', cutoffDate)
      .get();

    const batch = db.batch();
    oldLogsSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    logger.info(`🧹 Nettoyage logs sécurité: ${oldLogsSnapshot.size} logs supprimés`);

    return { success: true, deletedCount: oldLogsSnapshot.size };

  } catch (error) {
    logger.error("❌ Erreur nettoyage logs sécurité", {
      error: error.message
    });

    return { success: false, error: error.message };
  }
};

// Obtenir les statistiques de sécurité
const getSecurityStats = async (timeRange = '24h') => {
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

    // Récupérer les logs de sécurité
    const securityLogsSnapshot = await db.collection('security_logs')
      .where('timestamp', '>=', startTime)
      .get();

    const logs = securityLogsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Calculer les statistiques
    const stats = {
      timeRange,
      totalLogs: logs.length,
      uniqueUsers: new Set(logs.map(log => log.userId)).size,
      eventTypeCounts: {},
      severityCounts: {},
      topUsers: [],
      recentAlerts: []
    };

    // Compter les événements
    logs.forEach(log => {
      stats.eventTypeCounts[log.eventType] = (stats.eventTypeCounts[log.eventType] || 0) + 1;
      stats.severityCounts[log.severity] = (stats.severityCounts[log.severity] || 0) + 1;
    });

    // Top utilisateurs par nombre d'événements
    const userEventCounts = {};
    logs.forEach(log => {
      userEventCounts[log.userId] = (userEventCounts[log.userId] || 0) + 1;
    });

    stats.topUsers = Object.entries(userEventCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([userId, count]) => ({ userId, count }));

    // Alertes récentes
    stats.recentAlerts = logs
      .filter(log => log.severity === SECURITY_LOG_CONFIG.severity.CRITICAL)
      .slice(0, 5);

    return { success: true, stats };

  } catch (error) {
    logger.error("❌ Erreur statistiques sécurité", {
      timeRange,
      error: error.message
    });

    return { success: false, error: error.message };
  }
};

// CRON pour le nettoyage automatique
const scheduleSecurityCleanup = () => {
  // Nettoyer les logs tous les jours à 2h du matin
  setInterval(async () => {
    await cleanupOldSecurityLogs();
  }, 24 * 60 * 60 * 1000);
};

// Démarrer le nettoyage automatique
scheduleSecurityCleanup();

module.exports = {
  logSecurityEvent,
  analyzeSecurityPatterns,
  getSecurityStats,
  cleanupOldSecurityLogs,
  SECURITY_LOG_CONFIG
};
