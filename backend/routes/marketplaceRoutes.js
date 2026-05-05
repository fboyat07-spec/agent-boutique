// ACTION 5 - Marketplace d'agents (templates)

const express = require('express');
const {
  getAllAgentTemplates,
  getAgentTemplate,
  getTemplatesByCategory,
  applyAgentTemplate,
  getRecommendedTemplates,
  getMarketplaceStats,
  marketplaceHealthCheck
} = require('../services/agentTemplates');
const { optionalAuthenticate, validateTenant } = require('../middleware/tenantAuth');

const router = express.Router();

// GET /api/agent/templates - Lister tous les templates
router.get('/templates', optionalAuthenticate, async (req, res) => {
  try {
    const { category, difficulty, pricing } = req.query;
    
    console.log('[MARKETPLACE_TEMPLATES_REQUESTED]', { category, difficulty, pricing });
    
    let templates = getAllAgentTemplates();
    
    // Filtrer par catégorie si spécifié
    if (category) {
      templates = templates.filter(template => template.category === category);
    }
    
    // Filtrer par difficulté si spécifié
    if (difficulty) {
      templates = templates.filter(template => template.difficulty === difficulty);
    }
    
    // Filtrer par pricing si spécifié
    if (pricing) {
      templates = templates.filter(template => template.pricing === pricing);
    }
    
    console.log('[MARKETPLACE_TEMPLATES_GENERATED]', {
      total: templates.length,
      filters: { category, difficulty, pricing }
    });
    
    res.json({
      templates,
      filters: {
        category: category || 'all',
        difficulty: difficulty || 'all',
        pricing: pricing || 'all'
      },
      metadata: {
        generated_at: new Date(),
        total_available: getAllAgentTemplates().length
      }
    });
    
  } catch (error) {
    console.log('[MARKETPLACE_TEMPLATES_ERROR]', error.message);
    
    res.status(500).json({
      error: 'templates_error',
      message: 'Failed to get templates',
      details: error.message
    });
  }
});

// GET /api/agent/templates/:id - Détails d'un template
router.get('/templates/:id', optionalAuthenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('[MARKETPLACE_TEMPLATE_DETAIL_REQUESTED]', { id });
    
    const template = getAgentTemplate(id);
    
    if (!template) {
      return res.status(404).json({
        error: 'template_not_found',
        message: 'Template not found'
      });
    }
    
    console.log('[MARKETPLACE_TEMPLATE_DETAIL_GENERATED]', {
      id,
      name: template.name,
      views: template.views
    });
    
    res.json({
      template,
      metadata: {
        generated_at: new Date()
      }
    });
    
  } catch (error) {
    console.log('[MARKETPLACE_TEMPLATE_DETAIL_ERROR]', error.message);
    
    res.status(500).json({
      error: 'template_detail_error',
      message: 'Failed to get template details',
      details: error.message
    });
  }
});

// GET /api/agent/templates/categories - Lister les catégories
router.get('/templates/categories', optionalAuthenticate, async (req, res) => {
  try {
    console.log('[MARKETPLACE_CATEGORIES_REQUESTED]');
    
    const allTemplates = getAllAgentTemplates();
    const categories = {};
    
    // Regrouper par catégorie
    for (const template of allTemplates) {
      if (!categories[template.category]) {
        categories[template.category] = {
          name: template.category,
          count: 0,
          avg_popularity: 0,
          difficulties: new Set()
        };
      }
      
      categories[template.category].count++;
      categories[template.category].difficulties.add(template.difficulty);
    }
    
    // Calculer popularité moyenne par catégorie
    for (const [category, data] of Object.entries(categories)) {
      const categoryTemplates = allTemplates.filter(t => t.category === category);
      const avgPopularity = categoryTemplates.reduce((sum, t) => sum + t.popularity, 0) / categoryTemplates.length;
      
      data.avg_popularity = Math.round(avgPopularity);
      data.difficulties = Array.from(data.difficulties);
    }
    
    console.log('[MARKETPLACE_CATEGORIES_GENERATED]', {
      total_categories: Object.keys(categories).length
    });
    
    res.json({
      categories: Object.values(categories),
      metadata: {
        generated_at: new Date()
      }
    });
    
  } catch (error) {
    console.log('[MARKETPLACE_CATEGORIES_ERROR]', error.message);
    
    res.status(500).json({
      error: 'categories_error',
      message: 'Failed to get categories',
      details: error.message
    });
  }
});

// GET /api/agent/templates/recommended/:tenant_id - Templates recommandés
router.get('/templates/recommended/:tenant_id', optionalAuthenticate, async (req, res) => {
  try {
    const { tenant_id } = req.params;
    
    console.log('[MARKETPLACE_RECOMMENDATIONS_REQUESTED]', { tenant_id });
    
    const recommendations = getRecommendedTemplates(tenant_id);
    
    console.log('[MARKETPLACE_RECOMMENDATIONS_GENERATED]', {
      tenant_id,
      count: recommendations.length
    });
    
    res.json({
      tenant_id,
      recommendations,
      metadata: {
        generated_at: new Date()
      }
    });
    
  } catch (error) {
    console.log('[MARKETPLACE_RECOMMENDATIONS_ERROR]', error.message);
    
    res.status(500).json({
      error: 'recommendations_error',
      message: 'Failed to get recommendations',
      details: error.message
    });
  }
});

