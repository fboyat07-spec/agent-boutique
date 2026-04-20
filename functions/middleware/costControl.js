const { logger } = require("firebase-functions/v2");
const admin = require("firebase-admin");

const db = admin.firestore();

// Configuration du contrôle des coûts
const COST_CONTROL_CONFIG = {
  // Limites par utilisateur
  userLimits: {
    dailyFunctionCalls: 1000,    // 1000 appels par jour
    monthlyFunctionCalls: 20000, // 20000 appels par mois
    dailyReads: 5000,         // 5000 lectures par jour
    monthlyReads: 100000,      // 100000 lectures par mois
    dailyWrites: 2000,         // 2000 écritures par jour
    monthlyWrites: 50000,      // 50000 écritures par mois
    concurrentCalls: 10          // 10 appels simultanés max
  },
  
  // Limites par fonction
  functionLimits: {
    addXp: {
      maxCallsPerMinute: 10,
      maxCallsPerHour: 100,
      maxReadsPerCall: 5,
      maxWritesPerCall: 3,
      costMultiplier: 1.0
    },
    completeMission: {
      maxCallsPerMinute: 5,
      maxCallsPerHour: 50,
      maxReadsPerCall: 10,
      maxWritesPerCall: 5,
      costMultiplier: 1.5
    },
    checkBadges: {
      maxCallsPerMinute: 20,
      maxCallsPerHour: 200,
      maxReadsPerCall: 15,
      maxWritesPerCall: 2,
      costMultiplier: 0.5
    },
    getUserProgress: {
      maxCallsPerMinute: 30,
      maxCallsPerHour: 300,
      maxReadsPerCall: 20,
      maxWritesPerCall: 1,
      costMultiplier: 0.3
    },
    getAvailableMissions: {
      maxCallsPerMinute: 50,
      maxCallsPerHour: 500,
      maxReadsPerCall: 25,
      maxWritesPerCall: 1,
      costMultiplier: 0.2
    }
  },
  
  // Coûts Firestore (approximatifs)
  firestoreCosts: {
    read: 0.06,      // $0.06 per 100k reads
    write: 0.18,     // $0.18 per 100k writes
    delete: 0.02,    // $0.02 per 100k deletes
    documentRead: 0.02,
    documentWrite: 0.05
  },
  
  // Configuration de blocage
  blocking: {
    enabled: true,
    blockDuration: 300000,      // 5 minutes
    maxViolations: 3,           // Bloquer après 3 violations
    warningThreshold: 0.8,      // Avertir à 80%
    blockThreshold: 1.0          // Bloquer à 100%
  },
  
  // Configuration de monitoring
  monitoring: {
    enabled: true,
    logLevel: 'info',
    alertThreshold: 0.9,        // Alerte à 90%
    reportInterval: 300000        // 5 minutes
  }
};

// Classe pour le contrôle des coûts
class CostControlManager {
  constructor() {
    this.metrics = new Map();
    this.userLimits = new Map();
    this.blockedUsers = new Map();
    this.costReports = new Map();
    this.lastCleanup = Date.now();
  }

  // Vérifier les limites d'appels par utilisateur
  async checkUserLimits(userId, functionName, action = 'call') {
    try {
      const now = Date.now();
      const userKey = `user_${userId}`;
      
      // Obtenir ou créer les métriques utilisateur
      if (!this.userLimits.has(userKey)) {
        this.userLimits.set(userKey, {
          userId,
          dailyCalls: 0,
          monthlyCalls: 0,
          lastReset: {
            daily: this.getStartOfDay(now),
            monthly: this.getStartOfMonth(now)
          },
          violations: [],
          blocked: false,
          blockedUntil: null
        });
      }
      
      const userMetrics = this.userLimits.get(userKey);
      const functionConfig = COST_CONTROL_CONFIG.functionLimits[functionName];
      
      if (!functionConfig) {
        return { allowed: true, reason: 'Function not configured' };
      }
      
      // Réinitialiser les compteurs si nécessaire
      this.resetUserCountersIfNeeded(userMetrics, now);
      
      // Vérifier les limites
      const dailyLimitCheck = await this.checkDailyLimit(userMetrics, functionConfig, now);
      if (!dailyLimitCheck.allowed) {
        return dailyLimitCheck;
      }
      
      const monthlyLimitCheck = await this.checkMonthlyLimit(userMetrics, functionConfig, now);
      if (!monthlyLimitCheck.allowed) {
        return monthlyLimitCheck;
      }
      
      const concurrentCheck = await this.checkConcurrentLimit(userId, functionName, now);
      if (!concurrentCheck.allowed) {
        return concurrentCheck;
      }
      
      // Enregistrer l'appel réussi
      await this.recordUserCall(userId, functionName, action, now);
      
      return { allowed: true };
      
    } catch (error) {
      logger.error('Erreur vérification limites utilisateur:', error);
      return { allowed: false, reason: 'Error checking limits', error: error.message };
    }
  }

