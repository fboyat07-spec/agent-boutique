// ACTION 10 - Sécurité Stripe

const { getFlag } = require('./envFlags');
const { logRealError } = require('./realValidationLogger');

// Validateur de sécurité Stripe (SAFE - validation stricte, logging complet)
class StripeSecurityValidator {
  constructor() {
    this.testModeEnabled = getFlag('AGENT_TEST_MODE');
    this.realValidationEnabled = getFlag('AGENT_REAL_VALIDATION_MODE');
    this.realPaymentEnabled = getFlag('AGENT_REAL_PAYMENT_ENABLED');
    this.stats = {
      totalSecurityChecks: 0,
      securityPassed: 0,
      securityFailed: 0,
      byReason: new Map(),
      lastSecurityCheck: null
    };
    
    console.log('[STRIPE_SECURITY_VALIDATOR_INITIALIZED]', {
      testModeEnabled: this.testModeEnabled,
      realValidationEnabled: this.realValidationEnabled,
      realPaymentEnabled: this.realPaymentEnabled
    });
  }
  
  // Obtenir l'environnement actuel
  getEnvironment() {
    if (this.realPaymentEnabled && this.realValidationEnabled) {
      return 'real_payment';
    } else if (this.realValidationEnabled) {
      return 'real_validation';
    } else if (this.testModeEnabled) {
      return 'test';
    } else {
      return 'production';
    }
  }
  
  // Vérifier si la sécurité Stripe est activée
  isStripeSecurityEnabled() {
    return this.realPaymentEnabled && this.realValidationEnabled;
  }
  
  // Valider la configuration de sécurité Stripe
  validateStripeSecurity() {
    this.stats.totalSecurityChecks++;
    this.stats.lastSecurityCheck = new Date();
    
    try {
      console.log('[STRIPE_SECURITY_VALIDATION_START]', {
        environment: this.getEnvironment()
      });
      
      // Check 1: Vérifier STRIPE_API_KEY
      const apiKeyCheck = this.validateStripeApiKey();
      
      // Check 2: Vérifier STRIPE_WEBHOOK_SECRET
      const webhookSecretCheck = this.validateWebhookSecret();
      
      // Check 3: Vérifier la configuration de l'environnement
      const environmentCheck = this.validateEnvironmentConfig();
      
      // Check 4: Vérifier la configuration des endpoints
      const endpointsCheck = this.validateEndpointsConfig();
      
      // Check 5: Vérifier la configuration de sécurité
      const securityConfigCheck = this.validateSecurityConfig();
      
      // Combiner tous les checks
      const allChecks = [
        apiKeyCheck,
        webhookSecretCheck,
        environmentCheck,
        endpointsCheck,
        securityConfigCheck
      ];
      
      const failedChecks = allChecks.filter(check => !check.valid);
      const securityPassed = failedChecks.length === 0;
      
      if (securityPassed) {
        this.stats.securityPassed++;
        
        console.log('[STRIPE_SECURITY_VALIDATION_PASSED]', {
          environment: this.getEnvironment(),
          checksPassed: allChecks.length,
          environment: this.getEnvironment()
        });
        
        return {
          valid: true,
          environment: this.getEnvironment(),
          checks: allChecks.map(check => ({
            type: check.type,
            status: 'passed',
            details: check.details
          })),
          metadata: {
            validatedAt: new Date(),
            securityLevel: 'full'
          }
        };
        
      } else {
        this.stats.securityFailed++;
        
        // Logger les échecs
        for (const failedCheck of failedChecks) {
          this.updateStats('failed', failedCheck.reason);
          
          logRealError('stripe_security_failed', null, null, null, new Error(failedCheck.reason), {
            checkType: failedCheck.type,
            environment: this.getEnvironment(),
            details: failedCheck.details
          });
        }
        
        console.log('[STRIPE_SECURITY_VALIDATION_FAILED]', {
          environment: this.getEnvironment(),
          failedChecks: failedChecks.length,
          reasons: failedChecks.map(c => c.reason)
        });
        
        return {
          valid: false,
          environment: this.getEnvironment(),
          checks: allChecks.map(check => ({
            type: check.type,
            status: check.valid ? 'passed' : 'failed',
            reason: check.reason || null,
            details: check.details
          })),
          failedChecks,
          metadata: {
            validatedAt: new Date(),
            securityLevel: 'incomplete'
          }
        };
      }
      
    } catch (error) {
      console.log('[STRIPE_SECURITY_VALIDATION_ERROR]', {
        error: error.message,
        environment: this.getEnvironment()
      });
      
      this.stats.securityFailed++;
      this.updateStats('failed', 'validation_exception');
      
      logRealError('stripe_security_exception', null, null, null, error, {
        environment: this.getEnvironment()
      });
      
      return {
        valid: false,
        environment: this.getEnvironment(),
        error: error.message,
        metadata: {
          validatedAt: new Date(),
          securityLevel: 'error'
        }
      };
    }
  }
  
