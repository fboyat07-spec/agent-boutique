const Student = require('../models/Student');
const SkillGraph = require('../models/SkillGraph');
const { v4: uuidv4 } = require('uuid');

/**
 * Student Management Service
 * Handles student profiles, progress tracking, and adaptive learning
 */
class StudentService {
  constructor() {
    this.students = new Map(); // In-memory storage (replace with database in production)
    this.skillGraph = new SkillGraph();
    this.initializeDefaultStudents();
  }

  initializeDefaultStudents() {
    // Create default student for testing
    const defaultStudent = new Student({
      tenant_id: 'default-tenant-id',
      first_name: 'Élève',
      last_name: 'Demo',
      age: 8,
      grade: 'CE2'
    });
    defaultStudent.initializeMastery();
    this.students.set(defaultStudent.student_id, defaultStudent);
  }

  async createStudent(studentData) {
    try {
      const student = new Student(studentData);
      
      // Initialize mastery based on grade
      student.initializeMastery();
      
      this.students.set(student.student_id, student);
      
      return student;
    } catch (error) {
      throw new Error(`Erreur création étudiant: ${error.message}`);
    }
  }

  async getStudent(studentId) {
    const student = this.students.get(studentId);
    if (!student) {
      throw new Error('Étudiant non trouvé');
    }
    return student;
  }

  async updateStudent(studentId, updates) {
    const student = await this.getStudent(studentId);
    Object.assign(student, updates);
    student.stats.updated_at = new Date().toISOString();
    return student;
  }

  async deleteStudent(studentId) {
    const student = await this.getStudent(studentId);
    student.status = 'archived';
    student.stats.updated_at = new Date().toISOString();
    return student;
  }

  async getStudentsByTenant(tenantId) {
    const students = Array.from(this.students.values())
      .filter(student => student.tenant_id === tenantId && student.status === 'active')
      .map(student => student.toJSON());
    
    return students;
  }

  async startSession(studentId, sessionData = {}) {
    const student = await this.getStudent(studentId);
    
    const session = {
      session_id: uuidv4(),
      student_id: studentId,
      start_time: new Date().toISOString(),
      end_time: null,
      duration: 0,
      exercises_completed: 0,
      correct_answers: 0,
      total_answers: 0,
      xp_earned: 0,
      coins_earned: 0,
      skills_practiced: [],
      mood: sessionData.mood || 'neutral',
      goal: sessionData.goal || 'general_practice',
      difficulty_preference: sessionData.difficulty_preference || 'adaptive'
    };
    
    student.sessions.push(session);
    student.stats.updated_at = new Date().toISOString();
    
    return session;
  }

  async endSession(studentId, sessionId) {
    const student = await this.getStudent(studentId);
    const session = student.sessions.find(s => s.session_id === sessionId);
    
    if (!session) {
      throw new Error('Session non trouvée');
    }
    
    const endTime = new Date();
    const startTime = new Date(session.start_time);
    const duration = Math.round((endTime - startTime) / 1000 / 60); // minutes
    
    session.end_time = endTime.toISOString();
    session.duration = duration;
    
    // Update student stats
    student.stats.total_time += duration;
    student.stats.average_session_time = student.sessions.reduce((acc, s) => 
      acc + (s.duration || 0), 0) / student.sessions.length;
    
    student.stats.updated_at = new Date().toISOString();
    
    return session;
  }

