// Nettoyage après tous les tests
afterAll(() => {
  // Restaurer la console originale
  global.console = require('console');
  
  // Nettoyer les variables globales
  delete global.Date;
  delete global.setTimeout;
  delete global.setInterval;
  delete global.process;
  
  // Nettoyer les modules require
  jest.resetModules();
  
  // Nettoyer les timers
  jest.clearAllTimers();
  
  // Nettoyer les mocks
  jest.restoreAllMocks();
});

// Nettoyage entre chaque test
afterEach(() => {
  // Nettoyer les appels de console
  if (global.console.log.mockClear) {
    global.console.log.mockClear();
  }
  if (global.console.warn.mockClear) {
    global.console.warn.mockClear();
  }
  if (global.console.error.mockClear) {
    global.console.error.mockClear();
  }
});
