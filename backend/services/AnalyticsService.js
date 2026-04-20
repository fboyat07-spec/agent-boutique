const StudentService = require('./StudentService');
const TenantService = require('./TenantService');
const { v4: uuidv4 } = require('uuid');

/**
 * Data Analytics and Reporting Service
 * Provides comprehensive analytics for all stakeholders
 */
class AnalyticsService {
  constructor() {
    this.reportTypes = {
      daily: { name: 'Rapport quotidien', period: 24 * 60 * 60 * 1000 },
      weekly: { name: 'Rapport hebdomadaire', period: 7 * 24 * 60 * 60 * 1000 },
      monthly: { name: 'Rapport mensuel', period: 30 * 24 * 60 * 60 * 1000 },
      quarterly: { name: 'Rapport trimestriel', period: 90 * 24 * 60 * 60 * 1000 },
      yearly: { name: 'Rapport annuel', period: 365 * 24 * 60 * 60 * 1000 }
    };

    this.metrics = {
      engagement: ['sessions', 'time_spent', 'exercises_completed', 'streak_days'],
      performance: ['accuracy', 'mastery_improvement', 'skill_progression', 'learning_velocity'],
      gamification: ['xp_earned', 'coins_earned', 'badges_collected', 'challenges_completed'],
      social: ['friends_added', 'invites_sent', 'challenges_participated', 'leaderboard_rank']
    };
  }

  async generateStudentReport(studentId, reportType = 'weekly', options = {}) {
    try {
      const student = await StudentService.getStudent(studentId);
      const period = this.reportTypes[reportType];
      
      const report = {
        report_id: uuidv4(),
        student_id: studentId,
        type: reportType,
        period: period.name,
        generated_at: new Date().toISOString(),
        date_range: this.getDateRange(reportType),
        student_info: {
          name: `${student.first_name} ${student.last_name}`,
          grade: student.grade,
          age: student.age,
          level: student.level,
          current_xp: student.xp,
          current_coins: student.coins,
          current_streak: student.streak
        },
        executive_summary: await this.generateExecutiveSummary(student, reportType),
        detailed_metrics: await this.getDetailedMetrics(student, reportType),
        skill_analysis: await this.getSkillAnalysis(student, reportType),
        learning_patterns: await this.getLearningPatterns(student, reportType),
        recommendations: await this.getStudentRecommendations(student, reportType),
        achievements: await this.getAchievementSummary(student, reportType),
        comparative_analysis: await this.getComparativeAnalysis(student, reportType)
      };

      return report;
    } catch (error) {
      throw new Error(`Erreur génération rapport étudiant: ${error.message}`);
    }
  }

  async generateParentReport(parentUserId, tenantId, reportType = 'weekly', options = {}) {
    try {
      const students = await StudentService.getStudentsByTenant(tenantId);
      const period = this.reportTypes[reportType];
      
      const report = {
        report_id: uuidv4(),
        parent_id: parentUserId,
        tenant_id: tenantId,
        type: reportType,
        period: period.name,
        generated_at: new Date().toISOString(),
        date_range: this.getDateRange(reportType),
        family_overview: await this.getFamilyOverview(students, reportType),
        individual_reports: await Promise.all(
          students.map(student => this.generateStudentReport(student.student_id, reportType, options))
        ),
        comparative_insights: await this.getFamilyComparativeInsights(students, reportType),
        engagement_analysis: await this.getFamilyEngagementAnalysis(students, reportType),
        recommendations: await this.getParentRecommendations(students, reportType),
        progress_trends: await this.getFamilyProgressTrends(students, reportType),
        reward_analysis: await this.getFamilyRewardAnalysis(students, reportType)
      };

      return report;
    } catch (error) {
      throw new Error(`Erreur génération rapport parent: ${error.message}`);
    }
  }

  async generateSchoolReport(tenantId, reportType = 'monthly', options = {}) {
    try {
      const tenant = await TenantService.getTenant(tenantId);
      const students = await StudentService.getStudentsByTenant(tenantId);
      const period = this.reportTypes[reportType];
      
      const report = {
        report_id: uuidv4(),
        tenant_id: tenantId,
        type: reportType,
        period: period.name,
        generated_at: new Date().toISOString(),
        date_range: this.getDateRange(reportType),
        school_info: {
          name: tenant.name,
          total_students: students.length,
          subscription_plan: tenant.subscription.plan,
          active_students: this.countActiveStudents(students)
        },
        executive_summary: await this.getSchoolExecutiveSummary(students, reportType),
        performance_metrics: await this.getSchoolPerformanceMetrics(students, reportType),
        engagement_metrics: await this.getSchoolEngagementMetrics(students, reportType),
        skill_mastery_analysis: await this.getSchoolSkillAnalysis(students, reportType),
        teacher_effectiveness: await this.getTeacherEffectiveness(tenantId, reportType),
        class_performance: await this.getClassPerformanceAnalysis(tenantId, reportType),
        roi_analysis: await this.getSchoolROIAnalysis(tenant, students, reportType),
        recommendations: await this.getSchoolRecommendations(tenant, students, reportType),
        benchmark_comparison: await this.getBenchmarkComparison(students, reportType)
      };

      return report;
    } catch (error) {
      throw new Error(`Erreur génération rapport école: ${error.message}`);
    }
  }

