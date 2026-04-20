const { functions } = require("firebase-functions/v2");

// Configuration des environnements
const ENVIRONMENTS = {
  development: {
    name: 'development',
    shortName: 'dev',
    isProduction: false,
    isStaging: false,
    isDevelopment: true,
    debug: true,
    verbose: true,
    logLevel: 'debug',
    
    // Base de données
    database: {
      url: 'https://kidai-dev-default-rtdb.firebaseio.com',
      region: 'europe-west1'
    },
    
    // Firestore
    firestore: {
      region: 'europe-west1',
      persistence: false,
      cacheSize: 10485760 // 10MB
    },
    
    // Authentification
    auth: {
      emulatorHost: 'localhost:9099',
      emulatorEnabled: true
    },
    
    // Test mode
    testMode: {
      enabled: true,
      allowBypass: true,
      allowAdminAccess: true,
      allowDebugMode: true,
      mockData: true,
      skipAuth: false
    },
    
    // Monitoring
    monitoring: {
      enabled: true,
      logLevel: 'debug',
      alerting: false,
      metrics: true
    },
    
    // Coûts
    costControl: {
      enabled: false,
      limits: {
        dailyCalls: 10000,
        monthlyCalls: 100000
      }
    },
    
    // Rate limiting
    rateLimit: {
      enabled: true,
      strictMode: false,
      windowMs: 60000,
      maxRequests: 1000
    },
    
    // Cache
    cache: {
      enabled: true,
      ttl: 300, // 5 minutes
      maxSize: 1000
    },
    
    // Features
    features: {
      enableNewUI: true,
      enableBetaFeatures: true,
      enableDebugTools: true,
      enableAnalytics: false
    },
    
    // External services
    externalServices: {
      slack: {
        webhook: process.env.DEV_SLACK_WEBHOOK_URL,
        enabled: false
      },
      email: {
        service: 'dev',
        enabled: false
      },
      analytics: {
        service: 'dev',
        trackingId: 'GA-DEV-123456'
      }
    }
  },
  
  staging: {
    name: 'staging',
    shortName: 'staging',
    isProduction: false,
    isStaging: true,
    isDevelopment: false,
    debug: true,
    verbose: true,
    logLevel: 'info',
    
    // Base de données
    database: {
      url: 'https://kidai-staging-default-rtdb.firebaseio.com',
      region: 'europe-west1'
    },
    
    // Firestore
    firestore: {
      region: 'europe-west1',
      persistence: false,
      cacheSize: 52428800 // 50MB
    },
    
    // Authentification
    auth: {
      emulatorHost: null,
      emulatorEnabled: false
    },
    
    // Test mode
    testMode: {
      enabled: true,
      allowBypass: false,
      allowAdminAccess: true,
      allowDebugMode: true,
      mockData: false,
      skipAuth: false
    },
    
    // Monitoring
    monitoring: {
      enabled: true,
      logLevel: 'info',
      alerting: true,
      metrics: true
    },
    
    // Coûts
    costControl: {
      enabled: true,
      limits: {
        dailyCalls: 5000,
        monthlyCalls: 50000
      }
    },
    
    // Rate limiting
    rateLimit: {
      enabled: true,
      strictMode: true,
      windowMs: 60000,
      maxRequests: 500
    },
    
    // Cache
    cache: {
      enabled: true,
      ttl: 600, // 10 minutes
      maxSize: 5000
    },
    
    // Features
    features: {
      enableNewUI: true,
      enableBetaFeatures: true,
      enableDebugTools: true,
      enableAnalytics: true
    },
    
    // External services
    externalServices: {
      slack: {
        webhook: process.env.STAGING_SLACK_WEBHOOK_URL,
        enabled: true
      },
      email: {
        service: 'staging',
        enabled: true
      },
      analytics: {
        service: 'staging',
        trackingId: 'GA-STAGING-123456'
      }
    }
  },
  
  production: {
    name: 'production',
    shortName: 'prod',
    isProduction: true,
    isStaging: false,
    isDevelopment: false,
    debug: false,
    verbose: false,
    logLevel: 'error',
    
    // Base de données
    database: {
      url: 'https://kidai-prod-default-rtdb.firebaseio.com',
      region: 'europe-west1'
    },
    
    // Firestore
    firestore: {
      region: 'europe-west1',
      persistence: true,
      cacheSize: 104857600 // 100MB
    },
    
    // Authentification
    auth: {
      emulatorHost: null,
      emulatorEnabled: false
    },
    
    // Test mode - TOUJOURS DÉSACTIVÉ EN PROD
    testMode: {
      enabled: false,
      allowBypass: false,
      allowAdminAccess: false,
      allowDebugMode: false,
      mockData: false,
      skipAuth: false
    },
    
    // Monitoring
    monitoring: {
      enabled: true,
      logLevel: 'error',
      alerting: true,
      metrics: true
    },
    
    // Coûts
    costControl: {
      enabled: true,
      limits: {
        dailyCalls: 1000,
        monthlyCalls: 20000
      }
    },
    
    // Rate limiting
    rateLimit: {
      enabled: true,
      strictMode: true,
      windowMs: 60000,
      maxRequests: 100
    },
    
    // Cache
    cache: {
      enabled: true,
      ttl: 1800, // 30 minutes
      maxSize: 10000
    },
    
    // Features
    features: {
      enableNewUI: false,
      enableBetaFeatures: false,
      enableDebugTools: false,
      enableAnalytics: true
    },
    
    // External services
    externalServices: {
      slack: {
        webhook: process.env.PROD_SLACK_WEBHOOK_URL,
        enabled: true
      },
      email: {
        service: 'production',
        enabled: true
      },
      analytics: {
        service: 'production',
        trackingId: 'GA-PROD-123456'
      }
    }
  }
};

