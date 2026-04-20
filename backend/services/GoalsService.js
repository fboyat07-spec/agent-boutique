const StudentService = require('./StudentService');
const GamificationService = require('./GamificationService');
const { v4: uuidv4 } = require('uuid');

/**
 * Goals and Progress Tracking Service
 * Manages goal setting, tracking, and achievement systems
 */
class GoalsService {
  constructor() {
    this.goalTypes = {
      daily: {
        duration: 24 * 60 * 60 * 1000, // 24 hours
        reset_time: '00:00',
        auto_reset: true
      },
      weekly: {
        duration: 7 * 24 * 60 * 60 * 1000, // 7 days
        reset_day: 'monday',
        reset_time: '00:00',
        auto_reset: true
      },
      monthly: {
        duration: 30 * 24 * 60 * 60 * 1000, // 30 days
        reset_day: 1,
        reset_time: '00:00',
        auto_reset: true
      },
      custom: {
        duration: null, // User-defined
        auto_reset: false
      },
      milestone: {
        duration: null, // One-time achievement
        auto_reset: false
      }
    };

    this.goalCategories = {
      exercises: 'Exercices',
      accuracy: 'Précision',
      time: 'Temps',
      skills: 'Compétences',
      streak: 'Série',
      xp: 'XP',
      coins: 'Pièces'
    };

    this.goalTemplates = this.initializeGoalTemplates();
  }

  initializeGoalTemplates() {
    return {
      // Exercise goals
      daily_exercises: {
        type: 'daily',
        category: 'exercises',
        title: 'Exercices quotidiens',
        description: 'Compléter des exercices chaque jour',
        target: 10,
        unit: 'exercices',
        difficulty: 'easy',
        xp_reward: 10,
        coin_reward: 5
      },
      weekly_exercises: {
        type: 'weekly',
        category: 'exercises',
        title: 'Objectif hebdomadaire',
        description: 'Atteindre un nombre d\'exercices cette semaine',
        target: 50,
        unit: 'exercices',
        difficulty: 'medium',
        xp_reward: 50,
        coin_reward: 25
      },
      
      // Accuracy goals
      daily_accuracy: {
        type: 'daily',
        category: 'accuracy',
        title: 'Précision quotidienne',
        description: 'Maintenir une bonne précision',
        target: 0.8,
        unit: '%',
        difficulty: 'medium',
        xp_reward: 20,
        coin_reward: 10
      },
      weekly_accuracy: {
        type: 'weekly',
        category: 'accuracy',
        title: 'Précision hebdomadaire',
        description: 'Maintenir une bonne précision sur la semaine',
        target: 0.85,
        unit: '%',
        difficulty: 'hard',
        xp_reward: 75,
        coin_reward: 40
      },
      
      // Time goals
      daily_time: {
        type: 'daily',
        category: 'time',
        title: 'Temps d\'étude quotidien',
        description: 'Étudier un certain temps chaque jour',
        target: 20,
        unit: 'minutes',
        difficulty: 'easy',
        xp_reward: 15,
        coin_reward: 8
      },
      weekly_time: {
        type: 'weekly',
        category: 'time',
        title: 'Temps d\'étude hebdomadaire',
        description: 'Étudier un certain temps cette semaine',
        target: 120,
        unit: 'minutes',
        difficulty: 'medium',
        xp_reward: 60,
        coin_reward: 30
      },
      
      // Streak goals
      daily_streak: {
        type: 'daily',
        category: 'streak',
        title: 'Serie quotidienne',
        description: 'Maintenir une série d\'apprentissage',
        target: 1,
        unit: 'jour',
        difficulty: 'easy',
        xp_reward: 5,
        coin_reward: 3
      },
      weekly_streak: {
        type: 'weekly',
        category: 'streak',
        title: 'Serie hebdomadaire',
        description: 'Apprendre tous les jours de la semaine',
        target: 7,
        unit: 'jours',
        difficulty: 'medium',
        xp_reward: 35,
        coin_reward: 20
      },
      
      // Skill goals
      skill_mastery: {
        type: 'milestone',
        category: 'skills',
        title: 'Maîtrise de compétence',
        description: 'Maîtriser une nouvelle compétence',
        target: 0.8,
        unit: '%',
        difficulty: 'hard',
        xp_reward: 100,
        coin_reward: 50
      },
      multiple_skills: {
        type: 'custom',
        category: 'skills',
        title: 'Compétences multiples',
        description: 'Maîtriser plusieurs compétences',
        target: 3,
        unit: 'compétences',
        difficulty: 'hard',
        xp_reward: 150,
        coin_reward: 75
      },
      
      // XP goals
      daily_xp: {
        type: 'daily',
        category: 'xp',
        title: 'XP quotidien',
        description: 'Gagner de l\'XP chaque jour',
        target: 50,
        unit: 'XP',
        difficulty: 'medium',
        xp_reward: 25,
        coin_reward: 12
      },
      level_up: {
        type: 'milestone',
        category: 'xp',
        title: 'Niveau supérieur',
        description: 'Atteindre le prochain niveau',
        target: null, // Dynamic based on current level
        unit: 'niveau',
        difficulty: 'hard',
        xp_reward: 200,
        coin_reward: 100
      }
    };
  }

