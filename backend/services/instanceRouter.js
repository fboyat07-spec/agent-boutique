// ACTION 5 - Routage multi-instance safe

const crypto = require('crypto');
const BusinessLogger = require('./businessLogger');

// Routage multi-instance simple sans infra externe
class InstanceRouter {
  constructor() {
    this.enabled = process.env.MULTI_INSTANCE_ENABLED === 'true';
    this.instanceCount = parseInt(process.env.INSTANCE_COUNT) || 1;
    this.instanceId = parseInt(process.env.INSTANCE_ID) || 0;
    
    // Validation configuration
    if (this.instanceId >= this.instanceCount) {
      console.log('[INSTANCE_ROUTER_CONFIG_ERROR]', {
        instanceId: this.instanceId,
        instanceCount: this.instanceCount,
        error: 'instanceId must be < instanceCount'
      });
      
      // Reset valeurs par défaut
      this.instanceCount = 1;
      this.instanceId = 0;
    }
    
    this.stats = {
      totalProcessed: 0,
      processedByInstance: 0,
      skippedByInstance: 0,
      errors: 0
    };
    
    console.log('[INSTANCE_ROUTER_INITIALIZED]', {
      enabled: this.enabled,
      instanceCount: this.instanceCount,
      instanceId: this.instanceId,
      routingMode: this.enabled ? 'hash_based' : 'single_instance'
    });
  }
  
  // Hash simple pour phone
  hashPhone(phone) {
    // Utiliser hash simple et rapide
    let hash = 0;
    for (let i = 0; i < phone.length; i++) {
      const char = phone.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convertir en 32-bit integer
    }
    return Math.abs(hash);
  }
  
  // Déterminer si cette instance doit traiter le lead
  shouldProcessLead(phone, tenant_id = null) {
    this.stats.totalProcessed++;
    
    if (!this.enabled) {
      // Single instance: tout traiter
      this.stats.processedByInstance++;
      return { shouldProcess: true, reason: 'single_instance_mode' };
    }
    
    // Multi-instance: hash routing
    const hashInput = tenant_id ? `${phone}:${tenant_id}` : phone;
    const hash = this.hashPhone(hashInput);
    const targetInstance = hash % this.instanceCount;
    const shouldProcess = targetInstance === this.instanceId;
    
    if (shouldProcess) {
      this.stats.processedByInstance++;
      
      console.log('[INSTANCE_ROUTER_PROCESS]', {
        phone: phone.substring(0, -4) + '****',
        tenant_id,
        hash: hash,
        targetInstance,
        currentInstance: this.instanceId,
        instanceCount: this.instanceCount
      });
      
    } else {
      this.stats.skippedByInstance++;
      
      console.log('[INSTANCE_ROUTER_SKIP]', {
        phone: phone.substring(0, -4) + '****',
        tenant_id,
        hash: hash,
        targetInstance,
        currentInstance: this.instanceId,
        reason: 'different_instance'
      });
    }
    
    return { 
      shouldProcess, 
      reason: shouldProcess ? 'assigned_to_instance' : 'different_instance',
      targetInstance,
      currentInstance: this.instanceId
    };
  }
  
