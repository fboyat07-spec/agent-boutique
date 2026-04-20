# 🧪 Tests Critiques Backend - KidAI

## 📊 Vue d'ensemble

Suite de tests critiques pour les fonctions backend Firebase Functions KidAI, utilisant Jest pour garantir la fiabilité, la sécurité et la performance des opérations critiques.

## 📁 Structure des Tests

```
/functions/tests/backend
├── addXp.test.js          # Tests de la fonction addXp
├── completeMission.test.js   # Tests de la fonction completeMission
├── auth.test.js            # Tests d'authentification
├── jest.config.js          # Configuration Jest
├── setup.js               # Setup global des tests
├── package.json            # Dépendances des tests
└── README.md              # Documentation
```

## 🚀 Installation et Exécution

### **Installation des dépendances**
```bash
cd functions/tests/backend
npm install
```

### **Exécution des tests**
```bash
# Exécuter tous les tests
npm test

# Exécuter en mode watch
npm run test:watch

# Exécuter avec coverage
npm run test:coverage

# Exécuter pour CI
npm run test:ci

# Exécuter un test spécifique
npm run test:specific "addXp normal"

# Mode debug
npm run test:debug

# Output verbose
npm run test:verbose

# Générer un rapport HTML
npm run test:report
```

## 📊 Cas de Test Couverts

### **1. Tests addXp**

#### **Cas normal**
```javascript
describe('Cas normal - addXp', () => {
  test('devrait ajouter XP avec succès pour un utilisateur authentifié');
  test('devrait gérer le level up correctement');
  test('devrait mettre à jour le streak d\'activité pour un nouveau jour');
});
```

**Scénarios testés :**
- ✅ Ajout XP standard avec utilisateur authentifié
- ✅ Level up correct avec calcul de progression
- ✅ Mise à jour du streak quotidien
- ✅ Calcul des bonus de streak
- ✅ Gestion des limites (min/max)

#### **Cas d'erreur - double appel**
```javascript
describe('Cas d\'erreur - double appel', () => {
  test('devrait bloquer les appels trop rapprochés (< 1s)');
  test('devrait autoriser les appels espacés de > 1s');
});
```

**Scénarios testés :**
- ✅ Blocage des appels < 1 seconde
- ✅ Autorisation des appels > 1 seconde
- ✅ Détection de double exécution
- ✅ Protection contre les abus

#### **Cas d'erreur - validation**
```javascript
describe('Cas d\'erreur - validation', () => {
  test('devrait rejeter les montants invalides');
  test('devrait rejeter les montants nuls');
  test('devrait rejeter les montants non numériques');
});
```

**Scénarios testés :**
- ✅ Montants négatifs rejetés
- ✅ Montants nuls rejetés
- ✅ Montants non numériques rejetés
- ✅ Validation des données d'entrée

#### **Cas d'erreur - utilisateur non trouvé**
```javascript
describe('Cas d\'erreur - utilisateur non trouvé', () => {
  test('devrait rejeter si l\'utilisateur n\'existe pas');
});
```

**Scénarios testés :**
- ✅ Utilisateur inexistant rejeté
- ✅ Gestion des erreurs Firestore
- ✅ Logging approprié des erreurs

#### **Tests de performance**
```javascript
describe('Tests de performance', () => {
  test('devrait s\'exécuter en moins de 100ms');
  test('devrait gérer correctement les appels concurrents');
});
```

**Scénarios testés :**
- ✅ Performance < 100ms par appel
- ✅ Gestion des appels concurrents
- ✅ Protection contre les race conditions

### **2. Tests completeMission**

#### **Cas normal**
```javascript
describe('Cas normal - mission complète', () => {
  test('devrait compléter une mission avec succès');
  test('devrait calculer correctement les bonus de streak');
  test('devrait gérer les missions quotidiennes correctement');
});
```

**Scénarios testés :**
- ✅ Complétion mission standard
- ✅ Calcul XP avec bonus de streak
- ✅ Gestion missions quotidiennes
- ✅ Mise à jour statistiques utilisateur
- ✅ Level up via mission

#### **Cas d'erreur - mission déjà complétée**
```javascript
describe('Cas d\'erreur - mission déjà complétée', () => {
  test('devrait rejeter si la mission est déjà complétée');
  test('devrait rejeter si la mission quotidienne est déjà faite aujourd\'hui');
});
```

**Scénarios testés :**
- ✅ Mission déjà complétée rejetée
- ✅ Mission quotidienne du jour rejetée
- ✅ Validation historique missions
- ✅ Protection contre doublons

