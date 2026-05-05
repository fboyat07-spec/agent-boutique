// ACTION 7 - Validation doublons

const { getLeadsByTenant } = require('./tenantIsolationSafe');
const { getFlag } = require('./envFlags');
const { logDuplicateDetected, logError } = require('./testModeLogger');
const { addTraceStep } = require('./traceManager');

// Validateur de doublons pour mode test (SAFE - validation et logging uniquement)
class DuplicateValidator {
  constructor() {
    this.enabled = getFlag('AGENT_TEST_MODE');
    this.stats = {
      totalChecks: 0,
      duplicatesDetected: 0,
      uniqueLeads: 0,
      errors: 0,
      byTenant: new Map()
    };
    
    console.log('[DUPLICATE_VALIDATOR_INITIALIZED]', {
      enabled: this.enabled
    });
  }
  
  // Vérifier si un lead est un doublon
  checkDuplicate(phone, tenant_id, leadData = {}) {
    if (!this.enabled) {
      return { isDuplicate: false, reason: 'validation_disabled' };
    }
    
    this.stats.totalChecks++;
    
    try {
      // Obtenir tous les leads du tenant
      const leads = getLeadsByTenant(tenant_id);
      
      // Chercher un lead avec le même téléphone
      const existingLead = leads.find(lead => lead.phone === phone);
      
      if (existingLead) {
        this.stats.duplicatesDetected++;
        
        // Stats par tenant
        const tenantStats = this.stats.byTenant.get(tenant_id) || { 
          checks: 0, 
          duplicates: 0, 
          unique: 0 
        };
        tenantStats.duplicates++;
        this.stats.byTenant.set(tenant_id, tenantStats);
        
        console.log('[DUPLICATE_DETECTED]', {
          phone: this.maskPhone(phone),
          tenant_id,
          existingLeadId: existingLead.id,
          existingStatus: existingLead.status,
          existingCreatedAt: existingLead.createdAt
        });
        
        // Logger le doublon
        logDuplicateDetected(phone, tenant_id, existingLead.id, leadData.lead_id);
        
        // Ajouter l'étape à la trace
        addTraceStep(this.getTraceId(phone), 'duplicate_detected', {
          existingLeadId: existingLead.id,
          existingStatus: existingLead.status,
          newLeadId: leadData.lead_id,
          action: 'skipped'
        });
        
        return {
          isDuplicate: true,
          existingLead: {
            ...existingLead,
            phone: this.maskPhone(existingLead.phone)
          },
          reason: 'phone_already_exists',
          action: 'skip_creation'
        };
      } else {
        this.stats.uniqueLeads++;
        
        // Stats par tenant
        const tenantStats = this.stats.byTenant.get(tenant_id) || { 
          checks: 0, 
          duplicates: 0, 
          unique: 0 
        };
        tenantStats.unique++;
        this.stats.byTenant.set(tenant_id, tenantStats);
        
        console.log('[DUPLICATE_CHECK_PASSED]', {
          phone: this.maskPhone(phone),
          tenant_id,
          newLeadId: leadData.lead_id
        });
        
        return {
          isDuplicate: false,
          reason: 'unique_phone',
          action: 'proceed_creation'
        };
      }
      
    } catch (error) {
      this.stats.errors++;
      
      console.log('[DUPLICATE_VALIDATOR_ERROR]', {
        phone: this.maskPhone(phone),
        tenant_id,
        error: error.message
      });
      
      logError('duplicate_check_error', phone, tenant_id, leadData.lead_id, error);
      
      return {
        isDuplicate: false,
        reason: 'validation_error',
        error: error.message,
        action: 'proceed_with_caution'
      };
    }
  }
  
