// ACTION 5 - Closing IA amélioré (non bloquant)

const BusinessLogger = require('./businessLogger');
const { trackEvent } = require('./eventTracker');

// Enhancer de closing IA (non bloquant, fallback garanti)
class ClosingEnhancer {
  constructor() {
    this.enabled = process.env.CLOSING_AI_ENABLED === 'true';
    this.enhancementTypes = ['urgency', 'social_proof', 'benefit_emphasis', 'objection_handling'];
    this.stats = {
      totalEnhancements: 0,
      successfulEnhancements: 0,
      fallbacks: 0,
      errors: 0,
      byType: {}
    };
    
    console.log('[CLOSING_ENHANCER_INITIALIZED]', {
      enabled: this.enabled,
      enhancementTypes: this.enhancementTypes.length
    });
  }
  
  // Améliorer un message de closing
  async enhanceClosingMessage(context) {
    if (!this.enabled) {
      return { enhanced: false, reason: 'closing_ai_disabled', originalMessage: context.message };
    }
    
    const {
      message,
      leadStatus,
      leadScore,
      conversationHistory = [],
      tenant_id = null,
      lead_id = null
    } = context;
    
    console.log('[CLOSING_ENHANCEMENT_REQUESTED]', {
      tenant_id,
      lead_id,
      leadStatus,
      leadScore,
      originalLength: message.length
    });
    
    try {
      this.stats.totalEnhancements++;
      
      // Analyser le contexte
      const analysis = this.analyzeContext(message, leadStatus, leadScore, conversationHistory);
      
      // Déterminer le type d'amélioration
      const enhancementType = this.selectEnhancementType(analysis);
      
      // Générer le message amélioré
      const enhancedMessage = this.generateEnhancedMessage(message, analysis, enhancementType);
      
      // Valider le message amélioré
      const validation = this.validateEnhancedMessage(enhancedMessage, message);
      
      if (!validation.valid) {
        this.stats.fallbacks++;
        
        console.log('[CLOSING_ENHANCEMENT_FALLBACK]', {
          tenant_id,
          lead_id,
          reason: validation.reason
        });
        
        return {
          enhanced: false,
          reason: validation.reason,
          originalMessage: message,
          fallbackUsed: true
        };
      }
      
      // Stats
      this.stats.successfulEnhancements++;
      this.stats.byType[enhancementType] = (this.stats.byType[enhancementType] || 0) + 1;
      
      console.log('[CLOSING_ENHANCEMENT_COMPLETED]', {
        tenant_id,
        lead_id,
        enhancementType,
        originalLength: message.length,
        enhancedLength: enhancedMessage.length
      });
      
      // Tracker l'événement
      trackEvent('closing_message_enhanced', {
        tenant_id,
        lead_id,
        enhancementType,
        originalLength: message.length,
        enhancedLength: enhancedMessage.length
      });
      
      BusinessLogger.logWithContext('info', 'closing_enhanced', tenant_id, lead_id, {
        enhancementType,
        originalLength: message.length,
        enhancedLength: enhancedMessage.length
      });
      
      return {
        enhanced: true,
        originalMessage: message,
        enhancedMessage,
        enhancementType,
        analysis,
        metadata: {
          enhancedAt: new Date(),
          confidence: analysis.confidence
        }
      };
      
    } catch (error) {
      this.stats.errors++;
      
      console.log('[CLOSING_ENHANCEMENT_ERROR]', {
        tenant_id,
        lead_id,
        error: error.message
      });
      
      return {
        enhanced: false,
        reason: 'enhancement_error',
        originalMessage: message,
        error: error.message,
        fallbackUsed: true
      };
    }
  }
  