  // Vérifier la limite quotidienne
  async checkDailyLimit(userMetrics, functionConfig, now) {
    const dailyLimit = COST_CONTROL_CONFIG.userLimits.dailyFunctionCalls;
    
    if (userMetrics.dailyCalls >= dailyLimit) {
      const violation = {
        type: 'daily_limit',
        limit: dailyLimit,
        current: userMetrics.dailyCalls,
        timestamp: now,
        functionName: functionConfig.name || 'unknown'
      };
      
      userMetrics.violations.push(violation);
      
      // Vérifier si on doit bloquer
      const shouldBlock = await this.checkBlockingThreshold(userMetrics, now);
      if (shouldBlock) {
        await this.blockUser(userMetrics.userId, 'daily_limit_exceeded', violation);
        return { allowed: false, reason: 'Daily limit exceeded', blocked: true };
      }
      
      // Envoyer un avertissement
      await this.sendWarning(userMetrics.userId, 'daily_limit_warning', violation);
      
      return { allowed: false, reason: 'Daily limit exceeded', warning: true };
    }
    
    return { allowed: true };
  }

  // Vérifier la limite mensuelle
  async checkMonthlyLimit(userMetrics, functionConfig, now) {
    const monthlyLimit = COST_CONTROL_CONFIG.userLimits.monthlyFunctionCalls;
    
    if (userMetrics.monthlyCalls >= monthlyLimit) {
      const violation = {
        type: 'monthly_limit',
        limit: monthlyLimit,
        current: userMetrics.monthlyCalls,
        timestamp: now,
        functionName: functionConfig.name || 'unknown'
      };
      
      userMetrics.violations.push(violation);
      
      // Bloquer immédiatement pour les limites mensuelles
      await this.blockUser(userMetrics.userId, 'monthly_limit_exceeded', violation);
      
      return { allowed: false, reason: 'Monthly limit exceeded', blocked: true };
    }
    
    return { allowed: true };
  }

  // Vérifier la limite d'appels simultanés
  async checkConcurrentLimit(userId, functionName, now) {
    const concurrentLimit = COST_CONTROL_CONFIG.userLimits.concurrentCalls;
    const concurrentKey = `concurrent_${userId}_${functionName}`;
    
    // Obtenir le nombre d'appels simultanés
    const currentConcurrent = (this.metrics.get(concurrentKey) || 0) + 1;
    this.metrics.set(concurrentKey, currentConcurrent);
    
    if (currentConcurrent > concurrentLimit) {
      const violation = {
        type: 'concurrent_limit',
        limit: concurrentLimit,
        current: currentConcurrent,
        timestamp: now,
        functionName
      };
      
      // Enregistrer la violation
      const userMetrics = this.userLimits.get(`user_${userId}`);
      if (userMetrics) {
        userMetrics.violations.push(violation);
      }
      
      return { allowed: false, reason: 'Concurrent limit exceeded' };
    }
    
    return { allowed: true };
  }

  // Enregistrer un appel utilisateur
  async recordUserCall(userId, functionName, action, timestamp) {
    const userKey = `user_${userId}`;
    const userMetrics = this.userLimits.get(userKey);
    
    if (userMetrics) {
      userMetrics.dailyCalls++;
      userMetrics.monthlyCalls++;
      
      // Sauvegarder les métriques
      await this.saveUserMetrics(userMetrics);
    }
  }

