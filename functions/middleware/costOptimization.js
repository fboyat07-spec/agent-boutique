const { logger } = require("firebase-functions/v2");
const admin = require("firebase-admin");

const db = admin.firestore();

// Configuration de l'optimisation des coûts
const COST_OPTIMIZATION_CONFIG = {
  // Limites par utilisateur
  userLimits: {
    dailyFunctionCalls: {
      free: 100,        // 100 appels gratuits par jour
      premium: 1000,     // 1000 appels premium par jour
      enterprise: 5000    // 5000 appels enterprise par jour
    },
    monthlyFunctionCalls: {
      free: 2000,       // 2000 appels gratuits par mois
      premium: 20000,    // 20000 appels premium par mois
      enterprise: 100000  // 100000 appels enterprise par mois
    },
    concurrentCalls: 5,   // 5 appels simultanés maximum
    burstLimit: 10        // 10 appels en rafale max
  },
  
  // Optimisation des lectures
  readOptimization: {
    enabled: true,
    cacheResults: true,
    cacheTTL: 5 * 60 * 1000,        // 5 minutes
    maxCacheSize: 1000,                  // 1000 entrées max
    batchSize: 10,                        // 10 lectures par batch max
    preferBatch: true,
    deduplicateReads: true
  },
  
  // Optimisation des écritures
  writeOptimization: {
    enabled: true,
    batchSize: 500,                       // 500 écritures par batch max
    batchTimeout: 5000,                    // 5 secondes timeout
    queueWrites: true,
    maxQueueSize: 1000,                   // 1000 écritures en attente max
    flushInterval: 1000,                   // 1 seconde entre les flushs
    compressData: true
  },
  
  // Détection d'abus
  abuseDetection: {
    enabled: true,
    patterns: {
      rapidRequests: {
        maxRequests: 20,              // 20 requêtes max
        timeWindow: 60 * 1000,        // 1 minute
        blockDuration: 5 * 60 * 1000   // 5 minutes
      },
      highFrequency: {
        maxRequests: 100,             // 100 requêtes max
        timeWindow: 5 * 60 * 1000,       // 5 minutes
        blockDuration: 15 * 60 * 1000  // 15 minutes
      },
      suspiciousPattern: {
        unusualEndpoints: ['addXp', 'completeMission'],
        threshold: 5,                    // 5x la normale
        blockDuration: 30 * 60 * 1000   // 30 minutes
      }
    },
    blacklist: {
      enabled: true,
      maxViolations: 3,
      blockDuration: 24 * 60 * 60 * 1000  // 24 heures
    }
  },
  
  // Configuration du compteur d'usage
  usageCounter: {
    enabled: true,
    collection: 'daily_usage',
    resetTime: '00:00:00',              // Minuit UTC
    aggregation: {
      byUser: true,
      byFunction: true,
      byEndpoint: true,
      byHour: true
    }
  }
};

// Classe principale pour l'optimisation des coûts
class CostOptimizationManager {
  constructor() {
    this.readCache = new Map();
    this.writeQueue = [];
    this.userLimits = new Map();
    this.abuseDetection = new Map();
    this.usageCounters = new Map();
    this.lastFlush = Date.now();
    this.lastCleanup = Date.now();
  }