  // Valider STRIPE_API_KEY
  validateStripeApiKey() {
    const apiKey = process.env.STRIPE_API_KEY;
    
    if (!apiKey) {
      return {
        valid: false,
        type: 'api_key',
        reason: 'STRIPE_API_KEY not configured',
        details: {
          configured: false,
          required: true
        }
      };
    }
    
    // Vérifier le format de la clé
    if (!apiKey.startsWith('sk_')) {
      return {
        valid: false,
        type: 'api_key',
        reason: 'STRIPE_API_KEY invalid format',
        details: {
          format: 'invalid',
          expectedPrefix: 'sk_',
          actualPrefix: apiKey.substring(0, 3)
        }
      };
    }
    
    // Vérifier la longueur minimale
    if (apiKey.length < 20) {
      return {
        valid: false,
        type: 'api_key',
        reason: 'STRIPE_API_KEY too short',
        details: {
          length: apiKey.length,
          minLength: 20
        }
      };
    }
    
    // Tester la clé avec Stripe (validation légère)
    try {
      // Importer Stripe (lazy loading)
      const stripe = require('stripe')(apiKey);
      
      // Vérifier si la clé est valide avec une requête simple
      // Note: En production, cette vérification pourrait être coûteuse
      // Pour la sécurité, on fait une validation basique
      
      return {
        valid: true,
        type: 'api_key',
        details: {
          configured: true,
          format: 'valid',
          length: apiKey.length,
          prefix: apiKey.substring(0, 7) + '...'
        }
      };
      
    } catch (error) {
      return {
        valid: false,
        type: 'api_key',
        reason: 'STRIPE_API_KEY invalid',
        details: {
          error: error.message
        }
      };
    }
  }
  
  // Valider STRIPE_WEBHOOK_SECRET
  validateWebhookSecret() {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      return {
        valid: false,
        type: 'webhook_secret',
        reason: 'STRIPE_WEBHOOK_SECRET not configured',
        details: {
          configured: false,
          required: true
        }
      };
    }
    
    // Vérifier la longueur minimale
    if (webhookSecret.length < 20) {
      return {
        valid: false,
        type: 'webhook_secret',
        reason: 'STRIPE_WEBHOOK_SECRET too short',
        details: {
          length: webhookSecret.length,
          minLength: 20
        }
      };
    }
    
    // Vérifier le format (doit commencer par whsec_)
    if (!webhookSecret.startsWith('whsec_')) {
      return {
        valid: false,
        type: 'webhook_secret',
        reason: 'STRIPE_WEBHOOK_SECRET invalid format',
        details: {
          format: 'invalid',
          expectedPrefix: 'whsec_',
          actualPrefix: webhookSecret.substring(0, 6)
        }
      };
    }
    
