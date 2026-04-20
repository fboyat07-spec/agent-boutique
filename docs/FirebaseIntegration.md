# 🔥 Firebase Integration Guide

## 📋 Vue d'ensemble

KidAI utilise Firebase pour l'authentification et la sauvegarde des données utilisateur avec une architecture hybride :
- **Frontend** : Firebase SDK (authentification directe)
- **Backend** : Firebase Admin SDK (validation et traitement)
- **Fallback** : API backend si Firebase indisponible

## 🏗️ Architecture

### Frontend (React Native)
```
├── config/
│   └── firebase.js          # Configuration Firebase SDK
├── services/
│   ├── authService.js       # Service authentification
│   └── dataService.js       # Service données utilisateur
```

### Backend (Node.js)
```
├── config/
│   └── firebase.js          # Configuration Firebase Admin
├── services/
│   ├── authService.js       # Service auth backend
│   └── dataService.js       # Service données backend
└── routes/
    ├── firebaseAuth.js       # Routes Firebase auth
    └── progress.js          # Routes progression
```

## 🚀 Installation

### 1. Créer un projet Firebase
1. Allez sur [Firebase Console](https://console.firebase.google.com/)
2. Créez un nouveau projet "KidAI"
3. Activez **Authentication** → **Email/Password**
4. Créez une **Firestore Database**
5. Générez une **Service Account Key**

### 2. Configurer les variables d'environnement
```bash
# Copier .env.example vers .env
cp .env.example .env

# Éditer .env avec vos clés Firebase
```

### 3. Installer les dépendances
```bash
# Backend
cd backend
npm install firebase admin firebase-functions

# Frontend  
cd frontend
npm install firebase
```

## 🔧 Configuration

### Backend (.env)
```env
# Configuration Firebase Admin
FIREBASE_PROJECT_ID=votre_projet_id
FIREBASE_DATABASE_URL=https://votre_projet_id.firebaseio.com
FIREBASE_CLIENT_EMAIL=votre_service_account_email
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----..."
```

### Frontend (.env)
```env
# Configuration Firebase SDK
EXPO_PUBLIC_FIREBASE_API_KEY=votre_api_key_web
EXPO_PUBLIC_FIREBASE_PROJECT_ID=votre_projet_id
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=votre_projet.firebaseapp.com
```

## 📱 Utilisation Frontend

### Authentification
```javascript
import authService from '../services/authService';

// Inscription
const result = await authService.register(
  'email@example.com', 
  'password123', 
  'Nom Enfant', 
  8, 
  'parent@example.com'
);

// Connexion
const loginResult = await authService.login('email@example.com', 'password123');

// Déconnexion
await authService.logout();

// Écouter les changements d'auth
authService.onAuthStateChange((user) => {
  if (user) {
    // Utilisateur connecté
    console.log('User logged in:', user.uid);
  } else {
    // Utilisateur déconnecté
    console.log('User logged out');
  }
});
```

### Données utilisateur
```javascript
import dataService from '../services/dataService';

// Sauvegarder un diagnostic
await dataService.saveDiagnostic({
  subject: 'mathématiques',
  level: 'débutant',
  score: 85,
  responses: [...]
});

// Obtenir la progression
const progress = await dataService.getUserProgress();

// Mettre à jour la progression
await dataService.updateProgress({
  totalQuestions: 50,
  correctAnswers: 42,
  streak: 5
});
```

## 🔧 Utilisation Backend

### Routes Firebase Auth
```javascript
// Inscription
POST /api/firebase-auth/register
{
  "email": "email@example.com",
  "password": "password123",
  "displayName": "Nom Enfant",
  "age": 8,
  "parentEmail": "parent@example.com"
}

// Obtenir le profil
GET /api/firebase-auth/profile
Headers: Authorization: Bearer <firebase_token>

// Mettre à jour le profil
PUT /api/firebase-auth/profile
{
  "displayName": "Nouveau Nom",
  "age": 9,
  "preferences": {
    "theme": "dark",
    "notifications": true
  }
}
```

### Routes Progression
```javascript
// Sauvegarder un diagnostic
POST /api/progress/diagnostic
{
  "subject": "mathématiques",
  "level": "débutant",
  "score": 85,
  "responses": [...]
}

// Obtenir la progression
GET /api/progress/user

// Sauvegarder une session
POST /api/progress/session
{
  "subject": "lecture",
  "duration": 1800,
  "questions": 15
}

// Obtenir les recommandations
GET /api/progress/recommendations
```

## 📊 Structure des données

### Users Collection
```javascript
{
  uid: "user_id",
  email: "email@example.com",
  displayName: "Nom Enfant",
  age: 8,
  parentEmail: "parent@example.com",
  createdAt: timestamp,
  lastLogin: timestamp,
  isActive: true,
  subscription: "free",
  progress: {
    totalSessions: 0,
    totalQuestions: 0,
    correctAnswers: 0,
    streak: 0,
    level: "beginner",
    accuracy: 0
  },
  preferences: {
    theme: "light",
    notifications: true,
    soundEnabled: true,
    language: "fr"
  }
}
```

### Diagnostics Collection
```javascript
{
  uid: "user_id",
  subject: "mathématiques",
  level: "débutant",
  score: 85,
  responses: [
    {
      question: "2+2",
      answer: "4",
      isCorrect: true,
      timeTaken: 5000
    }
  ],
  completedAt: timestamp,
  type: "initial"
}
```

### Learning Sessions Collection
```javascript
{
  uid: "user_id",
  subject: "lecture",
  duration: 1800,
  questions: 15,
  startedAt: timestamp,
  status: "completed",
  results: {
    score: 90,
    correctAnswers: 14,
    timeSpent: 1800
  }
}
```

## 🔄 Synchronisation

### Stratégie hybride
1. **Firebase SDK** (Frontend) : Authentification directe
2. **Firebase Admin** (Backend) : Validation et traitement
3. **API Fallback** : Si Firebase indisponible

### Sync automatique
```javascript
// Synchroniser les données
const syncResult = await dataService.syncData();
if (syncResult.success) {
  console.log('Données synchronisées:', syncResult.synced);
}
```

## 🛡️ Sécurité

### Règles Firestore
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users peuvent lire/écrire leurs propres données
    match /users/{userId} {
      allow read, write: request.auth != null && request.auth.uid == userId;
    }
    
    // Accès aux diagnostics de l'utilisateur
    match /diagnostics/{docId} {
      allow read, write: request.auth != null && 
        request.auth.uid == resource.data.uid;
    }
    
    // Sessions d'apprentissage
    match /learning_sessions/{sessionId} {
      allow read, write: request.auth != null && 
        request.auth.uid == resource.data.uid;
    }
    
    // Questions et réponses
    match /questions/{questionId} {
      allow read, write: request.auth != null && 
        request.auth.uid == resource.data.uid;
    }
  }
}
```

### Validation Backend
```javascript
// Vérification du token Firebase
const authenticateToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Token manquant' });
  }

  const result = await authService.verifyToken(token);
  if (!result.success) {
    return res.status(403).json({ error: 'Token invalide' });
  }

  req.user = result.user;
  next();
};
```

## 📈 Analytics et Monitoring

### Events tracking
```javascript
// Suivre les événements d'apprentissage
await analytics.logEvent('learning_session_completed', {
  subject: 'mathematics',
  score: 85,
  time_spent: 1800,
  user_level: 'beginner'
});