  // Vérifier si on doit bloquer l'utilisateur
  async checkBlockingThreshold(userMetrics, now) {
    const config = COST_CONTROL_CONFIG.blocking;
    const recentViolations = userMetrics.violations.filter(v => 
      now - v.timestamp < 86400000 // 24 heures
    );
    
    const violationRate = recentViolations.length / Math.max(recentViolations.length, 1);
    
    if (violationRate >= config.blockThreshold) {
      return true;
    }
    
    if (violationRate >= config.warningThreshold && !userMetrics.blocked) {
      await this.sendWarning(userMetrics.userId, 'high_violation_rate', {
        rate: violationRate,
        violations: recentViolations.length
      });
    }
    
    return false;
  }

  // Bloquer un utilisateur
  async blockUser(userId, reason, violation) {
    const userKey = `user_${userId}`;
    const userMetrics = this.userLimits.get(userKey);
    
    if (userMetrics) {
      userMetrics.blocked = true;
      userMetrics.blockedUntil = new Date(Date.now() + COST_CONTROL_CONFIG.blocking.blockDuration);
      userMetrics.blockReason = reason;
      userMetrics.lastViolation = violation;
      
      // Sauvegarder
      await this.saveUserMetrics(userMetrics);
      this.blockedUsers.set(userId, {
        blocked: true,
        blockedUntil: userMetrics.blockedUntil,
        reason
      });
      
      // Envoyer une alerte
      await this.sendAlert(userId, 'user_blocked', {
        reason,
        blockedUntil: userMetrics.blockedUntil,
        violation
      });
      
      logger.warn(`Utilisateur ${userId} bloqué:`, {
        reason,
        blockedUntil: userMetrics.blockedUntil,
        violation
      });
    }
  }

  // Vérifier si un utilisateur est bloqué
  isUserBlocked(userId) {
    const blocked = this.blockedUsers.get(userId);
    if (blocked && blocked.blocked) {
      // Vérifier si le blocage est expiré
      if (blocked.blockedUntil && Date.now() > blocked.blockedUntil) {
        this.blockedUsers.delete(userId);
        return false;
      }
      return true;
    }
    return false;
  }

  // Optimiser les lectures Firestore
  async optimizeFirestoreReads(userId, functionName, requestedReads) {
    const functionConfig = COST_CONTROL_CONFIG.functionLimits[functionName];
    if (!functionConfig) {
      return { allowed: true, optimizedReads: requestedReads };
    }
    
    const maxReads = functionConfig.maxReadsPerCall;
    const userKey = `user_${userId}`;
    const userMetrics = this.userLimits.get(userKey);
    
    // Vérifier si l'utilisateur est bloqué
    if (this.isUserBlocked(userId)) {
      return { allowed: false, reason: 'User is blocked' };
    }
    
    // Si le nombre de lectures demandées est inférieur à la limite
    if (requestedReads <= maxReads) {
      return { allowed: true, optimizedReads: requestedReads };
    }
    
    // Optimiser: regrouper les lectures en une seule requête
    logger.info(`Optimisation Firestore reads pour ${functionName}:`, {
      userId,
      requestedReads,
      maxReads,
      optimization: 'batch_reads'
    });
    
    return {
      allowed: true,
      optimizedReads: maxReads,
      optimization: 'batch_reads',
      message: `Reads limited to ${maxReads} per call`
    };
  }

