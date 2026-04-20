const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

/**
 * Multi-role User Model
 * Supports parents, teachers, and students
 */
class User {
  constructor(data = {}) {
    this.user_id = data.user_id || uuidv4();
    this.tenant_id = data.tenant_id || '';
    this.email = data.email || '';
    this.password_hash = data.password_hash || '';
    this.role = data.role || 'parent'; // 'parent' | 'teacher' | 'student' | 'admin'
    this.first_name = data.first_name || '';
    this.last_name = data.last_name || '';
    this.phone = data.phone || '';
    this.avatar = data.avatar || 'default';
    
    // Role-specific data
    this.profile = data.profile || {};
    
    // Authentication
    this.last_login = data.last_login || null;
    this.login_count = data.login_count || 0;
    this.failed_attempts = data.failed_attempts || 0;
    this.locked_until = data.locked_until || null;
    this.email_verified = data.email_verified || false;
    this.email_verification_token = data.email_verification_token || null;
    this.password_reset_token = data.password_reset_token || null;
    this.password_reset_expires = data.password_reset_expires || null;
    
    // Permissions
    this.permissions = data.permissions || this.getDefaultPermissions(this.role);
    
    // Settings
    this.settings = data.settings || {
      language: 'fr',
      timezone: 'Europe/Paris',
      notifications: {
        email: true,
        push: true,
        sms: false
      }
    };
    
    // Status
    this.status = data.status || 'active'; // 'active' | 'inactive' | 'suspended' | 'deleted'
    this.created_at = data.created_at || new Date().toISOString();
    this.updated_at = data.updated_at || new Date().toISOString();
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

  async setPassword(password) {
    const saltRounds = 12;
    this.password_hash = await bcrypt.hash(password, saltRounds);
  }

  async verifyPassword(password) {
    if (!this.password_hash) return false;
    return bcrypt.compare(password, this.password_hash);
  }

  generateJWT() {
    const payload = {
      user_id: this.user_id,
      tenant_id: this.tenant_id,
      email: this.email,
      role: this.role,
      permissions: this.permissions
    };
    
    return jwt.sign(payload, process.env.JWT_SECRET || 'fallback-secret', {
      expiresIn: '7d'
    });
  }

  static verifyJWT(token) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    } catch (error) {
      return null;
    }
  }

  hasPermission(permission) {
    return this.permissions.includes(permission);
  }

  addPermission(permission) {
    if (!this.permissions.includes(permission)) {
      this.permissions.push(permission);
      this.updated_at = new Date().toISOString();
    }
  }

  removePermission(permission) {
    const index = this.permissions.indexOf(permission);
    if (index > -1) {
      this.permissions.splice(index, 1);
      this.updated_at = new Date().toISOString();
    }
  }

  recordLogin() {
    this.last_login = new Date().toISOString();
    this.login_count += 1;
    this.failed_attempts = 0;
    this.updated_at = new Date().toISOString();
  }

  recordFailedLogin() {
    this.failed_attempts += 1;
    
    // Lock account after 5 failed attempts for 30 minutes
    if (this.failed_attempts >= 5) {
      this.locked_until = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    }
    
    this.updated_at = new Date().toISOString();
  }

  isLocked() {
    return this.locked_until && new Date(this.locked_until) > new Date();
  }

  generateEmailVerificationToken() {
    this.email_verification_token = uuidv4();
    this.updated_at = new Date().toISOString();
    return this.email_verification_token;
  }

  verifyEmail(token) {
    if (this.email_verification_token === token) {
      this.email_verified = true;
      this.email_verification_token = null;
      this.updated_at = new Date().toISOString();
      return true;
    }
    return false;
  }

  generatePasswordResetToken() {
    this.password_reset_token = uuidv4();
    this.password_reset_expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
    this.updated_at = new Date().toISOString();
    return this.password_reset_token;
  }

  verifyPasswordResetToken(token) {
    return this.password_reset_token === token && 
           this.password_reset_expires && 
           new Date(this.password_reset_expires) > new Date();
  }

  clearPasswordReset() {
    this.password_reset_token = null;
    this.password_reset_expires = null;
    this.updated_at = new Date().toISOString();
  }

  updateProfile(profileData) {
    this.profile = { ...this.profile, ...profileData };
    this.updated_at = new Date().toISOString();
  }

  updateSettings(settingsData) {
    this.settings = { ...this.settings, ...settingsData };
    this.updated_at = new Date().toISOString();
  }

  toJSON() {
    return {
      user_id: this.user_id,
      tenant_id: this.tenant_id,
      email: this.email,
      role: this.role,
      first_name: this.first_name,
      last_name: this.last_name,
      phone: this.phone,
      avatar: this.avatar,
      profile: this.profile,
      last_login: this.last_login,
      login_count: this.login_count,
      email_verified: this.email_verified,
      permissions: this.permissions,
      settings: this.settings,
      status: this.status,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }

  static fromJSON(data) {
    return new User(data);
  }
}

module.exports = User;
