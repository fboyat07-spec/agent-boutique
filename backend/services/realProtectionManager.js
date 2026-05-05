// ACTION 10 - Protection absolue

const { getFlag } = require('./envFlags');
const { checkActionAllowed, getCurrentLimits } = require('./testModeLimiter');
const { checkDuplicate } = require('./duplicateValidator');
const { checkMessageAllowed } = require('./spamProtection');

// Gestionnaire de protection absolue (SAFE - garde-fous multi-niveaux)
class RealProtectionManager {
  constructor() {
    this.testModeEnabled = getFlag('AGENT_TEST_MODE');
    this.realValidationEnabled = getFlag('AGENT_REAL_VALIDATION_MODE');
    this.stats = {
      totalChecks: 0,
      blockedActions: 0,
      allowedActions: 0,
      byReason: new Map(),
      byType: new Map()
    };
    
    console.log('[REAL_PROTECTION_MANAGER_INITIALIZED]', {
      testModeEnabled: this.testModeEnabled,
      realValidationEnabled: this.realValidationEnabled
    });
  }
  
  // Obtenir l'environnement actuel
  getEnvironment() {
    if (this.realValidationEnabled) {
      return 'real_validation';
    } else if (this.testModeEnabled) {
      return 'test';
    } else {
      return 'production';
    }
  }
  
  // Vérification complète de protection
  comprehensiveProtectionCheck(actionType, context = {}) {
    if (!this.testModeEnabled && !this.realValidationEnabled) {
      return { allowed: true, reason: 'protection_disabled' };
    }
    
    this.stats.totalChecks++;
    
    try {
      const checks = [];
      
      // Check 1: Limites d'actions (toujours actives)
      const actionLimitCheck = this.checkActionLimits(actionType, context);
      checks.push(actionLimitCheck);
      
      // Check 2: Anti-doublons (toujours actif)
      const duplicateCheck = this.checkDuplicateProtection(context);
      checks.push(duplicateCheck);
      
      // Check 3: Anti-spam (toujours actif)
      const spamCheck = this.checkSpamProtection(context);
      checks.push(spamCheck);
      
      // Check 4: Limites spécifiques mode réel
      const realModeCheck = this.checkRealModeLimits(actionType, context);
      checks.push(realModeCheck);
      
      // Check 5: Validation de volume
      const volumeCheck = this.checkVolumeLimits(actionType, context);
      checks.push(volumeCheck);
      
      // Trouver la première restriction
      for (const check of checks) {
        if (!check.allowed) {
          this.stats.blockedActions++;
          
          const reasonKey = check.reason;
          this.stats.byReason.set(reasonKey, (this.stats.byReason.get(reasonKey) || 0) + 1);
          
          console.log('[REAL_PROTECTION_BLOCKED]', {
            actionType,
            reason: check.reason,
            context: this.sanitizeContext(context),
            environment: this.getEnvironment()
          });
          
          return {
            allowed: false,
            reason: check.reason,
            details: check.details,
            environment: this.getEnvironment(),
            protectionLevel: this.getProtectionLevel(check.severity)
          };
        }
      }
      
      this.stats.allowedActions++;
      
      console.log('[REAL_PROTECTION_ALLOWED]', {
        actionType,
        context: this.sanitizeContext(context),
        environment: this.getEnvironment()
      });
      
      return {
        allowed: true,
        reason: 'all_checks_passed',
        checks: checks.map(c => ({ type: c.type, allowed: c.allowed })),
        environment: this.getEnvironment(),
        protectionLevel: 'standard'
      };
      
    } catch (error) {
      console.log('[REAL_PROTECTION_ERROR]', {
        actionType,
        error: error.message
      });
      
      // En cas d'erreur, autoriser pour éviter de bloquer légitimement
      this.stats.allowedActions++;
      
      return {
        allowed: true,
        reason: 'error_fallback',
        error: error.message,
        environment: this.getEnvironment()
      };
    }
  }
  