  async getRealTimeAnalytics(tenantId, timeRange = 'hour') {
    try {
      const students = await StudentService.getStudentsByTenant(tenantId);
      
      const analytics = {
        tenant_id: tenantId,
        time_range: timeRange,
        timestamp: new Date().toISOString(),
        live_metrics: {
          active_users: this.countActiveUsers(students, timeRange),
          current_sessions: this.getCurrentSessions(students),
          exercises_per_minute: this.getExercisesPerMinute(students, timeRange),
          average_accuracy: this.getCurrentAccuracy(students, timeRange),
          engagement_rate: this.getCurrentEngagementRate(students, timeRange)
        },
        skill_distribution: this.getCurrentSkillDistribution(students),
        difficulty_distribution: this.getCurrentDifficultyDistribution(students),
        performance_trends: this.getCurrentPerformanceTrends(students),
        alerts: await this.getRealTimeAlerts(students),
        predictions: await this.getRealTimePredictions(students)
      };

      return analytics;
    } catch (error) {
      throw new Error(`Erreur analytics temps réel: ${error.message}`);
    }
  }

  async generateCustomReport(tenantId, reportConfig) {
    try {
      const {
        name,
        description,
        metrics,
        filters,
        time_range,
        format,
        recipients
      } = reportConfig;

      const report = {
        report_id: uuidv4(),
        tenant_id: tenantId,
        name,
        description,
        config: reportConfig,
        generated_at: new Date().toISOString(),
        data: await this.getCustomReportData(tenantId, reportConfig),
        visualizations: await this.generateVisualizations(reportConfig),
        insights: await this.generateCustomInsights(tenantId, reportConfig),
        format: format || 'json'
      };

      // Send to recipients if specified
      if (recipients && recipients.length > 0) {
        await this.sendReportToRecipients(report, recipients);
      }

      return report;
    } catch (error) {
      throw new Error(`Erreur rapport personnalisé: ${error.message}`);
    }
  }

  async exportData(tenantId, exportConfig) {
    try {
      const {
        data_types,
        format,
        date_range,
        filters,
        compression
      } = exportConfig;

      const exportData = {
        export_id: uuidv4(),
        tenant_id: tenantId,
        config: exportConfig,
        generated_at: new Date().toISOString(),
        data: await this.getExportData(tenantId, exportConfig),
        metadata: {
          record_count: 0,
          file_size: 0,
          format: format || 'csv',
          compression: compression || false
        }
      };

      // Calculate metadata
      exportData.metadata.record_count = this.countExportRecords(exportData.data);
      exportData.metadata.file_size = this.estimateFileSize(exportData.data, format, compression);

      return exportData;
    } catch (error) {
      throw new Error(`Erreur export données: ${error.message}`);
    }
  }

  // Helper methods for report generation
  getDateRange(reportType) {
    const now = new Date();
    const period = this.reportTypes[reportType].period;
    const start = new Date(now.getTime() - period);
    
    return {
      start: start.toISOString(),
      end: now.toISOString(),
      duration: period
    };
  }

  async generateExecutiveSummary(student, reportType) {
    const recentPerformance = student.calculateRecentAccuracy();
    const weeklyGoal = student.goals?.weekly || { exercises: 50, accuracy: 0.8 };
    
    return {
      overall_performance: recentPerformance >= 0.8 ? 'excellent' : 
                           recentPerformance >= 0.6 ? 'good' : 'needs_improvement',
      key_achievements: [
        `Niveau ${student.level} atteint`,
        `${student.streak} jours de série`,
        `${student.badges.length} badges collectés`
      ],
      areas_for_improvement: this.identifyImprovementAreas(student),
      goal_progress: {
        exercises: student.history.filter(ex => 
          new Date(ex.timestamp) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        ).length,
        target: weeklyGoal.exercises,
        percentage: Math.round((student.history.filter(ex => 
          new Date(ex.timestamp) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        ).length / weeklyGoal.exercises) * 100)
      },
      engagement_level: this.calculateEngagementLevel(student)
    };
  }

