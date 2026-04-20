# LOVABLE_PROJECT_HANDOFF.md

## 1) Contexte projet (a coller tel quel dans Lovable)

Tu reprends un projet existant **KidAI Learning** (app EdTech pour enfants), deja code en **Node.js + Express (backend)** et **Expo React Native (frontend)**.

### Objectif prioritaire
- **NE PAS refaire from scratch**.
- Stabiliser l'existant pour un usage pre-prod.
- Respecter le scope actuel (auth, diagnostic, missions, tuteur IA, progression).
- Corriger les incoherences de persistance Firestore.
- Rendre le flux E2E fiable.

### Contraintes
- Langue UI/UX: francais.
- Pas d'ajout de mega-features hors scope.
- Priorite a la robustesse, aux erreurs explicites et a la coherence data.

---

## 2) Etat technique actuel (audit reel)

### Racine projet
- `C:\Users\Florian\CascadeProjects\kidai-claude`

### Stack
- Backend: Express (CommonJS)
- Frontend: Expo SDK 54 + React Native 0.76.7 + React 18.3.1
- Persistance: Firebase Admin / Firestore (active selon env)
- IA: OpenAI SDK branche sur OpenAI **ou** Ollama (`/v1`) selon `AI_PROVIDER`

### Scripts racine
- `npm run dev` -> `nodemon backend/server.js`
- `npm run start` -> `node backend/server.js`

### Scripts frontend
- `expo start`, `expo start --web`

---

## 3) Ce qui est deja fait

1. **Backend principal operationnel**
   - `backend/server.js`
   - Routes exposees:
     - `/api/auth`
     - `/api/diagnostic`
     - `/api/missions`
     - `/api/ai`
     - `/health`

2. **Endpoints principaux presentes**
   - Auth:
     - `POST /api/auth/register`
     - `POST /api/auth/login`
     - `GET /api/auth/profile` (JWT)
   - Diagnostic:
     - `POST /api/diagnostic/start`
     - `POST /api/diagnostic/submit`
     - `GET /api/diagnostic/result`
   - Missions:
     - `GET /api/missions/next`
     - `POST /api/missions/answer`
     - `GET /api/missions/stats`
   - IA:
     - `POST /api/ai/chat`

3. **Modules incomplets deja desactives cote serveur**
   - `/api/progress` -> HTTP 410
   - `/api/firebase-auth` -> HTTP 410

4. **Frontend compile en web**
   - Export valide effectue (`expo export -p web --clear`)

5. **Gestion token frontend amelioree**
   - purge `token/user` sur 401/403 dans `frontend/services/api.js`

---

## 4) Probleme critique detecte (P0)

### Incoherence de persistance backend
Il y a un split de persistance entre routes:

- `backend/routes/auth.js` et `backend/routes/missions.js` utilisent `store` (Firestore/memory fallback via `backend/database/firebase.js`).
- **MAIS** `backend/routes/diagnostic.js` et `backend/routes/ai.js` utilisent actuellement un `mockStore` local (Map memoire) au lieu de `store`.

Conséquences:
- Le diagnostic n'ecrit pas dans la meme source que auth/missions.
- Le tuteur lit un etat utilisateur decouple.
- Session incoherente entre modules.

### Comportement IA partiellement mocke
- `backend/services/gapAnalyzer.js` contient une analyse forcee en mode demo (retour simule), pas un vrai usage IA.
- `backend/services/adaptiveEngine.js` tombe rapidement sur fallback si IA lente.
- Avec Ollama Phi-3 local, latence variable -> fallback frequent (`demo: true`).

---

## 5) Dette technique/qualite (P1)

1. **Encodage texte**
- Plusieurs fichiers frontend affichent du texte mojibake (`Ã©`, etc.) selon encodage.
- Harmoniser UTF-8 partout.

2. **CORS backend trop strict pour certains ports web**
- `backend/server.js` autorise seulement `8082/8083/8084`.
- A verifier selon port reel expo.

3. **Regles Firestore a realigner avec collections backend**
- Le backend manipule surtout: `users`, `diagnosticSessions`, `missions`.
- Les regles actuelles parlent de `diagnostics`, `learning_sessions`, `questions`.
- Important surtout si acces client direct Firestore est utilise plus tard.

4. **Fichier temporaire parasite**
- `C:\Users\Florian\CascadeProjects\kidai-claude\.__tmp_ollama_test.js` a supprimer.

---

## 6) Plan de correction attendu (ordre strict)

### Phase P0 - Coherence data (obligatoire)
1. Remplacer `mockStore` par `store` dans:
   - `backend/routes/diagnostic.js`
   - `backend/routes/ai.js`
