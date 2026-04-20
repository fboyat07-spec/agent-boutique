const StudentService = require('./StudentService');
const RewardService = require('./RewardService');
const DiagnosticService = require('./DiagnosticService');
const RootCauseAnalysisService = require('./RootCauseAnalysisService');
const GamificationService = require('./GamificationService');
const { v4: uuidv4 } = require('uuid');

/**
 * Comprehensive Parent Dashboard Service
 * Provides complete insights, controls, and management tools for parents
 */
class ParentDashboardService {
  constructor() {
    this.dashboardSections = {
      overview: 'Aperçu général',
      progress: 'Progression détaillée',
      achievements: 'Réalisations et gamification',
      rewards: 'Système de récompenses',
      analytics: 'Analyses et rapports',
      settings: 'Paramètres et contrôles'
    };
  }

  async getDashboardData(parentUserId, tenantId, options = {}) {
    try {
      const students = await StudentService.getStudentsByTenant(tenantId);
      const timeRange = options.timeRange || 'week';
      const studentIds = students.map(s => s.student_id);

      const dashboardData = {
        parent_user_id: parentUserId,
        tenant_id: tenantId,
        time_range: timeRange,
        generated_at: new Date().toISOString(),
        overview: await this.getOverviewData(studentIds, timeRange),
        students: await this.getStudentsOverview(students, timeRange),
        progress: await this.getProgressData(studentIds, timeRange),
        achievements: await this.getAchievementsData(studentIds),
        rewards: await this.getRewardsData(studentIds, tenantId),
        analytics: await this.getAnalyticsData(studentIds, timeRange),
        alerts: await this.getParentAlerts(studentIds),
        recommendations: await this.getParentRecommendations(studentIds, timeRange)
      };

      return dashboardData;
    } catch (error) {
      throw new Error(`Erreur tableau de bord: ${error.message}`);
    }
  }

  async getOverviewData(studentIds, timeRange) {
    try {
      const students = await Promise.all(
        studentIds.map(id => StudentService.getStudent(id))
      );

      const totalStats = students.reduce((acc, student) => ({
        total_exercises: acc.total_exercises + student.stats.total_exercises,
        total_time: acc.total_time + student.stats.total_time,
        total_xp: acc.total_xp + student.xp,
        total_coins: acc.total_coins + student.coins,
        active_students: acc.active_students + (this.isStudentActive(student, timeRange) ? 1 : 0),
        avg_accuracy: acc.avg_accuracy + student.calculateRecentAccuracy()
      }), {
        total_exercises: 0,
        total_time: 0,
        total_xp: 0,
        total_coins: 0,
        active_students: 0,
        avg_accuracy: 0
      });

      // Calculate averages
      totalStats.avg_accuracy = students.length > 0 ? totalStats.avg_accuracy / students.length : 0;
      totalStats.avg_session_time = totalStats.total_exercises > 0 ? totalStats.total_time / totalStats.total_exercises : 0;

      // Get trends
      const trends = await this.calculateTrends(students, timeRange);

      return {
        summary: {
          total_students: students.length,
          active_students: totalStats.active_students,
          total_exercises: totalStats.total_exercises,
          total_time_hours: Math.round(totalStats.total_time / 60),
          total_xp: totalStats.total_xp,
          total_coins: totalStats.total_coins,
          average_accuracy: Math.round(totalStats.avg_accuracy),
          average_session_time: Math.round(totalStats.avg_session_time)
        },
        trends,
        top_performers: this.getTopPerformers(students),
        areas_needing_attention: this.getAreasNeedingAttention(students),
        weekly_goals_progress: await this.getWeeklyGoalsProgress(students)
      };
    } catch (error) {
      throw new Error(`Erreur aperçu général: ${error.message}`);
    }
  }