  // Valider les doublons de messages
  checkMessageDuplicate(phone, tenant_id, messageContent, timestamp) {
    if (!this.enabled) {
      return { isDuplicate: false, reason: 'validation_disabled' };
    }
    
    try {
      // Obtenir tous les leads du tenant
      const leads = getLeadsByTenant(tenant_id);
      const lead = leads.find(l => l.phone === phone);
      
      if (!lead) {
        return { isDuplicate: false, reason: 'lead_not_found' };
      }
      
      // Vérifier si le lead a des messages récents avec le même contenu
      const recentMessages = this.getRecentMessages(lead);
      
      const duplicateMessage = recentMessages.find(msg => 
        msg.content === messageContent && 
        Math.abs(new Date(msg.timestamp) - new Date(timestamp)) < 5000 // 5 secondes
      );
      
      if (duplicateMessage) {
        console.log('[MESSAGE_DUPLICATE_DETECTED]', {
          phone: this.maskPhone(phone),
          tenant_id,
          leadId: lead.id,
          messageAge: Math.abs(new Date(duplicateMessage.timestamp) - new Date(timestamp))
        });
        
        return {
          isDuplicate: true,
          existingMessage: duplicateMessage,
          reason: 'same_message_recently_sent',
          action: 'skip_sending'
        };
      }
      
      return {
        isDuplicate: false,
        reason: 'unique_message',
        action: 'proceed_sending'
      };
      
    } catch (error) {
      console.log('[MESSAGE_DUPLICATE_CHECK_ERROR]', {
        phone: this.maskPhone(phone),
        tenant_id,
        error: error.message
      });
      
      return {
        isDuplicate: false,
        reason: 'validation_error',
        error: error.message,
        action: 'proceed_with_caution'
      };
    }
  }
  
  // Obtenir les messages récents d'un lead (simulation)
  getRecentMessages(lead) {
    // Simulation - en production, utiliserait les vrais messages
    const metadata = lead.metadata || {};
    const messages = metadata.messages || [];
    
    // Retourner seulement les messages des 24 dernières heures
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    
    return messages.filter(msg => 
      new Date(msg.timestamp).getTime() > oneDayAgo
    );
  }
  
  // Valider les doublons de paiement
  checkPaymentDuplicate(phone, tenant_id, amount) {
    if (!this.enabled) {
      return { isDuplicate: false, reason: 'validation_disabled' };
    }
    
    try {
      // Obtenir tous les leads du tenant
      const leads = getLeadsByTenant(tenant_id);
      const lead = leads.find(l => l.phone === phone);
      
      if (!lead) {
        return { isDuplicate: false, reason: 'lead_not_found' };
      }
      
      // Vérifier si le lead est déjà en statut PAYMENT_SENT ou WON
      if (lead.status === 'PAYMENT_SENT') {
        console.log('[PAYMENT_DUPLICATE_DETECTED]', {
          phone: this.maskPhone(phone),
          tenant_id,
          leadId: lead.id,
          currentStatus: lead.status
        });
        
        return {
          isDuplicate: true,
          existingStatus: lead.status,
          reason: 'payment_already_sent',
          action: 'skip_payment'
        };
      }
      
      if (lead.status === 'WON') {
        console.log('[PAYMENT_DUPLICATE_DETECTED]', {
          phone: this.maskPhone(phone),
          tenant_id,
          leadId: lead.id,
          currentStatus: lead.status
        });
        
        return {
          isDuplicate: true,
          existingStatus: lead.status,
          reason: 'already_converted',
          action: 'skip_payment'
        };
      }
      
      return {
        isDuplicate: false,
        reason: 'payment_allowed',
        action: 'proceed_payment'
      };
      
    } catch (error) {
      console.log('[PAYMENT_DUPLICATE_CHECK_ERROR]', {
        phone: this.maskPhone(phone),
        tenant_id,
        error: error.message
      });
      
      return {
        isDuplicate: false,
        reason: 'validation_error',
        error: error.message,
        action: 'proceed_with_caution'
      };
    }
  }
  
