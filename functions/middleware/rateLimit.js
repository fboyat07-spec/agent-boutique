const { logger } = require("firebase-functions/v2");
const admin = require("firebase-admin");

const db = admin.firestore();

// Configuration du rate limiting
const RATE_LIMIT_CONFIG = {
  // Limites par utilisateur
  addXp: {
    maxCalls: 10,        // max 10 appels addXp par minute
    windowMs: 60 * 1000,  // fenêtre de 1 minute
    maxXPPerMinute: 500,  // max 500 XP par minute
    maxXPPerHour: 2000,  // max 2000 XP par heure
    maxXPPerDay: 5000    // max 5000 XP par jour
  },
  
  completeMission: {
    maxCalls: 5,         // max 5 missions par minute
    windowMs: 60 * 1000,  // fenêtre de 1 minute
    maxMissionsPerHour: 20, // max 20 missions par heure
    maxMissionsPerDay: 50   // max 50 missions par jour
  },
  
  // Limites globales
  global: {
    maxCallsPerSecond: 100,  // max 100 appels par seconde globally
    maxCallsPerMinute: 1000, // max 1000 appels par minute globally
    maxConcurrentUsers: 50   // max 50 utilisateurs concurrents
  }
};

// Cache en mémoire pour le rate limiting
const rateLimitCache = new Map();
const globalStats = {
  callsPerSecond: 0,
  callsPerMinute: 0,
  concurrentUsers: 0,
  lastSecondReset: Date.now(),
  lastMinuteReset: Date.now()
};

// Nettoyer le cache périodiquement
setInterval(() => {
  const now = Date.now();
  const cutoff = now - 5 * 60 * 1000; // Garder 5 minutes d'historique
  
  for (const [key, data] of rateLimitCache.entries()) {
    if (data.timestamp < cutoff) {
      rateLimitCache.delete(key);
    }
  }
}, 60 * 1000); // Nettoyer chaque minute

