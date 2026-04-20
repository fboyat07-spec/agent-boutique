const { logger } = require("firebase-functions/v2");
const admin = require("firebase-admin");

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

describe('Backend Tests - Authentification', () => {
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

  describe('Cas normal - utilisateur authentifié', () => {
    test('devrait autoriser les appels avec authentification valide', async () => {
      // Arrange
      const userId = 'test-user-123';
      const mockUserDoc = {
        exists: true,
        data: () => ({
          uid: userId,
          email: 'test@example.com',
          emailVerified: true,
          displayName: 'Test User',
          createdAt: new Date('2024-01-01T00:00:00Z'),
          lastLogin: new Date('2024-03-20T10:00:00Z'),
          active: true,
          tier: 'free'
        })
      };
      
      mockTransaction.get.mockResolvedValue(mockUserDoc);
      mockTransaction.update.mockResolvedValue(true);
      
      const mockRequest = {
        auth: {
          uid: userId,
          token: {
            email: 'test@example.com',
            email_verified: true,
            name: 'Test User',
            admin: false
          }
        },
        data: { test: 'auth_test' }
      };

      // Act
      // Simuler une fonction qui vérifie l'authentification
      const authValidation = validateAuth(mockRequest);

      // Assert
      expect(authValidation.isValid).toBe(true);
      expect(authValidation.userId).toBe(userId);
      expect(authValidation.email).toBe('test@example.com');
      expect(authValidation.isAdmin).toBe(false);
    });

    test('devrait autoriser les appels admin', async () => {
      // Arrange
      const userId = 'admin-user-456';
      const mockUserDoc = {
        exists: true,
        data: () => ({
          uid: userId,
          email: 'admin@example.com',
          emailVerified: true,
          displayName: 'Admin User',
          role: 'admin',
          tier: 'enterprise',
          permissions: ['read', 'write', 'delete', 'admin']
        })
      };
      
      mockTransaction.get.mockResolvedValue(mockUserDoc);
      mockTransaction.update.mockResolvedValue(true);
      
      const mockRequest = {
        auth: {
          uid: userId,
          token: {
            email: 'admin@example.com',
            email_verified: true,
            name: 'Admin User',
            admin: true,
            role: 'admin'
          }
        },
        data: { test: 'admin_test' }
      };

      // Act
      const authValidation = validateAuth(mockRequest);

      // Assert
      expect(authValidation.isValid).toBe(true);
      expect(authValidation.userId).toBe(userId);
      expect(authValidation.isAdmin).toBe(true);
      expect(authValidation.role).toBe('admin');
    });
  });

  describe('Cas d\'erreur - user non auth', () => {
    test('devrait rejeter les appels sans authentification', () => {
      // Arrange
      const mockRequest = {
        auth: null,
        data: { test: 'no_auth' }
      };

      // Act
      const authValidation = validateAuth(mockRequest);

      // Assert
      expect(authValidation.isValid).toBe(false);
      expect(authValidation.error).toBe('Authentification requise');
      expect(authValidation.code).toBe('UNAUTHENTICATED');
    });

    test('devrait rejeter les appels avec auth vide', () => {
      // Arrange
      const mockRequest = {
        auth: {},
        data: { test: 'empty_auth' }
      };

      // Act
      const authValidation = validateAuth(mockRequest);

      // Assert
      expect(authValidation.isValid).toBe(false);
      expect(authValidation.error).toBe('Authentification invalide');
      expect(authValidation.code).toBe('INVALID_AUTH');
    });

    test('devrait rejeter les appels avec uid manquant', () => {
      // Arrange
      const mockRequest = {
        auth: {
          token: {
            email: 'test@example.com',
            email_verified: true
          }
          // Pas de uid
        },
        data: { test: 'missing_uid' }
      };

      // Act
      const authValidation = validateAuth(mockRequest);

      // Assert
      expect(authValidation.isValid).toBe(false);
      expect(authValidation.error).toBe('UID manquant');
      expect(authValidation.code).toBe('MISSING_UID');
    });

    test('devrait rejeter les appels avec uid vide', () => {
      // Arrange
      const mockRequest = {
        auth: {
          uid: '',
          token: {
            email: 'test@example.com',
            email_verified: true
          }
        },
        data: { test: 'empty_uid' }
      };

      // Act
      const authValidation = validateAuth(mockRequest);

      // Assert
      expect(authValidation.isValid).toBe(false);
      expect(authValidation.error).toBe('UID invalide');
      expect(authValidation.code).toBe('INVALID_UID');
    });

    test('devrait rejeter les appels avec uid null', () => {
      // Arrange
      const mockRequest = {
        auth: {
          uid: null,
          token: {
            email: 'test@example.com',
            email_verified: true
          }
        },
        data: { test: 'null_uid' }
      };

      // Act
      const authValidation = validateAuth(mockRequest);

      // Assert
      expect(authValidation.isValid).toBe(false);
      expect(authValidation.error).toBe('UID invalide');
      expect(authValidation.code).toBe('INVALID_UID');
    });
  });

  describe('Cas d\'erreur - utilisateur non trouvé', () => {
    test('devrait rejeter si l\'utilisateur n\'existe pas en base', async () => {
      // Arrange
      const userId = 'nonexistent-user';
      const mockUserDoc = {
        exists: false
      };
      
      mockTransaction.get.mockResolvedValue(mockUserDoc);
      
      const mockRequest = {
        auth: {
          uid: userId,
          token: {
            email: 'nonexistent@example.com',
            email_verified: true
          }
        },
        data: { test: 'user_not_found' }
      };

      // Act
      const authValidation = await validateUserExists(mockRequest);

      // Assert
      expect(authValidation.isValid).toBe(false);
      expect(authValidation.error).toBe('Utilisateur non trouvé');
      expect(authValidation.code).toBe('USER_NOT_FOUND');
    });
  });

  describe('Cas d\'erreur - utilisateur désactivé', () => {
    test('devrait rejeter si l\'utilisateur est désactivé', async () => {
      // Arrange
      const userId = 'disabled-user';
      const mockUserDoc = {
        exists: true,
        data: () => ({
          uid: userId,
          email: 'disabled@example.com',
          emailVerified: true,
          displayName: 'Disabled User',
          active: false, // Utilisateur désactivé
          disabledAt: new Date('2024-03-15T00:00:00Z'),
          disabledReason: 'Violation des CGU'
        })
      };
      
      mockTransaction.get.mockResolvedValue(mockUserDoc);
      
      const mockRequest = {
        auth: {
          uid: userId,
          token: {
            email: 'disabled@example.com',
            email_verified: true
          }
        },
        data: { test: 'disabled_user' }
      };

      // Act
      const authValidation = await validateUserStatus(mockRequest);

      // Assert
      expect(authValidation.isValid).toBe(false);
      expect(authValidation.error).toBe('Utilisateur désactivé');
      expect(authValidation.code).toBe('USER_DISABLED');
      expect(authValidation.reason).toBe('Violation des CGU');
    });
  });

  describe('Cas d\'erreur - email non vérifié', () => {
    test('devrait rejeter si l\'email n\'est pas vérifié', () => {
      // Arrange
      const mockRequest = {
        auth: {
          uid: 'test-user-123',
          token: {
            email: 'test@example.com',
            email_verified: false // Email non vérifié
          }
        },
        data: { test: 'unverified_email' }
      };

      // Act
      const authValidation = validateAuth(mockRequest);

      // Assert
      expect(authValidation.isValid).toBe(false);
      expect(authValidation.error).toBe('Email non vérifié');
      expect(authValidation.code).toBe('EMAIL_NOT_VERIFIED');
    });
  });

  describe('Tests de sécurité', () => {
    test('devrait rejeter les tokens expirés', () => {
      // Arrange
      const expiredTime = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 heures ago
      const mockRequest = {
        auth: {
          uid: 'test-user-123',
          token: {
            email: 'test@example.com',
            email_verified: true,
            exp: Math.floor(expiredTime.getTime() / 1000) // Timestamp expiré
          }
        },
        data: { test: 'expired_token' }
      };

      // Act
      const authValidation = validateAuth(mockRequest);

      // Assert
      expect(authValidation.isValid).toBe(false);
      expect(authValidation.error).toBe('Token expiré');
      expect(authValidation.code).toBe('TOKEN_EXPIRED');
    });

    test('devrait rejeter les tokens invalides', () => {
      // Arrange
      const mockRequest = {
        auth: {
          uid: 'test-user-123',
          token: {
            email: 'test@example.com',
            email_verified: true,
            iss: 'invalid-issuer' // Émetteur invalide
          }
        },
        data: { test: 'invalid_token' }
      };

      // Act
      const authValidation = validateAuth(mockRequest);

      // Assert
      expect(authValidation.isValid).toBe(false);
      expect(authValidation.error).toBe('Token invalide');
      expect(authValidation.code).toBe('INVALID_TOKEN');
    });

    test('devrait logger les tentatives d\'accès non autorisées', () => {
      // Arrange
      const mockRequest = {
        auth: null,
        data: { test: 'unauthorized_access' },
        ip: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Suspicious Browser)'
      };

      // Act
      const authValidation = validateAuth(mockRequest);

      // Assert
      expect(authValidation.isValid).toBe(false);
      
      // Vérifier que l'erreur est loggée
      expect(logger.warn).toHaveBeenCalledWith(
        'Tentative d\'accès non autorisée',
        expect.objectContaining({
          ip: '192.168.1.100',
          userAgent: 'Mozilla/5.0 (Suspicious Browser)',
          timestamp: expect.any(Date)
        })
      );
    });
  });

  describe('Tests de performance', () => {
    test('devrait valider l\'authentification en moins de 50ms', () => {
      // Arrange
      const mockRequest = {
        auth: {
          uid: 'test-user-123',
          token: {
            email: 'test@example.com',
            email_verified: true
          }
        },
        data: { test: 'performance_auth' }
      };

      // Act
      const startTime = Date.now();
      const authValidation = validateAuth(mockRequest);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Assert
      expect(authValidation.isValid).toBe(true);
      expect(duration).toBeLessThan(50);
    });

    test('devrait gérer correctement les validations multiples en parallèle', async () => {
      // Arrange
      const userId = 'test-user-123';
      const mockUserDoc = {
        exists: true,
        data: () => ({
          uid: userId,
          email: 'test@example.com',
          emailVerified: true,
          active: true
        })
      };
      
      mockTransaction.get.mockResolvedValue(mockUserDoc);
      
      const mockRequests = Array.from({ length: 10 }, (_, i) => ({
        auth: {
          uid: userId,
          token: {
            email: 'test@example.com',
            email_verified: true
          }
        },
        data: { test: `parallel_auth_${i}` }
      }));

      // Act
      const startTime = Date.now();
      const promises = mockRequests.map(request => validateUserExists(request));
      const results = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Assert
      expect(results.every(r => r.isValid)).toBe(true);
      expect(duration).toBeLessThan(100); // Toutes les validations en parallèle
    });
  });
});

