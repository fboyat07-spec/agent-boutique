// ACTION 5 - Phase 1 activation minimale

const { getFlag } = require('./envFlags');
const { preventMassiveActivation } = require('./massiveActivationPrevention');
const { logRealError } = require('./realValidationLogger');
const { addRealStep } = require('./realTraceManager');

// Gestionnaire de phases de paiement réel (SAFE - activation progressive contrôlée)
class RealPaymentPhases {
  constructor() {
    this.testModeEnabled = getFlag('AGENT_TEST_MODE');
    this.realValidationEnabled = getFlag('AGENT_REAL_VALIDATION_MODE');
    this.realPaymentEnabled = getFlag('AGENT_REAL_PAYMENT_ENABLED');
    this.stats = {
      totalActivations: 0,
      phase1Activations: 0,
      phase2Activations: 0,
      currentPhase: 'disabled',
      maxRealLeadsActive: 0,
      byTenant: new Map()
    };
    
    console.log('[REAL_PAYMENT_PHASES_INITIALIZED]', {
      testModeEnabled: this.testModeEnabled,
      realValidationEnabled: this.realValidationEnabled,
      realPaymentEnabled: this.realPaymentEnabled
    });
  }
  
  // Obtenir l'environnement actuel
  getEnvironment() {
    if (this.realPaymentEnabled && this.realValidationEnabled) {
      return 'real_payment';
    } else if (this.realValidationEnabled) {
      return 'real_validation';
    } else if (this.testModeEnabled) {
      return 'test';
    } else {
      return 'production';
    }
  }
  
  // Vérifier si le paiement réel est activé
  isRealPaymentEnabled() {
    return this.realPaymentEnabled && this.realValidationEnabled;
  }
  
  // Obtenir la phase actuelle
  getCurrentPhase() {
    if (!this.isRealPaymentEnabled()) {
      return 'disabled';
    }
    
    // Vérifier si nous sommes en phase 1 ou 2
    const maxRealLeads = this.getMaxRealLeadsActive();
    
    if (maxRealLeads === 1) {
      return 'phase1_minimal';
    } else if (maxRealLeads > 1) {
      return 'phase2_progressive';
    }
    
    return 'disabled';
  }
  
  // Obtenir le nombre maximum de leads réels actifs
  getMaxRealLeadsActive() {
    // En phase 1: 1 seul lead réel actif
    // En phase 2: progression 1→3→5→10
    const currentMax = this.stats.maxRealLeadsActive;
    
    if (currentMax === 0) {
      return 0; // Désactivé
    } else if (currentMax === 1) {
      return 1; // Phase 1
    } else if (currentMax === 3) {
      return 3; // Phase 2 - étape 1
    } else if (currentMax === 5) {
      return 5; // Phase 2 - étape 2
    } else if (currentMax === 10) {
      return 10; // Phase 2 - étape 3
    }
    
    return currentMax;
  }
  
  // Activer la phase 1 (activation minimale)
  async activatePhase1() {
    try {
      console.log('[REAL_PAYMENT_PHASE1_ACTIVATION_START]');
      
      // Vérifier les prérequis
      const prerequisites = this.checkPhase1Prerequisites();
      
      if (!prerequisites.valid) {
        console.log('[REAL_PAYMENT_PHASE1_PREREQUISITES_FAILED]', prerequisites.errors);
        
        return {
          success: false,
          error: 'phase1_prerequisites_failed',
          details: prerequisites.errors
        };
      }
      
      // Activer la phase 1
      this.stats.maxRealLeadsActive = 1;
      this.stats.currentPhase = 'phase1_minimal';
      this.stats.phase1Activations++;
      
      console.log('[REAL_PAYMENT_PHASE1_ACTIVATED]', {
        maxRealLeadsActive: 1,
        environment: this.getEnvironment()
      });
      
      // Logger l'activation
      logRealError('phase1_activated', null, null, null, new Error('Phase 1 activated'), {
        maxRealLeadsActive: 1,
        environment: this.getEnvironment()
      });
      
      return {
        success: true,
        phase: 'phase1_minimal',
        maxRealLeadsActive: 1,
        environment: this.getEnvironment(),
        metadata: {
          activatedAt: new Date(),
          purpose: 'minimal_real_payment_testing'
        }
      };
      
    } catch (error) {
      console.log('[REAL_PAYMENT_PHASE1_ACTIVATION_ERROR]', error.message);
      
      return {
        success: false,
        error: 'phase1_activation_error',
        details: error.message
      };
    }
  }
  
