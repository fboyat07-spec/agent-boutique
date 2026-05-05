// ACTION 3 - Trace ID par lead

const { getFlag } = require('./envFlags');
const { logInboundReceived, logError } = require('./testModeLogger');

// Gestionnaire de traces pour suivi bout en bout (SAFE)
class TraceManager {
  constructor() {
    this.enabled = getFlag('AGENT_TEST_MODE');
    this.traces = new Map(); // traceId -> trace data
    this.phoneToTrace = new Map(); // phone -> traceId
    this.stats = {
      tracesCreated: 0,
      tracesCompleted: 0,
      tracesActive: 0,
      errors: 0
    };
    
    console.log('[TRACE_MANAGER_INITIALIZED]', {
      enabled: this.enabled
    });
  }
  
  // Créer une nouvelle trace pour un lead
  createTrace(phone, tenant_id, source = 'webhook') {
    if (!this.enabled) {
      return null;
    }
    
    // Vérifier si une trace existe déjà pour ce téléphone
    if (this.phoneToTrace.has(phone)) {
      const existingTraceId = this.phoneToTrace.get(phone);
      const existingTrace = this.traces.get(existingTraceId);
      
      if (existingTrace && existingTrace.status !== 'completed') {
        console.log('[TRACE_MANAGER_EXISTING_TRACE]', {
          phone: this.maskPhone(phone),
          existingTraceId,
          status: existingTrace.status
        });
        
        return existingTraceId;
      }
    }
    
    // Créer nouvelle trace
    const traceId = this.generateTraceId();
    const now = new Date();
    
    const trace = {
      traceId,
      phone,
      tenant_id,
      source,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      steps: [],
      metadata: {
        leadId: null,
        finalStatus: null,
        errorCount: 0,
        duration: null
      }
    };
    
    // Stocker la trace
    this.traces.set(traceId, trace);
    this.phoneToTrace.set(phone, traceId);
    
    // Stats
    this.stats.tracesCreated++;
    this.stats.tracesActive++;
    
    console.log('[TRACE_MANAGER_TRACE_CREATED]', {
      traceId,
      phone: this.maskPhone(phone),
      tenant_id,
      source
    });
    
    // Log inbound received
    logInboundReceived(phone, tenant_id, { source, traceId });
    
    return traceId;
  }
  
  // Ajouter une étape à une trace
  addStep(traceId, step, data = {}) {
    if (!this.enabled) {
      return;
    }
    
    const trace = this.traces.get(traceId);
    
    if (!trace) {
      console.log('[TRACE_MANAGER_STEP_NO_TRACE]', { traceId });
      return;
    }
    
    const stepData = {
      step,
      timestamp: new Date(),
      data: {
        ...data,
        traceId
      }
    };
    
    // Ajouter l'étape
    trace.steps.push(stepData);
    trace.updatedAt = new Date();
    
    // Mettre à jour le statut si nécessaire
    if (data.status) {
      trace.metadata.finalStatus = data.status;
    }
    
    // Mettre à jour leadId si disponible
    if (data.lead_id) {
      trace.metadata.leadId = data.lead_id;
    }
    
    console.log(`[TRACE_MANAGER_STEP_${step.toUpperCase()}]`, {
      traceId,
      phone: this.maskPhone(trace.phone),
      step,
      status: data.status
    });
  }
  
  // Marquer une trace comme complétée
  completeTrace(traceId, finalStatus, success = true) {
    if (!this.enabled) {
      return;
    }
    
    const trace = this.traces.get(traceId);
    
    if (!trace) {
      console.log('[TRACE_MANAGER_COMPLETE_NO_TRACE]', { traceId });
      return;
    }
    
    const now = new Date();
    
    trace.status = 'completed';
    trace.updatedAt = now;
    trace.metadata.finalStatus = finalStatus;
    trace.metadata.duration = now - trace.createdAt;
    trace.metadata.success = success;
    
    // Stats
    this.stats.tracesCompleted++;
    this.stats.tracesActive--;
    
    console.log('[TRACE_MANAGER_TRACE_COMPLETED]', {
      traceId,
      phone: this.maskPhone(trace.phone),
      finalStatus,
      success,
      duration: trace.metadata.duration
    });
  }
  
  // Marquer une erreur dans une trace
  markError(traceId, error, context = {}) {
    if (!this.enabled) {
      return;
    }
    
    const trace = this.traces.get(traceId);
    
    if (!trace) {
      console.log('[TRACE_MANAGER_ERROR_NO_TRACE]', { traceId });
      return;
    }
    
    trace.metadata.errorCount++;
    trace.updatedAt = new Date();
    
    // Stats
    this.stats.errors++;
    
    console.log('[TRACE_MANAGER_TRACE_ERROR]', {
      traceId,
      phone: this.maskPhone(trace.phone),
      error: error.message,
      errorCount: trace.metadata.errorCount
    });
    
    // Log l'erreur
    logError('trace_error', trace.phone, trace.tenant_id, trace.metadata.leadId, error, context);
  }
  
  // Obtenir une trace par ID
  getTrace(traceId) {
    if (!this.enabled) {
      return { enabled: false };
    }
    
    const trace = this.traces.get(traceId);
    
    if (!trace) {
      return { error: 'Trace not found' };
    }
    
    return {
      ...trace,
      phone: this.maskPhone(trace.phone),
      steps: trace.steps.map(step => ({
        ...step,
        data: {
          ...step.data,
          phone: step.data.phone ? this.maskPhone(step.data.phone) : undefined
        }
      }))
    };
  }
  
