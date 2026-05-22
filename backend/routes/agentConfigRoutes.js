// ACTION 6 - Configuration UI → Agent (safe)

const express = require('express');
const { updateTenantConfig, getTenant } = require('../services/tenantManager');
const { getFullTenantConfig } = require('../services/tenantConfig');
const BusinessLogger = require('./businessLogger');
const { optionalAuthenticate, validateTenant } = require('../middleware/tenantAuth');
const User = require('../models/User');

const router = express.Router();

// POST /api/agent/config - Mettre à jour configuration agent
router.post('/config', optionalAuthenticate, validateTenant, async (req, res) => {
  try {
    const { tenant_id } = req.body;
    const configUpdates = req.body;
    
    console.log('[AGENT_CONFIG_UPDATE_REQUESTED]', {
      tenant_id,
      updates: Object.keys(configUpdates)
    });
    
    if (!tenant_id) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'tenant_id required'
      });
    }
    
    // Filtrer les champs autorisés pour la mise à jour
    const allowedFields = [
      'outbound_enabled',
      'followup_enabled',
      'ai_enabled',
      'ai_advanced_enabled',
      'multi_agent_enabled',
      'queue_enabled',
      'auto_regulation_enabled',
      'max_per_run',
      'cooldown_hours',
      'max_daily_actions'
    ];
    
    const filteredUpdates = {};
    const invalidFields = [];
    
    for (const [key, value] of Object.entries(configUpdates)) {
      if (key === 'tenant_id') continue; // Skip tenant_id
      
      if (allowedFields.includes(key)) {
        filteredUpdates[key] = value;
      } else {
        invalidFields.push(key);
      }
    }
    
    // Avertissement pour champs invalides
    if (invalidFields.length > 0) {
      console.log('[AGENT_CONFIG_INVALID_FIELDS]', {
        tenant_id,
        invalidFields
      });
    }
    
    if (Object.keys(filteredUpdates).length === 0) {
      return res.status(400).json({
        error: 'no_valid_updates',
        message: 'No valid configuration fields provided',
        allowed_fields: allowedFields,
        invalid_fields: invalidFields
      });
    }
    
    // Valider les valeurs
    const validation = this.validateConfigUpdates(filteredUpdates);
    
    if (!validation.valid) {
      return res.status(400).json({
        error: 'validation_failed',
        message: 'Configuration validation failed',
        errors: validation.errors,
        warnings: validation.warnings
      });
    }
    
    // Appliquer la mise à jour
    const updateResult = updateTenantConfig(tenant_id, filteredUpdates);
    
    if (!updateResult.success) {
      return res.status(500).json({
        error: 'update_failed',
        message: 'Failed to update configuration',
        details: updateResult.error
      });
    }
    
    console.log('[AGENT_CONFIG_UPDATED]', {
      tenant_id,
      updates: Object.keys(filteredUpdates),
      warnings: validation.warnings.length
    });
    
    BusinessLogger.logTenantEvent('agent_config_updated', tenant_id, {
      updated_fields: Object.keys(filteredUpdates),
      warnings: validation.warnings
    });
    
    res.json({
      success: true,
      message: 'Agent configuration updated successfully',
      tenant_id,
      updated_fields: Object.keys(filteredUpdates),
      warnings: validation.warnings,
      invalid_fields: invalidFields.length > 0 ? invalidFields : undefined,
      metadata: {
        updated_at: new Date()
      }
    });
    
  } catch (error) {
    console.log('[AGENT_CONFIG_UPDATE_ERROR]', error.message);
    
    res.status(500).json({
      error: 'config_update_error',
      message: 'Failed to update agent configuration',
      details: error.message
    });
  }
});

// GET /api/agent/config?tenant_id= - Obtenir configuration actuelle
router.get('/config', optionalAuthenticate, async (req, res) => {
  try {
    const { tenant_id } = req.query;
    
    console.log('[AGENT_CONFIG_REQUESTED]', { tenant_id });
    
    if (!tenant_id) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'tenant_id parameter required'
      });
    }
    
    const config = getFullTenantConfig(tenant_id);
    
    console.log('[AGENT_CONFIG_GENERATED]', {
      tenant_id,
      outbound_enabled: config.outbound_enabled,
      ai_enabled: config.ai_enabled
    });
    
    res.json({
      tenant_id,
      configuration: {
        // Fonctionnalités principales
        outbound: {
          enabled: config.outbound_enabled,
          max_per_run: config.max_per_run,
          cooldown_hours: config.cooldown_hours
        },
        followup: {
          enabled: config.followup_enabled,
          cooldown_hours: config.cooldown_hours
        },
        ai: {
          enabled: config.ai_enabled,
          advanced_enabled: config.ai_advanced_enabled
        },
        // Fonctionnalités avancées
        multi_agent: {
          enabled: config.multi_agent_enabled
        },
        queue: {
          enabled: config.queue_enabled
        },
        regulation: {
          enabled: config.auto_regulation_enabled
        },
        // Limites
        limits: {
          max_daily_actions: config.max_daily_actions
        }
      },
      metadata: {
        generated_at: new Date(),
        configurable: true
      }
    });
    
  } catch (error) {
    console.log('[AGENT_CONFIG_ERROR]', error.message);
    
    res.status(500).json({
      error: 'config_error',
      message: 'Failed to get agent configuration',
      details: error.message
    });
  }
});

