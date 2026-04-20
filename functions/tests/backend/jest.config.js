module.exports = {
  // Environnement de test
  testEnvironment: 'node',
  
  // Racine des tests
  rootDir: '.',
  testMatch: [
    '**/*.test.js',
    '**/*.spec.js'
  ],
  
  // Coverage
  collectCoverage: true,
  collectCoverageFrom: [
    '../**/*.js',
    '!../tests/**',
    '!../node_modules/**',
    '!**/config/**',
    '!**/middleware/**'
  ],
  coverageDirectory: '../coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  
  // Setup
  setupFilesAfterEnv: ['<rootDir>/setup.js'],
  
  // Timeout
  testTimeout: 10000,
  
  // Verbose output
  verbose: true,
  
  // Transformations
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  
  // Modules à ignorer
  modulePathIgnorePatterns: [
    '<rootDir>/../node_modules'
  ],
  
  // Clear mocks entre les tests
  clearMocks: true,
  restoreMocks: true,
  
  // Reporters
  reporters: [
    'default',
    [
      'jest-html-reporters',
      {
        publicPath: '../coverage/html-report',
        filename: 'report.html',
        expand: true
      }
    ]
  ],
  
  // Configuration spécifique aux tests backend
  projects: [
    {
      displayName: 'Backend',
      testMatch: [
        '<rootDir>/**/*.test.js'
      ],
      setupFilesAfterEnv: ['<rootDir>/backend-setup.js']
    }
  ]
};