  async recordExercise(studentId, exerciseData) {
    const student = await this.getStudent(studentId);
    
    const exercise = {
      exercise_id: uuidv4(),
      timestamp: new Date().toISOString(),
      skill: exerciseData.skill,
      difficulty: exerciseData.difficulty || 0.5,
      question: exerciseData.question,
      correct_answer: exerciseData.correct_answer,
      user_answer: exerciseData.user_answer,
      correct: exerciseData.correct,
      time_taken: exerciseData.time_taken || 0,
      hints_used: exerciseData.hints_used || 0,
      xp_earned: exerciseData.xp_earned || 0,
      coins_earned: exerciseData.coins_earned || 0
    };
    
    // Add to history
    student.history.push(exercise);
    
    // Update mastery
    student.updateMastery(exercise.skill, exercise.correct, exercise.difficulty);
    
    // Update stats
    student.stats.total_exercises += 1;
    if (exercise.correct) {
      student.stats.correct_answers += 1;
    }
    
    // Add XP and coins
    const xpResult = student.addXP(exercise.xp_earned);
    student.addCoins(exercise.coins_earned);
    
    // Update streak
    student.updateStreak(true);
    
    // Check for badges
    const newBadges = this.checkForBadges(student, exercise);
    
    // Update current session if active
    const activeSession = student.sessions.find(s => !s.end_time);
    if (activeSession) {
      activeSession.exercises_completed += 1;
      if (exercise.correct) {
        activeSession.correct_answers += 1;
      }
      activeSession.total_answers += 1;
      activeSession.xp_earned += exercise.xp_earned;
      activeSession.coins_earned += exercise.coins_earned;
      
      if (!activeSession.skills_practiced.includes(exercise.skill)) {
        activeSession.skills_practiced.push(exercise.skill);
      }
    }
    
    student.stats.updated_at = new Date().toISOString();
    
    return {
      exercise,
      mastery: student.mastery[exercise.skill],
      xp: student.xp,
      coins: student.coins,
      level: student.level,
      streak: student.streak,
      newBadges,
      levelUp: xpResult.levelUp
    };
  }

  checkForBadges(student, exercise) {
    const newBadges = [];
    
    // First exercise badge
    if (student.stats.total_exercises === 1) {
      const badge = {
        id: 'first_exercise',
        name: 'Premier Exercice',
        description: 'Complété ton premier exercice',
        icon: '🎯'
      };
      if (student.addBadge(badge)) {
        newBadges.push(badge);
      }
    }
    
    // Perfect streak badge
    const recentExercises = student.history.slice(-10);
    const allCorrect = recentExercises.length >= 10 && recentExercises.every(ex => ex.correct);
    if (allCorrect) {
      const badge = {
        id: 'perfect_streak_10',
        name: 'Série Parfaite',
        description: '10 exercices consécutifs corrects',
        icon: '🌟'
      };
      if (student.addBadge(badge)) {
        newBadges.push(badge);
      }
    }
    
    // Skill mastery badge
    if (student.mastery[exercise.skill] >= 0.8) {
      const badge = {
        id: `master_${exercise.skill}`,
        name: `Maître ${exercise.skill}`,
        description: `Maîtrise de ${exercise.skill} atteinte`,
        icon: '🏆'
      };
      if (student.addBadge(badge)) {
        newBadges.push(badge);
      }
    }
    
    return newBadges;
  }

  async getAdaptiveRecommendations(studentId) {
    const student = await this.getStudent(studentId);
    
    // Get recommended skills based on current mastery and grade
    const recommendations = this.skillGraph.getRecommendedSkills(student.mastery, student.grade);
    
    // Find root causes for weak skills
    const weakSkills = student.getWeakSkills().map(ws => ws.skill);
    const rootCauses = this.skillGraph.findRootCauses(weakSkills, student.mastery);
    
    // Generate next exercise recommendations
    const nextExercises = [];
    
    // Prioritize root causes
    if (rootCauses.length > 0) {
      rootCauses.forEach(cause => {
        cause.recommended_path.forEach(skillId => {
          const skill = this.skillGraph.getSkill(skillId);
          const mastery = student.mastery[skillId] || 0;
          
          nextExercises.push({
            skill: skillId,
            skill_name: skill.name,
            priority: 'high',
            reason: 'root_cause',
            mastery,
            difficulty: this.getOptimalDifficulty(mastery)
          });
        });
      });
    }
    
    // Add regular recommendations
    recommendations.slice(0, 3).forEach(rec => {
      if (!nextExercises.find(ex => ex.skill === rec.skill.id)) {
        nextExercises.push({
          skill: rec.skill.id,
          skill_name: rec.skill.name,
          priority: 'medium',
          reason: 'adaptive',
          mastery: rec.mastery,
          difficulty: this.getOptimalDifficulty(rec.mastery)
        });
      }
    });
    
    return {
      recommendations: nextExercises.slice(0, 5), // Top 5
      weak_skills: student.getWeakSkills(),
      strong_skills: student.getStrongSkills(),
      root_causes: rootCauses,
      session_stats: student.getSessionStats()
    };
  }