  async getDetailedMetrics(student, reportType) {
    const dateRange = this.getDateRange(reportType);
    const relevantHistory = student.history.filter(ex => 
      new Date(ex.timestamp) >= new Date(dateRange.start)
    );

    return {
      engagement: {
        total_sessions: this.countSessions(relevantHistory),
        total_time: relevantHistory.reduce((sum, ex) => sum + (ex.time_taken || 0), 0),
        exercises_completed: relevantHistory.length,
        average_session_time: this.calculateAverageSessionTime(relevantHistory),
        streak_days: student.streak
      },
      performance: {
        average_accuracy: student.calculateRecentAccuracy(),
        mastery_improvement: this.calculateMasteryImprovement(student, dateRange),
        skill_progression: this.calculateSkillProgression(student, dateRange),
        learning_velocity: this.calculateLearningVelocity(student)
      },
      gamification: {
        xp_earned: this.calculateXPEarned(relevantHistory),
        coins_earned: this.calculateCoinsEarned(relevantHistory),
        badges_collected: student.badges.filter(badge => 
          new Date(badge.earned_at) >= new Date(dateRange.start)
        ).length,
        challenges_completed: this.countChallengesCompleted(student, dateRange)
      }
    };
  }

  async getSkillAnalysis(student, reportType) {
    const dateRange = this.getDateRange(reportType);
    
    return {
      current_mastery: student.mastery,
      mastery_trends: this.calculateMasteryTrends(student, dateRange),
      strongest_skills: this.getStrongestSkills(student),
      weakest_skills: this.getWeakestSkills(student),
      skill_progression: this.getSkillProgressionDetails(student, dateRange),
      recommendations: this.getSkillRecommendations(student)
    };
  }

  async getLearningPatterns(student, reportType) {
    const dateRange = this.getDateRange(reportType);
    const relevantHistory = student.history.filter(ex => 
      new Date(ex.timestamp) >= new Date(dateRange.start)
    );

    return {
      optimal_learning_times: this.findOptimalLearningTimes(relevantHistory),
      session_duration_patterns: this.analyzeSessionDurations(relevantHistory),
      difficulty_preferences: this.analyzeDifficultyPreferences(relevantHistory),
      subject_preferences: this.analyzeSubjectPreferences(relevantHistory),
      learning_velocity: this.calculateLearningVelocity(student),
      retention_rates: this.calculateRetentionRates(student, dateRange)
    };
  }

  async getAchievementSummary(student, reportType) {
    const dateRange = this.getDateRange(reportType);
    
    return {
      badges_earned: student.badges.filter(badge => 
        new Date(badge.earned_at) >= new Date(dateRange.start)
      ),
      achievements_completed: student.achievements.filter(achievement => 
        new Date(achievement.timestamp) >= new Date(dateRange.start)
      ),
      milestones_reached: this.getMilestonesReached(student, dateRange),
      ranking_changes: this.getRankingChanges(student, dateRange)
    };
  }

  async getComparativeAnalysis(student, reportType) {
    // This would compare student performance with peers
    return {
      percentile_rankings: {
        overall: 75,
        accuracy: 80,
        engagement: 70,
        progression: 85
      },
      peer_comparisons: {
        similar_students: 12,
        better_performers: 8,
        room_for_improvement: 3
      },
      benchmark_performance: {
        grade_level: 'above_average',
        skill_mastery: 'on_track',
        learning_velocity: 'excellent'
      }
    };
  }

  // Placeholder implementations for complex methods
  identifyImprovementAreas(student) {
    const weakSkills = student.getWeakSkills();
    return weakSkills.slice(0, 3).map(skill => skill.skill_name);
  }

  calculateEngagementLevel(student) {
    const recentActivity = student.history.slice(-7);
    return recentActivity.length >= 5 ? 'high' : 
           recentActivity.length >= 3 ? 'medium' : 'low';
  }

  countSessions(history) {
    // Group exercises by session (assuming exercises within 2 hours are same session)
    return Math.ceil(history.length / 5); // Simplified
  }

  calculateAverageSessionTime(history) {
    if (history.length === 0) return 0;
    const totalTime = history.reduce((sum, ex) => sum + (ex.time_taken || 0), 0);
    return Math.round(totalTime / history.length);
  }

  calculateMasteryImprovement(student, dateRange) {
    // This would calculate mastery improvement over the period
    return 0.15; // 15% improvement
  }

  calculateSkillProgression(student, dateRange) {
    return Object.entries(student.mastery).map(([skill, mastery]) => ({
      skill,
      current_mastery: mastery,
      improvement: mastery * 0.1 // Simplified
    }));
  }