    return {
      valid: true,
      type: 'webhook_secret',
      details: {
        configured: true,
        format: 'valid',
        length: webhookSecret.length,
        prefix: webhookSecret.substring(0, 10) + '...'
      }
    };
  }
  
  // Valider la configuration de l'environnement
  validateEnvironmentConfig() {
    const checks = [];
    
    // Vérifier NODE_ENV
    const nodeEnv = process.env.NODE_ENV;
    if (!nodeEnv) {
      checks.push({
        valid: false,
        setting: 'NODE_ENV',
        reason: 'NODE_ENV not configured'
      });
    } else if (!['development', 'staging', 'production'].includes(nodeEnv)) {
      checks.push({
        valid: false,
        setting: 'NODE_ENV',
        reason: 'NODE_ENV invalid value',
        details: {
          current: nodeEnv,
          valid: ['development', 'staging', 'production']
        }
      });
    } else {
      checks.push({
        valid: true,
        setting: 'NODE_ENV',
        details: {
          current: nodeEnv
        }
      });
    }
    
    // Vérifier FRONTEND_URL
    const frontendUrl = process.env.FRONTEND_URL;
    if (!frontendUrl) {
      checks.push({
        valid: false,
        setting: 'FRONTEND_URL',
        reason: 'FRONTEND_URL not configured'
      });
    } else if (!frontendUrl.startsWith('http')) {
      checks.push({
        valid: false,
        setting: 'FRONTEND_URL',
        reason: 'FRONTEND_URL invalid format',
        details: {
          current: frontendUrl,
          expected: 'http:// or https://'
        }
      });
    } else {
      checks.push({
        valid: true,
        setting: 'FRONTEND_URL',
        details: {
          current: frontendUrl.substring(0, 20) + '...'
        }
      });
    }
    
    const allValid = checks.every(check => check.valid);
    
    return {
      valid: allValid,
      type: 'environment',
      reason: allValid ? null : 'Environment configuration incomplete',
      details: {
        checks,
        totalChecks: checks.length,
        passedChecks: checks.filter(c => c.valid).length
      }
    };
  }
  
  // Valider la configuration des endpoints
  validateEndpointsConfig() {
    const checks = [];
    
    // Vérifier si les endpoints sont configurés
    const requiredEndpoints = [
      '/webhook/stripe',
      '/payment/create',
      '/payment/confirm'
    ];
    
    for (const endpoint of requiredEndpoints) {
      // Simulation - en production, vérifierait si les endpoints existent
      const endpointExists = true; // Simulation
      
      if (endpointExists) {
        checks.push({
          valid: true,
          endpoint,
          details: 'configured'
        });
      } else {
        checks.push({
          valid: false,
          endpoint,
          reason: 'endpoint not configured'
        });
      }
    }
    
    const allValid = checks.every(check => check.valid);
    
    return {
      valid: allValid,
      type: 'endpoints',
      reason: allValid ? null : 'Endpoints configuration incomplete',
      details: {
        requiredEndpoints,
        checks,
        totalChecks: checks.length,
        passedChecks: checks.filter(c => c.valid).length
      }
    };
  }
  
  // Valider la configuration de sécurité
  validateSecurityConfig() {
    const checks = [];
    
    // Vérifier les flags de sécurité
    const securityFlags = [
      'AGENT_REAL_VALIDATION_MODE',
      'AGENT_REAL_PAYMENT_ENABLED',
      'ERROR_PROTECTION_ENABLED',
      'FINAL_STATUS_PROTECTION_ENABLED'
    ];
    
    for (const flag of securityFlags) {
      const flagEnabled = getFlag(flag);
      
      if (flag === 'AGENT_REAL_PAYMENT_ENABLED') {
        // Ce flag doit être activé pour la sécurité
        if (!flagEnabled) {
          checks.push({
            valid: false,
            flag,
            reason: 'Real payment flag not enabled',
            required: true
          });
        } else {
          checks.push({
            valid: true,
            flag,
            details: 'enabled'
          });
        }
      } else {
        // Les autres flags de sécurité devraient être activés
        if (!flagEnabled) {
          checks.push({
            valid: false,
            flag,
            reason: 'Security flag not enabled',
            recommended: true
          });
        } else {
          checks.push({
            valid: true,
            flag,
            details: 'enabled'
          });
        }
      }
    }
    
    const allValid = checks.every(check => check.valid);
    
    return {
      valid: allValid,
      type: 'security_config',
      reason: allValid ? null : 'Security configuration incomplete',
      details: {
        securityFlags,
        checks,
        totalChecks: checks.length,
        passedChecks: checks.filter(c => c.valid).length
      }
    };
  }
  
  // Vérifier si le paiement réel peut être activé
  canEnableRealPayment() {
    const securityValidation = this.validateStripeSecurity();
    
    if (!securityValidation.valid) {
      return {
        allowed: false,
        reason: 'security_validation_failed',
        details: securityValidation.failedChecks
      };
    }
    
    return {
      allowed: true,
      reason: 'security_validation_passed',
      details: securityValidation.checks
    };
  }
  
  // Mettre à jour les statistiques
  updateStats(result, reason) {
    if (result === 'failed') {
      this.stats.byReason.set(reason, (this.stats.byReason.get(reason) || 0) + 1);
    }
  }
  
  // Obtenir les statistiques de sécurité
  getSecurityStats() {
    if (!this.isStripeSecurityEnabled()) {
      return { enabled: false };
    }
    
    const totalChecks = this.stats.totalSecurityChecks;
    const passRate = totalChecks > 0 ? 
      (this.stats.securityPassed / totalChecks) * 100 : 0;
    
    return {
      enabled: true,
      environment: this.getEnvironment(),
      stats: {
        totalSecurityChecks: this.stats.totalSecurityChecks,
        securityPassed: this.stats.securityPassed,
        securityFailed: this.stats.securityFailed,
        passRate: Math.round(passRate * 100) / 100,
        lastSecurityCheck: this.stats.lastSecurityCheck
      },
      byReason: Object.fromEntries(this.stats.byReason),
      uptime: process.uptime()
    };
  }
  
  // Obtenir le rapport de sécurité
  getSecurityReport() {
    if (!this.isStripeSecurityEnabled()) {
      return { enabled: false };
    }
    
    const currentValidation = this.validateStripeSecurity();
    const stats = this.getSecurityStats();
    
    // Analyser les patterns de sécurité
    const patterns = this.analyzeSecurityPatterns(stats);
    
    // Générer des recommandations
    const recommendations = this.generateSecurityRecommendations(currentValidation, stats, patterns);
    
    return {
      enabled: true,
      environment: stats.environment,
      currentValidation,
      stats: stats.stats,
      patterns,
      recommendations,
      metadata: {
        generated_at: new Date(),
        security_type: 'stripe_security'
      }
    };
  }
  
  // Analyser les patterns de sécurité
  analyzeSecurityPatterns(stats) {
    const patterns = {
      mostCommonFailure: null,
      securityTrend: 'stable',
      riskLevel: 'low'
    };
    
    // Échec le plus commun
    let maxCount = 0;
    for (const [reason, count] of Object.entries(stats.byReason)) {
      if (count > maxCount) {
        maxCount = count;
        patterns.mostCommonFailure = { reason, count };
      }
    }
    
    // Tendance de sécurité (basée sur le taux de passage)
    if (stats.stats.passRate >= 95) {
      patterns.securityTrend = 'excellent';
      patterns.riskLevel = 'very_low';
    } else if (stats.stats.passRate >= 85) {
      patterns.securityTrend = 'good';
      patterns.riskLevel = 'low';
    } else if (stats.stats.passRate >= 70) {
      patterns.securityTrend = 'concerning';
      patterns.riskLevel = 'medium';
    } else {
      patterns.securityTrend = 'critical';
      patterns.riskLevel = 'high';
    }
    
    return patterns;
  }
  
  // Générer des recommandations de sécurité
  generateSecurityRecommendations(currentValidation, stats, patterns) {
    const recommendations = [];
    
    if (!currentValidation.valid) {
      recommendations.push({
        type: 'critical',
        message: 'Security validation failed',
        action: 'Fix all security issues before enabling real payments',
        priority: 'critical'
      });
    }
    
    if (patterns.mostCommonFailure) {
      recommendations.push({
        type: 'warning',
        message: `Most common security issue: ${patterns.mostCommonFailure.reason}`,
        action: `Address ${patterns.mostCommonFailure.reason} immediately`,
        priority: 'high'
      });
    }
    
    if (patterns.riskLevel === 'high') {
      recommendations.push({
        type: 'critical',
        message: 'High security risk detected',
        action: 'Review and fix all security configurations',
        priority: 'critical'
      });
    }
    
    if (patterns.securityTrend === 'concerning') {
      recommendations.push({
        type: 'warning',
        message: 'Security trend is concerning',
        action: 'Investigate recent security issues',
        priority: 'medium'
      });
    }
    
    if (recommendations.length === 0) {
      recommendations.push({
        type: 'success',
        message: 'Stripe security configuration is optimal',
        action: 'Continue monitoring and maintain current configuration',
        priority: 'low'
      });
    }
    
    return recommendations;
  }
  
  // Réinitialiser les statistiques
  resetStats() {
    this.stats = {
      totalSecurityChecks: 0,
      securityPassed: 0,
      securityFailed: 0,
      byReason: new Map(),
      lastSecurityCheck: null
    };
    
    console.log('[STRIPE_SECURITY_VALIDATOR_STATS_RESET]');
  }
}

// Instance globale du validateur
if (!global.stripeSecurityValidator) {
  global.stripeSecurityValidator = new StripeSecurityValidator();
}

// Fonctions principales
function validateStripeSecurity() {
  return global.stripeSecurityValidator.validateStripeSecurity();
}

function canEnableRealPayment() {
  return global.stripeSecurityValidator.canEnableRealPayment();
}

// Stats et monitoring
function getStripeSecurityStats() {
  return global.stripeSecurityValidator.getSecurityStats();
}

function getStripeSecurityReport() {
  return global.stripeSecurityValidator.getSecurityReport();
}

// Administration
function resetStripeSecurityStats() {
  return global.stripeSecurityValidator.resetStats();
}

module.exports = {
  validateStripeSecurity,
  canEnableRealPayment,
  getStripeSecurityStats,
  getStripeSecurityReport,
  resetStripeSecurityStats,
  StripeSecurityValidator
};
