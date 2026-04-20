const StudentService = require('./StudentService');
const { v4: uuidv4 } = require('uuid');

/**
 * Real Reward System with Parent Controls
 * Manages virtual-to-real rewards conversion and parental approval
 */
class RewardService {
  constructor() {
    this.rewardCategories = {
      'activities': {
        name: 'Activités',
        icon: 'sports',
        description: 'Sorties et activités spéciales'
      },
      'privileges': {
        name: 'Privilèges',
        icon: 'star',
        description: 'Droits et temps supplémentaires'
      },
      'items': {
        name: 'Objets',
        icon: 'gift',
        description: 'Cadeaux et jouets'
      },
      'experiences': {
        name: 'Expériences',
        icon: 'camera',
        description: 'Expériences uniques et mémorables'
      },
      'digital': {
        name: 'Numérique',
        icon: 'phone',
        description: 'Contenus et applications'
      }
    };

    this.rewardTemplates = this.initializeRewardTemplates();
    this.parentalControls = this.initializeParentalControls();
  }

  initializeRewardTemplates() {
    return {
      // Activities
      'cinema_trip': {
        id: 'cinema_trip',
        name: 'Sortie au cinéma',
        category: 'activities',
        description: 'Une sortie au cinéma pour voir le film de ton choix',
        coin_cost: 500,
        time_required: '2-3 heures',
        age_min: 6,
        difficulty: 'medium',
        parent_notes: 'Accompagnement requis'
      },
      'park_visit': {
        id: 'park_visit',
        name: 'Journée au parc',
        category: 'activities',
        description: 'Une journée complète au parc d\'attractions',
        coin_cost: 800,
        time_required: 'journée',
        age_min: 8,
        difficulty: 'hard',
        parent_notes: 'Planification nécessaire'
      },
      'swimming_pool': {
        id: 'swimming_pool',
        name: 'Séance de piscine',
        category: 'activities',
        description: 'Une heure à la piscine municipale',
        coin_cost: 200,
        time_required: '1-2 heures',
        age_min: 6,
        difficulty: 'easy',
        parent_notes: 'Matériel de piscine requis'
      },
      'ice_cream': {
        id: 'ice_cream',
        name: 'Glace artisanale',
        category: 'activities',
        description: 'Une glace à l\'artisanat local',
        coin_cost: 100,
        time_required: '30 minutes',
        age_min: 4,
        difficulty: 'easy',
        parent_notes: 'Allergie possible'
      },

      // Privileges
      'extra_screen_time': {
        id: 'extra_screen_time',
        name: 'Temps d\'écran bonus',
        category: 'privileges',
        description: '30 minutes de temps d\'écran supplémentaire',
        coin_cost: 150,
        time_required: '30 minutes',
        age_min: 6,
        difficulty: 'easy',
        parent_notes: 'Limites quotidiennes à respecter'
      },
      'bedtime_extension': {
        id: 'bedtime_extension',
        name: 'Coucher tard',
        category: 'privileges',
        description: '30 minutes de coucher tard',
        coin_cost: 200,
        time_required: '30 minutes',
        age_min: 8,
        difficulty: 'medium',
        parent_notes: 'Valable uniquement le week-end'
      },
      'choose_dinner': {
        id: 'choose_dinner',
        name: 'Choisir le dîner',
        category: 'privileges',
        description: 'Choisir le menu du dîner pour toute la famille',
        coin_cost: 300,
        time_required: 'soirée',
        age_min: 7,
        difficulty: 'medium',
        parent_notes: 'Budget familial à respecter'
      },
      'no_chores_day': {
        id: 'no_chores_day',
        name: 'Journée sans corvées',
        category: 'privileges',
        description: 'Une journée sans faire les tâches ménagères',
        coin_cost: 400,
        time_required: 'journée',
        age_min: 10,
        difficulty: 'hard',
        parent_notes: 'À planifier à l\'avance'
      },

      // Items
      'book_choice': {
        id: 'book_choice',
        name: 'Livre au choix',
        category: 'items',
        description: 'Un livre de ton choix dans une librairie',
        coin_cost: 350,
        time_required: 'variable',
        age_min: 6,
        difficulty: 'medium',
        parent_notes: 'Livre adapté à l\'âge requis'
      },
      'small_toy': {
        id: 'small_toy',
        name: 'Jouet petit budget',
        category: 'items',
        description: 'Un jouet de moins de 15 euros',
        coin_cost: 250,
        time_required: 'achat',
        age_min: 5,
        difficulty: 'easy',
        parent_notes: 'Magasin à définir'
      },
      'art_supplies': {
        id: 'art_supplies',
        name: 'Kit d\'art',
        category: 'items',
        description: 'Un kit de matériel de dessin ou peinture',
        coin_cost: 300,
        time_required: 'variable',
        age_min: 6,
        difficulty: 'medium',
        parent_notes: 'Surveillance recommandée'
      },

      // Experiences
      'cooking_lesson': {
        id: 'cooking_lesson',
        name: 'Cours de cuisine',
        category: 'experiences',
        description: 'Apprendre à préparer ton plat préféré avec un parent',
        coin_cost: 400,
        time_required: '2-3 heures',
        age_min: 8,
        difficulty: 'medium',
        parent_notes: 'Ingrédients et matériel requis'
      },
      'science_experiment': {
        id: 'science_experiment',
        name: 'Expérience scientifique',
        category: 'experiences',
        description: 'Réaliser une expérience scientifique à la maison',
        coin_cost: 350,
        time_required: '1-2 heures',
        age_min: 7,
        difficulty: 'medium',
        parent_notes: 'Matériel scientifique requis'
      },
      'photo_session': {
        id: 'photo_session',
        name: 'Séance photo',
        category: 'experiences',
        description: 'Une séance photo pour être le photographe de la famille',
        coin_cost: 200,
        time_required: '1 heure',
        age_min: 6,
        difficulty: 'easy',
        parent_notes: 'Appareil photo simple requis'
      },

      // Digital
      'game_download': {
        id: 'game_download',
        name: 'Jeu éducatif',
        category: 'digital',
        description: 'Télécharger un jeu éducatif approuvé',
        coin_cost: 300,
        time_required: 'variable',
        age_min: 6,
        difficulty: 'easy',
        parent_notes: 'Approbation parentale requise'
      },
      'music_album': {
        id: 'music_album',
        name: 'Album de musique',
        category: 'digital',
        description: 'Un album de musique pour enfants',
        coin_cost: 200,
        time_required: 'variable',
        age_min: 4,
        difficulty: 'easy',
        parent_notes: 'Contenu adapté à l\'âge'
      }
    };
  }