  calculateLearningVelocity(student) {
    return 0.05; // 5% daily improvement rate
  }

  calculateXPEarned(history) {
    return history.reduce((sum, ex) => sum + (ex.xp_earned || 0), 0);
  }

  calculateCoinsEarned(history) {
    return history.reduce((sum, ex) => sum + (ex.coins_earned || 0), 0);
  }

  countChallengesCompleted(student, dateRange) {
    return 0; // Would count challenges completed in period
  }

  calculateMasteryTrends(student, dateRange) {
    return Object.entries(student.mastery).map(([skill, mastery]) => ({
      skill,
      trend: 'improving',
      change: mastery * 0.05
    }));
  }

  getStrongestSkills(student) {
    return student.getStrongSkills().slice(0, 3);
  }

  getWeakestSkills(student) {
    return student.getWeakSkills().slice(0, 3);
  }

  getSkillProgressionDetails(student, dateRange) {
    return {};
  }

  getSkillRecommendations(student) {
    return ['Focus on addition basics', 'Practice counting exercises'];
  }

  findOptimalLearningTimes(history) {
    return ['16:00-18:00', '19:00-20:00'];
  }

  analyzeSessionDurations(history) {
    return { average: 15, peak: 25, minimum: 5 };
  }

  analyzeDifficultyPreferences(history) {
    return { easy: 0.4, medium: 0.5, hard: 0.1 };
  }

  analyzeSubjectPreferences(history) {
    return { mathematics: 0.7, logic: 0.3 };
  }

  calculateRetentionRates(student, dateRange) {
    return 0.85; // 85% retention rate
  }

  getMilestonesReached(student, dateRange) {
    return [];
  }

  getRankingChanges(student, dateRange) {
    return { current: 15, previous: 18, change: 3 };
  }

  // Family analytics methods
  async getFamilyOverview(students, reportType) {
    return {
      total_students: students.length,
      active_students: students.filter(s => s.streak > 0).length,
      average_performance: students.reduce((sum, s) => sum + s.calculateRecentAccuracy(), 0) / students.length,
      total_xp: students.reduce((sum, s) => sum + s.xp, 0),
      total_coins: students.reduce((sum, s) => sum + s.coins, 0),
      combined_streak: students.reduce((sum, s) => sum + s.streak, 0)
    };
  }

  async getFamilyComparativeInsights(students, reportType) {
    return {
      top_performer: students.reduce((best, current) => 
        current.calculateRecentAccuracy() > best.calculateRecentAccuracy() ? current : best
      ),
      most_engaged: students.reduce((most, current) => 
        current.streak > most.streak ? current : most
      ),
      fastest_learner: students[0], // Simplified
      areas_for_family_focus: ['Addition skills', 'Consistency']
    };
  }

  async getFamilyEngagementAnalysis(students, reportType) {
    return {
      daily_active_users: students.filter(s => s.streak > 0).length,
      average_session_time: 18,
      preferred_learning_times: ['After school', 'Evening'],
      family_learning_patterns: 'Individual learning preferred'
    };
  }

  async getParentRecommendations(students, reportType) {
    return [
      'Encourage daily practice for consistency',
      'Set achievable goals for each child',
      'Celebrate small wins to maintain motivation'
    ];
  }

  async getFamilyProgressTrends(students, reportType) {
    return {
      overall_trend: 'improving',
      skill_trends: {},
      engagement_trends: {}
    };
  }

  async getFamilyRewardAnalysis(students, reportType) {
    return {
      total_coins_earned: students.reduce((sum, s) => sum + s.coins, 0),
      rewards_requested: 5,
      rewards_fulfilled: 3,
      popular_reward_categories: ['Activities', 'Privileges']
    };
  }

  // School analytics methods
  async getSchoolExecutiveSummary(students, reportType) {
    return {
      total_students: students.length,
      average_performance: students.reduce((sum, s) => sum + s.calculateRecentAccuracy(), 0) / students.length,
      engagement_rate: students.filter(s => s.streak > 0).length / students.length,
      key_insights: [
        'Strong performance in basic skills',
        'Need improvement in advanced topics',
        'High engagement levels'
      ]
    };
  }

  async getSchoolPerformanceMetrics(students, reportType) {
    return {
      average_accuracy: students.reduce((sum, s) => sum + s.calculateRecentAccuracy(), 0) / students.length,
      mastery_distribution: this.calculateMasteryDistribution(students),
      skill_performance: this.calculateSkillPerformance(students),
      grade_level_performance: this.calculateGradeLevelPerformance(students)
    };
  }