  // Analyser le contexte du message
  analyzeContext(message, leadStatus, leadScore, conversationHistory) {
    const analysis = {
      currentMessage: message,
      leadStatus,
      leadScore,
      conversationLength: conversationHistory.length,
      confidence: 0.7, // Base confidence
      detectedElements: {
        hasUrgency: this.detectUrgency(message),
        hasSocialProof: this.detectSocialProof(message),
        hasBenefitFocus: this.detectBenefitFocus(message),
        hasObjectionHandling: this.detectObjectionHandling(message),
        hasCallToAction: this.detectCallToAction(message)
      },
      recommendations: []
    };
    
    // Ajuster la confiance basée sur le score du lead
    if (leadScore > 70) {
      analysis.confidence += 0.2;
    } else if (leadScore < 30) {
      analysis.confidence -= 0.2;
    }
    
    // Ajuster la confiance basée sur le statut
    if (leadStatus === 'CLOSING' || leadStatus === 'INTERESTED') {
      analysis.confidence += 0.1;
    }
    
    // Limiter la confiance
    analysis.confidence = Math.max(0.3, Math.min(1.0, analysis.confidence));
    
    // Générer recommandations
    analysis.recommendations = this.generateRecommendations(analysis);
    
    return analysis;
  }
  
  // Détecter l'urgence dans le message
  detectUrgency(message) {
    const urgencyKeywords = [
      'maintenant', 'aujourd\'hui', 'immédiatement', 'rapidement',
      'dernier', 'final', 'bientôt', 'limité', 'offre', 'urgence'
    ];
    
    const lowerMessage = message.toLowerCase();
    
    return urgencyKeywords.some(keyword => lowerMessage.includes(keyword));
  }
  
  // Détecter la preuve sociale
  detectSocialProof(message) {
    const socialProofKeywords = [
      'clients', 'témoignages', 'avis', 'étoiles', 'notation',
      'satisfaction', 'garantie', 'confiance', 'milliers', 'populaire'
    ];
    
    const lowerMessage = message.toLowerCase();
    
    return socialProofKeywords.some(keyword => lowerMessage.includes(keyword));
  }
  
  // Détecter le focus sur les bénéfices
  detectBenefitFocus(message) {
    const benefitKeywords = [
      'gagner', 'économiser', 'temps', 'argent', 'bénéfice',
      'avantage', 'résultat', 'améliorer', 'optimiser', 'transformer'
    ];
    
    const lowerMessage = message.toLowerCase();
    
    return benefitKeywords.some(keyword => lowerMessage.includes(keyword));
  }
  
  // Détecter la gestion d'objection
  detectObjectionHandling(message) {
    const objectionKeywords = [
      'compris', 'comprendre', 'préoccupation', 'question',
      'doute', 'hésitation', 'incertain', 'réserver', 'annuler'
    ];
    
    const lowerMessage = message.toLowerCase();
    
    return objectionKeywords.some(keyword => lowerMessage.includes(keyword));
  }
  
  // Détecter l'appel à l'action
  detectCallToAction(message) {
    const ctaKeywords = [
      'cliquez', 'contactez', 'appelez', 'répondez', 'acceptez',
      'confirmez', 'validez', 'commencez', 'inscrivez', 'achetez'
    ];
    
    const lowerMessage = message.toLowerCase();
    
    return ctaKeywords.some(keyword => lowerMessage.includes(keyword));
  }
  
  // Générer des recommandations
  generateRecommendations(analysis) {
    const recommendations = [];
    
    if (!analysis.detectedElements.hasUrgency && analysis.leadScore > 60) {
      recommendations.push('add_urgency');
    }
    
    if (!analysis.detectedElements.hasSocialProof && analysis.leadScore > 50) {
      recommendations.push('add_social_proof');
    }
    
    if (!analysis.detectedElements.hasBenefitFocus) {
      recommendations.push('emphasize_benefits');
    }
    
    if (!analysis.detectedElements.hasObjectionHandling && analysis.leadStatus === 'CLOSING') {
      recommendations.push('add_objection_handling');
    }
    
    if (!analysis.detectedElements.hasCallToAction) {
      recommendations.push('add_call_to_action');
    }
    
    return recommendations;
  }
  
  // Sélectionner le type d'amélioration
  selectEnhancementType(analysis) {
    // Prioriser les recommandations basées sur le contexte
    if (analysis.recommendations.includes('add_urgency')) {
      return 'urgency';
    }
    
    if (analysis.recommendations.includes('add_social_proof')) {
      return 'social_proof';
    }
    
    if (analysis.recommendations.includes('emphasize_benefits')) {
      return 'benefit_emphasis';
    }
    
    if (analysis.recommendations.includes('add_objection_handling')) {
      return 'objection_handling';
    }
    
    // Par défaut, ajouter un appel à l'action
    return 'call_to_action';
  }
  
