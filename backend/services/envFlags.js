// ACTION 12 - Flags ENV (contrôle total)

// Configuration des flags avec valeurs par défaut
const DEFAULT_FLAGS = {
  // Flags principaux
  AI_ENABLED: false,
  FOLLOWUP_ENABLED: true,
  STRIPE_WEBHOOK_ENABLED: true,
  AGENT_MONITORING_ENABLED: true,
  AGENT_OUTBOUND_ENABLED: false,
  
  // Flags de sécurité
  ERROR_PROTECTION_ENABLED: true,
  SAFETY_QUEUE_ENABLED: true,
  FINAL_STATUS_PROTECTION_ENABLED: true,
  MULTI_TENANT_ENABLED: true,
  
  // Flags de features
  DYNAMIC_SCORING_ENABLED: true,
  INTELLIGENT_FOLLOWUP_ENABLED: true,
  TENANT_RESOLUTION_ENABLED: true,
  BUSINESS_LOGGING_ENABLED: true,
  
  // ACTION 12 - Flags ENV critiques pour SUPER AGENT 5/5
  MULTI_AGENT_ENABLED: false,        // Router multi-agent
  AI_ADVANCED_ENABLED: false,        // IA avancée optionnelle
  AUTO_REGULATION_ENABLED: true,     // Auto-régulation anti surcharge
  QUEUE_ENABLED: false,              // File d'exécution
  TENANT_ISOLATION_ENABLED: true,    // Isolation multi-tenant renforcée
  LOOP_PROTECTION_ENABLED: true,     // Protection anti-boucle
  DEGRADED_MODE_ENABLED: true,       // Mode dégradé automatique
  BUSINESS_PRIORITY_ENABLED: true,   // Priorité business dynamique
  CONVERSATION_MEMORY_ENABLED: true, // Mémoire contexte conversation
  SCALING_BATCH_ENABLED: true,        // Scaling par batch
  
  // ACTION 13 - Flags ENV globaux pour SaaS multi-clients
  SAAS_ENABLED: false,              // Mode SaaS multi-clients
  MULTI_INSTANCE_ENABLED: false,    // Multi-instance routing
  TENANT_QUOTA_ENABLED: true,        // Quotas par tenant
  BILLING_ENABLED: false,            // Billing basique
  ADMIN_API_KEY: '',                // Clé API admin
  INSTANCE_COUNT: 1,                // Nombre d'instances
  INSTANCE_ID: 0,                   // ID de cette instance
  TENANT_RESOLVER_ENABLED: true,    // Résolution tenant automatique
  
  // ACTION 9 - Flags UI pour couche produit
  DASHBOARD_ENABLED: false,         // Dashboard client UI
  ANALYTICS_ENABLED: false,          // Analytics avancées
  MARKETPLACE_ENABLED: false,        // Marketplace templates
  EVENT_TRACKING_ENABLED: false,    // Tracking événements
  DASHBOARD_CACHE_ENABLED: true,    // Cache dashboard léger
  UI_AUTH_ENABLED: true,            // Authentification UI
  
  // ACTION 11 - Flags Growth Engine
  LEAD_GEN_ENABLED: false,           // Génération leads auto
  GROWTH_ENGINE_ENABLED: false,      // Engine optimisation
  AB_TEST_ENABLED: false,            // A/B testing messages
  CLOSING_AI_ENABLED: false,         // IA amélioration closing
  PREDICTIVE_SCORE_ENABLED: false,   // Scoring prédictif
  HOT_LEAD_DETECTION_ENABLED: false, // Détection leads chauds
  CONTINUOUS_OPTIMIZER_ENABLED: false, // Optimisation continue
  SPAM_PROTECTION_ENABLED: true,     // Protection anti-spam
  
  // ACTION 1 - Mode Test Global
  AGENT_TEST_MODE: false,           // Mode test pour validation
  
  // ACTION 1 - Mode Validation Réelle
  AGENT_REAL_VALIDATION_MODE: false, // Mode validation réelle (WhatsApp réel)
  
  // ACTION 1 - Mode Paiement Réel
  AGENT_REAL_PAYMENT_ENABLED: false, // Mode paiement réel (Stripe réel)
};

