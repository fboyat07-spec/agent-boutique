const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getFunctions } = require('firebase-admin/functions');

// Mock Firebase Admin
const mockFirebase = () => {
  const app = initializeApp({
    projectId: 'test-project',
    databaseURL: 'https://test-project.firebaseio.com',
    credential: {
      client_email: 'test@test-project.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\nmock-key\n-----END PRIVATE KEY-----\n-----'
    }
  });

  return {
    app,
    db: getFirestore(app),
    functions: getFunctions(app)
  };
};

// Mock Firestore avec méthodes simulées
const mockFirestore = () => {
  const mockData = new Map();
  
  return {
    collection: (collectionName) => ({
      doc: (docId) => ({
        get: () => Promise.resolve({
          exists: mockData.has(`${collectionName}/${docId}`),
          data: () => mockData.get(`${collectionName}/${docId}`) || null,
          id: docId
        }),
        set: (data) => {
          mockData.set(`${collectionName}/${docId}`, data);
          return Promise.resolve();
        },
        update: (data) => {
          const existing = mockData.get(`${collectionName}/${docId}`) || {};
          mockData.set(`${collectionName}/${docId}`, { ...existing, ...data });
          return Promise.resolve();
        },
        delete: () => {
          mockData.delete(`${collectionName}/${docId}`);
          return Promise.resolve();
        }
      }),
      where: (field, op, value) => ({
        get: () => Promise.resolve({
          docs: Array.from(mockData.entries())
            .filter(([key]) => key.startsWith(collectionName))
            .map(([key, data]) => ({
              id: key.split('/')[1],
              data: () => data
            }))
        })
      }),
      add: (data) => {
        const docId = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        mockData.set(`${collectionName}/${docId}`, data);
        return Promise.resolve({ id: docId });
      }
    })
  };
};

// Mock des fonctions Firebase
const mockFirebaseFunctions = () => {
  const mockFunctions = new Map();
  
  return {
    httpsCallable: (functions, functionName) => {
      return async (data, context) => {
        const mockFunction = mockFunctions.get(functionName);
        
        if (!mockFunction) {
          throw new Error(`Function ${functionName} not mocked`);
        }
        
        // Simuler le contexte d'authentification
        const mockAuth = context?.auth || {
          uid: 'test_user_123',
          email: 'test@example.com',
          email_verified: true
        };
        
        // Simuler les headers
        const mockHeaders = context?.headers || {
          'content-type': 'application/json',
          'user-agent': 'test-agent'
        };
        
        // Simuler la requête
        const mockRequest = {
          auth: mockAuth,
          headers: mockHeaders,
          rawRequest: {
            ip: '127.0.0.1',
            headers: mockHeaders
          }
        };
        
        return await mockFunction(data, mockRequest);
      };
    }
  };
};

// Données de test
const testData = {
  users: {
    'test_user_123': {
      uid: 'test_user_123',
      email: 'test@example.com',
      email_verified: true,
      displayName: 'Test User',
      xp: 1000,
      level: 5,
      streak: 3,
      missionsCompleted: 10,
      badges: ['badge_1', 'badge_2'],
      createdAt: new Date('2024-01-01'),
      lastLogin: new Date('2024-03-22'),
      subscription: {
        planId: 'premium',
        status: 'active',
        expiresAt: new Date('2024-12-31')
      }
    },
    'test_admin_456': {
      uid: 'test_admin_456',
      email: 'admin@example.com',
      email_verified: true,
      displayName: 'Test Admin',
      xp: 5000,
      level: 15,
      streak: 10,
      missionsCompleted: 50,
      badges: ['badge_1', 'badge_2', 'badge_3'],
      createdAt: new Date('2023-01-01'),
      lastLogin: new Date('2024-03-22'),
      subscription: {
        planId: 'premium_plus',
        status: 'active',
        expiresAt: new Date('2025-12-31')
      }
    }
  },
  missions: {
    'mission_1': {
      id: 'mission_1',
      title: 'Mission Quotidienne',
      description: 'Complétez une activité quotidienne',
      type: 'daily',
      difficulty: 'easy',
      xpReward: 50,
      requirements: {
        level: 1,
        xp: 0
      },
      status: 'active'
    },
    'mission_2': {
      id: 'mission_2',
      title: 'Mission Hédomadaire',
      description: 'Complétez 5 activités cette semaine',
      type: 'weekly',
      difficulty: 'medium',
      xpReward: 150,
      requirements: {
        level: 3,
        xp: 500
      },
      status: 'active'
    }
  },
  badges: {
    'badge_1': {
      id: 'badge_1',
      name: 'Débutant',
      description: 'Premier niveau atteint',
      icon: '🌟',
      requirements: {
        level: 1
      },
      unlockedAt: new Date('2024-01-01')
    },
    'badge_2': {
      id: 'badge_2',
      name: 'Explorateur',
      description: '10 missions complétées',
      icon: '🗺️',
      requirements: {
        missionsCompleted: 10
      },
      unlockedAt: new Date('2024-02-01')
    }
  }
};

