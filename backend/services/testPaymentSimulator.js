// ACTION 5 - Simulation paiement (SAFE)

const { getFlag } = require('./envFlags');
const { getLeadsByTenant } = require('./tenantIsolationSafe');
const BusinessLogger = require('./businessLogger');
const { logPaymentLinkSent, logStatusChange } = require('./testModeLogger');
const { addTraceStep, completeTrace } = require('./traceManager');

// Simulateur de paiement pour mode test (SAFE - ne touche pas Stripe réel)
class TestPaymentSimulator {
  constructor() {
    this.enabled = getFlag('AGENT_TEST_MODE');
    this.testPaymentLink = 'https://test-payment.agent-boutique.com/pay';
    this.simulatedPayments = new Map(); // paymentId -> payment data
    this.stats = {
      totalSimulations: 0,
      successfulSimulations: 0,
      errors: 0
    };
    
    console.log('[TEST_PAYMENT_SIMULATOR_INITIALIZED]', {
      enabled: this.enabled,
      testPaymentLink: this.testPaymentLink
    });
  }
  
  // Générer un lien de paiement de test
  generateTestPaymentLink(lead, amount = 100) {
    if (!this.enabled) {
      return null;
    }
    
    try {
      this.stats.totalSimulations++;
      
      const paymentId = `test_pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const paymentLink = `${this.testPaymentLink}?id=${paymentId}&amount=${amount}`;
      
      const paymentData = {
        paymentId,
        paymentLink,
        amount,
        currency: 'EUR',
        leadId: lead.id,
        tenantId: lead.tenant_id,
        phone: lead.phone,
        createdAt: new Date(),
        status: 'pending',
        testMode: true
      };
      
      // Stocker les données de paiement
      this.simulatedPayments.set(paymentId, paymentData);
      
      console.log('[TEST_PAYMENT_LINK_GENERATED]', {
        paymentId,
        leadId: lead.id,
        tenantId: lead.tenant_id,
        phone: this.maskPhone(lead.phone),
        amount
      });
      
      // Logger l'envoi du lien de paiement
      logPaymentLinkSent(lead.phone, lead.tenant_id, lead.id, paymentLink, amount);
      
      // Ajouter l'étape à la trace
      addTraceStep(this.getTraceId(lead.phone), 'payment_link_generated', {
        paymentId,
        amount,
        paymentLink: this.maskUrl(paymentLink)
      });
      
      BusinessLogger.logWithContext('info', 'test_payment_link_generated', lead.tenant_id, lead.id, {
        paymentId,
        amount,
        testMode: true
      });
      
      return {
        success: true,
        paymentLink,
        paymentId,
        amount,
        testMode: true
      };
      
    } catch (error) {
      this.stats.errors++;
      
      console.log('[TEST_PAYMENT_LINK_ERROR]', {
        leadId: lead.id,
        error: error.message
      });
      
      return {
        success: false,
        error: error.message,
        testMode: true
      };
    }
  }
  
  // Confirmer un paiement simulé
  confirmPayment(paymentId, confirmed = true) {
    if (!this.enabled) {
      return { success: false, reason: 'test_mode_disabled' };
    }
    
    try {
      const paymentData = this.simulatedPayments.get(paymentId);
      
      if (!paymentData) {
        return {
          success: false,
          error: 'Payment not found',
          paymentId
        };
      }
      
      // Mettre à jour le statut du paiement
      paymentData.status = confirmed ? 'confirmed' : 'cancelled';
      paymentData.confirmedAt = confirmed ? new Date() : null;
      
      // Trouver le lead et mettre à jour son statut
      const leads = getLeadsByTenant(paymentData.tenantId);
      const lead = leads.find(l => l.id === paymentData.leadId);
      
      if (lead) {
        const oldStatus = lead.status;
        const newStatus = confirmed ? 'WON' : 'PAYMENT_CANCELLED';
        
        // En mode test, nous ne pouvons pas directement modifier le lead
        // mais nous pouvons logger le changement souhaité
        logStatusChange(
          paymentData.phone,
          paymentData.tenantId,
          paymentData.leadId,
          oldStatus,
          newStatus,
          confirmed ? 'payment_confirmed' : 'payment_cancelled'
        );
        
        // Ajouter l'étape à la trace
        addTraceStep(this.getTraceId(paymentData.phone), confirmed ? 'payment_confirmed' : 'payment_cancelled', {
          paymentId,
          oldStatus,
          newStatus,
          confirmedAt: paymentData.confirmedAt
        });
        
        if (confirmed) {
          completeTrace(this.getTraceId(paymentData.phone), 'WON', true);
          this.stats.successfulSimulations++;
        }
        
        console.log('[TEST_PAYMENT_CONFIRMED]', {
          paymentId,
          leadId: paymentData.leadId,
          tenantId: paymentData.tenantId,
          phone: this.maskPhone(paymentData.phone),
          confirmed,
          newStatus
        });
        
        BusinessLogger.logWithContext('info', confirmed ? 'test_payment_confirmed' : 'test_payment_cancelled', 
          paymentData.tenantId, paymentData.leadId, {
          paymentId,
          amount: paymentData.amount,
          testMode: true
        });
        
        return {
          success: true,
          paymentData: {
            ...paymentData,
            phone: this.maskPhone(paymentData.phone)
          },
          leadUpdate: {
            leadId: paymentData.leadId,
            oldStatus,
            newStatus,
            note: 'In production, lead status would be updated in database'
          }
        };
      } else {
        return {
          success: false,
          error: 'Lead not found',
          paymentId
        };
      }
      
    } catch (error) {
      this.stats.errors++;
      
      console.log('[TEST_PAYMENT_CONFIRM_ERROR]', {
        paymentId,
        error: error.message
      });
      
      return {
        success: false,
        error: error.message,
        paymentId
      };
    }
  }
  
  // Obtenir un paiement simulé par ID
  getPayment(paymentId) {
    if (!this.enabled) {
      return { enabled: false };
    }
    
    const paymentData = this.simulatedPayments.get(paymentId);
    
    if (!paymentData) {
      return { error: 'Payment not found' };
    }
    
    return {
      ...paymentData,
      phone: this.maskPhone(paymentData.phone)
    };
  }
  
  // Obtenir tous les paiements simulés
  getAllPayments() {
    if (!this.enabled) {
      return { enabled: false };
    }
    
    const payments = Array.from(this.simulatedPayments.values())
      .map(payment => ({
        ...payment,
        phone: this.maskPhone(payment.phone)
      }));
    
    // Trier par date de création (plus récent d'abord)
    payments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    return {
      payments,
      count: payments.length
    };
  }
  
  // Obtenir les paiements par statut
  getPaymentsByStatus(status) {
    const allPayments = this.getAllPayments();
    
    if (!allPayments.enabled) {
      return allPayments;
    }
    
    const filteredPayments = allPayments.payments.filter(payment => 
      payment.status === status
    );
    
    return {
      payments: filteredPayments,
      count: filteredPayments.length,
      status
    };
  }
  
  // Obtenir les stats du simulateur
  getSimulatorStats() {
    if (!this.enabled) {
      return { enabled: false };
    }
    
    const successRate = this.stats.totalSimulations > 0 ? 
      (this.stats.successfulSimulations / this.stats.totalSimulations) * 100 : 0;
    
    return {
      enabled: this.enabled,
      stats: {
        totalSimulations: this.stats.totalSimulations,
        successfulSimulations: this.stats.successfulSimulations,
        errors: this.stats.errors,
        successRate: Math.round(successRate * 100) / 100
      },
      activePayments: Array.from(this.simulatedPayments.values())
        .filter(payment => payment.status === 'pending').length,
      testPaymentLink: this.testPaymentLink,
      uptime: process.uptime()
    };
  }
  
  // Nettoyer les anciens paiements
  cleanup(maxAge = 24 * 60 * 60 * 1000) { // 24 heures
    const cutoff = Date.now() - maxAge;
    let cleaned = 0;
    
    for (const [paymentId, paymentData] of this.simulatedPayments.entries()) {
      const createdTime = new Date(paymentData.createdAt).getTime();
      
      if (createdTime < cutoff) {
        this.simulatedPayments.delete(paymentId);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log('[TEST_PAYMENT_SIMULATOR_CLEANUP]', {
        cleaned,
        remaining: this.simulatedPayments.size
      });
    }
    
    return cleaned;
  }
  
  // Réinitialiser
  reset() {
    this.simulatedPayments.clear();
    this.stats = {
      totalSimulations: 0,
      successfulSimulations: 0,
      errors: 0
    };
    
    console.log('[TEST_PAYMENT_SIMULATOR_RESET]');
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
  
  // Masquer URL pour logs
  maskUrl(url) {
    if (!url || typeof url !== 'string') return 'unknown';
    return url.substring(0, 50) + '****';
  }
}

// Instance globale du simulateur
if (!global.testPaymentSimulator) {
  global.testPaymentSimulator = new TestPaymentSimulator();
}

// Fonctions principales
function generateTestPaymentLink(lead, amount) {
  return global.testPaymentSimulator.generateTestPaymentLink(lead, amount);
}

function confirmTestPayment(paymentId, confirmed) {
  return global.testPaymentSimulator.confirmPayment(paymentId, confirmed);
}

function getTestPayment(paymentId) {
  return global.testPaymentSimulator.getPayment(paymentId);
}

function getAllTestPayments() {
  return global.testPaymentSimulator.getAllPayments();
}

// Stats et monitoring
function getSimulatorStats() {
  return global.testPaymentSimulator.getSimulatorStats();
}

// Administration
function cleanupTestPayments(maxAge) {
  return global.testPaymentSimulator.cleanup(maxAge);
}

function resetTestPaymentSimulator() {
  return global.testPaymentSimulator.reset();
}

module.exports = {
  generateTestPaymentLink,
  confirmTestPayment,
  getTestPayment,
  getAllTestPayments,
  getSimulatorStats,
  cleanupTestPayments,
  resetTestPaymentSimulator,
  TestPaymentSimulator
};
