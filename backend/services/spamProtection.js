// ACTION 10 - Protection anti-spam

const BusinessLogger = require('./businessLogger');
const { trackEvent } = require('./eventTracker');

// Protection anti-spam (SAFE - monitoring et blocage)
class SpamProtection {
  constructor() {
    this.enabled = process.env.SPAM_PROTECTION_ENABLED === 'true';
    this.limits = {
      maxMessagesPerLeadPerDay: 5,      // Max 5 messages/lead/jour
      maxFollowupsPerLeadPerDay: 3,     // Max 3 relances/lead/jour
      maxOutboundPerHour: 100,          // Max 100 outbound/heure
      maxTotalMessagesPerDay: 1000,     // Max 1000 messages/jour
      cooldownBetweenMessages: 300       // 5 minutes entre messages
    };
    this.stats = {
      totalChecks: 0,
      blockedMessages: 0,
      allowedMessages: 0,
      spamDetected: 0,
      byReason: new Map()
    };
    
    // Tracking en mémoire
    this.leadTracking = new Map(); // phone -> { messages, lastMessage, followups }
    this.globalTracking = {
      hourlyOutbound: [],
      dailyMessages: 0,
      lastReset: new Date()
    };
    
    console.log('[SPAM_PROTECTION_INITIALIZED]', {
      enabled: this.enabled,
      limits: this.limits
    });
    
    // Cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Toutes les minutes
  }
  
  // Vérifier si un message est autorisé
  checkMessageAllowed(phone, messageType = 'outbound', tenant_id = null) {
    if (!this.enabled) {
      return { allowed: true, reason: 'spam_protection_disabled' };
    }
    
    this.stats.totalChecks++;
    
    try {
      // Reset daily si nécessaire
      this.resetDailyIfNeeded();
      
      // Vérifier les différentes limites
      const checks = [
        this.checkLeadLimits(phone, messageType),
        this.checkGlobalLimits(messageType),
        this.checkCooldown(phone),
        this.checkHourlyLimits(messageType)
      ];
      
      // Trouver la première restriction
      for (const check of checks) {
        if (!check.allowed) {
          this.stats.blockedMessages++;
          this.stats.spamDetected++;
          
          const reasonKey = check.reason;
          this.stats.byReason.set(reasonKey, (this.stats.byReason.get(reasonKey) || 0) + 1);
          
          console.log('[SPAM_PROTECTION_BLOCKED]', {
            phone: this.maskPhone(phone),
            messageType,
            reason: check.reason,
            tenant_id
          });
          
          // Tracker l'événement
          trackEvent('spam_message_blocked', {
            phone: this.maskPhone(phone),
            messageType,
            reason: check.reason,
            tenant_id
          });
          
          BusinessLogger.logWithContext('warning', 'spam_blocked', tenant_id, phone, {
            reason: check.reason,
            messageType
          });
          
          return check;
        }
      }
      
      // Message autorisé - mettre à jour le tracking
      this.updateTracking(phone, messageType);
      
      this.stats.allowedMessages++;
      
      console.log('[SPAM_PROTECTION_ALLOWED]', {
        phone: this.maskPhone(phone),
        messageType,
        tenant_id
      });
      
      return { allowed: true };
      
    } catch (error) {
      console.log('[SPAM_PROTECTION_ERROR]', {
        phone: this.maskPhone(phone),
        error: error.message
      });
      
      // En cas d'erreur, autoriser pour éviter de bloquer légitimement
      this.stats.allowedMessages++;
      return { allowed: true, reason: 'error_fallback' };
    }
  }
  