  getOptimalDifficulty(mastery) {
    if (mastery < 0.3) return 'easy';
    if (mastery < 0.7) return 'medium';
    return 'hard';
  }

  async getProgressReport(studentId, period = 'week') {
    const student = await this.getStudent(studentId);
    
    const now = new Date();
    let startDate;
    
    switch (period) {
      case 'day':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
    
    // Filter exercises by period
    const periodExercises = student.history.filter(ex => 
      new Date(ex.timestamp) >= startDate
    );
    
    // Calculate stats
    const totalExercises = periodExercises.length;
    const correctExercises = periodExercises.filter(ex => ex.correct).length;
    const accuracy = totalExercises > 0 ? (correctExercises / totalExercises) * 100 : 0;
    
    // Skills practiced
    const skillsPracticed = [...new Set(periodExercises.map(ex => ex.skill))];
    
    // Time spent
    const timeSpent = periodExercises.reduce((acc, ex) => acc + (ex.time_taken || 0), 0);
    
    // XP and coins earned
    const xpEarned = periodExercises.reduce((acc, ex) => acc + (ex.xp_earned || 0), 0);
    const coinsEarned = periodExercises.reduce((acc, ex) => acc + (ex.coins_earned || 0), 0);
    
    return {
      period,
      student_id: studentId,
      student_name: `${student.first_name} ${student.last_name}`,
      date_range: {
        start: startDate.toISOString(),
        end: now.toISOString()
      },
      stats: {
        total_exercises: totalExercises,
        correct_exercises: correctExercises,
        accuracy: Math.round(accuracy),
        skills_practiced: skillsPracticed.length,
        time_spent_minutes: Math.round(timeSpent / 60),
        xp_earned: xpEarned,
        coins_earned: coinsEarned
      },
      skills: skillsPracticed.map(skill => ({
        name: skill,
        exercises: periodExercises.filter(ex => ex.skill === skill).length,
        accuracy: this.calculateSkillAccuracy(periodExercises, skill),
        mastery: student.mastery[skill] || 0
      })),
      badges_earned: student.badges.filter(badge => 
        new Date(badge.earned_at) >= startDate
      ),
      current_level: student.level,
      current_streak: student.streak
    };
  }

  calculateSkillAccuracy(exercises, skill) {
    const skillExercises = exercises.filter(ex => ex.skill === skill);
    if (skillExercises.length === 0) return 0;
    
    const correct = skillExercises.filter(ex => ex.correct).length;
    return Math.round((correct / skillExercises.length) * 100);
  }

  async setGoals(studentId, goals) {
    const student = await this.getStudent(studentId);
    student.goals = { ...student.goals, ...goals };
    student.stats.updated_at = new Date().toISOString();
    return student.goals;
  }

  async getGoalsProgress(studentId) {
    const student = await this.getStudent(studentId);
    const now = new Date();
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // This week's exercises
    const weekExercises = student.history.filter(ex => 
      new Date(ex.timestamp) >= weekStart
    );
    
    const weeklyExercises = weekExercises.length;
    const weeklyXP = weekExercises.reduce((acc, ex) => acc + (ex.xp_earned || 0), 0);
    
    return {
      weekly_exercises: {
        goal: student.goals.weekly_exercises || 10,
        current: weeklyExercises,
        progress: Math.min(100, (weeklyExercises / (student.goals.weekly_exercises || 10)) * 100)
      },
      xp_target: {
        goal: student.goals.xp_target || 100,
        current: weeklyXP,
        progress: Math.min(100, (weeklyXP / (student.goals.xp_target || 100)) * 100)
      },
      daily_streak: {
        goal: student.goals.daily_streak || 5,
        current: student.streak,
        progress: Math.min(100, (student.streak / (student.goals.daily_streak || 5)) * 100)
      }
    };
  }
}

module.exports = new StudentService();
