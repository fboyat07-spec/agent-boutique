// ACTION 5 - Marketplace d'agents (templates)

const { updateTenantConfig, getTenant } = require('./tenantManager');
const BusinessLogger = require('./businessLogger');

// Templates d'agents prédéfinis
class AgentTemplates {
  constructor() {
    this.enabled = process.env.MARKETPLACE_ENABLED === 'true';
    this.templates = new Map();
    this.stats = {
      totalTemplates: 0,
      templateApplications: 0,
      templateViews: new Map()
    };
    
    this.initializeTemplates();
    
    console.log('[AGENT_TEMPLATES_INITIALIZED]', {
      enabled: this.enabled,
      totalTemplates: this.stats.totalTemplates
    });
  }
  
  // Initialiser les templates par défaut
  initializeTemplates() {
    const defaultTemplates = [
      {
        id: 'basic-agent',
        name: 'Agent Basique',
        description: 'Configuration simple pour démarrer rapidement',
        category: 'starter',
        difficulty: 'beginner',
        configPreset: {
          outbound_enabled: true,
          followup_enabled: true,
          ai_enabled: false,
          max_per_run: 3,
          cooldown_hours: 24
        },
        features: [
          'Messages outbound automatisés',
          'Suivi simple des leads',
          'Pas d\'IA requise'
        ],
        pricing: 'free',
        popularity: 85
      },
      {
        id: 'ai-assistant',
        name: 'Assistant IA',
        description: 'Agent avec intelligence artificielle intégrée',
        category: 'ai',
        difficulty: 'intermediate',
        configPreset: {
          outbound_enabled: true,
          followup_enabled: true,
          ai_enabled: true,
          ai_advanced_enabled: false,
          max_per_run: 5,
          cooldown_hours: 12
        },
        features: [
          'Réponses IA générées',
          'Analyse de sentiment',
          'Personnalisation avancée'
        ],
        pricing: 'premium',
        popularity: 92
      },
      {
        id: 'power-agent',
        name: 'Agent Puissant',
        description: 'Configuration complète avec toutes les fonctionnalités',
        category: 'advanced',
        difficulty: 'advanced',
        configPreset: {
          outbound_enabled: true,
          followup_enabled: true,
          ai_enabled: true,
          ai_advanced_enabled: true,
          multi_agent_enabled: true,
          auto_regulation_enabled: true,
          max_per_run: 10,
          cooldown_hours: 6
        },
        features: [
          'IA avancée',
          'Multi-agents',
          'Auto-régulation',
          'Queue d\'exécution',
          'Monitoring avancé'
        ],
        pricing: 'enterprise',
        popularity: 78
      },
      {
        id: 'sales-focused',
        name: 'Agent Ventes',
        description: 'Optimisé pour la conversion et les ventes',
        category: 'business',
        difficulty: 'intermediate',
        configPreset: {
          outbound_enabled: true,
          followup_enabled: true,
          ai_enabled: true,
          max_per_run: 7,
          cooldown_hours: 8
        },
        features: [
          'Scripts de vente',
          'Suivi agressif',
          'IA orientée conversion',
          'Tracking ROI'
        ],
        pricing: 'premium',
        popularity: 88
      },
      {
        id: 'lead-nurturing',
        name: 'Lead Nurturing',
        description: 'Focus sur la relation client à long terme',
        category: 'business',
        difficulty: 'beginner',
        configPreset: {
          outbound_enabled: false,
          followup_enabled: true,
          ai_enabled: true,
          max_per_run: 2,
          cooldown_hours: 48
        },
        features: [
          'Communication douce',
          'Suivi long terme',
          'IA conversationnelle',
          'Pas de prospection'
        ],
        pricing: 'standard',
        popularity: 76
      },
      {
        id: 'high-volume',
        name: 'Grand Volume',
        description: 'Traitement de gros volumes de leads',
        category: 'performance',
        difficulty: 'advanced',
        configPreset: {
          outbound_enabled: true,
          followup_enabled: true,
          ai_enabled: false,
          queue_enabled: true,
          auto_regulation_enabled: true,
          max_per_run: 15,
          cooldown_hours: 4
        },
        features: [
          'Queue d\'exécution',
          'Auto-régulation',
          'High throughput',
          'Optimisé pour volume'
        ],
        pricing: 'enterprise',
        popularity: 82
      },
      {
        id: 'minimal-agent',
        name: 'Agent Minimal',
        description: 'Configuration ultra-simple pour tests',
        category: 'starter',
        difficulty: 'beginner',
        configPreset: {
          outbound_enabled: false,
          followup_enabled: true,
          ai_enabled: false,
          max_per_run: 1,
          cooldown_hours: 72
        },
        features: [
          'Suivi basique uniquement',
          'Pas d\'outbound',
          'Pas d\'IA',
          'Idéal pour débuter'
        ],
        pricing: 'free',
        popularity: 65
      },
      {
        id: 'experimental',
        name: 'Agent Expérimental',
        description: 'Dernières fonctionnalités en beta',
        category: 'experimental',
        difficulty: 'expert',
        configPreset: {
          outbound_enabled: true,
          followup_enabled: true,
          ai_enabled: true,
          ai_advanced_enabled: true,
          multi_agent_enabled: true,
          queue_enabled: true,
          auto_regulation_enabled: true,
          max_per_run: 20,
          cooldown_hours: 2
        },
        features: [
          'Toutes les fonctionnalités',
          'Features beta',
          'Performance maximale',
          'Pour utilisateurs experts'
        ],
        pricing: 'enterprise',
        popularity: 45
      }
    ];
    
    // Ajouter les templates au Map
    for (const template of defaultTemplates) {
      this.templates.set(template.id, {
        ...template,
        createdAt: new Date().toISOString(),
        version: '1.0'
      });
    }
    
    this.stats.totalTemplates = this.templates.size;
    
    console.log('[AGENT_TEMPLATES_LOADED]', {
      totalTemplates: this.stats.totalTemplates,
      categories: this.getCategories()
    });
  }
  
