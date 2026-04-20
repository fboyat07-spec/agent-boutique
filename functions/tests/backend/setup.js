// Configuration globale pour les tests backend

// Mock des variables d'environnement
process.env.NODE_ENV = 'test';
process.env.ENVIRONMENT = 'test';
process.env.FUNCTIONS_EMULATOR = 'true';

// Mock Firebase Admin
jest.mock('firebase-admin', () => {
  const mockFirestore = {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(),
        set: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        create: jest.fn()
      })),
      add: jest.fn(),
      where: jest.fn(() => ({
        get: jest.fn(),
        limit: jest.fn(() => ({
          get: jest.fn()
        })),
        orderBy: jest.fn(() => ({
          get: jest.fn()
        }))
      }))
    })),
    runTransaction: jest.fn(),
    Timestamp: {
      fromDate: jest.fn((date) => ({ _seconds: Math.floor(date.getTime() / 1000) })),
      now: jest.fn(() => ({ _seconds: Math.floor(Date.now() / 1000) }))
    },
    FieldValue: {
      serverTimestamp: jest.fn(() => ({ _seconds: Math.floor(Date.now() / 1000) })),
      increment: jest.fn((val) => ({ increment: val })),
      arrayUnion: jest.fn((val) => ({ arrayUnion: val })),
      arrayRemove: jest.fn((val) => ({ arrayRemove: val })),
      delete: jest.fn(() => ({ delete: true }))
    }
  };

  return {
    initializeApp: jest.fn(),
    apps: [],
    firestore: () => mockFirestore,
    credential: {
      cert: jest.fn()
    }
  };
});

// Mock Firebase Functions
jest.mock('firebase-functions/v2', () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  };

  return {
    logger: mockLogger,
    onCall: jest.fn((config, handler) => handler),
    onRequest: jest.fn((config, handler) => handler),
    https: {
      onCall: jest.fn((config, handler) => handler),
      onRequest: jest.fn((config, handler) => handler)
    }
  };
});

// Mock du middleware global
jest.mock('../../middleware/globalMiddleware', () => ({
  applyGlobalMiddleware: jest.fn(() => (req, res, next) => next())
}));

// Mock des services externes
jest.mock('../../middleware/secureTestMode', () => ({
  secureTestModeManager: {
    validateEnvironment: jest.fn(() => ({ isValid: true, violations: [] })),
    validateAuth: jest.fn(() => ({ isValid: true, violations: [] })),
    isTestModeEnabled: jest.fn(() => false)
  }
}));

jest.mock('../../middleware/productionMonitoring', () => ({
  productionMonitoringManager: {
    recordExecution: jest.fn(),
    getCurrentMetrics: jest.fn(() => ({
      totalRequests: 0,
      totalErrors: 0,
      errorRate: 0,
      averageExecutionTime: 0
    }))
  }
}));

jest.mock('../../middleware/costOptimization', () => ({
  costOptimizationManager: {
    checkUserLimits: jest.fn(() => ({ allowed: true })),
    optimizeReads: jest.fn((ops) => ops),
    optimizeWrites: jest.fn((ops) => ({ flushed: ops.length })),
    detectAbuse: jest.fn(() => ({ detected: false }))
  }
}));

// Mock des utilitaires communs
jest.mock('../../utils/helpers', () => ({
  generateId: jest.fn(() => 'test-id-123'),
  calculateXPForLevel: jest.fn((level) => level * 100),
  calculateLevelFromXP: jest.fn((xp) => Math.floor(xp / 100)),
  validateEmail: jest.fn((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)),
  sanitizeInput: jest.fn((input) => input.trim())
}));

// Configuration globale des tests
global.console = {
  ...console,
  // Désactiver les logs pendant les tests sauf en cas d'erreur
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Utilitaires de test globaux
global.createMockUserDoc = (overrides = {}) => ({
  exists: true,
  data: () => ({
    uid: 'test-user-123',
    email: 'test@example.com',
    emailVerified: true,
    displayName: 'Test User',
    active: true,
    tier: 'free',
    xp: 1000,
    level: 10,
    streak: 5,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    lastActivity: new Date('2024-03-20T10:00:00Z'),
    missions: {
      completed: [],
      totalCompleted: 0
    },
    badges: [],
    preferences: {},
    ...overrides
  })
});

global.createMockMissionDoc = (overrides = {}) => ({
  exists: true,
  data: () => ({
    id: 'mission-001',
    title: 'Mission Test',
    description: 'Description de la mission test',
    type: 'daily',
    difficulty: 'medium',
    baseReward: 50,
    active: true,
    requirements: {
      level: 5,
      xp: 500
    },
    createdAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides
  })
});

global.createMockRequest = (overrides = {}) => ({
  auth: {
    uid: 'test-user-123',
    token: {
      email: 'test@example.com',
      email_verified: true,
      name: 'Test User',
      admin: false
    }
  },
  data: {
    test: 'test_data'
  },
  headers: {
    'x-request-id': 'test-request-123',
    'user-agent': 'Test Browser',
    'x-forwarded-for': '127.0.0.1'
  },
  ip: '127.0.0.1',
  ...overrides
});

global.createMockResponse = () => {
  const res = {
    statusCode: 200,
    headers: {},
    data: null,
    send: jest.fn(function(data) {
      this.data = data;
      this.statusCode = this.statusCode || 200;
      return this;
    }),
    json: jest.fn(function(data) {
      this.data = data;
      this.statusCode = this.statusCode || 200;
      this.headers['content-type'] = 'application/json';
      return this;
    }),
    status: jest.fn(function(code) {
      this.statusCode = code;
      return this;
    }),
    set: jest.fn(function(header, value) {
      this.headers[header] = value;
      return this;
    }),
    headersSent: false
  };
  
  return res;
};

global.createMockTransaction = () => ({
  get: jest.fn(),
  set: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  create: jest.fn()
});

// Timeout par défaut pour les tests asynchrones
jest.setTimeout(10000);

// Nettoyage après chaque test
afterEach(() => {
  jest.clearAllMocks();
});

// Configuration de la sortie des tests
process.env.JEST_HTML_REPORTERS_FILE_NAME = 'test-report.html';
process.env.JEST_HTML_REPORTERS_PUBLIC_PATH = './coverage/html-report';

// Exporter les utilitaires pour les tests
module.exports = {
  createMockUserDoc: global.createMockUserDoc,
  createMockMissionDoc: global.createMockMissionDoc,
  createMockRequest: global.createMockRequest,
  createMockResponse: global.createMockResponse,
  createMockTransaction: global.createMockTransaction
};