  // Vérifier les limites d'appels par utilisateur
  async checkUserLimits(userId, functionName, userTier = 'free') {
    try {
      const now = Date.now();
      const userKey = `user_${userId}`;
      
      // Obtenir ou créer les limites utilisateur
      if (!this.userLimits.has(userKey)) {
        this.userLimits.set(userKey, {
          userId,
          tier: userTier,
          dailyCalls: 0,
          monthlyCalls: 0,
          lastReset: {
            daily: this.getStartOfDay(now),
            monthly: this.getStartOfMonth(now)
          },
          concurrentCalls: 0,
          burstCount: 0,
          lastBurstReset: now,
          violations: [],
          blocked: false,
          blockedUntil: null
        });
      }
      
      const userLimitData = this.userLimits.get(userKey);
      const limits = COST_OPTIMIZATION_CONFIG.userLimits;
      
      // Réinitialiser les compteurs si nécessaire
      this.resetUserCountersIfNeeded(userLimitData, now);
      
      // Vérifier si l'utilisateur est bloqué
      if (userLimitData.blocked && userLimitData.blockedUntil && now < userLimitData.blockedUntil) {
        const remainingTime = Math.ceil((userLimitData.blockedUntil - now) / 1000 / 60);
        return {
          allowed: false,
          reason: 'User temporarily blocked',
          details: {
            blockedUntil: userLimitData.blockedUntil,
            remainingMinutes: remainingTime,
            violations: userLimitData.violations.length
          }
        };
      }
      
      // Vérifier les limites quotidiennes
      const dailyLimit = limits.dailyFunctionCalls[userTier];
      if (userLimitData.dailyCalls >= dailyLimit) {
        return {
          allowed: false,
          reason: 'Daily limit exceeded',
          details: {
            current: userLimitData.dailyCalls,
            limit: dailyLimit,
            tier: userTier,
            resetTime: this.getNextResetTime('daily')
          }
        };
      }
      
      // Vérifier les limites mensuelles
      const monthlyLimit = limits.monthlyFunctionCalls[userTier];
      if (userLimitData.monthlyCalls >= monthlyLimit) {
        return {
          allowed: false,
          reason: 'Monthly limit exceeded',
          details: {
            current: userLimitData.monthlyCalls,
            limit: monthlyLimit,
            tier: userTier,
            resetTime: this.getNextResetTime('monthly')
          }
        };
      }
      
      // Vérifier les appels simultanés
      if (userLimitData.concurrentCalls >= limits.concurrentCalls) {
        return {
          allowed: false,
          reason: 'Concurrent calls limit exceeded',
          details: {
            current: userLimitData.concurrentCalls,
            limit: limits.concurrentCalls
          }
        };
      }
      
      // Vérifier les appels en rafale
      const timeSinceLastBurst = now - userLimitData.lastBurstReset;
      if (timeSinceLastBurst < 60000 && userLimitData.burstCount >= limits.burstLimit) {
        return {
          allowed: false,
          reason: 'Burst limit exceeded',
          details: {
            current: userLimitData.burstCount,
            limit: limits.burstLimit,
            resetTime: new Date(userLimitData.lastBurstReset + 60000)
          }
        };
      }
      
      // Incrémenter les compteurs
      userLimitData.dailyCalls++;
      userLimitData.monthlyCalls++;
      userLimitData.concurrentCalls++;
      userLimitData.burstCount++;
      
      // Enregistrer l'appel
      await this.recordUserCall(userId, functionName, userTier);
      
      return { allowed: true };
      
    } catch (error) {
      logger.error('Erreur lors de la vérification des limites utilisateur:', error);
      return {
        allowed: false,
        reason: 'Internal error',
        error: error.message
      };
    }
  }

  // Optimiser les lectures Firestore
  async optimizeReads(readOperations) {
    try {
      const config = COST_OPTIMIZATION_CONFIG.readOptimization;
      
      if (!config.enabled) {
        return readOperations;
      }
      
      const optimizedOperations = [];
      const batchOperations = [];
      const cacheHits = [];
      
      // Traiter chaque opération de lecture
      for (const operation of readOperations) {
        const cacheKey = this.generateCacheKey(operation);
        
        // Vérifier le cache
        if (config.cacheResults && this.readCache.has(cacheKey)) {
          const cached = this.readCache.get(cacheKey);
          if (now - cached.timestamp < config.cacheTTL) {
            cacheHits.push({
              operation,
              data: cached.data,
              fromCache: true
            });
            continue;
          }
        }
        
        // Ajouter au batch
        batchOperations.push(operation);
        
        // Créer un batch si nécessaire
        if (batchOperations.length >= config.batchSize) {
          const batchResult = await this.executeReadBatch(batchOperations);
          optimizedOperations.push(...batchResult);
          batchOperations.length = 0;
        }
      }
      
      // Exécuter le batch restant
      if (batchOperations.length > 0) {
        const batchResult = await this.executeReadBatch(batchOperations);
        optimizedOperations.push(...batchResult);
      }
      
      // Ajouter les résultats du cache
      optimizedOperations.push(...cacheHits);
      
      logger.info('Optimisation des lectures:', {
        totalOperations: readOperations.length,
        cacheHits: cacheHits.length,
        batchReads: Math.ceil(optimizedOperations.length / config.batchSize),
        cacheHitRate: ((cacheHits.length / readOperations.length) * 100).toFixed(2) + '%'
      });
      
      return optimizedOperations;
      
    } catch (error) {
      logger.error('Erreur lors de l\'optimisation des lectures:', error);
      return readOperations;
    }
  }

