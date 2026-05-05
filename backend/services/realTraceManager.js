// ACTION 4 - Trace renforcée réel

const { getFlag } = require('./envFlags');
const { addTraceStep, getTrace, getTraceByPhone } = require('./traceManager');

// Gestionnaire de traces pour validation réelle (SAFE - extension traceManager)
class RealTraceManager {
  constructor() {
    this.testModeEnabled = getFlag('AGENT_TEST_MODE');
    this.realValidationEnabled = getFlag('AGENT_REAL_VALIDATION_MODE');
    this.stats = {
      realTracesCreated: 0,
      realStepsAdded: 0,
      responseLatencies: [],
      messageCounts: new Map(),
      frictionPoints: 0
    };
    
    console.log('[REAL_TRACE_MANAGER_INITIALIZED]', {
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
  
  // Créer une trace pour utilisateur réel
  createRealTrace(phone, tenant_id, source = 'whatsapp_real') {
    if (!this.testModeEnabled && !this.realValidationEnabled) {
      return null;
    }
    
    // Utiliser le traceManager existant
    const traceId = this.getOrCreateTraceId(phone, tenant_id, source);
    
    if (traceId) {
      this.stats.realTracesCreated++;
      
      // Ajouter des métadonnées spécifiques au mode réel
      this.addRealMetadata(traceId, {
        source: 'real_user',
        environment: this.getEnvironment(),
        createdAt: new Date(),
        initialPhone: this.maskPhone(phone)
      });
      
      console.log('[REAL_TRACE_CREATED]', {
        traceId,
        phone: this.maskPhone(phone),
        tenant_id,
        source,
        environment: this.getEnvironment()
      });
    }
    
    return traceId;
  }
  
  // Ajouter une étape avec données réelles
  addRealStep(traceId, step, data = {}) {
    if (!this.testModeEnabled && !this.realValidationEnabled) {
      return;
    }
    
    // Ajouter les métadonnées réelles
    const enhancedData = {
      ...data,
      environment: this.getEnvironment(),
      source: 'real_user',
      timestamp: new Date()
    };
    
    // Ajouter l'étape via traceManager
    addTraceStep(traceId, step, enhancedData);
    
    this.stats.realStepsAdded++;
    
    // Mettre à jour les compteurs de messages
    if (step.includes('message') || step.includes('reply')) {
      this.updateMessageCount(traceId);
    }
    
    console.log(`[REAL_TRACE_STEP_${step.toUpperCase()}]`, {
      traceId,
      environment: this.getEnvironment(),
      step
    });
  }
  
  // Enregistrer la latence de réponse
  recordResponseLatency(traceId, latencyMs) {
    if (!this.testModeEnabled && !this.realValidationEnabled) {
      return;
    }
    
    this.stats.responseLatencies.push({
      traceId,
      latencyMs,
      timestamp: new Date()
    });
    
    // Garder seulement les 1000 dernières latences
    if (this.stats.responseLatencies.length > 1000) {
      this.stats.responseLatencies = this.stats.responseLatencies.slice(-1000);
    }
    
    // Ajouter à la trace
    this.addRealStep(traceId, 'response_latency', {
      latencyMs,
      latencyCategory: this.categorizeLatency(latencyMs)
    });
    
    console.log('[REAL_TRACE_LATENCY_RECORDED]', {
      traceId,
      latencyMs,
      category: this.categorizeLatency(latencyMs)
    });
  }
  
  // Enregistrer un point de friction
  recordFrictionPoint(traceId, frictionType, details = {}) {
    if (!this.testModeEnabled && !this.realValidationEnabled) {
      return;
    }
    
    this.stats.frictionPoints++;
    
    // Ajouter à la trace
    this.addRealStep(traceId, 'friction_point', {
      frictionType,
      details,
      severity: this.categorizeFrictionSeverity(frictionType)
    });
    
    console.log('[REAL_TRACE_FRICTION_RECORDED]', {
      traceId,
      frictionType,
      severity: this.categorizeFrictionSeverity(frictionType)
    });
  }
  
  // Obtenir les métriques de conversation
  getConversationMetrics(traceId) {
    if (!this.testModeEnabled && !this.realValidationEnabled) {
      return { enabled: false };
    }
    
    const trace = getTrace(traceId);
    
    if (!trace.enabled && trace.error) {
      return { error: 'Trace not found' };
    }
    
    // Calculer les métriques
    const metrics = {
      traceId,
      environment: this.getEnvironment(),
      messageCount: this.stats.messageCounts.get(traceId) || 0,
      steps: trace.steps?.length || 0,
      frictionPoints: 0,
      avgResponseLatency: 0,
      conversationDuration: 0,
      engagementLevel: 'low'
    };
    
    // Compter les points de friction
    if (trace.steps) {
      metrics.frictionPoints = trace.steps.filter(step => 
        step.step === 'friction_point'
      ).length;
      
      // Calculer la durée de conversation
      if (trace.steps.length > 1) {
        const firstStep = new Date(trace.steps[0].timestamp);
        const lastStep = new Date(trace.steps[trace.steps.length - 1].timestamp);
        metrics.conversationDuration = lastStep - firstStep;
      }
    }
    
    // Calculer la latence moyenne
    const traceLatencies = this.stats.responseLatencies.filter(l => l.traceId === traceId);
    if (traceLatencies.length > 0) {
      metrics.avgResponseLatency = traceLatencies.reduce((sum, l) => sum + l.latencyMs, 0) / traceLatencies.length;
    }
    
    // Déterminer le niveau d'engagement
    metrics.engagementLevel = this.calculateEngagementLevel(metrics);
    
    return metrics;
  }
  
  // Obtenir les traces réelles
  getRealTraces(limit = 50) {
    if (!this.testModeEnabled && !this.realValidationEnabled) {
      return { enabled: false };
    }
    
    // Simulation - en production, utiliserait une vraie base de traces
    const realTraces = [];
    
    // Obtenir les traces avec métadonnées réelles
    // (À implémenter avec stockage réel si nécessaire)
    
    return {
      enabled: true,
      environment: this.getEnvironment(),
      traces: realTraces.slice(0, limit),
      count: realTraces.length
    };
  }
  
  // Obtenir les stats du trace manager réel
  getRealTraceStats() {
    if (!this.testModeEnabled && !this.realValidationEnabled) {
      return { enabled: false };
    }
    
    // Calculer les statistiques de latence
    const latencyStats = this.calculateLatencyStats();
    
    // Calculer les statistiques de messages
    const messageStats = this.calculateMessageStats();
    
    return {
      enabled: true,
      environment: this.getEnvironment(),
      stats: {
        realTracesCreated: this.stats.realTracesCreated,
        realStepsAdded: this.stats.realStepsAdded,
        frictionPoints: this.stats.frictionPoints
      },
      latency: latencyStats,
      messages: messageStats,
      uptime: process.uptime()
    };
  }
  
  // Obtenir ou créer un trace ID
  getOrCreateTraceId(phone, tenant_id, source) {
    // Essayer d'obtenir une trace existante
    const existingTrace = getTraceByPhone(phone);
    
    if (existingTrace.enabled && !existingTrace.error) {
      return existingTrace.trace?.traceId;
    }
    
    // Créer une nouvelle trace via traceManager
    const { createTrace } = require('./traceManager');
    return createTrace(phone, tenant_id, source);
  }
  
  // Ajouter des métadonnées réelles
  addRealMetadata(traceId, metadata) {
    // Ajouter les métadonnées à la trace
    this.addRealStep(traceId, 'real_metadata', metadata);
  }
  
  // Mettre à jour le compteur de messages
  updateMessageCount(traceId) {
    const currentCount = this.stats.messageCounts.get(traceId) || 0;
    this.stats.messageCounts.set(traceId, currentCount + 1);
  }
  
  // Catégoriser la latence
  categorizeLatency(latencyMs) {
    if (latencyMs < 1000) return 'fast';
    if (latencyMs < 5000) return 'normal';
    if (latencyMs < 15000) return 'slow';
    return 'very_slow';
  }
  
  // Catégoriser la sévérité de friction
  categorizeFrictionSeverity(frictionType) {
    const severityMap = {
      'user_no_response': 'medium',
      'multiple_questions': 'low',
      'price objection': 'medium',
      'technical_issue': 'high',
      'abandonment': 'high'
    };
    
    return severityMap[frictionType] || 'medium';
  }
  
  // Calculer le niveau d'engagement
  calculateEngagementLevel(metrics) {
    const { messageCount, steps, frictionPoints, avgResponseLatency } = metrics;
    
    let score = 0;
    
    // Score basé sur le nombre de messages
    if (messageCount >= 3) score += 3;
    else if (messageCount >= 2) score += 2;
    else if (messageCount >= 1) score += 1;
    
    // Score basé sur les étapes
    if (steps >= 5) score += 2;
    else if (steps >= 3) score += 1;
    
    // Pénalité pour les points de friction
    score -= frictionPoints;
    
    // Pénalité pour les latences élevées
    if (avgResponseLatency > 10000) score -= 1;
    
    if (score >= 4) return 'high';
    if (score >= 2) return 'medium';
    return 'low';
  }
  
  // Calculer les statistiques de latence
  calculateLatencyStats() {
    const latencies = this.stats.responseLatencies.map(l => l.latencyMs);
    
    if (latencies.length === 0) {
      return {
        count: 0,
        avg: 0,
        min: 0,
        max: 0,
        median: 0
      };
    }
    
    latencies.sort((a, b) => a - b);
    
    return {
      count: latencies.length,
      avg: Math.round(latencies.reduce((sum, l) => sum + l, 0) / latencies.length),
      min: latencies[0],
      max: latencies[latencies.length - 1],
      median: latencies[Math.floor(latencies.length / 2)]
    };
  }
  
  // Calculer les statistiques de messages
  calculateMessageStats() {
    const messageCounts = Array.from(this.stats.messageCounts.values());
    
    if (messageCounts.length === 0) {
      return {
        totalConversations: 0,
        avgMessagesPerConversation: 0,
        maxMessages: 0,
        minMessages: 0
      };
    }
    
    return {
      totalConversations: messageCounts.length,
      avgMessagesPerConversation: Math.round(messageCounts.reduce((sum, count) => sum + count, 0) / messageCounts.length),
      maxMessages: Math.max(...messageCounts),
      minMessages: Math.min(...messageCounts)
    };
  }
  
  // Réinitialiser les stats
  resetStats() {
    this.stats = {
      realTracesCreated: 0,
      realStepsAdded: 0,
      responseLatencies: [],
      messageCounts: new Map(),
      frictionPoints: 0
    };
    
    console.log('[REAL_TRACE_MANAGER_STATS_RESET]');
  }
  
  // Masquer téléphone pour logs
  maskPhone(phone) {
    if (!phone || typeof phone !== 'string') return 'unknown';
    return phone.slice(0, -4) + '****';
  }
}

// Instance globale du trace manager réel
if (!global.realTraceManager) {
  global.realTraceManager = new RealTraceManager();
}

// Fonctions principales
function createRealTrace(phone, tenant_id, source) {
  return global.realTraceManager.createRealTrace(phone, tenant_id, source);
}

function addRealStep(traceId, step, data) {
  return global.realTraceManager.addRealStep(traceId, step, data);
}

function recordResponseLatency(traceId, latencyMs) {
  return global.realTraceManager.recordResponseLatency(traceId, latencyMs);
}

function recordFrictionPoint(traceId, frictionType, details) {
  return global.realTraceManager.recordFrictionPoint(traceId, frictionType, details);
}

// Stats et monitoring
function getConversationMetrics(traceId) {
  return global.realTraceManager.getConversationMetrics(traceId);
}

function getRealTraces(limit) {
  return global.realTraceManager.getRealTraces(limit);
}

function getRealTraceStats() {
  return global.realTraceManager.getRealTraceStats();
}

// Administration
function resetRealTraceStats() {
  return global.realTraceManager.resetStats();
}

module.exports = {
  createRealTrace,
  addRealStep,
  recordResponseLatency,
  recordFrictionPoint,
  getConversationMetrics,
  getRealTraces,
  getRealTraceStats,
  resetRealTraceStats,
  RealTraceManager
};
