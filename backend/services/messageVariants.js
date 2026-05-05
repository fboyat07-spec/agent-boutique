// ACTION 4 - A/B Test messages (safe)

const BusinessLogger = require('./businessLogger');
const { trackEvent } = require('./eventTracker');

// Système de variantes de messages pour A/B testing (SAFE)
class MessageVariants {
  constructor() {
    this.enabled = process.env.AB_TEST_ENABLED === 'true';
    this.variants = new Map(); // test_id -> { A, B, ... }
    this.assignments = new Map(); // phone -> variant
    this.performance = new Map(); // variant -> stats
    this.stats = {
      totalAssignments: 0,
      totalMessages: 0,
      totalTests: 0,
      errors: 0
    };
    
    this.initializeDefaultVariants();
    
    console.log('[MESSAGE_VARIANTS_INITIALIZED]', {
      enabled: this.enabled,
      defaultVariants: this.variants.size
    });
  }
  
  // Initialiser variantes par défaut
  initializeDefaultVariants() {
    // Test A/B pour messages de bienvenue
    this.variants.set('welcome_message', {
      A: {
        id: 'welcome_A',
        content: 'Bonjour ! Je suis votre assistant virtuel. Comment puis-je vous aider aujourd\'hui ?',
        type: 'formal',
        length: 'medium'
      },
      B: {
        id: 'welcome_B',
        content: 'Salut ! Je suis là pour vous aider. En quoi puis-je vous être utile ?',
        type: 'casual',
        length: 'short'
      }
    });
    
    // Test A/B pour messages de vente
    this.variants.set('sales_message', {
      A: {
        id: 'sales_A',
        content: 'Je vous propose nos services premium qui peuvent transformer votre activité. Souhaitez-vous en savoir plus ?',
        type: 'direct',
        length: 'medium'
      },
      B: {
        id: 'sales_B',
        content: 'Découvrez comment nos solutions peuvent vous faire gagner du temps et augmenter vos revenus. Intéressé(e) ?',
        type: 'benefit_focused',
        length: 'medium'
      }
    });
    
    // Test A/B pour messages de suivi
    this.variants.set('followup_message', {
      A: {
        id: 'followup_A',
        content: 'Juste un suivi pour savoir si vous avez eu le temps de réfléchir à notre proposition ?',
        type: 'gentle',
        length: 'short'
      },
      B: {
        id: 'followup_B',
        content: 'Je reviens vers vous concernant notre discussion. Y a-t-il des questions que je puisse éclaircir ?',
        type: 'professional',
        length: 'medium'
      }
    });
    
    // Initialiser les stats de performance
    for (const [testId, variants] of this.variants.entries()) {
      this.performance.set(testId, new Map());
      
      for (const [variantKey, variant] of Object.entries(variants)) {
        this.performance.get(testId).set(variantKey, {
          sent: 0,
          replies: 0,
          conversions: 0,
          replyRate: 0,
          conversionRate: 0
        });
      }
    }
  }
  
  // Obtenir la variante assignée pour un phone
  getVariant(phone, testId) {
    if (!this.enabled) {
      return null;
    }
    
    // Vérifier si le test existe
    if (!this.variants.has(testId)) {
      console.log('[MESSAGE_VARIANTS_TEST_NOT_FOUND]', { testId });
      return null;
    }
    
    // Vérifier si déjà assigné
    if (this.assignments.has(`${phone}_${testId}`)) {
      const assignedVariant = this.assignments.get(`${phone}_${testId}`);
      
      console.log('[MESSAGE_VARIANTS_EXISTING_ASSIGNMENT]', {
        phone: this.maskPhone(phone),
        testId,
        variant: assignedVariant
      });
      
      return assignedVariant;
    }
    
    // Assigner nouvelle variante (hash déterministe)
    const variantKey = this.assignVariant(phone, testId);
    
    console.log('[MESSAGE_VARIANTS_NEW_ASSIGNMENT]', {
      phone: this.maskPhone(phone),
      testId,
      variant: variantKey
    });
    
    return variantKey;
  }
  