  // Activer la phase 2 (montée progressive)
  async activatePhase2(targetLeads = 3) {
    try {
      console.log('[REAL_PAYMENT_PHASE2_ACTIVATION_START]', { targetLeads });
      
      // Vérifier que la phase 1 a été validée
      const phase1Validation = await this.validatePhase1Completion();
      
      if (!phase1Validation.valid) {
        console.log('[REAL_PAYMENT_PHASE2_PHASE1_NOT_VALIDATED]', phase1Validation.errors);
        
        return {
          success: false,
          error: 'phase1_not_validated',
          details: phase1Validation.errors
        };
      }
      
      // Valider la cible de phase 2
      const validTargets = [3, 5, 10];
      if (!validTargets.includes(targetLeads)) {
        return {
          success: false,
          error: 'invalid_phase2_target',
          details: {
            requested: targetLeads,
            validTargets
          }
        };
      }
      
      // Activer la phase 2
      this.stats.maxRealLeadsActive = targetLeads;
      this.stats.currentPhase = 'phase2_progressive';
      this.stats.phase2Activations++;
      
      console.log('[REAL_PAYMENT_PHASE2_ACTIVATED]', {
        maxRealLeadsActive: targetLeads,
        environment: this.getEnvironment()
      });
      
      // Logger l'activation
      logRealError('phase2_activated', null, null, null, new Error('Phase 2 activated'), {
        maxRealLeadsActive: targetLeads,
        environment: this.getEnvironment()
      });
      
      return {
        success: true,
        phase: 'phase2_progressive',
        maxRealLeadsActive: targetLeads,
        environment: this.getEnvironment(),
        metadata: {
          activatedAt: new Date(),
          purpose: 'progressive_real_payment_scaling'
        }
      };
      
    } catch (error) {
      console.log('[REAL_PAYMENT_PHASE2_ACTIVATION_ERROR]', error.message);
      
      return {
        success: false,
        error: 'phase2_activation_error',
        details: error.message
      };
    }
  }
  
  // Progresser à l'étape suivante de la phase 2
  async progressToNextPhase2Step() {
    const currentMax = this.getMaxRealLeadsActive();
    
    if (currentMax === 1) {
      // Phase 1 → Phase 2 étape 1
      return await this.activatePhase2(3);
    } else if (currentMax === 3) {
      // Phase 2 étape 1 → étape 2
      return await this.activatePhase2(5);
    } else if (currentMax === 5) {
      // Phase 2 étape 2 → étape 3
      return await this.activatePhase2(10);
    } else if (currentMax === 10) {
      // Déjà au maximum
      return {
        success: false,
        error: 'already_at_maximum',
        currentMax: 10,
        message: 'Already at maximum phase 2 level'
      };
    } else {
      // État invalide
      return {
        success: false,
        error: 'invalid_current_state',
        currentMax
      };
    }
  }
  
  // Vérifier si un lead peut être activé pour paiement réel
  async canActivateLeadForRealPayment(lead, context = {}) {
    if (!this.isRealPaymentEnabled()) {
      return {
        allowed: false,
        reason: 'real_payment_disabled'
      };
    }
    
    // Protection anti-activation massive
    const protectionCheck = preventMassiveActivation('real_payment_activation', {
      tenant_id: lead.tenant_id,
      lead_id: lead.id,
      phone: lead.phone
    });
    
    if (!protectionCheck.allowed) {
      return {
        allowed: false,
        reason: 'massive_activation_blocked',
        details: protectionCheck
      };
    }
    
    // Vérifier la limite de leads réels actifs
    const currentRealLeads = await this.getCurrentRealLeadsCount(lead.tenant_id);
    const maxRealLeads = this.getMaxRealLeadsActive();
    
    if (currentRealLeads >= maxRealLeads) {
      return {
        allowed: false,
        reason: 'max_real_leads_reached',
        details: {
          current: currentRealLeads,
          max: maxRealLeads,
          phase: this.getCurrentPhase()
        }
      };
    }
    
    // Vérifier que le lead n'est pas déjà activé
    const alreadyActive = await this.isLeadAlreadyActive(lead);
    
    if (alreadyActive) {
      return {
        allowed: false,
        reason: 'lead_already_active',
        details: {
          leadId: lead.id,
          activeSince: alreadyActive.activeSince
        }
      };
    }
    
    return {
      allowed: true,
      reason: 'lead_can_be_activated',
      details: {
        currentRealLeads,
        maxRealLeads,
        phase: this.getCurrentPhase()
      }
    };
  }
  
