// ACTION 2 - Planificateur acquisition

const { generateLeads } = require('./autoLeadGenerator');
const { listTenants } = require('./tenantManager');
const BusinessLogger = require('./businessLogger');

// Scheduler isolé pour acquisition (pas le scheduler existant)
class AcquisitionScheduler {
  constructor() {
    this.enabled = process.env.LEAD_GEN_ENABLED === 'true';
    this.frequency = parseInt(process.env.LEAD_GEN_FREQUENCY_MINUTES) || 60; // minutes
    this.maxLeadsPerRun = parseInt(process.env.LEAD_GEN_MAX_PER_RUN) || 50;
    this.isRunning = false;
    this.intervalId = null;
    this.stats = {
      totalRuns: 0,
      totalLeadsGenerated: 0,
      totalErrors: 0,
      lastRun: null,
      nextRun: null,
      runHistory: []
    };
    
    console.log('[ACQUISITION_SCHEDULER_INITIALIZED]', {
      enabled: this.enabled,
      frequency: this.frequency,
      maxLeadsPerRun: this.maxLeadsPerRun
    });
    
    // Démarrer automatiquement si activé
    if (this.enabled) {
      this.start();
    }
  }
  
  // Démarrer le scheduler
  start() {
    if (!this.enabled) {
      console.log('[ACQUISITION_SCHEDULER_START_DISABLED]');
      return false;
    }
    
    if (this.isRunning) {
      console.log('[ACQUISITION_SCHEDULER_ALREADY_RUNNING]');
      return false;
    }
    
    // Calculer prochaine exécution
    const nextRunDelay = this.frequency * 60 * 1000; // Convertir en ms
    
    this.intervalId = setInterval(() => {
      this.runAcquisitionCycle();
    }, nextRunDelay);
    
    this.isRunning = true;
    this.stats.nextRun = new Date(Date.now() + nextRunDelay);
    
    console.log('[ACQUISITION_SCHEDULER_STARTED]', {
      frequency: this.frequency,
      nextRun: this.stats.nextRun
    });
    
    BusinessLogger.logSystemEvent('acquisition_scheduler_started', null, {
      frequency: this.frequency,
      maxLeadsPerRun: this.maxLeadsPerRun
    });
    
    return true;
  }
  
  // Arrêter le scheduler
  stop() {
    if (!this.isRunning) {
      console.log('[ACQUISITION_SCHEDULER_ALREADY_STOPPED]');
      return false;
    }
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    this.isRunning = false;
    this.stats.nextRun = null;
    
    console.log('[ACQUISITION_SCHEDULER_STOPPED]');
    
    BusinessLogger.logSystemEvent('acquisition_scheduler_stopped', null, {
      totalRuns: this.stats.totalRuns,
      totalLeadsGenerated: this.stats.totalLeadsGenerated
    });
    
    return true;
  }
  
  // Cycle d'acquisition principal
  async runAcquisitionCycle() {
    if (!this.enabled || !this.isRunning) {
      return;
    }
    
    const cycleId = `cycle_${Date.now()}`;
    const startTime = Date.now();
    
    console.log('[ACQUISITION_CYCLE_STARTED]', {
      cycleId,
      timestamp: new Date()
    });
    
    try {
      this.stats.totalRuns++;
      this.stats.lastRun = new Date();
      
      // Obtenir tous les tenants actifs
      const tenants = listTenants();
      const activeTenants = tenants.filter(tenant => 
        tenant.status === 'ACTIVE' && tenant.tenant_id !== 'DEFAULT'
      );
      
      if (activeTenants.length === 0) {
        console.log('[ACQUISITION_CYCLE_NO_ACTIVE_TENANTS]', { cycleId });
        return;
      }
      
      // Exécuter acquisition pour chaque tenant
      const cycleResults = [];
      
      for (const tenant of activeTenants) {
        try {
          const result = await this.runTenantAcquisition(tenant.tenant_id, cycleId);
          cycleResults.push(result);
          
          // Pause entre tenants pour éviter surcharge
          await this.sleep(1000); // 1 seconde
          
        } catch (error) {
          console.log('[ACQUISITION_CYCLE_TENANT_ERROR]', {
            cycleId,
            tenant_id: tenant.tenant_id,
            error: error.message
          });
          
          cycleResults.push({
            tenant_id: tenant.tenant_id,
            success: false,
            error: error.message
          });
        }
      }
      
      // Calculer stats du cycle
      const cycleStats = this.calculateCycleStats(cycleResults);
      
      // Mettre à jour stats globales
      this.stats.totalLeadsGenerated += cycleStats.totalGenerated;
      
      // Historique
      const cycleHistory = {
        cycleId,
        timestamp: new Date(),
        duration: Date.now() - startTime,
        tenantsProcessed: activeTenants.length,
        ...cycleStats
      };
      
      this.stats.runHistory.push(cycleHistory);
      
      // Garder seulement les 100 derniers cycles
      if (this.stats.runHistory.length > 100) {
        this.stats.runHistory = this.stats.runHistory.slice(-100);
      }
      
      // Calculer prochaine exécution
      this.stats.nextRun = new Date(Date.now() + (this.frequency * 60 * 1000));
      
      console.log('[ACQUISITION_CYCLE_COMPLETED]', {
        cycleId,
        ...cycleStats,
        duration: cycleHistory.duration,
        nextRun: this.stats.nextRun
      });
      
      BusinessLogger.logSystemEvent('acquisition_cycle_completed', null, {
        cycleId,
        ...cycleStats
      });
      
    } catch (error) {
      this.stats.totalErrors++;
      
      console.log('[ACQUISITION_CYCLE_ERROR]', {
        cycleId,
        error: error.message
      });
      
      BusinessLogger.logSystemEvent('acquisition_cycle_error', null, {
        cycleId,
        error: error.message
      });
    }
  }
  