  // Assigner une variante de manière déterministe
  assignVariant(phone, testId) {
    const testVariants = this.variants.get(testId);
    const variantKeys = Object.keys(testVariants);
    
    // Hash déterministe basé sur le téléphone
    const hash = this.simpleHash(phone);
    const variantIndex = hash % variantKeys.length;
    const variantKey = variantKeys[variantIndex];
    
    // Stocker l'assignation
    this.assignments.set(`${phone}_${testId}`, variantKey);
    
    // Stats
    this.stats.totalAssignments++;
    
    return variantKey;
  }
  
  // Obtenir le contenu de la variante
  getVariantContent(phone, testId, fallbackContent = null) {
    const variantKey = this.getVariant(phone, testId);
    
    if (!variantKey) {
      return fallbackContent;
    }
    
    const testVariants = this.variants.get(testId);
    const variant = testVariants[variantKey];
    
    if (!variant) {
      console.log('[MESSAGE_VARIANTS_VARIANT_NOT_FOUND]', {
        testId,
        variantKey
      });
      return fallbackContent;
    }
    
    // Tracker l'envoi
    this.trackMessageSent(testId, variantKey);
    
    return variant.content;
  }
  
  // Wrapper pour enrichir un message existant
  enrichMessage(phone, testId, originalContent) {
    if (!this.enabled) {
      return originalContent;
    }
    
    const variantContent = this.getVariantContent(phone, testId);
    
    if (variantContent) {
      console.log('[MESSAGE_VARIANTS_ENRICHED]', {
        phone: this.maskPhone(phone),
        testId,
        originalLength: originalContent.length,
        variantLength: variantContent.length
      });
      
      // Tracker l'événement
      trackEvent('ab_test_variant_used', {
        phone: this.maskPhone(phone),
        testId,
        variant: this.getVariant(phone, testId)
      });
      
      return variantContent;
    }
    
    return originalContent;
  }
  
  // Tracker une réponse reçue
  trackReply(phone, testId) {
    if (!this.enabled) {
      return;
    }
    
    const variantKey = this.getVariant(phone, testId);
    
    if (!variantKey) {
      return;
    }
    
    const testPerformance = this.performance.get(testId);
    const variantStats = testPerformance.get(variantKey);
    
    if (variantStats) {
      variantStats.replies++;
      
      // Recalculer les taux
      if (variantStats.sent > 0) {
        variantStats.replyRate = (variantStats.replies / variantStats.sent) * 100;
      }
      
      console.log('[MESSAGE_VARIANTS_REPLY_TRACKED]', {
        phone: this.maskPhone(phone),
        testId,
        variant: variantKey,
        replyRate: variantStats.replyRate
      });
      
      // Tracker l'événement
      trackEvent('ab_test_reply_received', {
        phone: this.maskPhone(phone),
        testId,
        variant: variantKey
      });
    }
  }
  
  // Tracker une conversion
  trackConversion(phone, testId) {
    if (!this.enabled) {
      return;
    }
    
    const variantKey = this.getVariant(phone, testId);
    
    if (!variantKey) {
      return;
    }
    
    const testPerformance = this.performance.get(testId);
    const variantStats = testPerformance.get(variantKey);
    
    if (variantStats) {
      variantStats.conversions++;
      
      // Recalculer les taux
      if (variantStats.sent > 0) {
        variantStats.conversionRate = (variantStats.conversions / variantStats.sent) * 100;
      }
      
      console.log('[MESSAGE_VARIANTS_CONVERSION_TRACKED]', {
        phone: this.maskPhone(phone),
        testId,
        variant: variantKey,
        conversionRate: variantStats.conversionRate
      });
      
      // Tracker l'événement
      trackEvent('ab_test_conversion', {
        phone: this.maskPhone(phone),
        testId,
        variant: variantKey
      });
    }
  }
  
  // Tracker un message envoyé
  trackMessageSent(testId, variantKey) {
    const testPerformance = this.performance.get(testId);
    const variantStats = testPerformance.get(variantKey);
    
    if (variantStats) {
      variantStats.sent++;
      this.stats.totalMessages++;
    }
  }
  
  // Obtenir les résultats d'un test
  getTestResults(testId) {
    if (!this.variants.has(testId)) {
      return { error: 'Test not found' };
    }
    
    const testPerformance = this.performance.get(testId);
    const results = {};
    
    for (const [variantKey, stats] of testPerformance.entries()) {
      results[variantKey] = {
        ...stats,
        replyRate: Math.round(stats.replyRate * 100) / 100,
        conversionRate: Math.round(stats.conversionRate * 100) / 100
      };
    }
    
    // Déterminer le gagnant
    const winner = this.determineWinner(results);
    
    return {
      testId,
      results,
      winner,
      totalAssignments: this.getAssignmentCount(testId),
      metadata: {
        generatedAt: new Date()
      }
    };
  }
  