// Fonctions utilitaires pour les tests
function validateAuth(request) {
  if (!request.auth) {
    return {
      isValid: false,
      error: 'Authentification requise',
      code: 'UNAUTHENTICATED'
    };
  }

  if (!request.auth.uid) {
    return {
      isValid: false,
      error: 'UID manquant',
      code: 'MISSING_UID'
    };
  }

  if (typeof request.auth.uid !== 'string' || request.auth.uid.trim() === '') {
    return {
      isValid: false,
      error: 'UID invalide',
      code: 'INVALID_UID'
    };
  }

  if (request.auth.token && request.auth.token.email_verified === false) {
    return {
      isValid: false,
      error: 'Email non vérifié',
      code: 'EMAIL_NOT_VERIFIED'
    };
  }

  // Vérifier si le token est expiré
  if (request.auth.token && request.auth.token.exp) {
    const now = Math.floor(Date.now() / 1000);
    if (request.auth.token.exp < now) {
      return {
        isValid: false,
        error: 'Token expiré',
        code: 'TOKEN_EXPIRED'
      };
    }
  }

  // Vérifier l'émetteur du token
  if (request.auth.token && request.auth.token.iss && !request.auth.token.iss.includes('firebase')) {
    return {
      isValid: false,
      error: 'Token invalide',
      code: 'INVALID_TOKEN'
    };
  }

  return {
    isValid: true,
    userId: request.auth.uid,
    email: request.auth.token?.email,
    isAdmin: request.auth.token?.admin === true,
    role: request.auth.token?.role
  };
}

async function validateUserExists(request) {
  const authValidation = validateAuth(request);
  if (!authValidation.isValid) {
    return authValidation;
  }

  try {
    const mockDb = admin.firestore();
    const userDoc = await mockDb.collection('users').doc(authValidation.userId).get();
    
    if (!userDoc.exists) {
      return {
        isValid: false,
        error: 'Utilisateur non trouvé',
        code: 'USER_NOT_FOUND'
      };
    }

    return {
      isValid: true,
      userId: authValidation.userId,
      userData: userDoc.data()
    };
  } catch (error) {
    return {
      isValid: false,
      error: 'Erreur lors de la validation utilisateur',
      code: 'VALIDATION_ERROR'
    };
  }
}

async function validateUserStatus(request) {
  const userValidation = await validateUserExists(request);
  if (!userValidation.isValid) {
    return userValidation;
  }

  const userData = userValidation.userData;
  
  if (userData.active === false) {
    return {
      isValid: false,
      error: 'Utilisateur désactivé',
      code: 'USER_DISABLED',
      reason: userData.disabledReason,
      disabledAt: userData.disabledAt
    };
  }

  return {
    isValid: true,
    userId: userValidation.userId,
    userData: userData
  };
}
