// ACTION 11 - Sécurité accès (minimal)

const { validateApiKey, getTenantByApiKey } = require('../services/tenantManager');
const BusinessLogger = require('../services/businessLogger');

// Middleware d'authentification tenant minimal
class TenantAuth {
  constructor() {
    this.enabled = process.env.SAAS_ENABLED === 'true';
    this.stats = {
      totalRequests: 0,
      authenticatedRequests: 0,
      failedRequests: 0,
      unauthorizedRequests: 0
    };
    
    console.log('[TENANT_AUTH_INITIALIZED]', {
      enabled: this.enabled
    });
  }
  
  // Middleware principal
  authenticate() {
    return (req, res, next) => {
      this.stats.totalRequests++;
      
      // Si SaaS désactivé, autoriser tout
      if (!this.enabled) {
        req.tenant_id = 'DEFAULT';
        req.authenticated = false;
        req.auth_type = 'no_auth';
        
        return next();
      }
      
      // Récupérer API key
      const apiKey = this.extractApiKey(req);
      
      if (!apiKey) {
        this.stats.unauthorizedRequests++;
        
        console.log('[TENANT_AUTH_NO_KEY]', {
          method: req.method,
          url: req.url,
          ip: req.ip
        });
        
        return res.status(401).json({
          error: 'unauthorized',
          message: 'API key required',
          hint: 'Provide API key in X-API-Key header or api_key query parameter'
        });
      }
      
      // Valider API key
      const validation = validateApiKey(apiKey);
      
      if (!validation.valid) {
        this.stats.failedRequests++;
        
        console.log('[TENANT_AUTH_INVALID_KEY]', {
          method: req.method,
          url: req.url,
          ip: req.ip,
          reason: validation.reason
        });
        
        BusinessLogger.logWebhookError('Invalid API key', {
          context: 'tenant_auth',
          ip: req.ip,
          method: req.method,
          url: req.url,
          reason: validation.reason
        });
        
        return res.status(401).json({
          error: 'unauthorized',
          message: 'Invalid API key',
          reason: validation.reason
        });
      }
      
      // Obtenir tenant
      const tenant = getTenantByApiKey(apiKey);
      
      if (!tenant) {
        this.stats.failedRequests++;
        
        console.log('[TENANT_AUTH_NO_TENANT]', {
          method: req.method,
          url: req.url,
          ip: req.ip
        });
        
        return res.status(401).json({
          error: 'unauthorized',
          message: 'Tenant not found for API key'
        });
      }
      
      // Vérifier statut tenant
      if (tenant.status !== 'ACTIVE') {
        this.stats.failedRequests++;
        
        console.log('[TENANT_AUTH_INACTIVE]', {
          tenant_id: tenant.tenant_id,
          status: tenant.status,
          method: req.method,
          url: req.url
        });
        
        return res.status(403).json({
          error: 'forbidden',
          message: 'Tenant account is not active',
          status: tenant.status
        });
      }
      
      // Authentification réussie
      this.stats.authenticatedRequests++;
      
      req.tenant_id = tenant.tenant_id;
      req.tenant = tenant;
      req.api_key = apiKey;
      req.authenticated = true;
      req.auth_type = 'api_key';
      
      console.log('[TENANT_AUTH_SUCCESS]', {
        tenant_id: tenant.tenant_id,
        method: req.method,
        url: req.url,
        ip: req.ip
      });
      
      next();
    };
  }
  
  // Middleware optionnel (pas d'erreur si pas d'auth)
  optionalAuthenticate() {
    return (req, res, next) => {
      this.stats.totalRequests++;
      
      // Si SaaS désactivé, autoriser tout
      if (!this.enabled) {
        req.tenant_id = 'DEFAULT';
        req.authenticated = false;
        req.auth_type = 'no_auth';
        
        return next();
      }
      
      // Récupérer API key
      const apiKey = this.extractApiKey(req);
      
      if (!apiKey) {
        req.tenant_id = 'DEFAULT';
        req.authenticated = false;
        req.auth_type = 'no_key';
        
        return next();
      }
      
      // Valider API key
      const validation = validateApiKey(apiKey);
      
      if (!validation.valid) {
        req.tenant_id = 'DEFAULT';
        req.authenticated = false;
        req.auth_type = 'invalid_key';
        
        return next();
      }
      
      // Obtenir tenant
      const tenant = getTenantByApiKey(apiKey);
      
      if (!tenant || tenant.status !== 'ACTIVE') {
        req.tenant_id = 'DEFAULT';
        req.authenticated = false;
        req.auth_type = 'inactive_tenant';
        
        return next();
      }
      
      // Authentification réussie
      this.stats.authenticatedRequests++;
      
      req.tenant_id = tenant.tenant_id;
      req.tenant = tenant;
      req.api_key = apiKey;
      req.authenticated = true;
      req.auth_type = 'api_key';
      
      next();
    };
  }
  
  // Middleware admin (requiert auth admin)
  adminAuthenticate() {
    return (req, res, next) => {
      // Vérifier admin key
      const adminKey = process.env.ADMIN_API_KEY;
      
      if (!adminKey) {
        console.log('[TENANT_AUTH_ADMIN_DISABLED]');
        return res.status(500).json({
          error: 'admin_disabled',
          message: 'Admin authentication not configured'
        });
      }
      
      const providedKey = this.extractApiKey(req);
      
      if (providedKey !== adminKey) {
        console.log('[TENANT_AUTH_ADMIN_INVALID]', {
          method: req.method,
          url: req.url,
          ip: req.ip
        });
        
        return res.status(401).json({
          error: 'unauthorized',
          message: 'Invalid admin API key'
        });
      }
      
      req.admin = true;
      req.auth_type = 'admin_key';
      
      console.log('[TENANT_AUTH_ADMIN_SUCCESS]', {
        method: req.method,
        url: req.url,
        ip: req.ip
      });
      
      next();
    };
  }
  