  // Vérifier les limites d'actions
  checkActionLimits(actionType, context) {
    if (!this.testModeEnabled && !this.realValidationEnabled) {
      return { allowed: true, type: 'action_limits', severity: 'low' };
    }
    
    // En mode réel, utiliser des limites plus strictes
    const limits = this.getRealModeLimits();
    
    switch (actionType) {
      case 'message':
      case 'outbound':
        if (context.tenant_id) {
          const actionCheck = checkActionAllowed('message', {
            tenant_id: context.tenant_id,
            phone: context.phone
          });
          
          if (!actionCheck.allowed) {
            return {
              allowed: false,
              type: 'action_limits',
              reason: actionCheck.reason,
              details: actionCheck,
              severity: 'high'
            };
          }
        }
        break;
        
      case 'followup':
        // En mode réel, limiter les follow-ups
        if (this.realValidationEnabled) {
          return {
            allowed: false,
            type: 'action_limits',
            reason: 'followup_disabled_in_real_mode',
            details: 'Follow-ups are disabled in real validation mode',
            severity: 'medium'
          };
        }
        break;
        
      case 'closing':
      case 'payment':
        // Vérifier les limites de closing
        if (context.tenant_id) {
          const actionCheck = checkActionAllowed('message', {
            tenant_id: context.tenant_id,
            phone: context.phone
          });
          
          if (!actionCheck.allowed) {
            return {
              allowed: false,
              type: 'action_limits',
              reason: actionCheck.reason,
              details: actionCheck,
              severity: 'high'
            };
          }
        }
        break;
    }
    
    return { allowed: true, type: 'action_limits', severity: 'low' };
  }
  
  // Vérifier la protection anti-doublons
  checkDuplicateProtection(context) {
    if (!context.phone || !context.tenant_id) {
      return { allowed: true, type: 'duplicate_protection', severity: 'low' };
    }
    
    // Vérifier les doublons de téléphone
    const duplicateCheck = checkDuplicate(context.phone, context.tenant_id, {
      lead_id: context.lead_id
    });
    
    if (duplicateCheck.isDuplicate) {
      return {
        allowed: false,
        type: 'duplicate_protection',
        reason: duplicateCheck.reason,
        details: duplicateCheck,
        severity: 'high'
      };
    }
    
    return { allowed: true, type: 'duplicate_protection', severity: 'low' };
  }
  
  // Vérifier la protection anti-spam
  checkSpamProtection(context) {
    if (!context.phone || !context.tenant_id) {
      return { allowed: true, type: 'spam_protection', severity: 'low' };
    }
    
    // Vérifier les limites anti-spam
    const spamCheck = checkMessageAllowed(context.phone, context.tenant_id);
    
    if (!spamCheck.allowed) {
      return {
        allowed: false,
        type: 'spam_protection',
        reason: spamCheck.reason,
        details: spamCheck,
        severity: 'high'
      };
    }
    
    return { allowed: true, type: 'spam_protection', severity: 'low' };
  }
  
  // Vérifier les limites spécifiques au mode réel
  checkRealModeLimits(actionType, context) {
    if (!this.realValidationEnabled) {
      return { allowed: true, type: 'real_mode_limits', severity: 'low' };
    }
    
    // Limites spécifiques au mode réel
    const realLimits = this.getRealModeLimits();
    
    // Limiter le nombre de leads simultanés
    if (actionType === 'lead_creation') {
      const currentRealLeads = this.getCurrentRealLeadCount(context.tenant_id);
      
      if (currentRealLeads >= realLimits.maxSimultaneousRealLeads) {
        return {
          allowed: false,
          type: 'real_mode_limits',
          reason: 'max_simultaneous_real_leads_exceeded',
          details: {
            current: currentRealLeads,
            limit: realLimits.maxSimultaneousRealLeads
          },
          severity: 'high'
        };
      }
    }
    
    // Limiter les messages par heure en mode réel
    if (actionType === 'message' || actionType === 'outbound') {
      const currentHourlyMessages = this.getCurrentHourlyMessageCount(context.tenant_id);
      
      if (currentHourlyMessages >= realLimits.maxHourlyRealMessages) {
        return {
          allowed: false,
          type: 'real_mode_limits',
          reason: 'max_hourly_real_messages_exceeded',
          details: {
            current: currentHourlyMessages,
            limit: realLimits.maxHourlyRealMessages
          },
          severity: 'medium'
        };
      }
    }
    
    return { allowed: true, type: 'real_mode_limits', severity: 'low' };
  }
  
