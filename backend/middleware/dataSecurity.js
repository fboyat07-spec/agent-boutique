// ACTION 10 - Sécurité données

// Middleware de sécurité pour protéger les données sensibles
class DataSecurity {
  constructor() {
    this.enabled = process.env.DATA_SECURITY_ENABLED === 'true';
    this.sensitiveFields = [
      'phone',
      'phone_number',
      'phone_number_id',
      'stripe_account',
      'api_key',
      'token',
      'password',
      'secret',
      'key'
    ];
    
    console.log('[DATA_SECURITY_INITIALIZED]', {
      enabled: this.enabled,
      sensitiveFieldsCount: this.sensitiveFields.length
    });
  }
  
  // Middleware principal pour masquer les données sensibles
  sanitizeResponse() {
    return (req, res, next) => {
      if (!this.enabled) {
        return next();
      }
      
      // Intercepter la réponse
      const originalJson = res.json;
      
      res.json = function(data) {
        const sanitizedData = this.sanitizeData(data);
        return originalJson.call(this, sanitizedData);
      }.bind({ sanitizeData: this.sanitizeData.bind(this) });
      
      next();
    };
  }
  
  // Middleware pour valider que tenant_id est présent et filtrer
  requireTenantFilter() {
    return (req, res, next) => {
      if (!this.enabled) {
        return next();
      }
      
      // Pour les routes qui nécessitent un tenant_id
      if (req.method === 'GET' && req.query.tenant_id) {
        // Valider que tenant_id est formaté correctement
        if (!this.isValidTenantId(req.query.tenant_id)) {
          return res.status(400).json({
            error: 'invalid_tenant_id',
            message: 'Invalid tenant_id format'
          });
        }
      }
      
      if (req.method === 'POST' && req.body.tenant_id) {
        if (!this.isValidTenantId(req.body.tenant_id)) {
          return res.status(400).json({
            error: 'invalid_tenant_id',
            message: 'Invalid tenant_id format'
          });
        }
      }
      
      next();
    };
  }
  
