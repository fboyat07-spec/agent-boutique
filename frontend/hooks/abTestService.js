// Service A/B Testing pour les expérimentations utilisateur
class ABTestService {
  constructor() {
    this.isInitialized = false;
    this.userVariants = new Map(); // Cache local des variantes utilisateur
    this.experiments = new Map(); // Cache des expériences actives
    this.assignmentHistory = new Map(); // Historique des assignments
  }

  // Initialiser le service
  async initialize(userId) {
    try {
      this.userId = userId;
      this.isInitialized = true;
      
      // Charger les variantes existantes depuis Firestore
      await this.loadUserVariants(userId);
      
      console.log('🧪 A/B Testing service initialisé pour utilisateur:', userId);
      return { success: true };
    } catch (error) {
      console.error('❌ Erreur initialisation A/B Testing:', error);
      return { success: false, error: error.message };
    }
  }

  // Charger les variantes utilisateur depuis Firestore
  async loadUserVariants(userId) {
    if (!userId) return;

    try {
      const { doc, getDoc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('../config/firebaseClean');
      
      const userDocRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const variants = userData.abTestVariants || {};
        
        // Mettre en cache local
        this.userVariants = new Map(Object.entries(variants));
        
        console.log('🧪 Variantes utilisateur chargées:', variants);
        return variants;
      }
      
      return {};
    } catch (error) {
      console.error('❌ Erreur chargement variantes utilisateur:', error);
      return {};
    }
  }