  async createGoal(studentId, goalData, parentApproval = false) {
    try {
      const student = await StudentService.getStudent(studentId);
      
      const goal = {
        goal_id: uuidv4(),
        student_id: studentId,
        title: goalData.title,
        description: goalData.description || '',
        type: goalData.type || 'weekly',
        category: goalData.category || 'exercises',
        target: goalData.target,
        current_progress: 0,
        unit: goalData.unit || 'unités',
        difficulty: goalData.difficulty || 'medium',
        rewards: {
          xp: goalData.xp_reward || this.getDefaultRewards(goalData.difficulty).xp,
          coins: goalData.coin_reward || this.getDefaultRewards(goalData.difficulty).coins,
          badge: goalData.badge_reward || null
        },
        schedule: {
          created_at: new Date().toISOString(),
          start_date: goalData.start_date || new Date().toISOString(),
          end_date: goalData.end_date || this.calculateEndDate(goalData.type),
          reset_schedule: this.goalTypes[goalData.type] || this.goalTypes.weekly
        },
        tracking: {
          progress_entries: [],
          milestones: [],
          last_updated: new Date().toISOString()
        },
        status: 'active',
        parent_approved: parentApproval,
        auto_renew: goalData.auto_renew || false,
        created_at: new Date().toISOString()
      };

      // Initialize milestones for long-term goals
      if (goal.type === 'monthly' || goal.type === 'custom') {
        goal.tracking.milestones = this.createMilestones(goal);
      }

      return goal;
    } catch (error) {
      throw new Error(`Erreur création objectif: ${error.message}`);
    }
  }

  async updateGoalProgress(studentId, goalId, progressData) {
    try {
      const goal = await this.getGoal(goalId);
      const student = await StudentService.getStudent(studentId);
      
      if (goal.student_id !== studentId) {
        throw new Error('Objectif non trouvé pour cet étudiant');
      }

      const newProgress = this.calculateNewProgress(goal, progressData);
      const previousProgress = goal.current_progress;
      
      goal.current_progress = newProgress;
      goal.tracking.last_updated = new Date().toISOString();
      
      // Add progress entry
      const progressEntry = {
        entry_id: uuidv4(),
        timestamp: new Date().toISOString(),
        progress: newProgress,
        delta: newProgress - previousProgress,
        source: progressData.source || 'manual',
        metadata: progressData.metadata || {}
      };
      
      goal.tracking.progress_entries.push(progressEntry);

      // Check milestones
      const milestoneAchieved = this.checkMilestoneAchievement(goal, newProgress);
      
      // Check goal completion
      let goalCompleted = false;
      let rewards = null;
      
      if (newProgress >= goal.target) {
        goalCompleted = true;
        goal.status = 'completed';
        goal.completed_at = new Date().toISOString();
        
        // Award rewards
        rewards = await this.awardGoalRewards(student, goal);
        
        // Check for auto-renewal
        if (goal.auto_renew) {
          await this.renewGoal(goal);
        }
      }

      return {
        goal_updated: true,
        progress: {
          current: newProgress,
          target: goal.target,
          percentage: Math.round((newProgress / goal.target) * 100),
          delta: newProgress - previousProgress
        },
        milestone_achieved: milestoneAchieved,
        goal_completed: goalCompleted,
        rewards: rewards,
        next_milestone: this.getNextMilestone(goal)
      };
    } catch (error) {
      throw new Error(`Erreur mise à jour objectif: ${error.message}`);
    }
  }