// POST /api/agent/config/quick-toggle - Toggle rapide des fonctionnalités
router.post('/config/quick-toggle', optionalAuthenticate, validateTenant, async (req, res) => {
  try {
    const { tenant_id, feature, enabled } = req.body;
    
    console.log('[AGENT_CONFIG_QUICK_TOGGLE_REQUESTED]', {
      tenant_id,
      feature,
      enabled
    });
    
    if (!tenant_id || !feature) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'tenant_id and feature required'
      });
    }
    
    // Fonctionnalités autorisées pour quick toggle
    const toggleableFeatures = [
      'outbound_enabled',
      'followup_enabled',
      'ai_enabled',
      'ai_advanced_enabled',
      'multi_agent_enabled',
      'queue_enabled',
      'auto_regulation_enabled'
    ];
    
    if (!toggleableFeatures.includes(feature)) {
      return res.status(400).json({
        error: 'invalid_feature',
        message: 'Feature cannot be toggled',
        allowed_features: toggleableFeatures
      });
    }
    
    // Valider la valeur
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        error: 'invalid_value',
        message: 'enabled must be boolean'
      });
    }
    
    // Appliquer le toggle
    const updateResult = updateTenantConfig(tenant_id, { [feature]: enabled });
    
    if (!updateResult.success) {
      return res.status(500).json({
        error: 'toggle_failed',
        message: 'Failed to toggle feature',
        details: updateResult.error
      });
    }
    
    console.log('[AGENT_CONFIG_QUICK_TOGGLED]', {
      tenant_id,
      feature,
      enabled
    });
    
    BusinessLogger.logTenantEvent('feature_toggled', tenant_id, {
      feature,
      enabled
    });
    
    res.json({
      success: true,
      message: `Feature ${feature} ${enabled ? 'enabled' : 'disabled'} successfully`,
      tenant_id,
      feature,
      enabled,
      metadata: {
        toggled_at: new Date()
      }
    });
    
  } catch (error) {
    console.log('[AGENT_CONFIG_QUICK_TOGGLE_ERROR]', error.message);
    
    res.status(500).json({
      error: 'quick_toggle_error',
      message: 'Failed to toggle feature',
      details: error.message
    });
  }
});

// POST /api/agent/config/reset - Réinitialiser configuration par défaut
router.post('/config/reset', optionalAuthenticate, validateTenant, async (req, res) => {
  try {
    const { tenant_id, category = 'all' } = req.body;
    
    console.log('[AGENT_CONFIG_RESET_REQUESTED]', {
      tenant_id,
      category
    });
    
    if (!tenant_id) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'tenant_id required'
      });
    }
    
    // Configurations par défaut
    const defaultConfigs = {
      all: {
        outbound_enabled: false,
        followup_enabled: true,
        ai_enabled: false,
        ai_advanced_enabled: false,
        multi_agent_enabled: false,
        queue_enabled: false,
        auto_regulation_enabled: true,
        max_per_run: 3,
        cooldown_hours: 24,
        max_daily_actions: 1000
      },
      basic: {
        outbound_enabled: false,
        followup_enabled: true,
        ai_enabled: false,
        max_per_run: 3,
        cooldown_hours: 24
      },
      ai: {
        ai_enabled: true,
        ai_advanced_enabled: false,
        max_per_run: 5,
        cooldown_hours: 12
      },
      performance: {
        queue_enabled: true,
        auto_regulation_enabled: true,
        max_per_run: 10,
        cooldown_hours: 6
      }
    };
    
    const resetConfig = defaultConfigs[category];
    
    if (!resetConfig) {
      return res.status(400).json({
        error: 'invalid_category',
        message: 'Invalid reset category',
        allowed_categories: Object.keys(defaultConfigs)
      });
    }
    
    // Appliquer la réinitialisation
    const updateResult = updateTenantConfig(tenant_id, resetConfig);
    
    if (!updateResult.success) {
      return res.status(500).json({
        error: 'reset_failed',
        message: 'Failed to reset configuration',
        details: updateResult.error
      });
    }
    
    console.log('[AGENT_CONFIG_RESET]', {
      tenant_id,
      category,
      fields_reset: Object.keys(resetConfig)
    });
    
    BusinessLogger.logTenantEvent('config_reset', tenant_id, {
      category,
      fields_reset: Object.keys(resetConfig)
    });
    
    res.json({
      success: true,
      message: `Configuration reset to ${category} defaults`,
      tenant_id,
      category,
      reset_fields: Object.keys(resetConfig),
      new_config: resetConfig,
      metadata: {
        reset_at: new Date()
      }
    });
    
  } catch (error) {
    console.log('[AGENT_CONFIG_RESET_ERROR]', error.message);
    
    res.status(500).json({
      error: 'config_reset_error',
      message: 'Failed to reset configuration',
      details: error.message
    });
  }
});