// Fonction principale de rate limiting
const rateLimit = async (userId, action, request) => {
  const config = RATE_LIMIT_CONFIG[action];
  if (!config) {
    return { allowed: true, reason: null };
  }

  const now = Date.now();
  const userKey = `${userId}_${action}`;
  
  // Initialiser les stats utilisateur
  if (!rateLimitCache.has(userKey)) {
    rateLimitCache.set(userKey, {
      calls: [],
      xpGained: [],
      missionsCompleted: [],
      lastCall: 0,
      suspiciousScore: 0,
      blocked: false,
      blockReason: null,
      blockUntil: 0
    });
  }

  const userStats = rateLimitCache.get(userKey);

  // Vérifier si l'utilisateur est bloqué
  if (userStats.blocked && now < userStats.blockUntil) {
    const remainingTime = Math.ceil((userStats.blockUntil - now) / 1000);
    
    logger.warn("🚫 Utilisateur bloqué", {
      userId,
      action,
      blockReason: userStats.blockReason,
      remainingTime,
      suspiciousScore: userStats.suspiciousScore
    });

    return {
      allowed: false,
      reason: `Utilisateur bloqué: ${userStats.blockReason}. Réessai dans ${remainingTime}s`,
      blockUntil: userStats.blockUntil,
      suspiciousScore: userStats.suspiciousScore
    };
  }

  // Nettoyer les anciennes entrées
  const windowStart = now - config.windowMs;
  userStats.calls = userStats.calls.filter(call => call > windowStart);
  userStats.xpGained = userStats.xpGained.filter(xp => xp.timestamp > windowStart);
  userStats.missionsCompleted = userStats.missionsCompleted.filter(mission => mission.timestamp > windowStart);

  // Vérifier les limites par utilisateur
  if (userStats.calls.length >= config.maxCalls) {
    return handleRateLimitExceeded(userId, action, 'calls_per_window', userStats, {
      actual: userStats.calls.length,
      limit: config.maxCalls,
      window: config.windowMs / 1000
    });
  }

  // Vérifier les limites XP (pour addXp)
  if (action === 'addXp') {
    const xpAmount = request.data?.amount || 0;
    
    // Vérifier XP par minute
    const xpPerMinute = userStats.xpGained.reduce((sum, xp) => sum + xp.amount, 0) + xpAmount;
    if (xpPerMinute > config.maxXPPerMinute) {
      return handleRateLimitExceeded(userId, action, 'xp_per_minute', userStats, {
        actual: xpPerMinute,
        limit: config.maxXPPerMinute
      });
    }

    // Vérifier XP par heure
    const hourStart = now - 60 * 60 * 1000;
    const xpPerHour = userStats.xpGained
      .filter(xp => xp.timestamp > hourStart)
      .reduce((sum, xp) => sum + xp.amount, 0) + xpAmount;
    
    if (xpPerHour > config.maxXPPerHour) {
      return handleRateLimitExceeded(userId, action, 'xp_per_hour', userStats, {
        actual: xpPerHour,
        limit: config.maxXPPerHour
      });
    }

    // Vérifier XP par jour
    const dayStart = now - 24 * 60 * 60 * 1000;
    const xpPerDay = userStats.xpGained
      .filter(xp => xp.timestamp > dayStart)
      .reduce((sum, xp) => sum + xp.amount, 0) + xpAmount;
    
    if (xpPerDay > config.maxXPPerDay) {
      return handleRateLimitExceeded(userId, action, 'xp_per_day', userStats, {
        actual: xpPerDay,
        limit: config.maxXPPerDay
      });
    }
  }

  // Vérifier les limites de missions (pour completeMission)
  if (action === 'completeMission') {
    const hourStart = now - 60 * 60 * 1000;
    const missionsPerHour = userStats.missionsCompleted.filter(m => m.timestamp > hourStart).length + 1;
    
    if (missionsPerHour > config.maxMissionsPerHour) {
      return handleRateLimitExceeded(userId, action, 'missions_per_hour', userStats, {
        actual: missionsPerHour,
        limit: config.maxMissionsPerHour
      });
    }

    const dayStart = now - 24 * 60 * 60 * 1000;
    const missionsPerDay = userStats.missionsCompleted.filter(m => m.timestamp > dayStart).length + 1;
    
    if (missionsPerDay > config.maxMissionsPerDay) {
      return handleRateLimitExceeded(userId, action, 'missions_per_day', userStats, {
        actual: missionsPerDay,
        limit: config.maxMissionsPerDay
      });
    }
  }

  // Vérifier la cohérence des gains XP
  const inconsistency = await checkXPConsistency(userId, request);
  if (inconsistency) {
    return handleSuspiciousActivity(userId, action, 'xp_inconsistency', userStats, inconsistency);
  }

  // Vérifier les comportements suspects
  const suspicious = await checkSuspiciousBehavior(userId, action, request, userStats);
  if (suspicious) {
    return handleSuspiciousActivity(userId, action, 'suspicious_behavior', userStats, suspicious);
  }

  // Mettre à jour les stats utilisateur
  userStats.calls.push(now);
  userStats.lastCall = now;
  
  if (action === 'addXp') {
    userStats.xpGained.push({
      amount: request.data?.amount || 0,
      timestamp: now,
      source: request.data?.source || 'unknown',
      metadata: request.data?.metadata || {}
    });
  }
  
  if (action === 'completeMission') {
    userStats.missionsCompleted.push({
      missionId: request.data?.missionId || 'unknown',
      timestamp: now,
      completionData: request.data?.completionData || {}
    });
  }

  // Mettre à jour les stats globales
  updateGlobalStats();

  return {
    allowed: true,
    reason: null,
    remainingCalls: config.maxCalls - userStats.calls.length,
    suspiciousScore: userStats.suspiciousScore
  };
};