  // Nettoyer les données sensibles
  sanitizeData(data) {
    if (!data || typeof data !== 'object') {
      return data;
    }
    
    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeData(item));
    }
    
    const sanitized = {};
    
    for (const [key, value] of Object.entries(data)) {
      if (this.isSensitiveField(key)) {
        sanitized[key] = this.maskValue(value, key);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeData(value);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }
  
  // Vérifier si un champ est sensible
  isSensitiveField(fieldName) {
    const lowerFieldName = fieldName.toLowerCase();
    
    return this.sensitiveFields.some(field => 
      lowerFieldName.includes(field.toLowerCase())
    );
  }
  
  // Masquer une valeur
  maskValue(value, fieldName) {
    if (!value) {
      return value;
    }
    
    const stringValue = String(value);
    
    // Masquer les numéros de téléphone
    if (fieldName.toLowerCase().includes('phone')) {
      if (stringValue.length > 4) {
        return stringValue.slice(0, -4) + '****';
      }
      return '****';
    }
    
    // Masquer les API keys et tokens
    if (fieldName.toLowerCase().includes('key') || 
        fieldName.toLowerCase().includes('token') ||
        fieldName.toLowerCase().includes('secret')) {
      
      if (stringValue.length > 8) {
        return stringValue.substring(0, 8) + '****';
      }
      return '****';
    }
    
    // Masquer les comptes Stripe
    if (fieldName.toLowerCase().includes('stripe')) {
      if (stringValue.length > 10) {
        return stringValue.substring(0, 10) + '****';
      }
      return '****';
    }
    
    // Masquer les mots de passe
    if (fieldName.toLowerCase().includes('password')) {
      return '****';
    }
    
    // Par défaut, masquer partiellement
    if (stringValue.length > 6) {
      return stringValue.substring(0, 3) + '****' + stringValue.substring(stringValue.length - 3);
    }
    
    return '****';
  }
  
  // Valider format tenant_id
  isValidTenantId(tenantId) {
    if (!tenantId || typeof tenantId !== 'string') {
      return false;
    }
    
    // Autoriser alphanumériques, tirets, underscores
    const validPattern = /^[a-zA-Z0-9_-]+$/;
    
    return validPattern.test(tenantId) && tenantId.length >= 3 && tenantId.length <= 50;
  }
  
  // Middleware pour limiter l'exposition de données
  limitDataExposure(maxFields = 50) {
    return (req, res, next) => {
      if (!this.enabled) {
        return next();
      }
      
      const originalJson = res.json;
      
      res.json = function(data) {
        const limitedData = this.limitDataFields(data, maxFields);
        return originalJson.call(this, limitedData);
      }.bind({ limitDataFields: this.limitDataFields.bind(this) });
      
      next();
    };
  }
  
  // Limiter le nombre de champs dans les réponses
  limitDataFields(data, maxFields) {
    if (!data || typeof data !== 'object') {
      return data;
    }
    
    if (Array.isArray(data)) {
      return data.slice(0, maxFields).map(item => this.limitDataFields(item, maxFields));
    }
    
    const fields = Object.keys(data);
    
    if (fields.length <= maxFields) {
      return data;
    }
    
    // Garder les champs les plus importants (prioriser les champs non sensibles)
    const importantFields = fields.filter(field => !this.isSensitiveField(field));
    const sensitiveFields = fields.filter(field => this.isSensitiveField(field));
    
    const selectedFields = [
      ...importantFields.slice(0, Math.max(0, maxFields - sensitiveFields.length)),
      ...sensitiveFields.slice(0, Math.min(sensitiveFields.length, maxFields - importantFields.length))
    ].slice(0, maxFields);
    
    const limited = {};
    
    for (const field of selectedFields) {
      limited[field] = data[field];
    }
    
    return limited;
  }
  
  // Middleware pour ajouter des headers de sécurité
  addSecurityHeaders() {
    return (req, res, next) => {
      // Headers de sécurité HTTP
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      
      // Header custom pour indiquer que les données sont masquées
      if (this.enabled) {
        res.setHeader('X-Data-Sanitized', 'true');
      }
      
      next();
    };
  }
  
  // Middleware pour logger les accès aux données sensibles
  logSensitiveAccess() {
    return (req, res, next) => {
      if (!this.enabled) {
        return next();
      }
      
      const originalJson = res.json;
      
      res.json = function(data) {
        // Détecter si la réponse contient des données sensibles non masquées
        const hasSensitiveData = this.containsSensitiveData(data);
        
        if (hasSensitiveData) {
          console.log('[DATA_SECURITY_SENSITIVE_ACCESS]', {
            method: req.method,
            url: req.url,
            ip: req.ip,
            user_agent: req.get('User-Agent'),
            timestamp: new Date(),
            warning: 'Sensitive data detected in response'
          });
        }
        
        return originalJson.call(this, data);
      }.bind({ containsSensitiveData: this.containsSensitiveData.bind(this) });
      
      next();
    };
  }
  
  // Détecter si des données contiennent des informations sensibles non masquées
  containsSensitiveData(data) {
    if (!data || typeof data !== 'object') {
      return false;
    }
    
    if (Array.isArray(data)) {
      return data.some(item => this.containsSensitiveData(item));
    }
    
    for (const [key, value] of Object.entries(data)) {
      if (this.isSensitiveField(key)) {
        const stringValue = String(value);
        
        // Vérifier si la valeur n'est pas déjà masquée
        if (!stringValue.includes('****')) {
          return true;
        }
      }
      
      if (typeof value === 'object' && value !== null) {
        if (this.containsSensitiveData(value)) {
          return true;
        }
      }
    }
    
    return false;
  }
  
  // Obtenir stats de sécurité
  getSecurityStats() {
    return {
      enabled: this.enabled,
      sensitiveFieldsCount: this.sensitiveFields.length,
      sensitiveFields: this.sensitiveFields,
      uptime: process.uptime()
    };
  }
  
  // Health check sécurité
  healthCheck() {
    const stats = this.getSecurityStats();
    
    const health = {
      status: 'healthy',
      enabled: stats.enabled,
      issues: [],
      recommendations: []
    };
    
    if (!stats.enabled) {
      health.status = 'warning';
      health.issues.push('Data security disabled');
      health.recommendations.push('Enable DATA_SECURITY_ENABLED for production');
    }
    
    if (stats.sensitiveFieldsCount < 5) {
      health.issues.push('Too few sensitive fields configured');
      health.recommendations.push('Review sensitive fields list');
    }
    
    return {
      ...health,
      stats: {
        enabled: stats.enabled,
        sensitiveFieldsCount: stats.sensitiveFieldsCount
      }
    };
  }
}

// Instance globale de sécurité
if (!global.dataSecurity) {
  global.dataSecurity = new DataSecurity();
}

// Fonctions principales (middleware)
const sanitizeResponse = global.dataSecurity.sanitizeResponse();
const requireTenantFilter = global.dataSecurity.requireTenantFilter();
const limitDataExposure = (maxFields) => global.dataSecurity.limitDataExposure(maxFields);
const addSecurityHeaders = global.dataSecurity.addSecurityHeaders();
const logSensitiveAccess = global.dataSecurity.logSensitiveAccess();

// Fonctions utilitaires
function sanitizeData(data) {
  return global.dataSecurity.sanitizeData(data);
}

function isValidTenantId(tenantId) {
  return global.dataSecurity.isValidTenantId(tenantId);
}

function containsSensitiveData(data) {
  return global.dataSecurity.containsSensitiveData(data);
}

// Stats et monitoring
function getSecurityStats() {
  return global.dataSecurity.getSecurityStats();
}

function securityHealthCheck() {
  return global.dataSecurity.healthCheck();
}

module.exports = {
  sanitizeResponse,
  requireTenantFilter,
  limitDataExposure,
  addSecurityHeaders,
  logSensitiveAccess,
  sanitizeData,
  isValidTenantId,
  containsSensitiveData,
  getSecurityStats,
  securityHealthCheck,
  DataSecurity
};
