const StudentService = require('./StudentService');
const { v4: uuidv4 } = require('uuid');

/**
 * Comprehensive Gamification Service
 * Manages XP, levels, coins, badges, achievements, and rewards
 */
class GamificationService {
  constructor() {
    this.xpPerLevel = 100;
    this.streakBonuses = {
      3: { coins: 10, xp: 5 },
      7: { coins: 25, xp: 15 },
      14: { coins: 50, xp: 30 },
      30: { coins: 100, xp: 75 }
    };
    this.badges = this.initializeBadges();
    this.achievements = this.initializeAchievements();
    this.challenges = this.initializeChallenges();
  }

  initializeBadges() {
    return {
      // Milestone badges
      first_exercise: {
        id: 'first_exercise',
        name: 'Premier Pas',
        description: 'Compléter ton premier exercice',
        icon: 'baby',
        rarity: 'common',
        xp_reward: 10,
        coin_reward: 5
      },
      level_5: {
        id: 'level_5',
        name: 'Apprenti',
        description: 'Atteindre le niveau 5',
        icon: 'graduation_cap',
        rarity: 'common',
        xp_reward: 50,
        coin_reward: 25
      },
      level_10: {
        id: 'level_10',
        name: 'Expert',
        description: 'Atteindre le niveau 10',
        icon: 'star',
        rarity: 'rare',
        xp_reward: 100,
        coin_reward: 50
      },
      level_25: {
        id: 'level_25',
        name: 'Maître',
        description: 'Atteindre le niveau 25',
        icon: 'crown',
        rarity: 'epic',
        xp_reward: 250,
        coin_reward: 125
      },
      
      // Skill mastery badges
      counting_master: {
        id: 'counting_master',
        name: 'Maître Compteur',
        description: 'Maîtriser la compétence compter',
        icon: '123',
        rarity: 'rare',
        xp_reward: 75,
        coin_reward: 40
      },
      addition_master: {
        id: 'addition_master',
        name: 'Addition Expert',
        description: 'Maîtriser l\'addition',
        icon: 'plus',
        rarity: 'rare',
        xp_reward: 75,
        coin_reward: 40
      },
      multiplication_master: {
        id: 'multiplication_master',
        name: 'Multiplication Génie',
        description: 'Maîtriser la multiplication',
        icon: 'times',
        rarity: 'epic',
        xp_reward: 150,
        coin_reward: 75
      },
      
      // Streak badges
      streak_3: {
        id: 'streak_3',
        name: 'Persévérant',
        description: '3 jours d\'affilée',
        icon: 'fire',
        rarity: 'common',
        xp_reward: 15,
        coin_reward: 10
      },
      streak_7: {
        id: 'streak_7',
        name: 'Déterminé',
        description: 'Une semaine d\'affilée',
        icon: 'calendar_check',
        rarity: 'rare',
        xp_reward: 50,
        coin_reward: 25
      },
      streak_30: {
        id: 'streak_30',
        name: 'Inflexible',
        description: '30 jours d\'affilée',
        icon: 'medal',
        rarity: 'epic',
        xp_reward: 200,
        coin_reward: 100
      },
      
      // Performance badges
      perfect_10: {
        id: 'perfect_10',
        name: 'Perfection',
        description: '10 exercices parfaits d\'affilée',
        icon: 'target',
        rarity: 'rare',
        xp_reward: 60,
        coin_reward: 30
      },
      speed_demon: {
        id: 'speed_demon',
        name: 'Éclair',
        description: 'Compléter 5 exercices en moins de 2 minutes chacun',
        icon: 'lightning',
        rarity: 'uncommon',
        xp_reward: 40,
        coin_reward: 20
      },
      explorer: {
        id: 'explorer',
        name: 'Explorateur',
        description: 'Essayer 10 compétences différentes',
        icon: 'compass',
        rarity: 'uncommon',
        xp_reward: 30,
        coin_reward: 15
      }
    };
  }