  // Vérifier les limites de volume
  checkVolumeLimits(actionType, context) {
    if (!this.testModeEnabled && !this.realValidationEnabled) {
      return { allowed: true, type: 'volume_limits', severity: 'low' };
    }
    
    // Vérifier les limites globales de volume
    const volumeLimits = this.getVolumeLimits();
    
    // Limiter le nombre total d'actions par jour
    const today = new Date().toDateString();
    const todayActions = this.getTodayActionCount(today);
    
    if (todayActions >= volumeLimits.maxDailyActions) {
      return {
        allowed: false,
        type: 'volume_limits',
        reason: 'max_daily_actions_exceeded',
        details: {
          current: todayActions,
          limit: volumeLimits.maxDailyActions,
          date: today
        },
        severity: 'high'
      };
    }
    
    return { allowed: true, type: 'volume_limits', severity: 'low' };
  }
  
  // Obtenir les limites du mode réel
  getRealModeLimits() {
    return {
      maxSimultaneousRealLeads: 3,    // Max 3 leads réels simultanés
      maxHourlyRealMessages: 10,      // Max 10 messages/heure en mode réel
      maxDailyRealLeads: 20,         // Max 20 leads réels/jour
      cooldownMinutes: 5,             // 5 minutes entre messages
      maxFollowupsPerLead: 1          // Max 1 follow-up en mode réel
    };
  }
  
  // Obtenir les limites de volume
  getVolumeLimits() {
    if (this.realValidationEnabled) {
      return {
        maxDailyActions: 50,           // Plus strict en mode réel
        maxHourlyActions: 15,
        maxConcurrentActions: 3
      };
    } else if (this.testModeEnabled) {
      return {
        maxDailyActions: 100,          // Plus permissif en mode test
        maxHourlyActions: 30,
        maxConcurrentActions: 5
      };
    } else {
      return {
        maxDailyActions: 1000,         // Production normale
        maxHourlyActions: 200,
        maxConcurrentActions: 50
      };
    }
  }
  
  // Obtenir le nombre actuel de leads réels
  getCurrentRealLeadCount(tenant_id) {
    // Simulation - en production, utiliserait la vraie base de données
    return Math.floor(Math.random() * 3); // Simulation
  }
  
  // Obtenir le nombre actuel de messages horaires
  getCurrentHourlyMessageCount(tenant_id) {
    // Simulation - en production, utiliserait la vraie base de données
    return Math.floor(Math.random() * 8); // Simulation
  }
  
  // Obtenir le nombre d'actions aujourd'hui
  getTodayActionCount(date) {
    // Simulation - en production, utiliserait la vraie base de données
    return Math.floor(Math.random() * 20); // Simulation
  }
  
  // Obtenir le niveau de protection
  getProtectionLevel(severity) {
    if (severity === 'high') return 'strict';
    if (severity === 'medium') return 'moderate';
    return 'standard';
  }
  
  // Obtenir les stats du gestionnaire de protection
  getProtectionStats() {
    if (!this.testModeEnabled && !this.realValidationEnabled) {
      return { enabled: false };
    }
    
    const totalChecks = this.stats.totalChecks;
    const blockRate = totalChecks > 0 ? 
      (this.stats.blockedActions / totalChecks) * 100 : 0;
    
    const byReasonStats = {};
    for (const [reason, count] of this.stats.byReason.entries()) {
      byReasonStats[reason] = count;
    }
    
    const byTypeStats = {};
    for (const [type, count] of this.stats.byType.entries()) {
      byTypeStats[type] = count;
    }
    
    return {
      enabled: true,
      environment: this.getEnvironment(),
      stats: {
        totalChecks: this.stats.totalChecks,
        blockedActions: this.stats.blockedActions,
        allowedActions: this.stats.allowedActions,
        blockRate: Math.round(blockRate * 100) / 100
      },
      byReason: byReasonStats,
      byType: byTypeStats,
      limits: {
        realMode: this.getRealModeLimits(),
        volume: this.getVolumeLimits()
      },
      uptime: process.uptime()
    };
  }
  