  // Activer un lead pour paiement réel
  async activateLeadForRealPayment(lead, context = {}) {
    this.stats.totalActivations++;
    
    try {
      console.log('[REAL_PAYMENT_LEAD_ACTIVATION_START]', {
        leadId: lead.id,
        tenant_id: lead.tenant_id,
        phone: this.maskPhone(lead.phone),
        phase: this.getCurrentPhase()
      });
      
      // Vérifier si l'activation est autorisée
      const activationCheck = await this.canActivateLeadForRealPayment(lead, context);
      
      if (!activationCheck.allowed) {
        console.log('[REAL_PAYMENT_LEAD_ACTIVATION_BLOCKED]', {
          leadId: lead.id,
          reason: activationCheck.reason,
          environment: this.getEnvironment()
        });
        
        return {
          success: false,
          reason: activationCheck.reason,
          details: activationCheck.details,
          environment: this.getEnvironment()
        };
      }
      
      // Activer le lead
      const activationResult = await this.markLeadAsRealPaymentActive(lead);
      
      if (activationResult.success) {
        // Logger l'activation
        logRealError('lead_real_payment_activated', lead.phone, lead.tenant_id, lead.id, new Error('Lead activated for real payment'), {
          phase: this.getCurrentPhase(),
          maxRealLeadsActive: this.getMaxRealLeadsActive(),
          environment: this.getEnvironment()
        });
        
        // Ajouter l'étape à la trace
        if (context.traceId) {
          addRealStep(context.traceId, 'lead_real_payment_activated', {
            phone: this.maskPhone(lead.phone),
            phase: this.getCurrentPhase(),
            maxRealLeadsActive: this.getMaxRealLeadsActive(),
            environment: this.getEnvironment()
          });
        }
        
        // Mettre à jour les stats
        this.updateStats(lead);
        
        console.log('[REAL_PAYMENT_LEAD_ACTIVATION_SUCCESS]', {
          leadId: lead.id,
          phase: this.getCurrentPhase(),
          environment: this.getEnvironment()
        });
        
        return {
          success: true,
          leadId: lead.id,
          phase: this.getCurrentPhase(),
          maxRealLeadsActive: this.getMaxRealLeadsActive(),
          environment: this.getEnvironment()
        };
        
      } else {
        console.log('[REAL_PAYMENT_LEAD_ACTIVATION_FAILED]', {
          leadId: lead.id,
          error: activationResult.error,
          environment: this.getEnvironment()
        });
        
        return {
          success: false,
          error: activationResult.error,
          environment: this.getEnvironment()
        };
      }
      
    } catch (error) {
      console.log('[REAL_PAYMENT_LEAD_ACTIVATION_ERROR]', {
        leadId: lead.id,
        error: error.message,
        environment: this.getEnvironment()
      });
      
      return {
        success: false,
        error: 'lead_activation_exception',
        details: error.message,
        environment: this.getEnvironment()
      };
    }
  }
  