  initializeAchievements() {
    return {
      // Daily achievements
      daily_exerciser: {
        id: 'daily_exerciser',
        name: 'Exercice Quotidien',
        description: 'Faire au moins 5 exercices dans la journée',
        type: 'daily',
        xp_reward: 20,
        coin_reward: 10,
        requirements: { exercises_completed: 5, timeframe: 'daily' }
      },
      daily_perfect: {
        id: 'daily_perfect',
        name: 'Journée Parfaite',
        description: 'Avoir 100% de réussite aujourd\'hui',
        type: 'daily',
        xp_reward: 40,
        coin_reward: 20,
        requirements: { accuracy: 1.0, timeframe: 'daily' }
      },
      
      // Weekly achievements
      weekly_warrior: {
        id: 'weekly_warrior',
        name: 'Guerrier de la Semaine',
        description: 'Faire 50 exercices dans la semaine',
        type: 'weekly',
        xp_reward: 100,
        coin_reward: 50,
        requirements: { exercises_completed: 50, timeframe: 'weekly' }
      },
      streak_keeper: {
        id: 'streak_keeper',
        name: 'Gardien de Séries',
        description: 'Maintenir une série de 7 jours',
        type: 'weekly',
        xp_reward: 75,
        coin_reward: 40,
        requirements: { streak_days: 7, timeframe: 'weekly' }
      },
      
      // Skill achievements
      skill_collector: {
        id: 'skill_collector',
        name: 'Collectionneur',
        description: 'Maîtriser 5 compétences différentes',
        type: 'progressive',
        xp_reward: 150,
        coin_reward: 75,
        requirements: { skills_mastered: 5 }
      },
      polymath: {
        id: 'polymath',
        name: 'Polytechnicien',
        description: 'Maîtriser une compétence dans chaque catégorie',
        type: 'progressive',
        xp_reward: 300,
        coin_reward: 150,
        requirements: { categories_mastered: 'all' }
      }
    };
  }

  initializeChallenges() {
    return {
      // Daily challenges
      daily: {
        id: 'daily_challenge',
        name: 'Défi Quotidien',
        description: 'Relève le défi du jour',
        type: 'daily',
        difficulty: 'medium',
        xp_reward: 50,
        coin_reward: 25,
        time_limit: 24 * 60 * 60 * 1000, // 24 hours
        requirements: this.generateDailyChallenge()
      },
      
      // Weekly challenges
      weekly: {
        id: 'weekly_challenge',
        name: 'Défi de la Semaine',
        description: 'Défi spécial de la semaine',
        type: 'weekly',
        difficulty: 'hard',
        xp_reward: 200,
        coin_reward: 100,
        time_limit: 7 * 24 * 60 * 60 * 1000, // 7 days
        requirements: this.generateWeeklyChallenge()
      },
      
      // Special challenges
      speed_challenge: {
        id: 'speed_challenge',
        name: 'Défi Vitesse',
        description: 'Compléter le plus d\'exercices possibles en 10 minutes',
        type: 'special',
        difficulty: 'hard',
        xp_reward: 100,
        coin_reward: 50,
        time_limit: 10 * 60 * 1000, // 10 minutes
        requirements: { max_exercises: 20, time_limit: 600 }
      },
      
      accuracy_challenge: {
        id: 'accuracy_challenge',
        name: 'Défi Précision',
        description: 'Atteindre 95% de précision sur 15 exercices',
        type: 'special',
        difficulty: 'hard',
        xp_reward: 120,
        coin_reward: 60,
        requirements: { exercises: 15, min_accuracy: 0.95 }
      }
    };
  }

  async awardExerciseRewards(studentId, exerciseData) {
    try {
      const student = await StudentService.getStudent(studentId);
      const rewards = {
        xp: 0,
        coins: 0,
        badges: [],
        achievements: [],
        level_up: false,
        new_level: null,
        streak_bonus: null
      };

      // Base XP and coins from exercise
      const baseXP = exerciseData.xp_earned || 10;
      const baseCoins = exerciseData.coins_earned || 5;
      
      // Calculate adaptive rewards
      const adaptiveRewards = this.calculateAdaptiveRewards(student, exerciseData);
      
      rewards.xp = baseXP + adaptiveRewards.bonus_xp;
      rewards.coins = baseCoins + adaptiveRewards.bonus_coins;
      
      // Award XP and check for level up
      const xpResult = student.addXP(rewards.xp);
      if (xpResult.levelUp) {
        rewards.level_up = true;
        rewards.new_level = xpResult.newLevel;
        rewards.xp += 50; // Level up bonus
        rewards.coins += 25;
      }
      
      // Award coins
      student.addCoins(rewards.coins);
      
      // Update streak and check for streak bonuses
      const newStreak = student.updateStreak(true);
      const streakBonus = this.checkStreakBonus(newStreak);
      if (streakBonus) {
        rewards.streak_bonus = streakBonus;
        student.addXP(streakBonus.xp);
        student.addCoins(streakBonus.coins);
        rewards.xp += streakBonus.xp;
        rewards.coins += streakBonus.coins;
      }
      
      // Check for new badges
      const newBadges = this.checkForBadges(student, exerciseData);
      newBadges.forEach(badge => {
        student.addBadge(badge);
        rewards.badges.push(badge);
        rewards.xp += badge.xp_reward || 0;
        rewards.coins += badge.coin_reward || 0;
      });
      
      // Check for achievements
      const newAchievements = this.checkForAchievements(student);
      newAchievements.forEach(achievement => {
        rewards.achievements.push(achievement);
        rewards.xp += achievement.xp_reward || 0;
        rewards.coins += achievement.coin_reward || 0;
      });
      
      return rewards;
    } catch (error) {
      throw new Error(`Erreur attribution récompenses: ${error.message}`);
    }
  }

