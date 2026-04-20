const Tenant = require('../models/Tenant');
const { v4: uuidv4 } = require('uuid');

/**
 * Multi-tenant Management Service
 * Handles B2C (parents) and B2B (schools) accounts
 */
class TenantService {
  constructor() {
    this.tenants = new Map(); // In-memory storage (replace with database in production)
    this.initializeDefaultTenants();
  }

  initializeDefaultTenants() {
    // Create a default tenant for development
    const defaultTenant = new Tenant({
      type: 'parent',
      name: 'Default Parent Account',
      email: 'parent@kidai.demo',
      subscription: {
        plan: 'premium',
        status: 'active',
        features: this.getDefaultFeatures('premium')
      }
    });
    this.tenants.set(defaultTenant.tenant_id, defaultTenant);
  }

  async createTenant(tenantData) {
    try {
      const tenant = new Tenant(tenantData);
      
      // Validate unique email
      const existingTenant = this.findTenantByEmail(tenant.email);
      if (existingTenant) {
        throw new Error('Un compte avec cet email existe déjà');
      }

      this.tenants.set(tenant.tenant_id, tenant);
      return tenant;
    } catch (error) {
      throw new Error(`Erreur création tenant: ${error.message}`);
    }
  }

  async getTenant(tenantId) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new Error('Tenant non trouvé');
    }
    return tenant;
  }

  async updateTenant(tenantId, updates) {
    const tenant = await this.getTenant(tenantId);
    Object.assign(tenant, updates);
    tenant.updated_at = new Date().toISOString();
    return tenant;
  }

  async deleteTenant(tenantId) {
    const tenant = await this.getTenant(tenantId);
    tenant.status = 'deleted';
    tenant.updated_at = new Date().toISOString();
    return tenant;
  }

  findTenantByEmail(email) {
    for (const tenant of this.tenants.values()) {
      if (tenant.email === email && tenant.status !== 'deleted') {
        return tenant;
      }
    }
    return null;
  }

  async upgradeSubscription(tenantId, newPlan, stripeData = {}) {
    const tenant = await this.getTenant(tenantId);
    
    const validPlans = ['free', 'premium', 'school'];
    if (!validPlans.includes(newPlan)) {
      throw new Error('Plan invalide');
    }

    tenant.upgradePlan(newPlan);
    
    // Update Stripe information if provided
    if (stripeData.customer_id) {
      tenant.subscription.stripe_customer_id = stripeData.customer_id;
    }
    if (stripeData.subscription_id) {
      tenant.subscription.stripe_subscription_id = stripeData.subscription_id;
    }

    return tenant;
  }

  async checkUsageLimits(tenantId) {
    const tenant = await this.getTenant(tenantId);
    
    return {
      canAddStudent: tenant.canAddStudent(),
      canDoExercise: tenant.canDoExercise(),
      studentsUsed: tenant.usage.students,
      studentsLimit: tenant.limits.students,
      exercisesUsed: tenant.usage.exercises_today,
      exercisesLimit: tenant.limits.exercises_per_day,
      storageUsed: tenant.usage.storage_mb,
      storageLimit: tenant.limits.storage_mb
    };
  }

  async updateUsage(tenantId, usageUpdates) {
    const tenant = await this.getTenant(tenantId);
    tenant.updateUsage(usageUpdates);
    return tenant;
  }

  async getTenantStats(tenantId) {
    const tenant = await this.getTenant(tenantId);
    
    return {
      tenant_id: tenant.tenant_id,
      type: tenant.type,
      plan: tenant.subscription.plan,
      status: tenant.status,
      students_count: tenant.usage.students,
      exercises_today: tenant.usage.exercises_today,
      storage_used: tenant.usage.storage_mb,
      created_at: tenant.created_at,
      last_updated: tenant.updated_at
    };
  }

  async getAllTenants(filters = {}) {
    const tenants = Array.from(this.tenants.values());
    
    let filtered = tenants.filter(tenant => tenant.status !== 'deleted');
    
    if (filters.type) {
      filtered = filtered.filter(tenant => tenant.type === filters.type);
    }
    
    if (filters.plan) {
      filtered = filtered.filter(tenant => tenant.subscription.plan === filters.plan);
    }
    
    if (filters.status) {
      filtered = filtered.filter(tenant => tenant.status === filters.status);
    }
    
    return filtered.map(tenant => ({
      tenant_id: tenant.tenant_id,
      type: tenant.type,
      name: tenant.name,
      email: tenant.email,
      plan: tenant.subscription.plan,
      status: tenant.status,
      students_count: tenant.usage.students,
      created_at: tenant.created_at
    }));
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

  async validateTenantAccess(tenantId, requiredFeature) {
    try {
      const tenant = await this.getTenant(tenantId);
      return tenant.hasFeature(requiredFeature);
    } catch (error) {
      return false;
    }
  }

  async getTenantDashboard(tenantId) {
    const tenant = await this.getTenant(tenantId);
    const usage = await this.checkUsageLimits(tenantId);
    
    return {
      tenant: {
        id: tenant.tenant_id,
        name: tenant.name,
        type: tenant.type,
        plan: tenant.subscription.plan,
        status: tenant.status
      },
      subscription: {
        plan: tenant.subscription.plan,
        status: tenant.subscription.status,
        features: tenant.subscription.features,
        next_billing: tenant.subscription.next_billing
      },
      usage: usage,
      limits: {
        students: tenant.limits.students,
        exercises_per_day: tenant.limits.exercises_per_day,
        storage_mb: tenant.limits.storage_mb
      },
      settings: tenant.settings
    };
  }

  // School-specific methods
  async createSchoolAccount(schoolData) {
    const schoolTenant = new Tenant({
      ...schoolData,
      type: 'school',
      subscription: {
        plan: 'school',
        status: 'trial',
        trial_ends: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days trial
        features: this.getDefaultFeatures('school')
      }
    });

    this.tenants.set(schoolTenant.tenant_id, schoolTenant);
    return schoolTenant;
  }

  async addTeacherToSchool(schoolTenantId, teacherData) {
    const school = await this.getTenant(schoolTenantId);
    if (school.type !== 'school') {
      throw new Error('Seuls les comptes école peuvent ajouter des enseignants');
    }

    // This would integrate with a separate Teacher model
    // For now, we'll store teachers in the tenant's metadata
    if (!school.teachers) {
      school.teachers = [];
    }

    const teacher = {
      teacher_id: uuidv4(),
      ...teacherData,
      school_tenant_id: schoolTenantId,
      created_at: new Date().toISOString()
    };

    school.teachers.push(teacher);
    school.updated_at = new Date().toISOString();
    
    return teacher;
  }

  async getSchoolTeachers(schoolTenantId) {
    const school = await this.getTenant(schoolTenantId);
    return school.teachers || [];
  }
}

module.exports = new TenantService();