#### **Cas d'erreur - double appel**
```javascript
describe('Cas d\'erreur - double appel', () => {
  test('devrait bloquer les complétions de mission trop rapprochées (< 5s)');
});
```

**Scénarios testés :**
- ✅ Blocage appels < 5 secondes
- ✅ Protection double complétion
- ✅ Timestamp anti-doublon
- ✅ Logging des tentatives

#### **Cas d'erreur - validation**
```javascript
describe('Cas d\'erreur - validation', () => {
  test('devrait rejeter si missionId est manquant');
  test('devrait rejeter si l\'utilisateur n\'existe pas');
  test('devrait rejeter si la mission n\'existe pas');
  test('devrait rejeter si les prérequis ne sont pas satisfaits');
});
```

**Scénarios testés :**
- ✅ Mission ID manquant rejeté
- ✅ Utilisateur inexistant rejeté
- ✅ Mission inexistante rejetée
- ✅ Prérequis non satisfaits rejetés
- ✅ Validation niveau/XP requis

### **3. Tests Authentification**

#### **Cas normal**
```javascript
describe('Cas normal - utilisateur authentifié', () => {
  test('devrait autoriser les appels avec authentification valide');
  test('devrait autoriser les appels admin');
});
```

**Scénarios testés :**
- ✅ Authentification utilisateur standard
- ✅ Authentification admin
- ✅ Validation tokens valides
- ✅ Vérification email vérifié

#### **Cas d'erreur - user non auth**
```javascript
describe('Cas d\'erreur - user non auth', () => {
  test('devrait rejeter les appels sans authentification');
  test('devrait rejeter les appels avec auth vide');
  test('devrait rejeter les appels avec uid manquant');
  test('devrait rejeter les appels avec uid vide');
  test('devrait rejeter les appels avec uid null');
});
```

**Scénarios testés :**
- ✅ Pas d'authentification rejetée
- ✅ Auth vide rejetée
- ✅ UID manquant rejeté
- ✅ UID vide rejeté
- ✅ UID null rejeté

#### **Cas d'erreur - utilisateur non trouvé**
```javascript
describe('Cas d\'erreur - utilisateur non trouvé', () => {
  test('devrait rejeter si l\'utilisateur n\'existe pas en base');
});
```

**Scénarios testés :**
- ✅ Utilisateur inexistant en base rejeté
- ✅ Validation existence utilisateur
- ✅ Gération erreurs base de données

#### **Cas d'erreur - utilisateur désactivé**
```javascript
describe('Cas d\'erreur - utilisateur désactivé', () => {
  test('devrait rejeter si l\'utilisateur est désactivé');
});
```

**Scénarios testés :**
- ✅ Utilisateur désactivé rejeté
- ✅ Vérification statut utilisateur
- ✅ Raison de désactivation

#### **Tests de sécurité**
```javascript
describe('Tests de sécurité', () => {
  test('devrait rejeter les tokens expirés');
  test('devrait rejeter les tokens invalides');
  test('devrait logger les tentatives d\'accès non autorisées');
});
```

**Scénarios testés :**
- ✅ Tokens expirés rejetés
- ✅ Tokens invalides rejetés
- ✅ Logging tentatives non autorisées
- ✅ Validation émetteur token

## 📊 Résultats Attendus

### **✅ Cas normaux**
```javascript
// addXp réussi
{
  success: true,
  data: {
    previousXP: 1000,
    newXP: 1050,
    amount: 50,
    source: 'mission_completion',
    level: 10,
    progress: { currentLevel: 10, progressPercentage: 25 },
    streak: 5,
    leveledUp: false,
    levelsGained: 0
  }
}

// completeMission réussi
{
  success: true,
  data: {
    missionId: 'mission-001',
    missionTitle: 'Mission Test',
    missionType: 'daily',
    xpRewarded: 75,
    newXP: 1075,
    newLevel: 10,
    streak: 6,
    completionData: { completionTime: 120, score: 95 }
  }
}

// Authentification réussie
{
  isValid: true,
  userId: 'test-user-123',
  email: 'test@example.com',
  isAdmin: false
}
```

### **❌ Cas d'erreurs**
```javascript
// Double appel addXp
Error: Double exécution détectée

// Mission déjà complétée
Error: Mission déjà complétée

// Utilisateur non authentifié
{
  isValid: false,
  error: 'Authentification requise',
  code: 'UNAUTHENTICATED'
}

// Token expiré
{
  isValid: false,
  error: 'Token expiré',
  code: 'TOKEN_EXPIRED'
}
```