  async getStudentsOverview(students, timeRange) {
    return await Promise.all(
      students.map(async (student) => {
        const progressReport = await StudentService.getProgressReport(student.student_id, timeRange);
        const gamificationProfile = await GamificationService.getStudentGamificationProfile(student.student_id);
        const recentActivity = this.getRecentStudentActivity(student);
        const nextMilestones = this.getNextStudentMilestones(student);

        return {
          student_id: student.student_id,
          name: `${student.first_name} ${student.last_name}`,
          grade: student.grade,
          age: student.age,
          avatar: student.avatar,
          status: this.getStudentStatus(student),
          current_level: student.level,
          current_xp: student.xp,
          current_coins: student.coins,
          current_streak: student.streak,
          progress_report,
          gamification_profile,
          recent_activity: recentActivity,
          next_milestones: nextMilestones,
          strengths: student.getStrongSkills(),
          weaknesses: student.getWeakSkills(),
          last_active: student.stats.last_active
        };
      })
    );
  }

  async getProgressData(studentIds, timeRange) {
    const progressData = {
      skill_mastery: {},
      learning_velocity: {},
      time_spent: {},
      accuracy_trends: {},
      subject_breakdown: {},
      grade_level_progression: {}
    };

    for (const studentId of studentIds) {
      const student = await StudentService.getStudent(studentId);
      
      // Skill mastery breakdown
      progressData.skill_mastery[studentId] = Object.entries(student.mastery).map(([skill, mastery]) => ({
        skill,
        skill_name: this.getSkillName(skill),
        mastery: Math.round(mastery * 100),
        trend: this.calculateSkillTrend(student, skill),
        grade_level: this.getMasteryGradeLevel(mastery)
      }));

      // Learning velocity
      progressData.learning_velocity[studentId] = this.calculateLearningVelocity(student);

      // Time spent by category
      progressData.time_spent[studentId] = this.calculateTimeSpentByCategory(student, timeRange);

      // Accuracy trends
      progressData.accuracy_trends[studentId] = this.calculateAccuracyTrends(student, timeRange);

      // Subject breakdown
      progressData.subject_breakdown[studentId] = this.getSubjectBreakdown(student);

      // Grade level progression
      progressData.grade_level_progression[studentId] = this.getGradeLevelProgression(student);
    }

    return progressData;
  }

  async getAchievementsData(studentIds) {
    const achievementsData = {
      summary: {},
      recent_achievements: [],
      badge_progress: {},
      milestone_tracking: {},
      comparison_data: {}
    };

    for (const studentId of studentIds) {
      const student = await StudentService.getStudent(studentId);
      const gamificationProfile = await GamificationService.getStudentGamificationProfile(studentId);

      achievementsData.summary[studentId] = {
        total_badges: student.badges.length,
        total_achievements: student.achievements.length,
        current_level: student.level,
        xp_to_next_level: gamificationProfile.xp_to_next_level,
        completion_percentage: gamificationProfile.stats.current_level_progress * 100
      };

      achievementsData.badge_progress[studentId] = gamificationProfile.next_badges;
      achievementsData.milestone_tracking[studentId] = this.trackMilestones(student);
    }

    // Get recent achievements across all students
    achievementsData.recent_achievements = await this.getRecentAchievements(studentIds);

    return achievementsData;
  }

  async getRewardsData(studentIds, tenantId) {
    const rewardsData = {
      summary: {},
      pending_requests: [],
      recent_fulfillments: [],
      spending_patterns: {},
      category_preferences: {},
      savings_goals: {}
    };

    // Get reward dashboard data
    const rewardDashboard = await RewardService.getParentDashboard(tenantId, null);
    
    rewardsData.pending_requests = rewardDashboard.pending_requests.filter(req => 
      studentIds.includes(req.student_id)
    );
    rewardsData.recent_fulfillments = rewardDashboard.recent_fulfillments.filter(ful => 
      studentIds.includes(ful.student_id)
    );

    for (const studentId of studentIds) {
      const student = await StudentService.getStudent(studentId);
      
      rewardsData.summary[studentId] = {
        current_coins: student.coins,
        total_earned: student.coins, // This would track total earned
        total_spent: 0, // This would track total spent
        rewards_earned: 0, // This would count rewards earned
        saving_efficiency: this.calculateSavingEfficiency(student)
      };

      rewardsData.spending_patterns[studentId] = this.getSpendingPatterns(studentId, tenantId);
      rewardsData.category_preferences[studentId] = this.getCategoryPreferences(studentId, tenantId);
      rewardsData.savings_goals[studentId] = this.getSavingsGoals(student);
    }

    return rewardsData;
  }