// POST /api/agent/apply-template - Appliquer un template
router.post('/apply-template', optionalAuthenticate, validateTenant, async (req, res) => {
  try {
    const { tenant_id, template_id, customizations = {} } = req.body;
    
    console.log('[MARKETPLACE_TEMPLATE_APPLY_REQUESTED]', {
      tenant_id,
      template_id,
      customizations: Object.keys(customizations)
    });
    
    if (!tenant_id || !template_id) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'tenant_id and template_id required'
      });
    }
    
    const result = applyAgentTemplate(tenant_id, template_id, customizations);
    
    if (!result.success) {
      return res.status(400).json({
        error: 'application_failed',
        message: 'Failed to apply template',
        details: result.error
      });
    }
    
    console.log('[MARKETPLACE_TEMPLATE_APPLIED]', {
      tenant_id,
      template_id,
      template_name: result.template.name
    });
    
    res.status(201).json({
      success: true,
      message: 'Template applied successfully',
      result,
      metadata: {
        applied_at: new Date()
      }
    });
    
  } catch (error) {
    console.log('[MARKETPLACE_TEMPLATE_APPLY_ERROR]', error.message);
    
    res.status(500).json({
      error: 'template_apply_error',
      message: 'Failed to apply template',
      details: error.message
    });
  }
});

// GET /api/agent/marketplace/stats - Stats du marketplace
router.get('/marketplace/stats', optionalAuthenticate, async (req, res) => {
  try {
    console.log('[MARKETPLACE_STATS_REQUESTED]');
    
    const stats = getMarketplaceStats();
    
    console.log('[MARKETPLACE_STATS_GENERATED]', {
      totalTemplates: stats.stats.totalTemplates,
      applications: stats.stats.templateApplications
    });
    
    res.json({
      marketplace: stats,
      metadata: {
        generated_at: new Date()
      }
    });
    
  } catch (error) {
    console.log('[MARKETPLACE_STATS_ERROR]', error.message);
    
    res.status(500).json({
      error: 'marketplace_stats_error',
      message: 'Failed to get marketplace stats',
      details: error.message
    });
  }
});

// GET /api/agent/marketplace/health - Health check marketplace
router.get('/marketplace/health', optionalAuthenticate, async (req, res) => {
  try {
    console.log('[MARKETPLACE_HEALTH_CHECK_REQUESTED]');
    
    const health = marketplaceHealthCheck();
    
    console.log('[MARKETPLACE_HEALTH_CHECK_GENERATED]', {
      status: health.status,
      enabled: health.enabled
    });
    
    res.json({
      marketplace: health,
      metadata: {
        checked_at: new Date()
      }
    });
    
  } catch (error) {
    console.log('[MARKETPLACE_HEALTH_CHECK_ERROR]', error.message);
    
    res.status(500).json({
      error: 'marketplace_health_error',
      message: 'Failed to perform marketplace health check',
      details: error.message
    });
  }
});

// GET /api/agent/templates/search - Rechercher des templates
router.get('/templates/search', optionalAuthenticate, async (req, res) => {
  try {
    const { q: query, limit = 20 } = req.query;
    
    console.log('[MARKETPLACE_TEMPLATES_SEARCH_REQUESTED]', { query, limit });
    
    if (!query) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'Search query (q) required'
      });
    }
    
    const allTemplates = getAllAgentTemplates();
    const searchQuery = query.toLowerCase();
    
    // Rechercher dans nom, description et features
    const results = allTemplates.filter(template => {
      const nameMatch = template.name.toLowerCase().includes(searchQuery);
      const descMatch = template.description.toLowerCase().includes(searchQuery);
      const featuresMatch = template.features.some(feature => 
        feature.toLowerCase().includes(searchQuery)
      );
      
      return nameMatch || descMatch || featuresMatch;
    });
    
    // Trier par pertinence (simple: nombre de correspondances)
    const scoredResults = results.map(template => {
      let score = 0;
      
      if (template.name.toLowerCase().includes(searchQuery)) score += 3;
      if (template.description.toLowerCase().includes(searchQuery)) score += 2;
      if (template.features.some(f => f.toLowerCase().includes(searchQuery))) score += 1;
      
      return { ...template, _searchScore: score };
    });
    
    scoredResults.sort((a, b) => b._searchScore - a._searchScore);
    
    const limitedResults = scoredResults.slice(0, parseInt(limit));
    
    // Nettoyer les scores de recherche
    const finalResults = limitedResults.map(({ _searchScore, ...template }) => template);
    
    console.log('[MARKETPLACE_TEMPLATES_SEARCH_GENERATED]', {
      query,
      total_found: results.length,
      returned: finalResults.length
    });
    
    res.json({
      query,
      results: finalResults,
      pagination: {
        total_found: results.length,
        returned: finalResults.length,
        limit: parseInt(limit)
      },
      metadata: {
        generated_at: new Date()
      }
    });
    
  } catch (error) {
    console.log('[MARKETPLACE_TEMPLATES_SEARCH_ERROR]', error.message);
    
    res.status(500).json({
      error: 'templates_search_error',
      message: 'Failed to search templates',
      details: error.message
    });
  }
});

module.exports = router;