  // Extraire API key de la requête
  extractApiKey(req) {
    // Priorité: header > query parameter
    const headerKey = req.headers['x-api-key'] || req.headers['X-API-Key'];
    const queryKey = req.query.api_key;
    
    return headerKey || queryKey || null;
  }
  
  // Middleware de rate limiting par tenant
  tenantRateLimit(maxRequests = 100, windowMs = 60000) { // 100 req/min par défaut
    const requests = new Map(); // tenant_id -> requests
    
    return (req, res, next) => {
      // Si pas de tenant_id, passer
      if (!req.tenant_id) {
        return next();
      }
      
      const now = Date.now();
      const windowStart = now - windowMs;
      
      // Nettoyer anciennes requêtes
      if (!requests.has(req.tenant_id)) {
        requests.set(req.tenant_id, []);
      }
      
      const tenantRequests = requests.get(req.tenant_id);
      
      // Filtrer requêtes dans la fenêtre
      const recentRequests = tenantRequests.filter(timestamp => timestamp > windowStart);
      requests.set(req.tenant_id, recentRequests);
      
      // Vérifier limite
      if (recentRequests.length >= maxRequests) {
        console.log('[TENANT_AUTH_RATE_LIMIT]', {
          tenant_id: req.tenant_id,
          requests: recentRequests.length,
          limit: maxRequests
        });
        
        return res.status(429).json({
          error: 'rate_limited',
          message: 'Too many requests',
          limit: maxRequests,
          windowMs: windowMs / 1000,
          retryAfter: Math.ceil((recentRequests[0] + windowMs - now) / 1000)
        });
      }
      
      // Ajouter requête actuelle
      recentRequests.push(now);
      
      next();
    };
  }
  
  // Middleware de validation tenant
  validateTenant() {
    return (req, res, next) => {
      // Si pas de tenant_id, erreur
      if (!req.tenant_id) {
        return res.status(400).json({
          error: 'bad_request',
          message: 'Tenant ID required'
        });
      }
      
      // Si tenant DEFAULT, erreur pour endpoints tenant-spécifiques
      if (req.tenant_id === 'DEFAULT') {
        return res.status(403).json({
          error: 'forbidden',
          message: 'Default tenant not allowed for this operation'
        });
      }
      
      next();
    };
  }
  
  // Obtenir stats d'authentification
  getAuthStats() {
    const successRate = this.stats.totalRequests > 0 ? 
      (this.stats.authenticatedRequests / this.stats.totalRequests) * 100 : 0;
    
    const failureRate = this.stats.totalRequests > 0 ? 
      (this.stats.failedRequests / this.stats.totalRequests) * 100 : 0;
    
    return {
      enabled: this.enabled,
      stats: this.stats,
      rates: {
        success: Math.round(successRate * 100) / 100,
        failure: Math.round(failureRate * 100) / 100,
        unauthorized: this.stats.totalRequests > 0 ? 
          (this.stats.unauthorizedRequests / this.stats.totalRequests) * 100 : 0
      },
      uptime: process.uptime()
    };
  }
  
  // Health check auth
  healthCheck() {
    const stats = this.getAuthStats();
    
    const health = {
      status: 'healthy',
      enabled: stats.enabled,
      issues: [],
      recommendations: []
    };
    
    // Taux d'échec élevé
    if (stats.rates.failure > 20) {
      health.issues.push('High authentication failure rate');
      health.recommendations.push('Check API key validity and tenant status');
    }
    
    // Taux non autorisé élevé
    if (stats.rates.unauthorized > 30) {
      health.issues.push('High unauthorized request rate');
      health.recommendations.push('Check API key distribution and documentation');
    }
    
    if (health.issues.length > 0) {
      health.status = 'warning';
    }
    
    return {
      ...health,
      stats: {
        totalRequests: stats.stats.totalRequests,
        authenticatedRequests: stats.stats.authenticatedRequests,
        successRate: stats.rates.success,
        failureRate: stats.rates.failure
      }
    };
  }
  
  // Réinitialiser stats
  resetStats() {
    this.stats = {
      totalRequests: 0,
      authenticatedRequests: 0,
      failedRequests: 0,
      unauthorizedRequests: 0
    };
    
    console.log('[TENANT_AUTH_STATS_RESET]');
  }
}

// Instance globale d'authentification
if (!global.tenantAuth) {
  global.tenantAuth = new TenantAuth();
}

// Fonctions principales (middleware)
const authenticate = global.tenantAuth.authenticate();
const optionalAuthenticate = global.tenantAuth.optionalAuthenticate();
const adminAuthenticate = global.tenantAuth.adminAuthenticate();

// Fonctions de configuration
const tenantRateLimit = (maxRequests, windowMs) => 
  global.tenantAuth.tenantRateLimit(maxRequests, windowMs);

const validateTenant = global.tenantAuth.validateTenant();

// Stats et monitoring
function getAuthStats() {
  return global.tenantAuth.getAuthStats();
}

function authHealthCheck() {
  return global.tenantAuth.healthCheck();
}

// Administration
function resetAuthStats() {
  return global.tenantAuth.resetStats();
}

module.exports = {
  authenticate,
  optionalAuthenticate,
  adminAuthenticate,
  tenantRateLimit,
  validateTenant,
  getAuthStats,
  authHealthCheck,
  resetAuthStats,
  TenantAuth
};