  async getAnalyticsData(studentIds, timeRange) {
    return {
      learning_patterns: await this.analyzeLearningPatterns(studentIds, timeRange),
      performance_metrics: await this.calculatePerformanceMetrics(studentIds, timeRange),
      engagement_analytics: await this.analyzeEngagement(studentIds, timeRange),
      predictive_insights: await this.generatePredictiveInsights(studentIds),
      comparison_benchmarks: await this.getBenchmarkComparisons(studentIds),
      roi_analysis: await this.calculateROI(studentIds, timeRange)
    };
  }

  async getParentAlerts(studentIds) {
    const alerts = [];

    for (const studentId of studentIds) {
      const student = await StudentService.getStudent(studentId);
      const studentAlerts = await this.generateStudentAlerts(student);
      alerts.push(...studentAlerts);
    }

    return alerts.sort((a, b) => b.priority - a.priority);
  }

  async getParentRecommendations(studentIds, timeRange) {
    return {
      immediate_actions: await this.getImmediateActions(studentIds),
      long_term_strategies: await this.getLongTermStrategies(studentIds),
      learning_optimizations: await this.getLearningOptimizations(studentIds),
      motivational_strategies: await this.getMotivationalStrategies(studentIds),
      resource_recommendations: await this.getResourceRecommendations(studentIds)
    };
  }

  // Helper methods for overview data
  isStudentActive(student, timeRange) {
    const days = timeRange === 'week' ? 7 : timeRange === 'month' ? 30 : 1;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    return student.stats.last_active && new Date(student.stats.last_active) >= cutoff;
  }

  async calculateTrends(students, timeRange) {
    return {
      exercise_completion: await this.calculateExerciseTrend(students, timeRange),
      accuracy_improvement: await this.calculateAccuracyTrend(students, timeRange),
      engagement_level: await this.calculateEngagementTrend(students, timeRange),
      skill_progression: await this.calculateSkillProgressionTrend(students, timeRange)
    };
  }