  // Obtenir tous les templates
  getAllTemplates() {
    const templates = Array.from(this.templates.values());
    
    // Trier par popularité
    templates.sort((a, b) => b.popularity - a.popularity);
    
    return templates.map(template => ({
      id: template.id,
      name: template.name,
      description: template.description,
      category: template.category,
      difficulty: template.difficulty,
      features: template.features,
      pricing: template.pricing,
      popularity: template.popularity,
      createdAt: template.createdAt,
      version: template.version
    }));
  }
  
  // Obtenir template par ID
  getTemplate(templateId) {
    const template = this.templates.get(templateId);
    
    if (!template) {
      return null;
    }
    
    // Incrémenter vues
    const currentViews = this.stats.templateViews.get(templateId) || 0;
    this.stats.templateViews.set(templateId, currentViews + 1);
    
    return {
      ...template,
      views: currentViews + 1
    };
  }
  
  // Filtrer templates par catégorie
  getTemplatesByCategory(category) {
    const templates = Array.from(this.templates.values())
      .filter(template => template.category === category);
    
    return templates.map(template => ({
      id: template.id,
      name: template.name,
      description: template.description,
      difficulty: template.difficulty,
      features: template.features,
      pricing: template.pricing,
      popularity: template.popularity
    }));
  }
  
  // Obtenir catégories disponibles
  getCategories() {
    const categories = new Set();
    
    for (const template of this.templates.values()) {
      categories.add(template.category);
    }
    
    return Array.from(categories);
  }
  