// Gérer le dépassement de limite
const handleRateLimitExceeded = (userId, action, reason, userStats, details) => {
  userStats.suspiciousScore += 10;
  
  // Bloquer temporairement si score élevé
  if (userStats.suspiciousScore >= 50) {
    userStats.blocked = true;
    userStats.blockReason = reason;
    userStats.blockUntil = Date.now() + 15 * 60 * 1000; // 15 minutes
  }

  logger.warn("🚫 Rate limit dépassé", {
    userId,
    action,
    reason,
    details,
    suspiciousScore: userStats.suspiciousScore,
    blocked: userStats.blocked,
    blockUntil: userStats.blockUntil
  });

  // Log de sécurité
  logSecurityEvent(userId, 'rate_limit_exceeded', {
    action,
    reason,
    details,
    suspiciousScore: userStats.suspiciousScore
  });

  return {
    allowed: false,
    reason: `Rate limit dépassé: ${reason}`,
    details,
    suspiciousScore: userStats.suspiciousScore,
    blocked: userStats.blocked,
    blockUntil: userStats.blockUntil
  };
};

// Gérer l'activité suspecte
const handleSuspiciousActivity = (userId, action, reason, userStats, details) => {
  userStats.suspiciousScore += 25;
  
  // Bloquer immédiatement pour activité suspecte
  userStats.blocked = true;
  userStats.blockReason = reason;
  userStats.blockUntil = Date.now() + 60 * 60 * 1000; // 1 heure

  logger.error("🚨 Activité suspecte détectée", {
    userId,
    action,
    reason,
    details,
    suspiciousScore: userStats.suspiciousScore,
    blocked: true,
    blockUntil: userStats.blockUntil
  });

  // Log de sécurité
  logSecurityEvent(userId, 'suspicious_activity', {
    action,
    reason,
    details,
    suspiciousScore: userStats.suspiciousScore,
    severity: 'high'
  });

  return {
    allowed: false,
    reason: `Activité suspecte détectée: ${reason}`,
    details,
    suspiciousScore: userStats.suspiciousScore,
    blocked: true,
    blockUntil: userStats.blockUntil
  };
};

// Vérifier la cohérence des gains XP
const checkXPConsistency = async (userId, request) => {
  const { amount, source, metadata } = request.data || {};
  
  // Vérifier le montant XP
  if (amount <= 0) {
    return { type: 'invalid_amount', amount };
  }

  if (amount > 1000) { // Plus de 1000 XP en une seule fois est suspect
    return { type: 'excessive_amount', amount };
  }

  // Vérifier la source
  const validSources = ['mission_completion', 'bonus', 'streak_bonus', 'level_up', 'manual', 'daily_login'];
  if (!validSources.includes(source)) {
    return { type: 'invalid_source', source };
  }

  // Vérifier les métadonnées pour mission_completion
  if (source === 'mission_completion') {
    if (!metadata?.missionId) {
      return { type: 'missing_mission_id', metadata };
    }

    // Vérifier que la mission existe
    try {
      const missionDoc = await db.collection('missions').doc(metadata.missionId).get();
      if (!missionDoc.exists) {
        return { type: 'mission_not_found', missionId: metadata.missionId };
      }

      const mission = missionDoc.data();
      
      // Vérifier la cohérence du montant XP
      const expectedXP = mission.baseReward || 20;
      const difficultyMultiplier = { easy: 0.8, medium: 1.0, hard: 1.5, expert: 2.0 }[mission.difficulty] || 1.0;
      const maxExpectedXP = Math.floor(expectedXP * difficultyMultiplier * 2); // Marge de 2x
      
      if (amount > maxExpectedXP) {
        return { 
          type: 'xp_mismatch', 
          actual: amount, 
          expected: maxExpectedXP,
          missionId: metadata.missionId 
        };
      }
    } catch (error) {
      logger.error("Erreur vérification mission", { userId, error: error.message });
    }
  }

  return null; // Pas d'incohérence détectée
};