  async getSchoolEngagementMetrics(students, reportType) {
    return {
      daily_active_users: this.countActiveUsers(students, 'daily'),
      weekly_active_users: this.countActiveUsers(students, 'weekly'),
      average_session_time: 20,
      retention_rate: 0.85
    };
  }

  async getSchoolSkillAnalysis(students, reportType) {
    return {
      skill_mastery_levels: this.calculateSkillMasteryLevels(students),
      skill_progression_rates: this.calculateSkillProgressionRates(students),
      skill_difficulty_analysis: this.analyzeSkillDifficulty(students)
    };
  }

  async getTeacherEffectiveness(tenantId, reportType) {
    return {
      average_student_improvement: 0.15,
      engagement_rates: 0.8,
      student_satisfaction: 0.9
    };
  }

  async getClassPerformanceAnalysis(tenantId, reportType) {
    return {
      class_rankings: [],
      performance_variations: {},
      best_performing_class: 'Class A'
    };
  }

  async getSchoolROIAnalysis(tenant, students, reportType) {
    return {
      investment_value: tenant.subscription.price * 12,
      learning_outcomes: 0.85,
      parent_satisfaction: 0.9,
      roi_score: 2.5
    };
  }

  async getSchoolRecommendations(tenant, students, reportType) {
    return [
      'Focus on foundational skills for struggling students',
      'Implement advanced challenges for high performers',
      'Increase parent communication frequency'
    ];
  }

  async getBenchmarkComparison(students, reportType) {
    return {
      national_averages: { accuracy: 0.75, engagement: 0.7 },
      regional_averages: { accuracy: 0.8, engagement: 0.75 },
      school_performance: { accuracy: 0.82, engagement: 0.85 }
    };
  }

  // Real-time analytics methods
  countActiveUsers(students, timeRange) {
    const cutoff = timeRange === 'hour' ? 
      new Date(Date.now() - 60 * 60 * 1000) :
      new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    return students.filter(student => 
      student.stats.last_active && new Date(student.stats.last_active) >= cutoff
    ).length;
  }

  getCurrentSessions(students) {
    return students.filter(student => 
      student.stats.last_active && 
      new Date(student.stats.last_active) >= new Date(Date.now() - 30 * 60 * 1000)
    ).length;
  }

  getExercisesPerMinute(students, timeRange) {
    return 2.5; // Simplified
  }

  getCurrentAccuracy(students, timeRange) {
    return students.reduce((sum, s) => sum + s.calculateRecentAccuracy(), 0) / students.length;
  }

  getCurrentEngagementRate(students, timeRange) {
    return this.countActiveUsers(students, timeRange) / students.length;
  }

  getCurrentSkillDistribution(students) {
    return {
      counting: 0.8,
      addition: 0.7,
      multiplication: 0.4
    };
  }

  getCurrentDifficultyDistribution(students) {
    return { easy: 0.5, medium: 0.4, hard: 0.1 };
  }

  getCurrentPerformanceTrends(students) {
    return { trend: 'stable', change: 0.02 };
  }

  async getRealTimeAlerts(students) {
    return [
      { type: 'low_engagement', student_id: 'student_1', message: 'Inactive for 3 days' }
    ];
  }

  async getRealTimePredictions(students) {
    return {
      likely_churners: [],
      high_potential_students: [],
      intervention_needed: []
    };
  }

  // Utility methods
  countActiveStudents(students) {
    return students.filter(s => s.streak > 0).length;
  }

  calculateMasteryDistribution(students) {
    return { beginner: 0.2, intermediate: 0.5, advanced: 0.3 };
  }

  calculateSkillPerformance(students) {
    return {};
  }

  calculateGradeLevelPerformance(students) {
    return {};
  }

  calculateSkillMasteryLevels(students) {
    return {};
  }

  calculateSkillProgressionRates(students) {
    return {};
  }

  analyzeSkillDifficulty(students) {
    return {};
  }

  // Custom report methods
  async getCustomReportData(tenantId, config) {
    return {};
  }

  async generateVisualizations(config) {
    return [];
  }

  async generateCustomInsights(tenantId, config) {
    return [];
  }

  async sendReportToRecipients(report, recipients) {
    // Implementation for sending reports
  }

  // Export methods
  async getExportData(tenantId, config) {
    return {};
  }

  countExportRecords(data) {
    return Array.isArray(data) ? data.length : 1;
  }

  estimateFileSize(data, format, compression) {
    const size = JSON.stringify(data).length;
    return compression ? size * 0.3 : size;
  }
}

module.exports = new AnalyticsService();
