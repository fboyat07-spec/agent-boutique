// ACTION 8 - Mode dégradé automatique

const BusinessLogger = require('./businessLogger');

// Mode dégradé automatique pour pannes externes
class DegradedMode {
  constructor() {
    this.status = {
      whatsapp: 'healthy',    // healthy, degraded, down
      stripe: 'healthy',      // healthy, degraded, down
      ai: 'healthy',          // healthy, degraded, down
      global: 'healthy'       // healthy, degraded, critical
    };
    
    this.fallbacks = {
      whatsapp: true,
      stripe: true,
      ai: true
    };
    
    this.lastChecks = {
      whatsapp: Date.now(),
      stripe: Date.now(),
      ai: Date.now()
    };
    
    this.checkIntervals = {
      whatsapp: 30000,  // 30 secondes
      stripe: 60000,    // 1 minute
      ai: 120000        // 2 minutes
    };
  }
  
  // Vérifier santé des services externes
  async checkServiceHealth(service) {
    const now = Date.now();
    const lastCheck = this.lastChecks[service];
    const interval = this.checkIntervals[service];
    
    // Pas trop de vérifications fréquentes
    if (now - lastCheck < interval) {
      return this.status[service];
    }
    
    this.lastChecks[service] = now;
    
    try {
      switch (service) {
        case 'whatsapp':
          return await this.checkWhatsAppHealth();
          
        case 'stripe':
          return await this.checkStripeHealth();
          
        case 'ai':
          return await this.checkAIHealth();
          
        default:
          return 'healthy';
      }
      
    } catch (error) {
      console.log(`[DEGRADED_MODE_CHECK_ERROR_${service.toUpperCase()}]`, error.message);
      return 'degraded';
    }
  }
  
  // Vérifier santé WhatsApp
  async checkWhatsAppHealth() {
    try {
      // Test simple: vérifier si les tokens sont présents
      const hasTokens = !!(process.env.WHATSAPP_TOKEN && process.env.PHONE_NUMBER_ID);
      
      if (!hasTokens) {
        this.status.whatsapp = 'down';
        console.log('[DEGRADED_MODE_WHATSAPP_DOWN] Missing tokens');
        return 'down';
      }
      
      // Test: envoyer un message de test (optionnel)
      // Pour l'instant, on considère que si les tokens sont là, c'est healthy
      
      this.status.whatsapp = 'healthy';
      return 'healthy';
      
    } catch (error) {
      this.status.whatsapp = 'degraded';
      console.log('[DEGRADED_MODE_WHATSAPP_DEGRADED]', error.message);
      return 'degraded';
    }
  }
  
  // Vérifier santé Stripe
  async checkStripeHealth() {
    try {
      // Test: vérifier clé Stripe
      const hasStripeKey = !!(process.env.STRIPE_PAYMENT_LINK && process.env.STRIPE_WEBHOOK_SECRET);
      
      if (!hasStripeKey) {
        this.status.stripe = 'down';
        console.log('[DEGRADED_MODE_STRIPE_DOWN] Missing Stripe config');
        return 'down';
      }
      
      // Test: valider format du lien de paiement
      const paymentLink = process.env.STRIPE_PAYMENT_LINK;
      if (paymentLink && !paymentLink.startsWith('https://')) {
        this.status.stripe = 'degraded';
        console.log('[DEGRADED_MODE_STRIPE_DEGRADED] Invalid payment link format');
        return 'degraded';
      }
      
      this.status.stripe = 'healthy';
      return 'healthy';
      
    } catch (error) {
      this.status.stripe = 'degraded';
      console.log('[DEGRADED_MODE_STRIPE_DEGRADED]', error.message);
      return 'degraded';
    }
  }
  
  // Vérifier santé IA
  async checkAIHealth() {
    try {
      // Test: vérifier clé OpenAI
      const hasAIKey = !!(process.env.OPENAI_API_KEY);
      
      if (!hasAIKey) {
        this.status.ai = 'down';
        console.log('[DEGRADED_MODE_AI_DOWN] Missing OpenAI key');
        return 'down';
      }
      
      // Test: essayer d'appeler IA (optionnel pour éviter les coûts)
      // Pour l'instant, on considère que si la clé est là, c'est healthy
      
      this.status.ai = 'healthy';
      return 'healthy';
      
    } catch (error) {
      this.status.ai = 'degraded';
      console.log('[DEGRADED_MODE_AI_DEGRADED]', error.message);
      return 'degraded';
    }
  }
  