  // Obtenir une trace par téléphone
  getTraceByPhone(phone) {
    if (!this.enabled) {
      return { enabled: false };
    }
    
    const traceId = this.phoneToTrace.get(phone);
    
    if (!traceId) {
      return { error: 'No trace found for phone' };
    }
    
    return this.getTrace(traceId);
  }
  
  // Obtenir toutes les traces actives
  getActiveTraces() {
    if (!this.enabled) {
      return { enabled: false };
    }
    
    const activeTraces = [];
    
    for (const [traceId, trace] of this.traces.entries()) {
      if (trace.status === 'active') {
        activeTraces.push({
          ...trace,
          phone: this.maskPhone(trace.phone)
        });
      }
    }
    
    return {
      traces: activeTraces,
      count: activeTraces.length
    };
  }
  
  // Obtenir les traces récentes
  getRecentTraces(limit = 20) {
    if (!this.enabled) {
      return { enabled: false };
    }
    
    const allTraces = Array.from(this.traces.values());
    
    // Trier par date de création (plus récent d'abord)
    allTraces.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    const recentTraces = allTraces.slice(0, limit).map(trace => ({
      traceId: trace.traceId,
      phone: this.maskPhone(trace.phone),
      tenant_id: trace.tenant_id,
      status: trace.status,
      createdAt: trace.createdAt,
      updatedAt: trace.updatedAt,
      stepCount: trace.steps.length,
      finalStatus: trace.metadata.finalStatus,
      duration: trace.metadata.duration
    }));
    
    return {
      traces: recentTraces,
      count: recentTraces.length
    };
  }
  
  // Obtenir les stats du trace manager
  getTraceStats() {
    if (!this.enabled) {
      return { enabled: false };
    }
    
    // Calculer les durées moyennes
    const completedTraces = Array.from(this.traces.values())
      .filter(trace => trace.status === 'completed' && trace.metadata.duration);
    
    const avgDuration = completedTraces.length > 0 ?
      completedTraces.reduce((sum, trace) => sum + trace.metadata.duration, 0) / completedTraces.length : 0;
    
    // Calculer le taux de succès
    const successRate = this.stats.tracesCompleted > 0 ?
      (completedTraces.filter(trace => trace.metadata.success).length / this.stats.tracesCompleted) * 100 : 0;
    
    return {
      enabled: this.enabled,
      stats: {
        tracesCreated: this.stats.tracesCreated,
        tracesCompleted: this.stats.tracesCompleted,
        tracesActive: this.stats.tracesActive,
        errors: this.stats.errors,
        avgDuration: Math.round(avgDuration),
        successRate: Math.round(successRate * 100) / 100
      },
      uptime: process.uptime()
    };
  }
  
  // Nettoyer les anciennes traces
  cleanup(maxAge = 24 * 60 * 60 * 1000) { // 24 heures
    const cutoff = Date.now() - maxAge;
    let cleaned = 0;
    
    for (const [traceId, trace] of this.traces.entries()) {
      const createdTime = new Date(trace.createdAt).getTime();
      
      if (createdTime < cutoff) {
        // Supprimer de phoneToTrace aussi
        this.phoneToTrace.delete(trace.phone);
        this.traces.delete(traceId);
        cleaned++;
        
        if (trace.status === 'active') {
          this.stats.tracesActive--;
        }
      }
    }
    
    if (cleaned > 0) {
      console.log('[TRACE_MANAGER_CLEANUP]', {
        cleaned,
        remaining: this.traces.size,
        active: this.stats.tracesActive
      });
    }
    
    return cleaned;
  }
  
  // Réinitialiser
  reset() {
    this.traces.clear();
    this.phoneToTrace.clear();
    this.stats = {
      tracesCreated: 0,
      tracesCompleted: 0,
      tracesActive: 0,
      errors: 0
    };
    
    console.log('[TRACE_MANAGER_RESET]');
  }
  
  // Générer un trace ID unique
  generateTraceId() {
    return `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // Masquer téléphone pour logs
  maskPhone(phone) {
    if (!phone || typeof phone !== 'string') return 'unknown';
    return phone.slice(0, -4) + '****';
  }
}

// Instance globale du trace manager
if (!global.traceManager) {
  global.traceManager = new TraceManager();
}

// Fonctions principales
function createTrace(phone, tenant_id, source) {
  return global.traceManager.createTrace(phone, tenant_id, source);
}

function addTraceStep(traceId, step, data) {
  return global.traceManager.addStep(traceId, step, data);
}

function completeTrace(traceId, finalStatus, success) {
  return global.traceManager.completeTrace(traceId, finalStatus, success);
}

function markTraceError(traceId, error, context) {
  return global.traceManager.markError(traceId, error, context);
}

// Debug et monitoring
function getTrace(traceId) {
  return global.traceManager.getTrace(traceId);
}

function getTraceByPhone(phone) {
  return global.traceManager.getTraceByPhone(phone);
}

function getActiveTraces() {
  return global.traceManager.getActiveTraces();
}

function getRecentTraces(limit) {
  return global.traceManager.getRecentTraces(limit);
}

function getTraceStats() {
  return global.traceManager.getTraceStats();
}

// Administration
function cleanupTraces(maxAge) {
  return global.traceManager.cleanup(maxAge);
}

function resetTraceManager() {
  return global.traceManager.reset();
}

module.exports = {
  createTrace,
  addTraceStep,
  completeTrace,
  markTraceError,
  getTrace,
  getTraceByPhone,
  getActiveTraces,
  getRecentTraces,
  getTraceStats,
  cleanupTraces,
  resetTraceManager,
  TraceManager
};
