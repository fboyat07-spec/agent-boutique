const { auth, db, admin } = require('../config/firebase');
const jwt = require('jsonwebtoken');

class AuthService {
  // Register new user
  async register(userData) {
    try {
      const { email, password, displayName, age, parentEmail } = userData;
      
      // Create user in Firebase Auth
      const userRecord = await auth.createUser({
        email,
        password,
        displayName: displayName || null
      });

      // Create user profile in Firestore
      const userProfile = {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: displayName || userRecord.email.split('@')[0],
        age: age || null,
        parentEmail: parentEmail || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastLogin: admin.firestore.FieldValue.serverTimestamp(),
        isActive: true,
        subscription: 'free',
        progress: {
          totalSessions: 0,
          totalQuestions: 0,
          correctAnswers: 0,
          streak: 0
        }
      };

      await db.collection('users').doc(userRecord.uid).set(userProfile);

      return {
        success: true,
        user: {
          uid: userRecord.uid,
          email: userRecord.email,
          displayName: userProfile.displayName,
          age: userProfile.age
        }
      };
    } catch (error) {
      console.error('Registration error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Login user
  async login(email, password) {
    try {
      // Note: Firebase Admin SDK doesn't have direct login
      // This should be handled client-side with Firebase Auth SDK
      // Backend will verify the token sent from client
      
      return {
        success: false,
        error: 'Login should be handled client-side with Firebase Auth SDK'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Verify Firebase token
  async verifyToken(token) {
    try {
      const decodedToken = await auth.verifyIdToken(token);
      return {
        success: true,
        user: decodedToken
      };
    } catch (error) {
      return {
        success: false,
        error: 'Invalid token'
      };
    }
  }

  // Get user profile
  async getUserProfile(uid) {
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
        user: userDoc.data()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Update user profile
  async updateUserProfile(uid, updates) {
    try {
      await db.collection('users').doc(uid).update({
        ...updates,
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

  // Delete user
  async deleteUser(uid) {
    try {
      await auth.deleteUser(uid);
      await db.collection('users').doc(uid).delete();
      
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

  // Generate custom token for client
  async generateCustomToken(uid) {
    try {
      const customToken = await auth.createCustomToken(uid);
      return {
        success: true,
        token: customToken
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new AuthService();