  // Wrapper pour exécuter action avec routing
  async executeWithRouting(phone, tenant_id, actionFunction, actionType = 'general') {
    const routing = this.shouldProcessLead(phone, tenant_id);
    
    if (!routing.shouldProcess) {
      console.log('[INSTANCE_ROUTING_ACTION_SKIPPED]', {
        phone: phone.substring(0, -4) + '****',
        tenant_id,
        actionType,
        reason: routing.reason,
        targetInstance: routing.targetInstance
      });
      
      return { 
        success: false, 
        reason: 'not_assigned_to_instance',
        routing,
        skipped: true 
      };
    }
    
    const startTime = Date.now();
    
    try {
      console.log('[INSTANCE_ROUTING_ACTION_START]', {
        phone: phone.substring(0, -4) + '****',
        tenant_id,
        actionType,
        instanceId: this.instanceId
      });
      
      const result = await actionFunction();
      
      const duration = Date.now() - startTime;
      
      console.log('[INSTANCE_ROUTING_ACTION_SUCCESS]', {
        phone: phone.substring(0, -4) + '****',
        tenant_id,
        actionType,
        duration,
        instanceId: this.instanceId
      });
      
      return { 
        success: true, 
        result, 
        duration,
        routing,
        processed: true 
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      this.stats.errors++;
      
      console.log('[INSTANCE_ROUTING_ACTION_ERROR]', {
        phone: phone.substring(0, -4) + '****',
        tenant_id,
        actionType,
        error: error.message,
        duration,
        instanceId: this.instanceId
      });
      
      BusinessLogger.logWebhookError(error.message, {
        context: 'instance_routing',
        tenant_id,
        actionType,
        instanceId: this.instanceId
      });
      
      return { 
        success: false, 
        error: error.message, 
        duration,
        routing,
        processed: true 
      };
    }
  }
  
  // Obtenir distribution des leads par instance
  getLeadDistribution(leads) {
    if (!this.enabled) {
      return { mode: 'single_instance', allLeads: leads.length };
    }
    
    const distribution = {};
    
    for (let i = 0; i < this.instanceCount; i++) {
      distribution[i] = 0;
    }
    
    for (const lead of leads) {
      const phone = lead.phone;
      const tenant_id = lead.tenant_id;
      
      const hashInput = tenant_id ? `${phone}:${tenant_id}` : phone;
      const hash = this.hashPhone(hashInput);
      const targetInstance = hash % this.instanceCount;
      
      distribution[targetInstance]++;
    }
    
    return {
      mode: 'multi_instance',
      instanceCount: this.instanceCount,
      currentInstance: this.instanceId,
      distribution,
      currentInstanceLoad: distribution[this.instanceId],
      totalLeads: leads.length,
      balanceRatio: this.calculateBalanceRatio(distribution)
    };
  }
  
  // Calculer ratio d'équilibre
  calculateBalanceRatio(distribution) {
    const values = Object.values(distribution);
    const max = Math.max(...values);
    const min = Math.min(...values);
    
    if (max === 0) return 1; // Parfait équilibre
    
    return min / max; // 0 = déséquilibré, 1 = parfaitement équilibré
  }
  
  // Obtenir stats de routing
  getRoutingStats() {
    const processingRate = this.stats.totalProcessed > 0 ? 
      (this.stats.processedByInstance / this.stats.totalProcessed) * 100 : 0;
    
    const expectedRate = this.enabled ? (100 / this.instanceCount) : 100;
    
    return {
      enabled: this.enabled,
      instanceId: this.instanceId,
      instanceCount: this.instanceCount,
      stats: this.stats,
      processingRate: Math.round(processingRate * 100) / 100,
      expectedRate: Math.round(expectedRate * 100) / 100,
      efficiency: processingRate > 0 ? (processingRate / expectedRate) * 100 : 0,
      uptime: process.uptime()
    };
  }
  
  // Health check du routing
  healthCheck() {
    const stats = this.getRoutingStats();
    
    const health = {
      status: 'healthy',
      enabled: stats.enabled,
      instanceId: stats.instanceId,
      instanceCount: stats.instanceCount,
      issues: [],
      recommendations: []
    };
    
    // Vérifier configuration
    if (stats.instanceId >= stats.instanceCount) {
      health.status = 'critical';
      health.issues.push('Invalid instance configuration');
      health.recommendations.push('Fix INSTANCE_ID and INSTANCE_COUNT');
    }
    
    // Vérifier efficacité de routing
    if (stats.enabled && stats.efficiency < 80) {
      health.status = 'warning';
      health.issues.push('Low routing efficiency');
      health.recommendations.push('Check lead distribution hash function');
    }
    
    // Vérifier taux d'erreur
    const errorRate = stats.stats.totalProcessed > 0 ? 
      (stats.stats.errors / stats.stats.totalProcessed) * 100 : 0;
    
    if (errorRate > 10) {
      health.status = 'warning';
      health.issues.push('High error rate');
      health.recommendations.push('Investigate action execution errors');
    }
    
    return {
      ...health,
      stats: {
        totalProcessed: stats.stats.totalProcessed,
        processedByInstance: stats.stats.processedByInstance,
        skippedByInstance: stats.stats.skippedByInstance,
        errors: stats.stats.errors,
        processingRate: stats.processingRate,
        efficiency: Math.round(stats.efficiency * 100) / 100
      }
    };
  }
  
  // Simuler routing pour debugging
  simulateRouting(phone, tenant_id = null) {
    const hashInput = tenant_id ? `${phone}:${tenant_id}` : phone;
    const hash = this.hashPhone(hashInput);
    const targetInstance = hash % this.instanceCount;
    
    return {
      phone: phone.substring(0, -4) + '****',
      tenant_id,
      hashInput: hashInput.substring(0, -4) + '****',
      hash,
      targetInstance,
      currentInstance: this.instanceId,
      shouldProcess: targetInstance === this.instanceId
    };
  }
  
  // Réinitialiser stats
  resetStats() {
    this.stats = {
      totalProcessed: 0,
      processedByInstance: 0,
      skippedByInstance: 0,
      errors: 0
    };
    
    console.log('[INSTANCE_ROUTER_STATS_RESET]', {
      instanceId: this.instanceId
    });
  }
}

// Instance globale du router
if (!global.instanceRouter) {
  global.instanceRouter = new InstanceRouter();
}

// Fonctions principales
function shouldProcessLead(phone, tenant_id) {
  return global.instanceRouter.shouldProcessLead(phone, tenant_id);
}

async function executeWithInstanceRouting(phone, tenant_id, actionFunction, actionType) {
  return await global.instanceRouter.executeWithRouting(phone, tenant_id, actionFunction, actionType);
}

function getLeadDistribution(leads) {
  return global.instanceRouter.getLeadDistribution(leads);
}

// Stats et monitoring
function getRoutingStats() {
  return global.instanceRouter.getRoutingStats();
}

function routingHealthCheck() {
  return global.instanceRouter.healthCheck();
}

// Debugging
function simulateRouting(phone, tenant_id) {
  return global.instanceRouter.simulateRouting(phone, tenant_id);
}

// Administration
function resetRoutingStats() {
  return global.instanceRouter.resetStats();
}

module.exports = {
  shouldProcessLead,
  executeWithInstanceRouting,
  getLeadDistribution,
  getRoutingStats,
  routingHealthCheck,
  simulateRouting,
  resetRoutingStats,
  InstanceRouter
};
