// ACTION 8 - Détection friction

const { getFlag } = require('./envFlags');
const { getTrace, getTraceByPhone } = require('./traceManager');
const { recordFrictionPoint } = require('./realValidationLogger');

// Détecteur de points de friction (SAFE - analyse non intrusive)
class FrictionDetector {
  constructor() {
    this.testModeEnabled = getFlag('AGENT_TEST_MODE');
    this.realValidationEnabled = getFlag('AGENT_REAL_VALIDATION_MODE');
    this.stats = {
      totalDetections: 0,
      frictionPoints: 0,
      byType: new Map(),
      bySeverity: new Map(),
      resolvedPoints: 0
    };
    
    console.log('[FRICTION_DETECTOR_INITIALIZED]', {
      testModeEnabled: this.testModeEnabled,
      realValidationEnabled: this.realValidationEnabled
    });
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
  
  // Détecter les points de friction dans une conversation
  detectFrictionPoints(traceId, phone = null) {
    if (!this.testModeEnabled && !this.realValidationEnabled) {
      return { enabled: false };
    }
    
    this.stats.totalDetections++;
    
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
      
      // Analyser les points de friction
      const frictionAnalysis = this.analyzeFrictionPoints(trace);
      
      // Enregistrer les points de friction détectés
      frictionAnalysis.frictionPoints.forEach(friction => {
        this.recordFrictionPoint(trace.phone || phone, trace.tenant_id, trace.leadId, friction);
      });
      
      console.log('[FRICTION_DETECTION_COMPLETED]', {
        traceId: traceId || 'by_phone',
        phone: this.maskPhone(trace.phone || phone),
        frictionPointsCount: frictionAnalysis.frictionPoints.length,
        severity: frictionAnalysis.overallSeverity
      });
      
      return {
        success: true,
        traceId: traceId || trace.traceId,
        analysis: frictionAnalysis,
        metadata: {
          detectedAt: new Date(),
          environment: this.getEnvironment()
        }
      };
      
    } catch (error) {
      console.log('[FRICTION_DETECTION_ERROR]', {
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
  
  // Analyser les points de friction
  analyzeFrictionPoints(trace) {
    const steps = trace.steps || [];
    const frictionPoints = [];
    
    // Friction 1: Utilisateur répond mais ne convertit pas
    const noConversionFriction = this.detectNoConversionFriction(steps);
    if (noConversionFriction) {
      frictionPoints.push(noConversionFriction);
    }
    
    // Friction 2: Plusieurs échanges sans closing
    const manyExchangesFriction = this.detectManyExchangesFriction(steps);
    if (manyExchangesFriction) {
      frictionPoints.push(manyExchangesFriction);
    }
    
    // Friction 3: Silence après message clé
    const silenceAfterKeyFriction = this.detectSilenceAfterKeyMessage(steps);
    if (silenceAfterKeyFriction) {
      frictionPoints.push(silenceAfterKeyFriction);
    }
    
    // Friction 4: Répétition de questions
    const repeatedQuestionsFriction = this.detectRepeatedQuestionsFriction(steps);
    if (repeatedQuestionsFriction) {
      frictionPoints.push(repeatedQuestionsFriction);
    }
    
    // Friction 5: Long temps de réponse
    const slowResponseFriction = this.detectSlowResponseFriction(steps);
    if (slowResponseFriction) {
      frictionPoints.push(slowResponseFriction);
    }
    
    // Friction 6: Abandon soudain
    const suddenDropOffFriction = this.detectSuddenDropOffFriction(steps);
    if (suddenDropOffFriction) {
      frictionPoints.push(suddenDropOffFriction);
    }
    
    // Calculer la sévérité globale
    const overallSeverity = this.calculateOverallSeverity(frictionPoints);
    
    // Calculer le score de friction
    const frictionScore = this.calculateFrictionScore(frictionPoints);
    
    return {
      frictionPoints,
      overallSeverity,
      frictionScore,
      recommendations: this.generateFrictionRecommendations(frictionPoints),
      summary: {
        totalPoints: frictionPoints.length,
        byType: this.groupByType(frictionPoints),
        bySeverity: this.groupBySeverity(frictionPoints)
      }
    };
  }
  
  // Détecter: utilisateur répond mais ne convertit pas
  detectNoConversionFriction(steps) {
    const userResponses = steps.filter(step => 
      step.step.includes('reply') || step.step.includes('inbound')
    );
    
    const outboundMessages = steps.filter(step => 
      step.step.includes('message') || step.step.includes('outbound')
    );
    
    const closingAttempts = steps.filter(step => 
      step.step.includes('closing') || step.step.includes('payment')
    );
    
    // Si l'utilisateur a répondu plusieurs fois mais pas de closing
    if (userResponses.length >= 2 && outboundMessages.length >= 3 && closingAttempts.length === 0) {
      return {
        type: 'user_responds_no_conversion',
        severity: 'medium',
        description: `User responded ${userResponses.length} times but no closing attempt`,
        details: {
          userResponses: userResponses.length,
          outboundMessages: outboundMessages.length,
          closingAttempts: closingAttempts.length,
          lastResponseTime: userResponses[userResponses.length - 1]?.timestamp
        },
        recommendation: 'Consider more direct closing approach after 2 responses'
      };
    }
    
    return null;
  }
  
  // Détecter: plusieurs échanges sans closing
  detectManyExchangesFriction(steps) {
    const exchanges = this.extractExchanges(steps);
    
    if (exchanges.length >= 5) {
      const hasClosing = steps.some(step => 
        step.step.includes('closing') || step.step.includes('payment')
      );
      
      if (!hasClosing) {
        return {
          type: 'many_exchanges_no_closing',
          severity: 'high',
          description: `${exchanges.length} exchanges without closing progression`,
          details: {
            exchangesCount: exchanges.length,
            duration: this.calculateConversationDuration(steps),
            lastExchangeTime: exchanges[exchanges.length - 1]?.timestamp
          },
          recommendation: 'Introduce closing after 3-4 exchanges'
        };
      }
    }
    
    return null;
  }
  
  // Détecter: silence après message clé
  detectSilenceAfterKeyMessage(steps) {
    const keyMessageSteps = steps.filter(step => 
      step.step.includes('payment') || 
      step.step.includes('closing') ||
      step.step.includes('proposal') ||
      step.step.includes('offer')
    );
    
    for (const keyStep of keyMessageSteps) {
      const keyMessageTime = new Date(keyStep.timestamp);
      const nextSteps = steps.filter(step => 
        new Date(step.timestamp) > keyMessageTime
      );
      
      // Vérifier s'il y a eu une réponse dans les 24h
      const hasResponse = nextSteps.some(step => 
        step.step.includes('reply') || step.step.includes('inbound')
      );
      
      if (!hasResponse) {
        const timeSinceKeyMessage = Date.now() - keyMessageTime.getTime();
        const hoursSinceKeyMessage = timeSinceKeyMessage / (1000 * 60 * 60);
        
        if (hoursSinceKeyMessage > 24) {
          return {
            type: 'silence_after_key_message',
            severity: 'high',
            description: `No response for ${Math.round(hoursSinceKeyMessage)} hours after key message`,
            details: {
              keyMessageType: keyStep.step,
              keyMessageTime: keyStep.timestamp,
              hoursSinceKeyMessage: Math.round(hoursSinceKeyMessage * 100) / 100
            },
            recommendation: 'Follow up after 24 hours of silence after key message'
          };
        }
      }
    }
    
    return null;
  }
  
  // Détecter: répétition de questions
  detectRepeatedQuestionsFriction(steps) {
    const userResponses = steps.filter(step => 
      step.step.includes('reply') || step.step.includes('inbound')
    );
    
    const questionKeywords = ['?', 'comment', 'pourquoi', 'prix', 'coût', 'tarif', 'how much', 'how to'];
    const questions = userResponses.filter(response => {
      const content = response.data?.userMessage || response.data?.message || '';
      return questionKeywords.some(keyword => 
        content.toLowerCase().includes(keyword)
      );
    });
    
    if (questions.length >= 3) {
      return {
        type: 'repeated_questions',
        severity: 'medium',
        description: `User asked ${questions.length} questions, possible confusion`,
        details: {
          questionsCount: questions.length,
          totalResponses: userResponses.length,
          questionTypes: this.extractQuestionTypes(questions)
        },
        recommendation: 'Provide clearer information or FAQ to reduce repeated questions'
      };
    }
    
    return null;
  }
  
  // Détecter: long temps de réponse
  detectSlowResponseFriction(steps) {
    const exchanges = this.extractExchanges(steps);
    const responseTimes = [];
    
    for (const exchange of exchanges) {
      if (exchange.response && exchange.outbound) {
        const responseTime = new Date(exchange.response.timestamp) - new Date(exchange.outbound.timestamp);
        responseTimes.push(responseTime);
      }
    }
    
    if (responseTimes.length > 0) {
      const avgResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
      
      // Si le temps de réponse moyen est > 10 minutes
      if (avgResponseTime > 10 * 60 * 1000) {
        return {
          type: 'slow_response_time',
          severity: 'low',
          description: `Average response time is ${Math.round(avgResponseTime / 1000 / 60)} minutes`,
          details: {
            avgResponseTime: Math.round(avgResponseTime / 1000),
            maxResponseTime: Math.round(Math.max(...responseTimes) / 1000),
            responseCount: responseTimes.length
          },
          recommendation: 'Consider faster response times or automated responses'
        };
      }
    }
    
    return null;
  }
  
  // Détecter: abandon soudain
  detectSuddenDropOffFriction(steps) {
    if (steps.length < 3) return null;
    
    const lastSteps = steps.slice(-3);
    let lastOutboundTime = null;
    let hasRecentResponse = false;
    
    for (let i = lastSteps.length - 1; i >= 0; i--) {
      const step = lastSteps[i];
      
      if (step.step.includes('reply') || step.step.includes('inbound')) {
        const stepTime = new Date(step.timestamp);
        const timeSinceStep = Date.now() - stepTime.getTime();
        
        if (timeSinceStep < 24 * 60 * 60 * 1000) { // 24 heures
          hasRecentResponse = true;
          break;
        }
      }
      
      if ((step.step.includes('message') || step.step.includes('outbound')) && !lastOutboundTime) {
        lastOutboundTime = new Date(step.timestamp);
      }
    }
    
    if (lastOutboundTime && !hasRecentResponse) {
      const timeSinceLastOutbound = Date.now() - lastOutboundTime.getTime();
      const hoursSinceLastOutbound = timeSinceLastOutbound / (1000 * 60 * 60);
      
      if (hoursSinceLastOutbound > 48) { // Plus de 48h
        return {
          type: 'sudden_drop_off',
          severity: 'high',
          description: `No response for ${Math.round(hoursSinceLastOutbound)} hours after last message`,
          details: {
            lastOutboundTime: lastOutboundTime,
            hoursSinceLastOutbound: Math.round(hoursSinceLastOutbound * 100) / 100
          },
          recommendation: 'Consider re-engagement campaign or lead qualification'
        };
      }
    }
    
    return null;
  }
  
  // Extraire les échanges conversationnels
  extractExchanges(steps) {
    const exchanges = [];
    let currentExchange = {};
    
    for (const step of steps) {
      if (step.step.includes('message') || step.step.includes('outbound')) {
        if (currentExchange.outbound) {
          exchanges.push({ ...currentExchange });
          currentExchange = {};
        }
        currentExchange.outbound = step;
      } else if (step.step.includes('reply') || step.step.includes('inbound')) {
        currentExchange.response = step;
      }
    }
    
    if (currentExchange.outbound) {
      exchanges.push(currentExchange);
    }
    
    return exchanges;
  }
  
  // Calculer la durée de conversation
  calculateConversationDuration(steps) {
    if (steps.length < 2) return 0;
    
    const firstStep = new Date(steps[0].timestamp);
    const lastStep = new Date(steps[steps.length - 1].timestamp);
    
    return lastStep - firstStep;
  }
  
  // Extraire les types de questions
  extractQuestionTypes(questions) {
    const types = [];
    
    for (const question of questions) {
      const content = question.data?.userMessage || question.data?.message || '';
      
      if (content.includes('prix') || content.includes('coût') || content.includes('tarif')) {
        types.push('price');
      } else if (content.includes('comment') || content.includes('how to')) {
        types.push('how_to');
      } else if (content.includes('pourquoi') || content.includes('why')) {
        types.push('why');
      } else {
        types.push('general');
      }
    }
    
    return [...new Set(types)];
  }
  
  // Calculer la sévérité globale
  calculateOverallSeverity(frictionPoints) {
    if (frictionPoints.length === 0) return 'none';
    
    const severityScores = { critical: 4, high: 3, medium: 2, low: 1 };
    let totalScore = 0;
    
    for (const friction of frictionPoints) {
      totalScore += severityScores[friction.severity] || 0;
    }
    
    const avgScore = totalScore / frictionPoints.length;
    
    if (avgScore >= 3.5) return 'critical';
    if (avgScore >= 2.5) return 'high';
    if (avgScore >= 1.5) return 'medium';
    return 'low';
  }
  
  // Calculer le score de friction
  calculateFrictionScore(frictionPoints) {
    const severityScores = { critical: 10, high: 7, medium: 4, low: 1 };
    
    return frictionPoints.reduce((total, friction) => {
      return total + (severityScores[friction.severity] || 0);
    }, 0);
  }
  
  // Grouper par type
  groupByType(frictionPoints) {
    const grouped = {};
    
    for (const friction of frictionPoints) {
      if (!grouped[friction.type]) {
        grouped[friction.type] = 0;
      }
      grouped[friction.type]++;
    }
    
    return grouped;
  }
  
  // Grouper par sévérité
  groupBySeverity(frictionPoints) {
    const grouped = { critical: 0, high: 0, medium: 0, low: 0 };
    
    for (const friction of frictionPoints) {
      if (grouped[friction.severity] !== undefined) {
        grouped[friction.severity]++;
      }
    }
    
    return grouped;
  }
  
  // Générer des recommandations
  generateFrictionRecommendations(frictionPoints) {
    const recommendations = [];
    const types = frictionPoints.map(f => f.type);
    
    if (types.includes('user_responds_no_conversion')) {
      recommendations.push({
        type: 'closing_strategy',
        message: 'Users respond but don\'t convert',
        action: 'Implement more direct closing approach after 2 responses',
        priority: 'high'
      });
    }
    
    if (types.includes('many_exchanges_no_closing')) {
      recommendations.push({
        type: 'conversation_flow',
        message: 'Too many exchanges without closing',
        action: 'Introduce closing after 3-4 exchanges',
        priority: 'high'
      });
    }
    
    if (types.includes('silence_after_key_message')) {
      recommendations.push({
        type: 'follow_up_strategy',
        message: 'Silence after key messages',
        action: 'Implement 24h follow-up after key messages',
        priority: 'medium'
      });
    }
    
    if (types.includes('repeated_questions')) {
      recommendations.push({
        type: 'content_improvement',
        message: 'Users ask repeated questions',
        action: 'Provide clearer information or FAQ',
        priority: 'medium'
      });
    }
    
    if (types.includes('slow_response_time')) {
      recommendations.push({
        type: 'response_time',
        message: 'Slow response times detected',
        action: 'Consider faster response times or automated responses',
        priority: 'low'
      });
    }
    
    if (types.includes('sudden_drop_off')) {
      recommendations.push({
        type: 're_engagement',
        message: 'Sudden drop-off detected',
        action: 'Consider re-engagement campaign',
        priority: 'high'
      });
    }
    
    return recommendations;
  }
  
  // Enregistrer un point de friction
  recordFrictionPoint(phone, tenant_id, lead_id, friction) {
    this.stats.frictionPoints++;
    
    // Stats par type
    this.stats.byType.set(friction.type, (this.stats.byType.get(friction.type) || 0) + 1);
    
    // Stats par sévérité
    this.stats.bySeverity.set(friction.severity, (this.stats.bySeverity.get(friction.severity) || 0) + 1);
    
    // Logger via realValidationLogger
    recordFrictionPoint(phone, tenant_id, lead_id, friction.type, friction.details);
    
    console.log('[FRICTION_POINT_RECORDED]', {
      phone: this.maskPhone(phone),
      tenant_id,
      lead_id,
      type: friction.type,
      severity: friction.severity
    });
  }
  
  // Obtenir les statistiques du détecteur
  getDetectorStats() {
    if (!this.testModeEnabled && !this.realValidationEnabled) {
      return { enabled: false };
    }
    
    const totalDetections = this.stats.totalDetections;
    const detectionRate = totalDetections > 0 ? 
      (this.stats.frictionPoints / totalDetections) * 100 : 0;
    
    return {
      enabled: true,
      environment: this.getEnvironment(),
      stats: {
        totalDetections: this.stats.totalDetections,
        frictionPoints: this.stats.frictionPoints,
        resolvedPoints: this.stats.resolvedPoints,
        detectionRate: Math.round(detectionRate * 100) / 100
      },
      byType: Object.fromEntries(this.stats.byType),
      bySeverity: Object.fromEntries(this.stats.bySeverity),
      uptime: process.uptime()
    };
  }
  
  // Obtenir le rapport de friction
  getFrictionReport() {
    if (!this.testModeEnabled && !this.realValidationEnabled) {
      return { enabled: false };
    }
    
    const stats = this.getDetectorStats();
    
    // Analyser les patterns
    const patterns = this.analyzeFrictionPatterns();
    
    // Générer des recommandations globales
    const globalRecommendations = this.generateGlobalRecommendations(stats, patterns);
    
    return {
      enabled: true,
      environment: this.getEnvironment(),
      stats: stats.stats,
      patterns,
      recommendations: globalRecommendations,
      metadata: {
        generated_at: new Date(),
        detection_types: Object.keys(stats.byType)
      }
    };
  }
  
  // Analyser les patterns de friction
  analyzeFrictionPatterns() {
    const patterns = {
      mostCommonType: null,
      mostCommonSeverity: null,
      criticalIssues: 0,
      trends: []
    };
    
    // Type le plus commun
    let maxCount = 0;
    for (const [type, count] of this.stats.byType.entries()) {
      if (count > maxCount) {
        maxCount = count;
        patterns.mostCommonType = { type, count };
      }
    }
    
    // Sévérité la plus commune
    maxCount = 0;
    for (const [severity, count] of this.stats.bySeverity.entries()) {
      if (count > maxCount) {
        maxCount = count;
        patterns.mostCommonSeverity = { severity, count };
      }
    }
    
    // Issues critiques
    patterns.criticalIssues = this.stats.bySeverity.get('critical') || 0;
    
    return patterns;
  }
  
  // Générer des recommandations globales
  generateGlobalRecommendations(stats, patterns) {
    const recommendations = [];
    
    if (patterns.criticalIssues > 0) {
      recommendations.push({
        type: 'critical',
        message: `${patterns.criticalIssues} critical friction points detected`,
        action: 'Address critical issues immediately',
        priority: 'critical'
      });
    }
    
    if (patterns.mostCommonType) {
      recommendations.push({
        type: 'pattern',
        message: `Most common friction: ${patterns.mostCommonType.type}`,
        action: `Focus on resolving ${patterns.mostCommonType.type} issues`,
        priority: 'high'
      });
    }
    
    if (stats.stats.detectionRate > 80) {
      recommendations.push({
        type: 'optimization',
        message: 'High friction detection rate',
        action: 'Review and optimize conversation flow',
        priority: 'medium'
      });
    }
    
    return recommendations;
  }
  
  // Réinitialiser les stats
  resetStats() {
    this.stats = {
      totalDetections: 0,
      frictionPoints: 0,
      byType: new Map(),
      bySeverity: new Map(),
      resolvedPoints: 0
    };
    
    console.log('[FRICTION_DETECTOR_STATS_RESET]');
  }
  
  // Masquer téléphone pour logs
  maskPhone(phone) {
    if (!phone || typeof phone !== 'string') return 'unknown';
    return phone.slice(0, -4) + '****';
  }
}

// Instance globale du détecteur
if (!global.frictionDetector) {
  global.frictionDetector = new FrictionDetector();
}

// Fonctions principales
function detectFrictionPoints(traceId, phone) {
  return global.frictionDetector.detectFrictionPoints(traceId, phone);
}

// Stats et monitoring
function getFrictionDetectorStats() {
  return global.frictionDetector.getDetectorStats();
}

function getFrictionReport() {
  return global.frictionDetector.getFrictionReport();
}

// Administration
function resetFrictionDetectorStats() {
  return global.frictionDetector.resetStats();
}

module.exports = {
  detectFrictionPoints,
  getFrictionDetectorStats,
  getFrictionReport,
  resetFrictionDetectorStats,
  FrictionDetector
};