  // Exécuter un batch de lectures
  async executeReadBatch(operations) {
    try {
      const batch = [];
      
      for (const operation of operations) {
        const { collection, docId, path } = operation;
        
        if (collection && docId) {
          batch.push(db.collection(collection).doc(docId).get());
        } else if (path) {
          batch.push(db.doc(path).get());
        }
      }
      
      const results = await Promise.all(batch);
      
      // Mettre en cache les résultats
      for (let i = 0; i < operations.length; i++) {
        const operation = operations[i];
        const result = results[i];
        
        if (result.exists) {
          const cacheKey = this.generateCacheKey(operation);
          this.readCache.set(cacheKey, {
            data: result.data(),
            timestamp: Date.now()
          });
        }
      }
      
      return results.map((doc, index) => ({
        operation: operations[index],
        data: doc.exists ? doc.data() : null,
        fromCache: false
      }));
      
    } catch (error) {
      logger.error('Erreur lors de l\'exécution du batch de lectures:', error);
      return operations.map(op => ({ operation: op, data: null, error: error.message }));
    }
  }

  // Optimiser les écritures Firestore
  async optimizeWrites(writeOperations) {
    try {
      const config = COST_OPTIMIZATION_CONFIG.writeOptimization;
      
      if (!config.enabled) {
        return await this.executeSingleWrites(writeOperations);
      }
      
      // Ajouter à la file d'attente
      this.writeQueue.push(...writeOperations);
      
      // Limiter la taille de la file
      if (this.writeQueue.length > config.maxQueueSize) {
        this.writeQueue = this.writeQueue.slice(-config.maxQueueSize);
      }
      
      // Exécuter le batch si nécessaire
      if (this.writeQueue.length >= config.batchSize || 
          Date.now() - this.lastFlush >= config.flushInterval) {
        return await this.flushWriteQueue();
      }
      
      return { queued: true, count: this.writeQueue.length };
      
    } catch (error) {
      logger.error('Erreur lors de l\'optimisation des écritures:', error);
      return { error: error.message };
    }
  }

  // Vider la file d'écriture
  async flushWriteQueue() {
    try {
      if (this.writeQueue.length === 0) {
        return { flushed: 0 };
      }
      
      const config = COST_OPTIMIZATION_CONFIG.writeOptimization;
      const batchSize = Math.min(config.batchSize, this.writeQueue.length);
      const batch = this.writeQueue.splice(0, batchSize);
      
      // Créer des batches Firestore
      const batches = [];
      let currentBatch = db.batch();
      let batchCount = 0;
      
      for (const operation of batch) {
        const { type, collection, docId, data, path } = operation;
        let docRef;
        
        if (collection && docId) {
          docRef = db.collection(collection).doc(docId);
        } else if (path) {
          docRef = db.doc(path);
        }
        
        switch (type) {
          case 'set':
            currentBatch.set(docRef, data);
            break;
          case 'update':
            currentBatch.update(docRef, data);
            break;
          case 'delete':
            currentBatch.delete(docRef);
            break;
          case 'create':
            currentBatch.create(docRef, data);
            break;
        }
        
        batchCount++;
        
        // Limiter la taille du batch
        if (batchCount >= 500) { // Firestore limite à 500 opérations par batch
          batches.push(currentBatch);
          currentBatch = db.batch();
          batchCount = 0;
        }
      }
      
      if (batchCount > 0) {
        batches.push(currentBatch);
      }
      
      // Exécuter tous les batches
      const results = await Promise.all(batches.map(batch => batch.commit()));
      
      this.lastFlush = Date.now();
      
      logger.info('Flush de la file d\'écriture:', {
        operationsWritten: batch.length,
        batchesCreated: batches.length,
        queueSize: this.writeQueue.length,
        totalOperations: batch.length * batches.length
      });
      
      return { flushed: batch.length, batches: batches.length };
      
    } catch (error) {
      logger.error('Erreur lors du flush de la file d\'écriture:', error);
      return { error: error.message };
    }
  }

  // Exécuter des écritures simples (sans optimisation)
  async executeSingleWrites(writeOperations) {
    try {
      const results = [];
      
      for (const operation of writeOperations) {
        const { type, collection, docId, data, path } = operation;
        let docRef;
        
        if (collection && docId) {
          docRef = db.collection(collection).doc(docId);
        } else if (path) {
          docRef = db.doc(path);
        }
        
        let result;
        switch (type) {
          case 'set':
            result = await docRef.set(data);
            break;
          case 'update':
            result = await docRef.update(data);
            break;
          case 'delete':
            result = await docRef.delete();
            break;
          case 'create':
            result = await docRef.create(data);
            break;
        }
        
        results.push({ operation, result });
      }
      
      return results;
      
    } catch (error) {
      logger.error('Erreur lors de l\'exécution des écritures simples:', error);
      return writeOperations.map(op => ({ operation: op, error: error.message }));
    }
  }