  // Déterminer le gagnant d'un test A/B
  determineWinner(results) {
    const variants = Object.keys(results);
    
    if (variants.length < 2) {
      return null;
    }
    
    let winner = null;
    let bestScore = -1;
    
    for (const variantKey of variants) {
      const stats = results[variantKey];
      
      // Score combiné (replyRate + conversionRate)
      const score = stats.replyRate + (stats.conversionRate * 2); // Pondérer conversion plus fort
      
      if (score > bestScore && stats.sent >= 10) { // Minimum 10 envois
        bestScore = score;
        winner = variantKey;
      }
    }
    
    return winner;
  }
  
  // Obtenir le nombre d'assignations pour un test
  getAssignmentCount(testId) {
    let count = 0;
    
    for (const [key, value] of this.assignments.entries()) {
      if (key.endsWith(`_${testId}`)) {
        count++;
      }
    }
    
    return count;
  }
  
  // Créer un nouveau test A/B
  createTest(testId, variantA, variantB) {
    if (this.variants.has(testId)) {
      return { success: false, error: 'Test already exists' };
    }
    
    const newVariants = {
      A: {
        id: `${testId}_A`,
        content: variantA,
        type: 'custom',
        length: variantA.length
      },
      B: {
        id: `${testId}_B`,
        content: variantB,
        type: 'custom',
        length: variantB.length
      }
    };
    
    this.variants.set(testId, newVariants);
    
    // Initialiser les stats
    this.performance.set(testId, new Map());
    
    for (const [variantKey, variant] of Object.entries(newVariants)) {
      this.performance.get(testId).set(variantKey, {
        sent: 0,
        replies: 0,
        conversions: 0,
        replyRate: 0,
        conversionRate: 0
      });
    }
    
    this.stats.totalTests++;
    
    console.log('[MESSAGE_VARIANTS_TEST_CREATED]', {
      testId,
      variantA_length: variantA.length,
      variantB_length: variantB.length
    });
    
    return {
      success: true,
      testId,
      variants: newVariants
    };
  }
  
  // Obtenir tous les tests
  getAllTests() {
    const tests = [];
    
    for (const [testId, variants] of this.variants.entries()) {
      const results = this.getTestResults(testId);
      
      tests.push({
        testId,
        variants: Object.keys(variants),
        results: results.results,
        winner: results.winner,
        assignments: results.totalAssignments
      });
    }
    
    return tests;
  }
  
  // Réinitialiser un test
  resetTest(testId) {
    if (!this.variants.has(testId)) {
      return { success: false, error: 'Test not found' };
    }
    
    // Réinitialiser les stats
    const testPerformance = this.performance.get(testId);
    
    for (const [variantKey, stats] of testPerformance.entries()) {
      testPerformance.set(variantKey, {
        sent: 0,
        replies: 0,
        conversions: 0,
        replyRate: 0,
        conversionRate: 0
      });
    }
    
    // Supprimer les assignations pour ce test
    const keysToDelete = [];
    
    for (const [key, value] of this.assignments.entries()) {
      if (key.endsWith(`_${testId}`)) {
        keysToDelete.push(key);
      }
    }
    
    for (const key of keysToDelete) {
      this.assignments.delete(key);
    }
    
    console.log('[MESSAGE_VARIANTS_TEST_RESET]', { testId });
    
    return { success: true, testId };
  }
  
  // Obtenir stats globales
  getVariantStats() {
    const allTests = this.getAllTests();
    
    return {
      enabled: this.enabled,
      stats: {
        totalTests: this.stats.totalTests,
        totalAssignments: this.stats.totalAssignments,
        totalMessages: this.stats.totalMessages,
        errors: this.stats.errors
      },
      tests: {
        active: allTests.length,
        withWinner: allTests.filter(t => t.winner).length,
        totalAssignments: allTests.reduce((sum, t) => sum + t.assignments, 0)
      },
      performance: {
        avgReplyRate: this.calculateAverageReplyRate(),
        avgConversionRate: this.calculateAverageConversionRate()
      },
      uptime: process.uptime()
    };
  }
  
