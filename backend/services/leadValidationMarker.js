// ACTION 3 - Marquage leads test réel

const { getFlag } = require('./envFlags');
const { getLeadsByTenant } = require('./tenantIsolationSafe');

// Marqueur de validation pour leads (SAFE - marquage non destructif)
class LeadValidationMarker {
  constructor() {
    this.testModeEnabled = getFlag('AGENT_TEST_MODE');
    this.realValidationEnabled = getFlag('AGENT_REAL_VALIDATION_MODE');
    this.stats = {
      totalMarked: 0,
      testLeads: 0,
      realLeads: 0,
      byTenant: new Map()
    };
    
    console.log('[LEAD_VALIDATION_MARKER_INITIALIZED]', {
      testModeEnabled: this.testModeEnabled,
      realValidationEnabled: this.realValidationEnabled
    });
  }
  
  // Obtenir le mode de validation pour un lead
  getValidationMode(source = 'unknown') {
    if (this.realValidationEnabled && source === 'whatsapp_real') {
      return 'real';
    } else if (this.testModeEnabled) {
      return 'test';
    } else {
      return 'production';
    }
  }
  
  // Marquer un lead avec son mode de validation
  markLeadValidation(lead, source = 'unknown', additionalData = {}) {
    if (!this.testModeEnabled && !this.realValidationEnabled) {
      return lead; // Pas de marquage en mode production pur
    }
    
    const validationMode = this.getValidationMode(source);
    
    // Créer une copie du lead avec marquage
    const markedLead = {
      ...lead,
      validationMode,
      validationMetadata: {
        markedAt: new Date(),
        source,
        environment: this.getEnvironment(),
        ...additionalData
      }
    };
    
    // Stats
    this.stats.totalMarked++;
    
    if (validationMode === 'test') {
      this.stats.testLeads++;
    } else if (validationMode === 'real') {
      this.stats.realLeads++;
    }
    
    // Stats par tenant
    const tenantStats = this.stats.byTenant.get(lead.tenant_id) || { 
      test: 0, 
      real: 0, 
      production: 0 
    };
    tenantStats[validationMode]++;
    this.stats.byTenant.set(lead.tenant_id, tenantStats);
    
    console.log('[LEAD_VALIDATION_MARKED]', {
      leadId: lead.id,
      tenant_id: lead.tenant_id,
      phone: this.maskPhone(lead.phone),
      validationMode,
      source
    });
    
    return markedLead;
  }
  
  // Mettre à jour le mode de validation d'un lead existant
  updateLeadValidation(phone, tenant_id, newValidationMode, reason = '') {
    if (!this.testModeEnabled && !this.realValidationEnabled) {
      return { success: false, reason: 'validation_disabled' };
    }
    
    // Obtenir les leads du tenant
    const leads = getLeadsByTenant(tenant_id);
    const lead = leads.find(l => l.phone === phone);
    
    if (!lead) {
      return { success: false, reason: 'lead_not_found' };
    }
    
    const oldValidationMode = lead.validationMode || 'production';
    
    // Mettre à jour le lead (simulation - en production, mettrait à jour la base)
    lead.validationMode = newValidationMode;
    
    if (!lead.validationMetadata) {
      lead.validationMetadata = {};
    }
    
    lead.validationMetadata.updatedAt = new Date();
    lead.validationMetadata.previousMode = oldValidationMode;
    lead.validationMetadata.updateReason = reason;
    
    console.log('[LEAD_VALIDATION_UPDATED]', {
      leadId: lead.id,
      tenant_id,
      phone: this.maskPhone(phone),
      oldValidationMode,
      newValidationMode,
      reason
    });
    
    return {
      success: true,
      leadId: lead.id,
      oldValidationMode,
      newValidationMode,
      reason
    };
  }
  
  // Obtenir les leads par mode de validation
  getLeadsByValidationMode(tenant_id, validationMode) {
    if (!this.testModeEnabled && !this.realValidationEnabled) {
      return { enabled: false };
    }
    
    const leads = getLeadsByTenant(tenant_id);
    const filteredLeads = leads.filter(lead => 
      lead.validationMode === validationMode
    );
    
    // Masquer les téléphones
    const maskedLeads = filteredLeads.map(lead => ({
      ...lead,
      phone: this.maskPhone(lead.phone)
    }));
    
    return {
      enabled: true,
      leads: maskedLeads,
      count: maskedLeads.length,
      validationMode,
      tenant_id
    };
  }
  
