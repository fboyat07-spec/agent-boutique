# Etat Actuel KidAI - 2026-03-25

## Statut global
- Backend local: OK (http://localhost:3000)
- Persistance: Firestore active (plus de mode memoire)
- Frontend Expo web: build OK (`expo export -p web --clear` reussi)
- IA locale: Ollama Phi-3 branchee, mais latence variable (peut tomber en fallback demo si timeout)

## Ce qui est stabilise
1. Auth backend (register/login/profile) OK
2. Diagnostic complet (start/submit/result) OK
3. Missions (next/answer/stats) OK
4. Firestore: ecritures/lectures actives via service account
5. Modules incomplets desactives en prod API:
   - `/api/progress` -> 410
   - `/api/firebase-auth` -> 410

## Corrections appliquees
- `backend/routes/ai.js`
  - intervention tuteur maintenue
  - timeout tuteur configurable (`AI_TUTOR_TIMEOUT_MS`)
  - nb tentatives configurable (`AI_TUTOR_MAX_ATTEMPTS`)
- `backend/middleware/auth.js`
  - message token nettoye
- `frontend/services/api.js`
  - base URL normalisee
  - purge token/user auto sur 401/403
- `frontend/screens/RegisterScreen.js`
  - `boxShadow` web pour enlever warning shadow deprecie
- `.env.example` nettoye et aligne

## Variables critiques
- `AI_PROVIDER=ollama`
- `OLLAMA_BASE_URL=http://127.0.0.1:11434/v1`
- `OLLAMA_MODEL=phi3`
- `AI_TUTOR_TIMEOUT_MS=120000`
- `AI_TUTOR_MAX_ATTEMPTS=1`
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`

## Point restant avant mise en prod
- Rendre la reponse IA plus stable en local (latence Phi-3):
  - option A: timeout plus long
  - option B: modele local plus rapide
  - option C: deploiement backend IA distant pour latence stable

## Commandes de reprise
```powershell
cd C:\Users\Florian\CascadeProjects\kidai-claude
npm run dev

cd C:\Users\Florian\CascadeProjects\kidai-claude\frontend
& "C:\Program Files\nodejs\npx.cmd" expo start --web --port 8082

Invoke-RestMethod http://localhost:3000/health
```
