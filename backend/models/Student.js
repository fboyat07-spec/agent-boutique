const { v4: uuidv4 } = require('uuid');

/**
 * Student Profile Model
 * Represents a child's learning profile with adaptive capabilities
 */
class Student {
  constructor(data = {}) {
    this.student_id = data.student_id || uuidv4();
    this.tenant_id = data.tenant_id || '';
    this.first_name = data.first_name || '';
    this.last_name = data.last_name || '';
    this.email = data.email || null;
    this.age = data.age || 6;
    this.grade = data.grade || 'CP'; // CP, CE1, CE2, CM1, CM2, 6e
    this.avatar = data.avatar || 'default';
    this.parent_id = data.parent_id || null;
    this.teacher_id = data.teacher_id || null;
    this.class_id = data.class_id || null;
    
    // Learning Profile
    this.level_estimated = data.level_estimated || this.getDefaultLevelForGrade();
    this.mastery = data.mastery || {};
    this.history = data.history || [];
    this.sessions = data.sessions || [];
    
    // Gamification
    this.xp = data.xp || 0;
    this.coins = data.coins || 0;
    this.level = data.level || 1;
    this.streak = data.streak || 0;
    this.badges = data.badges || [];
    this.achievements = data.achievements || [];
    
    // Learning Preferences
    this.preferences = data.preferences || {
      learning_style: 'visual', // 'visual' | 'auditory' | 'kinesthetic'
      difficulty_preference: 'adaptive', // 'easy' | 'medium' | 'hard' | 'adaptive'
      session_length: 20, // minutes
      favorite_subjects: [],
      voice_enabled: true,
      animations: true,
      sound_effects: true
    };
    
    // Progress Tracking
    this.goals = data.goals || {
      weekly_exercises: 10,
      daily_streak: 5,
      xp_target: 100
    };
    
    this.stats = data.stats || {
      total_exercises: 0,
      correct_answers: 0,
      total_time: 0, // minutes
      average_session_time: 0,
      last_active: null,
      created_at: data.created_at || new Date().toISOString(),
      updated_at: data.updated_at || new Date().toISOString()
    };
    
    this.status = data.status || 'active'; // 'active' | 'inactive' | 'archived'
  }

  getDefaultLevelForGrade() {
    const gradeLevels = {
      'CP': 0.1,
      'CE1': 0.2,
      'CE2': 0.3,
      'CM1': 0.4,
      'CM2': 0.5,
      '6e': 0.6
    };
    return gradeLevels[this.grade] || 0.1;
  }

  initializeMastery() {
    const baseSkills = {
      'counting': 0.8,
      'addition': 0.6,
      'subtraction': 0.4,
      'multiplication': 0.2,
      'division': 0.1,
      'fractions': 0.05,
      'geometry': 0.3,
      'measurement': 0.3,
      'time': 0.4,
      'money': 0.3
    };

    // Adjust based on grade
    const gradeMultiplier = {
      'CP': 0.5,
      'CE1': 0.6,
      'CE2': 0.7,
      'CM1': 0.8,
      'CM2': 0.9,
      '6e': 1.0
    };

    const multiplier = gradeMultiplier[this.grade] || 0.5;
    
    Object.keys(baseSkills).forEach(skill => {
      this.mastery[skill] = Math.min(1.0, baseSkills[skill] * multiplier);
    });
  }

  updateMastery(skill, success, difficulty = 0.5) {
    if (!this.mastery[skill]) this.mastery[skill] = 0.1;
    
    const currentMastery = this.mastery[skill];
    const learningRate = 0.1 * (1 - difficulty); // Learn faster on easier problems
    
    if (success) {
      // Success increases mastery, with diminishing returns
      const increase = learningRate * (1 - currentMastery);
      this.mastery[skill] = Math.min(1.0, currentMastery + increase);
    } else {
      // Failure decreases mastery slightly
      const decrease = learningRate * 0.2;
      this.mastery[skill] = Math.max(0.0, currentMastery - decrease);
    }
    
    this.stats.updated_at = new Date().toISOString();
  }