// Suivre les erreurs
await analytics.logEvent('error_occurred', {
  error_type: 'authentication',
  error_message: 'Invalid credentials'
});
```

### Performance monitoring
```javascript
// Monitoring des performances
import { getPerformance } from 'firebase/performance';

const perf = getPerformance();

// Mesurer le temps de chargement
const trace = perf.trace('app_startup');
trace.start();
// ... chargement de l'app
trace.stop();
```

## 🚀 Déploiement

### Configuration Production
```env
# Production
NODE_ENV=production
FIREBASE_PROJECT_ID=kidai-prod
EXPO_PUBLIC_FIREBASE_PROJECT_ID=kidai-prod
```

### Build et Deploy
```bash
# Frontend Expo
expo build:android
expo build:ios

# Backend
npm run build
npm run deploy
```

## 🔧 Dépannage

### Erreurs communes

#### "Firebase project not initialized"
**Cause :** Configuration manquante
**Solution :** Vérifier les variables d'environnement

#### "Permission denied"
**Cause :** Règles Firestore
**Solution :** Mettre à jour les règles de sécurité

#### "Invalid token"
**Cause :** Token expiré
**Solution :** Refresh automatique du token

### Debug mode
```javascript
// Activer le debug Firebase
if (__DEV__) {
  console.log('Firebase Debug Mode');
  // Logs supplémentaires
}
```

## 📊 Monitoring

### Dashboard Firebase
- **Authentication** : Connexions/inscriptions
- **Firestore** : Requêtes et performances
- **Performance** : Temps de chargement
- **Analytics** : Utilisation et événements

### Alertes
- **Erreurs d'authentification** : Email immédiat
- **Performance dégradée** : Alertes automatiques
- **Usage anormal** : Détection d'anomalies

---

**L'intégration Firebase est maintenant prête pour la production !** 🔥