// GET /api/agent/config/presets - Obtenir presets de configuration
router.get('/config/presets', optionalAuthenticate, async (req, res) => {
  try {
    console.log('[AGENT_CONFIG_PRESETS_REQUESTED]');
    
    const presets = {
      minimal: {
        name: 'Minimal',
        description: 'Configuration minimale pour tests',
        config: {
          outbound_enabled: false,
          followup_enabled: true,
          ai_enabled: false,
          max_per_run: 1,
          cooldown_hours: 72
        }
      },
      basic: {
        name: 'Basique',
        description: 'Configuration simple pour débuter',
        config: {
          outbound_enabled: false,
          followup_enabled: true,
          ai_enabled: false,
          max_per_run: 3,
          cooldown_hours: 24
        }
      },
      standard: {
        name: 'Standard',
        description: 'Configuration équilibrée',
        config: {
          outbound_enabled: true,
          followup_enabled: true,
          ai_enabled: false,
          max_per_run: 5,
          cooldown_hours: 12
        }
      },
      ai_enabled: {
        name: 'IA Activée',
        description: 'Avec intelligence artificielle',
        config: {
          outbound_enabled: true,
          followup_enabled: true,
          ai_enabled: true,
          ai_advanced_enabled: false,
          max_per_run: 5,
          cooldown_hours: 12
        }
      },
      power: {
        name: 'Puissante',
        description: 'Toutes les fonctionnalités activées',
        config: {
          outbound_enabled: true,
          followup_enabled: true,
          ai_enabled: true,
          ai_advanced_enabled: true,
          multi_agent_enabled: true,
          queue_enabled: true,
          auto_regulation_enabled: true,
          max_per_run: 10,
          cooldown_hours: 6
        }
      }
    };
    
    console.log('[AGENT_CONFIG_PRESETS_GENERATED]', {
      total_presets: Object.keys(presets).length
    });
    
    res.json({
      presets,
      metadata: {
        generated_at: new Date()
      }
    });
    
  } catch (error) {
    console.log('[AGENT_CONFIG_PRESETS_ERROR]', error.message);
    
    res.status(500).json({
      error: 'presets_error',
      message: 'Failed to get configuration presets',
      details: error.message
    });
  }
});

// POST /api/agent/config/validate - Valider configuration sans appliquer
router.post('/config/validate', optionalAuthenticate, async (req, res) => {
  try {
    const configUpdates = req.body;
    
    console.log('[AGENT_CONFIG_VALIDATE_REQUESTED]', {
      updates: Object.keys(configUpdates)
    });
    
    // Valider la configuration
    const validation = this.validateConfigUpdates(configUpdates);
    
    console.log('[AGENT_CONFIG_VALIDATED]', {
      valid: validation.valid,
      errors: validation.errors.length,
      warnings: validation.warnings.length
    });
    
    res.json({
      valid: validation.valid,
      errors: validation.errors,
      warnings: validation.warnings,
      metadata: {
        validated_at: new Date()
      }
    });
    
  } catch (error) {
    console.log('[AGENT_CONFIG_VALIDATE_ERROR]', error.message);
    
    res.status(500).json({
      error: 'validate_error',
      message: 'Failed to validate configuration',
      details: error.message
    });
  }
});

// ─── POST /api/agent/instructions ────────────────────────────────────────────