  // Obtenir les stats du validateur
  getValidatorStats() {
    if (!this.enabled) {
      return { enabled: false };
    }
    
    const totalChecks = this.stats.totalChecks;
    const duplicateRate = totalChecks > 0 ? 
      (this.stats.duplicatesDetected / totalChecks) * 100 : 0;
    
    const byTenantStats = {};
    for (const [tenantId, stats] of this.stats.byTenant.entries()) {
      byTenantStats[tenantId] = {
        ...stats,
        duplicateRate: stats.checks > 0 ? (stats.duplicates / stats.checks) * 100 : 0
      };
    }
    
    return {
      enabled: this.enabled,
      stats: {
        totalChecks: this.stats.totalChecks,
        duplicatesDetected: this.stats.duplicatesDetected,
        uniqueLeads: this.stats.uniqueLeads,
        errors: this.stats.errors,
        duplicateRate: Math.round(duplicateRate * 100) / 100
      },
      byTenant: byTenantStats,
      uptime: process.uptime()
    };
  }
  
  // Obtenir le rapport de validation
  getValidationReport() {
    if (!this.enabled) {
      return { enabled: false };
    }
    
    const stats = this.getValidatorStats();
    
    // Calculer les métriques de qualité
    const quality = {
      duplicateDetectionRate: stats.stats.duplicateRate,
      errorRate: stats.stats.totalChecks > 0 ? 
        (stats.stats.errors / stats.stats.totalChecks) * 100 : 0,
      tenantCoverage: Object.keys(stats.byTenant).length
    };
    
    // Recommandations
    const recommendations = [];
    
    if (quality.duplicateDetectionRate > 50) {
      recommendations.push('High duplicate rate - consider improving lead quality');
    }
    
    if (quality.errorRate > 10) {
      recommendations.push('High error rate - check data sources and validation logic');
    }
    
    if (quality.tenantCoverage < 2) {
      recommendations.push('Low tenant coverage - test with multiple tenants');
    }
    
    return {
      enabled: this.enabled,
      stats: stats.stats,
      quality,
      recommendations,
      metadata: {
        generated_at: new Date(),
        test_mode: true
      }
    };
  }
  
  // Réinitialiser les stats
  resetStats() {
    this.stats = {
      totalChecks: 0,
      duplicatesDetected: 0,
      uniqueLeads: 0,
      errors: 0,
      byTenant: new Map()
    };
    
    console.log('[DUPLICATE_VALIDATOR_STATS_RESET]');
  }
  
  // Obtenir le trace ID pour un téléphone
  getTraceId(phone) {
    // Simulation - en production, utiliserait le trace manager
    return `trace_${phone}`;
  }
  
  // Masquer téléphone pour logs
  maskPhone(phone) {
    if (!phone || typeof phone !== 'string') return 'unknown';
    return phone.slice(0, -4) + '****';
  }
}

// Instance globale du validateur
if (!global.duplicateValidator) {
  global.duplicateValidator = new DuplicateValidator();
}

// Fonctions principales
function checkDuplicate(phone, tenant_id, leadData) {
  return global.duplicateValidator.checkDuplicate(phone, tenant_id, leadData);
}

function checkMessageDuplicate(phone, tenant_id, messageContent, timestamp) {
  return global.duplicateValidator.checkMessageDuplicate(phone, tenant_id, messageContent, timestamp);
}

function checkPaymentDuplicate(phone, tenant_id, amount) {
  return global.duplicateValidator.checkPaymentDuplicate(phone, tenant_id, amount);
}

// Stats et monitoring
function getValidatorStats() {
  return global.duplicateValidator.getValidatorStats();
}

function getValidationReport() {
  return global.duplicateValidator.getValidationReport();
}

// Administration
function resetValidatorStats() {
  return global.duplicateValidator.resetStats();
}

module.exports = {
  checkDuplicate,
  checkMessageDuplicate,
  checkPaymentDuplicate,
  getValidatorStats,
  getValidationReport,
  resetValidatorStats,
  DuplicateValidator
};
