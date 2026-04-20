module.exports = {
  // Environnement de test
  testEnvironment: 'node',
  
  // Répertoires de test
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js'
  ],
  
  // Fichiers à ignorer
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/'
  ],
  
  // Configuration de couverture
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html'
  ],
  collectCoverageFrom: [
    'functions/**/*.js',
    '!functions/tests/**',
    '!functions/middleware/**'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  
  // Setup et teardown
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  teardownFilesAfterEnv: ['<rootDir>/tests/teardown.js'],
  
  // Timeout pour les tests
  testTimeout: 10000,
  
  // Verbose output
  verbose: true,
  
  // Mocks
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/node_modules/$1',
    '^firebase/(.*)$': '<rootDir>/node_modules/firebase/$1',
    '^@firebase/(.*)$': '<rootDir>/node_modules/@firebase/$1'
  },
  
  // Transformations
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  
  // Variables d'environnement pour les tests
  globals: {
    'process.env.NODE_ENV': 'test',
    'process.env.FIREBASE_CONFIG': '{"projectId":"test-project"}',
    'process.env.FUNCTIONS_EMULATOR': 'true'
  }
};