  // Détecter les abus
  async detectAbuse(userId, functionName, request) {
    try {
      const config = COST_OPTIMIZATION_CONFIG.abuseDetection;
      
      if (!config.enabled) {
        return { detected: false };
      }
      
      const now = Date.now();
      const abuseKey = `abuse_${userId}`;
      
      // Obtenir ou créer les données d'abus
      if (!this.abuseDetection.has(abuseKey)) {
        this.abuseDetection.set(abuseKey, {
          userId,
          requests: [],
          violations: [],
          blocked: false,
          blockedUntil: null,
          lastReset: now
        });
      }
      
      const abuseData = this.abuseDetection.get(abuseKey);
      
      // Ajouter la requête actuelle
      abuseData.requests.push({
        timestamp: now,
        functionName,
        ip: request.ip,
        userAgent: request.headers['user-agent']
      });
      
      // Nettoyer les anciennes requêtes
      abuseData.requests = abuseData.requests.filter(req => now - req.timestamp < 24 * 60 * 60 * 1000);
      
      // Vérifier les patterns d'abus
      const patterns = config.patterns;
      
      // Pattern 1: Requêtes rapides
      const rapidRequests = abuseData.requests.filter(req => 
        now - req.timestamp < patterns.rapidRequests.timeWindow
      );
      
      if (rapidRequests.length >= patterns.rapidRequests.maxRequests) {
        return await this.handleAbuseViolation(userId, 'rapid_requests', {
          count: rapidRequests.length,
          window: patterns.rapidRequests.timeWindow,
          blockDuration: patterns.rapidRequests.blockDuration
        });
      }
      
      // Pattern 2: Haute fréquence
      const highFrequencyRequests = abuseData.requests.filter(req => 
        now - req.timestamp < patterns.highFrequency.timeWindow
      );
      
      if (highFrequencyRequests.length >= patterns.highFrequency.maxRequests) {
        return await this.handleAbuseViolation(userId, 'high_frequency', {
          count: highFrequencyRequests.length,
          window: patterns.highFrequency.timeWindow,
          blockDuration: patterns.highFrequency.blockDuration
        });
      }
      
      // Pattern 3: Pattern suspect
      if (patterns.suspiciousPattern.unusualEndpoints.includes(functionName)) {
        const endpointRequests = abuseData.requests.filter(req => 
          req.functionName === functionName
        );
        
        const normalThreshold = 5; // 5 appels normaux par heure
        if (endpointRequests.length > normalThreshold * patterns.suspiciousPattern.threshold) {
          return await this.handleAbuseViolation(userId, 'suspicious_pattern', {
            endpoint: functionName,
            count: endpointRequests.length,
            threshold: normalThreshold,
            blockDuration: patterns.suspiciousPattern.blockDuration
          });
        }
      }
      
      return { detected: false };
      
    } catch (error) {
      logger.error('Erreur lors de la détection d\'abus:', error);
      return { detected: false, error: error.message };
    }
  }

  // Gérer une violation d'abus
  async handleAbuseViolation(userId, violationType, details) {
    try {
      const abuseData = this.abuseDetection.get(`abuse_${userId}`);
      const config = COST_OPTIMIZATION_CONFIG.abuseDetection;
      
      // Ajouter la violation
      const violation = {
        type: violationType,
        timestamp: Date.now(),
        details,
        severity: this.getViolationSeverity(violationType)
      };
      
      abuseData.violations.push(violation);
      
      // Vérifier si on doit bloquer
      const recentViolations = abuseData.violations.filter(v => 
        Date.now() - v.timestamp < 24 * 60 * 60 * 1000
      );
      
      if (recentViolations.length >= config.blacklist.maxViolations) {
        // Bloquer l'utilisateur
        abuseData.blocked = true;
        abuseData.blockedUntil = Date.now() + config.blacklist.blockDuration;
        
        // Logger le blocage
        logger.warn(`Utilisateur ${userId} bloqué pour abus:`, {
          violationType,
          violations: recentViolations.length,
          blockedUntil: new Date(abuseData.blockedUntil),
          details
        });
        
        // Créer une alerte
        await this.createAbuseAlert(userId, 'user_blocked', {
          violationType,
          violations: recentViolations,
          blockedUntil: new Date(abuseData.blockedUntil),
          details
        });
      } else {
        // Créer une alerte de warning
        await this.createAbuseAlert(userId, 'abuse_detected', {
          violationType,
          violations: recentViolations.length,
          details
        });
      }
      
      return {
        detected: true,
        violation,
        blocked: abuseData.blocked,
        blockedUntil: abuseData.blockedUntil
      };
      
    } catch (error) {
      logger.error('Erreur lors de la gestion de violation d\'abus:', error);
      return { detected: false, error: error.message };
    }
  }