  // Appliquer template à un tenant
  applyTemplate(tenant_id, templateId, customizations = {}) {
    if (!this.enabled) {
      return { success: false, error: 'Marketplace disabled' };
    }
    
    const template = this.getTemplate(templateId);
    
    if (!template) {
      return { success: false, error: 'Template not found' };
    }
    
    // Vérifier que le tenant existe
    const tenant = getTenant(tenant_id);
    
    if (!tenant || tenant.tenant_id === 'DEFAULT') {
      return { success: false, error: 'Tenant not found or cannot modify default' };
    }
    
    // Fusionner config du template avec customizations
    const finalConfig = {
      ...template.configPreset,
      ...customizations
    };
    
    // Valider configuration
    const validation = this.validateConfig(finalConfig);
    
    if (!validation.valid) {
      return { 
        success: false, 
        error: 'Invalid configuration',
        details: validation.errors 
      };
    }
    
    // Appliquer configuration au tenant
    const { updateTenantConfig } = require('./tenantManager');
    const updateResult = updateTenantConfig(tenant_id, finalConfig);
    
    if (!updateResult.success) {
      return { 
        success: false, 
        error: 'Failed to apply template',
        details: updateResult.error 
      };
    }
    
    // Stats
    this.stats.templateApplications++;
    
    console.log('[AGENT_TEMPLATE_APPLIED]', {
      tenant_id,
      templateId,
      templateName: template.name,
      customizations: Object.keys(customizations)
    });
    
    BusinessLogger.logTenantEvent('template_applied', tenant_id, {
      templateId,
      templateName: template.name,
      category: template.category
    });
    
    return {
      success: true,
      template: {
        id: template.id,
        name: template.name,
        category: template.category,
        applied_at: new Date()
      },
      configuration: finalConfig,
      applied_features: template.features,
      warnings: validation.warnings || []
    };
  }
  