  // Générer le message amélioré
  generateEnhancedMessage(originalMessage, analysis, enhancementType) {
    let enhancedMessage = originalMessage;
    
    switch (enhancementType) {
      case 'urgency':
        enhancedMessage = this.addUrgency(originalMessage, analysis);
        break;
      case 'social_proof':
        enhancedMessage = this.addSocialProof(originalMessage, analysis);
        break;
      case 'benefit_emphasis':
        enhancedMessage = this.emphasizeBenefits(originalMessage, analysis);
        break;
      case 'objection_handling':
        enhancedMessage = this.addObjectionHandling(originalMessage, analysis);
        break;
      case 'call_to_action':
        enhancedMessage = this.addCallToAction(originalMessage, analysis);
        break;
      default:
        enhancedMessage = originalMessage;
    }
    
    return enhancedMessage;
  }
  
  // Ajouter de l'urgence
  addUrgency(message, analysis) {
    const urgencyPhrases = [
      ' ⏰ Offre limitée !',
      ' 🚨 Dernière chance !',
      ' ⏱️ Ne tardez pas !',
      ' 🔥 Action requise maintenant !'
    ];
    
    const phrase = urgencyPhrases[Math.floor(Math.random() * urgencyPhrases.length)];
    
    return message + phrase;
  }
  
  // Ajouter la preuve sociale
  addSocialProof(message, analysis) {
    const socialProofPhrases = [
      ' ✅ Rejoint par +1000 clients satisfaits',
      ' ⭐ 4.9/5 étoiles sur 500 avis',
      ' 🏆 Service primé cette année',
      ' 💪 Confiance de 98% de nos clients'
    ];
    
    const phrase = socialProofPhrases[Math.floor(Math.random() * socialProofPhrases.length)];
    
    return message + ' ' + phrase;
  }
  
  // Mettre l'accent sur les bénéfices
  emphasizeBenefits(message, analysis) {
    const benefitPhrases = [
      ' 💰 Économisez temps et argent',
      ' 📈 Résultats garantis',
      ' 🎯 Transformez votre activité',
      ' ⚡ Optimisez vos processus'
    ];
    
    const phrase = benefitPhrases[Math.floor(Math.random() * benefitPhrases.length)];
    
    return message + ' ' + phrase;
  }
  
  // Ajouter la gestion d'objection
  addObjectionHandling(message, analysis) {
    const objectionPhrases = [
      ' ❓ Questions ? Je suis là pour répondre.',
      ' 🤔 Hésitations ? Parlons-en.',
      ' 💡 Préoccupations ? Nous avons la solution.',
      ' 🛡️ Sans risque : satisfaction garantie.'
    ];
    
    const phrase = objectionPhrases[Math.floor(Math.random() * objectionPhrases.length)];
    
    return message + ' ' + phrase;
  }
  
  // Ajouter un appel à l'action
  addCallToAction(message, analysis) {
    const ctaPhrases = [
      ' 👉 Répondez "oui" pour commencer',
      ' 📲 Contactez-nous maintenant',
      ' ✅ Confirmez votre intérêt',
      ' 🚀 Commencez dès aujourd\'hui'
    ];
    
    const phrase = ctaPhrases[Math.floor(Math.random() * ctaPhrases.length)];
    
    return message + ' ' + phrase;
  }
  
  // Valider le message amélioré
  validateEnhancedMessage(enhancedMessage, originalMessage) {
    // Vérifier que le message n'est pas trop long
    if (enhancedMessage.length > originalMessage.length * 2) {
      return {
        valid: false,
        reason: 'enhanced_message_too_long'
      };
    }
    
    // Vérifier que le message n'est pas trop court
    if (enhancedMessage.length < originalMessage.length * 0.8) {
      return {
        valid: false,
        reason: 'enhanced_message_too_short'
      };
    }
    
    // Vérifier que le message contient toujours le contenu original
    if (!enhancedMessage.includes(originalMessage.substring(0, Math.min(20, originalMessage.length)))) {
      return {
        valid: false,
        reason: 'original_content_lost'
      };
    }
    
    // Vérifier que le message n'est pas vide
    if (enhancedMessage.trim().length === 0) {
      return {
        valid: false,
        reason: 'empty_message'
      };
    }
    
    return {
      valid: true,
      reason: 'valid'
    };
  }
  