  // Vérifier les limites par lead
  checkLeadLimits(phone, messageType) {
    const leadKey = phone;
    const tracking = this.leadTracking.get(leadKey) || {
      messages: [],
      followups: [],
      lastMessage: null
    };
    
    const today = new Date().toDateString();
    const todayMessages = tracking.messages.filter(m => 
      new Date(m.timestamp).toDateString() === today
    );
    
    const todayFollowups = tracking.followups.filter(f => 
      new Date(f.timestamp).toDateString() === today
    );
    
    // Vérifier limite messages/jour
    if (todayMessages.length >= this.limits.maxMessagesPerLeadPerDay) {
      return {
        allowed: false,
        reason: 'daily_lead_limit_exceeded',
        details: {
          current: todayMessages.length,
          limit: this.limits.maxMessagesPerLeadPerDay
        }
      };
    }
    
    // Vérifier limite relances/jour
    if (messageType === 'followup' && todayFollowups.length >= this.limits.maxFollowupsPerLeadPerDay) {
      return {
        allowed: false,
        reason: 'daily_followup_limit_exceeded',
        details: {
          current: todayFollowups.length,
          limit: this.limits.maxFollowupsPerLeadPerDay
        }
      };
    }
    
    return { allowed: true };
  }
  
  // Vérifier les limites globales
  checkGlobalLimits(messageType) {
    // Vérifier limite globale journalière
    if (this.globalTracking.dailyMessages >= this.limits.maxTotalMessagesPerDay) {
      return {
        allowed: false,
        reason: 'daily_global_limit_exceeded',
        details: {
          current: this.globalTracking.dailyMessages,
          limit: this.limits.maxTotalMessagesPerDay
        }
      };
    }
    
    return { allowed: true };
  }
  
  // Vérifier le cooldown entre messages
  checkCooldown(phone) {
    const tracking = this.leadTracking.get(phone);
    
    if (!tracking || !tracking.lastMessage) {
      return { allowed: true };
    }
    
    const timeSinceLastMessage = Date.now() - tracking.lastMessage;
    const cooldownMs = this.limits.cooldownBetweenMessages * 1000;
    
    if (timeSinceLastMessage < cooldownMs) {
      const remainingCooldown = Math.ceil((cooldownMs - timeSinceLastMessage) / 1000);
      
      return {
        allowed: false,
        reason: 'cooldown_not_respected',
        details: {
          remainingCooldown,
          cooldownPeriod: this.limits.cooldownBetweenMessages
        }
      };
    }
    
    return { allowed: true };
  }
  
  // Vérifier les limites horaires
  checkHourlyLimits(messageType) {
    if (messageType !== 'outbound') {
      return { allowed: true };
    }
    
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    
    // Nettoyer les vieux enregistrements
    this.globalTracking.hourlyOutbound = this.globalTracking.hourlyOutbound.filter(
      timestamp => timestamp > oneHourAgo
    );
    
    // Vérifier limite outbound/heure
    if (this.globalTracking.hourlyOutbound.length >= this.limits.maxOutboundPerHour) {
      return {
        allowed: false,
        reason: 'hourly_outbound_limit_exceeded',
        details: {
          current: this.globalTracking.hourlyOutbound.length,
          limit: this.limits.maxOutboundPerHour
        }
      };
    }
    
    return { allowed: true };
  }
  
  // Mettre à jour le tracking
  updateTracking(phone, messageType) {
    const now = Date.now();
    
    // Mettre à jour tracking par lead
    const leadKey = phone;
    const tracking = this.leadTracking.get(leadKey) || {
      messages: [],
      followups: [],
      lastMessage: null
    };
    
    tracking.messages.push({ timestamp: now, type: messageType });
    tracking.lastMessage = now;
    
    if (messageType === 'followup') {
      tracking.followups.push({ timestamp: now });
    }
    
    this.leadTracking.set(leadKey, tracking);
    
    // Mettre à jour tracking global
    this.globalTracking.dailyMessages++;
    
    if (messageType === 'outbound') {
      this.globalTracking.hourlyOutbound.push(now);
    }
  }
  