  calculateAdaptiveRewards(student, exerciseData) {
    let bonusXP = 0;
    let bonusCoins = 0;
    
    // Difficulty bonus
    const difficultyMultiplier = {
      easy: 1,
      medium: 1.5,
      hard: 2
    };
    const difficultyBonus = (difficultyMultiplier[exerciseData.difficulty] || 1) - 1;
    bonusXP += Math.round(10 * difficultyBonus);
    bonusCoins += Math.round(5 * difficultyBonus);
    
    // Streak bonus
    if (student.streak >= 3) {
      bonusXP += Math.round(student.streak * 0.5);
      bonusCoins += Math.round(student.streak * 0.25);
    }
    
    // Speed bonus
    if (exerciseData.time_taken && exerciseData.time_taken < 60) { // Less than 1 minute
      bonusXP += 5;
      bonusCoins += 3;
    }
    
    // Perfect streak bonus
    const recentExercises = student.history.slice(-5);
    const allPerfect = recentExercises.length >= 5 && 
                     recentExercises.every(ex => ex.correct);
    if (allPerfect) {
      bonusXP += 15;
      bonusCoins += 8;
    }
    
    // First time skill bonus
    const skillHistory = student.history.filter(ex => ex.skill === exerciseData.skill);
    if (skillHistory.length === 1) { // First time trying this skill
      bonusXP += 8;
      bonusCoins += 4;
    }
    
    return {
      bonus_xp: bonusXP,
      bonus_coins: bonusCoins
    };
  }

  checkStreakBonus(streak) {
    return this.streakBonuses[streak] || null;
  }

  checkForBadges(student, exerciseData) {
    const newBadges = [];
    
    // First exercise badge
    if (student.stats.total_exercises === 1) {
      newBadges.push(this.badges.first_exercise);
    }
    
    // Level badges
    [5, 10, 25].forEach(level => {
      if (student.level === level && !student.badges.find(b => b.id === `level_${level}`)) {
        newBadges.push(this.badges[`level_${level}`]);
      }
    });
    
    // Streak badges
    [3, 7, 30].forEach(streak => {
      if (student.streak === streak && !student.badges.find(b => b.id === `streak_${streak}`)) {
        newBadges.push(this.badges[`streak_${streak}`]);
      }
    });
    
    // Skill mastery badges
    if (exerciseData.skill && student.mastery[exerciseData.skill] >= 0.8) {
      const masteryBadge = this.badges[`${exerciseData.skill}_master`];
      if (masteryBadge && !student.badges.find(b => b.id === masteryBadge.id)) {
        newBadges.push(masteryBadge);
      }
    }
    
    // Performance badges
    const recentExercises = student.history.slice(-10);
    const perfectStreak = recentExercises.filter(ex => ex.correct).length;
    if (perfectStreak === 10 && !student.badges.find(b => b.id === 'perfect_10')) {
      newBadges.push(this.badges.perfect_10);
    }
    
    // Speed badge
    const recentFastExercises = recentExercises.filter(ex => (ex.time_taken || 0) < 120);
    if (recentFastExercises.length >= 5 && !student.badges.find(b => b.id === 'speed_demon')) {
      newBadges.push(this.badges.speed_demon);
    }
    
    // Explorer badge
    const uniqueSkills = [...new Set(student.history.map(ex => ex.skill))];
    if (uniqueSkills.length >= 10 && !student.badges.find(b => b.id === 'explorer')) {
      newBadges.push(this.badges.explorer);
    }
    
    return newBadges;
  }