  // Sauvegarder les variantes utilisateur dans Firestore
  async saveUserVariants(userId, variants) {
    if (!userId) return;

    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('../config/firebaseClean');
      
      const userDocRef = doc(db, 'users', userId);
      
      await updateDoc(userDocRef, {
        abTestVariants: variants,
        abTestUpdatedAt: new Date()
      });

      // Mettre à jour le cache local
      this.userVariants = new Map(Object.entries(variants));
      
      console.log('🧪 Variantes utilisateur sauvegardées:', variants);
      return { success: true };
    } catch (error) {
      console.error('❌ Erreur sauvegarde variantes utilisateur:', error);
      return { success: false, error: error.message };
    }
  }

  // Définir une expérience A/B
  defineExperiment(featureName, variants, config = {}) {
    const experiment = {
      name: featureName,
      variants: variants,
      config: {
        trafficSplit: config.trafficSplit || 'equal', // 'equal', 'weighted', 'percentage'
        weights: config.weights || null,
        startDate: config.startDate || null,
        endDate: config.endDate || null,
        targetUsers: config.targetUsers || null, // { level: { min: 5, max: 10 } }
        excludeUsers: config.excludeUsers || null, // { subscription: 'free' }
        ...config
      },
      createdAt: new Date(),
      isActive: true
    };

    this.experiments.set(featureName, experiment);
    console.log('🧪 Expérience définie:', experiment);
    
    return experiment;
  }

  // Assigner une variante à un utilisateur
  async assignVariant(featureName, forceVariant = null) {
    if (!this.isInitialized) {
      console.warn('⚠️ A/B Testing service non initialisé');
      return null;
    }

    try {
      // Vérifier si l'utilisateur a déjà une variante assignée
      if (this.userVariants.has(featureName)) {
        const existingVariant = this.userVariants.get(featureName);
        console.log(`🧪 Variante existante pour ${featureName}:`, existingVariant);
        return existingVariant;
      }

      const experiment = this.experiments.get(featureName);
      
      if (!experiment) {
        console.warn(`⚠️ Expérience ${featureName} non définie`);
        return null;
      }

      // Forcer une variante spécifique (pour les tests)
      if (forceVariant && experiment.variants.includes(forceVariant)) {
        const variant = forceVariant;
        await this.saveVariantAssignment(featureName, variant, 'forced');
        return variant;
      }

      // Vérifier si l'utilisateur est éligible
      if (!this.isUserEligible(experiment)) {
        console.log(`🧪 Utilisateur non éligible pour ${featureName}`);
        return null;
      }

      // Assigner une variante selon la configuration
      const assignedVariant = this.selectVariant(experiment);
      
      // Sauvegarder l'assignment
      await this.saveVariantAssignment(featureName, assignedVariant, 'random');
      
      console.log(`🧪 Variante assignée pour ${featureName}:`, assignedVariant);
      return assignedVariant;
      
    } catch (error) {
      console.error('❌ Erreur assignment variante:', error);
      return null;
    }
  }

  // Sélectionner une variante selon la configuration
  selectVariant(experiment) {
    const { variants, config } = experiment;
    
    switch (config.trafficSplit) {
      case 'equal':
        return this.selectEqualVariant(variants);
      
      case 'weighted':
        return this.selectWeightedVariant(variants, config.weights);
      
      case 'percentage':
        return this.selectPercentageVariant(variants, config.weights);
      
      default:
        return this.selectEqualVariant(variants);
    }
  }

  // Sélection égale (aléatoire)
  selectEqualVariant(variants) {
    const randomIndex = Math.floor(Math.random() * variants.length);
    return variants[randomIndex];
  }

  // Sélection pondérée
  selectWeightedVariant(variants, weights) {
    if (!weights || weights.length !== variants.length) {
      return this.selectEqualVariant(variants);
    }

    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let random = Math.random() * totalWeight;
    
    for (let i = 0; i < variants.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return variants[i];
      }
    }
    
    return variants[variants.length - 1];
  }

  // Sélection par pourcentage
  selectPercentageVariant(variants, percentages) {
    if (!percentages || percentages.length !== variants.length) {
      return this.selectEqualVariant(variants);
    }

    const random = Math.random() * 100;
    let cumulative = 0;
    
    for (let i = 0; i < variants.length; i++) {
      cumulative += percentages[i];
      if (random <= cumulative) {
        return variants[i];
      }
    }
    
    return variants[variants.length - 1];
  }

  // Vérifier l'éligibilité utilisateur
  isUserEligible(experiment) {
    const { config } = experiment;
    
    // Vérifier les dates
    if (config.startDate && new Date() < new Date(config.startDate)) {
      return false;
    }
    
    if (config.endDate && new Date() > new Date(config.endDate)) {
      return false;
    }
    
    // Vérifier les critères utilisateurs (à implémenter selon vos données)
    if (config.targetUsers) {
      // Exemple: vérifier le niveau
      if (config.targetUsers.level) {
        const userLevel = this.getUserLevel(); // À implémenter
        if (config.targetUsers.level.min && userLevel < config.targetUsers.level.min) {
          return false;
        }
        if (config.targetUsers.level.max && userLevel > config.targetUsers.level.max) {
          return false;
        }
      }
    }
    
    // Vérifier les exclusions
    if (config.excludeUsers) {
      // Exemple: exclure les utilisateurs gratuits
      if (config.excludeUsers.subscription === 'free') {
        const userSubscription = this.getUserSubscription(); // À implémenter
        if (userSubscription === 'free') {
          return false;
        }
      }
    }
    
    return true;
  }

  // Sauvegarder l'assignment de variante
  async saveVariantAssignment(featureName, variant, assignmentType) {
    try {
      // Mettre à jour le cache local
      this.userVariants.set(featureName, variant);
      
      // Ajouter à l'historique
      const history = this.assignmentHistory.get(featureName) || [];
      history.push({
        variant,
        assignmentType,
        timestamp: new Date(),
        userId: this.userId
      });
      this.assignmentHistory.set(featureName, history);
      
      // Sauvegarder dans Firestore
      await this.saveUserVariants(this.userId, Object.fromEntries(this.userVariants));
      
      // Envoyer l'événement d'assignment
      this.trackAssignment(featureName, variant, assignmentType);
      
    } catch (error) {
      console.error('❌ Erreur sauvegarde assignment:', error);
    }
  }

  // Tracker l'assignment (à connecter avec votre service analytics)
  trackAssignment(featureName, variant, assignmentType) {
    try {
      // Envoyer à votre service analytics
      if (typeof window !== 'undefined' && window.analytics) {
        window.analytics.track('ab_test_assignment', {
          feature_name: featureName,
          variant,
          assignment_type: assignmentType,
          user_id: this.userId,
          timestamp: new Date().toISOString()
        });
      }
      
      console.log('🧪 Assignment tracké:', { featureName, variant, assignmentType });
    } catch (error) {
      console.error('❌ Erreur tracking assignment:', error);
    }
  }

  // Obtenir la variante actuelle pour une fonctionnalité
  getFeatureVariant(featureName) {
    if (!this.isInitialized) {
      console.warn('⚠️ A/B Testing service non initialisé');
      return null;
    }

    const variant = this.userVariants.get(featureName);
    
    if (!variant) {
      console.warn(`⚠️ Aucune variante assignée pour ${featureName}`);
      return null;
    }

    console.log(`🧪 Variante obtenue pour ${featureName}:`, variant);
    return variant;
  }

  // Obtenir toutes les variantes utilisateur
  getAllUserVariants() {
    return Object.fromEntries(this.userVariants);
  }

  // Obtenir l'historique d'assignments
  getAssignmentHistory(featureName) {
    return this.assignmentHistory.get(featureName) || [];
  }

  // Obtenir les statistiques d'une expérience
  getExperimentStats(featureName) {
    const experiment = this.experiments.get(featureName);
    const history = this.assignmentHistory.get(featureName) || [];
    
    if (!experiment) {
      return null;
    }

    // Calculer la distribution des variantes
    const variantStats = {};
    history.forEach(assignment => {
      variantStats[assignment.variant] = (variantStats[assignment.variant] || 0) + 1;
    });

    return {
      experiment: experiment,
      totalAssignments: history.length,
      variantDistribution: variantStats,
      assignments: history
    };
  }

  // Réinitialiser une expérience
  async resetExperiment(featureName) {
    try {
      // Supprimer la variante utilisateur
      this.userVariants.delete(featureName);
      
      // Mettre à jour Firestore
      await this.saveUserVariants(this.userId, Object.fromEntries(this.userVariants));
      
      console.log(`🧪 Expérience ${featureName} réinitialisée`);
      return { success: true };
    } catch (error) {
      console.error('❌ Erreur réinitialisation expérience:', error);
      return { success: false, error: error.message };
    }
  }

  // Obtenir la variante pour une fonctionnalité avec fallback
  getVariantWithFallback(featureName, fallbackVariant = 'control') {
    const variant = this.getFeatureVariant(featureName);
    return variant || fallbackVariant;
  }

  // Vérifier si un utilisateur est dans un groupe de contrôle
  isControlGroup(featureName) {
    const variant = this.getFeatureVariant(featureName);
    return variant === 'control' || variant === 'A';
  }

  // Vérifier si un utilisateur est dans un groupe de test
  isTestGroup(featureName) {
    const variant = this.getFeatureVariant(featureName);
    return variant && variant !== 'control' && variant !== 'A';
  }

  // Obtenir le statut du service
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      userId: this.userId,
      totalExperiments: this.experiments.size,
      activeExperiments: Array.from(this.experiments.entries()).filter(([_, exp]) => exp.isActive),
      userVariants: Object.fromEntries(this.userVariants),
      totalAssignments: Array.from(this.assignmentHistory.values()).reduce((sum, history) => sum + history.length, 0)
    };
  }

  // Nettoyer les ressources
  cleanup() {
    this.userVariants.clear();
    this.experiments.clear();
    this.assignmentHistory.clear();
    this.isInitialized = false;
    console.log('🧪 A/B Testing service nettoyé');
  }
}

// Instance singleton du service
const abTestService = new ABTestService();

export default abTestService;