  initializeParentalControls() {
    return {
      approval_required: true,
      daily_spending_limit: 500,
      weekly_spending_limit: 1500,
      monthly_spending_limit: 3000,
      time_restrictions: {
        allowed_hours: ['8:00-20:00'],
        blocked_days: [],
        max_daily_time: 2 // hours
      },
      category_limits: {
        'activities': { max_per_week: 2, max_cost: 1000 },
        'privileges': { max_per_week: 3, max_cost: 600 },
        'items': { max_per_month: 2, max_cost: 800 },
        'experiences': { max_per_month: 1, max_cost: 500 },
        'digital': { max_per_month: 3, max_cost: 900 }
      },
      age_restrictions: true,
      custom_rewards: true,
      approval_methods: ['manual', 'automatic_under_200']
    };
  }

  async createCustomReward(tenantId, parentUserId, rewardData) {
    try {
      const customReward = {
        reward_id: uuidv4(),
        tenant_id: tenantId,
        parent_id: parentUserId,
        name: rewardData.name,
        description: rewardData.description,
        category: rewardData.category || 'activities',
        coin_cost: rewardData.coin_cost,
        time_required: rewardData.time_required || 'variable',
        age_min: rewardData.age_min || 6,
        difficulty: rewardData.difficulty || 'medium',
        parent_notes: rewardData.parent_notes || '',
        is_custom: true,
        is_active: true,
        usage_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // This would save to database
      return customReward;
    } catch (error) {
      throw new Error(`Erreur création récompense personnalisée: ${error.message}`);
    }
  }

  async getAvailableRewards(studentId, tenantId) {
    try {
      const student = await StudentService.getStudent(studentId);
      
      // Get template rewards
      const templateRewards = Object.values(this.rewardTemplates)
        .filter(reward => reward.age_min <= student.age)
        .map(reward => ({
          ...reward,
          is_available: student.coins >= reward.coin_cost,
          student_can_afford: student.coins >= reward.coin_cost,
          affordability_gap: Math.max(0, reward.coin_cost - student.coins)
        }));

      // Get custom rewards for this tenant
      const customRewards = await this.getCustomRewards(tenantId, student.age);

      // Combine and sort by affordability
      const allRewards = [...templateRewards, ...customRewards]
        .sort((a, b) => {
          // Sort by affordability first, then by cost
          if (a.student_can_afford && !b.student_can_afford) return -1;
          if (!a.student_can_afford && b.student_can_afford) return 1;
          return a.coin_cost - b.coin_cost;
        });

      return {
        student_coins: student.coins,
        rewards: allRewards,
        categories: this.rewardCategories,
        recommendations: this.getRecommendations(student, allRewards)
      };
    } catch (error) {
      throw new Error(`Erreur récompenses disponibles: ${error.message}`);
    }
  }

  async requestReward(studentId, rewardId, customData = {}) {
    try {
      const student = await StudentService.getStudent(studentId);
      const reward = await this.getReward(rewardId);
      
      if (!reward) {
        throw new Error('Récompense non trouvée');
      }

      if (student.coins < reward.coin_cost) {
        throw new Error('Pièces insuffisantes');
      }

      if (reward.age_min > student.age) {
        throw new Error('Récompense non adaptée à l\'âge');
      }

      // Check parental controls
      const parentalControlCheck = await this.checkParentalControls(studentId, reward);
      if (!parentalControlCheck.allowed) {
        throw new Error(`Récompense non autorisée: ${parentalControlCheck.reason}`);
      }

      // Create reward request
      const request = {
        request_id: uuidv4(),
        student_id: studentId,
        reward_id: rewardId,
        reward_data: reward,
        status: 'pending_approval',
        coins_required: reward.coin_cost,
        custom_data: customData,
        requested_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
        parent_notes: reward.parent_notes,
        approval_required: this.determineApprovalRequirement(reward),
        auto_approval_eligible: this.checkAutoApprovalEligibility(reward)
      };

      return {
        request,
        next_steps: this.getNextSteps(request),
        estimated_approval_time: this.getEstimatedApprovalTime(request)
      };
    } catch (error) {
      throw new Error(`Erreur demande récompense: ${error.message}`);
    }
  }

  async approveReward(parentUserId, requestId, approvalData = {}) {
    try {
      const request = await this.getRewardRequest(requestId);
      
      if (request.status !== 'pending_approval') {
        throw new Error('Demande déjà traitée');
      }

      // Verify parent authorization
      const parentAuthorized = await this.verifyParentAuthorization(parentUserId, request.student_id);
      if (!parentAuthorized) {
        throw new Error('Non autorisé à approuver cette demande');
      }

      // Process the approval
      const student = await StudentService.getStudent(request.student_id);
      
      // Deduct coins
      if (student.spendCoins(request.coins_required)) {
        // Update request status
        request.status = 'approved';
        request.approved_by = parentUserId;
        request.approved_at = new Date().toISOString();
        request.approval_notes = approvalData.notes || '';
        request.scheduled_for = approvalData.scheduled_for || null;
        
        // Create reward fulfillment record
        const fulfillment = {
          fulfillment_id: uuidv4(),
          request_id: requestId,
          student_id: request.student_id,
          reward_id: request.reward_id,
          status: 'pending_fulfillment',
          scheduled_date: approvalData.scheduled_for || new Date().toISOString(),
          parent_responsible: parentUserId,
          created_at: new Date().toISOString()
        };

        return {
          approval_successful: true,
          coins_deducted: request.coins_required,
          remaining_coins: student.coins,
          fulfillment,
          next_steps: this.getFulfillmentSteps(fulfillment)
        };
      } else {
        throw new Error('Erreur déduction pièces');
      }
    } catch (error) {
      throw new Error(`Erreur approbation récompense: ${error.message}`);
    }
  }

  async rejectReward(parentUserId, requestId, rejectionReason) {
    try {
      const request = await this.getRewardRequest(requestId);
      
      if (request.status !== 'pending_approval') {
        throw new Error('Demande déjà traitée');
      }

      // Verify parent authorization
      const parentAuthorized = await this.verifyParentAuthorization(parentUserId, request.student_id);
      if (!parentAuthorized) {
        throw new Error('Non autorisé à rejeter cette demande');
      }

      // Process rejection
      request.status = 'rejected';
      request.rejected_by = parentUserId;
      request.rejected_at = new Date().toISOString();
      request.rejection_reason = rejectionReason;

      return {
        rejection_successful: true,
        reason: rejectionReason,
        alternative_suggestions: this.getAlternativeRewards(request.student_id, request.reward_id)
      };
    } catch (error) {
      throw new Error(`Erreur rejet récompense: ${error.message}`);
    }
  }

  async fulfillReward(parentUserId, fulfillmentId, fulfillmentData = {}) {
    try {
      const fulfillment = await this.getRewardFulfillment(fulfillmentId);
      
      if (fulfillment.status !== 'pending_fulfillment') {
        throw new Error('Récompense déjà réalisée');
      }

      // Update fulfillment
      fulfillment.status = 'fulfilled';
      fulfillment.fulfilled_by = parentUserId;
      fulfillment.fulfilled_at = new Date().toISOString();
      fulfillment.fulfillment_notes = fulfillmentData.notes || '';
      fulfillment.photos = fulfillmentData.photos || [];

      // Update student progress
      const student = await StudentService.getStudent(fulfillment.student_id);
      student.achievements.push({
        achievement_id: uuidv4(),
        type: 'reward_earned',
        title: 'Récompense obtenue',
        description: `${fulfillment.reward_data.name} réalisée avec succès!`,
        timestamp: new Date().toISOString(),
        coins_spent: fulfillment.request.coins_required
      });

      return {
        fulfillment_successful: true,
        reward_completed: fulfillment.reward_data.name,
        student_feedback: this.generateStudentFeedback(fulfillment)
      };
    } catch (error) {
      throw new Error(`Erreur réalisation récompense: ${error.message}`);
    }
  }

  async getParentDashboard(tenantId, parentUserId) {
    try {
      const students = await StudentService.getStudentsByTenant(tenantId);
      const pendingRequests = await this.getPendingRequests(tenantId);
      const recentFulfillments = await this.getRecentFulfillments(tenantId);
      const spendingStats = await this.calculateSpendingStats(tenantId);

      return {
        students: students.map(student => ({
          student_id: student.student_id,
          name: `${student.first_name} ${student.last_name}`,
          coins: student.coins,
          level: student.level,
          pending_requests: pendingRequests.filter(req => req.student_id === student.student_id).length,
          recent_rewards: recentFulfillments.filter(ful => ful.student_id === student.student_id).length
        })),
        pending_requests: pendingRequests,
        recent_fulfillments: recentFulfillments,
        spending_stats: spendingStats,
        parental_controls: this.parentalControls,
        recommendations: this.getParentRecommendations(students, spendingStats)
      };
    } catch (error) {
      throw new Error(`Erreur tableau de bord parent: ${error.message}`);
    }
  }

  async updateParentalControls(tenantId, parentUserId, controls) {
    try {
      // Verify parent authorization
      const authorized = await this.verifyParentAuthorization(parentUserId);
      if (!authorized) {
        throw new Error('Non autorisé à modifier les contrôles parentaux');
      }

      // Update controls
      const updatedControls = {
        ...this.parentalControls,
        ...controls,
        updated_by: parentUserId,
        updated_at: new Date().toISOString()
      };

      // This would save to database
      return updatedControls;
    } catch (error) {
      throw new Error(`Erreur mise à jour contrôles parentaux: ${error.message}`);
    }
  }

  // Helper methods
  getRecommendations(student, rewards) {
    const affordableRewards = rewards.filter(r => r.student_can_afford);
    const nearAffordable = rewards.filter(r => 
      !r.student_can_afford && r.affordability_gap <= 100
    );

    return {
      affordable: affordableRewards.slice(0, 3),
      save_for: nearAffordable.slice(0, 2),
      popular: rewards.filter(r => r.usage_count > 0).slice(0, 3)
    };
  }

  async getCustomRewards(tenantId, studentAge) {
    // This would fetch custom rewards from database
    // For now, return empty array
    return [];
  }

  async getReward(rewardId) {
    // Check template rewards first
    if (this.rewardTemplates[rewardId]) {
      return this.rewardTemplates[rewardId];
    }
    
    // Then check custom rewards
    return await this.getCustomReward(rewardId);
  }

  async getCustomReward(rewardId) {
    // This would fetch from database
    return null;
  }

  async checkParentalControls(studentId, reward) {
    // This would implement comprehensive parental control checks
    return { allowed: true };
  }

  determineApprovalRequirement(reward) {
    if (reward.coin_cost <= 200) return false; // Auto-approve under 200 coins
    if (reward.category === 'digital') return true; // Always require approval for digital
    return true; // Default to requiring approval
  }

  checkAutoApprovalEligibility(reward) {
    return reward.coin_cost <= 100 && reward.difficulty === 'easy';
  }

  getNextSteps(request) {
    if (request.approval_required) {
      return ['En attente d\'approbation parentale', 'Tu recevras une notification quand ce sera approuvé'];
    } else {
      return ['Approbation automatique', 'Récompense disponible immédiatement'];
    }
  }

  getEstimatedApprovalTime(request) {
    if (request.auto_approval_eligible) return 'Immédiat';
    return 'Moins de 24 heures';
  }

  async verifyParentAuthorization(parentUserId, studentId = null) {
    // This would verify parent authorization
    return true;
  }

  getFulfillmentSteps(fulfillment) {
    return [
      'Planifier la récompense avec l\'enfant',
      'Préparer ce qui est nécessaire',
      'Réaliser la récompense ensemble',
      'Prendre une photo souvenir (optionnel)'
    ];
  }

  getAlternativeRewards(studentId, rejectedRewardId) {
    // This would suggest similar, more affordable rewards
    return [];
  }

  generateStudentFeedback(fulfillment) {
    return {
      message: 'Félicitations ! Tu as bien mérité cette récompense !',
      encouragement: 'Continue tes efforts pour atteindre tes prochains objectifs',
      next_goal: 'Quelle récompense viseras-tu maintenant ?'
    };
  }

  async getRewardRequest(requestId) {
    // This would fetch from database
    throw new Error('Request storage not implemented');
  }

  async getRewardFulfillment(fulfillmentId) {
    // This would fetch from database
    throw new Error('Fulfillment storage not implemented');
  }

  async getPendingRequests(tenantId) {
    // This would fetch from database
    return [];
  }

  async getRecentFulfillments(tenantId) {
    // This would fetch from database
    return [];
  }

  async calculateSpendingStats(tenantId) {
    // This would calculate spending statistics
    return {
      total_spent: 0,
      this_week: 0,
      this_month: 0,
      by_category: {},
      average_per_reward: 0
    };
  }

  getParentRecommendations(students, spendingStats) {
    return {
      adjust_limits: spendingStats.this_week > 1000 ? 'Considérer ajuster les limites hebdomadaires' : null,
      new_rewards: students.length > 1 ? 'Ajouter des récompenses adaptées à plusieurs enfants' : null,
      balance_categories: spendingStats.by_category?.activities > 500 ? 'Équilibrer avec d\'autres catégories' : null
    };
  }
}

module.exports = new RewardService();
