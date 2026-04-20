const { v4: uuidv4 } = require('uuid');

/**
 * Multi-tenant SaaS Model
 * Supports B2C (parents) and B2B (schools) accounts
 */
class Tenant {
  constructor(data = {}) {
    this.tenant_id = data.tenant_id || uuidv4();
    this.type = data.type || 'parent'; // 'parent' | 'school'
    this.name = data.name || '';
    this.email = data.email || '';
    this.phone = data.phone || '';
    this.address = data.address || {};
    this.subscription = data.subscription || {
      plan: 'free', // 'free' | 'premium' | 'school'
      status: 'active', // 'active' | 'trial' | 'cancelled' | 'past_due'
      stripe_customer_id: null,
      stripe_subscription_id: null,
      trial_ends: null,
      next_billing: null,
      features: this.getDefaultFeatures('free')
    };
    this.settings = data.settings || {
      timezone: 'Europe/Paris',
      language: 'fr',
      notifications: {
        email: true,
        push: true,
        sms: false
      },
      privacy: {
        data_retention: 365, // days
        analytics: true,
        sharing: false
      }
    };
    this.limits = data.limits || this.getDefaultLimits('free');
    this.usage = data.usage || {
      students: 0,
      exercises_today: 0,
      api_calls_today: 0,
      storage_mb: 0
    };
    this.created_at = data.created_at || new Date().toISOString();
    this.updated_at = data.updated_at || new Date().toISOString();
    this.status = data.status || 'active'; // 'active' | 'suspended' | 'deleted'
  }

  getDefaultFeatures(plan) {
    const features = {
      free: {
        max_students: 3,
        max_exercises_per_day: 20,
        ai_tutor: false,
        voice_features: false,
        advanced_analytics: false,
        rewards_system: true,
        parent_dashboard: true,
        export_reports: false,
        api_access: false
      },
      premium: {
        max_students: 10,
        max_exercises_per_day: 100,
        ai_tutor: true,
        voice_features: true,
        advanced_analytics: true,
        rewards_system: true,
        parent_dashboard: true,
        export_reports: true,
        api_access: false
      },
      school: {
        max_students: 500,
        max_exercises_per_day: 10000,
        ai_tutor: true,
        voice_features: true,
        advanced_analytics: true,
        rewards_system: true,
        parent_dashboard: true,
        export_reports: true,
        api_access: true,
        teacher_dashboard: true,
        class_management: true,
        bulk_operations: true
      }
    };
    return features[plan] || features.free;
  }

  getDefaultLimits(plan) {
    const limits = {
      free: {
        students: 3,
        exercises_per_day: 20,
        storage_mb: 100,
        api_calls_per_day: 0
      },
      premium: {
        students: 10,
        exercises_per_day: 100,
        storage_mb: 1000,
        api_calls_per_day: 100
      },
      school: {
        students: 500,
        exercises_per_day: 10000,
        storage_mb: 10000,
        api_calls_per_day: 10000
      }
    };
    return limits[plan] || limits.free;
  }

  upgradePlan(newPlan) {
    this.subscription.plan = newPlan;
    this.subscription.features = this.getDefaultFeatures(newPlan);
    this.limits = this.getDefaultLimits(newPlan);
    this.updated_at = new Date().toISOString();
  }

  canAddStudent() {
    return this.usage.students < this.limits.students;
  }

  canDoExercise() {
    return this.usage.exercises_today < this.limits.exercises_per_day;
  }

  hasFeature(feature) {
    return this.subscription.features[feature] === true;
  }

  updateUsage(updates) {
    Object.assign(this.usage, updates);
    this.updated_at = new Date().toISOString();
  }

  toJSON() {
    return {
      tenant_id: this.tenant_id,
      type: this.type,
      name: this.name,
      email: this.email,
      phone: this.phone,
      address: this.address,
      subscription: this.subscription,
      settings: this.settings,
      limits: this.limits,
      usage: this.usage,
      created_at: this.created_at,
      updated_at: this.updated_at,
      status: this.status
    };
  }

  static fromJSON(data) {
    return new Tenant(data);
  }
}

module.exports = Tenant;
