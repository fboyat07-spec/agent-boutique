const { db, admin } = require('../config/firebase');

class DataService {
  // Save diagnostic results
  async saveDiagnostic(uid, diagnosticData) {
    try {
      const diagnostic = {
        uid: uid,
        ...diagnosticData,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        type: 'initial' // initial, followup, etc.
      };

      const docRef = await db.collection('diagnostics').add(diagnostic);
      
      // Update user progress
      await this.updateUserProgress(uid, {
        lastDiagnostic: admin.firestore.FieldValue.serverTimestamp(),
        totalDiagnostics: admin.firestore.FieldValue.increment(1)
      });

      return {
        success: true,
        diagnosticId: docRef.id
      };
    } catch (error) {
      console.error('Save diagnostic error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get user diagnostics
  async getUserDiagnostics(uid, limit = 10) {
    try {
      const snapshot = await db.collection('diagnostics')
        .where('uid', '==', uid)
        .orderBy('completedAt', 'desc')
        .limit(limit)
        .get();

      const diagnostics = [];
      snapshot.forEach(doc => {
        diagnostics.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return {
        success: true,
        diagnostics
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Save learning session
  async saveLearningSession(uid, sessionData) {
    try {
      const session = {
        uid: uid,
        ...sessionData,
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'active' // active, completed, paused
      };

      const docRef = await db.collection('learning_sessions').add(session);
      
      // Update user progress
      await this.updateUserProgress(uid, {
        totalSessions: admin.firestore.FieldValue.increment(1),
        currentStreak: admin.firestore.FieldValue.increment(1),
        lastSessionDate: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        success: true,
        sessionId: docRef.id
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Complete learning session
  async completeLearningSession(sessionId, results) {
    try {
      await db.collection('learning_sessions').doc(sessionId).update({
        status: 'completed',
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        results: results
      });

      return {
        success: true
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Save question/answer
  async saveQuestionAnswer(uid, questionData) {
    try {
      const question = {
        uid: uid,
        ...questionData,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      };

      const docRef = await db.collection('questions').add(question);
      
      // Update user progress
      await this.updateUserProgress(uid, {
        totalQuestions: admin.firestore.FieldValue.increment(1),
        correctAnswers: questionData.isCorrect ? 
          admin.firestore.FieldValue.increment(1) : 
          admin.firestore.FieldValue.increment(0)
      });

      return {
        success: true,
        questionId: docRef.id
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get user progress
  async getUserProgress(uid) {
    try {
      const userDoc = await db.collection('users').doc(uid).get();
      
      if (!userDoc.exists) {
        return {
          success: false,
          error: 'User not found'
        };
      }

      const progress = userDoc.data().progress || {};
      
      // Calculate additional metrics
      const accuracy = progress.totalQuestions > 0 ? 
        (progress.correctAnswers / progress.totalQuestions * 100).toFixed(1) : 0;

      return {
        success: true,
        progress: {
          ...progress,
          accuracy: parseFloat(accuracy),
          level: this.calculateUserLevel(progress.totalQuestions, accuracy)
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Update user progress
  async updateUserProgress(uid, updates) {
    try {
      await db.collection('users').doc(uid).update({
        progress: updates,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        success: true
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get learning recommendations
  async getLearningRecommendations(uid) {
    try {
      // Get user progress and recent questions
      const [progressResult, questionsResult] = await Promise.all([
        this.getUserProgress(uid),
        this.getRecentQuestions(uid, 20)
      ]);

      if (!progressResult.success) {
        return progressResult;
      }

      const progress = progressResult.progress;
      const recentQuestions = questionsResult.questions || [];

      // Analyze weak areas
      const weakAreas = this.analyzeWeakAreas(recentQuestions);
      
      // Generate recommendations
      const recommendations = this.generateRecommendations(progress, weakAreas);

      return {
        success: true,
        recommendations,
        progress,
        weakAreas
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get recent questions
  async getRecentQuestions(uid, limit = 20) {
    try {
      const snapshot = await db.collection('questions')
        .where('uid', '==', uid)
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();

      const questions = [];
      snapshot.forEach(doc => {
        questions.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return {
        success: true,
        questions
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Helper: Calculate user level
  calculateUserLevel(totalQuestions, accuracy) {
    if (totalQuestions < 10) return 'beginner';
    if (totalQuestions < 50) return 'intermediate';
    if (totalQuestions < 200) return 'advanced';
    return 'expert';
  }

  // Helper: Analyze weak areas
  analyzeWeakAreas(questions) {
    const subjectCounts = {};
    const subjectCorrect = {};

    questions.forEach(q => {
      const subject = q.subject || 'general';
      subjectCounts[subject] = (subjectCounts[subject] || 0) + 1;
      if (q.isCorrect) {
        subjectCorrect[subject] = (subjectCorrect[subject] || 0) + 1;
      }
    });

    const weakAreas = [];
    Object.keys(subjectCounts).forEach(subject => {
      const accuracy = subjectCounts[subject] > 0 ? 
        (subjectCorrect[subject] / subjectCounts[subject] * 100) : 0;
      
      if (accuracy < 70) { // Less than 70% accuracy
        weakAreas.push({
          subject,
          accuracy: accuracy.toFixed(1),
          totalQuestions: subjectCounts[subject],
          needsImprovement: true
        });
      }
    });

    return weakAreas.sort((a, b) => a.accuracy - b.accuracy);
  }

  // Helper: Generate recommendations
  generateRecommendations(progress, weakAreas) {
    const recommendations = [];

    // Based on weak areas
    weakAreas.forEach(area => {
      recommendations.push({
        type: 'subject_focus',
        subject: area.subject,
        priority: 'high',
        title: `Améliorer ${area.subject}`,
        description: `Tu as ${area.accuracy}% de précision en ${area.subject}. Pratiquons ensemble !`,
        action: 'practice'
      });
    });

    // Based on progress
    if (progress.totalQuestions < 20) {
      recommendations.push({
        type: 'foundation',
        priority: 'medium',
        title: 'Construire les bases',
        description: 'Faisons quelques exercices fondamentaux pour bien démarrer !',
        action: 'basics'
      });
    }

    // Based on streak
    if (progress.currentStreak >= 5) {
      recommendations.push({
        type: 'achievement',
        priority: 'low',
        title: `Super série ! ${progress.currentStreak} jours`,
        description: 'Tu es en super forme ! Continuons comme ça !',
        action: 'continue'
      });
    }

    return recommendations.slice(0, 3); // Max 3 recommendations
  }

  // Save user preferences
  async saveUserPreferences(uid, preferences) {
    try {
      await db.collection('users').doc(uid).update({
        preferences: preferences,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        success: true
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get user preferences
  async getUserPreferences(uid) {
    try {
      const userDoc = await db.collection('users').doc(uid).get();
      
      if (!userDoc.exists) {
        return {
          success: false,
          error: 'User not found'
        };
      }

      return {
        success: true,
        preferences: userDoc.data().preferences || {}
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new DataService();