  async getStudentGoals(studentId, status = 'active') {
    try {
      const student = await StudentService.getStudent(studentId);
      
      const goals = await this.getGoalsByStudent(studentId);
      const filteredGoals = goals.filter(goal => status === 'all' || goal.status === status);
      
      return {
        student_id: studentId,
        goals: filteredGoals.map(goal => ({
          goal_id: goal.goal_id,
          title: goal.title,
          type: goal.type,
          category: goal.category,
          target: goal.target,
          current_progress: goal.current_progress,
          progress_percentage: Math.round((goal.current_progress / goal.target) * 100),
          unit: goal.unit,
          status: goal.status,
          created_at: goal.created_at,
          end_date: goal.schedule.end_date,
          rewards: goal.rewards,
          days_remaining: this.calculateDaysRemaining(goal),
          on_track: this.isOnTrack(goal)
        })),
        summary: this.calculateGoalsSummary(filteredGoals),
        recommendations: await this.getGoalRecommendations(student, filteredGoals)
      };
    } catch (error) {
      throw new Error(`Erreur objectifs étudiant: ${error.message}`);
    }
  }

  async getParentGoalsOverview(parentUserId, tenantId) {
    try {
      const students = await StudentService.getStudentsByTenant(tenantId);
      
      const overview = {
        parent_id: parentUserId,
        tenant_id: tenantId,
        summary: {
          total_students: students.length,
          active_goals: 0,
          completed_goals_today: 0,
          goals_on_track: 0
        },
        students: await Promise.all(
          students.map(async (student) => {
            const studentGoals = await this.getStudentGoals(student.student_id);
            return {
              student_id: student.student_id,
              student_name: `${student.first_name} ${student.last_name}`,
              active_goals: studentGoals.goals.filter(g => g.status === 'active').length,
              completed_goals: studentGoals.goals.filter(g => g.status === 'completed').length,
              on_track_goals: studentGoals.goals.filter(g => g.on_track).length,
              recent_achievements: studentGoals.goals.filter(g => 
                g.status === 'completed' && this.isRecentlyCompleted(g)
              ).length,
              goal_completion_rate: this.calculateCompletionRate(studentGoals.goals)
            };
          })
        ),
        trends: await this.calculateGoalTrends(students),
        recommendations: await this.getParentGoalRecommendations(students)
      };

      // Calculate summary
      overview.summary.active_goals = overview.students.reduce((sum, s) => sum + s.active_goals, 0);
      overview.summary.completed_goals_today = overview.students.reduce((sum, s) => sum + s.recent_achievements, 0);
      overview.summary.goals_on_track = overview.students.reduce((sum, s) => sum + s.on_track_goals, 0);

      return overview;
    } catch (error) {
      throw new Error(`Erreur aperçu objectifs parent: ${error.message}`);
    }
  }

