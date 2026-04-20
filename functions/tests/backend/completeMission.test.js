const { logger } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const { completeMission } = require("../../missions/completeMission");

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

describe('Backend Tests - completeMission', () => {
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

  describe('Cas normal - mission complète', () => {
    test('devrait compléter une mission avec succès', async () => {
      // Arrange
      const userId = 'test-user-123';
      const missionId = 'mission-001';
      
      const mockUserDoc = {
        exists: true,
        data: () => ({
          xp: 1000,
          level: 10,
          streak: 5,
          missions: {
            completed: [],
            totalCompleted: 0
          },
          lastActivity: new Date('2024-03-20T10:00:00Z'),
          lastMissionCompletionAt: new Date('2024-03-20T09:00:00Z')
        })
      };
      
      const mockMissionDoc = {
        exists: true,
        data: () => ({
          id: missionId,
          title: 'Mission Test',
          type: 'daily',
          difficulty: 'medium',
          baseReward: 50,
          active: true,
          requirements: {
            level: 5,
            xp: 500
          }
        })
      };
      
      mockTransaction.get.mockImplementation((ref) => {
        const path = ref.path || ref._path?.path;
        if (path.includes('users')) {
          return Promise.resolve(mockUserDoc);
        } else if (path.includes('missions')) {
          return Promise.resolve(mockMissionDoc);
        }
        return Promise.resolve({ exists: false });
      });
      
      mockTransaction.update.mockResolvedValue(true);
      
      const mockRequest = {
        auth: { uid: userId },
        data: { 
          missionId, 
          completionData: { 
            completionTime: 120, 
            score: 95 
          } 
        }
      };

      // Act
      const result = await completeMission(mockRequest, {});

      // Assert
      expect(mockTransaction.get).toHaveBeenCalledTimes(2);
      expect(mockTransaction.update).toHaveBeenCalledTimes(1);
      
      const updateData = mockTransaction.update.mock.calls[0][1];
      
      // Vérifier la mise à jour XP
      expect(updateData.xp).toBeGreaterThan(1000); // XP ajouté
      expect(updateData.totalXPGained).toEqual(expect.objectContaining({ increment: expect.any(Number) }));
      
      // Vérifier la mise à jour mission
      expect(updateData['missions.completed']).toEqual(expect.arrayContaining([missionId]));
      expect(updateData['missions.totalCompleted']).toEqual(expect.objectContaining({ increment: 1 }));
      expect(updateData.lastMissionCompletionId).toBe(missionId);
      
      // Vérifier la mise à jour activité
      expect(updateData.lastActivity).toEqual(expect.any(Object)); // serverTimestamp
      
      expect(result).toEqual(expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          missionId,
          missionTitle: 'Mission Test',
          missionType: 'daily',
          xpRewarded: expect.any(Number),
          newXP: expect.any(Number),
          newLevel: expect.any(Number),
          streak: expect.any(Number)
        })
      }));
    });

    test('devrait calculer correctement les bonus de streak', async () => {
      // Arrange
      const userId = 'test-user-123';
      const missionId = 'mission-002';
      
      const mockUserDoc = {
        exists: true,
        data: () => ({
          xp: 2000,
          level: 15,
          streak: 7, // Streak de 7 jours (bonus 1.5x)
          missions: {
            completed: [],
            totalCompleted: 0
          },
          lastActivity: new Date('2024-03-20T10:00:00Z'),
          lastMissionCompletionAt: new Date('2024-03-20T09:00:00Z')
        })
      };
      
      const mockMissionDoc = {
        exists: true,
        data: () => ({
          id: missionId,
          title: 'Mission Streak Bonus',
          type: 'weekly',
          difficulty: 'hard',
          baseReward: 100,
          active: true,
          requirements: {
            level: 10,
            xp: 1000
          }
        })
      };
      
      mockTransaction.get.mockImplementation((ref) => {
        const path = ref.path || ref._path?.path;
        if (path.includes('users')) {
          return Promise.resolve(mockUserDoc);
        } else if (path.includes('missions')) {
          return Promise.resolve(mockMissionDoc);
        }
        return Promise.resolve({ exists: false });
      });
      
      mockTransaction.update.mockResolvedValue(true);
      
      const mockRequest = {
        auth: { uid: userId },
        data: { missionId }
      };

      // Act
      const result = await completeMission(mockRequest, {});

      // Assert
      expect(result.success).toBe(true);
      
      // Avec streak de 7 jours, bonus de 1.5x
      // Base: 100 * 1.5 (hard) = 150
      expect(result.data.xpRewarded).toBe(150);
      
      const updateData = mockTransaction.update.mock.calls[0][1];
      expect(updateData.xp).toBe(2150); // 2000 + 150
    });

    test('devrait gérer les missions quotidiennes correctement', async () => {
      // Arrange
      const userId = 'test-user-123';
      const missionId = 'daily-mission-001';
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      const mockUserDoc = {
        exists: true,
        data: () => ({
          xp: 1000,
          level: 10,
          streak: 3,
          missions: {
            completed: [],
            totalCompleted: 0
          },
          lastActivity: yesterday,
          lastDailyCompletion: yesterday,
          lastMissionCompletionAt: new Date('2024-03-20T09:00:00Z')
        })
      };
      
      const mockMissionDoc = {
        exists: true,
        data: () => ({
          id: missionId,
          title: 'Mission Quotidienne',
          type: 'daily',
          difficulty: 'easy',
          baseReward: 20,
          active: true,
          requirements: {
            level: 1,
            xp: 0
          }
        })
      };
      
      mockTransaction.get.mockImplementation((ref) => {
        const path = ref.path || ref._path?.path;
        if (path.includes('users')) {
          return Promise.resolve(mockUserDoc);
        } else if (path.includes('missions')) {
          return Promise.resolve(mockMissionDoc);
        }
        return Promise.resolve({ exists: false });
      });
      
      mockTransaction.update.mockResolvedValue(true);
      
      const mockRequest = {
        auth: { uid: userId },
        data: { missionId }
      };

      // Act
      const result = await completeMission(mockRequest, {});

      // Assert
      const updateData = mockTransaction.update.mock.calls[0][1];
      
      // Vérifier la mise à jour de la mission quotidienne
      expect(updateData.lastDailyCompletion).toEqual(expect.any(Object)); // serverTimestamp
      expect(updateData['missions.dailyStreak']).toEqual(expect.objectContaining({ increment: 1 }));
      expect(updateData['missions.lastDailyId']).toBe(missionId);
      
      // Vérifier la mise à jour du streak général
      expect(updateData.streak).toBe(4); // 3 + 1
      expect(updateData.lastActivityDate).toBe(new Date().toDateString());
    });
  });

  describe('Cas d\'erreur - mission déjà complétée', () => {
    test('devrait rejeter si la mission est déjà complétée', async () => {
      // Arrange
      const userId = 'test-user-123';
      const missionId = 'mission-completed-001';
      
      const mockUserDoc = {
        exists: true,
        data: () => ({
          xp: 1000,
          level: 10,
          streak: 5,
          missions: {
            completed: [missionId], // Déjà complétée
            totalCompleted: 5
          },
          lastActivity: new Date('2024-03-20T10:00:00Z'),
          lastMissionCompletionAt: new Date('2024-03-20T09:00:00Z')
        })
      };
      
      const mockMissionDoc = {
        exists: true,
        data: () => ({
          id: missionId,
          title: 'Mission Déjà Complétée',
          type: 'daily',
          difficulty: 'easy',
          baseReward: 20,
          active: true,
          requirements: {
            level: 1,
            xp: 0
          }
        })
      };
      
      mockTransaction.get.mockImplementation((ref) => {
        const path = ref.path || ref._path?.path;
        if (path.includes('users')) {
          return Promise.resolve(mockUserDoc);
        } else if (path.includes('missions')) {
          return Promise.resolve(mockMissionDoc);
        }
        return Promise.resolve({ exists: false });
      });
      
      const mockRequest = {
        auth: { uid: userId },
        data: { missionId }
      };

      // Act & Assert
      await expect(completeMission(mockRequest, {})).rejects.toThrow('Mission déjà complétée');
      
      expect(mockTransaction.update).not.toHaveBeenCalled();
    });

    test('devrait rejeter si la mission quotidienne est déjà faite aujourd\'hui', async () => {
      // Arrange
      const userId = 'test-user-123';
      const missionId = 'daily-mission-today';
      const today = new Date().toDateString();
      
      const mockUserDoc = {
        exists: true,
        data: () => ({
          xp: 1000,
          level: 10,
          streak: 5,
          missions: {
            completed: ['other-mission'],
            totalCompleted: 5
          },
          lastActivity: new Date(),
          lastDailyCompletion: new Date(), // Aujourd'hui
          lastMissionCompletionAt: new Date('2024-03-20T09:00:00Z')
        })
      };
      
      const mockMissionDoc = {
        exists: true,
        data: () => ({
          id: missionId,
          title: 'Mission Quotidienne Aujourd\'hui',
          type: 'daily',
          difficulty: 'easy',
          baseReward: 20,
          active: true,
          requirements: {
            level: 1,
            xp: 0
          }
        })
      };
      
      mockTransaction.get.mockImplementation((ref) => {
        const path = ref.path || ref._path?.path;
        if (path.includes('users')) {
          return Promise.resolve(mockUserDoc);
        } else if (path.includes('missions')) {
          return Promise.resolve(mockMissionDoc);
        }
        return Promise.resolve({ exists: false });
      });
      
      const mockRequest = {
        auth: { uid: userId },
        data: { missionId }
      };

      // Act & Assert
      await expect(completeMission(mockRequest, {})).rejects.toThrow('Mission quotidienne déjà complétée aujourd\'hui');
      
      expect(mockTransaction.update).not.toHaveBeenCalled();
    });
  });

  describe('Cas d\'erreur - double appel', () => {
    test('devrait bloquer les complétions de mission trop rapprochées (< 5s)', async () => {
      // Arrange
      const userId = 'test-user-123';
      const missionId = 'mission-rapid-001';
      const now = new Date();
      const recentCompletion = new Date(now.getTime() - 3000); // 3s ago
      
      const mockUserDoc = {
        exists: true,
        data: () => ({
          xp: 1000,
          level: 10,
          streak: 5,
          missions: {
            completed: [],
            totalCompleted: 0
          },
          lastActivity: new Date('2024-03-20T10:00:00Z'),
          lastMissionCompletionAt: recentCompletion
        })
      };
      
      const mockMissionDoc = {
        exists: true,
        data: () => ({
          id: missionId,
          title: 'Mission Rapide',
          type: 'challenge',
          difficulty: 'medium',
          baseReward: 100,
          active: true,
          requirements: {
            level: 5,
            xp: 500
          }
        })
      };
      
      mockTransaction.get.mockImplementation((ref) => {
        const path = ref.path || ref._path?.path;
        if (path.includes('users')) {
          return Promise.resolve(mockUserDoc);
        } else if (path.includes('missions')) {
          return Promise.resolve(mockMissionDoc);
        }
        return Promise.resolve({ exists: false });
      });
      
      const mockRequest = {
        auth: { uid: userId },
        data: { missionId }
      };

      // Act & Assert
      await expect(completeMission(mockRequest, {})).rejects.toThrow('Double exécution de mission détectée');
      
      expect(mockTransaction.update).not.toHaveBeenCalled();
      
      expect(logger.warn).toHaveBeenCalledWith(
        '⚠️ Double exécution de mission détectée via timestamp',
        expect.objectContaining({
          userId,
          missionId,
          lastMissionCompletion: recentCompletion,
          diff: expect.any(Number)
        })
      );
    });
  });

  describe('Cas d\'erreur - validation', () => {
    test('devrait rejeter si missionId est manquant', async () => {
      // Arrange
      const mockRequest = {
        auth: { uid: 'test-user-123' },
        data: {} // Pas de missionId
      };

      // Act & Assert
      await expect(completeMission(mockRequest, {})).rejects.toThrow('Mission ID requis');
      
      expect(mockTransaction.get).not.toHaveBeenCalled();
      expect(mockTransaction.update).not.toHaveBeenCalled();
    });

    test('devrait rejeter si missionId est vide', async () => {
      // Arrange
      const mockRequest = {
        auth: { uid: 'test-user-123' },
        data: { missionId: '' }
      };

      // Act & Assert
      await expect(completeMission(mockRequest, {})).rejects.toThrow('Mission ID requis');
    });

    test('devrait rejeter si l\'utilisateur n\'existe pas', async () => {
      // Arrange
      const missionId = 'mission-001';
      
      const mockUserDoc = {
        exists: false
      };
      
      const mockMissionDoc = {
        exists: true,
        data: () => ({
          id: missionId,
          title: 'Mission Test',
          type: 'daily',
          difficulty: 'easy',
          baseReward: 20,
          active: true
        })
      };
      
      mockTransaction.get.mockImplementation((ref) => {
        const path = ref.path || ref._path?.path;
        if (path.includes('users')) {
          return Promise.resolve(mockUserDoc);
        } else if (path.includes('missions')) {
          return Promise.resolve(mockMissionDoc);
        }
        return Promise.resolve({ exists: false });
      });
      
      const mockRequest = {
        auth: { uid: 'nonexistent-user' },
        data: { missionId }
      };

      // Act & Assert
      await expect(completeMission(mockRequest, {})).rejects.toThrow('Utilisateur non trouvé dans la transaction');
      
      expect(mockTransaction.update).not.toHaveBeenCalled();
    });

    test('devrait rejeter si la mission n\'existe pas', async () => {
      // Arrange
      const userId = 'test-user-123';
      const missionId = 'nonexistent-mission';
      
      const mockUserDoc = {
        exists: true,
        data: () => ({
          xp: 1000,
          level: 10,
          streak: 5,
          missions: {
            completed: [],
            totalCompleted: 0
          }
        })
      };
      
      const mockMissionDoc = {
        exists: false
      };
      
      mockTransaction.get.mockImplementation((ref) => {
        const path = ref.path || ref._path?.path;
        if (path.includes('users')) {
          return Promise.resolve(mockUserDoc);
        } else if (path.includes('missions')) {
          return Promise.resolve(mockMissionDoc);
        }
        return Promise.resolve({ exists: false });
      });
      
      const mockRequest = {
        auth: { uid: userId },
        data: { missionId }
      };

      // Act & Assert
      await expect(completeMission(mockRequest, {})).rejects.toThrow('Mission non trouvée dans la transaction');
      
      expect(mockTransaction.update).not.toHaveBeenCalled();
    });

    test('devrait rejeter si les prérequis ne sont pas satisfaits', async () => {
      // Arrange
      const userId = 'test-user-123';
      const missionId = 'mission-prerequis';
      
      const mockUserDoc = {
        exists: true,
        data: () => ({
          xp: 100,      // XP insuffisant
          level: 2,      // Niveau insuffisant
          streak: 1,
          missions: {
            completed: [],
            totalCompleted: 0
          }
        })
      };
      
      const mockMissionDoc = {
        exists: true,
        data: () => ({
          id: missionId,
          title: 'Mission Difficile',
          type: 'challenge',
          difficulty: 'hard',
          baseReward: 200,
          active: true,
          requirements: {
            level: 10,    // Requis niveau 10
            xp: 1000      // Requis XP 1000
          }
        })
      };
      
      mockTransaction.get.mockImplementation((ref) => {
        const path = ref.path || ref._path?.path;
        if (path.includes('users')) {
          return Promise.resolve(mockUserDoc);
        } else if (path.includes('missions')) {
          return Promise.resolve(mockMissionDoc);
        }
        return Promise.resolve({ exists: false });
      });
      
      const mockRequest = {
        auth: { uid: userId },
        data: { missionId }
      };

      // Act & Assert
      await expect(completeMission(mockRequest, {})).rejects.toThrow('Niveau requis: 10');
      
      expect(mockTransaction.update).not.toHaveBeenCalled();
    });
  });

  describe('Cas d\'erreur - user non auth', () => {
    test('devrait rejeter les appels non authentifiés', async () => {
      // Arrange
      const mockRequest = {
        auth: null, // Pas d'authentification
        data: { missionId: 'mission-001' }
      };

      // Act & Assert
      await expect(completeMission(mockRequest, {})).rejects.toThrow();
      
      expect(mockTransaction.get).not.toHaveBeenCalled();
      expect(mockTransaction.update).not.toHaveBeenCalled();
    });

    test('devrait rejeter les appels avec uid manquant', async () => {
      // Arrange
      const mockRequest = {
        auth: {}, // Auth sans uid
        data: { missionId: 'mission-001' }
      };

      // Act & Assert
      await expect(completeMission(mockRequest, {})).rejects.toThrow();
      
      expect(mockTransaction.get).not.toHaveBeenCalled();
      expect(mockTransaction.update).not.toHaveBeenCalled();
    });
  });

  describe('Tests de performance', () => {
    test('devrait s\'exécuter en moins de 200ms', async () => {
      // Arrange
      const mockUserDoc = {
        exists: true,
        data: () => ({
          xp: 1000,
          level: 10,
          streak: 5,
          missions: {
            completed: [],
            totalCompleted: 0
          },
          lastActivity: new Date('2024-03-20T10:00:00Z'),
          lastMissionCompletionAt: new Date('2024-03-20T09:00:00Z')
        })
      };
      
      const mockMissionDoc = {
        exists: true,
        data: () => ({
          id: 'mission-perf',
          title: 'Mission Performance',
          type: 'daily',
          difficulty: 'easy',
          baseReward: 20,
          active: true,
          requirements: {
            level: 1,
            xp: 0
          }
        })
      };
      
      mockTransaction.get.mockImplementation((ref) => {
        const path = ref.path || ref._path?.path;
        if (path.includes('users')) {
          return Promise.resolve(mockUserDoc);
        } else if (path.includes('missions')) {
          return Promise.resolve(mockMissionDoc);
        }
        return Promise.resolve({ exists: false });
      });
      
      mockTransaction.update.mockResolvedValue(true);
      
      const mockRequest = {
        auth: { uid: 'test-user-123' },
        data: { missionId: 'mission-perf' }
      };

      // Act
      const startTime = Date.now();
      const result = await completeMission(mockRequest, {});
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Assert
      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(200);
    });

    test('devrait gérer correctement les appels concurrents', async () => {
      // Arrange
      const userId = 'test-user-123';
      const missionId = 'concurrent-mission';
      const concurrentCalls = 5;
      
      const mockUserDoc = {
        exists: true,
        data: () => ({
          xp: 1000,
          level: 10,
          streak: 5,
          missions: {
            completed: [],
            totalCompleted: 0
          },
          lastActivity: new Date('2024-03-20T10:00:00Z'),
          lastMissionCompletionAt: new Date('2024-03-20T09:00:00Z')
        })
      };
      
      const mockMissionDoc = {
        exists: true,
        data: () => ({
          id: missionId,
          title: 'Mission Concurrente',
          type: 'challenge',
          difficulty: 'medium',
          baseReward: 100,
          active: true,
          requirements: {
            level: 5,
            xp: 500
          }
        })
      };
      
      mockTransaction.get.mockImplementation((ref) => {
        const path = ref.path || ref._path?.path;
        if (path.includes('users')) {
          return Promise.resolve(mockUserDoc);
        } else if (path.includes('missions')) {
          return Promise.resolve(mockMissionDoc);
        }
        return Promise.resolve({ exists: false });
      });
      
      mockTransaction.update.mockResolvedValue(true);
      
      const mockRequests = Array.from({ length: concurrentCalls }, (_, i) => ({
        auth: { uid: userId },
        data: { missionId, completionData: { testId: i } }
      }));

      // Act
      const promises = mockRequests.map(request => completeMission(request, {}));
      const results = await Promise.allSettled(promises);

      // Assert
      // Seulement un appel devrait réussir (premier)
      const successfulCalls = results.filter(r => r.status === 'fulfilled');
      expect(successfulCalls.length).toBe(1);
      
      // Les autres devraient être bloqués pour double exécution
      const failedCalls = results.filter(r => 
        r.status === 'rejected' && 
        r.reason.message.includes('Double exécution de mission détectée')
      );
      expect(failedCalls.length).toBeGreaterThan(0);
    });
  });
});
