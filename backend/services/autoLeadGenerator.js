// ACTION 1 - Module Lead Generator (acquisition auto)

const { getLeadsByTenant } = require('./tenantIsolationSafe');
const BusinessLogger = require('./businessLogger');
const { trackLeadCreated } = require('./eventTracker');
const { getUserPlan, getPlanFeatures } = require('./stripeService');

// Générateur de leads automatique (SAFE)
class AutoLeadGenerator {
  constructor() {
    this.enabled = process.env.LEAD_GEN_ENABLED === 'true';
    this.maxLeadsPerRun = parseInt(process.env.LEAD_GEN_MAX_PER_RUN) || 50;
    this.sources = ['csv_import', 'mock_generation', 'external_api'];
    this.stats = {
      totalGenerated: 0,
      totalDuplicates: 0,
      totalErrors: 0,
      bySource: {}
    };
    
    console.log('[AUTO_LEAD_GENERATOR_INITIALIZED]', {
      enabled: this.enabled,
      maxLeadsPerRun: this.maxLeadsPerRun
    });
  }
  
  // Générer leads automatiquement
  async generateLeads(tenant_id, options = {}) {
    if (!this.enabled) {
      return { success: false, reason: 'lead_gen_disabled' };
    }
    
    const {
      source = 'mock_generation',
      count = this.maxLeadsPerRun,
      csvPath = null
    } = options;
    
    console.log('[AUTO_LEAD_GENERATION_STARTED]', {
      tenant_id,
      source,
      count,
      timestamp: new Date()
    });
    
    try {
      let leads = [];
      
      // Générer selon la source
      switch (source) {
        case 'csv_import':
          leads = await this.generateFromCSV(tenant_id, csvPath, count);
          break;
        case 'mock_generation':
          leads = this.generateMockLeads(tenant_id, count);
          break;
        case 'external_api':
          leads = await this.generateFromExternalAPI(tenant_id, count);
          break;
        default:
          throw new Error(`Unknown source: ${source}`);
      }
      
      // Déduplication
      const deduplication = this.deduplicateLeads(tenant_id, leads);
      
      // SAFE: Plan limit check (ADDITIVE ONLY)
      const currentLeads = await this.getCurrentLeadCount(tenant_id);
      const user = await this.getTenantUser(tenant_id);
      const plan = getUserPlan(user) || "starter";
      const features = getPlanFeatures(plan);
      
      if (currentLeads >= features.maxLeads) {
        console.warn('[LEAD LIMIT REACHED]', { plan });
        return {
          success: false,
          reason: 'plan_limit_reached',
          currentLeads,
          maxLeads: features.maxLeads
        };
      }

      // Insérer via endpoint existant (simulation)
      const insertion = await this.insertLeadsViaEndpoint(tenant_id, deduplication.uniqueLeads);
      
      // Stats
      this.stats.totalGenerated += deduplication.uniqueLeads.length;
      this.stats.totalDuplicates += deduplication.duplicates.length;
      this.stats.bySource[source] = (this.stats.bySource[source] || 0) + deduplication.uniqueLeads.length;
      
      console.log('[AUTO_LEAD_GENERATION_COMPLETED]', {
        tenant_id,
        source,
        generated: deduplication.uniqueLeads.length,
        duplicates: deduplication.duplicates.length,
        inserted: insertion.inserted
      });
      
      BusinessLogger.logTenantEvent('leads_generated', tenant_id, {
        source,
        generated: deduplication.uniqueLeads.length,
        duplicates: deduplication.duplicates.length,
        inserted: insertion.inserted
      });
      
      return {
        success: true,
        tenant_id,
        source,
        generated: deduplication.uniqueLeads.length,
        duplicates: deduplication.duplicates.length,
        inserted: insertion.inserted,
        leads: deduplication.uniqueLeads.map(lead => ({
          phone: lead.phone.slice(0, -4) + '****',
          source: lead.source,
          createdAt: lead.createdAt
        }))
      };
      
    } catch (error) {
      this.stats.totalErrors++;
      
      console.log('[AUTO_LEAD_GENERATION_ERROR]', {
        tenant_id,
        source,
        error: error.message
      });
      
      return {
        success: false,
        tenant_id,
        source,
        error: error.message
      };
    }
  }
  