  // Valider configuration
  validateConfig(config) {
    const errors = [];
    const warnings = [];
    
    // Valider types et valeurs
    if (config.max_per_run !== undefined) {
      const maxRun = parseInt(config.max_per_run);
      if (isNaN(maxRun) || maxRun < 1 || maxRun > 50) {
        errors.push('max_per_run must be between 1 and 50');
      }
    }
    
    if (config.cooldown_hours !== undefined) {
      const cooldown = parseInt(config.cooldown_hours);
      if (isNaN(cooldown) || cooldown < 1 || cooldown > 168) {
        errors.push('cooldown_hours must be between 1 and 168 (7 days)');
      }
    }
    
    // Avertissements
    if (config.max_per_run > 10 && !config.auto_regulation_enabled) {
      warnings.push('High max_per_run without auto-regulation may cause issues');
    }
    
    if (config.ai_enabled && !config.followup_enabled) {
      warnings.push('AI enabled but follow-up disabled - AI may have limited effect');
    }
    
    if (config.outbound_enabled && config.cooldown_hours < 6) {
      warnings.push('Short cooldown with outbound enabled may overwhelm contacts');
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  // Obtenir templates recommandés pour un tenant
  getRecommendedTemplates(tenant_id) {
    const tenant = getTenant(tenant_id);
    
    if (!tenant || tenant.tenant_id === 'DEFAULT') {
      // Recommandations pour nouveaux tenants
      return [
        this.getTemplate('basic-agent'),
        this.getTemplate('minimal-agent')
      ].filter(Boolean);
    }
    
    const currentConfig = tenant.config;
    const recommendations = [];
    
    // Basé sur configuration actuelle
    if (!currentConfig.ai_enabled) {
      recommendations.push(this.getTemplate('ai-assistant'));
    }
    
    if (!currentConfig.multi_agent_enabled) {
      recommendations.push(this.getTemplate('power-agent'));
    }
    
    if (currentConfig.max_per_run < 5) {
      recommendations.push(this.getTemplate('high-volume'));
    }
    
    // Basé sur usage
    const usageCount = tenant.usage_count || 0;
    
    if (usageCount > 100 && !currentConfig.queue_enabled) {
      recommendations.push(this.getTemplate('sales-focused'));
    }
    
    if (usageCount > 500) {
      recommendations.push(this.getTemplate('power-agent'));
    }
    
    // Retourner uniques et triés par popularité
    const uniqueRecommendations = recommendations.filter((template, index, self) => 
      self.findIndex(t => t.id === template.id) === index
    );
    
    uniqueRecommendations.sort((a, b) => b.popularity - a.popularity);
    
    return uniqueRecommendations.slice(0, 3); // Top 3 recommandations
  }
  
  // Obtenir stats du marketplace
  getMarketplaceStats() {
    const categories = this.getCategories();
    const categoryStats = {};
    
    for (const category of categories) {
      const templates = this.getTemplatesByCategory(category);
      categoryStats[category] = {
        count: templates.length,
        avgPopularity: Math.round(
          templates.reduce((sum, t) => sum + t.popularity, 0) / templates.length
        )
      };
    }
    
    const totalViews = Array.from(this.stats.templateViews.values())
      .reduce((sum, views) => sum + views, 0);
    
    return {
      enabled: this.enabled,
      stats: {
        totalTemplates: this.stats.totalTemplates,
        templateApplications: this.stats.templateApplications,
        totalViews,
        categories: Object.keys(categoryStats).length
      },
      categoryStats,
      topTemplates: this.getAllTemplates().slice(0, 5),
      mostViewed: Array.from(this.stats.templateViews.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([templateId, views]) => ({
          templateId,
          views,
          template: this.getTemplate(templateId)
        }))
    };
  }
  
  // Health check
  healthCheck() {
    const stats = this.getMarketplaceStats();
    
    const health = {
      status: 'healthy',
      enabled: stats.enabled,
      issues: [],
      recommendations: []
    };
    
    // Vérifier nombre de templates
    if (stats.stats.totalTemplates < 5) {
      health.issues.push('Too few templates available');
      health.recommendations.push('Add more diverse templates');
    }
    
    // Vérifier applications
    if (stats.stats.templateApplications === 0 && stats.enabled) {
      health.issues.push('No template applications');
      health.recommendations.push('Check template visibility or usability');
    }
    
    if (health.issues.length > 0) {
      health.status = 'warning';
    }
    
    return {
      ...health,
      stats: {
        totalTemplates: stats.stats.totalTemplates,
        applications: stats.stats.templateApplications,
        categories: stats.stats.categories
      }
    };
  }
  
  // Réinitialiser stats
  resetStats() {
    this.stats = {
      totalTemplates: this.templates.size,
      templateApplications: 0,
      templateViews: new Map()
    };
    
    console.log('[AGENT_TEMPLATES_STATS_RESET]');
  }
}

// Instance globale du marketplace
if (!global.agentTemplates) {
  global.agentTemplates = new AgentTemplates();
}

// Fonctions principales
function getAllAgentTemplates() {
  return global.agentTemplates.getAllTemplates();
}

function getAgentTemplate(templateId) {
  return global.agentTemplates.getTemplate(templateId);
}

function getTemplatesByCategory(category) {
  return global.agentTemplates.getTemplatesByCategory(category);
}

function applyAgentTemplate(tenant_id, templateId, customizations) {
  return global.agentTemplates.applyTemplate(tenant_id, templateId, customizations);
}

function getRecommendedTemplates(tenant_id) {
  return global.agentTemplates.getRecommendedTemplates(tenant_id);
}

// Stats et monitoring
function getMarketplaceStats() {
  return global.agentTemplates.getMarketplaceStats();
}

function marketplaceHealthCheck() {
  return global.agentTemplates.healthCheck();
}

// Administration
function resetMarketplaceStats() {
  return global.agentTemplates.resetStats();
}

module.exports = {
  getAllAgentTemplates,
  getAgentTemplate,
  getTemplatesByCategory,
  applyAgentTemplate,
  getRecommendedTemplates,
  getMarketplaceStats,
  marketplaceHealthCheck,
  resetMarketplaceStats,
  AgentTemplates
};
