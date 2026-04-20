// Configuration globale pour les tests
global.console = {
  ...console,
  // Logger les appels de console pour le débogage des tests
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Mock du temps pour les tests déterministes
const mockDate = new Date('2024-03-22T10:00:00.000Z');
global.Date = class extends Date {
  constructor(...args) {
    if (args.length === 0) {
      super(mockDate);
    } else {
      super(...args);
    }
  }
};

// Mock de setTimeout pour les tests synchrones
global.setTimeout = jest.fn((callback, delay) => {
  // Pour les tests, exécuter immédiatement
  return setTimeout(callback, 0);
});

// Mock de setInterval pour les tests synchrones
global.setInterval = jest.fn((callback, delay) => {
  // Pour les tests, exécuter immédiatement
  return setInterval(callback, 0);
});

// Mock de process pour les tests
global.process = {
  ...process,
  memoryUsage: () => ({
    rss: 50000000,
    heapTotal: 40000000,
    heapUsed: 30000000,
    external: 5000000,
    arrayBuffers: 1000000
  }),
  cpuUsage: () => ({
    user: 1500000,
    system: 500000,
    idle: 3000000
  }),
  uptime: () => 86400000 // 24 heures
};

// Variables d'environnement pour les tests
process.env.NODE_ENV = 'test';
process.env.FIREBASE_CONFIG = JSON.stringify({
  projectId: 'test-project',
  databaseURL: 'https://test-project.firebaseio.com'
});
process.env.FUNCTIONS_EMULATOR = 'true';
process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
process.env.MONITORING_WEBHOOK_URL = 'https://api.test.com/webhooks/monitoring';
process.env.WEBHOOK_AUTH_TOKEN = 'test-token';

// Nettoyer les mocks après chaque test
afterEach(() => {
  jest.clearAllMocks();
});