// Vérifier les comportements suspects
const checkSuspiciousBehavior = async (userId, action, request, userStats) => {
  const now = Date.now();
  
  // Vérifier la fréquence anormale
  const recentCalls = userStats.calls.filter(call => now - call < 10 * 1000); // Dernières 10 secondes
  if (recentCalls.length > 5) { // Plus de 5 appels en 10 secondes
    return { 
      type: 'high_frequency', 
      calls: recentCalls.length,
      timeWindow: '10s'
    };
  }

  // Vérifier les patterns répétitifs
  if (userStats.calls.length >= 3) {
    const intervals = [];
    for (let i = 1; i < userStats.calls.length; i++) {
      intervals.push(userStats.calls[i] - userStats.calls[i-1]);
    }
    
    // Si tous les intervalles sont très similaires (pattern de bot)
    const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    const variance = intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length;
    
    if (variance < 100) { // Variance très faible = pattern suspect
      return { 
        type: 'repetitive_pattern', 
        avgInterval,
        variance,
        intervals
      };
    }
  }

  // Vérifier les heures d'activité inhabituelles
  const hour = new Date().getHours();
  if (hour < 6 || hour > 23) { // Activité nocturne suspecte
    // Vérifier si c'est normal pour cet utilisateur
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    if (!userData.nightOwl) { // Si pas marqué comme utilisateur nocturne
      return { 
        type: 'unusual_hours', 
        hour,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      };
    }
  }

  return null; // Pas de comportement suspect détecté
};

// Mettre à jour les stats globales
const updateGlobalStats = () => {
  const now = Date.now();
  
  // Réinitialiser les compteurs de secondes
  if (now - globalStats.lastSecondReset >= 1000) {
    globalStats.callsPerSecond = 0;
    globalStats.lastSecondReset = now;
  }
  
  // Réinitialiser les compteurs de minutes
  if (now - globalStats.lastMinuteReset >= 60 * 1000) {
    globalStats.callsPerMinute = 0;
    globalStats.lastMinuteReset = now;
  }
  
  globalStats.callsPerSecond++;
  globalStats.callsPerMinute++;
};

// Logger les événements de sécurité
const logSecurityEvent = async (userId, eventType, details) => {
  try {
    await db.collection('security_logs').add({
      userId,
      eventType,
      details,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      userAgent: details.userAgent || 'unknown',
      ip: details.ip || 'unknown'
    });

    logger.info("🔒 Événement de sécurité loggé", {
      userId,
      eventType,
      details
    });

  } catch (error) {
    logger.error("Erreur logging sécurité", { userId, eventType, error: error.message });
  }
};

// Obtenir les stats de rate limiting
const getRateLimitStats = () => {
  const stats = {
    global: globalStats,
    users: {},
    totalUsers: rateLimitCache.size
  };

  // Agréger les stats par utilisateur
  for (const [key, data] of rateLimitCache.entries()) {
    const [userId, action] = key.split('_');
    
    if (!stats.users[userId]) {
      stats.users[userId] = {};
    }
    
    stats.users[userId][action] = {
      calls: data.calls.length,
      suspiciousScore: data.suspiciousScore,
      blocked: data.blocked,
      blockReason: data.blockReason,
      blockUntil: data.blockUntil
    };
  }

  return stats;
};

// Réinitialiser les stats d'un utilisateur (admin)
const resetUserRateLimit = async (userId) => {
  const keysToDelete = [];
  
  for (const [key] of rateLimitCache.entries()) {
    if (key.startsWith(userId + '_')) {
      keysToDelete.push(key);
    }
  }
  
  keysToDelete.forEach(key => rateLimitCache.delete(key));
  
  logger.info("🔄 Stats rate limit réinitialisées", { userId, keysDeleted: keysToDelete.length });
  
  return { success: true, keysDeleted: keysToDelete.length };
};

module.exports = {
  rateLimit,
  getRateLimitStats,
  resetUserRateLimit,
  RATE_LIMIT_CONFIG
};
