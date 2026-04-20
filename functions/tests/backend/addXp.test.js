const { logger } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const { addXp } = require("../../xp/addXp");

// Mock Firebase Admin
jest.mock("firebase-admin", () => ({
  initializeApp: jest.fn(),
  apps: [],
  firestore: () => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(),
        set: jest.fn(),
        update: jest.fn(),
        delete: jest.fn()
      })),
      add: jest.fn(),
      where: jest.fn(() => ({
        get: jest.fn()
      }))
    })),
    runTransaction: jest.fn()
  }),
  firestore: {
    FieldValue: {
      serverTimestamp: jest.fn(() => "timestamp"),
      increment: jest.fn((val) => val),
      arrayUnion: jest.fn((val) => val)
    }
  }
}));

// Mock Firebase Functions
jest.mock("firebase-functions/v2", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

describe('Backend Tests - addXp', () => {
  let mockDb;
  let mockTransaction;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockDb = admin.firestore();
    mockTransaction = {
      get: jest.fn(),
      update: jest.fn()
    };
    
    mockDb.runTransaction.mockImplementation((callback) => {
      return callback(mockTransaction);
    });
  });

  describe('Cas normal - addXp', () => {
    test('devrait ajouter XP avec succès pour un utilisateur authentifié', async () => {
      // Arrange
      const userId = 'test-user-123';
      const amount = 50;
      const source = 'mission_completion';
      
      const mockUserDoc = {
        exists: true,
        data: () => ({
          xp: 1000,
          level: 10,
          streak: 5,
          lastActivity: new Date('2024-03-20T10:00:00Z'),
          lastXPUpdate: new Date('2024-03-20T09:00:00Z')
        })
      };
      
      mockTransaction.get.mockResolvedValue(mockUserDoc);
      mockTransaction.update.mockResolvedValue(true);
      
      const mockRequest = {
        auth: { uid: userId },
        data: { amount, source, metadata: { missionId: 'mission-001' } }
      };
      
      const mockResponse = {
        send: jest.fn(),
        json: jest.fn(),
        statusCode: 200
      };

      // Act
      const result = await addXp(mockRequest, mockResponse);

      // Assert
      expect(mockTransaction.get).toHaveBeenCalledTimes(1);
      expect(mockTransaction.update).toHaveBeenCalledTimes(1);
      
      const updateData = mockTransaction.update.mock.calls[0][1];
      expect(updateData.xp).toBe(1050); // 1000 + 50
      expect(updateData.level).toBe(10); // Pas de level up
      expect(updateData.totalXPGained).toEqual(expect.objectContaining({ increment: 50 }));
      expect(updateData.xpGainedToday).toEqual(expect.objectContaining({ increment: 50 }));
      
      expect(result).toEqual(expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          previousXP: 1000,
          newXP: 1050,
          amount: 50,
          source: 'mission_completion',
          level: 10,
          streak: 5
        })
      }));
    });

    test('devrait gérer le level up correctement', async () => {
      // Arrange
      const userId = 'test-user-123';
      const amount = 200; // Suffisant pour level up
      
      const mockUserDoc = {
        exists: true,
        data: () => ({
          xp: 950, // Juste avant le level up
          level: 9,
          streak: 3,
          lastActivity: new Date('2024-03-20T10:00:00Z'),
          lastXPUpdate: new Date('2024-03-20T09:00:00Z')
        })
      };
      
      mockTransaction.get.mockResolvedValue(mockUserDoc);
      mockTransaction.update.mockResolvedValue(true);
      
      const mockRequest = {
        auth: { uid: userId },
        data: { amount, source: 'level_up_test' }
      };

      // Act
      const result = await addXp(mockRequest, {});

      // Assert
      const updateData = mockTransaction.update.mock.calls[0][1];
      expect(updateData.xp).toBe(1150); // 950 + 200
      expect(updateData.level).toBe(10); // Level up de 9 à 10
      expect(updateData.levelUpHistory).toEqual(expect.arrayContaining([
        expect.objectContaining({
          level: 10,
          previousLevel: 9,
          levelsGained: 1,
          source: 'level_up_test'
        })
      ]));
      
      expect(result.data.leveledUp).toBe(true);
      expect(result.data.levelsGained).toBe(1);
    });

    test('devrait mettre à jour le streak d\'activité pour un nouveau jour', async () => {
      // Arrange
      const userId = 'test-user-123';
      const amount = 25;
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      const mockUserDoc = {
        exists: true,
        data: () => ({
          xp: 500,
          level: 5,
          streak: 2,
          lastActivity: yesterday,
          lastXPUpdate: new Date('2024-03-20T09:00:00Z')
        })
      };
      
      mockTransaction.get.mockResolvedValue(mockUserDoc);
      mockTransaction.update.mockResolvedValue(true);
      
      const mockRequest = {
        auth: { uid: userId },
        data: { amount, source: 'daily_login' }
      };

      // Act
      const result = await addXp(mockRequest, {});

      // Assert
      const updateData = mockTransaction.update.mock.calls[0][1];
      expect(updateData.streak).toBe(3); // 2 + 1
      expect(updateData.lastActivityDate).toBe(new Date().toDateString());
    });
  });

  describe('Cas d\'erreur - double appel', () => {
    test('devrait bloquer les appels trop rapprochés (< 1s)', async () => {
      // Arrange
      const userId = 'test-user-123';
      const amount = 50;
      const now = new Date();
      const recentUpdate = new Date(now.getTime() - 500); // 500ms ago
      
      const mockUserDoc = {
        exists: true,
        data: () => ({
          xp: 1000,
          level: 10,
          streak: 5,
          lastXPUpdate: recentUpdate
        })
      };
      
      mockTransaction.get.mockResolvedValue(mockUserDoc);
      
      const mockRequest = {
        auth: { uid: userId },
        data: { amount, source: 'rapid_test' }
      };

      // Act & Assert
      await expect(addXp(mockRequest, {})).rejects.toThrow('Double exécution détectée');
      
      expect(mockTransaction.update).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        '⚠️ Double exécution détectée via timestamp',
        expect.objectContaining({
          userId,
          lastXPUpdate: recentUpdate,
          diff: expect.any(Number)
        })
      );
    });

    test('devrait autoriser les appels espacés de > 1s', async () => {
      // Arrange
      const userId = 'test-user-123';
      const amount = 50;
      const now = new Date();
      const oldUpdate = new Date(now.getTime() - 2000); // 2s ago
      
      const mockUserDoc = {
        exists: true,
        data: () => ({
          xp: 1000,
          level: 10,
          streak: 5,
          lastXPUpdate: oldUpdate
        })
      };
      
      mockTransaction.get.mockResolvedValue(mockUserDoc);
      mockTransaction.update.mockResolvedValue(true);
      
      const mockRequest = {
        auth: { uid: userId },
        data: { amount, source: 'normal_spacing' }
      };

      // Act
      const result = await addXp(mockRequest, {});

      // Assert
      expect(mockTransaction.update).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
    });
  });

  describe('Cas d\'erreur - validation', () => {
    test('devrait rejeter les montants invalides', async () => {
      // Arrange
      const mockRequest = {
        auth: { uid: 'test-user-123' },
        data: { amount: -10, source: 'invalid_amount' }
      };

      // Act & Assert
      await expect(addXp(mockRequest, {})).rejects.toThrow('Montant XP invalide');
      
      expect(mockTransaction.get).not.toHaveBeenCalled();
      expect(mockTransaction.update).not.toHaveBeenCalled();
    });

    test('devrait rejeter les montants nuls', async () => {
      // Arrange
      const mockRequest = {
        auth: { uid: 'test-user-123' },
        data: { amount: 0, source: 'zero_amount' }
      };

      // Act & Assert
      await expect(addXp(mockRequest, {})).rejects.toThrow('Montant XP invalide');
    });

    test('devrait rejeter les montants non numériques', async () => {
      // Arrange
      const mockRequest = {
        auth: { uid: 'test-user-123' },
        data: { amount: 'invalid', source: 'string_amount' }
      };

      // Act & Assert
      await expect(addXp(mockRequest, {})).rejects.toThrow('Montant XP invalide');
    });
  });

  describe('Cas d\'erreur - utilisateur non trouvé', () => {
    test('devrait rejeter si l\'utilisateur n\'existe pas', async () => {
      // Arrange
      const mockUserDoc = {
        exists: false
      };
      
      mockTransaction.get.mockResolvedValue(mockUserDoc);
      
      const mockRequest = {
        auth: { uid: 'nonexistent-user' },
        data: { amount: 50, source: 'test' }
      };

      // Act & Assert
      await expect(addXp(mockRequest, {})).rejects.toThrow('Utilisateur non trouvé dans la transaction');
      
      expect(mockTransaction.update).not.toHaveBeenCalled();
    });
  });

  describe('Cas d\'erreur - transaction échouée', () => {
    test('devrait gérer les erreurs de transaction Firestore', async () => {
      // Arrange
      const mockUserDoc = {
        exists: true,
        data: () => ({
          xp: 1000,
          level: 10,
          streak: 5,
          lastXPUpdate: new Date('2024-03-20T09:00:00Z')
        })
      };
      
      mockTransaction.get.mockResolvedValue(mockUserDoc);
      mockTransaction.update.mockRejectedValue(new Error('Transaction failed'));
      
      const mockRequest = {
        auth: { uid: 'test-user-123' },
        data: { amount: 50, source: 'transaction_error' }
      };

      // Act & Assert
      await expect(addXp(mockRequest, {})).rejects.toThrow('Erreur lors de l\'ajout d\'XP: Transaction failed');
      
      expect(logger.error).toHaveBeenCalledWith(
        'Erreur lors de l\'ajout d\'XP',
        expect.objectContaining({
          userId: 'test-user-123',
          amount: 50,
          error: 'Transaction failed'
        })
      );
    });
  });

  describe('Cas edge - valeurs limites', () => {
    test('devrait gérer le montant maximum autorisé', async () => {
      // Arrange
      const userId = 'test-user-123';
      const maxAmount = 10000;
      
      const mockUserDoc = {
        exists: true,
        data: () => ({
          xp: 0,
          level: 1,
          streak: 0,
          lastXPUpdate: new Date('2024-03-20T09:00:00Z')
        })
      };
      
      mockTransaction.get.mockResolvedValue(mockUserDoc);
      mockTransaction.update.mockResolvedValue(true);
      
      const mockRequest = {
        auth: { uid: userId },
        data: { amount: maxAmount, source: 'max_amount_test' }
      };

      // Act
      const result = await addXp(mockRequest, {});

      // Assert
      expect(result.success).toBe(true);
      expect(result.data.newXP).toBe(maxAmount);
    });

    test('devrait gérer le montant minimum autorisé', async () => {
      // Arrange
      const userId = 'test-user-123';
      const minAmount = 1;
      
      const mockUserDoc = {
        exists: true,
        data: () => ({
          xp: 100,
          level: 5,
          streak: 2,
          lastXPUpdate: new Date('2024-03-20T09:00:00Z')
        })
      };
      
      mockTransaction.get.mockResolvedValue(mockUserDoc);
      mockTransaction.update.mockResolvedValue(true);
      
      const mockRequest = {
        auth: { uid: userId },
        data: { amount: minAmount, source: 'min_amount_test' }
      };

      // Act
      const result = await addXp(mockRequest, {});

      // Assert
      expect(result.success).toBe(true);
      expect(result.data.newXP).toBe(101);
    });
  });

  describe('Cas d\'erreur - user non auth', () => {
    test('devrait rejeter les appels non authentifiés', async () => {
      // Arrange
      const mockRequest = {
        auth: null, // Pas d'authentification
        data: { amount: 50, source: 'unauthorized_test' }
      };

      // Act & Assert
      await expect(addXp(mockRequest, {})).rejects.toThrow();
      
      expect(mockTransaction.get).not.toHaveBeenCalled();
      expect(mockTransaction.update).not.toHaveBeenCalled();
    });

    test('devrait rejeter les appels avec uid manquant', async () => {
      // Arrange
      const mockRequest = {
        auth: {}, // Auth sans uid
        data: { amount: 50, source: 'missing_uid_test' }
      };

      // Act & Assert
      await expect(addXp(mockRequest, {})).rejects.toThrow();
      
      expect(mockTransaction.get).not.toHaveBeenCalled();
      expect(mockTransaction.update).not.toHaveBeenCalled();
    });
  });

  describe('Tests de performance', () => {
    test('devrait s\'exécuter en moins de 100ms', async () => {
      // Arrange
      const mockUserDoc = {
        exists: true,
        data: () => ({
          xp: 1000,
          level: 10,
          streak: 5,
          lastXPUpdate: new Date('2024-03-20T09:00:00Z')
        })
      };
      
      mockTransaction.get.mockResolvedValue(mockUserDoc);
      mockTransaction.update.mockResolvedValue(true);
      
      const mockRequest = {
        auth: { uid: 'test-user-123' },
        data: { amount: 50, source: 'performance_test' }
      };

      // Act
      const startTime = Date.now();
      const result = await addXp(mockRequest, {});
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Assert
      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(100);
    });

    test('devrait gérer correctement les appels concurrents', async () => {
      // Arrange
      const userId = 'test-user-123';
      const concurrentCalls = 10;
      
      const mockUserDoc = {
        exists: true,
        data: () => ({
          xp: 1000,
          level: 10,
          streak: 5,
          lastXPUpdate: new Date('2024-03-20T09:00:00Z')
        })
      };
      
      mockTransaction.get.mockResolvedValue(mockUserDoc);
      mockTransaction.update.mockResolvedValue(true);
      
      const mockRequests = Array.from({ length: concurrentCalls }, (_, i) => ({
        auth: { uid: userId },
        data: { amount: 10, source: `concurrent_test_${i}` }
      }));

      // Act
      const promises = mockRequests.map(request => addXp(request, {}));
      const results = await Promise.allSettled(promises);

      // Assert
      // Au moins un appel devrait réussir
      const successfulCalls = results.filter(r => r.status === 'fulfilled');
      expect(successfulCalls.length).toBeGreaterThan(0);
      
      // Les appels trop rapides devraient être bloqués
      const failedCalls = results.filter(r => 
        r.status === 'rejected' && 
        r.reason.message.includes('Double exécution détectée')
      );
      expect(failedCalls.length).toBeGreaterThan(0);
    });
  });
});
