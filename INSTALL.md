# 🚀 GUIDE D'INSTALLATION WINDOWS - KidAI Learning

## ✅ PRÉREQUIS (à installer si pas déjà fait)

### 1. Node.js
- Va sur https://nodejs.org
- Télécharge la version **LTS** (ex: 20.x)
- Installe avec les options par défaut
- Vérifie : ouvre un terminal et tape `node --version` → doit afficher v20.x.x

### 2. Expo CLI
```bash
npm install -g expo-cli
npm install -g eas-cli
```

### 3. Expo Go sur ton téléphone
- Va sur l'App Store (iPhone) ou Play Store (Android)
- Installe **"Expo Go"**
- C'est l'app qui va afficher ton application pendant le développement

---

## 📁 ÉTAPE 1 — CRÉER LA STRUCTURE

Ouvre un **terminal** (cmd ou PowerShell) et tape :

```bash
mkdir kidai-learning-app
cd kidai-learning-app
mkdir backend\routes
mkdir backend\services
mkdir backend\middleware
mkdir database
mkdir frontend\screens
mkdir frontend\services
```

---

## 📋 ÉTAPE 2 — COPIER LES FICHIERS

Copie tous les fichiers générés dans la bonne structure :

```
kidai-learning-app/
├── package.json                          ← racine
├── .env.example                          ← renommer en .env
├── backend/
│   ├── server.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── diagnostic.js
│   │   ├── missions.js
│   │   └── ai.js
│   ├── services/
│   │   ├── openaiService.js
│   │   ├── gapAnalyzer.js
│   │   └── adaptiveEngine.js
│   └── middleware/
│       └── auth.js
├── database/
│   └── firebase.js
└── frontend/
    ├── App.js
    ├── app.json
    ├── babel.config.js
    ├── package.json
    ├── screens/
    │   ├── LoginScreen.js
    │   ├── RegisterScreen.js
    │   ├── HomeScreen.js
    │   ├── DiagnosticScreen.js
    │   ├── DiagnosticResultScreen.js
    │   ├── MissionScreen.js
    │   ├── MissionResultScreen.js
    │   ├── AITutorScreen.js
    │   └── ProgressScreen.js
    └── services/
        └── api.js
```

---

## 🔑 ÉTAPE 3 — CONFIGURER LES CLÉS API

1. Renomme `.env.example` en `.env`
2. Ouvre-le avec le Bloc-notes
3. Remplace les valeurs :

```env
OPENAI_API_KEY=sk-METS-TA-VRAIE-CLE-ICI
OPENAI_MODEL=gpt-4o-mini
PORT=3000
NODE_ENV=development
JWT_SECRET=kidai-mon-secret-perso-2024
```

> **Note Firebase** : Laisse les champs Firebase vides pour l'instant.
> L'app fonctionne en **mode démo** (données en mémoire) sans Firebase.
> Les données sont perdues au redémarrage du serveur — c'est normal en mode démo.

---

## 📦 ÉTAPE 4 — INSTALLER LES DÉPENDANCES

### Backend (dans le dossier racine)
```bash
cd kidai-learning-app
npm install
```

### Frontend
```bash
cd frontend
npm install
cd ..
```

---

## 🌐 ÉTAPE 5 — CONFIGURER L'IP POUR LE TÉLÉPHONE

Si tu testes sur un **vrai téléphone** (recommandé) :

1. Trouve l'IP de ton PC :
   - Ouvre cmd
   - Tape `ipconfig`
   - Note la ligne **"Adresse IPv4"** (ex: 192.168.1.45)

2. Ouvre `frontend/services/api.js`
3. Change la ligne :
```javascript
// AVANT
const BASE_URL = 'http://localhost:3000/api';

// APRÈS (avec ton IP)
const BASE_URL = 'http://192.168.1.45:3000/api';
```

> ⚠️ Ton téléphone et ton PC doivent être sur le **même WiFi**

---

## 🚀 ÉTAPE 6 — LANCER L'APPLICATION

### Terminal 1 — Backend
```bash
cd kidai-learning-app
npm run dev
```
Tu dois voir : `🚀 KidAI Backend démarré sur http://localhost:3000`

### Terminal 2 — Frontend
```bash
cd kidai-learning-app/frontend
npx expo start
```
Tu verras un **QR code** dans le terminal.

### Sur ton téléphone
1. Ouvre **Expo Go**
2. Appuie sur **"Scan QR code"**
3. Scanne le QR code
4. L'app se lance ! 🎉

---

## ✅ VÉRIFICATION — L'APP FONCTIONNE SI :

- [ ] L'écran de connexion s'affiche
- [ ] Tu peux créer un compte
- [ ] Le diagnostic se lance avec des questions
- [ ] Les réponses sont corrigées
- [ ] Le parcours personnalisé s'affiche
- [ ] Les missions s'enchaînent
- [ ] L'XP augmente après chaque bonne réponse
- [ ] Le tuteur IA répond (ou affiche le message mode démo)

---

## 🔧 PROBLÈMES COURANTS

### "Cannot connect to server"
→ Vérifie que le backend tourne (Terminal 1)
→ Vérifie l'IP dans `api.js` si tu testes sur téléphone réel

### "Module not found"
→ Relance `npm install` dans le dossier concerné

### "Expo command not found"
→ Relance `npm install -g expo-cli`

### L'IA répond "mode démo"
→ Normal ! Ajoute ta vraie clé OpenAI dans `.env` et redémarre le backend

### Les données disparaissent au redémarrage
→ Normal en mode démo sans Firebase. Pour persister, configure Firebase.

---

## 🔥 OPTIONNEL — CONFIGURER FIREBASE (persistance des données)

1. Va sur https://console.firebase.google.com
2. Crée un projet
3. Va dans **Paramètres du projet** → **Comptes de service**
4. Clique **"Générer une nouvelle clé privée"**
5. Copie les valeurs dans ton `.env`

---

## 📊 TEST COMPLET RECOMMANDÉ

1. Crée un compte avec un enfant de **9 ans**
2. Lance le diagnostic → réponds à toutes les questions
3. Vérifie que le rapport IA affiche des lacunes détectées
4. Lance les missions → fais 5 réponses
5. Vérifie que l'XP monte et que les badges apparaissent
6. Va dans l'onglet **Progrès** → vérifie les stats
7. Va dans **Tuteur IA** → pose une question de maths

---

**🎉 Si tout fonctionne, ton MVP KidAI est opérationnel !**