  // Générer leads depuis CSV
  async generateFromCSV(tenant_id, csvPath, count) {
    if (!csvPath) {
      throw new Error('CSV path required for csv_import source');
    }
    
    // Simulation d'import CSV
    const mockCSVLeads = [];
    
    for (let i = 0; i < count; i++) {
      mockCSVLeads.push({
        phone: this.generateRandomPhone(),
        source: 'csv_import',
        createdAt: new Date().toISOString(),
        tenant_id,
        metadata: {
          csv_file: csvPath,
          row_number: i + 1
        }
      });
    }
    
    console.log('[AUTO_LEAD_CSV_IMPORTED]', {
      tenant_id,
      csvPath,
      count: mockCSVLeads.length
    });
    
    return mockCSVLeads;
  }
  
  // Générer leads mock (pour tests/démo)
  generateMockLeads(tenant_id, count) {
    const mockLeads = [];
    const prefixes = ['06', '07', '01'];
    const regions = ['Paris', 'Lyon', 'Marseille', 'Toulouse', 'Nice'];
    
    for (let i = 0; i < count; i++) {
      const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
      const region = regions[Math.floor(Math.random() * regions.length)];
      
      mockLeads.push({
        phone: this.generateRandomPhone(prefix),
        source: 'mock_generation',
        createdAt: new Date().toISOString(),
        tenant_id,
        metadata: {
          region,
          generated_by: 'auto_lead_generator',
          batch_id: `batch_${Date.now()}`
        }
      });
    }
    
    console.log('[AUTO_LEAD_MOCK_GENERATED]', {
      tenant_id,
      count: mockLeads.length
    });
    
    return mockLeads;
  }
  
  // Générer leads depuis API externe (optionnel)
  async generateFromExternalAPI(tenant_id, count) {
    const apiKey = process.env.EXTERNAL_LEAD_API_KEY;
    
    if (!apiKey) {
      console.log('[AUTO_LEAD_EXTERNAL_API_NO_KEY]', { tenant_id });
      // Fallback vers mock
      return this.generateMockLeads(tenant_id, count);
    }
    
    // Simulation d'appel API externe
    const externalLeads = [];
    
    for (let i = 0; i < count; i++) {
      externalLeads.push({
        phone: this.generateRandomPhone(),
        source: 'external_api',
        createdAt: new Date().toISOString(),
        tenant_id,
        metadata: {
          api_provider: 'external_lead_service',
          lead_id: `ext_${Date.now()}_${i}`,
          quality_score: Math.random() * 100
        }
      });
    }
    
    console.log('[AUTO_LEAD_EXTERNAL_API_IMPORTED]', {
      tenant_id,
      count: externalLeads.length
    });
    
    return externalLeads;
  }
  
  // Déduplication des leads
  deduplicateLeads(tenant_id, newLeads) {
    const existingLeads = getLeadsByTenant(tenant_id);
    const existingPhones = new Set(existingLeads.map(lead => lead.phone));
    
    const uniqueLeads = [];
    const duplicates = [];
    
    for (const lead of newLeads) {
      if (existingPhones.has(lead.phone)) {
        duplicates.push(lead);
      } else {
        uniqueLeads.push(lead);
      }
    }
    
    console.log('[AUTO_LEAD_DEDUPLICATION]', {
      tenant_id,
      total: newLeads.length,
      unique: uniqueLeads.length,
      duplicates: duplicates.length
    });
    
    return {
      uniqueLeads,
      duplicates,
      total: newLeads.length
    };
  }
  