  // Enregistrer un appel utilisateur
  async recordUserCall(userId, functionName, userTier) {
    try {
      const config = COST_OPTIMIZATION_CONFIG.usageCounter;
      
      if (!config.enabled) {
        return;
      }
      
      const now = Date.now();
      const today = new Date(now).toISOString().split('T')[0]; // YYYY-MM-DD
      
      // Obtenir ou créer le compteur quotidien
      const counterKey = `${userId}_${today}`;
      
      if (!this.usageCounters.has(counterKey)) {
        this.usageCounters.set(counterKey, {
          userId,
          date: today,
          tier: userTier,
          calls: 0,
          functions: new Map(),
          hourlyCalls: new Array(24).fill(0),
          lastUpdated: now
        });
      }
      
      const counter = this.usageCounters.get(counterKey);
      counter.calls++;
      counter.lastUpdated = now;
      
      // Incrémenter le compteur de fonction
      const functionCount = counter.functions.get(functionName) || 0;
      counter.functions.set(functionName, functionCount + 1);
      
      // Incrémenter le compteur horaire
      const hour = new Date(now).getHours();
      counter.hourlyCalls[hour]++;
      
      // Sauvegarder dans Firestore (asynchrone)
      this.saveUsageCounter(counter).catch(error => {
        logger.error('Erreur lors de la sauvegarde du compteur d\'usage:', error);
      });
      
    } catch (error) {
      logger.error('Erreur lors de l\'enregistrement de l\'appel utilisateur:', error);
    }
  }