  // Acquisition pour un tenant spécifique
  async runTenantAcquisition(tenant_id, cycleId) {
    console.log('[ACQUISITION_TENANT_STARTED]', {
      cycleId,
      tenant_id
    });
    
    try {
      // Options d'acquisition (peuvent être configurées par tenant)
      const options = {
        source: 'mock_generation', // Par défaut, peut être configuré
        count: Math.min(this.maxLeadsPerRun, 20), // Max 20 leads par tenant par cycle
        csvPath: null
      };
      
      // Générer leads
      const result = await generateLeads(tenant_id, options);
      
      console.log('[ACQUISITION_TENANT_COMPLETED]', {
        cycleId,
        tenant_id,
        success: result.success,
        generated: result.generated || 0,
        inserted: result.inserted || 0
      });
      
      return {
        tenant_id,
        cycleId,
        success: result.success,
        generated: result.generated || 0,
        inserted: result.inserted || 0,
        duplicates: result.duplicates || 0,
        source: result.source,
        error: result.error || null
      };
      
    } catch (error) {
      console.log('[ACQUISITION_TENANT_ERROR]', {
        cycleId,
        tenant_id,
        error: error.message
      });
      
      return {
        tenant_id,
        cycleId,
        success: false,
        error: error.message
      };
    }
  }
  
  // Calculer stats du cycle
  calculateCycleStats(cycleResults) {
    const successful = cycleResults.filter(r => r.success);
    const failed = cycleResults.filter(r => !r.success);
    
    const totalGenerated = successful.reduce((sum, r) => sum + (r.generated || 0), 0);
    const totalInserted = successful.reduce((sum, r) => sum + (r.inserted || 0), 0);
    const totalDuplicates = successful.reduce((sum, r) => sum + (r.duplicates || 0), 0);
    
    return {
      tenantsProcessed: cycleResults.length,
      successful: successful.length,
      failed: failed.length,
      totalGenerated,
      totalInserted,
      totalDuplicates
    };
  }
  