  // Réinitialiser les compteurs journaliers
  resetDailyIfNeeded() {
    const today = new Date().toDateString();
    const lastReset = this.globalTracking.lastReset.toDateString();
    
    if (today !== lastReset) {
      console.log('[SPAM_PROTECTION_DAILY_RESET]', {
        previousDay: lastReset,
        newDay: today,
        messagesYesterday: this.globalTracking.dailyMessages
      });
      
      // Réinitialiser
      this.globalTracking.dailyMessages = 0;
      this.globalTracking.lastReset = new Date();
      
      // Nettoyer tracking par lead (garder seulement aujourd'hui)
      for (const [phone, tracking] of this.leadTracking.entries()) {
        tracking.messages = tracking.messages.filter(m => 
          new Date(m.timestamp).toDateString() === today
        );
        tracking.followups = tracking.followups.filter(f => 
          new Date(f.timestamp).toDateString() === today
        );
      }
    }
  }
  
  // Nettoyer les anciennes données
  cleanup() {
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    
    // Nettoyer tracking par lead
    let cleanedLeads = 0;
    
    for (const [phone, tracking] of this.leadTracking.entries()) {
      const originalMessages = tracking.messages.length;
      
      tracking.messages = tracking.messages.filter(m => m.timestamp > oneDayAgo);
      tracking.followups = tracking.followups.filter(f => f.timestamp > oneDayAgo);
      
      // Supprimer si aucune activité récente
      if (tracking.messages.length === 0) {
        this.leadTracking.delete(phone);
        cleanedLeads++;
      }
    }
    
    // Nettoyer tracking horaire global
    const oneHourAgo = now - (60 * 60 * 1000);
    const originalHourly = this.globalTracking.hourlyOutbound.length;
    
    this.globalTracking.hourlyOutbound = this.globalTracking.hourlyOutbound.filter(
      timestamp => timestamp > oneHourAgo
    );
    
    if (cleanedLeads > 0 || originalHourly !== this.globalTracking.hourlyOutbound.length) {
      console.log('[SPAM_PROTECTION_CLEANUP]', {
        cleanedLeads,
        hourlyCleaned: originalHourly - this.globalTracking.hourlyOutbound.length,
        activeLeads: this.leadTracking.size
      });
    }
  }
  
  // Obtenir les stats de protection
  getProtectionStats() {
    const blockRate = this.stats.totalChecks > 0 ? 
      (this.stats.blockedMessages / this.stats.totalChecks) * 100 : 0;
    
    const byReasonStats = {};
    for (const [reason, count] of this.stats.byReason.entries()) {
      byReasonStats[reason] = count;
    }
    
    return {
      enabled: this.enabled,
      limits: this.limits,
      stats: {
        totalChecks: this.stats.totalChecks,
        blockedMessages: this.stats.blockedMessages,
        allowedMessages: this.stats.allowedMessages,
        spamDetected: this.stats.spamDetected,
        blockRate: Math.round(blockRate * 100) / 100
      },
      tracking: {
        activeLeads: this.leadTracking.size,
        dailyMessages: this.globalTracking.dailyMessages,
        hourlyOutbound: this.globalTracking.hourlyOutbound.length,
        lastReset: this.globalTracking.lastReset
      },
      byReason: byReasonStats,
      uptime: process.uptime()
    };
  }
  
  // Obtenir le statut d'un lead spécifique
  getLeadStatus(phone) {
    const tracking = this.leadTracking.get(phone);
    
    if (!tracking) {
      return {
        phone: this.maskPhone(phone),
        status: 'not_tracked',
        messages: 0,
        followups: 0,
        lastMessage: null
      };
    }
    
    const today = new Date().toDateString();
    const todayMessages = tracking.messages.filter(m => 
      new Date(m.timestamp).toDateString() === today
    );
    
    const todayFollowups = tracking.followups.filter(f => 
      new Date(f.timestamp).toDateString() === today
    );
    
    return {
      phone: this.maskPhone(phone),
      status: 'tracked',
      messages: {
        total: tracking.messages.length,
        today: todayMessages.length,
        limit: this.limits.maxMessagesPerLeadPerDay
      },
      followups: {
        total: tracking.followups.length,
        today: todayFollowups.length,
        limit: this.limits.maxFollowupsPerLeadPerDay
      },
      lastMessage: tracking.lastMessage ? new Date(tracking.lastMessage) : null,
      canMessage: this.canSendMessage(phone)
    };
  }
  
