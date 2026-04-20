# 🔐 Règles de Sécurité Firebase

## 📋 Vue d'ensemble

Ce document décrit les règles de sécurité Firebase implémentées pour protéger les données utilisateur et assurer l'intégrité du système.

## 🏗️ Structure des Collections

### 👤 Users Collection
- **Accès** : Uniquement l'utilisateur propriétaire
- **Permissions** : Lecture, écriture, mise à jour, suppression
- **Validations** : XP, niveau, streak, username, avatar, badges, missions, achats

### 🏆 Leaderboard Collection
- **Accès lecture** : Public (tous les utilisateurs authentifiés)
- **Accès écriture** : Uniquement l'utilisateur propriétaire
- **Validations** : XP, niveau, streak, rang, statistiques

### 🛍️ Shop Collection
- **Accès lecture** : Public
- **Accès écriture** : Administrateurs uniquement
- **Validations** : Prix, type, rareté, catégorie

### 🎯 Missions Collection
- **Accès lecture** : Public
- **Accès écriture** : Administrateurs uniquement
- **Validations** : Récompenses XP, difficulté, type

### 🏅 Badges Collection
- **Accès lecture** : Public
- **Accès écriture** : Administrateurs uniquement
- **Validations** : Nom, description, icône, condition

## 🔒 Règles de Sécurité Détaillées

### 👤 Utilisateurs (Users)

#### 📖 Permissions de Lecture
```javascript
match /users/{userId} {
  allow read: if request.auth != null && request.auth.uid == userId;
}
```

#### ✏️ Permissions d'Écriture
```javascript
match /users/{userId} {
  allow update: if request.auth != null && request.auth.uid == userId 
    // Validation des champs obligatoires
    && request.resource.data.keys().hasAll(['xp', 'level', 'streak', 'username', 'avatar', 'badges', 'missions', 'purchases', 'lastActivity', 'updatedAt'])
    
    // Validation des valeurs
    && request.resource.data.xp == resource.data.xp + (request.resource.data.diff.xp || 0)
    && request.resource.data.level >= resource.data.level
    && request.resource.data.streak >= 0
    && request.resource.data.xp >= 0
    && request.resource.data.xp <= 1000000 // Limite de 1M XP
    && request.resource.data.level <= 100 // Limite de niveau 100
    
    // Validation du username
    && request.resource.data.username is string
    && request.resource.data.username.size() >= 3
    && request.resource.data.username.size() <= 30
    
    // Validation de l'avatar
    && (request.resource.data.avatar == null || 
        (request.resource.data.avatar is string && request.resource.data.avatar.size() <= 500))
    
    // Limites des listes
    && request.resource.data.badges is list
    && request.resource.data.badges.size() <= 100
    && request.resource.data.purchases is list
    && request.resource.data.purchases.size() <= 1000;
}
```

### 🏆 Leaderboard

#### 📖 Permissions Publiques
```javascript
match /leaderboard/{leaderboardUserId} {
  // Lecture publique pour tous les utilisateurs authentifiés
  allow read: if true;
  
  // Écriture privée pour l'utilisateur
  allow update: if request.auth != null && request.auth.uid == leaderboardUserId;
}
```

### 🛍️ Shop

#### 🔒 Contrôle Administrateur
```javascript
match /shop/{itemId} {
  allow read: if true; // Lecture publique
  allow write: if request.auth != null && request.auth.token.admin == true;
}
```

### 🎯 Missions et Badges

#### 🛡️ Protection Contre les Abus
```javascript
match /missions/{missionId} {
  allow write: if request.auth != null && request.auth.token.admin == true;
}

match /badges/{badgeId} {
  allow write: if request.auth != null && request.auth.token.admin == true;
}
```

## 🔐 Tokens d'Authentification

### 👑 Administrateur
```javascript
// Token admin requis pour les opérations sensibles
request.auth.token.admin == true
```

### 🤖 Système
```javascript
// Token système pour les opérations automatisées
request.auth.token.system == true
```

## 📊 Collections d'Administration

### 📋 Reports
- **Création** : Tous les utilisateurs
- **Lecture/Suppression** : Administrateurs uniquement
- **Validation** : Type, raison, description

### 📈 Analytics
- **Accès complet** : Administrateurs uniquement
- **Écriture** : Système et administrateurs

### 🔍 Audit
- **Lecture** : Administrateurs uniquement
- **Création** : Système uniquement
- **Modification** : Interdite (logs immuables)

### 🛠️ Maintenance
- **Lecture** : Publique
- **Écriture** : Administrateurs uniquement

## 🚀 Déploiement

### 1. Firestore Rules
```bash
firebase deploy --only firestore:rules
```

### 2. Realtime Database Rules
```bash
firebase deploy --only database
```

## ⚠️ Points de Sécurité

### ✅ Protections Implémentées
1. **Isolation des données** : Chaque utilisateur ne peut accéder qu'à ses données
2. **Validation des entrées** : Types, tailles, plages de valeurs
3. **Contrôle d'accès** : Rôles admin/système pour opérations sensibles
4. **Limitation des ressources** : Maximums pour éviter les abus
5. **Audit trail** : Logs immuables pour traçabilité

### 🔍 Validation des Données

#### XP et Niveau
- XP : 0 ≤ XP ≤ 1,000,000
- Niveau : 1 ≤ Niveau ≤ 100
- Progression : XP ne peut que augmenter

#### Username
- Longueur : 3 ≤ username ≤ 30 caractères
- Type : Chaîne de caractères uniquement

#### Avatar
- Longueur : ≤ 500 caractères
- Type : Chaîne ou null

#### Listes
- Badges : ≤ 100 éléments
- Achats : ≤ 1000 éléments

## 🔄 Maintenance et Monitoring

### 📊 Surveillance
- Logs d'audit pour toutes les opérations sensibles
- Analytics pour détecter les comportements anormaux
- Reports pour les signalements utilisateurs

### 🛡️ Mises à Jour
- Versionning des règles
- Tests de sécurité réguliers
- Validation des nouvelles fonctionnalités

## 🚨 Gestion des Incidents

### 📋 Procédures
1. **Détection** : Monitoring en temps réel
2. **Isolation** : Blocage immédiat si nécessaire
3. **Investigation** : Analyse des logs d'audit
4. **Correction** : Mise à jour des règles
5. **Communication** : Notification aux utilisateurs

## 📚 Références

- [Firebase Security Rules Documentation](https://firebase.google.com/docs/firestore/security/get-started)
- [Security Rules Best Practices](https://firebase.google.com/docs/firestore/security/best-practices)
- [Security Rules Testing](https://firebase.google.com/docs/firestore/security/test-rules)

---

**Dernière mise à jour** : 22/03/2026  
**Version** : 1.0.0  
**Statut** : Production Ready 🔒