  // Optimiser les écritures Firestore
  async optimizeFirestoreWrites(userId, functionName, requestedWrites) {
    const functionConfig = COST_CONTROL_CONFIG.functionLimits[functionName];
    if (!functionConfig) {
      return { allowed: true, optimizedWrites: requestedWrites };
    }
    
    const maxWrites = functionConfig.maxWritesPerCall;
    
    // Vérifier si l'utilisateur est bloqué
    if (this.isUserBlocked(userId)) {
      return { allowed: false, reason: 'User is blocked' };
    }
    
    // Si le nombre d'écritures demandées est inférieur à la limite
    if (requestedWrites <= maxWrites) {
      return { allowed: true, optimizedWrites: requestedWrites };
    }
    
    // Optimiser: regrouper les écritures en un batch
    logger.info(`Optimisation Firestore writes pour ${functionName}:`, {
      userId,
      requestedWrites,
      maxWrites,
      optimization: 'batch_writes'
    });
    
    return {
      allowed: true,
      optimizedWrites: maxWrites,
      optimization: 'batch_writes',
      message: `Writes limited to ${maxWrites} per call`
    };
  }

  // Calculer le coût d'une opération
  calculateOperationCost(reads, writes, deletes, documentReads, documentWrites) {
    const costs = COST_CONTROL_CONFIG.firestoreCosts;
    
    const readCost = reads * costs.read;
    const writeCost = writes * costs.write;
    const deleteCost = deletes * costs.delete;
    const docReadCost = documentReads * costs.documentRead;
    const docWriteCost = documentWrites * costs.documentWrite;
    
    return {
      reads: { count: reads, cost: readCost },
      writes: { count: writes, cost: writeCost },
      deletes: { count: deletes, cost: deleteCost },
      documentReads: { count: documentReads, cost: docReadCost },
      documentWrites: { count: documentWrites, cost: docWriteCost },
      totalCost: readCost + writeCost + deleteCost + docReadCost + docWriteCost
    };
  }

  // Enregistrer les coûts par utilisateur
  async recordUserCosts(userId, functionName, operationCost) {
    const costKey = `costs_${userId}_${functionName}`;
    const timestamp = Date.now();
    
    if (!this.costReports.has(costKey)) {
      this.costReports.set(costKey, []);
    }
    
    const costs = this.costReports.get(costKey);
    costs.push({
      timestamp,
      functionName,
      operationCost,
      daily: true
    });
    
    // Sauvegarder dans Firestore
    await db.collection('user_costs').add({
      userId,
      functionName,
      operationCost,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      date: new Date().toISOString().split('T')[0] // YYYY-MM-DD
    });
    
    // Nettoyer les anciens rapports
    this.cleanupCostReports();
  }

