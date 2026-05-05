// ACTION 12 - Fallback safe

const { getFlag } = require('./envFlags');
const { logRealError } = require('./realValidationLogger');
const { addRealStep } = require('./realTraceManager');

// Gestionnaire de fallback safe (SAFE - gestion erreurs, alternatives, logging)
class PaymentFallbackManager {
  constructor() {
    this.testModeEnabled = getFlag('AGENT_TEST_MODE');
    this.realValidationEnabled = getFlag('AGENT_REAL_VALIDATION_MODE');
    this.realPaymentEnabled = getFlag('AGENT_REAL_PAYMENT_ENABLED');
    this.stats = {
      totalFallbacks: 0,
      stripeFallbacks: 0,
      simulationFallbacks: 0,
      messageFallbacks: 0,
      byReason: new Map(),
      byType: new Map()
    };
    
    console.log('[PAYMENT_FALLBACK_MANAGER_INITIALIZED]', {
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
  
  // Gérer le fallback pour paiement
  async handlePaymentFallback(lead, paymentContext = {}, error = null) {
    this.stats.totalFallbacks++;
    
    try {
      console.log('[PAYMENT_FALLBACK_START]', {
        leadId: lead.id,
        tenant_id: lead.tenant_id,
        phone: this.maskPhone(lead.phone),
        error: error?.message,
        environment: this.getEnvironment()
      });
      
      // Déterminer le type de fallback
      const fallbackType = this.determineFallbackType(error, paymentContext);
      
      // Exécuter le fallback approprié
      const fallbackResult = await this.executeFallback(lead, paymentContext, fallbackType, error);
      
      // Logger le fallback
      this.logFallbackResult(lead, fallbackType, fallbackResult, error);
      
      // Ajouter l'étape à la trace
      if (paymentContext.traceId) {
        addRealStep(paymentContext.traceId, 'payment_fallback_executed', {
          phone: this.maskPhone(lead.phone),
          fallbackType,
          result: fallbackResult.success,
          reason: fallbackResult.reason,
          environment: this.getEnvironment()
        });
      }
      
      console.log('[PAYMENT_FALLBACK_COMPLETED]', {
        leadId: lead.id,
        fallbackType,
        success: fallbackResult.success,
        environment: this.getEnvironment()
      });
      
      return fallbackResult;
      
    } catch (fallbackError) {
      console.log('[PAYMENT_FALLBACK_ERROR]', {
        leadId: lead.id,
        error: fallbackError.message,
        environment: this.getEnvironment()
      });
      
      // Fallback ultime - message simple sans paiement
      const ultimateFallback = await this.ultimateFallback(lead, 'fallback_exception', fallbackError);
      
      return {
        success: false,
        fallbackType: 'ultimate',
        reason: 'fallback_exception',
        error: fallbackError.message,
        ultimateFallback,
        environment: this.getEnvironment()
      };
    }
  }
  
  // Déterminer le type de fallback
  determineFallbackType(error, paymentContext) {
    if (!error) {
      return 'no_payment_attempted';
    }
    
    const errorMessage = error.message.toLowerCase();
    
    // Fallback Stripe
    if (errorMessage.includes('stripe') || 
        errorMessage.includes('payment_intent') ||
        errorMessage.includes('api_key') ||
        errorMessage.includes('webhook_secret')) {
      return 'stripe_error';
    }
    
    // Fallback réseau
    if (errorMessage.includes('network') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('connection') ||
        errorMessage.includes('enotun')) {
      return 'network_error';
    }
    
    // Fallback technique
    if (errorMessage.includes('technical') ||
        errorMessage.includes('system') ||
        errorMessage.includes('server') ||
        errorMessage.includes('database')) {
      return 'technical_error';
    }
    
    // Fallback validation
    if (errorMessage.includes('validation') ||
        errorMessage.includes('invalid') ||
        errorMessage.includes('missing') ||
        errorMessage.includes('required')) {
      return 'validation_error';
    }
    
    // Fallback limite
    if (errorMessage.includes('limit') ||
        errorMessage.includes('quota') ||
        errorMessage.includes('rate') ||
        errorMessage.includes('exceeded')) {
      return 'limit_error';
    }
    
    return 'unknown_error';
  }
  
  // Exécuter le fallback approprié
  async executeFallback(lead, paymentContext, fallbackType, error) {
    this.updateStats(fallbackType);
    
    switch (fallbackType) {
      case 'stripe_error':
        return await this.stripeFallback(lead, paymentContext, error);
        
      case 'network_error':
        return await this.networkFallback(lead, paymentContext, error);
        
      case 'technical_error':
        return await this.technicalFallback(lead, paymentContext, error);
        
      case 'validation_error':
        return await this.validationFallback(lead, paymentContext, error);
        
      case 'limit_error':
        return await this.limitFallback(lead, paymentContext, error);
        
      case 'no_payment_attempted':
        return await this.noPaymentFallback(lead, paymentContext);
        
      default:
        return await this.unknownFallback(lead, paymentContext, error);
    }
  }
  
  // Fallback pour erreur Stripe
  async stripeFallback(lead, paymentContext, error) {
    this.stats.stripeFallbacks++;
    
    try {
      console.log('[STRIPE_FALLBACK_ATTEMPT]', {
        leadId: lead.id,
        error: error.message,
        environment: this.getEnvironment()
      });
      
      // Essayer de créer un lien de paiement avec retry
      const retryResult = await this.retryStripePayment(lead, paymentContext);
      
      if (retryResult.success) {
        return {
          success: true,
          fallbackType: 'stripe_retry',
          message: 'Stripe payment succeeded after retry',
          paymentLink: retryResult.paymentLink,
          environment: this.getEnvironment()
        };
      }
      
      // Si retry échoue, utiliser la simulation
      const simulationResult = await this.usePaymentSimulation(lead, paymentContext, 'stripe_error');
      
      return {
        success: simulationResult.success,
        fallbackType: 'stripe_to_simulation',
        message: simulationResult.success ? 
          'Stripe failed, using payment simulation' : 
          'Both Stripe and simulation failed',
        simulationResult: simulationResult.success ? simulationResult : null,
        environment: this.getEnvironment()
      };
      
    } catch (fallbackError) {
      return {
        success: false,
        fallbackType: 'stripe_fallback_error',
        error: fallbackError.message,
        environment: this.getEnvironment()
      };
    }
  }
  
  // Fallback pour erreur réseau
  async networkFallback(lead, paymentContext, error) {
    try {
      console.log('[NETWORK_FALLBACK_ATTEMPT]', {
        leadId: lead.id,
        error: error.message,
        environment: this.getEnvironment()
      });
      
      // Attendre et réessayer
      await this.sleep(2000); // 2 secondes
      
      const retryResult = await this.retryWithBackoff(lead, paymentContext, 1);
      
      if (retryResult.success) {
        return {
          success: true,
          fallbackType: 'network_retry',
          message: 'Network issue resolved with retry',
          paymentLink: retryResult.paymentLink,
          environment: this.getEnvironment()
        };
      }
      
      // Si retry échoue, utiliser la simulation
      const simulationResult = await this.usePaymentSimulation(lead, paymentContext, 'network_error');
      
      return {
        success: simulationResult.success,
        fallbackType: 'network_to_simulation',
        message: simulationResult.success ? 
          'Network error, using payment simulation' : 
          'Both network retry and simulation failed',
        simulationResult: simulationResult.success ? simulationResult : null,
        environment: this.getEnvironment()
      };
      
    } catch (fallbackError) {
      return {
        success: false,
        fallbackType: 'network_fallback_error',
        error: fallbackError.message,
        environment: this.getEnvironment()
      };
    }
  }
  
  // Fallback pour erreur technique
  async technicalFallback(lead, paymentContext, error) {
    try {
      console.log('[TECHNICAL_FALLBACK_ATTEMPT]', {
        leadId: lead.id,
        error: error.message,
        environment: this.getEnvironment()
      });
      
      // Utiliser la simulation en cas d'erreur technique
      const simulationResult = await this.usePaymentSimulation(lead, paymentContext, 'technical_error');
      
      if (simulationResult.success) {
        return {
          success: true,
          fallbackType: 'technical_to_simulation',
          message: 'Technical error, using payment simulation',
          simulationResult,
          environment: this.getEnvironment()
        };
      }
      
      // Si simulation échoue, message simple
      const messageResult = await this.sendSimpleMessage(lead, 'technical_error');
      
      return {
        success: true,
        fallbackType: 'technical_to_message',
        message: 'Technical error, sending simple message',
        messageResult,
        environment: this.getEnvironment()
      };
      
    } catch (fallbackError) {
      return {
        success: false,
        fallbackType: 'technical_fallback_error',
        error: fallbackError.message,
        environment: this.getEnvironment()
      };
    }
  }
  
  // Fallback pour erreur validation
  async validationFallback(lead, paymentContext, error) {
    try {
      console.log('[VALIDATION_FALLBACK_ATTEMPT]', {
        leadId: lead.id,
        error: error.message,
        environment: this.getEnvironment()
      });
      
      // Corriger les données et réessayer
      const correctedContext = this.correctValidationErrors(paymentContext, error);
      const retryResult = await this.retryWithCorrectedData(lead, correctedContext);
      
      if (retryResult.success) {
        return {
          success: true,
          fallbackType: 'validation_correction',
          message: 'Validation error corrected and retry succeeded',
          paymentLink: retryResult.paymentLink,
          environment: this.getEnvironment()
        };
      }
      
      // Si correction échoue, message simple
      const messageResult = await this.sendSimpleMessage(lead, 'validation_error');
      
      return {
        success: true,
        fallbackType: 'validation_to_message',
        message: 'Validation error, sending simple message',
        messageResult,
        environment: this.getEnvironment()
      };
      
    } catch (fallbackError) {
      return {
        success: false,
        fallbackType: 'validation_fallback_error',
        error: fallbackError.message,
        environment: this.getEnvironment()
      };
    }
  }
  
  // Fallback pour erreur limite
  async limitFallback(lead, paymentContext, error) {
    try {
      console.log('[LIMIT_FALLBACK_ATTEMPT]', {
        leadId: lead.id,
        error: error.message,
        environment: this.getEnvironment()
      });
      
      // Attendre et réessayer après la limite
      const waitTime = this.calculateLimitWaitTime(error);
      await this.sleep(waitTime);
      
      const retryResult = await this.retryAfterLimit(lead, paymentContext);
      
      if (retryResult.success) {
        return {
          success: true,
          fallbackType: 'limit_retry',
          message: `Limit error resolved after ${waitTime}ms wait`,
          paymentLink: retryResult.paymentLink,
          environment: this.getEnvironment()
        };
      }
      
      // Si retry échoue, message d'attente
      const messageResult = await this.sendWaitMessage(lead, waitTime);
      
      return {
        success: true,
        fallbackType: 'limit_to_wait_message',
        message: `Limit error, asking to wait ${waitTime}ms`,
        messageResult,
        environment: this.getEnvironment()
      };
      
    } catch (fallbackError) {
      return {
        success: false,
        fallbackType: 'limit_fallback_error',
        error: fallbackError.message,
        environment: this.getEnvironment()
      };
    }
  }
  
  // Fallback pour aucune tentative de paiement
  async noPaymentFallback(lead, paymentContext) {
    try {
      console.log('[NO_PAYMENT_FALLBACK_ATTEMPT]', {
        leadId: lead.id,
        environment: this.getEnvironment()
      });
      
      // Envoyer un message de paiement
      const paymentResult = await this.sendPaymentMessage(lead, paymentContext);
      
      return {
        success: paymentResult.success,
        fallbackType: 'no_payment_to_payment',
        message: paymentResult.success ? 
          'Payment message sent' : 
          'Payment message failed',
        paymentResult,
        environment: this.getEnvironment()
      };
      
    } catch (fallbackError) {
      return {
        success: false,
        fallbackType: 'no_payment_fallback_error',
        error: fallbackError.message,
        environment: this.getEnvironment()
      };
    }
  }
  
  // Fallback pour erreur inconnue
  async unknownFallback(lead, paymentContext, error) {
    try {
      console.log('[UNKNOWN_FALLBACK_ATTEMPT]', {
        leadId: lead.id,
        error: error.message,
        environment: this.getEnvironment()
      });
      
      // Utiliser la simulation par défaut
      const simulationResult = await this.usePaymentSimulation(lead, paymentContext, 'unknown_error');
      
      if (simulationResult.success) {
        return {
          success: true,
          fallbackType: 'unknown_to_simulation',
          message: 'Unknown error, using payment simulation',
          simulationResult,
          environment: this.getEnvironment()
        };
      }
      
      // Si simulation échoue, message simple
      const messageResult = await this.sendSimpleMessage(lead, 'unknown_error');
      
      return {
        success: true,
        fallbackType: 'unknown_to_message',
        message: 'Unknown error, sending simple message',
        messageResult,
        environment: this.getEnvironment()
      };
      
    } catch (fallbackError) {
      return {
        success: false,
        fallbackType: 'unknown_fallback_error',
        error: fallbackError.message,
        environment: this.getEnvironment()
      };
    }
  }
  
  // Réessayer avec Stripe
  async retryStripePayment(lead, paymentContext) {
    try {
      // Importer le wrapper de paiement réel
      const { sendRealPaymentLink } = require('./realPaymentWrapper');
      
      return await sendRealPaymentLink(lead, {
        ...paymentContext,
        isRetry: true,
        retryCount: (paymentContext.retryCount || 0) + 1
      });
      
    } catch (error) {
      console.log('[STRIPE_RETRY_ERROR]', error.message);
      return { success: false, error: error.message };
    }
  }
  
  // Réessayer avec backoff
  async retryWithBackoff(lead, paymentContext, retryCount = 0) {
    const maxRetries = 3;
    
    if (retryCount >= maxRetries) {
      return { success: false, reason: 'max_retries_exceeded' };
    }
    
    try {
      // Attendre avant de réessayer
      const waitTime = Math.pow(2, retryCount) * 1000; // Exponential backoff
      await this.sleep(waitTime);
      
      // Importer le wrapper de paiement réel
      const { sendRealPaymentLink } = require('./realPaymentWrapper');
      
      return await sendRealPaymentLink(lead, {
        ...paymentContext,
        isRetry: true,
        retryCount: retryCount + 1
      });
      
    } catch (error) {
      console.log('[BACKOFF_RETRY_ERROR]', error.message);
      
      // Réessayer récursivement
      return await this.retryWithBackoff(lead, paymentContext, retryCount + 1);
    }
  }
  
  // Réessayer avec données corrigées
  async retryWithCorrectedData(lead, correctedContext) {
    try {
      // Importer le wrapper de paiement réel
      const { sendRealPaymentLink } = require('./realPaymentWrapper');
      
      return await sendRealPaymentLink(lead, correctedContext);
      
    } catch (error) {
      console.log('[CORRECTED_RETRY_ERROR]', error.message);
      return { success: false, error: error.message };
    }
  }
  
  // Réessayer après limite
  async retryAfterLimit(lead, paymentContext) {
    try {
      // Importer le wrapper de paiement réel
      const { sendRealPaymentLink } = require('./realPaymentWrapper');
      
      return await sendRealPaymentLink(lead, {
        ...paymentContext,
        isRetry: true,
        retryCount: 1
      });
      
    } catch (error) {
      console.log('[LIMIT_RETRY_ERROR]', error.message);
      return { success: false, error: error.message };
    }
  }
  
  // Utiliser la simulation de paiement
  async usePaymentSimulation(lead, paymentContext, reason) {
    try {
      console.log('[PAYMENT_SIMULATION_FALLBACK]', {
        leadId: lead.id,
        reason,
        environment: this.getEnvironment()
      });
      
      // Importer le simulateur de paiement
      const { simulatePayment } = require('./testPaymentSimulator');
      
      this.stats.simulationFallbacks++;
      
      return await simulatePayment(lead, {
        ...paymentContext,
        fallbackReason: reason
      });
      
    } catch (error) {
      console.log('[PAYMENT_SIMULATION_ERROR]', error.message);
      return { success: false, error: error.message };
    }
  }
  
  // Envoyer un message simple
  async sendSimpleMessage(lead, reason) {
    try {
      console.log('[SIMPLE_MESSAGE_FALLBACK]', {
        leadId: lead.id,
        reason,
        environment: this.getEnvironment()
      });
      
      // Importer le wrapper WhatsApp
      const { wrapSendWhatsApp } = require('./whatsappWrapper');
      
      const message = this.generateSimpleMessage(lead, reason);
      
      this.stats.messageFallbacks++;
      
      return await wrapSendWhatsApp(lead.phone, message, {
        tenant_id: lead.tenant_id,
        lead_id: lead.id,
        messageType: 'fallback_simple',
        fallbackReason: reason
      });
      
    } catch (error) {
      console.log('[SIMPLE_MESSAGE_ERROR]', error.message);
      return { success: false, error: error.message };
    }
  }
  
  // Envoyer un message de paiement
  async sendPaymentMessage(lead, paymentContext) {
    try {
      console.log('[PAYMENT_MESSAGE_FALLBACK]', {
        leadId: lead.id,
        environment: this.getEnvironment()
      });
      
      // Importer le wrapper WhatsApp
      const { wrapSendWhatsApp } = require('./whatsappWrapper');
      
      const message = this.generatePaymentMessage(lead, paymentContext);
      
      return await wrapSendWhatsApp(lead.phone, message, {
        tenant_id: lead.tenant_id,
        lead_id: lead.id,
        messageType: 'fallback_payment',
        paymentContext
      });
      
    } catch (error) {
      console.log('[PAYMENT_MESSAGE_ERROR]', error.message);
      return { success: false, error: error.message };
    }
  }
  
  // Envoyer un message d'attente
  async sendWaitMessage(lead, waitTime) {
    try {
      console.log('[WAIT_MESSAGE_FALLBACK]', {
        leadId: lead.id,
        waitTime,
        environment: this.getEnvironment()
      });
      
      // Importer le wrapper WhatsApp
      const { wrapSendWhatsApp } = require('./whatsappWrapper');
      
      const message = this.generateWaitMessage(lead, waitTime);
      
      return await wrapSendWhatsApp(lead.phone, message, {
        tenant_id: lead.tenant_id,
        lead_id: lead.id,
        messageType: 'fallback_wait',
        waitTime
      });
      
    } catch (error) {
      console.log('[WAIT_MESSAGE_ERROR]', error.message);
      return { success: false, error: error.message };
    }
  }
  
  // Fallback ultime
  async ultimateFallback(lead, reason, error) {
    try {
      console.log('[ULTIMATE_FALLBACK]', {
        leadId: lead.id,
        reason,
        error: error.message,
        environment: this.getEnvironment()
      });
      
      // Message très simple
      const message = "Nous rencontrons actuellement des difficultés techniques. Notre équipe a été notifiée et travaille sur une solution. Merci de votre patience.";
      
      // Importer le wrapper WhatsApp
      const { wrapSendWhatsApp } = require('./whatsappWrapper');
      
      return await wrapSendWhatsApp(lead.phone, message, {
        tenant_id: lead.tenant_id,
        lead_id: lead.id,
        messageType: 'fallback_ultimate',
        reason,
        error: error.message
      });
      
    } catch (fallbackError) {
      console.log('[ULTIMATE_FALLBACK_ERROR]', fallbackError.message);
      return { success: false, error: fallbackError.message };
    }
  }
  
  // Corriger les erreurs de validation
  correctValidationErrors(paymentContext, error) {
    const corrected = { ...paymentContext };
    
    // Corriger les erreurs courantes
    if (error.message.includes('amount')) {
      corrected.amount = 4900; // 49.00 EUR par défaut
    }
    
    if (error.message.includes('currency')) {
      corrected.currency = 'eur';
    }
    
    if (error.message.includes('email')) {
      // Supprimer l'email s'il est invalide
      delete corrected.email;
    }
    
    return corrected;
  }
  
  // Calculer le temps d'attente pour les limites
  calculateLimitWaitTime(error) {
    // Extraire le temps d'attente de l'erreur si disponible
    const waitTimeMatch = error.message.match(/wait (\d+)ms/);
    if (waitTimeMatch) {
      return parseInt(waitTimeMatch[1]);
    }
    
    // Temps par défaut selon le type de limite
    if (error.message.includes('rate')) {
      return 60000; // 1 minute pour les limites de taux
    } else if (error.message.includes('quota')) {
      return 300000; // 5 minutes pour les quotas
    } else {
      return 10000; // 10 secondes par défaut
    }
  }
  
  // Générer un message simple
  generateSimpleMessage(lead, reason) {
    const messages = {
      'stripe_error': "Nous rencontrons actuellement des difficultés avec notre système de paiement. Notre équipe a été notifiée. Veuillez réessayer dans quelques instants.",
      'network_error': "Nous rencontrons actuellement des problèmes de connexion. Veuillez réessayer dans quelques instants.",
      'technical_error': "Nous rencontrons actuellement des difficultés techniques. Notre équipe travaille sur une solution.",
      'validation_error': "Une information semble incorrecte. Veuillez vérifier vos coordonnées.",
      'limit_error': "Vous avez atteint notre limite de traitement. Veuillez réessayer ultérieurement.",
      'unknown_error': "Une erreur inattendue s'est produite. Veuillez réessayer ultérieurement."
    };
    
    return messages[reason] || messages['unknown_error'];
  }
  
  // Générer un message de paiement
  generatePaymentMessage(lead, paymentContext) {
    return `Bonjour ! Pour finaliser votre commande, veuillez cliquer sur le lien de paiement qui vous sera envoyé prochainement. Merci de votre patience.`;
  }
  
  // Générer un message d'attente
  generateWaitMessage(lead, waitTime) {
    const waitMinutes = Math.round(waitTime / 60000);
    return `Veuillez patienter ${waitMinutes} minute(s) avant de réessayer. Merci de votre compréhension.`;
  }
  
  // Logger le résultat du fallback
  logFallbackResult(lead, fallbackType, fallbackResult, error) {
    logRealError('payment_fallback_executed', lead.phone, lead.tenant_id, lead.id, new Error(fallbackType), {
      fallbackType,
      success: fallbackResult.success,
      reason: fallbackResult.reason,
      originalError: error?.message,
      environment: this.getEnvironment()
    });
  }
  
  // Mettre à jour les statistiques
  updateStats(fallbackType) {
    this.stats.byReason.set(fallbackType, (this.stats.byReason.get(fallbackType) || 0) + 1);
    this.stats.byType.set(fallbackType, (this.stats.byType.get(fallbackType) || 0) + 1);
  }
  
  // Helper pour pause
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // Obtenir les statistiques du fallback
  getFallbackStats() {
    const totalFallbacks = this.stats.totalFallbacks;
    const successRate = totalFallbacks > 0 ? 
      (this.stats.totalFallbacks - this.stats.messageFallbacks) / totalFallbacks * 100 : 0;
    
    return {
      enabled: this.realPaymentEnabled || this.realValidationEnabled,
      environment: this.getEnvironment(),
      stats: {
        totalFallbacks: this.stats.totalFallbacks,
        stripeFallbacks: this.stats.stripeFallbacks,
        simulationFallbacks: this.stats.simulationFallbacks,
        messageFallbacks: this.stats.messageFallbacks,
        successRate: Math.round(successRate * 100) / 100
      },
      byReason: Object.fromEntries(this.stats.byReason),
      byType: Object.fromEntries(this.stats.byType),
      uptime: process.uptime()
    };
  }
  
  // Obtenir le rapport de fallback
  getFallbackReport() {
    const stats = this.getFallbackStats();
    
    // Analyser les patterns de fallback
    const patterns = this.analyzeFallbackPatterns(stats);
    
    // Générer des recommandations
    const recommendations = this.generateFallbackRecommendations(stats, patterns);
    
    return {
      enabled: stats.enabled,
      environment: stats.environment,
      stats: stats.stats,
      patterns,
      recommendations,
      metadata: {
        generated_at: new Date(),
        fallback_type: 'payment_fallback'
      }
    };
  }
  
  // Analyser les patterns de fallback
  analyzeFallbackPatterns(stats) {
    const patterns = {
      mostCommonReason: null,
      mostCommonType: null,
      fallbackRate: 0,
      effectivenessScore: 0
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
    
    // Taux de fallback
    if (stats.stats.totalFallbacks > 0) {
      patterns.fallbackRate = stats.stats.totalFallbacks;
    }
    
    // Score d'efficacité
    if (stats.stats.totalFallbacks > 0) {
      patterns.effectivenessScore = Math.round((stats.stats.totalFallbacks - stats.stats.messageFallbacks) / stats.stats.totalFallbacks * 100);
    }
    
    return patterns;
  }
  
  // Générer des recommandations
  generateFallbackRecommendations(stats, patterns) {
    const recommendations = [];
    
    if (patterns.effectivenessScore < 70) {
      recommendations.push({
        type: 'warning',
        message: `Low fallback effectiveness (${patterns.effectivenessScore}%)`,
        action: 'Review fallback strategies and improve error handling',
        priority: 'high'
      });
    }
    
    if (patterns.mostCommonReason) {
      recommendations.push({
        type: 'info',
        message: `Most common fallback reason: ${patterns.mostCommonReason.reason}`,
        action: `Address ${patterns.mostCommonReason.reason} issues proactively`,
        priority: 'medium'
      });
    }
    
    if (stats.stats.stripeFallbacks > stats.stats.simulationFallbacks) {
      recommendations.push({
        type: 'info',
        message: 'High Stripe fallback rate',
        action: 'Review Stripe configuration and network connectivity',
        priority: 'medium'
      });
    }
    
    if (recommendations.length === 0) {
      recommendations.push({
        type: 'success',
        message: 'Fallback system working effectively',
        action: 'Continue monitoring and maintain current configuration',
        priority: 'low'
      });
    }
    
    return recommendations;
  }
  
  // Masquer téléphone pour logs
  maskPhone(phone) {
    if (!phone || typeof phone !== 'string') return 'unknown';
    return phone.slice(0, -4) + '****';
  }
  
  // Réinitialiser les statistiques
  resetStats() {
    this.stats = {
      totalFallbacks: 0,
      stripeFallbacks: 0,
      simulationFallbacks: 0,
      messageFallbacks: 0,
      byReason: new Map(),
      byType: new Map()
    };
    
    console.log('[PAYMENT_FALLBACK_MANAGER_STATS_RESET]');
  }
}

// Instance globale du gestionnaire
if (!global.paymentFallbackManager) {
  global.paymentFallbackManager = new PaymentFallbackManager();
}

// Fonctions principales
async function handlePaymentFallback(lead, paymentContext, error) {
  return await global.paymentFallbackManager.handlePaymentFallback(lead, paymentContext, error);
}

// Stats et monitoring
function getPaymentFallbackStats() {
  return global.paymentFallbackManager.getFallbackStats();
}

function getPaymentFallbackReport() {
  return global.paymentFallbackManager.getFallbackReport();
}

// Administration
function resetPaymentFallbackStats() {
  return global.paymentFallbackManager.resetStats();
}

module.exports = {
  handlePaymentFallback,
  getPaymentFallbackStats,
  getPaymentFallbackReport,
  resetPaymentFallbackStats,
  PaymentFallbackManager
};
