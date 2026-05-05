// ACTION 2 - Onboarding client simple

const express = require('express');
const { registerTenant, getTenant, listTenants } = require('../services/tenantManager');
const BusinessLogger = require('../services/businessLogger');

const router = express.Router();

// POST /api/agent/register - Onboarding client simple
router.post('/register', async (req, res) => {
  try {
    const { tenant_id, phone_number_id, stripe_account, agent_enabled, max_per_run, cooldown_hours, max_daily_actions } = req.body;
    
    // Validation basique
    if (!tenant_id) {
      return res.status(400).json({
        error: 'tenant_id required',
        message: 'Please provide a unique tenant identifier'
      });
    }
    
    if (!phone_number_id) {
      return res.status(400).json({
        error: 'phone_number_id required',
        message: 'Please provide WhatsApp phone_number_id'
      });
    }
    
    // Vérifier si tenant existe déjà
    const existingTenant = getTenant(tenant_id);
    if (existingTenant && existingTenant.tenant_id !== 'DEFAULT') {
      return res.status(409).json({
        error: 'tenant_already_exists',
        message: `Tenant ${tenant_id} already exists`,
        tenant: existingTenant
      });
    }
    
    // Configurer tenant
    const tenantConfig = {
      tenant_id,
      phone_number_id,
      stripe_account: stripe_account || '',
      agent_enabled: agent_enabled || false,
      max_per_run: max_per_run || 3,
      cooldown_hours: cooldown_hours || 24,
      max_daily_actions: max_daily_actions || 1000
    };
    
    // Enregistrer tenant
    const result = registerTenant(tenantConfig);
    
    if (!result.success) {
      return res.status(500).json({
        error: 'registration_failed',
        message: result.error
      });
    }
    
    // Log création tenant
    console.log('[TENANT_REGISTRATION_SUCCESS]', {
      tenant_id,
      phone_number_id,
      agent_enabled,
      registered_at: new Date()
    });
    
    BusinessLogger.logWebhookReceived('tenant_registered', tenant_id);
    
    res.status(201).json({
      success: true,
      message: 'Tenant registered successfully',
      tenant: result.tenant,
      next_steps: [
        'Configure your WhatsApp webhook',
        'Set up Stripe payment links',
        'Test agent activation'
      ]
    });
    
  } catch (error) {
    console.log('[TENANT_REGISTRATION_ERROR]', error.message);
    
    res.status(500).json({
      error: 'registration_error',
      message: 'Failed to register tenant',
      details: error.message
    });
  }
});

// GET /api/agent/register - Lister tous les tenants (admin)
router.get('/register', async (req, res) => {
  try {
    const tenants = listTenants();
    
    console.log('[TENANT_LIST_REQUESTED]', {
      totalTenants: tenants.length,
      timestamp: new Date()
    });
    
    res.json({
      success: true,
      total: tenants.length,
      tenants: tenants,
      metadata: {
        generated_at: new Date(),
        default_tenant: tenants.find(t => t.tenant_id === 'DEFAULT')
      }
    });
    
  } catch (error) {
    console.log('[TENANT_LIST_ERROR]', error.message);
    
    res.status(500).json({
      error: 'list_error',
      message: 'Failed to list tenants',
      details: error.message
    });
  }
});

// GET /api/agent/register/:tenant_id - Détails tenant spécifique
router.get('/register/:tenant_id', async (req, res) => {
  try {
    const { tenant_id } = req.params;
    
    const tenant = getTenant(tenant_id);
    
    if (!tenant || tenant.tenant_id === 'DEFAULT') {
      return res.status(404).json({
        error: 'tenant_not_found',
        message: `Tenant ${tenant_id} not found`
      });
    }
    
    console.log('[TENANT_DETAILS_REQUESTED]', {
      tenant_id,
      status: tenant.status,
      timestamp: new Date()
    });
    
    res.json({
      success: true,
      tenant: {
        tenant_id: tenant.tenant_id,
        status: tenant.status,
        config: tenant.config,
        limits: tenant.limits,
        usage_count: tenant.usage_count,
        created_at: tenant.created_at,
        api_key: tenant.api_key ? 'ak_' + tenant.api_key.substring(3, 10) + '****' : null
      }
    });
    
  } catch (error) {
    console.log('[TENANT_DETAILS_ERROR]', error.message);
    
    res.status(500).json({
      error: 'details_error',
      message: 'Failed to get tenant details',
      details: error.message
    });
  }
});