// Détection automatique de l'environnement
function detectEnvironment() {
  // Variables d'environnement Firebase
  const firebaseEnv = process.env.FUNCTIONS_EMULATOR ? 'development' : process.env.ENVIRONMENT;
  
  // Variables personnalisées
  const customEnv = process.env.NODE_ENV || process.env.ENV;
  
  // Priorité: Firebase > Node.js > Default
  const environment = firebaseEnv || customEnv || 'development';
  
  // Validation de l'environnement
  if (!ENVIRONMENTS[environment]) {
    console.warn(`Environment "${environment}" not found, falling back to development`);
    return ENVIRONMENTS.development;
  }
  
  return ENVIRONMENTS[environment];
}

// Configuration actuelle
const currentEnvironment = detectEnvironment();

// Utilitaire principal pour obtenir la configuration
function getEnvironment() {
  return currentEnvironment;
}

// Utilitaires spécifiques
function isDevelopment() {
  return currentEnvironment.isDevelopment;
}

function isStaging() {
  return currentEnvironment.isStaging;
}

function isProduction() {
  return currentEnvironment.isProduction;
}

function isTestModeEnabled() {
  return currentEnvironment.testMode.enabled;
}

function getLogLevel() {
  return currentEnvironment.logLevel;
}

function getDatabaseConfig() {
  return currentEnvironment.database;
}

function getFirestoreConfig() {
  return currentEnvironment.firestore;
}

function getAuthConfig() {
  return currentEnvironment.auth;
}

function getTestModeConfig() {
  return currentEnvironment.testMode;
}

function getMonitoringConfig() {
  return currentEnvironment.monitoring;
}

function getCostControlConfig() {
  return currentEnvironment.costControl;
}

function getRateLimitConfig() {
  return currentEnvironment.rateLimit;
}

function getCacheConfig() {
  return currentEnvironment.cache;
}

function getFeaturesConfig() {
  return currentEnvironment.features;
}

function getExternalServicesConfig() {
  return currentEnvironment.externalServices;
}

// Configuration Firebase Functions
function getFirebaseConfig() {
  return {
    databaseURL: currentEnvironment.database.url,
    projectId: currentEnvironment.name === 'production' ? 'kidai-prod' : 
                 currentEnvironment.name === 'staging' ? 'kidai-staging' : 'kidai-dev',
    storageBucket: currentEnvironment.name === 'production' ? 'kidai-prod.appspot.com' : 
                   currentEnvironment.name === 'staging' ? 'kidai-staging.appspot.com' : 'kidai-dev.appspot.com',
    region: currentEnvironment.database.region
  };
}