2. Verifier que toutes les routes utilisent la meme source de verite (`store`).
3. Refaire E2E complet et verifier coherence user/session/learningPath.

### Phase P1 - Stabilisation IA
4. Dans `gapAnalyzer` et `adaptiveEngine`, supprimer les retours simules imposes et utiliser un fallback propre seulement en cas d'erreur reelle.
5. Garder timeout configurable via env:
   - `AI_TIMEOUT_MS`
   - `AI_TUTOR_TIMEOUT_MS`
   - `AI_TUTOR_MAX_ATTEMPTS`
6. Garantir que `/api/ai/chat` retourne:
   - reponse reelle quand modele disponible,
   - fallback explicite sinon (sans crash).

### Phase P1 - Frontend hygiene
7. Corriger les textes FR mojibake en UTF-8 dans les ecrans actifs:
   - `frontend/App.js`
   - `frontend/screens/LoginScreen.js`
   - `frontend/screens/RegisterScreen.js`
   - `frontend/screens/DiagnosticScreen.js`
   - `frontend/screens/MissionScreen.js`
   - `frontend/screens/MissionResultScreen.js`
   - `frontend/screens/AITutorScreen.js`
   - `frontend/screens/ProgressScreen.js`
8. Re-verifier warnings web bloquants (shadow/useNativeDriver) sur le parcours principal.

### Phase P2 - Regles & pre-prod
9. Realigner `firebase.firestore.rules` avec les collections effectivement utilisees.
10. Supprimer fichiers obsoletes/parasites.
11. Mettre a jour documentation (`ETAT_APP.md` + README technique).

---

## 7) Criteres d'acceptation (Definition of Done)

### Backend
- `/health` retourne `status=ok`.
- Auth OK: register + login + profile.
- Diagnostic OK: start + submit + result, persiste dans la meme source que auth.
- Missions OK: next + answer + stats.
- AI chat OK: 200 stable, `demo=true` uniquement si indisponibilite reelle.

### Frontend
- Flux principal sans blocage:
  1) Inscription/connexion
  2) Diagnostic
  3) Missions
  4) Tuteur IA
  5) Ecran progression
- Pas d'erreur critique console sur ce parcours.

### Firestore
- Donnees utilisateur persistantes apres restart backend.
- Collections coherentes avec les regles.

---

## 8) Suite de tests attendue (scriptable)

1. Test API rapide:
- `GET /health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/diagnostic/start`
- `POST /api/diagnostic/submit`
- `GET /api/missions/next`
- `GET /api/missions/stats`
- `POST /api/ai/chat`

2. Test frontend web:
- lancement expo web
- scenario utilisateur complet
- verification des codes HTTP (pas de 401/403 hors cas attendu)

3. Test persistence:
- creer user -> restart backend -> relogin -> retrouver etat

---

## 9) Variables d'env attendues (sans valeurs secretes)

- `PORT`
- `NODE_ENV`
- `JWT_SECRET`
- `AI_PROVIDER` (`ollama` ou `openai`)
- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`
- `OLLAMA_FALLBACK_MODELS`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_FALLBACK_MODELS`
- `AI_TIMEOUT_MS`
- `AI_TUTOR_TIMEOUT_MS`
- `AI_TUTOR_MAX_ATTEMPTS`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_PRIVATE_KEY_ID` (optionnel)
- `FIREBASE_ALLOW_MEMORY_FALLBACK`

---

## 10) Prompt Lovable final (copier-coller)

Reprends le projet existant KidAI Learning dans le dossier courant.
Ne regenere pas tout le projet.

Objectif: stabilisation pre-prod, sans ajout de nouvelles features majeures.

Actions obligatoires:
1) Corriger l'incoherence de persistance backend:
   - Remplacer mockStore par store dans backend/routes/diagnostic.js et backend/routes/ai.js.
   - Garantir une source de verite unique pour auth/diagnostic/missions/ai.
2) Stabiliser l'IA:
   - Retirer les retours demo forces dans gapAnalyzer/adaptiveEngine.
   - Conserver fallback propre uniquement sur erreur IA reelle.
   - Respecter timeouts configurables env.
3) Nettoyer frontend du parcours principal:
   - Corriger encodage FR UTF-8 et warnings web bloquants.
4) Realigner firebase.firestore.rules avec les collections backend reelles.
5) Supprimer fichiers temporaires parasites.
6) Mettre a jour ETAT_APP.md avec l'etat final.

Ensuite execute et affiche:
- un tableau "Fait / Reste a faire"
- un journal des fichiers modifies
- un resultat E2E (auth + diagnostic + missions + ai)
- les commandes exactes de lancement local.