router.post('/instructions', async (req, res) => {
  try {
    const { tenant_id, instructions } = req.body;
    if (!tenant_id) return res.status(400).json({ error: 'tenant_id requis' });

    const user = await User.findOneAndUpdate(
      { tenant_id },
      { agent_instructions: (instructions || '').trim() },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: `Aucun utilisateur pour tenant_id: ${tenant_id}` });

    console.log(`[AGENT INSTRUCTIONS] Sauvegardé pour tenant ${tenant_id} (${(instructions || '').length} chars)`);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[AGENT INSTRUCTIONS POST ERROR]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/agent/instructions ─────────────────────────────────────────────

router.get('/instructions', async (req, res) => {
  try {
    const { tenant_id } = req.query;
    if (!tenant_id) return res.status(400).json({ error: 'tenant_id requis' });

    const user = await User.findOne({ tenant_id }).select('agent_instructions').lean();
    if (!user) return res.status(404).json({ error: `Aucun utilisateur pour tenant_id: ${tenant_id}` });

    return res.json({ ok: true, instructions: user.agent_instructions || '' });
  } catch (err) {
    console.error('[AGENT INSTRUCTIONS GET ERROR]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Fonction de validation des mises à jour de configuration
function validateConfigUpdates(updates) {
  const errors = [];
  const warnings = [];
  
  // Valider max_per_run
  if (updates.max_per_run !== undefined) {
    const maxRun = parseInt(updates.max_per_run);
    if (isNaN(maxRun) || maxRun < 1 || maxRun > 50) {
      errors.push('max_per_run must be between 1 and 50');
    }
  }
  
  // Valider cooldown_hours
  if (updates.cooldown_hours !== undefined) {
    const cooldown = parseInt(updates.cooldown_hours);
    if (isNaN(cooldown) || cooldown < 1 || cooldown > 168) {
      errors.push('cooldown_hours must be between 1 and 168 (7 days)');
    }
  }
  
  // Valider max_daily_actions
  if (updates.max_daily_actions !== undefined) {
    const maxDaily = parseInt(updates.max_daily_actions);
    if (isNaN(maxDaily) || maxDaily < 10 || maxDaily > 100000) {
      errors.push('max_daily_actions must be between 10 and 100000');
    }
  }
  
  // Valider types booléens
  const booleanFields = [
    'outbound_enabled',
    'followup_enabled',
    'ai_enabled',
    'ai_advanced_enabled',
    'multi_agent_enabled',
    'queue_enabled',
    'auto_regulation_enabled'
  ];
  
  for (const field of booleanFields) {
    if (updates[field] !== undefined && typeof updates[field] !== 'boolean') {
      errors.push(`${field} must be boolean`);
    }
  }
  
  // Avertissements
  if (updates.max_per_run > 10 && !updates.auto_regulation_enabled) {
    warnings.push('High max_per_run without auto-regulation may cause issues');
  }
  
  if (updates.ai_enabled && !updates.followup_enabled) {
    warnings.push('AI enabled but follow-up disabled - AI may have limited effect');
  }
  
  if (updates.outbound_enabled && updates.cooldown_hours < 6) {
    warnings.push('Short cooldown with outbound enabled may overwhelm contacts');
  }
  
  if (updates.ai_advanced_enabled && !updates.ai_enabled) {
    warnings.push('Advanced AI enabled but basic AI disabled - enabling basic AI recommended');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

// ─── POST /api/agent/calendly ─────────────────────────────────────────────────

router.post('/calendly', async (req, res) => {
  try {
    const { tenant_id, calendly_link } = req.body;
    if (!tenant_id) return res.status(400).json({ error: 'tenant_id requis' });

    const user = await User.findOneAndUpdate(
      { tenant_id },
      { calendly_link: (calendly_link || '').trim() },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: `Aucun utilisateur pour tenant_id: ${tenant_id}` });

    console.log(`[CALENDLY] Sauvegardé pour tenant ${tenant_id}`);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[CALENDLY POST ERROR]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/agent/calendly ──────────────────────────────────────────────────

router.get('/calendly', async (req, res) => {
  try {
    const { tenant_id } = req.query;
    if (!tenant_id) return res.status(400).json({ error: 'tenant_id requis' });

    const user = await User.findOne({ tenant_id }).select('calendly_link').lean();
    if (!user) return res.status(404).json({ error: `Aucun utilisateur pour tenant_id: ${tenant_id}` });

    return res.json({ ok: true, calendly_link: user.calendly_link || '' });
  } catch (err) {
    console.error('[CALENDLY GET ERROR]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