  // Vérifier les prérequis de la phase 1
  checkPhase1Prerequisites() {
    const errors = [];
    
    if (!this.realPaymentEnabled) {
      errors.push('AGENT_REAL_PAYMENT_ENABLED must be true');
    }
    
    if (!this.realValidationEnabled) {
      errors.push('AGENT_REAL_VALIDATION_MODE must be true');
    }
    
    if (!process.env.STRIPE_API_KEY) {
      errors.push('STRIPE_API_KEY must be configured');
    }
    
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      errors.push('STRIPE_WEBHOOK_SECRET must be configured');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  // Valider la complétion de la phase 1
  async validatePhase1Completion() {
    // Vérifier qu'au moins un paiement réel a été effectué en phase 1
    const phase1Payments = await this.getPhase1PaymentCount();
    
    if (phase1Payments === 0) {
      return {
        valid: false,
        errors: ['No payments completed in phase 1'],
        phase1Payments
      };
    }
    
    return {
      valid: true,
      phase1Payments
    };
  }
  
  // Obtenir le nombre de leads réels actifs
  async getCurrentRealLeadsCount(tenant_id) {
    // Simulation - en production, utiliserait la vraie base de données
    return Math.floor(Math.random() * this.getMaxRealLeadsActive());
  }
  
  // Vérifier si un lead est déjà actif
  async isLeadAlreadyActive(lead) {
    // Simulation - en production, vérifierait dans la base de données
    return null; // Pas actif
  }
  
  // Marquer un lead comme actif pour paiement réel
  async markLeadAsRealPaymentActive(lead) {
    try {
      // Simulation - en production, mettrait à jour la base de données
      const updateResult = {
        success: true,
        realPaymentActive: true,
        activatedAt: new Date(),
        phase: this.getCurrentPhase()
      };
      
      return updateResult;
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // Obtenir le nombre de paiements phase 1
  async getPhase1PaymentCount() {
    // Simulation - en production, utiliserait la vraie base de données
    return Math.floor(Math.random() * 3); // Simulation
  }
  
  // Mettre à jour les statistiques
  updateStats(lead) {
    if (lead && lead.tenant_id) {
      this.stats.byTenant.set(lead.tenant_id, (this.stats.byTenant.get(lead.tenant_id) || 0) + 1);
    }
  }
  
  // Obtenir les statistiques des phases
  getPhasesStats() {
    if (!this.isRealPaymentEnabled()) {
      return { enabled: false };
    }
    
    return {
      enabled: true,
      environment: this.getEnvironment(),
      currentPhase: this.getCurrentPhase(),
      maxRealLeadsActive: this.getMaxRealLeadsActive(),
      stats: {
        totalActivations: this.stats.totalActivations,
        phase1Activations: this.stats.phase1Activations,
        phase2Activations: this.stats.phase2Activations
      },
      byTenant: Object.fromEntries(this.stats.byTenant),
      progression: this.getProgressionInfo(),
      uptime: process.uptime()
    };
  }
  
  // Obtenir les informations de progression
  getProgressionInfo() {
    const currentPhase = this.getCurrentPhase();
    const currentMax = this.getMaxRealLeadsActive();
    
    const progression = {
      currentPhase,
      currentMax,
      nextStep: null,
      canProgress: false
    };
    
    if (currentPhase === 'phase1_minimal') {
      progression.nextStep = 'phase2_progressive_3';
      progression.canProgress = true;
    } else if (currentPhase === 'phase2_progressive') {
      if (currentMax === 3) {
        progression.nextStep = 'phase2_progressive_5';
        progression.canProgress = true;
      } else if (currentMax === 5) {
        progression.nextStep = 'phase2_progressive_10';
        progression.canProgress = true;
      } else if (currentMax === 10) {
        progression.nextStep = 'maximum_reached';
        progression.canProgress = false;
      }
    }
    
    return progression;
  }
  
  // Obtenir le rapport des phases
  getPhasesReport() {
    if (!this.isRealPaymentEnabled()) {
      return { enabled: false };
    }
    
    const stats = this.getPhasesStats();
    
    // Analyser les patterns d'activation
    const patterns = this.analyzeActivationPatterns(stats);
    
    // Générer des recommandations
    const recommendations = this.generatePhasesRecommendations(stats, patterns);
    
    return {
      enabled: true,
      environment: stats.environment,
      currentPhase: stats.currentPhase,
      maxRealLeadsActive: stats.maxRealLeadsActive,
      stats: stats.stats,
      progression: stats.progression,
      patterns,
      recommendations,
      metadata: {
        generated_at: new Date(),
        phase_type: 'real_payment_progressive'
      }
    };
  }
  
  // Analyser les patterns d'activation
  analyzeActivationPatterns(stats) {
    const patterns = {
      mostActiveTenant: null,
      activationRate: 0,
      phaseDistribution: {
        phase1: stats.stats.phase1Activations,
        phase2: stats.stats.phase2Activations
      }
    };
    
    // Tenant le plus actif
    let maxCount = 0;
    for (const [tenant, count] of Object.entries(stats.byTenant)) {
      if (count > maxCount) {
        maxCount = count;
        patterns.mostActiveTenant = { tenant, count };
      }
    }
    
    // Taux d'activation
    if (stats.maxRealLeadsActive > 0) {
      patterns.activationRate = Math.round((stats.stats.totalActivations / stats.maxRealLeadsActive) * 100);
    }
    
    return patterns;
  }
  
  // Générer des recommandations
  generatePhasesRecommendations(stats, patterns) {
    const recommendations = [];
    
    if (stats.currentPhase === 'phase1_minimal' && stats.stats.phase1Activations >= 1) {
      recommendations.push({
        type: 'info',
        message: 'Phase 1 completed successfully',
        action: 'Consider progressing to Phase 2 for scaling',
        priority: 'medium'
      });
    }
    
    if (stats.currentPhase === 'phase2_progressive' && stats.progression.canProgress) {
      recommendations.push({
        type: 'info',
        message: `Ready to progress to ${stats.progression.nextStep}`,
        action: 'Use progressToNextPhase2Step() to scale',
        priority: 'medium'
      });
    }
    
    if (stats.currentPhase === 'phase2_progressive' && !stats.progression.canProgress) {
      recommendations.push({
        type: 'success',
        message: 'Maximum scaling level reached',
        action: 'Monitor performance at full capacity',
        priority: 'low'
      });
    }
    
    if (recommendations.length === 0) {
      recommendations.push({
        type: 'info',
        message: 'Phase system operating normally',
        action: 'Continue monitoring and validate current phase',
        priority: 'low'
      });
    }
    
    return recommendations;
  }
  
  // Masquer téléphone pour logs
  maskPhone(phone) {
    if (!phone || typeof phone !== 'string') return 'unknown';
    return phone.slice(0, -4) + '****';
  }
  
  // Réinitialiser les statistiques
  resetStats() {
    this.stats = {
      totalActivations: 0,
      phase1Activations: 0,
      phase2Activations: 0,
      currentPhase: 'disabled',
      maxRealLeadsActive: 0,
      byTenant: new Map()
    };
    
    console.log('[REAL_PAYMENT_PHASES_STATS_RESET]');
  }
}

// Instance globale des phases
if (!global.realPaymentPhases) {
  global.realPaymentPhases = new RealPaymentPhases();
}

// Fonctions principales
async function activatePhase1() {
  return await global.realPaymentPhases.activatePhase1();
}

async function activatePhase2(targetLeads) {
  return await global.realPaymentPhases.activatePhase2(targetLeads);
}

async function progressToNextPhase2Step() {
  return await global.realPaymentPhases.progressToNextPhase2Step();
}

async function canActivateLeadForRealPayment(lead, context) {
  return await global.realPaymentPhases.canActivateLeadForRealPayment(lead, context);
}

async function activateLeadForRealPayment(lead, context) {
  return await global.realPaymentPhases.activateLeadForRealPayment(lead, context);
}

// Stats et monitoring
function getRealPaymentPhasesStats() {
  return global.realPaymentPhases.getPhasesStats();
}

function getRealPaymentPhasesReport() {
  return global.realPaymentPhases.getPhasesReport();
}

// Administration
function resetRealPaymentPhasesStats() {
  return global.realPaymentPhases.resetStats();
}

module.exports = {
  activatePhase1,
  activatePhase2,
  progressToNextPhase2Step,
  canActivateLeadForRealPayment,
  activateLeadForRealPayment,
  getRealPaymentPhasesStats,
  getRealPaymentPhasesReport,
  resetRealPaymentPhasesStats,
  RealPaymentPhases
};
