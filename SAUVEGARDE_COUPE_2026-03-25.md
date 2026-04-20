# Sauvegarde de coupure - 2026-03-25 (mise a jour)

## Etat actuel
- Backend: OK sur `http://localhost:3000`
- Firestore: actif (`/health` => `firestoreEnabled=true`)
- Frontend: export web reussi (`expo export -p web --clear`)
- IA: Ollama Phi-3 branchee, reponse reelle possible mais latence variable

## Modifications confirmees
- `C:\Users\Florian\CascadeProjects\kidai-claude\backend\routes\ai.js`
- `C:\Users\Florian\CascadeProjects\kidai-claude\backend\middleware\auth.js`
- `C:\Users\Florian\CascadeProjects\kidai-claude\frontend\services\api.js`
- `C:\Users\Florian\CascadeProjects\kidai-claude\frontend\screens\RegisterScreen.js`
- `C:\Users\Florian\CascadeProjects\kidai-claude\.env.example`
- `C:\Users\Florian\CascadeProjects\kidai-claude\.env`
- `C:\Users\Florian\CascadeProjects\kidai-claude\backend\.env`
- `C:\Users\Florian\CascadeProjects\kidai-claude\ETAT_APP.md`

## Validation backend
- E2E OK:
  - register/login
  - diagnostic start/submit
  - missions next/stats
  - ai chat (200 OK)

## Important
- Si le tuteur retourne `demo: true`, c'est un fallback timeout IA locale.
- Cause: latence Ollama/Phi-3 variable sur machine locale.

## Redemarrage rapide
```powershell
cd C:\Users\Florian\CascadeProjects\kidai-claude
npm run dev

cd C:\Users\Florian\CascadeProjects\kidai-claude\frontend
& "C:\Program Files\nodejs\npx.cmd" expo start --web --port 8082

# Test
Invoke-RestMethod http://localhost:3000/health
```

## Prochaine action a la reprise
1. Relancer backend + expo
2. Tester login -> diagnostic -> mission -> tuteur
3. Si IA trop lente, augmenter `AI_TUTOR_TIMEOUT_MS` ou passer sur modele local plus rapide