// Lire un flag avec fallback par défaut
function getFlag(flagName) {
  const envValue = process.env[flagName];
  
  if (envValue === undefined) {
    return DEFAULT_FLAGS[flagName] || false;
  }
  
  // Conversion booléenne
  if (typeof envValue === 'string') {
    return envValue.toLowerCase() === 'true';
  }
  
  return Boolean(envValue);
}

// Vérifier si un flag est activé
function isEnabled(flagName) {
  const enabled = getFlag(flagName);
  
  console.log(`[FLAG_CHECK_${flagName}]`, {
    enabled,
    source: envValue !== undefined ? 'environment' : 'default',
    value: process.env[flagName] || DEFAULT_FLAGS[flagName]
  });
  
  return enabled;
}

// Wrapper conditionnel pour exécuter une fonction si flag activé
function withFlag(flagName, fn, fallbackFn = null) {
  return async (...args) => {
    if (isEnabled(flagName)) {
      try {
        return await fn(...args);
      } catch (error) {
        console.log(`[FLAG_ERROR_${flagName}]`, error.message);
        if (fallbackFn) {
          return await fallbackFn(...args);
        }
        throw error;
      }
    } else {
      console.log(`[FLAG_DISABLED_${flagName}]`, { flagName });
      if (fallbackFn) {
        return await fallbackFn(...args);
      }
      return null;
    }
  };
}

// Wrapper multi-flags (tous doivent être activés)
function withAllFlags(flagNames, fn, fallbackFn = null) {
  return async (...args) => {
    const enabledFlags = [];
    const disabledFlags = [];
    
    for (const flagName of flagNames) {
      if (isEnabled(flagName)) {
        enabledFlags.push(flagName);
      } else {
        disabledFlags.push(flagName);
      }
    }
    
    if (disabledFlags.length === 0) {
      try {
        return await fn(...args);
      } catch (error) {
        console.log(`[MULTI_FLAG_ERROR]`, {
          flags: flagNames,
          error: error.message
        });
        if (fallbackFn) {
          return await fallbackFn(...args);
        }
        throw error;
      }
    } else {
      console.log(`[MULTI_FLAG_DISABLED]`, {
        required: flagNames,
        enabled: enabledFlags,
        disabled: disabledFlags
      });
      if (fallbackFn) {
        return await fallbackFn(...args);
      }
      return null;
    }
  };
}

// Wrapper any-flag (au moins un flag activé)
function withAnyFlag(flagNames, fn, fallbackFn = null) {
  return async (...args) => {
    const enabledFlags = [];
    const disabledFlags = [];
    
    for (const flagName of flagNames) {
      if (isEnabled(flagName)) {
        enabledFlags.push(flagName);
      } else {
        disabledFlags.push(flagName);
      }
    }
    
    if (enabledFlags.length > 0) {
      try {
        return await fn(...args);
      } catch (error) {
        console.log(`[ANY_FLAG_ERROR]`, {
          flags: flagNames,
          enabled: enabledFlags,
          error: error.message
        });
        if (fallbackFn) {
          return await fallbackFn(...args);
        }
        throw error;
      }
    } else {
      console.log(`[ANY_FLAG_DISABLED]`, {
        available: flagNames,
        disabled: disabledFlags
      });
      if (fallbackFn) {
        return await fallbackFn(...args);
      }
      return null;
    }
  };
}

// Obtenir tous les flags actuels
function getAllFlags() {
  const flags = {};
  
  for (const flagName of Object.keys(DEFAULT_FLAGS)) {
    flags[flagName] = {
      enabled: getFlag(flagName),
      source: process.env[flagName] !== undefined ? 'environment' : 'default',
      value: process.env[flagName] || DEFAULT_FLAGS[flagName]
    };
  }
  
  return flags;
}