// Variables d'environnement Firebase Functions
function getFunctionsConfig() {
  return {
    // Variables de configuration Firebase
    FIREBASE_CONFIG: getFirebaseConfig(),
    
    // Variables d'environnement
    ENVIRONMENT: currentEnvironment.name,
    NODE_ENV: currentEnvironment.name,
    DEBUG: currentEnvironment.debug.toString(),
    
    // Configuration des services externes
    SLACK_WEBHOOK_URL: currentEnvironment.externalServices.slack.webhook,
    SLACK_ENABLED: currentEnvironment.externalServices.slack.enabled.toString(),
    
    EMAIL_SERVICE: currentEnvironment.externalServices.email.service,
    EMAIL_ENABLED: currentEnvironment.externalServices.email.enabled.toString(),
    
    ANALYTICS_SERVICE: currentEnvironment.externalServices.analytics.service,
    ANALYTICS_TRACKING_ID: currentEnvironment.externalServices.analytics.trackingId,
    
    // Configuration du monitoring
    MONITORING_ENABLED: currentEnvironment.monitoring.enabled.toString(),
    MONITORING_LOG_LEVEL: currentEnvironment.monitoring.logLevel,
    MONITORING_ALERTING: currentEnvironment.monitoring.alerting.toString(),
    
    // Configuration du contrôle des coûts
    COST_CONTROL_ENABLED: currentEnvironment.costControl.enabled.toString(),
    COST_DAILY_CALLS: currentEnvironment.costControl.limits.dailyCalls.toString(),
    COST_MONTHLY_CALLS: currentEnvironment.costControl.limits.monthlyCalls.toString(),
    
    // Configuration du rate limiting
    RATE_LIMIT_ENABLED: currentEnvironment.rateLimit.enabled.toString(),
    RATE_LIMIT_STRICT: currentEnvironment.rateLimit.strictMode.toString(),
    RATE_LIMIT_WINDOW: currentEnvironment.rateLimit.windowMs.toString(),
    RATE_LIMIT_MAX_REQUESTS: currentEnvironment.rateLimit.maxRequests.toString(),
    
    // Configuration du cache
    CACHE_ENABLED: currentEnvironment.cache.enabled.toString(),
    CACHE_TTL: currentEnvironment.cache.ttl.toString(),
    CACHE_MAX_SIZE: currentEnvironment.cache.maxSize.toString(),
    
    // Configuration du test mode
    TEST_MODE_ENABLED: currentEnvironment.testMode.enabled.toString(),
    TEST_MODE_BYPASS: currentEnvironment.testMode.allowBypass.toString(),
    TEST_MODE_ADMIN: currentEnvironment.testMode.allowAdminAccess.toString(),
    TEST_MODE_DEBUG: currentEnvironment.testMode.allowDebugMode.toString(),
    TEST_MODE_MOCK: currentEnvironment.testMode.mockData.toString(),
    TEST_MODE_SKIP_AUTH: currentEnvironment.testMode.skipAuth.toString(),
    
    // Configuration des features
    FEATURE_NEW_UI: currentEnvironment.features.enableNewUI.toString(),
    FEATURE_BETA: currentEnvironment.features.enableBetaFeatures.toString(),
    FEATURE_DEBUG_TOOLS: currentEnvironment.features.enableDebugTools.toString(),
    FEATURE_ANALYTICS: currentEnvironment.features.enableAnalytics.toString()
  };
}

// Validation de la configuration
function validateEnvironment() {
  const config = getEnvironment();
  const errors = [];
  
  // Validation des champs requis
  if (!config.name) errors.push('Environment name is required');
  if (!config.database.url) errors.push('Database URL is required');
  if (!config.firestore.region) errors.push('Firestore region is required');
  
  // Validation de la cohérence
  if (config.isProduction && config.testMode.enabled) {
    errors.push('Test mode must be disabled in production');
  }
  
  if (config.isProduction && config.debug) {
    errors.push('Debug mode must be disabled in production');
  }
  
  if (errors.length > 0) {
    console.error('Environment validation errors:', errors);
    throw new Error(`Invalid environment configuration: ${errors.join(', ')}`);
  }
  
  return true;
}

// Initialisation
function initializeEnvironment() {
  try {
    // Valider la configuration
    validateEnvironment();
    
    // Logger l'environnement
    console.log(`Environment initialized: ${currentEnvironment.name}`);
    console.log(`Debug mode: ${currentEnvironment.debug}`);
    console.log(`Test mode: ${currentEnvironment.testMode.enabled}`);
    console.log(`Monitoring: ${currentEnvironment.monitoring.enabled}`);
    console.log(`Cost control: ${currentEnvironment.costControl.enabled}`);
    
    return currentEnvironment;
  } catch (error) {
    console.error('Failed to initialize environment:', error);
    throw error;
  }
}

// Exporter les utilitaires
module.exports = {
  // Configuration principale
  getEnvironment,
  currentEnvironment,
  ENVIRONMENTS,
  
  // Utilitaires de détection
  isDevelopment,
  isStaging,
  isProduction,
  isTestModeEnabled,
  
  // Accèsurs de configuration
  getLogLevel,
  getDatabaseConfig,
  getFirestoreConfig,
  getAuthConfig,
  getTestModeConfig,
  getMonitoringConfig,
  getCostControlConfig,
  getRateLimitConfig,
  getCacheConfig,
  getFeaturesConfig,
  getExternalServicesConfig,
  
  // Configuration Firebase
  getFirebaseConfig,
  getFunctionsConfig,
  
  // Validation et initialisation
  validateEnvironment,
  initializeEnvironment,
  
  // Configuration Firebase Functions
  functions: {
    config: () => getFunctionsConfig()
  }
};