  // Vérifier si un lead peut encore envoyer des messages
  canSendMessage(phone) {
    const check = this.checkMessageAllowed(phone, 'outbound');
    return check.allowed;
  }
  
  // Réinitialiser le tracking d'un lead
  resetLeadTracking(phone) {
    this.leadTracking.delete(phone);
    
    console.log('[SPAM_PROTECTION_LEAD_RESET]', {
      phone: this.maskPhone(phone)
    });
    
    return true;
  }
  
  // Health check
  healthCheck() {
    const stats = this.getProtectionStats();
    
    const health = {
      status: 'healthy',
      enabled: stats.enabled,
      issues: [],
      recommendations: []
    };
    
    // Vérifier taux de blocage
    if (stats.stats.blockRate > 20) {
      health.issues.push('High block rate - possible over-protection');
      health.recommendations.push('Review spam protection limits');
    }
    
    // Vérifier nombre de leads actifs
    if (stats.tracking.activeLeads > 10000) {
      health.issues.push('High memory usage - too many tracked leads');
      health.recommendations.push('Consider reducing tracking retention');
    }
    
    // Vérifier si les limites sont trop basses
    if (stats.stats.blockRate > 50 && stats.stats.totalChecks > 100) {
      health.issues.push('Very high block rate - limits may be too restrictive');
      health.recommendations.push('Adjust limits to allow legitimate messages');
    }
    
    if (health.issues.length > 0) {
      health.status = 'warning';
    }
    
    return {
      ...health,
      stats: {
        enabled: stats.enabled,
        blockRate: stats.stats.blockRate,
        activeLeads: stats.tracking.activeLeads,
        dailyMessages: stats.tracking.dailyMessages
      }
    };
  }
  
  // Réinitialiser stats
  resetStats() {
    this.stats = {
      totalChecks: 0,
      blockedMessages: 0,
      allowedMessages: 0,
      spamDetected: 0,
      byReason: new Map()
    };
    
    console.log('[SPAM_PROTECTION_STATS_RESET]');
  }
  
  // Détruire
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.leadTracking.clear();
    this.globalTracking = {
      hourlyOutbound: [],
      dailyMessages: 0,
      lastReset: new Date()
    };
    
    console.log('[SPAM_PROTECTION_DESTROYED]');
  }
  
  // Masquer téléphone pour logs
  maskPhone(phone) {
    if (!phone || typeof phone !== 'string') return 'unknown';
    return phone.slice(0, -4) + '****';
  }
}

// Instance globale de la protection anti-spam
if (!global.spamProtection) {
  global.spamProtection = new SpamProtection();
}

// Fonctions principales
function checkMessageAllowed(phone, messageType, tenant_id) {
  return global.spamProtection.checkMessageAllowed(phone, messageType, tenant_id);
}

function getLeadStatus(phone) {
  return global.spamProtection.getLeadStatus(phone);
}

function canSendMessage(phone) {
  return global.spamProtection.canSendMessage(phone);
}

// Stats et monitoring
function getProtectionStats() {
  return global.spamProtection.getProtectionStats();
}

function spamProtectionHealthCheck() {
  return global.spamProtection.healthCheck();
}

// Administration
function resetLeadTracking(phone) {
  return global.spamProtection.resetLeadTracking(phone);
}

function resetSpamStats() {
  return global.spamProtection.resetStats();
}

module.exports = {
  checkMessageAllowed,
  getLeadStatus,
  canSendMessage,
  getProtectionStats,
  spamProtectionHealthCheck,
  resetLeadTracking,
  resetSpamStats,
  SpamProtection
};
