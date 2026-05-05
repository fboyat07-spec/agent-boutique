// ACTION 7 - Multi-tenant safe (tenant_id obligatoire)

const SaaSTenant = require('../models/SaaSTenant');

// Résoudre tenant_id depuis phone_number_id (WhatsApp)
async function resolveTenantFromPhoneId(phone_number_id) {
  try {
    if (!phone_number_id) {
      console.log('[TENANT_RESOLVE_ERROR] No phone_number_id provided');
      return null;
    }
    
    const tenant = await SaaSTenant.findOne({ phone_number_id });
    
    if (!tenant) {
      console.log('[TENANT_NOT_FOUND]', { phone_number_id });
      return null;
    }
    
    console.log('[TENANT_RESOLVED]', {
      phone_number_id,
      tenant_id: tenant.tenant_id,
      tenant_name: tenant.name
    });
    
    return tenant.tenant_id;
    
  } catch (error) {
    console.log('[TENANT_RESOLVE_ERROR]', error.message);
    return null;
  }
}

// Résoudre tenant_id depuis mapping environnement (fallback)
function resolveTenantFromEnv(phone_number_id) {
  try {
    // Mapping via variable d'environnement
    const mapping = process.env.TENANT_PHONE_MAPPING;
    
    if (!mapping) {
      console.log('[TENANT_ENV_MAPPING] No TENANT_PHONE_MAPPING found');
      return null;
    }
    
    const mappings = JSON.parse(mapping);
    const tenant_id = mappings[phone_number_id];
    
    if (!tenant_id) {
      console.log('[TENANT_ENV_NOT_FOUND]', { phone_number_id });
      return null;
    }
    
    console.log('[TENANT_ENV_RESOLVED]', {
      phone_number_id,
      tenant_id
    });
    
    return tenant_id;
    
  } catch (error) {
    console.log('[TENANT_ENV_ERROR]', error.message);
    return null;
  }
}

// Résolution principale (avec fallbacks)
async function resolveTenantId(phone_number_id) {
  // Essayer résolution DB d'abord
  let tenant_id = await resolveTenantFromPhoneId(phone_number_id);
  
  // Fallback vers mapping environnement
  if (!tenant_id) {
    tenant_id = resolveTenantFromEnv(phone_number_id);
  }
  
  // Validation finale
  if (!tenant_id) {
    console.log('[TENANT_RESOLUTION_FAILED]', { phone_number_id });
    return null;
  }
  
  return tenant_id;
}

// Valider que tenant_id est valide
async function validateTenantId(tenant_id) {
  try {
    if (!tenant_id) {
      return false;
    }
    
    const tenant = await SaaSTenant.findOne({ tenant_id });
    
    if (!tenant) {
      console.log('[TENANT_VALIDATE_FAILED]', { tenant_id });
      return false;
    }
    
    return true;
    
  } catch (error) {
    console.log('[TENANT_VALIDATE_ERROR]', error.message);
    return false;
  }
}

// Wrapper pour opérations multi-tenant
async function withTenantValidation(phone_number_id, operation) {
  try {
    const tenant_id = await resolveTenantId(phone_number_id);
    
    if (!tenant_id) {
      console.log('[TENANT_OPERATION_BLOCKED] No tenant resolved', { phone_number_id });
      return { success: false, reason: 'tenant_not_resolved' };
    }
    
    // Valider que le tenant existe
    const isValid = await validateTenantId(tenant_id);
    if (!isValid) {
      console.log('[TENANT_OPERATION_BLOCKED] Invalid tenant', { tenant_id });
      return { success: false, reason: 'invalid_tenant' };
    }
    
    // Exécuter l'opération avec tenant_id
    const result = await operation(tenant_id);
    
    return { success: true, result, tenant_id };
    
  } catch (error) {
    console.log('[TENANT_OPERATION_ERROR]', error.message);
    return { success: false, reason: 'operation_error', error: error.message };
  }
}

// Filtrer leads par tenant_id
function filterLeadsByTenant(leads, tenant_id) {
  if (!tenant_id) {
    return [];
  }
  
  return leads.filter(lead => lead.tenant_id === tenant_id);
}

// Stats multi-tenant
function getTenantStats() {
  const stats = {
    totalTenants: 0,
    tenantDistribution: {},
    phoneMappings: {}
  };
  
  // Compter les tenants dans la mémoire
  if (global.leadMemory) {
    for (const [key, lead] of global.leadMemory.entries()) {
      const tenant_id = lead.tenant_id;
      
      if (!stats.tenantDistribution[tenant_id]) {
        stats.tenantDistribution[tenant_id] = 0;
      }
      stats.tenantDistribution[tenant_id]++;
    }
  }
  
  stats.totalTenants = Object.keys(stats.tenantDistribution).length;
  
  // Mapping téléphone vers tenant
  if (process.env.TENANT_PHONE_MAPPING) {
    try {
      stats.phoneMappings = JSON.parse(process.env.TENANT_PHONE_MAPPING);
    } catch (e) {
      console.log('[TENANT_MAPPING_PARSE_ERROR]', e.message);
    }
  }
  
  return stats;
}

// Sécurité: vérifier que l'opération est autorisée pour ce tenant
async function checkTenantPermission(tenant_id, operation = 'read') {
  try {
    // Pour l'instant, tous les tenants valides peuvent effectuer toutes les opérations
    // Futur: implémenter permissions granulaires
    
    const isValid = await validateTenantId(tenant_id);
    
    if (!isValid) {
      console.log('[TENANT_PERMISSION_DENIED]', { tenant_id, operation });
      return false;
    }
    
    return true;
    
  } catch (error) {
    console.log('[TENANT_PERMISSION_ERROR]', error.message);
    return false;
  }
}

// Middleware Express pour validation tenant
function tenantMiddleware(req, res, next) {
  // Pour les requêtes qui nécessitent un tenant_id
  const tenant_id = req.headers['x-tenant-id'] || req.query.tenant_id;
  
  if (!tenant_id) {
    return res.status(400).json({
      error: 'Tenant ID required',
      message: 'Provide x-tenant-id header or tenant_id query parameter'
    });
  }
  
  // Valider le tenant
  validateTenantId(tenant_id).then(isValid => {
    if (!isValid) {
      return res.status(403).json({
        error: 'Invalid tenant',
        message: 'Tenant ID is not valid'
      });
    }
    
    // Ajouter tenant_id à la requête
    req.tenant_id = tenant_id;
    next();
  }).catch(error => {
    console.log('[TENANT_MIDDLEWARE_ERROR]', error.message);
    res.status(500).json({
      error: 'Tenant validation failed',
      message: error.message
    });
  });
}

module.exports = {
  resolveTenantId,
  resolveTenantFromPhoneId,
  resolveTenantFromEnv,
  validateTenantId,
  withTenantValidation,
  filterLeadsByTenant,
  getTenantStats,
  checkTenantPermission,
  tenantMiddleware
};