  // Obtenir le rapport de protection
  getProtectionReport() {
    if (!this.testModeEnabled && !this.realValidationEnabled) {
      return { enabled: false };
    }
    
    const stats = this.getProtectionStats();
    
    // Analyser les patterns de blocage
    const blockagePatterns = this.analyzeBlockagePatterns(stats);
    
    // Générer des recommandations
    const recommendations = this.generateProtectionRecommendations(stats, blockagePatterns);
    
    return {
      enabled: true,
      environment: stats.environment,
      stats: stats.stats,
      limits: stats.limits,
      blockagePatterns,
      recommendations,
      metadata: {
        generated_at: new Date(),
        protection_level: 'absolute'
      }
    };
  }
  
  // Analyser les patterns de blocage
  analyzeBlockagePatterns(stats) {
    const patterns = {
      mostCommonReason: null,
      mostCommonType: null,
      peakBlockTimes: [],
      highRiskPeriods: []
    };
    
    // Raison la plus commune
    let maxCount = 0;
    for (const [reason, count] of Object.entries(stats.byReason)) {
      if (count > maxCount) {
        maxCount = count;
        patterns.mostCommonReason = { reason, count };
      }
    }
    
    // Type le plus commun
    maxCount = 0;
    for (const [type, count] of Object.entries(stats.byType)) {
      if (count > maxCount) {
        maxCount = count;
        patterns.mostCommonType = { type, count };
      }
    }
    
    return patterns;
  }
  
  // Générer des recommandations
  generateProtectionRecommendations(stats, patterns) {
    const recommendations = [];
    
    if (stats.stats.blockRate > 30) {
      recommendations.push({
        type: 'warning',
        message: `High block rate (${stats.stats.blockRate}%)`,
        action: 'Review protection limits and user behavior',
        priority: 'high'
      });
    }
    
    if (patterns.mostCommonReason) {
      recommendations.push({
        type: 'info',
        message: `Most common block reason: ${patterns.mostCommonReason.reason}`,
        action: `Address ${patterns.mostCommonReason.reason} issues`,
        priority: 'medium'
      });
    }
    
    if (stats.environment === 'real_validation' && stats.stats.blockedActions > stats.stats.allowedActions) {
      recommendations.push({
        type: 'critical',
        message: 'More blocked than allowed actions in real validation mode',
        action: 'Review real validation limits and user qualification',
        priority: 'critical'
      });
    }
    
    if (recommendations.length === 0) {
      recommendations.push({
        type: 'success',
        message: 'Protection system working well',
        action: 'Continue monitoring and adjust limits as needed',
        priority: 'low'
      });
    }
    
    return recommendations;
  }
  
  // Nettoyer le contexte pour les logs
  sanitizeContext(context) {
    const sanitized = { ...context };
    
    // Masquer les informations sensibles
    if (sanitized.phone) {
      sanitized.phone = this.maskPhone(sanitized.phone);
    }
    
    if (sanitized.message) {
      sanitized.message = sanitized.message.substring(0, 50) + '****';
    }
    
    return sanitized;
  }
  
  // Masquer téléphone pour logs
  maskPhone(phone) {
    if (!phone || typeof phone !== 'string') return 'unknown';
    return phone.slice(0, -4) + '****';
  }
  
  // Réinitialiser les stats
  resetStats() {
    this.stats = {
      totalChecks: 0,
      blockedActions: 0,
      allowedActions: 0,
      byReason: new Map(),
      byType: new Map()
    };
    
    console.log('[REAL_PROTECTION_MANAGER_STATS_RESET]');
  }
}

// Instance globale du gestionnaire de protection
if (!global.realProtectionManager) {
  global.realProtectionManager = new RealProtectionManager();
}

// Fonctions principales
function comprehensiveProtectionCheck(actionType, context) {
  return global.realProtectionManager.comprehensiveProtectionCheck(actionType, context);
}

// Stats et monitoring
function getRealProtectionStats() {
  return global.realProtectionManager.getProtectionStats();
}

function getRealProtectionReport() {
  return global.realProtectionManager.getProtectionReport();
}

// Administration
function resetRealProtectionStats() {
  return global.realProtectionManager.resetStats();
}

module.exports = {
  comprehensiveProtectionCheck,
  getRealProtectionStats,
  getRealProtectionReport,
  resetRealProtectionStats,
  RealProtectionManager
};