  // Insérer leads via endpoint existant (simulation)
  async insertLeadsViaEndpoint(tenant_id, leads) {
    // Simuler insertion via endpoint /api/agent/leads
    const inserted = [];
    
    for (const lead of leads) {
      try {
        // Simuler appel à l'endpoint existant
        const result = this.simulateLeadInsertion(lead);
        
        if (result.success) {
          inserted.push(lead);
          
          // Tracking événement
          trackLeadCreated(lead.phone, tenant_id, result.lead_id, lead.source);
        }
        
      } catch (error) {
        console.log('[AUTO_LEAD_INSERTION_ERROR]', {
          tenant_id,
          phone: lead.phone,
          error: error.message
        });
      }
    }
    
    console.log('[AUTO_LEAD_INSERTION_COMPLETED]', {
      tenant_id,
      attempted: leads.length,
      inserted: inserted.length
    });
    
    return {
      attempted: leads.length,
      inserted: inserted.length,
      failed: leads.length - inserted.length
    };
  }
  
  // Simuler insertion de lead
  simulateLeadInsertion(lead) {
    // Simuler réponse de l'endpoint existant
    const leadId = `lead_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      success: true,
      lead_id: leadId,
      status: 'NEW',
      score: Math.floor(Math.random() * 50) + 1 // Score 1-50
    };
  }
  
  // Générer numéro de téléphone aléatoire
  generateRandomPhone(prefix = null) {
    const prefixes = prefix ? [prefix] : ['06', '07', '01'];
    const selectedPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    
    // Générer 8 chiffres restants
    let remaining = '';
    for (let i = 0; i < 8; i++) {
      remaining += Math.floor(Math.random() * 10);
    }
    
    return selectedPrefix + remaining;
  }
  
  // Obtenir stats du générateur
  getGeneratorStats() {
    return {
      enabled: this.enabled,
      config: {
        maxLeadsPerRun: this.maxLeadsPerRun,
        availableSources: this.sources
      },
      stats: this.stats,
      uptime: process.uptime()
    };
  }
  
  // Health check
  healthCheck() {
    const stats = this.getGeneratorStats();
    
    const health = {
      status: 'healthy',
      enabled: stats.enabled,
      issues: [],
      recommendations: []
    };
    
    // Vérifier taux d'erreur
    const totalAttempts = stats.stats.totalGenerated + stats.stats.totalErrors;
    const errorRate = totalAttempts > 0 ? (stats.stats.totalErrors / totalAttempts) * 100 : 0;
    
    if (errorRate > 20) {
      health.issues.push('High error rate');
      health.recommendations.push('Check data sources and endpoint availability');
    }
    
    // Vérifier taux de doublons
    const totalProcessed = stats.stats.totalGenerated + stats.stats.totalDuplicates;
    const duplicateRate = totalProcessed > 0 ? (stats.stats.totalDuplicates / totalProcessed) * 100 : 0;
    
    if (duplicateRate > 50) {
      health.issues.push('High duplicate rate');
      health.recommendations.push('Improve data quality or deduplication logic');
    }
    
    if (health.issues.length > 0) {
      health.status = 'warning';
    }
    
    return {
      ...health,
      stats: {
        totalGenerated: stats.stats.totalGenerated,
        totalDuplicates: stats.stats.totalDuplicates,
        totalErrors: stats.stats.totalErrors,
        errorRate: Math.round(errorRate * 100) / 100,
        duplicateRate: Math.round(duplicateRate * 100) / 100
      }
    };
  }
  
  // Réinitialiser stats
  resetStats() {
    this.stats = {
      totalGenerated: 0,
      totalDuplicates: 0,
      totalErrors: 0,
      bySource: {}
    };
    
    console.log('[AUTO_LEAD_GENERATOR_STATS_RESET]');
  }
}

// Instance globale du générateur
if (!global.autoLeadGenerator) {
  global.autoLeadGenerator = new AutoLeadGenerator();
}

// Fonctions principales
async function generateLeads(tenant_id, options) {
  return await global.autoLeadGenerator.generateLeads(tenant_id, options);
}

function getGeneratorStats() {
  return global.autoLeadGenerator.getGeneratorStats();
}

function generatorHealthCheck() {
  return global.autoLeadGenerator.healthCheck();
}

// Administration
function resetGeneratorStats() {
  return global.autoLeadGenerator.resetStats();
}

module.exports = {
  generateLeads,
  getGeneratorStats,
  generatorHealthCheck,
  resetGeneratorStats,
  AutoLeadGenerator
};
