# WhatsApp Webhook Debug Guide

## Configuration Meta Required

### 1. Webhook URL
```
https://your-railway-domain.railway.app/webhook/whatsapp
```

### 2. Verify Token
```
my_verify_token_2468
```

### 3. Subscriptions Required
- ✅ `messages` (incoming messages)
- ✅ `message_delivery` (delivery status)

## Debug Checklist

### Étape 1: Vérifier Webhook URL
- [ ] URL accessible via browser
- [ ] Test: `https://your-domain.railway.app/ping` → `OK`
- [ ] Test: `https://your-domain.railway.app/webhook-test` → JSON

### Étape 2: Vérifier Verify Token
- [ ] Meta config: `my_verify_token_2468`
- [ ] Railway env: `VERIFY_TOKEN=my_verify_token_2468`
- [ ] Test: `GET /webhook/whatsapp?hub.mode=subscribe&hub.verify_token=my_verify_token_2468&hub.challenge=123`

### Étape 3: Vérifier Subscriptions
- [ ] Messages subscription active
- [ ] Webhook events enabled
- [ ] Phone number connected

### Étape 4: Tester Message Entrant
- [ ] Envoyer message WhatsApp
- [ ] Vérifier logs: `[WEBHOOK HIT]`
- [ ] Vérifier logs: `[AI] Message reçu`

## Logs Attendus

### Webhook Hit
```
[WEBHOOK HIT] POST /webhook/whatsapp called
[WEBHOOK HIT] Headers: [content-type, x-hub-signature-256, ...]
[WEBHOOK HIT] Content-Type: application/json
[WEBHOOK HIT] Body keys: [object, entry]
```

### Message Reçu
```
[AI] Message reçu: 33612345678
[AI] Réponse générée pour 33612345678
[AI] Message envoyé à 33612345678
```

## Test Commands

### Local
```bash
curl http://localhost:3000/ping
curl http://localhost:3000/webhook-test
```

### Production
```bash
curl https://your-domain.railway.app/ping
curl https://your-domain.railway.app/webhook-test
```

### Webhook Verification
```bash
curl "https://your-domain.railway.app/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=my_verify_token_2468&hub.challenge=123"
```

## Common Issues

### No [WEBHOOK HIT] logs
- ❌ Webhook URL incorrect
- ❌ Serveur inaccessible
- ❌ Firewall bloque

### [WEBHOOK HIT] but no messages
- ❌ Subscriptions non configurées
- ❌ Phone number non connecté
- ❌ Permissions manquantes

### Meta Configuration
1. Meta for Developers → WhatsApp → Configuration
2. Webhook URL: `https://your-domain.railway.app/webhook/whatsapp`
3. Verify Token: `my_verify_token_2468`
4. Add field: `messages`
5. Save and verify