  // Obtenir les stats de marquage
  getMarkerStats() {
    if (!this.testModeEnabled && !this.realValidationEnabled) {
      return { enabled: false };
    }
    
    const byTenantStats = {};
    for (const [tenantId, stats] of this.stats.byTenant.entries()) {
      byTenantStats[tenantId] = {
        ...stats,
        total: stats.test + stats.real + stats.production
      };
    }
    
    return {
      enabled: true,
      environment: this.getEnvironment(),
      stats: {
        totalMarked: this.stats.totalMarked,
        testLeads: this.stats.testLeads,
        realLeads: this.stats.realLeads,
        productionLeads: this.stats.totalMarked - this.stats.testLeads - this.stats.realLeads
      },
      byTenant: byTenantStats,
      uptime: process.uptime()
    };
  }
  
  // Obtenir le rapport de validation
  getValidationReport() {
    if (!this.testModeEnabled && !this.realValidationEnabled) {
      return { enabled: false };
    }
    
    const stats = this.getMarkerStats();
    
    // Calculer les métriques
    const metrics = {
      validationModeDistribution: {
        test: stats.stats.testLeads,
        real: stats.stats.realLeads,
        production: stats.stats.productionLeads,
        total: stats.stats.totalMarked
      },
      realVsTestRatio: stats.stats.testLeads > 0 ? 
        (stats.stats.realLeads / stats.stats.testLeads) : 0,
      tenantCoverage: Object.keys(stats.byTenant).length
    };
    
    // Recommandations
    const recommendations = this.generateRecommendations(stats, metrics);
    
    return {
      enabled: true,
      environment: this.getEnvironment(),
      stats: stats.stats,
      metrics,
      recommendations,
      metadata: {
        generated_at: new Date(),
        validation_modes: ['test', 'real', 'production']
      }
    };
  }
  
  // Générer des recommandations
  generateRecommendations(stats, metrics) {
    const recommendations = [];
    
    if (metrics.realVsTestRatio === 0 && stats.stats.realLeads === 0) {
      recommendations.push({
        type: 'info',
        message: 'No real validation leads yet',
        action: 'Enable real validation mode to test with real users',
        priority: 'medium'
      });
    }
    
    if (metrics.realVsTestRatio > 10) {
      recommendations.push({
        type: 'warning',
        message: 'High real vs test ratio',
        action: 'Consider running more test scenarios before real validation',
        priority: 'medium'
      });
    }
    
    if (metrics.tenantCoverage < 2) {
      recommendations.push({
        type: 'info',
        message: 'Low tenant coverage',
        action: 'Test validation across multiple tenants',
        priority: 'low'
      });
    }
    
    if (stats.stats.totalMarked > 100) {
      recommendations.push({
        type: 'info',
        message: 'High number of marked leads',
        action: 'Consider cleaning up old test leads',
        priority: 'low'
      });
    }
    
    return recommendations;
  }
  
  // Nettoyer les anciens marquages
  cleanup(maxAge = 7 * 24 * 60 * 60 * 1000) { // 7 jours
    const cutoff = Date.now() - maxAge;
    let cleaned = 0;
    
    // Simulation - en production, nettoierait la base de données
    console.log('[LEAD_VALIDATION_CLEANUP]', {
      maxAge,
      cutoff,
      note: 'Cleanup simulation - implement actual database cleanup in production'
    });
    
    return cleaned;
  }
  
  // Réinitialiser les stats
  resetStats() {
    this.stats = {
      totalMarked: 0,
      testLeads: 0,
      realLeads: 0,
      byTenant: new Map()
    };
    
    console.log('[LEAD_VALIDATION_MARKER_STATS_RESET]');
  }
  
  // Obtenir l'environnement actuel
  getEnvironment() {
    if (this.realValidationEnabled) {
      return 'real_validation';
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
}

// Instance globale du marqueur
if (!global.leadValidationMarker) {
  global.leadValidationMarker = new LeadValidationMarker();
}

// Fonctions principales
function markLeadValidation(lead, source, additionalData) {
  return global.leadValidationMarker.markLeadValidation(lead, source, additionalData);
}

function updateLeadValidation(phone, tenant_id, newValidationMode, reason) {
  return global.leadValidationMarker.updateLeadValidation(phone, tenant_id, newValidationMode, reason);
}

function getLeadsByValidationMode(tenant_id, validationMode) {
  return global.leadValidationMarker.getLeadsByValidationMode(tenant_id, validationMode);
}

// Stats et monitoring
function getMarkerStats() {
  return global.leadValidationMarker.getMarkerStats();
}

function getValidationReport() {
  return global.leadValidationMarker.getValidationReport();
}

// Administration
function cleanupValidationMarkers(maxAge) {
  return global.leadValidationMarker.cleanup(maxAge);
}

function resetMarkerStats() {
  return global.leadValidationMarker.resetStats();
}

module.exports = {
  markLeadValidation,
  updateLeadValidation,
  getLeadsByValidationMode,
  getMarkerStats,
  getValidationReport,
  cleanupValidationMarkers,
  resetMarkerStats,
  LeadValidationMarker
};