## 📊 Configuration Jest

### **🔧 Configuration principale**
```javascript
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/*.test.js'],
  collectCoverage: true,
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  testTimeout: 10000,
  setupFilesAfterEnv: ['./setup.js'],
  clearMocks: true,
  restoreMocks: true
};
```

### **📊 Configuration coverage**
```javascript
coverageDirectory: '../coverage',
coverageReporters: ['text', 'lcov', 'html'],
collectCoverageFrom: [
  '../**/*.js',
  '!../tests/**',
  '!../node_modules/**',
  '!**/config/**',
  '!**/middleware/**'
]
```

## 🛠️ Utilitaires de Test

### **📋 Mocks globaux**
```javascript
// Mock Firebase Admin
global.createMockUserDoc = (overrides = {}) => ({
  exists: true,
  data: () => ({
    uid: 'test-user-123',
    email: 'test@example.com',
    xp: 1000,
    level: 10,
    streak: 5,
    ...overrides
  })
});

// Mock requête
global.createMockRequest = (overrides = {}) => ({
  auth: {
    uid: 'test-user-123',
    token: { email: 'test@example.com', email_verified: true }
  },
  data: { test: 'test_data' },
  ...overrides
});

// Mock réponse
global.createMockResponse = () => ({
  statusCode: 200,
  headers: {},
  send: jest.fn(),
  json: jest.fn(),
  status: jest.fn(),
  set: jest.fn()
});
```

### **🔧 Setup des tests**
```javascript
// Configuration globale
process.env.NODE_ENV = 'test';
process.env.FUNCTIONS_EMULATOR = 'true';

// Mocks automatiques
jest.mock('firebase-admin', () => mockFirebaseAdmin);
jest.mock('firebase-functions/v2', () => mockFirebaseFunctions);

// Nettoyage entre tests
afterEach(() => {
  jest.clearAllMocks();
});
```

## 📊 Exécution des Tests

### **🚀 Commandes disponibles**
```bash
# Tests complets
npm test                    # Tous les tests
npm run test:watch          # Mode watch
npm run test:coverage       # Avec coverage
npm run test:ci             # Pour CI/CD
npm run test:verbose        # Output détaillé

# Tests spécifiques
npm run test:specific "addXp"        # Tests addXp seulement
npm run test:specific "auth"           # Tests auth seulement
npm run test:specific "double appel"    # Tests double appel

# Debug et rapport
npm run test:debug          # Mode debug
npm run test:report         # Rapport HTML
```

### **📊 Résultats attendus**
```bash
# Succès
PASS tests/backend/addXp.test.js
  Cas normal - addXp
    ✓ devrait ajouter XP avec succès (45ms)
    ✓ devrait gérer le level up correctement (32ms)
    ✓ devrait mettre à jour le streak d'activité (28ms)

  Cas d'erreur - double appel
    ✓ devrait bloquer les appels trop rapprochés (15ms)
    ✓ devrait autoriser les appels espacés (12ms)

Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
Snapshots:   0 total
Time:        2.345s

# Échec
FAIL tests/backend/addXp.test.js
  Cas d'erreur - validation
    ✕ devrait rejeter les montants invalides (5ms)

    Error: Montant XP invalide
      at addXp (xp/addXp.js:94:15)
```

## ✅ Critères de Succès

### **📊 Coverage**
- **Branches**: ≥ 80%
- **Functions**: ≥ 80%
- **Lines**: ≥ 80%
- **Statements**: ≥ 80%

### **⚡ Performance**
- **addXp**: < 100ms par appel
- **completeMission**: < 200ms par appel
- **Authentification**: < 50ms par validation

### **🔒 Sécurité**
- **100%** des cas d'authentification non valide rejetés
- **100%** des doubles appels bloqués
- **100%** des validations d'entrée respectées

### **🛡️ Fiabilité**
- **0** false negative dans les cas normaux
- **0** false positive dans les cas d'erreur
- **100%** des erreurs correctement loggées

## 🚀 Intégration CI/CD

### **🔄 GitHub Actions**
```yaml
name: Backend Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: cd functions/tests/backend && npm install
      - run: cd functions/tests/backend && npm run test:ci
      - uses: codecov/codecov-action@v1
```

### **📊 Rapports**
- **Coverage HTML**: `coverage/html-report/report.html`
- **Coverage LCov**: `coverage/lcov.info`
- **Rapport JUnit**: `coverage/junit.xml`

La suite de tests critiques garantit la **fiabilité**, la **sécurité** et la **performance** des fonctions backend KidAI ! 🧪✨