  addXP(amount) {
    this.xp += amount;
    
    // Level up every 100 XP
    const newLevel = Math.floor(this.xp / 100) + 1;
    if (newLevel > this.level) {
      this.level = newLevel;
      return { levelUp: true, newLevel };
    }
    
    return { levelUp: false };
  }

  addCoins(amount) {
    this.coins += amount;
    return this.coins;
  }

  spendCoins(amount) {
    if (this.coins >= amount) {
      this.coins -= amount;
      return true;
    }
    return false;
  }

  updateStreak(didExerciseToday) {
    const today = new Date().toDateString();
    const lastActive = this.stats.last_active ? new Date(this.stats.last_active).toDateString() : null;
    
    if (didExerciseToday) {
      if (lastActive === today) {
        // Already exercised today
        return this.streak;
      } else if (lastActive === new Date(Date.now() - 86400000).toDateString()) {
        // Yesterday - continue streak
        this.streak += 1;
      } else {
        // Gap in days - reset streak
        this.streak = 1;
      }
      this.stats.last_active = new Date().toISOString();
    } else if (lastActive !== today && lastActive !== new Date(Date.now() - 86400000).toDateString()) {
      // Missed yesterday - reset streak
      this.streak = 0;
    }
    
    return this.streak;
  }

  addBadge(badge) {
    if (!this.badges.find(b => b.id === badge.id)) {
      this.badges.push({
        ...badge,
        earned_at: new Date().toISOString()
      });
      return true;
    }
    return false;
  }

  getSessionStats() {
    const recentSessions = this.sessions.slice(-10); // Last 10 sessions
    const totalSessionTime = recentSessions.reduce((acc, session) => acc + (session.duration || 0), 0);
    const averageSessionTime = recentSessions.length > 0 ? totalSessionTime / recentSessions.length : 0;
    
    return {
      total_sessions: this.sessions.length,
      average_session_time: Math.round(averageSessionTime),
      recent_accuracy: this.calculateRecentAccuracy(),
      current_streak: this.streak,
      total_xp: this.xp,
      current_level: this.level
    };
  }

  calculateRecentAccuracy() {
    const recentExercises = this.history.slice(-50); // Last 50 exercises
    if (recentExercises.length === 0) return 0;
    
    const correct = recentExercises.filter(ex => ex.correct).length;
    return Math.round((correct / recentExercises.length) * 100);
  }

  getWeakSkills() {
    return Object.entries(this.mastery)
      .filter(([skill, mastery]) => mastery < 0.4)
      .map(([skill, mastery]) => ({ skill, mastery }))
      .sort((a, b) => a.mastery - b.mastery);
  }

  getStrongSkills() {
    return Object.entries(this.mastery)
      .filter(([skill, mastery]) => mastery > 0.7)
      .map(([skill, mastery]) => ({ skill, mastery }))
      .sort((a, b) => b.mastery - a.mastery);
  }

  toJSON() {
    return {
      student_id: this.student_id,
      tenant_id: this.tenant_id,
      first_name: this.first_name,
      last_name: this.last_name,
      email: this.email,
      age: this.age,
      grade: this.grade,
      avatar: this.avatar,
      parent_id: this.parent_id,
      teacher_id: this.teacher_id,
      class_id: this.class_id,
      level_estimated: this.level_estimated,
      mastery: this.mastery,
      history: this.history,
      sessions: this.sessions,
      xp: this.xp,
      coins: this.coins,
      level: this.level,
      streak: this.streak,
      badges: this.badges,
      achievements: this.achievements,
      preferences: this.preferences,
      goals: this.goals,
      stats: this.stats,
      status: this.status
    };
  }

  static fromJSON(data) {
    return new Student(data);
  }
}

module.exports = Student;
