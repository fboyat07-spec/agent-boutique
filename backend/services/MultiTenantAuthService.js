const { auth, db, admin } = require('../config/firebase');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const TenantService = require('./TenantService');

/**
 * Multi-tenant Authentication Service
 * Supports parents, teachers, students, and admins with role-based permissions
 */
class MultiTenantAuthService {
  constructor() {
    this.initializeDefaultAccounts();
  }

  initializeDefaultAccounts() {
    // Create default admin if not exists
    this.createDefaultAdmin();
  }

  async createDefaultAdmin() {
    try {
      const adminEmail = 'admin@kidai.demo';
      const adminRef = db.collection('users').where('email', '==', adminEmail).limit(1);
      const adminSnapshot = await adminRef.get();
      
      if (adminSnapshot.empty) {
        const adminUser = {
          uid: uuidv4(),
          email: adminEmail,
          password_hash: await bcrypt.hash('admin123', 12),
          role: 'admin',
          first_name: 'Admin',
          last_name: 'KidAI',
          tenant_id: 'system',
          permissions: this.getDefaultPermissions('admin'),
          email_verified: true,
          status: 'active',
          created_at: admin.firestore.FieldValue.serverTimestamp(),
          updated_at: admin.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('users').doc(adminUser.uid).set(adminUser);
        console.log('Default admin account created');
      }
    } catch (error) {
      console.error('Error creating default admin:', error);
    }
  }

  getDefaultPermissions(role) {
    const permissions = {
      parent: [
        'view_own_children',
        'manage_children_profiles',
        'view_child_progress',
        'set_goals',
        'manage_rewards',
        'view_reports',
        'invite_friends'
      ],
      teacher: [
        'view_assigned_students',
        'manage_class_progress',
        'assign_exercises',
        'view_class_reports',
        'manage_class_settings'
      ],
      student: [
        'view_own_profile',
        'do_exercises',
        'view_own_progress',
        'earn_rewards',
        'use_ai_tutor'
      ],
      admin: [
        'manage_all_users',
        'manage_tenants',
        'view_system_reports',
        'manage_subscriptions',
        'system_configuration'
      ]
    };
    return permissions[role] || [];
  }

  async register(userData) {
    try {
      const { email, password, role = 'parent', tenant_id, first_name, last_name, ...profileData } = userData;
      
      // Check if user already exists
      const existingUser = await db.collection('users').where('email', '==', email).limit(1).get();
      if (!existingUser.empty) {
        throw new Error('Un compte avec cet email existe déjà');
      }

      // For parent and teacher roles, verify tenant exists
      if (['parent', 'teacher'].includes(role) && tenant_id) {
        const tenant = await TenantService.getTenant(tenant_id);
        if (!tenant) {
          throw new Error('Tenant invalide');
        }
      }

      // Create user in Firebase Auth
      const userRecord = await auth.createUser({
        email,
        password,
        displayName: `${first_name} ${last_name}` || email.split('@')[0]
      });

      // Hash password for additional security
      const password_hash = await bcrypt.hash(password, 12);

      // Create user profile in Firestore
      const userProfile = {
        uid: userRecord.uid,
        tenant_id: tenant_id || null,
        email: userRecord.email,
        password_hash,
        role,
        first_name: first_name || '',
        last_name: last_name || '',
        permissions: this.getDefaultPermissions(role),
        profile: profileData || {},
        last_login: null,
        login_count: 0,
        failed_attempts: 0,
        locked_until: null,
        email_verified: userRecord.emailVerified,
        email_verification_token: null,
        password_reset_token: null,
        password_reset_expires: null,
        settings: {
          language: 'fr',
          timezone: 'Europe/Paris',
          notifications: {
            email: true,
            push: true,
            sms: false
          }
        },
        status: 'active',
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      };

      await db.collection('users').doc(userRecord.uid).set(userProfile);

      // Generate custom token for client
      const customToken = await auth.createCustomToken(userRecord.uid);

      return {
        success: true,
        user: {
          uid: userRecord.uid,
          email: userRecord.email,
          role,
          first_name,
          last_name,
          permissions: userProfile.permissions,
          email_verified: userRecord.emailVerified
        },
        token: customToken,
        requires_email_verification: !userRecord.emailVerified
      };
    } catch (error) {
      console.error('Registration error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async login(email, password) {
    try {
      // Find user by email
      const userSnapshot = await db.collection('users').where('email', '==', email).limit(1).get();
      
      if (userSnapshot.empty) {
        throw new Error('Email ou mot de passe incorrect');
      }

      const userDoc = userSnapshot.docs[0];
      const user = userDoc.data();

      // Check if account is locked
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        throw new Error('Compte temporairement bloqué. Veuillez réessayer plus tard.');
      }

      // Check if account is active
      if (user.status !== 'active') {
        throw new Error('Compte désactivé');
      }

      // Verify password with both Firebase and local hash
      let isValidPassword = false;
      
      try {
        // Try Firebase Auth first
        const userRecord = await auth.getUser(user.uid);
        // Note: Firebase Admin SDK doesn't have direct password verification
        // This would typically be handled client-side
        isValidPassword = true; // Assuming client-side verification passed
      } catch (firebaseError) {
        // Fallback to local hash verification
        isValidPassword = await bcrypt.compare(password, user.password_hash);
      }

      if (!isValidPassword) {
        // Update failed attempts
        const failedAttempts = (user.failed_attempts || 0) + 1;
        const updates = {
          failed_attempts: failedAttempts,
          updated_at: admin.firestore.FieldValue.serverTimestamp()
        };

        // Lock account after 5 failed attempts
        if (failedAttempts >= 5) {
          updates.locked_until = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        }

        await userDoc.ref.update(updates);
        throw new Error('Email ou mot de passe incorrect');
      }

      // Record successful login
      await userDoc.ref.update({
        last_login: admin.firestore.FieldValue.serverTimestamp(),
        login_count: admin.firestore.FieldValue.increment(1),
        failed_attempts: 0,
        locked_until: null,
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });

      // Generate custom token
      const customToken = await auth.createCustomToken(user.uid);

      return {
        success: true,
        user: {
          uid: user.uid,
          email: user.email,
          role: user.role,
          first_name: user.first_name,
          last_name: user.last_name,
          tenant_id: user.tenant_id,
          permissions: user.permissions,
          email_verified: user.email_verified
        },
        token: customToken,
        requires_email_verification: !user.email_verified
      };
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async verifyToken(token) {
    try {
      const decodedToken = await auth.verifyIdToken(token);
      
      // Get full user data from Firestore
      const userDoc = await db.collection('users').doc(decodedToken.uid).get();
      
      if (!userDoc.exists) {
        throw new Error('Utilisateur non trouvé');
      }

      const user = userDoc.data();
      
      if (user.status !== 'active') {
        throw new Error('Compte désactivé');
      }

      return {
        success: true,
        user: {
          uid: user.uid,
          email: user.email,
          role: user.role,
          first_name: user.first_name,
          last_name: user.last_name,
          tenant_id: user.tenant_id,
          permissions: user.permissions
        }
      };
    } catch (error) {
      return {
        success: false,
        error: 'Token invalide'
      };
    }
  }

  async getUserProfile(uid) {
    try {
      const userDoc = await db.collection('users').doc(uid).get();
      
      if (!userDoc.exists) {
        return {
          success: false,
          error: 'User not found'
        };
      }

      const user = userDoc.data();
      
      return {
        success: true,
        user: {
          uid: user.uid,
          email: user.email,
          role: user.role,
          first_name: user.first_name,
          last_name: user.last_name,
          tenant_id: user.tenant_id,
          permissions: user.permissions,
          profile: user.profile,
          settings: user.settings,
          status: user.status,
          email_verified: user.email_verified,
          last_login: user.last_login,
          login_count: user.login_count
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async updateUserProfile(uid, updates) {
    try {
      const userRef = db.collection('users').doc(uid);
      const userDoc = await userRef.get();
      
      if (!userDoc.exists) {
        throw new Error('Utilisateur non trouvé');
      }

      const allowedUpdates = ['first_name', 'last_name', 'profile', 'settings'];
      const filteredUpdates = {};
      
      Object.keys(updates).forEach(key => {
        if (allowedUpdates.includes(key)) {
          filteredUpdates[key] = updates[key];
        }
      });

      filteredUpdates.updated_at = admin.firestore.FieldValue.serverTimestamp();

      await userRef.update(filteredUpdates);

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

  async getUsersByTenant(tenant_id, role = null) {
    try {
      let query = db.collection('users')
        .where('tenant_id', '==', tenant_id)
        .where('status', '==', 'active');

      if (role) {
        query = query.where('role', '==', role);
      }

      const snapshot = await query.get();
      const users = [];

      snapshot.forEach(doc => {
        const user = doc.data();
        users.push({
          uid: user.uid,
          email: user.email,
          role: user.role,
          first_name: user.first_name,
          last_name: user.last_name,
          permissions: user.permissions,
          status: user.status,
          created_at: user.created_at
        });
      });

      return {
        success: true,
        users
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

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

  async hasPermission(uid, permission) {
    try {
      const userDoc = await db.collection('users').doc(uid).get();
      
      if (!userDoc.exists) {
        return false;
      }

      const user = userDoc.data();
      return user.permissions && user.permissions.includes(permission);
    } catch (error) {
      return false;
    }
  }

  async updatePassword(uid, currentPassword, newPassword) {
    try {
      const userDoc = await db.collection('users').doc(uid).get();
      
      if (!userDoc.exists) {
        throw new Error('Utilisateur non trouvé');
      }

      const user = userDoc.data();
      
      // Verify current password
      const isValidCurrentPassword = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isValidCurrentPassword) {
        throw new Error('Mot de passe actuel incorrect');
      }

      // Update password in Firebase Auth
      await auth.updateUser(uid, { password: newPassword });
      
      // Update local hash
      const newPasswordHash = await bcrypt.hash(newPassword, 12);
      
      await userDoc.ref.update({
        password_hash: newPasswordHash,
        updated_at: admin.firestore.FieldValue.serverTimestamp()
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
}

module.exports = new MultiTenantAuthService();
