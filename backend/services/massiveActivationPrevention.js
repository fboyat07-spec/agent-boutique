// ACTION 12 - Aucune activation massive

const { getFlag } = require('./envFlags');
const { comprehensiveProtectionCheck } = require('./realProtectionManager');

// Prévention d'activation massive (SAFE - gardes-fous anti-scaling)
class MassiveActivationPrevention {
  constructor() {
    this.testModeEnabled = getFlag('AGENT_TEST_MODE');
    this.realValidationEnabled = getFlag('AGENT_REAL_VALIDATION_MODE');
    this.stats = {
      totalChecks: 0,
      blockedMassiveActivations: 0,
      allowedActivations: 0,
      byReason: new Map(),
      byType: new Map()
    };
    
    console.log('[MASSIVE_ACTIVATION_PREVENTION_INITIALIZED]', {
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
  
  // Vérification anti-activation massive
  preventMassiveActivation(actionType, context = {}) {
    if (!this.testModeEnabled && !this.realValidationEnabled) {
      return { allowed: true, reason: 'prevention_disabled' };
    }
    
    this.stats.totalChecks++;
    
    try {
      // Check 1: Protection existante (toujours active)
      const existingProtection = comprehensiveProtectionCheck(actionType, context);
      if (!existingProtection.allowed) {
        this.updateStats('blocked', 'existing_protection', actionType);
        return existingProtection;
      }
      
      // Check 2: Limites spécifiques anti-massive
      const massiveActivationCheck = this.checkMassiveActivationLimits(actionType, context);
      if (!massiveActivationCheck.allowed) {
        this.updateStats('blocked', 'massive_activation', actionType);
        return massiveActivationCheck;
      }
      
      // Check 3: Validation de volume
      const volumeCheck = this.checkVolumeActivationLimits(actionType, context);
      if (!volumeCheck.allowed) {
        this.updateStats('blocked', 'volume_limit', actionType);
        return volumeCheck;
      }
      
      // Check 4: Validation de fréquence
      const frequencyCheck = this.checkFrequencyActivationLimits(actionType, context);
      if (!frequencyCheck.allowed) {
        this.updateStats('blocked', 'frequency_limit', actionType);
        return frequencyCheck;
      }
      
      // Check 5: Validation de pattern
      const patternCheck = this.checkActivationPattern(actionType, context);
      if (!patternCheck.allowed) {
        this.updateStats('blocked', 'suspicious_pattern', actionType);
        return patternCheck;
      }
      
      // Si tous les checks passent
      this.updateStats('allowed', 'all_checks_passed', actionType);
      
      console.log('[MASSIVE_ACTIVATION_PREVENTION_ALLOWED]', {
        actionType,
        context: this.sanitizeContext(context),
        environment: this.getEnvironment()
      });
      
      return {
        allowed: true,
        reason: 'all_checks_passed',
        checks: [
          { type: 'existing_protection', passed: true },
          { type: 'massive_activation', passed: true },
          { type: 'volume_limit', passed: true },
          { type: 'frequency_limit', passed: true },
          { type: 'suspicious_pattern', passed: true }
        ],
        environment: this.getEnvironment()
      };
      
    } catch (error) {
      console.log('[MASSIVE_ACTIVATION_PREVENTION_ERROR]', {
        actionType,
        error: error.message
      });
      
      // En cas d'erreur, autoriser mais logger
      this.updateStats('allowed', 'error_fallback', actionType);
      
      return {
        allowed: true,
        reason: 'error_fallback',
        error: error.message,
        environment: this.getEnvironment()
      };
    }
  }
  
  // Vérifier les limites anti-activation massive
  checkMassiveActivationLimits(actionType, context) {
    const limits = this.getMassiveActivationLimits();
    
    switch (actionType) {
      case 'bulk_lead_creation':
        // Limiter la création massive de leads
        const bulkSize = context.bulkSize || 1;
        if (bulkSize > limits.maxBulkLeadSize) {
          return {
            allowed: false,
            type: 'massive_activation',
            reason: 'bulk_lead_creation_too_large',
            details: {
              bulkSize,
              maxAllowed: limits.maxBulkLeadSize
            },
            severity: 'high'
          };
        }
        break;
        
      case 'bulk_message_send':
        // Limiter l'envoi massif de messages
        const messageCount = context.messageCount || 1;
        if (messageCount > limits.maxBulkMessageSize) {
          return {
            allowed: false,
            type: 'massive_activation',
            reason: 'bulk_message_send_too_large',
            details: {
              messageCount,
              maxAllowed: limits.maxBulkMessageSize
            },
            severity: 'high'
          };
        }
        break;
        
      case 'massive_test_scenario':
        // Limiter l'exécution massive de scénarios
        const scenarioCount = context.scenarioCount || 1;
        if (scenarioCount > limits.maxBulkScenarioSize) {
          return {
            allowed: false,
            type: 'massive_activation',
            reason: 'massive_test_scenario_too_large',
            details: {
              scenarioCount,
              maxAllowed: limits.maxBulkScenarioSize
            },
            severity: 'high'
          };
        }
        break;
    }
    
    return {
      allowed: true,
      type: 'massive_activation',
      severity: 'low'
    };
  }
  
  // Vérifier les limites de volume
  checkVolumeActivationLimits(actionType, context) {
    const volumeLimits = this.getVolumeActivationLimits();
    
    // Vérifier le volume total par heure
    const currentHourlyVolume = this.getCurrentHourlyVolume(actionType, context.tenant_id);
    
    if (currentHourlyVolume >= volumeLimits.maxHourlyVolume) {
      return {
        allowed: false,
        type: 'volume_limit',
        reason: 'hourly_volume_exceeded',
        details: {
          currentHourlyVolume,
          maxAllowed: volumeLimits.maxHourlyVolume
        },
        severity: 'high'
      };
    }
    
    // Vérifier le volume total par jour
    const currentDailyVolume = this.getCurrentDailyVolume(actionType, context.tenant_id);
    
    if (currentDailyVolume >= volumeLimits.maxDailyVolume) {
      return {
        allowed: false,
        type: 'volume_limit',
        reason: 'daily_volume_exceeded',
        details: {
          currentDailyVolume,
          maxAllowed: volumeLimits.maxDailyVolume
        },
        severity: 'high'
      };
    }
    
    return {
      allowed: true,
      type: 'volume_limit',
      severity: 'low'
    };
  }
  
  // Vérifier les limites de fréquence
  checkFrequencyActivationLimits(actionType, context) {
    const frequencyLimits = this.getFrequencyActivationLimits();
    
    // Vérifier la fréquence des actions
    const recentActions = this.getRecentActions(actionType, context.tenant_id, frequencyLimits.timeWindow);
    
    if (recentActions.length >= frequencyLimits.maxActionsInWindow) {
      return {
        allowed: false,
        type: 'frequency_limit',
        reason: 'too_many_actions_in_window',
        details: {
          recentActions: recentActions.length,
          maxAllowed: frequencyLimits.maxActionsInWindow,
          timeWindow: frequencyLimits.timeWindow
        },
        severity: 'medium'
      };
    }
    
    // Vérifier l'intervalle minimum entre actions
    const lastActionTime = this.getLastActionTime(actionType, context.tenant_id);
    
    if (lastActionTime) {
      const timeSinceLastAction = Date.now() - lastActionTime;
      const minInterval = frequencyLimits.minIntervalBetweenActions;
      
      if (timeSinceLastAction < minInterval) {
        return {
          allowed: false,
          type: 'frequency_limit',
          reason: 'minimum_interval_not_respected',
          details: {
            timeSinceLastAction,
            minRequired: minInterval,
            waitTime: minInterval - timeSinceLastAction
          },
          severity: 'medium'
        };
      }
    }
    
    return {
      allowed: true,
      type: 'frequency_limit',
      severity: 'low'
    };
  }
  
  // Vérifier les patterns d'activation suspects
  checkActivationPattern(actionType, context) {
    const patterns = this.getActivationPatterns();
    
    // Pattern 1: Activations répétitives identiques
    const repetitivePattern = this.checkRepetitivePattern(actionType, context);
    if (repetitivePattern.isSuspicious) {
      return {
        allowed: false,
        type: 'suspicious_pattern',
        reason: 'repetitive_activation_pattern',
        details: repetitivePattern,
        severity: 'high'
      };
    }
    
    // Pattern 2: Activations en rafale (burst)
    const burstPattern = this.checkBurstPattern(actionType, context);
    if (burstPattern.isSuspicious) {
      return {
        allowed: false,
        type: 'suspicious_pattern',
        reason: 'burst_activation_pattern',
        details: burstPattern,
        severity: 'high'
      };
    }
    
    // Pattern 3: Activations anormales (horaires inhabituels)
    const anomalyPattern = this.checkAnomalyPattern(actionType, context);
    if (anomalyPattern.isSuspicious) {
      return {
        allowed: false,
        type: 'suspicious_pattern',
        reason: 'anomalous_activation_pattern',
        details: anomalyPattern,
        severity: 'medium'
      };
    }
    
    return {
      allowed: true,
      type: 'suspicious_pattern',
      severity: 'low'
    };
  }
  
  // Obtenir les limites anti-activation massive
  getMassiveActivationLimits() {
    if (this.realValidationEnabled) {
      return {
        maxBulkLeadSize: 1,           // 1 lead à la fois en mode réel
        maxBulkMessageSize: 1,        // 1 message à la fois en mode réel
        maxBulkScenarioSize: 1,        // 1 scénario à la fois en mode réel
        maxConcurrentBulks: 1          // 1 bulk à la fois
      };
    } else if (this.testModeEnabled) {
      return {
        maxBulkLeadSize: 3,           // 3 leads max en mode test
        maxBulkMessageSize: 5,        // 5 messages max en mode test
        maxBulkScenarioSize: 2,        // 2 scénarios max en mode test
        maxConcurrentBulks: 2          // 2 bulks max en mode test
      };
    } else {
      return {
        maxBulkLeadSize: 10,          // Production normale
        maxBulkMessageSize: 20,
        maxBulkScenarioSize: 5,
        maxConcurrentBulks: 5
      };
    }
  }
  
  // Obtenir les limites de volume
  getVolumeActivationLimits() {
    if (this.realValidationEnabled) {
      return {
        maxHourlyVolume: 5,           // 5 actions/heure en mode réel
        maxDailyVolume: 20,            // 20 actions/jour en mode réel
        maxWeeklyVolume: 50            // 50 actions/semaine en mode réel
      };
    } else if (this.testModeEnabled) {
      return {
        maxHourlyVolume: 15,          // 15 actions/heure en mode test
        maxDailyVolume: 50,            // 50 actions/jour en mode test
        maxWeeklyVolume: 200           // 200 actions/semaine en mode test
      };
    } else {
      return {
        maxHourlyVolume: 100,         // Production normale
        maxDailyVolume: 1000,
        maxWeeklyVolume: 5000
      };
    }
  }
  
  // Obtenir les limites de fréquence
  getFrequencyActivationLimits() {
    if (this.realValidationEnabled) {
      return {
        maxActionsInWindow: 2,         // 2 actions dans la fenêtre
        timeWindow: 5 * 60 * 1000,   // 5 minutes
        minIntervalBetweenActions: 30 * 1000 // 30 secondes
      };
    } else if (this.testModeEnabled) {
      return {
        maxActionsInWindow: 5,         // 5 actions dans la fenêtre
        timeWindow: 2 * 60 * 1000,   // 2 minutes
        minIntervalBetweenActions: 10 * 1000 // 10 secondes
      };
    } else {
      return {
        maxActionsInWindow: 20,        // Production normale
        timeWindow: 1 * 60 * 1000,   // 1 minute
        minIntervalBetweenActions: 1 * 1000 // 1 seconde
      };
    }
  }
  
  // Vérifier les patterns répétitifs
  checkRepetitivePattern(actionType, context) {
    const recentActions = this.getRecentActions(actionType, context.tenant_id, 10 * 60 * 1000); // 10 minutes
    
    // Compter les actions identiques
    const identicalActions = recentActions.filter(action => 
      action.type === actionType && 
      action.context?.bulkSize === context.bulkSize
    );
    
    const isSuspicious = identicalActions.length >= 3;
    
    return {
      isSuspicious,
      identicalActions: identicalActions.length,
      threshold: 3,
      timeWindow: '10 minutes'
    };
  }
  
  // Vérifier les patterns de rafale
  checkBurstPattern(actionType, context) {
    const recentActions = this.getRecentActions(actionType, context.tenant_id, 1 * 60 * 1000); // 1 minute
    
    const isSuspicious = recentActions.length >= 5;
    
    return {
      isSuspicious,
      actionsInMinute: recentActions.length,
      threshold: 5,
      timeWindow: '1 minute'
    };
  }
  
  // Vérifier les patterns anormaux
  checkAnomalyPattern(actionType, context) {
    const currentHour = new Date().getHours();
    
    // Heures inhabituelles (ex: 2h-5h du matin)
    const unusualHours = [0, 1, 2, 3, 4, 5];
    const isUnusualHour = unusualHours.includes(currentHour);
    
    // Vérifier s'il y a des activités inhabituelles
    const unusualHourActions = this.getActionsInHour(actionType, context.tenant_id, currentHour);
    
    const isSuspicious = isUnusualHour && unusualHourActions.length > 0;
    
    return {
      isSuspicious,
      currentHour,
      isUnusualHour,
      actionsInUnusualHour: unusualHourActions.length,
      unusualHours
    };
  }
  
  // Obtenir le volume horaire actuel
  getCurrentHourlyVolume(actionType, tenant_id) {
    // Simulation - en production, utiliserait la vraie base de données
    return Math.floor(Math.random() * 3); // Simulation
  }
  
  // Obtenir le volume journalier actuel
  getCurrentDailyVolume(actionType, tenant_id) {
    // Simulation - en production, utiliserait la vraie base de données
    return Math.floor(Math.random() * 10); // Simulation
  }
  
  // Obtenir les actions récentes
  getRecentActions(actionType, tenant_id, timeWindow) {
    // Simulation - en production, utiliserait la vraie base de données
    return [];
  }
  
  // Obtenir le temps de la dernière action
  getLastActionTime(actionType, tenant_id) {
    // Simulation - en production, utiliserait la vraie base de données
    return Date.now() - (Math.random() * 60 * 1000); // Simulation
  }
  
  // Obtenir les actions dans une heure spécifique
  getActionsInHour(actionType, tenant_id, hour) {
    // Simulation - en production, utiliserait la vraie base de données
    return [];
  }
  
  // Mettre à jour les statistiques
  updateStats(result, reason, actionType) {
    if (result === 'blocked') {
      this.stats.blockedMassiveActivations++;
    } else {
      this.stats.allowedActivations++;
    }
    
    this.stats.byReason.set(reason, (this.stats.byReason.get(reason) || 0) + 1);
    this.stats.byType.set(actionType, (this.stats.byType.get(actionType) || 0) + 1);
  }
  
  // Obtenir les statistiques de prévention
  getPreventionStats() {
    if (!this.testModeEnabled && !this.realValidationEnabled) {
      return { enabled: false };
    }
    
    const totalChecks = this.stats.totalChecks;
    const blockRate = totalChecks > 0 ? 
      (this.stats.blockedMassiveActivations / totalChecks) * 100 : 0;
    
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
        blockedMassiveActivations: this.stats.blockedMassiveActivations,
        allowedActivations: this.stats.allowedActivations,
        blockRate: Math.round(blockRate * 100) / 100
      },
      byReason: byReasonStats,
      byType: byTypeStats,
      limits: {
        massiveActivation: this.getMassiveActivationLimits(),
        volume: this.getVolumeActivationLimits(),
        frequency: this.getFrequencyActivationLimits()
      },
      uptime: process.uptime()
    };
  }
  
  // Obtenir le rapport de prévention
  getPreventionReport() {
    if (!this.testModeEnabled && !this.realValidationEnabled) {
      return { enabled: false };
    }
    
    const stats = this.getPreventionStats();
    
    // Analyser les patterns de blocage
    const patterns = this.analyzeBlockingPatterns(stats);
    
    // Générer des recommandations
    const recommendations = this.generatePreventionRecommendations(stats, patterns);
    
    return {
      enabled: true,
      environment: stats.environment,
      stats: stats.stats,
      limits: stats.limits,
      patterns,
      recommendations,
      metadata: {
        generated_at: new Date(),
        prevention_type: 'massive_activation'
      }
    };
  }
  
  // Analyser les patterns de blocage
  analyzeBlockingPatterns(stats) {
    const patterns = {
      mostBlockedReason: null,
      mostBlockedType: null,
      peakBlockingTimes: [],
      effectivenessScore: 0
    };
    
    // Raison la plus commune
    let maxCount = 0;
    for (const [reason, count] of Object.entries(stats.byReason)) {
      if (count > maxCount) {
        maxCount = count;
        patterns.mostBlockedReason = { reason, count };
      }
    }
    
    // Type le plus commun
    maxCount = 0;
    for (const [type, count] of Object.entries(stats.byType)) {
      if (count > maxCount) {
        maxCount = count;
        patterns.mostBlockedType = { type, count };
      }
    }
    
    // Score d'efficacité
    if (stats.stats.totalChecks > 0) {
      patterns.effectivenessScore = Math.round((stats.stats.blockedMassiveActivations / stats.stats.totalChecks) * 100);
    }
    
    return patterns;
  }
  
  // Générer des recommandations
  generatePreventionRecommendations(stats, patterns) {
    const recommendations = [];
    
    if (stats.stats.blockRate > 20) {
      recommendations.push({
        type: 'warning',
        message: `High block rate (${stats.stats.blockRate}%)`,
        action: 'Review activation patterns and adjust limits',
        priority: 'medium'
      });
    }
    
    if (patterns.mostBlockedReason) {
      recommendations.push({
        type: 'info',
        message: `Most common block reason: ${patterns.mostBlockedReason.reason}`,
        action: `Address ${patterns.mostBlockedReason.reason} issues`,
        priority: 'low'
      });
    }
    
    if (patterns.effectivenessScore > 80) {
      recommendations.push({
        type: 'success',
        message: 'Prevention system working effectively',
        action: 'Continue monitoring and maintain current configuration',
        priority: 'low'
      });
    }
    
    if (recommendations.length === 0) {
      recommendations.push({
        type: 'info',
        message: 'Prevention system operating normally',
        action: 'Continue monitoring for suspicious patterns',
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
      blockedMassiveActivations: 0,
      allowedActivations: 0,
      byReason: new Map(),
      byType: new Map()
    };
    
    console.log('[MASSIVE_ACTIVATION_PREVENTION_STATS_RESET]');
  }
}

// Instance globale du préventeur
if (!global.massiveActivationPrevention) {
  global.massiveActivationPrevention = new MassiveActivationPrevention();
}

// Fonctions principales
function preventMassiveActivation(actionType, context) {
  return global.massiveActivationPrevention.preventMassiveActivation(actionType, context);
}

// Stats et monitoring
function getMassiveActivationPreventionStats() {
  return global.massiveActivationPrevention.getPreventionStats();
}

function getMassiveActivationPreventionReport() {
  return global.massiveActivationPrevention.getPreventionReport();
}

// Administration
function resetMassiveActivationPreventionStats() {
  return global.massiveActivationPrevention.resetStats();
}

module.exports = {
  preventMassiveActivation,
  getMassiveActivationPreventionStats,
  getMassiveActivationPreventionReport,
  resetMassiveActivationPreventionStats,
  MassiveActivationPrevention
};
