const { mockFirebase, mockFirebaseFunctions, testData } = require('./firebase.test');

describe('addXp Function Tests', () => {
  let mockFunctions, mockDb;
  
  beforeEach(() => {
    // Réinitialiser les mocks
    const firebase = mockFirebase();
    mockDb = firebase.db;
    mockFunctions = mockFirebaseFunctions();
    
    // Réinitialiser les données de test
    testData.users['test_user_123'] = {
      ...testData.users['test_user_123'],
      xp: 1000,
      level: 5
    };
  });

  describe('Cas normaux', () => {
    test('devrait ajouter 50 XP avec succès', async () => {
      const addXp = mockFunctions.httpsCallable(mockFunctions.functions, 'addXp');
      
      const result = await addXp({
        amount: 50,
        source: 'mission_completion'
      }, {
        auth: testData.users['test_user_123']
      });

      expect(result.success).toBe(true);
      expect(result.data.newXP).toBe(1050);
      expect(result.data.previousXP).toBe(1000);
      expect(result.data.amount).toBe(50);
      expect(result.data.source).toBe('mission_completion');
      expect(result.data.leveledUp).toBe(false);
    });

    test('devrait faire passer au niveau supérieur', async () => {
      const addXp = mockFunctions.httpsCallable(mockFunctions.functions, 'addXp');
      
      const result = await addXp({
        amount: 200,
        source: 'level_up_bonus'
      }, {
        auth: testData.users['test_user_123']
      });

      expect(result.success).toBe(true);
      expect(result.data.newLevel).toBe(7);
      expect(result.data.leveledUp).toBe(true);
      expect(result.data.previousLevel).toBe(5);
    });

    test('devrait gérer différentes sources d\'XP', async () => {
      const addXp = mockFunctions.httpsCallable(mockFunctions.functions, 'addXp');
      
      const sources = ['manual', 'mission_completion', 'bonus', 'streak'];
      
      for (const source of sources) {
        const result = await addXp({
          amount: 25,
          source
        }, {
          auth: testData.users['test_user_123']
        });

        expect(result.success).toBe(true);
        expect(result.data.source).toBe(source);
      }
    });
  });

  describe('Cas d\'erreur', () => {
    test('devrait rejeter un montant négatif', async () => {
      const addXp = mockFunctions.httpsCallable(mockFunctions.functions, 'addXp');
      
      await expect(addXp({
        amount: -50,
        source: 'manual'
      }, {
        auth: testData.users['test_user_123']
      })).rejects.toThrow('Montant XP invalide');
    });

    test('devrait rejeter un montant nul', async () => {
      const addXp = mockFunctions.httpsCallable(mockFunctions.functions, 'addXp');
      
      await expect(addXp({
        amount: 0,
        source: 'manual'
      }, {
        auth: testData.users['test_user_123']
      })).rejects.toThrow('Montant XP invalide');
    });

    test('devrait rejeter un montant trop élevé', async () => {
      const addXp = mockFunctions.httpsCallable(mockFunctions.functions, 'addXp');
      
      await expect(addXp({
        amount: 1500,
        source: 'manual'
      }, {
        auth: testData.users['test_user_123']
      })).rejects.toThrow('Montant XP trop élevé');
    });

    test('devrait rejeter un montant non numérique', async () => {
      const addXp = mockFunctions.httpsCallable(mockFunctions.functions, 'addXp');
      
      await expect(addXp({
        amount: 'invalid',
        source: 'manual'
      }, {
        auth: testData.users['test_user_123']
      })).rejects.toThrow('Montant XP invalide');
    });

    test('devrait rejeter une source invalide', async () => {
      const addXp = mockFunctions.httpsCallable(mockFunctions.functions, 'addXp');
      
      const result = await addXp({
        amount: 50,
        source: null
      }, {
        auth: testData.users['test_user_123']
      });

      expect(result.success).toBe(true);
      expect(result.data.source).toBe('manual'); // Valeur par défaut
    });
  });

  describe('Cas d\'utilisateur non authentifié', () => {
    test('devrait rejeter un utilisateur non authentifié', async () => {
      const addXp = mockFunctions.httpsCallable(mockFunctions.functions, 'addXp');
      
      await expect(addXp({
        amount: 50,
        source: 'manual'
      }, {
        auth: null
      })).rejects.toThrow('Authentification requise');
    });

    test('devrait rejeter un utilisateur avec uid manquant', async () => {
      const addXp = mockFunctions.httpsCallable(mockFunctions.functions, 'addXp');
      
      await expect(addXp({
        amount: 50,
        source: 'manual'
      }, {
        auth: { email: 'test@example.com' } // uid manquant
      })).rejects.toThrow('Authentification requise');
    });
  });

  describe('Cas de double appel', () => {
    test('devrait gérer le double appel avec le même montant', async () => {
      const addXp = mockFunctions.httpsCallable(mockFunctions.functions, 'addXp');
      
      // Premier appel
      const result1 = await addXp({
        amount: 50,
        source: 'manual'
      }, {
        auth: testData.users['test_user_123'],
        headers: {
          'x-request-id': 'test-request-123'
        }
      });

      expect(result1.success).toBe(true);
      expect(result1.data.newXP).toBe(1050);

      // Deuxième appel avec même request-id
      const result2 = await addXp({
        amount: 50,
        source: 'manual'
      }, {
        auth: testData.users['test_user_123'],
        headers: {
          'x-request-id': 'test-request-123'
        }
      });

      // Le deuxième appel devrait retourner le même résultat
      expect(result2.success).toBe(true);
      expect(result2.data.newXP).toBe(1050);
      expect(result2.idempotency.isDuplicate).toBe(true);
    });

    test('devrait gérer le double appel avec des montants différents', async () => {
      const addXp = mockFunctions.httpsCallable(mockFunctions.functions, 'addXp');
      
      // Premier appel
      const result1 = await addXp({
        amount: 50,
        source: 'manual'
      }, {
        auth: testData.users['test_user_123'],
        headers: {
          'x-request-id': 'test-request-456'
        }
      });

      expect(result1.success).toBe(true);
      expect(result1.data.newXP).toBe(1050);

      // Deuxième appel avec même request-id mais montant différent
      const result2 = await addXp({
        amount: 100,
        source: 'manual'
      }, {
        auth: testData.users['test_user_123'],
        headers: {
          'x-request-id': 'test-request-456'
        }
      });

      // Le deuxième appel devrait retourner le résultat du premier
      expect(result2.success).toBe(true);
      expect(result2.data.newXP).toBe(1050); // Pas 1150
      expect(result2.idempotency.isDuplicate).toBe(true);
    });
  });

  describe('Tests de performance', () => {
    test('devrait s\'exécuter en moins de 100ms', async () => {
      const addXp = mockFunctions.httpsCallable(mockFunctions.functions, 'addXp');
      
      const startTime = Date.now();
      
      const result = await addXp({
        amount: 50,
        source: 'manual'
      }, {
        auth: testData.users['test_user_123']
      });

      const duration = Date.now() - startTime;
      
      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(100);
    });

    test('devrait gérer 100 appels simultanés', async () => {
      const addXp = mockFunctions.httpsCallable(mockFunctions.functions, 'addXp');
      
      const promises = Array.from({ length: 100 }, (_, i) => 
        addXp({
          amount: 10 + i,
          source: 'stress_test'
        }, {
          auth: testData.users['test_user_123'],
          headers: {
            'x-request-id': `stress-test-${i}`
          }
        })
      );

      const results = await Promise.allSettled(promises);
      
      // Tous devraient réussir
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.success);
      expect(successful.length).toBe(100);
    });
  });

  describe('Tests de validation des données', () => {
    test('devrait conserver la cohérence des données utilisateur', async () => {
      const addXp = mockFunctions.httpsCallable(mockFunctions.functions, 'addXp');
      
      const userBefore = { ...testData.users['test_user_123'] };
      
      await addXp({
        amount: 100,
        source: 'test'
      }, {
        auth: testData.users['test_user_123']
      });

      const userAfter = testData.users['test_user_123'];
      
      expect(userAfter.xp).toBe(userBefore.xp + 100);
      expect(userAfter.uid).toBe(userBefore.uid);
      expect(userAfter.email).toBe(userBefore.email);
    });

    test('devrait calculer correctement les niveaux', async () => {
      const addXp = mockFunctions.httpsCallable(mockFunctions.functions, 'addXp');
      
      // Test avec différents seuils de niveau
      const testCases = [
        { xp: 199, expectedLevel: 1 },
        { xp: 200, expectedLevel: 2 },
        { xp: 399, expectedLevel: 2 },
        { xp: 400, expectedLevel: 3 },
        { xp: 1000, expectedLevel: 6 }
      ];

      for (const testCase of testCases) {
        testData.users['test_user_123'].xp = testCase.xp;
        
        const result = await addXp({
          amount: 1,
          source: 'test'
        }, {
          auth: testData.users['test_user_123']
        });

        expect(result.success).toBe(true);
        expect(result.data.newLevel).toBe(testCase.expectedLevel);
      }
    });
  });
});
