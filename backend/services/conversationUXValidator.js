// ACTION 6 - Validation UX conversation

const { getFlag } = require('./envFlags');
const { getTrace, getTraceByPhone } = require('./traceManager');
const { recordFrictionPoint } = require('./realValidationLogger');

// Validateur UX pour conversations (SAFE - analyse non intrusive)
class ConversationUXValidator {
  constructor() {
    this.testModeEnabled = getFlag('AGENT_TEST_MODE');
    this.realValidationEnabled = getFlag('AGENT_REAL_VALIDATION_MODE');
    this.stats = {
      totalValidations: 0,
      conversationsAnalyzed: 0,
      frictionPointsDetected: 0,
      avgMessagesBeforeEngagement: 0,
      avgResponseTime: 0,
      dropOffCount: 0
    };
    
    console.log('[CONVERSATION_UX_VALIDATOR_INITIALIZED]', {
      testModeEnabled: this.testModeEnabled,
      realValidationEnabled: this.realValidationEnabled
    });
  }
  
  // Analyser une conversation complète
  analyzeConversation(traceId, phone = null) {
    if (!this.testModeEnabled && !this.realValidationEnabled) {
      return { enabled: false };
    }
    
    this.stats.totalValidations++;
    
    try {
      // Obtenir la trace
      let trace;
      if (traceId) {
        trace = getTrace(traceId);
      } else if (phone) {
        trace = getTraceByPhone(phone);
      } else {
        return { error: 'traceId or phone required' };
      }
      
      if (!trace.enabled && trace.error) {
        return { error: 'Trace not found' };
      }
      
      // Analyser les étapes de la conversation
      const analysis = this.performConversationAnalysis(trace);
      
      // Mettre à jour les stats
      this.updateStats(analysis);
      
      // Logger les points de friction détectés
      if (analysis.frictionPoints.length > 0) {
        analysis.frictionPoints.forEach(friction => {
          recordFrictionPoint(
            trace.phone || phone,
            trace.tenant_id,
            trace.leadId,
            friction.type,
            friction.details
          );
        });
      }
      
      console.log('[CONVERSATION_UX_ANALYSIS_COMPLETED]', {
        traceId: traceId || 'by_phone',
        phone: this.maskPhone(trace.phone || phone),
        messagesCount: analysis.messagesCount,
        engagementLevel: analysis.engagementLevel,
        frictionPoints: analysis.frictionPoints.length
      });
      
      return {
        success: true,
        traceId: traceId || trace.traceId,
        analysis,
        metadata: {
          analyzedAt: new Date(),
          environment: this.getEnvironment()
        }
      };
      
    } catch (error) {
      console.log('[CONVERSATION_UX_ANALYSIS_ERROR]', {
        traceId,
        phone: this.maskPhone(phone),
        error: error.message
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // Effectuer l'analyse de conversation
  performConversationAnalysis(trace) {
    const steps = trace.steps || [];
    
    // Extraire les messages et réponses
    const messages = this.extractMessages(steps);
    const responses = this.extractResponses(steps);
    
    // Calculer les métriques
    const metrics = {
      messagesCount: messages.length,
      responsesCount: responses.length,
      totalExchanges: Math.min(messages.length, responses.length),
      conversationDuration: this.calculateConversationDuration(steps),
      avgResponseTime: this.calculateAverageResponseTime(messages, responses),
      messagesBeforeEngagement: this.calculateMessagesBeforeEngagement(steps),
      dropOffDetected: this.detectDropOff(steps),
      frictionPoints: this.detectFrictionPoints(steps, messages, responses)
    };
    
    // Déterminer le niveau d'engagement
    metrics.engagementLevel = this.calculateEngagementLevel(metrics);
    
    // Déterminer la qualité de la conversation
    metrics.conversationQuality = this.calculateConversationQuality(metrics);
    
    return metrics;
  }
  
  // Extraire les messages sortants
  extractMessages(steps) {
    return steps.filter(step => 
      step.step.includes('message') || 
      step.step.includes('outbound') ||
      step.step.includes('whatsapp_send')
    ).map(step => ({
      timestamp: new Date(step.timestamp),
      type: 'outbound',
      content: step.data?.message || step.data?.contentPreview || '',
      messageType: step.data?.messageType || 'unknown'
    }));
  }
  
  // Extraire les réponses entrantes
  extractResponses(steps) {
    return steps.filter(step => 
      step.step.includes('reply') || 
      step.step.includes('inbound') ||
      step.step.includes('whatsapp_received') ||
      step.step.includes('user_reply')
    ).map(step => ({
      timestamp: new Date(step.timestamp),
      type: 'inbound',
      content: step.data?.userMessage || step.data?.message || '',
      responseTime: step.data?.responseLatency
    }));
  }
  
  // Calculer la durée de la conversation
  calculateConversationDuration(steps) {
    if (steps.length < 2) return 0;
    
    const firstStep = new Date(steps[0].timestamp);
    const lastStep = new Date(steps[steps.length - 1].timestamp);
    
    return lastStep - firstStep;
  }
  
  // Calculer le temps de réponse moyen
  calculateAverageResponseTime(messages, responses) {
    if (responses.length === 0) return 0;
    
    const responseTimes = responses
      .filter(response => response.responseTime)
      .map(response => response.responseTime);
    
    if (responseTimes.length === 0) return 0;
    
    return Math.round(responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length);
  }
  
  // Calculer le nombre de messages avant engagement
  calculateMessagesBeforeEngagement(steps) {
    // Chercher le premier signe d'engagement
    const engagementSteps = steps.filter(step => 
      step.step.includes('engaged') ||
      step.step.includes('interest') ||
      step.step.includes('positive_response')
    );
    
    if (engagementSteps.length === 0) {
      // Compter tous les messages sortants
      return steps.filter(step => 
        step.step.includes('message') || step.step.includes('outbound')
      ).length;
    }
    
    const firstEngagement = engagementSteps[0];
    const engagementTime = new Date(firstEngagement.timestamp);
    
    // Compter les messages avant l'engagement
    return steps.filter(step => {
      const stepTime = new Date(step.timestamp);
      return stepTime < engagementTime && 
        (step.step.includes('message') || step.step.includes('outbound'));
    }).length;
  }
  
  // Détecter un abandon (drop-off)
  detectDropOff(steps) {
    if (steps.length < 2) return false;
    
    // Vérifier si le dernier message était sortant sans réponse
    const lastSteps = steps.slice(-3); // Derniers 3 steps
    
    let lastOutboundTime = null;
    let hasResponse = false;
    
    for (let i = lastSteps.length - 1; i >= 0; i--) {
      const step = lastSteps[i];
      
      if (step.step.includes('reply') || step.step.includes('inbound')) {
        hasResponse = true;
        break;
      }
      
      if ((step.step.includes('message') || step.step.includes('outbound')) && !lastOutboundTime) {
        lastOutboundTime = new Date(step.timestamp);
      }
    }
    
    if (!lastOutboundTime || hasResponse) return false;
    
    // Vérifier si ça fait plus de 24h sans réponse
    const timeSinceLastOutbound = Date.now() - lastOutboundTime.getTime();
    const dropOffThreshold = 24 * 60 * 60 * 1000; // 24 heures
    
    return timeSinceLastOutbound > dropOffThreshold;
  }
  
  // Détecter les points de friction
  detectFrictionPoints(steps, messages, responses) {
    const frictionPoints = [];
    
    // Friction 1: Trop de messages avant engagement
    if (messages.length > 3 && responses.length === 0) {
      frictionPoints.push({
        type: 'too_many_messages_no_response',
        severity: 'medium',
        description: `${messages.length} messages sent without any response`,
        details: {
          messagesCount: messages.length,
          responsesCount: responses.length
        }
      });
    }
    
    // Friction 2: Temps de réponse très long
    const avgResponseTime = this.calculateAverageResponseTime(messages, responses);
    if (avgResponseTime > 300000) { // Plus de 5 minutes
      frictionPoints.push({
        type: 'slow_response_time',
        severity: 'low',
        description: `Average response time is ${Math.round(avgResponseTime / 1000 / 60)} minutes`,
        details: {
          avgResponseTime: avgResponseTime
        }
      });
    }
    
    // Friction 3: Abandon détecté
    if (this.detectDropOff(steps)) {
      frictionPoints.push({
        type: 'conversation_drop_off',
        severity: 'high',
        description: 'User stopped responding after last message',
        details: {
          lastMessageTime: steps[steps.length - 1]?.timestamp
        }
      });
    }
    
    // Friction 4: Nombre élevé d'échanges sans progression
    if (messages.length > 5 && responses.length > 5) {
      const hasProgression = steps.some(step => 
        step.step.includes('engaged') ||
        step.step.includes('closing') ||
        step.step.includes('payment')
      );
      
      if (!hasProgression) {
        frictionPoints.push({
          type: 'many_exchanges_no_progression',
          severity: 'medium',
          description: `${messages.length} exchanges without progression to closing`,
          details: {
            messagesCount: messages.length,
            responsesCount: responses.length
          }
        });
      }
    }
    
    // Friction 5: Questions répétées
    const questionKeywords = ['?', 'comment', 'pourquoi', 'prix', 'coût', 'tarif'];
    const questions = responses.filter(response => 
      questionKeywords.some(keyword => 
        response.content.toLowerCase().includes(keyword)
      )
    );
    
    if (questions.length > 2) {
      frictionPoints.push({
        type: 'repeated_questions',
        severity: 'low',
        description: `User asked ${questions.length} questions, possible confusion`,
        details: {
          questionsCount: questions.length
        }
      });
    }
    
    return frictionPoints;
  }
  
  // Calculer le niveau d'engagement
  calculateEngagementLevel(metrics) {
    let score = 0;
    
    // Score basé sur les réponses
    if (metrics.responsesCount >= 1) score += 2;
    if (metrics.responsesCount >= 2) score += 2;
    if (metrics.responsesCount >= 3) score += 1;
    
    // Score basé sur le temps de réponse
    if (metrics.avgResponseTime > 0 && metrics.avgResponseTime < 60000) score += 2; // < 1 min
    else if (metrics.avgResponseTime > 0 && metrics.avgResponseTime < 300000) score += 1; // < 5 min
    
    // Pénalité pour l'abandon
    if (metrics.dropOffDetected) score -= 3;
    
    // Pénalité pour trop de messages sans réponse
    if (metrics.messagesCount > 3 && metrics.responsesCount === 0) score -= 2;
    
    if (score >= 5) return 'high';
    if (score >= 3) return 'medium';
    if (score >= 1) return 'low';
    return 'none';
  }
  
  // Calculer la qualité de la conversation
  calculateConversationQuality(metrics) {
    let score = 10; // Score de départ
    
    // Déductions pour les problèmes
    if (metrics.dropOffDetected) score -= 3;
    if (metrics.avgResponseTime > 300000) score -= 2; // > 5 min
    if (metrics.messagesCount > 5 && metrics.responsesCount === 0) score -= 2;
    
    // Bonus pour les bons signaux
    if (metrics.responsesCount >= 2) score += 1;
    if (metrics.avgResponseTime > 0 && metrics.avgResponseTime < 60000) score += 1; // < 1 min
    
    // Points de friction
    score -= metrics.frictionPoints.length;
    
    score = Math.max(0, Math.min(10, score));
    
    if (score >= 8) return 'excellent';
    if (score >= 6) return 'good';
    if (score >= 4) return 'fair';
    return 'poor';
  }
  
  // Mettre à jour les statistiques
  updateStats(analysis) {
    this.stats.conversationsAnalyzed++;
    
    // Mettre à jour les moyennes
    const totalConversations = this.stats.conversationsAnalyzed;
    
    // Moyenne messages avant engagement
    this.stats.avgMessagesBeforeEngagement = 
      ((this.stats.avgMessagesBeforeEngagement * (totalConversations - 1)) + analysis.messagesBeforeEngagement) / totalConversations;
    
    // Moyenne temps de réponse
    this.stats.avgResponseTime = 
      ((this.stats.avgResponseTime * (totalConversations - 1)) + analysis.avgResponseTime) / totalConversations;
    
    // Compteurs
    if (analysis.dropOffDetected) {
      this.stats.dropOffCount++;
    }
    
    this.stats.frictionPointsDetected += analysis.frictionPoints.length;
  }
  
  // Obtenir les statistiques du validateur
  getValidatorStats() {
    if (!this.testModeEnabled && !this.realValidationEnabled) {
      return { enabled: false };
    }
    
    return {
      enabled: true,
      environment: this.getEnvironment(),
      stats: {
        totalValidations: this.stats.totalValidations,
        conversationsAnalyzed: this.stats.conversationsAnalyzed,
        frictionPointsDetected: this.stats.frictionPointsDetected,
        avgMessagesBeforeEngagement: Math.round(this.stats.avgMessagesBeforeEngagement * 100) / 100,
        avgResponseTime: Math.round(this.stats.avgResponseTime),
        dropOffCount: this.stats.dropOffCount,
        dropOffRate: this.stats.conversationsAnalyzed > 0 ? 
          (this.stats.dropOffCount / this.stats.conversationsAnalyzed) * 100 : 0
      },
      uptime: process.uptime()
    };
  }
  
  // Obtenir le rapport de validation UX
  getUXValidationReport() {
    if (!this.testModeEnabled && !this.realValidationEnabled) {
      return { enabled: false };
    }
    
    const stats = this.getValidatorStats();
    
    // Générer des recommandations
    const recommendations = this.generateUXRecommendations(stats);
    
    return {
      enabled: true,
      environment: this.getEnvironment(),
      stats: stats.stats,
      recommendations,
      metadata: {
        generated_at: new Date(),
        validation_type: 'conversation_ux'
      }
    };
  }
  
  // Générer des recommandations UX
  generateUXRecommendations(stats) {
    const recommendations = [];
    
    if (stats.stats.avgMessagesBeforeEngagement > 2.5) {
      recommendations.push({
        type: 'warning',
        message: `High average messages before engagement (${stats.stats.avgMessagesBeforeEngagement})`,
        action: 'Improve initial message to encourage faster response',
        priority: 'medium'
      });
    }
    
    if (stats.stats.avgResponseTime > 180000) { // > 3 minutes
      recommendations.push({
        type: 'info',
        message: `Slow average response time (${Math.round(stats.stats.avgResponseTime / 1000 / 60)} minutes)`,
        action: 'Consider faster response times or automated responses',
        priority: 'low'
      });
    }
    
    if (stats.stats.dropOffRate > 30) {
      recommendations.push({
        type: 'critical',
        message: `High drop-off rate (${Math.round(stats.stats.dropOffRate)}%)`,
        action: 'Review conversation flow and improve engagement',
        priority: 'high'
      });
    }
    
    if (stats.stats.frictionPointsDetected > stats.stats.conversationsAnalyzed) {
      recommendations.push({
        type: 'warning',
        message: 'Multiple friction points per conversation',
        action: 'Simplify conversation flow and reduce complexity',
        priority: 'medium'
      });
    }
    
    if (stats.stats.conversationsAnalyzed === 0) {
      recommendations.push({
        type: 'info',
        message: 'No conversations analyzed yet',
        action: 'Enable real validation mode to analyze real conversations',
        priority: 'low'
      });
    }
    
    return recommendations;
  }
  
  // Obtenir l'environnement actuel
  getEnvironment() {
    if (this.realValidationEnabled) {
      return 'real';
    } else if (this.testModeEnabled) {
      return 'test';
    } else {
      return 'production';
    }
  }
  
  // Masquer téléphone pour logs
  maskPhone(phone) {
    if (!phone || typeof phone !== 'string') return 'unknown';
    return phone.slice(0, -4) + '****';
  }
  
  // Réinitialiser les stats
  resetStats() {
    this.stats = {
      totalValidations: 0,
      conversationsAnalyzed: 0,
      frictionPointsDetected: 0,
      avgMessagesBeforeEngagement: 0,
      avgResponseTime: 0,
      dropOffCount: 0
    };
    
    console.log('[CONVERSATION_UX_VALIDATOR_STATS_RESET]');
  }
}

// Instance globale du validateur UX
if (!global.conversationUXValidator) {
  global.conversationUXValidator = new ConversationUXValidator();
}

// Fonctions principales
function analyzeConversation(traceId, phone) {
  return global.conversationUXValidator.analyzeConversation(traceId, phone);
}

// Stats et monitoring
function getUXValidatorStats() {
  return global.conversationUXValidator.getValidatorStats();
}

function getUXValidationReport() {
  return global.conversationUXValidator.getUXValidationReport();
}

// Administration
function resetUXValidatorStats() {
  return global.conversationUXValidator.resetStats();
}

module.exports = {
  analyzeConversation,
  getUXValidatorStats,
  getUXValidationReport,
  resetUXValidatorStats,
  ConversationUXValidator
};
