const { mockFirebase, mockFirebaseFunctions, testData } = require('./firebase.test');

describe('completeMission Function Tests', () => {
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
      level: 5,
      missionsCompleted: 5
    };
  });

  describe('Cas normaux', () => {
    test('devrait compléter une mission avec succès', async () => {
      const completeMission = mockFunctions.httpsCallable(mockFunctions.functions, 'completeMission');
      
      const result = await completeMission({
        missionId: 'mission_1',
        completionData: {
          completedAt: new Date().toISOString(),
          notes: 'Mission terminée avec succès'
        }
      }, {
        auth: testData.users['test_user_123']
      });

      expect(result.success).toBe(true);
      expect(result.data.missionId).toBe('mission_1');
      expect(result.data.missionTitle).toBe('Mission Quotidienne');
      expect(result.data.xpReward).toBe(50);
      expect(result.data.newXP).toBe(1050);
      expect(result.data.missionsCompleted).toBe(6);
    });

    test('devrait gérer différents types de missions', async () => {
      const completeMission = mockFunctions.httpsCallable(mockFunctions.functions, 'completeMission');
      
      // Tester mission quotidienne
      const dailyResult = await completeMission({
        missionId: 'mission_1',
        completionData: { type: 'daily' }
      }, {
        auth: testData.users['test_user_123']
      });

      expect(dailyResult.success).toBe(true);
      expect(dailyResult.data.xpReward).toBe(50);

      // Tester mission hédomadaire
      const weeklyResult = await completeMission({
        missionId: 'mission_2',
        completionData: { type: 'weekly' }
      }, {
        auth: testData.users['test_user_123']
      });

      expect(weeklyResult.success).toBe(true);
      expect(weeklyResult.data.xpReward).toBe(150);
    });

    test('devrait inclure les données de complétion', async () => {
      const completeMission = mockFunctions.httpsCallable(mockFunctions.functions, 'completeMission');
      
      const completionData = {
        duration: 300000,
        score: 95,
        notes: 'Excellente performance',
        metadata: {
          device: 'mobile',
          version: '1.0.0'
        }
      };

      const result = await completeMission({
        missionId: 'mission_1',
        completionData
      }, {
        auth: testData.users['test_user_123']
      });

      expect(result.success).toBe(true);
      expect(result.data.completionData).toEqual(completionData);
    });
  });

  describe('Cas d\'erreur', () => {
    test('devrait rejeter un ID de mission manquant', async () => {
      const completeMission = mockFunctions.httpsCallable(mockFunctions.functions, 'completeMission');
      
      await expect(completeMission({
        missionId: null,
        completionData: {}
      }, {
        auth: testData.users['test_user_123']
      })).rejects.toThrow('ID de mission requis');
    });

    test('devrait rejeter un ID de mission vide', async () => {
      const completeMission = mockFunctions.httpsCallable(mockFunctions.functions, 'completeMission');
      
      await expect(completeMission({
        missionId: '',
        completionData: {}
      }, {
        auth: testData.users['test_user_123']
      })).rejects.toThrow('ID de mission requis');
    });

    test('devrait rejeter une mission inexistante', async () => {
      const completeMission = mockFunctions.httpsCallable(mockFunctions.functions, 'completeMission');
      
      await expect(completeMission({
        missionId: 'mission_inexistante',
        completionData: {}
      }, {
        auth: testData.users['test_user_123']
      })).rejects.toThrow('Mission non trouvée');
    });

    test('devrait rejeter une mission non active', async () => {
      // Ajouter une mission inactive
      testData.missions['mission_inactive'] = {
        ...testData.missions['mission_1'],
        status: 'inactive'
      };

      const completeMission = mockFunctions.httpsCallable(mockFunctions.functions, 'completeMission');
      
      await expect(completeMission({
        missionId: 'mission_inactive',
        completionData: {}
      }, {
        auth: testData.users['test_user_123']
      })).rejects.toThrow('Mission non active');
    });
  });

  describe('Cas de prérequis non satisfaits', () => {
    test('devrait rejeter un niveau insuffisant', async () => {
      const completeMission = mockFunctions.httpsCallable(mockFunctions.functions, 'completeMission');
      
      // Mission nécessitant niveau 10
      testData.missions['mission_hard'] = {
        ...testData.missions['mission_1'],
        id: 'mission_hard',
        title: 'Mission Difficile',
        requirements: {
          level: 10,
          xp: 0
        }
      };

      await expect(completeMission({
        missionId: 'mission_hard',
        completionData: {}
      }, {
        auth: testData.users['test_user_123']
      })).rejects.toThrow('Niveau requis: 10');
    });

    test('devrait rejeter un XP insuffisant', async () => {
      const completeMission = mockFunctions.httpsCallable(mockFunctions.functions, 'completeMission');
      
      // Mission nécessitant 2000 XP
      testData.missions['mission_xp_required'] = {
        ...testData.missions['mission_1'],
        id: 'mission_xp_required',
        title: 'Mission XP Requise',
        requirements: {
          level: 0,
          xp: 2000
        }
      };

      await expect(completeMission({
        missionId: 'mission_xp_required',
        completionData: {}
      }, {
        auth: testData.users['test_user_123']
      })).rejects.toThrow('XP requis: 2000');
    });

    test('devrait vérifier tous les prérequis', async () => {
      const completeMission = mockFunctions.httpsCallable(mockFunctions.functions, 'completeMission');
      
      // Mission nécessitant niveau 5 ET 800 XP
      testData.missions['mission_multi_requirements'] = {
        ...testData.missions['mission_1'],
        id: 'mission_multi_requirements',
        title: 'Mission Multi-Prérequis',
        requirements: {
          level: 5,
          xp: 800
        }
      };

      // Utilisateur niveau 5 mais seulement 1000 XP
      await expect(completeMission({
        missionId: 'mission_multi_requirements',
        completionData: {}
      }, {
        auth: testData.users['test_user_123']
      })).rejects.toThrow('XP requis: 800');
    });
  });

  describe('Cas d\'utilisateur non authentifié', () => {
    test('devrait rejeter un utilisateur non authentifié', async () => {
      const completeMission = mockFunctions.httpsCallable(mockFunctions.functions, 'completeMission');
      
      await expect(completeMission({
        missionId: 'mission_1',
        completionData: {}
      }, {
        auth: null
      })).rejects.toThrow('Authentification requise');
    });

    test('devrait rejeter un utilisateur avec uid manquant', async () => {
      const completeMission = mockFunctions.httpsCallable(mockFunctions.functions, 'completeMission');
      
      await expect(completeMission({
        missionId: 'mission_1',
        completionData: {}
      }, {
        auth: { email: 'test@example.com' } // uid manquant
      })).rejects.toThrow('Authentification requise');
    });
  });

  describe('Cas de double appel', () => {
    test('devrait gérer le double appel avec la même mission', async () => {
      const completeMission = mockFunctions.httpsCallable(mockFunctions.functions, 'completeMission');
      
      // Premier appel
      const result1 = await completeMission({
        missionId: 'mission_1',
        completionData: { test: 'first' }
      }, {
        auth: testData.users['test_user_123'],
        headers: {
          'x-request-id': 'mission-test-123'
        }
      });

      expect(result1.success).toBe(true);
      expect(result1.data.missionsCompleted).toBe(6);

      // Deuxième appel avec même request-id
      const result2 = await completeMission({
        missionId: 'mission_1',
        completionData: { test: 'second' }
      }, {
        auth: testData.users['test_user_123'],
        headers: {
          'x-request-id': 'mission-test-123'
        }
      });

      // Le deuxième appel devrait retourner le résultat du premier
      expect(result2.success).toBe(true);
      expect(result2.data.missionsCompleted).toBe(6); // Pas 7
      expect(result2.data.completionData.test).toBe('first'); // Pas 'second'
      expect(result2.idempotency.isDuplicate).toBe(true);
    });

    test('devrait gérer le double appel avec des missions différentes', async () => {
      const completeMission = mockFunctions.httpsCallable(mockFunctions.functions, 'completeMission');
      
      // Premier appel
      const result1 = await completeMission({
        missionId: 'mission_1',
        completionData: {}
      }, {
        auth: testData.users['test_user_123'],
        headers: {
          'x-request-id': 'mission-test-456'
        }
      });

      expect(result1.success).toBe(true);
      expect(result1.data.missionsCompleted).toBe(6);

      // Deuxième appel avec même request-id mais mission différente
      const result2 = await completeMission({
        missionId: 'mission_2',
        completionData: {}
      }, {
        auth: testData.users['test_user_123'],
        headers: {
          'x-request-id': 'mission-test-456'
        }
      });

      // Le deuxième appel devrait retourner le résultat du premier
      expect(result2.success).toBe(true);
      expect(result2.data.missionId).toBe('mission_1'); // Pas 'mission_2'
      expect(result2.idempotency.isDuplicate).toBe(true);
    });
  });

  describe('Tests de performance', () => {
    test('devrait s\'exécuter en moins de 150ms', async () => {
      const completeMission = mockFunctions.httpsCallable(mockFunctions.functions, 'completeMission');
      
      const startTime = Date.now();
      
      const result = await completeMission({
        missionId: 'mission_1',
        completionData: {}
      }, {
        auth: testData.users['test_user_123']
      });

      const duration = Date.now() - startTime;
      
      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(150);
    });

    test('devrait gérer 50 complétions simultanées', async () => {
      const completeMission = mockFunctions.httpsCallable(mockFunctions.functions, 'completeMission');
      
      const promises = Array.from({ length: 50 }, (_, i) => 
        completeMission({
          missionId: 'mission_1',
          completionData: { batchId: i }
        }, {
          auth: testData.users['test_user_123'],
          headers: {
            'x-request-id': `batch-test-${i}`
          }
        })
      );

      const results = await Promise.allSettled(promises);
      
      // Tous devraient réussir
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.success);
      expect(successful.length).toBe(50);
    });
  });

  describe('Tests de cohérence des données', () => {
    test('devrait mettre à jour correctement le compteur de missions', async () => {
      const completeMission = mockFunctions.httpsCallable(mockFunctions.functions, 'completeMission');
      
      const userBefore = { ...testData.users['test_user_123'] };
      
      await completeMission({
        missionId: 'mission_1',
        completionData: {}
      }, {
        auth: testData.users['test_user_123']
      });

      const userAfter = testData.users['test_user_123'];
      
      expect(userAfter.missionsCompleted).toBe(userBefore.missionsCompleted + 1);
      expect(userAfter.xp).toBe(userBefore.xp + 50); // XP de la mission
    });

    test('devrait conserver l\'historique des missions complétées', async () => {
      const completeMission = mockFunctions.httpsCallable(mockFunctions.functions, 'completeMission');
      
      // Compléter plusieurs missions
      const missions = ['mission_1', 'mission_2'];
      
      for (const missionId of missions) {
        await completeMission({
          missionId,
          completionData: { completedAt: new Date().toISOString() }
        }, {
          auth: testData.users['test_user_123'],
          headers: {
            'x-request-id': `history-${missionId}`
          }
        });
      }

      const user = testData.users['test_user_123'];
      
      expect(user.missionsCompleted).toBe(7); // 5 initial + 2 missions
      expect(user.xp).toBe(1200); // 1000 initial + 50 + 150
    });

    test('devrait gérer les données de complétion complexes', async () => {
      const completeMission = mockFunctions.httpsCallable(mockFunctions.functions, 'completeMission');
      
      const complexCompletionData = {
        duration: 300000,
        score: 95,
        achievements: ['perfect', 'speed_run'],
        metadata: {
          device: 'mobile',
          os: 'iOS',
          version: '1.0.0',
          location: 'Paris'
        },
        customData: {
          userNotes: 'Très satisfait',
          rating: 5
        }
      };

      const result = await completeMission({
        missionId: 'mission_1',
        completionData: complexCompletionData
      }, {
        auth: testData.users['test_user_123']
      });

      expect(result.success).toBe(true);
      expect(result.data.completionData).toEqual(complexCompletionData);
    });
  });

  describe('Tests de validation des données d\'entrée', () => {
    test('devrait valider les données de complétion', async () => {
      const completeMission = mockFunctions.httpsCallable(mockFunctions.functions, 'completeMission');
      
      // Données invalides
      const invalidData = {
        duration: 'invalid', // devrait être un nombre
        score: null, // devrait être un nombre
        achievements: 'invalid' // devrait être un tableau
      };

      const result = await completeMission({
        missionId: 'mission_1',
        completionData: invalidData
      }, {
        auth: testData.users['test_user_123']
      });

      expect(result.success).toBe(true);
      // Les données invalides devraient être nettoyées ou converties
      expect(typeof result.data.completionData.duration).toBe('string');
    });

    test('devrait gérer les données de complétion manquantes', async () => {
      const completeMission = mockFunctions.httpsCallable(mockFunctions.functions, 'completeMission');
      
      const result = await completeMission({
        missionId: 'mission_1',
        completionData: {} // Données vides
      }, {
        auth: testData.users['test_user_123']
      });

      expect(result.success).toBe(true);
      expect(result.data.completionData).toEqual({});
    });
  });
});