// Stats des flags
function getFlagStats() {
  const flags = getAllFlags();
  const stats = {
    total: Object.keys(flags).length,
    enabled: 0,
    disabled: 0,
    fromEnvironment: 0,
    fromDefault: 0,
    categories: {
      core: { enabled: 0, total: 0 },
      security: { enabled: 0, total: 0 },
      features: { enabled: 0, total: 0 }
    }
  };
  
  for (const [flagName, flagData] of Object.entries(flags)) {
    if (flagData.enabled) {
      stats.enabled++;
    } else {
      stats.disabled++;
    }
    
    if (flagData.source === 'environment') {
      stats.fromEnvironment++;
    } else {
      stats.fromDefault++;
    }
    
    // Catégorisation
    if (['AI_ENABLED', 'FOLLOWUP_ENABLED', 'STRIPE_WEBHOOK_ENABLED', 'AGENT_MONITORING_ENABLED', 'AGENT_OUTBOUND_ENABLED'].includes(flagName)) {
      stats.categories.core.total++;
      if (flagData.enabled) stats.categories.core.enabled++;
    } else if (['ERROR_PROTECTION_ENABLED', 'SAFETY_QUEUE_ENABLED', 'FINAL_STATUS_PROTECTION_ENABLED', 'MULTI_TENANT_ENABLED'].includes(flagName)) {
      stats.categories.security.total++;
      if (flagData.enabled) stats.categories.security.enabled++;
    } else {
      stats.categories.features.total++;
      if (flagData.enabled) stats.categories.features.enabled++;
    }
  }
  
  return stats;
}

// Validation de flags requis
function validateRequiredFlags(requiredFlags) {
  const missing = [];
  const disabled = [];
  
  for (const flagName of requiredFlags) {
    if (!(flagName in DEFAULT_FLAGS)) {
      missing.push(flagName);
    } else if (!isEnabled(flagName)) {
      disabled.push(flagName);
    }
  }
  
  return {
    valid: missing.length === 0 && disabled.length === 0,
    missing,
    disabled
  };
}

// Configuration dynamique (runtime)
function setFlag(flagName, value) {
  // Note: Ceci est pour le debug uniquement, ne change pas process.env
  if (!(flagName in DEFAULT_FLAGS)) {
    console.log(`[FLAG_SET_ERROR] Unknown flag: ${flagName}`);
    return false;
  }
  
  const oldValue = getFlag(flagName);
  const newValue = Boolean(value);
  
  // Stocker en mémoire globale pour la session
  if (!global.runtimeFlags) {
    global.runtimeFlags = {};
  }
  
  global.runtimeFlags[flagName] = newValue;
  
  console.log(`[FLAG_SET_${flagName}]`, {
    oldValue,
    newValue,
    source: 'runtime'
  });
  
  return true;
}

// Reset flags aux valeurs par défaut
function resetFlags() {
  global.runtimeFlags = {};
  console.log('[FLAGS_RESET]', { source: 'runtime' });
}

// Health check des flags
function flagsHealthCheck() {
  const stats = getFlagStats();
  const flags = getAllFlags();
  
  const health = {
    status: 'healthy',
    totalFlags: stats.total,
    enabledFlags: stats.enabled,
    disabledFlags: stats.disabled,
    categories: stats.categories,
    criticalFlags: {
      ERROR_PROTECTION_ENABLED: flags.ERROR_PROTECTION_ENABLED.enabled,
      FINAL_STATUS_PROTECTION_ENABLED: flags.FINAL_STATUS_PROTECTION_ENABLED,
      MULTI_TENANT_ENABLED: flags.MULTI_TENANT_ENABLED
    },
    recommendations: []
  };
  
  // Recommandations
  if (!flags.ERROR_PROTECTION_ENABLED.enabled) {
    health.recommendations.push('Enable ERROR_PROTECTION_ENABLED for production safety');
  }
  
  if (!flags.FINAL_STATUS_PROTECTION_ENABLED.enabled) {
    health.recommendations.push('Enable FINAL_STATUS_PROTECTION_ENABLED to prevent status regression');
  }
  
  if (health.recommendations.length > 0) {
    health.status = 'warning';
  }
  
  return health;
}

module.exports = {
  DEFAULT_FLAGS,
  getFlag,
  isEnabled,
  withFlag,
  withAllFlags,
  withAnyFlag,
  getAllFlags,
  getFlagStats,
  validateRequiredFlags,
  setFlag,
  resetFlags,
  flagsHealthCheck
};