  getTopPerformers(students) {
    return students
      .map(student => ({
        student_id: student.student_id,
        name: `${student.first_name} ${student.last_name}`,
        score: this.calculatePerformanceScore(student),
        highlights: this.getStudentHighlights(student)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }

  getAreasNeedingAttention(students) {
    const areas = [];
    
    students.forEach(student => {
      const weakSkills = student.getWeakSkills();
      if (weakSkills.length > 0) {
        areas.push({
          student_id: student.student_id,
          student_name: `${student.first_name} ${student.last_name}`,
          skills: weakSkills.slice(0, 3),
          priority: this.calculateAttentionPriority(student, weakSkills),
          suggested_actions: this.getSuggestedActions(weakSkills)
        });
      }
    });

    return areas.sort((a, b) => b.priority - a.priority);
  }

  async getWeeklyGoalsProgress(students) {
    return students.map(student => ({
      student_id: student.student_id,
      student_name: `${student.first_name} ${student.last_name}`,
      goals_progress: StudentService.getGoalsProgress(student.student_id)
    }));
  }

  // Helper methods for student data
  getStudentStatus(student) {
    if (!student.stats.last_active) return 'inactive';
    
    const daysSinceActive = Math.floor((Date.now() - new Date(student.stats.last_active)) / (24 * 60 * 60 * 1000));
    
    if (daysSinceActive <= 1) return 'active';
    if (daysSinceActive <= 7) return 'recently_active';
    return 'inactive';
  }

  getRecentStudentActivity(student) {
    const recentHistory = student.history.slice(-10);
    
    return {
      last_exercise: recentHistory[0] || null,
      recent_accuracy: student.calculateRecentAccuracy(),
      skills_practiced: [...new Set(recentHistory.map(ex => ex.skill))],
      time_spent_recent: recentHistory.reduce((sum, ex) => sum + (ex.time_taken || 0), 0),
      xp_earned_recent: recentHistory.reduce((sum, ex) => sum + (ex.xp_earned || 0), 0)
    };
  }

  getNextStudentMilestones(student) {
    return {
      next_level: {
        level: student.level + 1,
        xp_needed: (student.level * 100) - student.xp,
        progress: (student.xp % 100) / 100
      },
      streak_milestone: this.getNextStreakMilestone(student.streak),
      skill_milestones: this.getNextSkillMilestones(student)
    };
  }

  // Helper methods for progress data
  getSkillName(skillId) {
    // This would map skill IDs to human-readable names
    const skillNames = {
      'counting': 'Compter',
      'addition': 'Addition',
      'subtraction': 'Soustraction',
      'multiplication': 'Multiplication',
      'division': 'Division'
    };
    return skillNames[skillId] || skillId;
  }

  calculateSkillTrend(student, skillId) {
    const recentExercises = student.history.filter(ex => ex.skill === skillId).slice(-10);
    if (recentExercises.length < 5) return 'insufficient_data';
    
    const firstHalf = recentExercises.slice(0, Math.floor(recentExercises.length / 2));
    const secondHalf = recentExercises.slice(Math.floor(recentExercises.length / 2));
    
    const firstAccuracy = firstHalf.filter(ex => ex.correct).length / firstHalf.length;
    const secondAccuracy = secondHalf.filter(ex => ex.correct).length / secondHalf.length;
    
    const improvement = secondAccuracy - firstAccuracy;
    
    if (improvement > 0.1) return 'improving';
    if (improvement < -0.1) return 'declining';
    return 'stable';
  }

  getMasteryGradeLevel(mastery) {
    if (mastery >= 0.9) return 'excellent';
    if (mastery >= 0.7) return 'good';
    if (mastery >= 0.5) return 'developing';
    return 'needs_work';
  }

  calculateLearningVelocity(student) {
    const recentExercises = student.history.slice(-20);
    if (recentExercises.length < 10) return 0;
    
    const firstHalf = recentExercises.slice(0, 10);
    const secondHalf = recentExercises.slice(10);
    
    const firstAccuracy = firstHalf.filter(ex => ex.correct).length / firstHalf.length;
    const secondAccuracy = secondHalf.filter(ex => ex.correct).length / secondHalf.length;
    
    return secondAccuracy - firstAccuracy;
  }

  calculateTimeSpentByCategory(student, timeRange) {
    const cutoff = this.getTimeRangeCutoff(timeRange);
    const recentExercises = student.history.filter(ex => new Date(ex.timestamp) >= cutoff);
    
    const categoryTime = {};
    recentExercises.forEach(ex => {
      const category = this.getSkillCategory(ex.skill);
      categoryTime[category] = (categoryTime[category] || 0) + (ex.time_taken || 0);
    });
    
    return categoryTime;
  }

  calculateAccuracyTrends(student, timeRange) {
    const cutoff = this.getTimeRangeCutoff(timeRange);
    const recentExercises = student.history.filter(ex => new Date(ex.timestamp) >= cutoff);
    
    if (recentExercises.length === 0) return [];
    
    // Group by day
    const dailyAccuracy = {};
    recentExercises.forEach(ex => {
      const day = new Date(ex.timestamp).toDateString();
      if (!dailyAccuracy[day]) {
        dailyAccuracy[day] = { correct: 0, total: 0 };
      }
      dailyAccuracy[day].total += 1;
      if (ex.correct) dailyAccuracy[day].correct += 1;
    });
    
    return Object.entries(dailyAccuracy).map(([day, data]) => ({
      date: day,
      accuracy: data.correct / data.total
    })).sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  getSubjectBreakdown(student) {
    const subjectStats = {};
    
    Object.entries(student.mastery).forEach(([skill, mastery]) => {
      const subject = this.getSkillSubject(skill);
      if (!subjectStats[subject]) {
        subjectStats[subject] = { skills: 0, avg_mastery: 0, total_mastery: 0 };
      }
      subjectStats[subject].skills += 1;
      subjectStats[subject].total_mastery += mastery;
    });
    
    Object.keys(subjectStats).forEach(subject => {
      subjectStats[subject].avg_mastery = subjectStats[subject].total_mastery / subjectStats[subject].skills;
    });
    
    return subjectStats;
  }

  getGradeLevelProgression(student) {
    // This would track progression through grade levels over time
    return {
      current_grade: student.grade,
      estimated_grade: this.estimateGradeLevel(student.level_estimated),
      progression_rate: this.calculateProgressionRate(student),
      next_grade_target: this.getNextGradeTarget(student)
    };
  }

  // Helper methods for achievements data
  trackMilestones(student) {
    return {
      exercises_completed: student.stats.total_exercises,
      accuracy_milestone: this.getNextAccuracyMilestone(student.calculateRecentAccuracy()),
      streak_milestone: this.getNextStreakMilestone(student.streak),
      level_milestone: this.getNextLevelMilestone(student.level)
    };
  }

  async getRecentAchievements(studentIds) {
    const recentAchievements = [];
    
    for (const studentId of studentIds) {
      const student = await StudentService.getStudent(studentId);
      
      // Add recent badges
      student.badges
        .filter(badge => this.isRecent(badge.earned_at))
        .forEach(badge => {
          recentAchievements.push({
            student_id: studentId,
            student_name: `${student.first_name} ${student.last_name}`,
            type: 'badge',
            title: badge.name,
            description: badge.description,
            earned_at: badge.earned_at
          });
        });
    }
    
    return recentAchievements.sort((a, b) => new Date(b.earned_at) - new Date(a.earned_at)).slice(0, 10);
  }

  // Helper methods for analytics data
  async analyzeLearningPatterns(studentIds, timeRange) {
    return {
      optimal_learning_times: await this.findOptimalLearningTimes(studentIds, timeRange),
      session_duration_patterns: await this.analyzeSessionPatterns(studentIds, timeRange),
      difficulty_preferences: await this.analyzeDifficultyPreferences(studentIds, timeRange),
      subject_preferences: await this.analyzeSubjectPreferences(studentIds, timeRange)
    };
  }

  async generatePredictiveInsights(studentIds) {
    return {
      likely_difficulties: await this.predictFutureDifficulties(studentIds),
      mastery_predictions: await this.predictMasteryTimeline(studentIds),
      engagement_forecast: await this.predictEngagement(studentIds),
      achievement_predictions: await this.predictAchievements(studentIds)
    };
  }

  // Helper methods for alerts
  async generateStudentAlerts(student) {
    const alerts = [];
    
    // Inactivity alert
    if (this.isStudentInactive(student)) {
      alerts.push({
        type: 'inactivity',
        priority: 'high',
        student_id: student.student_id,
        student_name: `${student.first_name} ${student.last_name}`,
        message: 'L\'élève n\'est pas actif depuis plusieurs jours',
        suggested_action: 'Encourager la reprise de l\'apprentissage'
      });
    }
    
    // Declining performance alert
    if (this.isPerformanceDeclining(student)) {
      alerts.push({
        type: 'performance_decline',
        priority: 'medium',
        student_id: student.student_id,
        student_name: `${student.first_name} ${student.last_name}`,
        message: 'Baisse de performance détectée',
        suggested_action: 'Revoir les compétences difficiles'
      });
    }
    
    return alerts;
  }

  // Utility methods
  getTimeRangeCutoff(timeRange) {
    const days = timeRange === 'week' ? 7 : timeRange === 'month' ? 30 : 1;
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }

  getSkillCategory(skillId) {
    // This would map skills to categories
    const categories = {
      'counting': 'numbers',
      'addition': 'operations',
      'subtraction': 'operations',
      'multiplication': 'operations',
      'division': 'operations'
    };
    return categories[skillId] || 'other';
  }

  getSkillSubject(skillId) {
    // This would map skills to subjects
    return 'math'; // Simplified
  }

  isRecent(timestamp) {
    const days = 7;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return new Date(timestamp) >= cutoff;
  }

  // Placeholder implementations for complex analytics
  calculatePerformanceScore(student) {
    return student.xp + (student.coins * 0.5) + (student.streak * 10);
  }

  getStudentHighlights(student) {
    const highlights = [];
    if (student.streak >= 7) highlights.push('Série impressionnante');
    if (student.level >= 10) highlights.push('Niveau avancé');
    if (student.calculateRecentAccuracy() >= 0.8) highlights.push('Précision excellente');
    return highlights;
  }

  calculateAttentionPriority(student, weakSkills) {
    return weakSkills.reduce((sum, skill) => sum + (1 - skill.mastery), 0);
  }

  getSuggestedActions(weakSkills) {
    return ['Pratiquer les bases', 'Utiliser le tuteur IA', 'Faire un diagnostic'];
  }

  isStudentInactive(student) {
    if (!student.stats.last_active) return true;
    const daysSinceActive = Math.floor((Date.now() - new Date(student.stats.last_active)) / (24 * 60 * 60 * 1000));
    return daysSinceActive > 7;
  }

  isPerformanceDeclining(student) {
    // This would analyze recent performance trends
    return false;
  }

  // Additional placeholder methods
  async calculateExerciseTrend(students, timeRange) { return { trend: 'stable', change: 0 }; }
  async calculateAccuracyTrend(students, timeRange) { return { trend: 'improving', change: 5 }; }
  async calculateEngagementTrend(students, timeRange) { return { trend: 'stable', change: 0 }; }
  async calculateSkillProgressionTrend(students, timeRange) { return { trend: 'improving', change: 10 }; }
  getNextStreakMilestone(streak) { return { next: 10, current: streak, progress: streak / 10 }; }
  getNextSkillMilestones(student) { return []; }
  estimateGradeLevel(level) { return 'CE2'; }
  calculateProgressionRate(student) { return 0.1; }
  getNextGradeTarget(student) { return 'CM1'; }
  getNextAccuracyMilestone(accuracy) { return { next: 90, current: accuracy * 100 }; }
  getNextLevelMilestone(level) { return { next: 10, current: level }; }
  calculateSavingEfficiency(student) { return 0.8; }
  getSpendingPatterns(studentId, tenantId) { return {}; }
  getCategoryPreferences(studentId, tenantId) { return {}; }
  getSavingsGoals(student) { return { goal: 1000, current: student.coins }; }
  async analyzeSessionPatterns(studentIds, timeRange) { return {}; }
  async analyzeDifficultyPreferences(studentIds, timeRange) { return {}; }
  async analyzeSubjectPreferences(studentIds, timeRange) { return {}; }
  async findOptimalLearningTimes(studentIds, timeRange) { return { best_times: ['16:00-18:00'] }; }
  async calculatePerformanceMetrics(studentIds, timeRange) { return {}; }
  async analyzeEngagement(studentIds, timeRange) { return {}; }
  async getBenchmarkComparisons(studentIds) { return {}; }
  async calculateROI(studentIds, timeRange) { return { roi: 2.5 }; }
  async predictFutureDifficulties(studentIds) { return []; }
  async predictMasteryTimeline(studentIds) { return {}; }
  async predictEngagement(studentIds) { return {}; }
  async predictAchievements(studentIds) { return []; }
  async getImmediateActions(studentIds) { return []; }
  async getLongTermStrategies(studentIds) { return []; }
  async getLearningOptimizations(studentIds) { return []; }
  async getMotivationalStrategies(studentIds) { return []; }
  async getResourceRecommendations(studentIds) { return []; }
}

module.exports = new ParentDashboardService();