  // Mettre à jour statut global
  updateGlobalStatus() {
    const statuses = Object.values(this.status);
    const downCount = statuses.filter(s => s === 'down').length;
    const degradedCount = statuses.filter(s => s === 'degraded').length;
    
    if (downCount >= 2) {
      this.status.global = 'critical';
    } else if (downCount >= 1 || degradedCount >= 2) {
      this.status.global = 'degraded';
    } else {
      this.status.global = 'healthy';
    }
    
    console.log('[DEGRADED_MODE_GLOBAL_STATUS]', {
      global: this.status.global,
      services: this.status,
      downCount,
      degradedCount
    });
  }
  
  // Vérifier tous les services
  async checkAllServices() {
    const checks = await Promise.all([
      this.checkServiceHealth('whatsapp'),
      this.checkServiceHealth('stripe'),
      this.checkServiceHealth('ai')
    ]);
    
    this.updateGlobalStatus();
    
    return {
      whatsapp: checks[0],
      stripe: checks[1],
      ai: checks[2],
      global: this.status.global
    };
  }
  
  // Wrapper pour envoi WhatsApp avec mode dégradé
  async executeWithWhatsAppFallback(operation, context = {}) {
    const whatsappStatus = await this.checkServiceHealth('whatsapp');
    
    if (whatsappStatus === 'down') {
      console.log('[DEGRADED_MODE_WHATSAPP_FALLBACK]', context);
      
      BusinessLogger.logWebhookError('WhatsApp down - using fallback', {
        context: 'degraded_mode',
        whatsappStatus
      });
      
      // Fallback: log uniquement
      console.log('[FALLBACK_WHATSAPP_LOG]', {
        phone: context.phone,
        message: context.message?.substring(0, 100),
        timestamp: new Date()
      });
      
      return { success: false, fallback: 'logged', reason: 'whatsapp_down' };
    }
    
    if (whatsappStatus === 'degraded') {
      console.log('[DEGRADED_MODE_WHATSAPP_RETRY]', context);
      
      // Essayer l'opération avec retry
      try {
        const result = await operation();
        return { success: true, result, degraded: true };
      } catch (error) {
        console.log('[DEGRADED_MODE_WHATSAPP_FAILED]', error.message);
        
        // Fallback si retry échoue
        return { success: false, fallback: 'logged', reason: 'whatsapp_degraded' };
      }
    }
    
    // Normal: exécuter opération
    try {
      const result = await operation();
      return { success: true, result };
    } catch (error) {
      console.log('[DEGRADED_MODE_WHATSAPP_ERROR]', error.message);
      return { success: false, error: error.message };
    }
  }
  
  // Wrapper pour paiement Stripe avec mode dégradé
  async executeWithStripeFallback(operation, context = {}) {
    const stripeStatus = await this.checkServiceHealth('stripe');
    
    if (stripeStatus === 'down') {
      console.log('[DEGRADED_MODE_STRIPE_FALLBACK]', context);
      
      BusinessLogger.logWebhookError('Stripe down - using fallback', {
        context: 'degraded_mode',
        stripeStatus
      });
      
      // Fallback: mettre en attente manuelle
      console.log('[FALLBACK_STRIPE_MANUAL]', {
        phone: context.phone,
        action: 'manual_payment_required',
        timestamp: new Date()
      });
      
      return { success: false, fallback: 'manual', reason: 'stripe_down' };
    }
    
    if (stripeStatus === 'degraded') {
      console.log('[DEGRADED_MODE_STRIPE_RETRY]', context);
      
      try {
        const result = await operation();
        return { success: true, result, degraded: true };
      } catch (error) {
        console.log('[DEGRADED_MODE_STRIPE_FAILED]', error.message);
        
        // Fallback: mettre en attente manuelle
        return { success: false, fallback: 'manual', reason: 'stripe_degraded' };
      }
    }
    
    // Normal: exécuter opération
    try {
      const result = await operation();
      return { success: true, result };
    } catch (error) {
      console.log('[DEGRADED_MODE_STRIPE_ERROR]', error.message);
      return { success: false, error: error.message };
    }
  }
  