  // Exécuter un cycle manuellement
  async runManualCycle(tenant_ids = null) {
    if (!this.enabled) {
      return { success: false, reason: 'scheduler_disabled' };
    }
    
    console.log('[ACQUISITION_MANUAL_CYCLE_STARTED]', {
      tenant_ids,
      timestamp: new Date()
    });
    
    try {
      const cycleId = `manual_${Date.now()}`;
      const startTime = Date.now();
      
      let tenants;
      
      if (tenant_ids && tenant_ids.length > 0) {
        // Tenants spécifiés
        const allTenants = listTenants();
        tenants = allTenants.filter(tenant => 
          tenant_ids.includes(tenant.tenant_id) && tenant.status === 'ACTIVE'
        );
      } else {
        // Tous les tenants actifs
        tenants = listTenants().filter(tenant => 
          tenant.status === 'ACTIVE' && tenant.tenant_id !== 'DEFAULT'
        );
      }
      
      if (tenants.length === 0) {
        return { success: false, reason: 'no_active_tenants' };
      }
      
      // Exécuter pour les tenants
      const cycleResults = [];
      
      for (const tenant of tenants) {
        const result = await this.runTenantAcquisition(tenant.tenant_id, cycleId);
        cycleResults.push(result);
        
        // Pause entre tenants
        await this.sleep(500);
      }
      
      const cycleStats = this.calculateCycleStats(cycleResults);
      
      console.log('[ACQUISITION_MANUAL_CYCLE_COMPLETED]', {
        cycleId,
        ...cycleStats,
        duration: Date.now() - startTime
      });
      
      return {
        success: true,
        cycleId,
        ...cycleStats,
        duration: Date.now() - startTime,
        results: cycleResults
      };
      
    } catch (error) {
      console.log('[ACQUISITION_MANUAL_CYCLE_ERROR]', error.message);
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // Obtenir stats du scheduler
  getSchedulerStats() {
    const recentHistory = this.stats.runHistory.slice(-10); // 10 derniers cycles
    
    return {
      enabled: this.enabled,
      running: this.isRunning,
      config: {
        frequency: this.frequency,
        maxLeadsPerRun: this.maxLeadsPerRun
      },
      stats: {
        totalRuns: this.stats.totalRuns,
        totalLeadsGenerated: this.stats.totalLeadsGenerated,
        totalErrors: this.stats.totalErrors,
        lastRun: this.stats.lastRun,
        nextRun: this.stats.nextRun
      },
      recentHistory,
      uptime: process.uptime()
    };
  }
  
  // Health check
  healthCheck() {
    const stats = this.getSchedulerStats();
    
    const health = {
      status: 'healthy',
      enabled: stats.enabled,
      running: stats.running,
      issues: [],
      recommendations: []
    };
    
    // Vérifier si le scheduler tourne
    if (stats.enabled && !stats.running) {
      health.issues.push('Scheduler enabled but not running');
      health.recommendations.push('Check scheduler start process');
    }
    
    // Vérifier taux d'erreur
    const errorRate = stats.stats.totalRuns > 0 ? 
      (stats.stats.totalErrors / stats.stats.totalRuns) * 100 : 0;
    
    if (errorRate > 20) {
      health.issues.push('High error rate');
      health.recommendations.push('Check lead generation sources');
    }
    
    // Vérifier dernière exécution
    if (stats.stats.lastRun) {
      const timeSinceLastRun = Date.now() - new Date(stats.stats.lastRun).getTime();
      const expectedInterval = stats.config.frequency * 60 * 1000;
      
      if (timeSinceLastRun > expectedInterval * 2) {
        health.issues.push('Scheduler appears stuck');
        health.recommendations.push('Check scheduler interval');
      }
    }
    
    if (health.issues.length > 0) {
      health.status = 'warning';
    }
    
    return {
      ...health,
      stats: {
        running: stats.running,
        totalRuns: stats.stats.totalRuns,
        totalLeadsGenerated: stats.stats.totalLeadsGenerated,
        errorRate: Math.round(errorRate * 100) / 100,
        lastRun: stats.stats.lastRun,
        nextRun: stats.stats.nextRun
      }
    };
  }
  
  // Réinitialiser stats
  resetStats() {
    this.stats = {
      totalRuns: 0,
      totalLeadsGenerated: 0,
      totalErrors: 0,
      lastRun: null,
      nextRun: this.isRunning ? new Date(Date.now() + (this.frequency * 60 * 1000)) : null,
      runHistory: []
    };
    
    console.log('[ACQUISITION_SCHEDULER_STATS_RESET]');
  }
  
  // Helper pour pause
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // Détruire
  destroy() {
    this.stop();
    
    console.log('[ACQUISITION_SCHEDULER_DESTROYED]');
  }
}

// Instance globale du scheduler
if (!global.acquisitionScheduler) {
  global.acquisitionScheduler = new AcquisitionScheduler();
}

// Fonctions principales
function startScheduler() {
  return global.acquisitionScheduler.start();
}

function stopScheduler() {
  return global.acquisitionScheduler.stop();
}

async function runManualCycle(tenant_ids) {
  return await global.acquisitionScheduler.runManualCycle(tenant_ids);
}

function getSchedulerStats() {
  return global.acquisitionScheduler.getSchedulerStats();
}

function schedulerHealthCheck() {
  return global.acquisitionScheduler.healthCheck();
}

// Administration
function resetSchedulerStats() {
  return global.acquisitionScheduler.resetStats();
}

module.exports = {
  startScheduler,
  stopScheduler,
  runManualCycle,
  getSchedulerStats,
  schedulerHealthCheck,
  resetSchedulerStats,
  AcquisitionScheduler
};