  checkForAchievements(student) {
    const newAchievements = [];
    const today = new Date().toDateString();
    const thisWeek = this.getWeekStart(new Date());
    
    // Daily achievements
    const todayExercises = student.history.filter(ex => 
      new Date(ex.timestamp).toDateString() === today
    );
    
    if (todayExercises.length >= 5) {
      const achievement = this.achievements.daily_exerciser;
      if (!student.achievements.find(a => a.id === achievement.id)) {
        newAchievements.push(achievement);
      }
    }
    
    const todayAccuracy = todayExercises.length > 0 ? 
      todayExercises.filter(ex => ex.correct).length / todayExercises.length : 0;
    if (todayAccuracy === 1.0 && todayExercises.length >= 3) {
      const achievement = this.achievements.daily_perfect;
      if (!student.achievements.find(a => a.id === achievement.id)) {
        newAchievements.push(achievement);
      }
    }
    
    // Weekly achievements
    const weekExercises = student.history.filter(ex => 
      new Date(ex.timestamp) >= thisWeek
    );
    
    if (weekExercises.length >= 50) {
      const achievement = this.achievements.weekly_warrior;
      if (!student.achievements.find(a => a.id === achievement.id)) {
        newAchievements.push(achievement);
      }
    }
    
    if (student.streak >= 7) {
      const achievement = this.achievements.streak_keeper;
      if (!student.achievements.find(a => a.id === achievement.id)) {
        newAchievements.push(achievement);
      }
    }
    
    // Progressive achievements
    const masteredSkills = Object.entries(student.mastery)
      .filter(([skill, mastery]) => mastery >= 0.8)
      .map(([skill]) => skill);
    
    if (masteredSkills.length >= 5) {
      const achievement = this.achievements.skill_collector;
      if (!student.achievements.find(a => a.id === achievement.id)) {
        newAchievements.push(achievement);
      }
    }
    
    return newAchievements;
  }

  generateDailyChallenge() {
    const challenges = [
      { exercises: 10, skill_focus: 'addition', min_accuracy: 0.8 },
      { exercises: 8, skill_focus: 'multiplication', min_accuracy: 0.7 },
      { exercises: 12, skill_focus: 'mixed', time_limit: 1800 }, // 30 minutes
      { exercises: 15, min_accuracy: 0.85, bonus_for_speed: true }
    ];
    
    return challenges[Math.floor(Math.random() * challenges.length)];
  }

  generateWeeklyChallenge() {
    const challenges = [
      { exercises: 100, skill_focus: 'all', min_accuracy: 0.75 },
      { skills_mastered: 3, categories: ['operations', 'numbers'] },
      { streak_days: 5, daily_exercises: 10 },
      { xp_target: 500, accuracy_min: 0.8 }
    ];
    
    return challenges[Math.floor(Math.random() * challenges.length)];
  }

  async getLeaderboard(studentId, type = 'weekly', limit = 10) {
    try {
      // This would typically query database for all students
      // For now, return a mock leaderboard
      const mockLeaderboard = [
        { rank: 1, student_name: 'Alex', xp: 1250, level: 12, badges: 15 },
        { rank: 2, student_name: 'Emma', xp: 1180, level: 11, badges: 13 },
        { rank: 3, student_name: 'Lucas', xp: 950, level: 9, badges: 11 },
        { rank: 4, student_name: 'Chloé', xp: 890, level: 8, badges: 10 },
        { rank: 5, student_name: 'Mathis', xp: 750, level: 7, badges: 9 }
      ];
      
      return {
        type,
        period: this.getLeaderboardPeriod(type),
        entries: mockLeaderboard.slice(0, limit),
        student_rank: this.findStudentRank(studentId, mockLeaderboard)
      };
    } catch (error) {
      throw new Error(`Erreur classement: ${error.message}`);
    }
  }

  getLeaderboardPeriod(type) {
    switch (type) {
      case 'daily': return 'Aujourd\'hui';
      case 'weekly': return 'Cette semaine';
      case 'monthly': return 'Ce mois';
      case 'all_time': return 'Tous le temps';
      default: return 'Cette semaine';
    }
  }