  // Wrapper pour IA avec mode dégradé
  async executeWithAIFallback(operation, context = {}) {
    const aiStatus = await this.checkServiceHealth('ai');
    
    if (aiStatus === 'down') {
      console.log('[DEGRADED_MODE_AI_FALLBACK]', context);
      
      BusinessLogger.logAIFallbackUsed(context.phone, 'ai_service_down');
      
      // Fallback: utiliser logique simple
      const { detectIntent } = require('./intentionDetector');
      const intent = detectIntent(context.message || '');
      
      return { success: true, result: intent, fallback: 'simple_logic', reason: 'ai_down' };
    }
    
    if (aiStatus === 'degraded') {
      console.log('[DEGRADED_MODE_AI_RETRY]', context);
      
      try {
        const result = await operation();
        return { success: true, result, degraded: true };
      } catch (error) {
        console.log('[DEGRADED_MODE_AI_FAILED]', error.message);
        
        // Fallback: utiliser logique simple
        const { detectIntent } = require('./intentionDetector');
        const intent = detectIntent(context.message || '');
        
        return { success: true, result: intent, fallback: 'simple_logic', reason: 'ai_degraded' };
      }
    }
    
    // Normal: exécuter opération
    try {
      const result = await operation();
      return { success: true, result };
    } catch (error) {
      console.log('[DEGRADED_MODE_AI_ERROR]', error.message);
      
      // Fallback: utiliser logique simple
      const { detectIntent } = require('./intentionDetector');
      const intent = detectIntent(context.message || '');
      
      return { success: true, result: intent, fallback: 'simple_logic', reason: 'ai_error' };
    }
  }
  
  // Activer/désactiver fallbacks
  setFallback(service, enabled) {
    this.fallbacks[service] = enabled;
    
    console.log(`[DEGRADED_MODE_FALLBACK_${service.toUpperCase()}]`, {
      enabled,
      status: this.status[service]
    });
  }
  
  // Obtenir stats du mode dégradé
  getStats() {
    return {
      status: this.status,
      fallbacks: this.fallbacks,
      lastChecks: this.lastChecks,
      checkIntervals: this.checkIntervals,
      uptime: process.uptime()
    };
  }
  
  // Health check du mode dégradé
  healthCheck() {
    const stats = this.getStats();
    
    return {
      status: stats.status.global,
      services: stats.status,
      healthy: stats.status.global === 'healthy',
      recommendations: this.getRecommendations(stats)
    };
  }
  
  // Recommandations
  getRecommendations(stats) {
    const recommendations = [];
    
    if (stats.status.whatsapp === 'down') {
      recommendations.push('Check WhatsApp API tokens and configuration');
    }
    
    if (stats.status.stripe === 'down') {
      recommendations.push('Check Stripe payment link and webhook configuration');
    }
    
    if (stats.status.ai === 'down') {
      recommendations.push('Check OpenAI API key and quota');
    }
    
    if (stats.status.global === 'critical') {
      recommendations.push('Multiple services down - consider manual intervention');
    }
    
    return recommendations;
  }
}

// Instance globale du mode dégradé
if (!global.degradedMode) {
  global.degradedMode = new DegradedMode();
}

// Wrappers principaux
async function executeWithWhatsAppFallback(operation, context) {
  return await global.degradedMode.executeWithWhatsAppFallback(operation, context);
}

async function executeWithStripeFallback(operation, context) {
  return await global.degradedMode.executeWithStripeFallback(operation, context);
}

async function executeWithAIFallback(operation, context) {
  return await global.degradedMode.executeWithAIFallback(operation, context);
}

// Stats et monitoring
function getDegradedModeStats() {
  return global.degradedMode.getStats();
}

async function checkAllServicesHealth() {
  return await global.degradedMode.checkAllServices();
}

function degradedModeHealthCheck() {
  return global.degradedMode.healthCheck();
}

module.exports = {
  executeWithWhatsAppFallback,
  executeWithStripeFallback,
  executeWithAIFallback,
  getDegradedModeStats,
  checkAllServicesHealth,
  degradedModeHealthCheck,
  DegradedMode
};
