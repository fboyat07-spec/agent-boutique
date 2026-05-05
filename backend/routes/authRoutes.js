// ACTION 7 - Authentification simple (safe)

const express = require('express');
const { validateApiKey, getTenantByApiKey } = require('../services/tenantManager');
const BusinessLogger = require('./businessLogger');

const router = express.Router();

// POST /api/auth/login - Authentification simple avec API key
router.post('/login', async (req, res) => {
  try {
    const { api_key } = req.body;
    
    console.log('[AUTH_LOGIN_ATTEMPT]', {
      ip: req.ip,
      user_agent: req.get('User-Agent'),
      timestamp: new Date()
    });
    
    if (!api_key) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'API key required',
        hint: 'Provide API key in request body'
      });
    }
    
    // Valider API key
    const validation = validateApiKey(api_key);
    
    if (!validation.valid) {
      console.log('[AUTH_LOGIN_INVALID_KEY]', {
        ip: req.ip,
        reason: validation.reason
      });
      
      BusinessLogger.logAuthEvent('login_failed', null, api_key, req.ip, {
        reason: validation.reason
      });
      
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Invalid API key',
        reason: validation.reason
      });
    }
    
    // Obtenir tenant
    const tenant = getTenantByApiKey(api_key);
    
    if (!tenant) {
      console.log('[AUTH_LOGIN_NO_TENANT]', {
        ip: req.ip
      });
      
      BusinessLogger.logAuthEvent('login_failed', null, api_key, req.ip, {
        reason: 'tenant_not_found'
      });
      
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Tenant not found for API key'
      });
    }
    
    // Vérifier statut tenant
    if (tenant.status !== 'ACTIVE') {
      console.log('[AUTH_LOGIN_INACTIVE_TENANT]', {
        tenant_id: tenant.tenant_id,
        status: tenant.status,
        ip: req.ip
      });
      
      BusinessLogger.logAuthEvent('login_blocked', tenant.tenant_id, api_key, req.ip, {
        reason: 'tenant_inactive',
        status: tenant.status
      });
      
      return res.status(403).json({
        error: 'forbidden',
        message: 'Tenant account is not active',
        status: tenant.status
      });
    }
    
    // Authentification réussie
    const sessionData = {
      tenant_id: tenant.tenant_id,
      api_key: api_key,
      authenticated: true,
      login_time: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 heures
    };
    
    console.log('[AUTH_LOGIN_SUCCESS]', {
      tenant_id: tenant.tenant_id,
      ip: req.ip
    });
    
    BusinessLogger.logAuthEvent('login_success', tenant.tenant_id, api_key, req.ip);
    
    res.json({
      success: true,
      message: 'Authentication successful',
      session: sessionData,
      tenant: {
        tenant_id: tenant.tenant_id,
        status: tenant.status,
        created_at: tenant.created_at
      },
      metadata: {
        login_at: new Date(),
        expires_in: '24h'
      }
    });
    
  } catch (error) {
    console.log('[AUTH_LOGIN_ERROR]', error.message);
    
    res.status(500).json({
      error: 'login_error',
      message: 'Authentication failed',
      details: error.message
    });
  }
});

// POST /api/auth/verify - Vérifier session/API key
router.post('/verify', async (req, res) => {
  try {
    const { api_key } = req.body;
    
    console.log('[AUTH_VERIFY_ATTEMPT]', {
      ip: req.ip
    });
    
    if (!api_key) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'API key required'
      });
    }
    
    // Valider API key
    const validation = validateApiKey(api_key);
    
    if (!validation.valid) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Invalid API key',
        reason: validation.reason
      });
    }
    
    // Obtenir tenant
    const tenant = getTenantByApiKey(api_key);
    
    if (!tenant || tenant.status !== 'ACTIVE') {
      return res.status(403).json({
        error: 'forbidden',
        message: 'Tenant not found or inactive'
      });
    }
    
    console.log('[AUTH_VERIFY_SUCCESS]', {
      tenant_id: tenant.tenant_id
    });
    
    res.json({
      valid: true,
      tenant_id: tenant.tenant_id,
      status: tenant.status,
      verified_at: new Date()
    });
    
  } catch (error) {
    console.log('[AUTH_VERIFY_ERROR]', error.message);
    
    res.status(500).json({
      error: 'verify_error',
      message: 'Verification failed',
      details: error.message
    });
  }
});