  async generateGoalSuggestions(studentId) {
    try {
      const student = await StudentService.getStudent(studentId);
      const currentGoals = await this.getStudentGoals(studentId);
      
      const suggestions = {
        personalized: await this.generatePersonalizedSuggestions(student, currentGoals),
        template_based: this.getTemplateBasedSuggestions(student, currentGoals),
        adaptive: await this.generateAdaptiveSuggestions(student, currentGoals),
        seasonal: this.getSeasonalSuggestions(student)
      };

      return suggestions;
    } catch (error) {
      throw new Error(`Erreur suggestions objectifs: ${error.message}`);
    }
  }

  async createGoalChallenge(studentId, challengeData) {
    try {
      const challenge = {
        challenge_id: uuidv4(),
        student_id: studentId,
        title: challengeData.title,
        description: challengeData.description,
        type: 'goal_challenge',
        duration: challengeData.duration || 7 * 24 * 60 * 60 * 1000, // 7 days
        goals: challengeData.goals || [],
        rewards: {
          completion_bonus: challengeData.completion_bonus || { xp: 100, coins: 50 },
          perfect_bonus: challengeData.perfect_bonus || { xp: 200, coins: 100 },
          badge: challengeData.badge_reward || null
        },
        participants: [studentId],
        status: 'active',
        created_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + (challengeData.duration || 7 * 24 * 60 * 60 * 1000)).toISOString()
      };

      // Create individual goals for the challenge
      challenge.goals = await Promise.all(
        challengeData.goals.map(async (goalData) => 
          this.createGoal(studentId, { ...goalData, parent_approval: true })
        )
      );

      return {
        challenge_created: true,
        challenge_id: challenge.challenge_id,
        goals_created: challenge.goals.length,
        ends_at: challenge.ends_at,
        tracking_url: `/goals/challenge/${challenge.challenge_id}`
      };
    } catch (error) {
      throw new Error(`Erreur défi objectif: ${error.message}`);
    }
  }

  // Helper methods
  calculateEndDate(goalType) {
    const typeConfig = this.goalTypes[goalType] || this.goalTypes.weekly;
    return new Date(Date.now() + typeConfig.duration).toISOString();
  }

  getDefaultRewards(difficulty) {
    const rewards = {
      easy: { xp: 10, coins: 5 },
      medium: { xp: 25, coins: 12 },
      hard: { xp: 50, coins: 25 }
    };
    return rewards[difficulty] || rewards.medium;
  }

  createMilestones(goal) {
    const milestones = [];
    const milestoneCount = Math.min(5, Math.floor(goal.target / 10));
    
    for (let i = 1; i <= milestoneCount; i++) {
      const milestoneValue = (goal.target / milestoneCount) * i;
      milestones.push({
        milestone_id: uuidv4(),
        value: milestoneValue,
        achieved: false,
        achieved_at: null,
        reward: {
          xp: Math.floor(goal.rewards.xp * 0.2),
          coins: Math.floor(goal.rewards.coins * 0.2)
        }
      });
    }
    
    return milestones;
  }

  calculateNewProgress(goal, progressData) {
    switch (goal.category) {
      case 'exercises':
        return progressData.exercises_completed || goal.current_progress;
      case 'accuracy':
        return progressData.accuracy || goal.current_progress;
      case 'time':
        return progressData.time_spent || goal.current_progress;
      case 'streak':
        return progressData.streak_days || goal.current_progress;
      case 'xp':
        return progressData.xp_earned || goal.current_progress;
      case 'coins':
        return progressData.coins_earned || goal.current_progress;
      case 'skills':
        return progressData.skills_mastered || goal.current_progress;
      default:
        return progressData.value || goal.current_progress;
    }
  }

  checkMilestoneAchievement(goal, newProgress) {
    const nextMilestone = goal.tracking.milestones.find(m => !m.achieved && m.value <= newProgress);
    
    if (nextMilestone) {
      nextMilestone.achieved = true;
      nextMilestone.achieved_at = new Date().toISOString();
      
      return {
        milestone_achieved: true,
        milestone: nextMilestone,
        reward: nextMilestone.reward
      };
    }
    
    return { milestone_achieved: false };
  }

  async awardGoalRewards(student, goal) {
    const rewards = {
      xp_awarded: 0,
      coins_awarded: 0,
      badges_earned: []
    };

    // Award base rewards
    student.addXP(goal.rewards.xp);
    student.addCoins(goal.rewards.coins);
    rewards.xp_awarded = goal.rewards.xp;
    rewards.coins_awarded = goal.rewards.coins;

    // Award badge if applicable
    if (goal.rewards.badge) {
      const badge = {
        id: goal.rewards.badge.id,
        name: goal.rewards.badge.name,
        description: goal.rewards.badge.description,
        icon: goal.rewards.badge.icon,
        earned_at: new Date().toISOString()
      };
      
      if (student.addBadge(badge)) {
        rewards.badges_earned.push(badge);
      }
    }

    return rewards;
  }

  async renewGoal(goal) {
    // Reset progress for recurring goals
    goal.current_progress = 0;
    goal.status = 'active';
    goal.tracking.progress_entries = [];
    goal.tracking.last_updated = new Date().toISOString();
    
    // Update end date
    const typeConfig = this.goalTypes[goal.type];
    if (typeConfig && typeConfig.duration) {
      goal.schedule.end_date = new Date(Date.now() + typeConfig.duration).toISOString();
    }
    
    return goal;
  }

  calculateDaysRemaining(goal) {
    const endDate = new Date(goal.schedule.end_date);
    const now = new Date();
    const diffTime = endDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return Math.max(0, diffDays);
  }

  isOnTrack(goal) {
    if (goal.status !== 'active') return false;
    
    const now = new Date();
    const startDate = new Date(goal.schedule.start_date);
    const endDate = new Date(goal.schedule.end_date);
    
    const totalDuration = endDate - startDate;
    const elapsed = now - startDate;
    const progressRatio = elapsed / totalDuration;
    
    const expectedProgress = goal.target * progressRatio;
    const actualProgress = goal.current_progress;
    
    return actualProgress >= expectedProgress * 0.8; // 80% of expected progress
  }

  calculateGoalsSummary(goals) {
    const summary = {
      total_goals: goals.length,
      active_goals: goals.filter(g => g.status === 'active').length,
      completed_goals: goals.filter(g => g.status === 'completed').length,
      on_track: goals.filter(g => g.on_track).length,
      by_category: {},
      by_type: {},
      completion_rate: 0
    };

    goals.forEach(goal => {
      // By category
      summary.by_category[goal.category] = (summary.by_category[goal.category] || 0) + 1;
      
      // By type
      summary.by_type[goal.type] = (summary.by_type[goal.type] || 0) + 1;
    });

    if (goals.length > 0) {
      summary.completion_rate = (summary.completed_goals / goals.length) * 100;
    }

    return summary;
  }

  async getGoalRecommendations(student, goals) {
    const recommendations = [];
    
    // Check for overdue goals
    const overdueGoals = goals.filter(g => 
      g.status === 'active' && this.calculateDaysRemaining(g) <= 0
    );
    
    if (overdueGoals.length > 0) {
      recommendations.push({
        type: 'overdue_goals',
        priority: 'high',
        message: `${overdueGoals.length} objectif(s) en retard`,
        action: 'review_goals'
      });
    }
    
    // Check for goals behind schedule
    const behindGoals = goals.filter(g => !g.on_track && g.status === 'active');
    
    if (behindGoals.length > 0) {
      recommendations.push({
        type: 'behind_schedule',
        priority: 'medium',
        message: `${behindGoals.length} objectif(s) en retard sur le planning`,
        action: 'increase_effort'
      });
    }
    
    // Suggest new goals based on performance
    const highPerformer = student.calculateRecentAccuracy() > 0.9;
    if (highPerformer && goals.length < 5) {
      recommendations.push({
        type: 'challenge_yourself',
        priority: 'low',
        message: 'Tu progresses bien! Essaie un objectif plus difficile',
        action: 'create_goal'
      });
    }
    
    return recommendations;
  }

  isRecentlyCompleted(goal) {
    if (!goal.completed_at) return false;
    const completedDate = new Date(goal.completed_at);
    const now = new Date();
    const diffDays = Math.floor((now - completedDate) / (1000 * 60 * 60 * 24));
    return diffDays <= 1;
  }

  calculateCompletionRate(goals) {
    if (goals.length === 0) return 0;
    const completed = goals.filter(g => g.status === 'completed').length;
    return Math.round((completed / goals.length) * 100);
  }

  async calculateGoalTrends(students) {
    // This would analyze goal completion trends over time
    return {
      weekly_completion_rate: 0.75,
      popular_categories: ['exercises', 'accuracy'],
      average_goals_per_student: 3.2,
      success_rate_by_difficulty: {
        easy: 0.9,
        medium: 0.7,
        hard: 0.4
      }
    };
  }

  async getParentGoalRecommendations(students) {
    return [
      {
        type: 'encourage_goal_setting',
        message: 'Encouragez vos enfants à se fixer des objectifs réalistes',
        priority: 'medium'
      },
      {
        type: 'review_difficulty',
        message: 'Ajustez la difficulté des objectifs en fonction des progrès',
        priority: 'low'
      }
    ];
  }

  async generatePersonalizedSuggestions(student, currentGoals) {
    const suggestions = [];
    
    // Based on weak skills
    const weakSkills = student.getWeakSkills();
    if (weakSkills.length > 0) {
      suggestions.push({
        type: 'skill_focused',
        title: 'Objectif de compétence',
        description: `Travailler sur ${weakSkills[0].skill_name}`,
        template: 'skill_mastery',
        custom_target: 0.7,
        priority: 'high'
      });
    }
    
    // Based on recent performance
    const accuracy = student.calculateRecentAccuracy();
    if (accuracy > 0.8) {
      suggestions.push({
        type: 'performance_based',
        title: 'Objectif de précision',
        description: 'Maintenir ta bonne précision',
        template: 'daily_accuracy',
        priority: 'medium'
      });
    }
    
    return suggestions;
  }

  getTemplateBasedSuggestions(student, currentGoals) {
    const activeGoalTypes = currentGoals.goals.map(g => g.type);
    const availableTemplates = Object.values(this.goalTemplates)
      .filter(template => !activeGoalTypes.includes(template.type));
    
    return availableTemplates.slice(0, 3).map(template => ({
      type: 'template',
      title: template.title,
      description: template.description,
      template_id: template.type,
      priority: 'low'
    }));
  }

  async generateAdaptiveSuggestions(student, currentGoals) {
    // This would use AI to generate personalized suggestions
    return [];
  }

  getSeasonalSuggestions(student) {
    const month = new Date().getMonth();
    const seasonalSuggestions = {
      // Back to school (August-September)
      7: [{
        type: 'seasonal',
        title: 'Objectif de rentrée',
        description: 'Commencer la nouvelle année scolaire avec de bons objectifs',
        priority: 'medium'
      }],
      // Summer break (June-August)
      5: [{
        type: 'seasonal',
        title: 'Objectif d\'été',
        description: 'Continuer à apprendre pendant les vacances',
        priority: 'low'
      }]
    };
    
    return seasonalSuggestions[month] || [];
  }

  // Placeholder implementations for database operations
  async getGoal(goalId) {
    // This would fetch from database
    throw new Error('Goal storage not implemented');
  }

  async getGoalsByStudent(studentId) {
    // This would fetch from database
    return [];
  }

  getNextMilestone(goal) {
    const nextMilestone = goal.tracking.milestones.find(m => !m.achieved);
    return nextMilestone || null;
  }
}

module.exports = new GoalsService();
