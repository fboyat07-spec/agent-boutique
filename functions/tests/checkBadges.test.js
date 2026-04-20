const { mockFirebase, mockFirebaseFunctions, testData } = require('./firebase.test');

describe('checkBadges Function Tests', () => {
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
      missionsCompleted: 5,
      badges: ['badge_1'] // Seulement le premier badge
    };
  });

  describe('Cas normaux', () => {
    test('devrait détecter un nouveau badge débloqué', async () => {
      const checkBadges = mockFunctions.httpsCallable(mockFunctions.functions, 'checkBadges');
      
      // Mettre l'utilisateur au niveau requis pour badge_2
      testData.users['test_user_123'].missionsCompleted = 10;
      
      const result = await checkBadges({
        force: false
      }, {
        auth: testData.users['test_user_123']
      });

      expect(result.success).toBe(true);
      expect(result.data.currentBadges).toContain('badge_1');
      expect(result.data.unlockedBadges.length).toBe(1);
      expect(result.data.unlockedBadges[0].id).toBe('badge_2');
      expect(result.data.unlockedBadges[0].name).toBe('Explorateur');
    });

    test('devrait détecter plusieurs nouveaux badges', async () => {
      const checkBadges = mockFunctions.httpsCallable(mockFunctions.functions, 'checkBadges');
      
      // Mettre l'utilisateur au niveau requis pour plusieurs badges
      testData.users['test_user_123'].level = 10;
      testData.users['test_user_123'].missionsCompleted = 20;
      
      const result = await checkBadges({
        force: false
      }, {
        auth: testData.users['test_user_123']
      });

      expect(result.success).toBe(true);
      expect(result.data.unlockedBadges.length).toBeGreaterThan(0);
      // Devrait contenir badge_2 (10 missions)
      expect(result.data.unlockedBadges.some(b => b.id === 'badge_2')).toBe(true);
    });

    test('devrait retourner les badges actuels sans nouveau débloqué', async () => {
      const checkBadges = mockFunctions.httpsCallable(mockFunctions.functions, 'checkBadges');
      
      const result = await checkBadges({
        force: false
      }, {
        auth: testData.users['test_user_123']
      });

      expect(result.success).toBe(true);
      expect(result.data.currentBadges).toEqual(['badge_1']);
      expect(result.data.unlockedBadges.length).toBe(0);
    });

    test('devrait fonctionner avec le mode forcé', async () => {
      const checkBadges = mockFunctions.httpsCallable(mockFunctions.functions, 'checkBadges');
      
      // Forcer la vérification
      const result = await checkBadges({
        force: true
      }, {
        auth: testData.users['test_user_123']
      });

      expect(result.success).toBe(true);
      expect(result.data.totalBadges).toBe(Object.keys(testData.badges).length);
    });
  });

  describe('Cas d\'erreur', () => {
    test('devrait gérer un utilisateur sans badges', async () => {
      const checkBadges = mockFunctions.httpsCallable(mockFunctions.functions, 'checkBadges');
      
      // Utilisateur sans badges
      testData.users['test_user_no_badges'] = {
        ...testData.users['test_user_123'],
        badges: []
      };

      const result = await checkBadges({
        force: false
      }, {
        auth: testData.users['test_user_no_badges']
      });

      expect(result.success).toBe(true);
      expect(result.data.currentBadges).toEqual([]);
      expect(result.data.unlockedBadges.length).toBeGreaterThan(0); // badge_1 devrait être débloqué
    });

    test('devrait gérer des données de badges invalides', async () => {
      const checkBadges = mockFunctions.httpsCallable(mockFunctions.functions, 'checkBadges');
      
      // Ajouter un badge invalide
      testData.badges['invalid_badge'] = {
        id: 'invalid_badge',
        name: null, // Invalide
        requirements: null // Invalide
      };

      const result = await checkBadges({
        force: false
      }, {
        auth: testData.users['test_user_123']
      });

      expect(result.success).toBe(true);
      // Devrait ignorer le badge invalide
      expect(result.data.unlockedBadges.some(b => b.id === 'invalid_badge')).toBe(false);
    });

    test('devrait gérer des prérequis de badges invalides', async () => {
      const checkBadges = mockFunctions.httpsCallable(mockFunctions.functions, 'checkBadges');
      
      // Ajouter un badge avec prérequis invalides
      testData.badges['invalid_requirements_badge'] = {
        id: 'invalid_requirements_badge',
        name: 'Badge Invalide',
        requirements: {
          invalidField: 'invalid_value'
        }
      };

      const result = await checkBadges({
        force: false
      }, {
        auth: testData.users['test_user_123']
      });

      expect(result.success).toBe(true);
      // Devrait ignorer le badge avec prérequis invalides
      expect(result.data.unlockedBadges.some(b => b.id === 'invalid_requirements_badge')).toBe(false);
    });
  });

  describe('Cas d\'utilisateur non authentifié', () => {
    test('devrait rejeter un utilisateur non authentifié', async () => {
      const checkBadges = mockFunctions.httpsCallable(mockFunctions.functions, 'checkBadges');
      
      await expect(checkBadges({
        force: false
      }, {
        auth: null
      })).rejects.toThrow('Authentification requise');
    });

    test('devrait rejeter un utilisateur avec uid manquant', async () => {
      const checkBadges = mockFunctions.httpsCallable(mockFunctions.functions, 'checkBadges');
      
      await expect(checkBadges({
        force: false
      }, {
        auth: { email: 'test@example.com' } // uid manquant
      })).rejects.toThrow('Authentification requise');
    });
  });

  describe('Cas de double appel', () => {
    test('devrait gérer le double appel avec le même utilisateur', async () => {
      const checkBadges = mockFunctions.httpsCallable(mockFunctions.functions, 'checkBadges');
      
      // Premier appel
      const result1 = await checkBadges({
        force: false
      }, {
        auth: testData.users['test_user_123'],
        headers: {
          'x-request-id': 'badge-test-123'
        }
      });

      expect(result1.success).toBe(true);
      expect(result1.data.currentBadges).toEqual(['badge_1']);

      // Deuxième appel avec même request-id
      const result2 = await checkBadges({
        force: false
      }, {
        auth: testData.users['test_user_123'],
        headers: {
          'x-request-id': 'badge-test-123'
        }
      });

      // Le deuxième appel devrait retourner le résultat du premier
      expect(result2.success).toBe(true);
      expect(result2.data.currentBadges).toEqual(['badge_1']);
      expect(result2.idempotency.isDuplicate).toBe(true);
    });

    test('devrait gérer le double appel avec force différent', async () => {
      const checkBadges = mockFunctions.httpsCallable(mockFunctions.functions, 'checkBadges');
      
      // Premier appel sans force
      const result1 = await checkBadges({
        force: false
      }, {
        auth: testData.users['test_user_123'],
        headers: {
          'x-request-id': 'badge-test-456'
        }
      });

      expect(result1.success).toBe(true);
      expect(result1.data.unlockedBadges.length).toBe(0);

      // Deuxième appel avec même request-id mais force différent
      const result2 = await checkBadges({
        force: true
      }, {
        auth: testData.users['test_user_123'],
        headers: {
          'x-request-id': 'badge-test-456'
        }
      });

      // Le deuxième appel devrait retourner le résultat du premier
      expect(result2.success).toBe(true);
      expect(result2.data.force).toBe(false); // Pas true
      expect(result2.idempotency.isDuplicate).toBe(true);
    });
  });

  describe('Tests de performance', () => {
    test('devrait s\'exécuter en moins de 100ms', async () => {
      const checkBadges = mockFunctions.httpsCallable(mockFunctions.functions, 'checkBadges');
      
      const startTime = Date.now();
      
      const result = await checkBadges({
        force: false
      }, {
        auth: testData.users['test_user_123']
      });

      const duration = Date.now() - startTime;
      
      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(100);
    });

    test('devrait gérer 100 vérifications simultanées', async () => {
      const checkBadges = mockFunctions.httpsCallable(mockFunctions.functions, 'checkBadges');
      
      const promises = Array.from({ length: 100 }, (_, i) => 
        checkBadges({
          force: false
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

  describe('Tests de logique de badges', () => {
    test('devrait vérifier correctement les prérequis de niveau', async () => {
      const checkBadges = mockFunctions.httpsCallable(mockFunctions.functions, 'checkBadges');
      
      // Créer un badge nécessitant niveau 10
      testData.badges['level_10_badge'] = {
        id: 'level_10_badge',
        name: 'Niveau 10',
        requirements: {
          level: 10
        }
      };

      // Utilisateur niveau 5
      testData.users['test_user_123'].level = 5;
      
      const result = await checkBadges({
        force: false
      }, {
        auth: testData.users['test_user_123']
      });

      expect(result.success).toBe(true);
      // Badge ne devrait pas être débloqué
      expect(result.data.unlockedBadges.some(b => b.id === 'level_10_badge')).toBe(false);

      // Utilisateur niveau 10
      testData.users['test_user_123'].level = 10;
      
      const result2 = await checkBadges({
        force: false
      }, {
        auth: testData.users['test_user_123'],
        headers: {
          'x-request-id': 'level-test-123'
        }
      });

      expect(result2.success).toBe(true);
      // Badge devrait être débloqué
      expect(result2.data.unlockedBadges.some(b => b.id === 'level_10_badge')).toBe(true);
    });

    test('devrait vérifier correctement les prérequis de missions', async () => {
      const checkBadges = mockFunctions.httpsCallable(mockFunctions.functions, 'checkBadges');
      
      // Badge nécessitant 25 missions
      testData.badges['missions_25_badge'] = {
        id: 'missions_25_badge',
        name: 'Vétéran',
        requirements: {
          missionsCompleted: 25
        }
      };

      // Utilisateur avec 10 missions
      testData.users['test_user_123'].missionsCompleted = 10;
      
      const result = await checkBadges({
        force: false
      }, {
        auth: testData.users['test_user_123']
      });

      expect(result.success).toBe(true);
      // Badge ne devrait pas être débloqué
      expect(result.data.unlockedBadges.some(b => b.id === 'missions_25_badge')).toBe(false);

      // Utilisateur avec 30 missions
      testData.users['test_user_123'].missionsCompleted = 30;
      
      const result2 = await checkBadges({
        force: false
      }, {
        auth: testData.users['test_user_123'],
        headers: {
          'x-request-id': 'missions-test-123'
        }
      });

      expect(result2.success).toBe(true);
      // Badge devrait être débloqué
      expect(result2.data.unlockedBadges.some(b => b.id === 'missions_25_badge')).toBe(true);
    });

    test('devrait vérifier les prérequis multiples', async () => {
      const checkBadges = mockFunctions.httpsCallable(mockFunctions.functions, 'checkBadges');
      
      // Badge nécessitant niveau 8 ET 15 missions
      testData.badges['multi_requirement_badge'] = {
        id: 'multi_requirement_badge',
        name: 'Multi-Prérequis',
        requirements: {
          level: 8,
          missionsCompleted: 15
        }
      };

      // Utilisateur niveau 10 mais seulement 10 missions
      testData.users['test_user_123'].level = 10;
      testData.users['test_user_123'].missionsCompleted = 10;
      
      const result = await checkBadges({
        force: false
      }, {
        auth: testData.users['test_user_123']
      });

      expect(result.success).toBe(true);
      // Badge ne devrait pas être débloqué (missions insuffisantes)
      expect(result.data.unlockedBadges.some(b => b.id === 'multi_requirement_badge')).toBe(false);

      // Utilisateur avec 20 missions
      testData.users['test_user_123'].missionsCompleted = 20;
      
      const result2 = await checkBadges({
        force: false
      }, {
        auth: testData.users['test_user_123'],
        headers: {
          'x-request-id': 'multi-test-123'
        }
      });

      expect(result2.success).toBe(true);
      // Badge devrait être débloqué
      expect(result2.data.unlockedBadges.some(b => b.id === 'multi_requirement_badge')).toBe(true);
    });
  });

  describe('Tests de cohérence des données', () => {
    test('devrait mettre à jour les badges de l\'utilisateur', async () => {
      const checkBadges = mockFunctions.httpsCallable(mockFunctions.functions, 'checkBadges');
      
      const userBefore = { ...testData.users['test_user_123'] };
      const initialBadges = [...userBefore.badges];
      
      // Mettre l'utilisateur au niveau pour débloquer badge_2
      testData.users['test_user_123'].missionsCompleted = 10;
      
      const result = await checkBadges({
        force: false
      }, {
        auth: testData.users['test_user_123']
      });

      const userAfter = testData.users['test_user_123'];
      
      expect(result.success).toBe(true);
      expect(result.data.unlockedBadges.length).toBe(1);
      expect(result.data.unlockedBadges[0].id).toBe('badge_2');
      
      // Vérifier que le badge a été ajouté
      expect(userAfter.badges).toContain('badge_2');
      expect(userAfter.badges.length).toBe(initialBadges.length + 1);
    });

    test('devrait éviter les doublons de badges', async () => {
      const checkBadges = mockFunctions.httpsCallable(mockFunctions.functions, 'checkBadges');
      
      // Ajouter badge_2 manuellement
      testData.users['test_user_123'].badges.push('badge_2');
      
      const result = await checkBadges({
        force: false
      }, {
        auth: testData.users['test_user_123']
      });

      expect(result.success).toBe(true);
      // Ne devrait pas ajouter badge_2 à nouveau
      const badge2Count = result.data.unlockedBadges.filter(b => b.id === 'badge_2').length;
      expect(badge2Count).toBe(0);
    });

    test('devrait conserver l\'ordre des badges', async () => {
      const checkBadges = mockFunctions.httpsCallable(mockFunctions.functions, 'checkBadges');
      
      // Ajouter plusieurs badges
      testData.users['test_user_123'].level = 15;
      testData.users['test_user_123'].missionsCompleted = 30;
      
      const result = await checkBadges({
        force: false
      }, {
        auth: testData.users['test_user_123']
      });

      expect(result.success).toBe(true);
      expect(result.data.unlockedBadges.length).toBeGreaterThan(0);
      
      // Vérifier que les badges sont dans l'ordre de débloquage
      const unlockedIds = result.data.unlockedBadges.map(b => b.id);
      expect(unlockedIds).toEqual([...new Set(unlockedIds)]); // Pas de doublons
    });
  });

  describe('Tests de validation des paramètres', () => {
    test('devrait gérer le paramètre force invalide', async () => {
      const checkBadges = mockFunctions.httpsCallable(mockFunctions.functions, 'checkBadges');
      
      const result = await checkBadges({
        force: 'invalid' // devrait être traité comme false
      }, {
        auth: testData.users['test_user_123']
      });

      expect(result.success).toBe(true);
      expect(typeof result.data.force).toBe('boolean');
    });

    test('devrait gérer des paramètres supplémentaires', async () => {
      const checkBadges = mockFunctions.httpsCallable(mockFunctions.functions, 'checkBadges');
      
      const result = await checkBadges({
        force: false,
        userId: 'test_user_123', // devrait être ignoré au profit de auth.uid
        extraParam: 'ignored' // devrait être ignoré
      }, {
        auth: testData.users['test_user_123']
      });

      expect(result.success).toBe(true);
      expect(result.data.userId).toBeUndefined();
      expect(result.data.extraParam).toBeUndefined();
    });
  });
});