// POST /api/auth/logout - Logout (simple validation)
router.post('/logout', async (req, res) => {
  try {
    const { api_key } = req.body;
    
    console.log('[AUTH_LOGOUT_ATTEMPT]', {
      ip: req.ip
    });
    
    if (!api_key) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'API key required'
      });
    }
    
    // Valider API key pour le logging
    const validation = validateApiKey(api_key);
    
    if (validation.valid) {
      const tenant = getTenantByApiKey(api_key);
      
      if (tenant) {
        console.log('[AUTH_LOGOUT_SUCCESS]', {
          tenant_id: tenant.tenant_id,
          ip: req.ip
        });
        
        BusinessLogger.logAuthEvent('logout', tenant.tenant_id, api_key, req.ip);
      }
    }
    
    // Dans une implémentation simple, on retourne juste succès
    // Pas de session à invalider (stateless)
    
    res.json({
      success: true,
      message: 'Logged out successfully',
      logged_out_at: new Date()
    });
    
  } catch (error) {
    console.log('[AUTH_LOGOUT_ERROR]', error.message);
    
    res.status(500).json({
      error: 'logout_error',
      message: 'Logout failed',
      details: error.message
    });
  }
});

// GET /api/auth/me - Obtenir info utilisateur courant
router.get('/me', async (req, res) => {
  try {
    const api_key = req.headers['x-api-key'] || req.headers['X-API-Key'] || req.query.api_key;
    
    if (!api_key) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'API key required',
        hint: 'Provide API key in X-API-Key header or api_key query parameter'
      });
    }
    
    // Valider API key
    const validation = validateApiKey(api_key);
    
    if (!validation.valid) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Invalid API key'
      });
    }
    
    // Obtenir tenant
    const tenant = getTenantByApiKey(api_key);
    
    if (!tenant) {
      return res.status(404).json({
        error: 'not_found',
        message: 'Tenant not found'
      });
    }
    
    console.log('[AUTH_ME_REQUEST]', {
      tenant_id: tenant.tenant_id
    });
    
    res.json({
      tenant: {
        tenant_id: tenant.tenant_id,
        status: tenant.status,
        created_at: tenant.created_at,
        usage_count: tenant.usage_count
      },
      permissions: {
        can_view_dashboard: true,
        can_config_agent: true,
        can_view_analytics: true,
        can_manage_billing: true
      },
      metadata: {
        retrieved_at: new Date()
      }
    });
    
  } catch (error) {
    console.log('[AUTH_ME_ERROR]', error.message);
    
    res.status(500).json({
      error: 'me_error',
      message: 'Failed to get user info',
      details: error.message
    });
  }
});

// POST /api/auth/refresh - Rafraîchir session (simple validation)
router.post('/refresh', async (req, res) => {
  try {
    const { api_key } = req.body;
    
    console.log('[AUTH_REFRESH_ATTEMPT]', {
      ip: req.ip
    });
    
    if (!api_key) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'API key required'
      });
    }
    
    // Valider API key
    const validation = validateApiKey(api_key);
    
    if (!validation.valid) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Invalid API key'
      });
    }
    
    // Obtenir tenant
    const tenant = getTenantByApiKey(api_key);
    
    if (!tenant || tenant.status !== 'ACTIVE') {
      return res.status(403).json({
        error: 'forbidden',
        message: 'Tenant not found or inactive'
      });
    }
    
    // Dans une implémentation simple, on retourne juste les infos mises à jour
    const sessionData = {
      tenant_id: tenant.tenant_id,
      api_key: api_key,
      authenticated: true,
      refresh_time: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };
    
    console.log('[AUTH_REFRESH_SUCCESS]', {
      tenant_id: tenant.tenant_id
    });
    
    res.json({
      success: true,
      message: 'Session refreshed successfully',
      session: sessionData,
      tenant: {
        tenant_id: tenant.tenant_id,
        status: tenant.status
      },
      metadata: {
        refreshed_at: new Date(),
        expires_in: '24h'
      }
    });
    
  } catch (error) {
    console.log('[AUTH_REFRESH_ERROR]', error.message);
    
    res.status(500).json({
      error: 'refresh_error',
      message: 'Failed to refresh session',
      details: error.message
    });
  }
});

// GET /api/auth/status - Statut du service d'authentification
router.get('/status', async (req, res) => {
  try {
    console.log('[AUTH_STATUS_REQUESTED]');
    
    const status = {
      service: 'authentication',
      status: 'healthy',
      enabled: true,
      features: {
        api_key_auth: true,
        tenant_validation: true,
        session_management: true,
        rate_limiting: false
      },
      security: {
        api_key_required: true,
        tenant_isolation: true,
        status_validation: true
      },
      metadata: {
        checked_at: new Date(),
        version: 'v1.0'
      }
    };
    
    console.log('[AUTH_STATUS_GENERATED]', {
      service: status.service,
      status: status.status
    });
    
    res.json(status);
    
  } catch (error) {
    console.log('[AUTH_STATUS_ERROR]', error.message);
    
    res.status(500).json({
      error: 'status_error',
      message: 'Failed to get auth service status',
      details: error.message
    });
  }
});

module.exports = router;