  findStudentRank(studentId, leaderboard) {
    // This would find the actual student rank
    return { rank: 8, total_students: 25 };
  }

  async getStudentGamificationProfile(studentId) {
    try {
      const student = await StudentService.getStudent(studentId);
      
      return {
        student_id: studentId,
        student_name: `${student.first_name} ${student.last_name}`,
        level: student.level,
        xp: student.xp,
        xp_to_next_level: (student.level * this.xpPerLevel) - student.xp,
        coins: student.coins,
        streak: student.streak,
        badges: student.badges,
        achievements: student.achievements,
        stats: {
          total_exercises: student.stats.total_exercises,
          accuracy: student.calculateRecentAccuracy(),
          total_badges: student.badges.length,
          total_achievements: student.achievements.length,
          current_level_progress: (student.xp % this.xpPerLevel) / this.xpPerLevel
        },
        recent_activity: this.getRecentActivity(student),
        next_milestones: this.getNextMilestones(student)
      };
    } catch (error) {
      throw new Error(`Erreur profil gamification: ${error.message}`);
    }
  }

  getRecentActivity(student) {
    const recentHistory = student.history.slice(-10);
    
    return recentHistory.map(exercise => ({
      timestamp: exercise.timestamp,
      skill: exercise.skill,
      correct: exercise.correct,
      xp_earned: exercise.xp_earned || 0,
      coins_earned: exercise.coins_earned || 0,
      difficulty: exercise.difficulty
    }));
  }

  getNextMilestones(student) {
    return {
      next_level: {
        level: student.level + 1,
        xp_needed: (student.level * this.xpPerLevel) - student.xp,
        progress: (student.xp % this.xpPerLevel) / this.xpPerLevel
      },
      next_badges: this.getNextBadges(student),
      next_achievements: this.getNextAchievements(student)
    };
  }

  getNextBadges(student) {
    const nextBadges = [];
    
    // Check upcoming level badges
    const upcomingLevels = [5, 10, 25].filter(level => level > student.level);
    if (upcomingLevels.length > 0) {
      const nextLevel = upcomingLevels[0];
      nextBadges.push({
        badge: this.badges[`level_${nextLevel}`],
        progress: (student.xp % this.xpPerLevel) / this.xpPerLevel,
        description: `Niveau ${nextLevel} - ${(nextLevel * this.xpPerLevel) - student.xp} XP restants`
      });
    }
    
    // Check upcoming streak badges
    const upcomingStreaks = [3, 7, 30].filter(streak => streak > student.streak);
    if (upcomingStreaks.length > 0) {
      const nextStreak = upcomingStreaks[0];
      nextBadges.push({
        badge: this.badges[`streak_${nextStreak}`],
        progress: student.streak / nextStreak,
        description: `Série de ${nextStreak} jours - ${nextStreak - student.streak} jours restants`
      });
    }
    
    return nextBadges;
  }

  getNextAchievements(student) {
    const nextAchievements = [];
    
    // Daily exerciser
    const today = new Date().toDateString();
    const todayExercises = student.history.filter(ex => 
      new Date(ex.timestamp).toDateString() === today
    );
    
    if (todayExercises.length < 5) {
      nextAchievements.push({
        achievement: this.achievements.daily_exerciser,
        progress: todayExercises.length / 5,
        description: `${5 - todayExercises.length} exercices restants aujourd'hui`
      });
    }
    
    return nextAchievements;
  }

  async spendCoins(studentId, amount, item) {
    try {
      const student = await StudentService.getStudent(studentId);
      
      if (student.coins < amount) {
        throw new Error('Pièces insuffisantes');
      }
      
      if (student.spendCoins(amount)) {
        return {
          success: true,
          coins_spent: amount,
          coins_remaining: student.coins,
          item_purchased: item
        };
      }
      
      throw new Error('Erreur dépense pièces');
    } catch (error) {
      throw new Error(`Erreur dépense pièces: ${error.message}`);
    }
  }

  // Utility methods
  getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  }

  async updateChallengeProgress(studentId, challengeId, progress) {
    // This would update challenge progress in database
    return { success: true, progress };
  }

  async getActiveChallenges(studentId) {
    // This would get active challenges for student
    return {
      daily: this.challenges.daily,
      weekly: this.challenges.weekly,
      special: [this.challenges.speed_challenge, this.challenges.accuracy_challenge]
    };
  }
}

module.exports = new GamificationService();