// PUT /api/agent/register/:tenant_id - Mettre à jour tenant
router.put('/register/:tenant_id', async (req, res) => {
  try {
    const { tenant_id } = req.params;
    const updates = req.body;
    
    // Champs autorisés pour mise à jour
    const allowedUpdates = [
      'outbound_enabled',
      'followup_enabled', 
      'ai_enabled',
      'max_per_run',
      'cooldown_hours',
      'max_daily_actions',
      'phone_number_id',
      'stripe_account'
    ];
    
    const filteredUpdates = {};
    for (const [key, value] of Object.entries(updates)) {
      if (allowedUpdates.includes(key)) {
        filteredUpdates[key] = value;
      }
    }
    
    if (Object.keys(filteredUpdates).length === 0) {
      return res.status(400).json({
        error: 'no_valid_updates',
        message: 'No valid fields to update',
        allowed_fields: allowedUpdates
      });
    }
    
    const { updateTenantConfig } = require('../services/tenantManager');
    const result = updateTenantConfig(tenant_id, filteredUpdates);
    
    if (!result.success) {
      return res.status(500).json({
        error: 'update_failed',
        message: result.error
      });
    }
    
    console.log('[TENANT_UPDATED]', {
      tenant_id,
      updates: Object.keys(filteredUpdates),
      timestamp: new Date()
    });
    
    BusinessLogger.logWebhookReceived('tenant_updated', tenant_id);
    
    res.json({
      success: true,
      message: 'Tenant updated successfully',
      tenant: result.tenant,
      updated_fields: Object.keys(filteredUpdates)
    });
    
  } catch (error) {
    console.log('[TENANT_UPDATE_ERROR]', error.message);
    
    res.status(500).json({
      error: 'update_error',
      message: 'Failed to update tenant',
      details: error.message
    });
  }
});

// POST /api/agent/register/:tenant_id/pause - Mettre en pause tenant
router.post('/register/:tenant_id/pause', async (req, res) => {
  try {
    const { tenant_id } = req.params;
    const { reason = 'manual_pause' } = req.body;
    
    const { updateTenantStatus } = require('../services/tenantManager');
    const result = updateTenantStatus(tenant_id, 'PAUSED');
    
    if (!result.success) {
      return res.status(500).json({
        error: 'pause_failed',
        message: result.error
      });
    }
    
    console.log('[TENANT_PAUSED]', {
      tenant_id,
      reason,
      timestamp: new Date()
    });
    
    BusinessLogger.logWebhookReceived('tenant_paused', tenant_id);
    
    res.json({
      success: true,
      message: 'Tenant paused successfully',
      tenant: result.tenant,
      paused_at: new Date(),
      effects: [
        'Outbound messages stopped',
        'Follow-up messages stopped', 
        'Inbound messages continue',
        'Manual activation required'
      ]
    });
    
  } catch (error) {
    console.log('[TENANT_PAUSE_ERROR]', error.message);
    
    res.status(500).json({
      error: 'pause_error',
      message: 'Failed to pause tenant',
      details: error.message
    });
  }
});

// POST /api/agent/register/:tenant_id/activate - Activer tenant
router.post('/register/:tenant_id/activate', async (req, res) => {
  try {
    const { tenant_id } = req.params;
    const { reason = 'manual_activation' } = req.body;
    
    const { updateTenantStatus } = require('../services/tenantManager');
    const result = updateTenantStatus(tenant_id, 'ACTIVE');
    
    if (!result.success) {
      return res.status(500).json({
        error: 'activation_failed',
        message: result.error
      });
    }
    
    console.log('[TENANT_ACTIVATED]', {
      tenant_id,
      reason,
      timestamp: new Date()
    });
    
    BusinessLogger.logWebhookReceived('tenant_activated', tenant_id);
    
    res.json({
      success: true,
      message: 'Tenant activated successfully',
      tenant: result.tenant,
      activated_at: new Date(),
      effects: [
        'All features enabled according to config',
        'Outbound can start if enabled',
        'Follow-up can start if enabled'
      ]
    });
    
  } catch (error) {
    console.log('[TENANT_ACTIVATION_ERROR]', error.message);
    
    res.status(500).json({
      error: 'activation_error',
      message: 'Failed to activate tenant',
      details: error.message
    });
  }
});

// DELETE /api/agent/register/:tenant_id - Supprimer tenant (admin)
router.delete('/register/:tenant_id', async (req, res) => {
  try {
    const { tenant_id } = req.params;
    
    const { deleteTenant } = require('../services/tenantManager');
    const result = deleteTenant(tenant_id);
    
    if (!result.success) {
      return res.status(500).json({
        error: 'deletion_failed',
        message: result.error
      });
    }
    
    console.log('[TENANT_DELETED]', {
      tenant_id,
      timestamp: new Date()
    });
    
    BusinessLogger.logWebhookReceived('tenant_deleted', tenant_id);
    
    res.json({
      success: true,
      message: 'Tenant deleted successfully',
      deleted_at: new Date(),
      warning: 'All tenant data has been permanently removed'
    });
    
  } catch (error) {
    console.log('[TENANT_DELETION_ERROR]', error.message);
    
    res.status(500).json({
      error: 'deletion_error',
      message: 'Failed to delete tenant',
      details: error.message
    });
  }
});

module.exports = router;