  // Envoyer un avertissement
  async sendWarning(userId, type, details) {
    if (!COST_CONTROL_CONFIG.monitoring.enabled) {
      return;
    }
    
    logger.warn(`Avertissement coût pour utilisateur ${userId}:`, {
      type,
      details
    });
    
    // Sauvegarder l'avertissement
    await db.collection('cost_warnings').add({
      userId,
      type,
      details,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  // Envoyer une alerte
  async sendAlert(userId, type, details) {
    if (!COST_CONTROL_CONFIG.monitoring.enabled) {
      return;
    }
    
    logger.error(`Alerte coût pour utilisateur ${userId}:`, {
      type,
      details
    });
    
    // Sauvegarder l'alerte
    await db.collection('cost_alerts').add({
      userId,
      type,
      details,
      severity: 'high',
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  // Obtenir les métriques de coûts
  async getCostMetrics(userId = null, functionName = null, period = 'daily') {
    try {
      let query = db.collection('user_costs');
      
      if (userId) {
        query = query.where('userId', '==', userId);
      }
      
      if (functionName) {
        query = query.where('functionName', '==', functionName);
      }
      
      // Filtrer par période
      const now = new Date();
      let startDate;
      
      switch (period) {
        case 'daily':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'weekly':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'monthly':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        default:
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      }
      
      query = query.where('timestamp', '>=', startDate);
      
      const snapshot = await query.orderBy('timestamp', 'desc').limit(1000).get();
      
      const costs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Calculer les totaux
      const totalCost = costs.reduce((sum, cost) => sum + (cost.operationCost?.totalCost || 0), 0);
      const totalOperations = costs.length;
      
      return {
        period,
        userId,
        functionName,
        totalCost,
        totalOperations,
        averageCostPerOperation: totalOperations > 0 ? totalCost / totalOperations : 0,
        costs: costs.slice(0, 100), // 100 derniers
        timestamp: new Date()
      };
      
    } catch (error) {
      logger.error('Erreur récupération métriques de coûts:', error);
      return {
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  // Obtenir le rapport de coûts par utilisateur
  async getUserCostReport(userId, period = 'monthly') {
    const metrics = await this.getCostMetrics(userId, null, period);
    
    if (metrics.error) {
      return metrics;
    }
    
    const userLimits = COST_CONTROL_CONFIG.userLimits;
    const userKey = `user_${userId}`;
    const userMetrics = this.userLimits.get(userKey);
    
    const report = {
      userId,
      period,
      costs: metrics,
      limits: {
        daily: userLimits.dailyFunctionCalls,
        monthly: userLimits.monthlyFunctionCalls,
        current: {
          daily: userMetrics?.dailyCalls || 0,
          monthly: userMetrics?.monthlyCalls || 0
        },
        usage: {
          daily: userMetrics?.dailyCalls ? (userMetrics.dailyCalls / userLimits.dailyFunctionCalls * 100).toFixed(2) : '0',
          monthly: userMetrics?.monthlyCalls ? (userMetrics.monthlyCalls / userLimits.monthlyFunctionCalls * 100).toFixed(2) : '0'
        }
      },
      warnings: userMetrics?.violations || [],
      blocked: userMetrics?.blocked || false,
      blockedUntil: userMetrics?.blockedUntil || null
    };
    
    // Sauvegarder le rapport
    await db.collection('cost_reports').add({
      ...report,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return report;
  }

  // Réinitialiser les compteurs utilisateur si nécessaire
  resetUserCountersIfNeeded(userMetrics, now) {
    const lastReset = userMetrics.lastReset;
    const currentDay = this.getStartOfDay(now);
    const currentMonth = this.getStartOfMonth(now);
    
    // Réinitialiser le compteur quotidien
    if (lastReset.daily !== currentDay) {
      userMetrics.dailyCalls = 0;
      userMetrics.lastReset.daily = currentDay;
    }
    
    // Réinitialiser le compteur mensuel
    if (lastReset.monthly !== currentMonth) {
      userMetrics.monthlyCalls = 0;
      userMetrics.lastReset.monthly = currentMonth;
    }
  }

  // Obtenir le début du jour
  getStartOfDay(date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  // Obtenir le début du mois
  getStartOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  // Sauvegarder les métriques utilisateur
  async saveUserMetrics(userMetrics) {
    try {
      await db.collection('user_limits').doc(userMetrics.userId).set({
        ...userMetrics,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      logger.error('Erreur sauvegarde métriques utilisateur:', error);
    }
  }

  // Nettoyer les anciens rapports de coûts
  cleanupCostReports() {
    const cutoffTime = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 jours
    
    for (const [key, reports] of this.costReports.entries()) {
      const filteredReports = reports.filter(report => report.timestamp > cutoffTime);
      if (filteredReports.length !== reports.length) {
        this.costReports.set(key, filteredReports);
      }
    }
    
    this.lastCleanup = Date.now();
  }

  // Obtenir les métriques globales
  getGlobalMetrics() {
    const totalUsers = this.userLimits.size;
    const blockedUsers = Array.from(this.blockedUsers.entries()).filter(([_, blocked]) => blocked.blocked);
    
    let totalViolations = 0;
    let totalBlocked = 0;
    
    for (const [_, userMetrics] of this.userLimits.values()) {
      totalViolations += userMetrics.violations.length;
      if (userMetrics.blocked) {
        totalBlocked++;
      }
    }
    
    return {
      totalUsers,
      blockedUsers: totalBlocked,
      totalViolations,
      violationRate: totalUsers > 0 ? (totalViolations / totalUsers) * 100 : 0,
      blockRate: totalUsers > 0 ? (totalBlocked / totalUsers) * 100 : 0,
      lastCleanup: this.lastCleanup,
      timestamp: new Date()
    };
  }
}

// Instance globale du gestionnaire de coûts
const costControlManager = new CostControlManager();

// Exporter les utilitaires
module.exports = {
  CostControlManager,
  costControlManager,
  COST_CONTROL_CONFIG
};