  // Sauvegarder le compteur d'usage
  async saveUsageCounter(counter) {
    try {
      const docRef = db.collection(COST_OPTIMIZATION_CONFIG.usageCounter.collection)
        .doc(`${counter.userId}_${counter.date}`);
      
      await docRef.set({
        ...counter,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
    } catch (error) {
      logger.error('Erreur lors de la sauvegarde du compteur:', error);
    }
  }

  // Obtenir les statistiques d'usage
  async getUsageStats(userId, period = 'daily') {
    try {
      let query = db.collection(COST_OPTIMIZATION_CONFIG.usageCounter.collection)
        .where('userId', '==', userId);
      
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
      
      query = query.where('date', '>=', startDate.toISOString().split('T')[0]);
      
      const snapshot = await query.orderBy('date', 'desc').limit(30).get();
      
      const stats = snapshot.docs.map(doc => doc.data());
      
      // Agréger les statistiques
      const totalStats = stats.reduce((acc, stat) => {
        acc.totalCalls += stat.calls;
        acc.totalFunctions += stat.functions.size;
        acc.uniqueFunctions = new Set([...acc.uniqueFunctions, ...stat.functions.keys()]);
        acc.hourlyStats = acc.hourlyStats.map((sum, count, i) => sum + stat.hourlyCalls[i]);
        return acc;
      }, {
        totalCalls: 0,
        totalFunctions: 0,
        uniqueFunctions: new Set(),
        hourlyStats: new Array(24).fill(0)
      });
      
      return {
        userId,
        period,
        totalCalls: totalStats.totalCalls,
        totalFunctions: totalStats.totalFunctions,
        uniqueFunctions: Array.from(totalStats.uniqueFunctions),
        hourlyStats: totalStats.hourlyStats,
        averageCallsPerDay: totalStats.totalCalls / stats.length,
        topFunctions: Array.from(totalStats.uniqueFunctions)
          .map(funcName => ({
            name: funcName,
            calls: stats.reduce((sum, stat) => sum + (stat.functions.get(funcName) || 0), 0)
          }))
          .sort((a, b) => b.calls - a.calls)
          .slice(0, 10),
        details: stats
      };
      
    } catch (error) {
      logger.error('Erreur lors de la récupération des statistiques d\'usage:', error);
      return { error: error.message };
    }
  }

  // Utilitaires
  generateCacheKey(operation) {
    const { collection, docId, path } = operation;
    if (collection && docId) {
      return `${collection}_${docId}`;
    } else if (path) {
      return `path_${path}`;
    }
    return `unknown_${Date.now()}`;
  }

  getStartOfDay(date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  getStartOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  getNextResetTime(period) {
    const now = new Date();
    if (period === 'daily') {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      return tomorrow;
    } else if (period === 'monthly') {
      const nextMonth = new Date(now);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      nextMonth.setDate(1);
      nextMonth.setHours(0, 0, 0, 0);
      return nextMonth;
    }
    return now;
  }

  resetUserCountersIfNeeded(userLimitData, now) {
    const lastReset = userLimitData.lastReset;
    const currentDay = this.getStartOfDay(now);
    const currentMonth = this.getStartOfMonth(now);
    
    // Réinitialiser le compteur quotidien
    if (lastReset.daily !== currentDay) {
      userLimitData.dailyCalls = 0;
      userLimitData.lastReset.daily = currentDay;
    }
    
    // Réinitialiser le compteur mensuel
    if (lastReset.monthly !== currentMonth) {
      userLimitData.monthlyCalls = 0;
      userLimitData.lastReset.monthly = currentMonth;
    }
    
    // Réinitialiser le compteur de rafale
    if (now - userLimitData.lastBurstReset > 60000) {
      userLimitData.burstCount = 0;
      userLimitData.lastBurstReset = now;
    }
  }

  getViolationSeverity(violationType) {
    const severityMap = {
      'rapid_requests': 'warning',
      'high_frequency': 'critical',
      'suspicious_pattern': 'critical'
    };
    return severityMap[violationType] || 'warning';
  }

  async createAbuseAlert(userId, type, details) {
    try {
      await db.collection('abuse_alerts').add({
        userId,
        type,
        severity: details.severity || 'warning',
        details,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        environment: process.env.ENVIRONMENT || 'production'
      });
    } catch (error) {
      logger.error('Erreur lors de la création d\'alerte d\'abus:', error);
    }
  }

  // Nettoyer les anciennes données
  cleanup() {
    const now = Date.now();
    
    // Nettoyer toutes les heures
    if (now - this.lastCleanup > 60 * 60 * 1000) {
      this.cleanupReadCache();
      this.cleanupAbuseData();
      this.cleanupUsageCounters();
      this.lastCleanup = now;
    }
  }

  cleanupReadCache() {
    const config = COST_OPTIMIZATION_CONFIG.readOptimization;
    const cutoffTime = Date.now() - config.cacheTTL;
    
    for (const [key, value] of this.readCache.entries()) {
      if (value.timestamp < cutoffTime) {
        this.readCache.delete(key);
      }
    }
    
    // Limiter la taille du cache
    if (this.readCache.size > config.maxCacheSize) {
      const entries = Array.from(this.readCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toDelete = entries.slice(0, this.readCache.size - config.maxCacheSize);
      toDelete.forEach(([key]) => this.readCache.delete(key));
    }
  }

  cleanupAbuseData() {
    const cutoffTime = Date.now() - 24 * 60 * 60 * 1000;
    
    for (const [key, data] of this.abuseDetection.entries()) {
      data.requests = data.requests.filter(req => req.timestamp > cutoffTime);
      data.violations = data.violations.filter(v => v.timestamp > cutoffTime);
      
      // Débloquer si le temps est écoulé
      if (data.blocked && data.blockedUntil && Date.now() > data.blockedUntil) {
        data.blocked = false;
        data.blockedUntil = null;
      }
    }
  }

  cleanupUsageCounters() {
    const cutoffTime = Date.now() - 90 * 24 * 60 * 60 * 1000; // 90 jours
    
    for (const [key, data] of this.usageCounters.entries()) {
      if (new Date(data.date).getTime() < cutoffTime) {
        this.usageCounters.delete(key);
      }
    }
  }
}

// Instance globale du gestionnaire d'optimisation des coûts
const costOptimizationManager = new CostOptimizationManager();

// Exporter les utilitaires
module.exports = {
  CostOptimizationManager,
  costOptimizationManager,
  COST_OPTIMIZATION_CONFIG
};