// Mock des fonctions à tester
const mockFunctions = {
  addXp: async (data, request) => {
    const { amount, source = 'manual', metadata = {} } = data;
    const userId = request.auth.uid;
    
    // Simuler les validations
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      throw new Error('Montant XP invalide');
    }
    
    if (amount > 1000) {
      throw new Error('Montant XP trop élevé');
    }
    
    // Simuler le traitement
    const currentUser = testData.users[userId];
    const newXP = currentUser.xp + amount;
    const newLevel = Math.floor(newXP / 200) + 1;
    const leveledUp = newLevel > currentUser.level;
    
    // Mettre à jour les données de test
    testData.users[userId] = {
      ...currentUser,
      xp: newXP,
      level: newLevel
    };
    
    return {
      success: true,
      data: {
        userId,
        previousXP: currentUser.xp,
        newXP,
        previousLevel: currentUser.level,
        newLevel,
        leveledUp,
        amount,
        source,
        timestamp: new Date().toISOString()
      }
    };
  },
  
  completeMission: async (data, request) => {
    const { missionId, completionData = {} } = data;
    const userId = request.auth.uid;
    
    // Simuler les validations
    if (!missionId) {
      throw new Error('ID de mission requis');
    }
    
    const mission = testData.missions[missionId];
    if (!mission) {
      throw new Error('Mission non trouvée');
    }
    
    const currentUser = testData.users[userId];
    
    // Vérifier les prérequis
    if (currentUser.level < mission.requirements.level) {
      throw new Error(`Niveau requis: ${mission.requirements.level}`);
    }
    
    if (currentUser.xp < mission.requirements.xp) {
      throw new Error(`XP requis: ${mission.requirements.xp}`);
    }
    
    // Simuler la complétion
    const updatedUser = {
      ...currentUser,
      missionsCompleted: currentUser.missionsCompleted + 1,
      xp: currentUser.xp + mission.xpReward
    };
    
    testData.users[userId] = updatedUser;
    
    return {
      success: true,
      data: {
        userId,
        missionId,
        missionTitle: mission.title,
        xpReward: mission.xpReward,
        newXP: updatedUser.xp,
        missionsCompleted: updatedUser.missionsCompleted,
        completionData,
        timestamp: new Date().toISOString()
      }
    };
  },
  
  checkBadges: async (data, request) => {
    const { force = false } = data;
    const userId = request.auth.uid;
    
    const currentUser = testData.users[userId];
    const unlockedBadges = [];
    
    // Vérifier chaque badge
    Object.values(testData.badges).forEach(badge => {
      let isUnlocked = false;
      
      if (badge.id === 'badge_1' && currentUser.level >= badge.requirements.level) {
        isUnlocked = true;
      }
      
      if (badge.id === 'badge_2' && currentUser.missionsCompleted >= badge.requirements.missionsCompleted) {
        isUnlocked = true;
      }
      
      if (isUnlocked && !currentUser.badges.includes(badge.id)) {
        unlockedBadges.push(badge);
        currentUser.badges.push(badge.id);
      }
    });
    
    return {
      success: true,
      data: {
        userId,
        currentBadges: currentUser.badges,
        unlockedBadges,
        totalBadges: Object.keys(testData.badges).length,
        timestamp: new Date().toISOString()
      }
    };
  }
};

// Exporter les mocks
module.exports = {
  mockFirebase,
  mockFirestore,
  mockFirebaseFunctions,
  testData,
  mockFunctions
};