  // Wrapper pour utilisation facile
  async enhanceMessage(message, leadStatus, leadScore, conversationHistory, tenant_id, lead_id) {
    const context = {
      message,
      leadStatus,
      leadScore,
      conversationHistory,
      tenant_id,
      lead_id
    };
    
    const result = await this.enhanceClosingMessage(context);
    
    if (result.enhanced) {
      return result.enhancedMessage;
    }
    
    return result.originalMessage;
  }
  
  // Obtenir les stats de l'enhancer
  getEnhancerStats() {
    const totalAttempts = this.stats.totalEnhancements;
    
    return {
      enabled: this.enabled,
      stats: {
        totalEnhancements: this.stats.totalEnhancements,
        successfulEnhancements: this.stats.successfulEnhancements,
        fallbacks: this.stats.fallbacks,
        errors: this.stats.errors,
        successRate: totalAttempts > 0 ? (this.stats.successfulEnhancements / totalAttempts) * 100 : 0
      },
      byType: this.stats.byType,
      enhancementTypes: this.enhancementTypes,
      uptime: process.uptime()
    };
  }
  
  // Health check
  healthCheck() {
    const stats = this.getEnhancerStats();
    
    const health = {
      status: 'healthy',
      enabled: stats.enabled,
      issues: [],
      recommendations: []
    };
    
    // Vérifier taux de succès
    if (stats.stats.successRate < 50 && stats.stats.totalEnhancements > 10) {
      health.issues.push('Low success rate');
      health.recommendations.push('Review enhancement logic and validation');
    }
    
    // Vérifier taux d'erreur
    if (stats.stats.errors > stats.stats.totalEnhancements * 0.2) {
      health.issues.push('High error rate');
      health.recommendations.push('Check enhancement implementation');
    }
    
    // Vérifier taux de fallback
    const fallbackRate = stats.stats.totalEnhancements > 0 ? 
      (stats.stats.fallbacks / stats.stats.totalEnhancements) * 100 : 0;
    
    if (fallbackRate > 30) {
      health.issues.push('High fallback rate');
      health.recommendations.push('Improve message validation and enhancement logic');
    }
    
    if (health.issues.length > 0) {
      health.status = 'warning';
    }
    
    return {
      ...health,
      stats: {
        successRate: Math.round(stats.stats.successRate * 100) / 100,
        errorRate: stats.stats.totalEnhancements > 0 ? 
          Math.round((stats.stats.errors / stats.stats.totalEnhancements) * 10000) / 100 : 0,
        fallbackRate: Math.round(fallbackRate * 100) / 100
      }
    };
  }
  
  // Réinitialiser stats
  resetStats() {
    this.stats = {
      totalEnhancements: 0,
      successfulEnhancements: 0,
      fallbacks: 0,
      errors: 0,
      byType: {}
    };
    
    console.log('[CLOSING_ENHANCER_STATS_RESET]');
  }
}

// Instance globale de l'enhancer
if (!global.closingEnhancer) {
  global.closingEnhancer = new ClosingEnhancer();
}

// Fonctions principales
async function enhanceClosingMessage(context) {
  return await global.closingEnhancer.enhanceClosingMessage(context);
}

async function enhanceMessage(message, leadStatus, leadScore, conversationHistory, tenant_id, lead_id) {
  return await global.closingEnhancer.enhanceMessage(message, leadStatus, leadScore, conversationHistory, tenant_id, lead_id);
}

// Stats et monitoring
function getEnhancerStats() {
  return global.closingEnhancer.getEnhancerStats();
}

function enhancerHealthCheck() {
  return global.closingEnhancer.healthCheck();
}

// Administration
function resetEnhancerStats() {
  return global.closingEnhancer.resetStats();
}

module.exports = {
  enhanceClosingMessage,
  enhanceMessage,
  getEnhancerStats,
  enhancerHealthCheck,
  resetEnhancerStats,
  ClosingEnhancer
};