  // Calculer le taux de réponse moyen
  calculateAverageReplyRate() {
    let totalSent = 0;
    let totalReplies = 0;
    
    for (const testPerformance of this.performance.values()) {
      for (const stats of testPerformance.values()) {
        totalSent += stats.sent;
        totalReplies += stats.replies;
      }
    }
    
    return totalSent > 0 ? (totalReplies / totalSent) * 100 : 0;
  }
  
  // Calculer le taux de conversion moyen
  calculateAverageConversionRate() {
    let totalSent = 0;
    let totalConversions = 0;
    
    for (const testPerformance of this.performance.values()) {
      for (const stats of testPerformance.values()) {
        totalSent += stats.sent;
        totalConversions += stats.conversions;
      }
    }
    
    return totalSent > 0 ? (totalConversions / totalSent) * 100 : 0;
  }
  
  // Hash simple pour assignation déterministe
  simpleHash(str) {
    let hash = 0;
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convertir en 32-bit integer
    }
    
    return Math.abs(hash);
  }
  
  // Masquer téléphone pour logs
  maskPhone(phone) {
    if (!phone || typeof phone !== 'string') return 'unknown';
    return phone.slice(0, -4) + '****';
  }
  
  // Health check
  healthCheck() {
    const stats = this.getVariantStats();
    
    const health = {
      status: 'healthy',
      enabled: stats.enabled,
      issues: [],
      recommendations: []
    };
    
    // Vérifier taux d'erreur
    const errorRate = this.stats.totalAssignments > 0 ? 
      (this.stats.errors / this.stats.totalAssignments) * 100 : 0;
    
    if (errorRate > 10) {
      health.issues.push('High error rate');
      health.recommendations.push('Check test configuration and data');
    }
    
    // Vérifier tests sans gagnant
    const testsWithoutWinner = stats.tests.active - stats.tests.withWinner;
    
    if (testsWithoutWinner > 0 && stats.stats.totalMessages > 100) {
      health.issues.push('Tests without clear winner');
      health.recommendations.push('Consider running tests longer or improving variants');
    }
    
    if (health.issues.length > 0) {
      health.status = 'warning';
    }
    
    return {
      ...health,
      stats: {
        activeTests: stats.tests.active,
        totalAssignments: stats.stats.totalAssignments,
        errorRate: Math.round(errorRate * 100) / 100,
        avgReplyRate: Math.round(stats.performance.avgReplyRate * 100) / 100
      }
    };
  }
  
  // Réinitialiser stats
  resetStats() {
    this.stats = {
      totalAssignments: 0,
      totalMessages: 0,
      totalTests: this.variants.size,
      errors: 0
    };
    
    console.log('[MESSAGE_VARIANTS_STATS_RESET]');
  }
}

// Instance globale du système de variantes
if (!global.messageVariants) {
  global.messageVariants = new MessageVariants();
}

// Fonctions principales
function getVariantContent(phone, testId, fallbackContent) {
  return global.messageVariants.getVariantContent(phone, testId, fallbackContent);
}

function enrichMessage(phone, testId, originalContent) {
  return global.messageVariants.enrichMessage(phone, testId, originalContent);
}

function trackReply(phone, testId) {
  return global.messageVariants.trackReply(phone, testId);
}

function trackConversion(phone, testId) {
  return global.messageVariants.trackConversion(phone, testId);
}

// Tests et résultats
function getTestResults(testId) {
  return global.messageVariants.getTestResults(testId);
}

function createTest(testId, variantA, variantB) {
  return global.messageVariants.createTest(testId, variantA, variantB);
}

function getAllTests() {
  return global.messageVariants.getAllTests();
}

// Stats et monitoring
function getVariantStats() {
  return global.messageVariants.getVariantStats();
}

function variantsHealthCheck() {
  return global.messageVariants.healthCheck();
}

// Administration
function resetTest(testId) {
  return global.messageVariants.resetTest(testId);
}

function resetVariantStats() {
  return global.messageVariants.resetStats();
}

module.exports = {
  getVariantContent,
  enrichMessage,
  trackReply,
  trackConversion,
  getTestResults,
  createTest,
  getAllTests,
  getVariantStats,
  variantsHealthCheck,
  resetTest,
  resetVariantStats,
  MessageVariants
};
