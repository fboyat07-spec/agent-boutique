# Firebase Scheduled Functions (Cron Jobs)

## 📅 Fonctions planifiées optimisées pour coût minimal

### 🔄 `resetDailyMissions`
**Exécution**: Tous les jours à minuit (UTC+1)  
**Coût**: ~0.01$ par 1000 utilisateurs  
**Fonction**: Réinitialise les missions quotidiennes pour tous les utilisateurs actifs

```javascript
// Schedule: 0 0 * * * (tous les jours à minuit)
export const resetDailyMissions = functions.pubsub
  .schedule('0 0 * * *')
  .timeZone('Europe/Paris')
  .onRun(async (context) => {
    // Réinitialise les missions pour utilisateurs actifs (30 derniers jours)
    // Génère des missions variées selon le jour
    // Traite par lots de 50 pour optimiser les coûts
  });
```

### 📧 `sendReEngagementNotifications`
**Exécution**: Tous les jours à 12h (UTC+1)  
**Coût**: ~0.01$ par 100 notifications envoyées  
**Fonction**: Envoie des notifications de réengagement aux utilisateurs inactifs

```javascript
// Schedule: 0 12 * * * (tous les jours à midi)
export const sendReEngagementNotifications = functions.pubsub
  .schedule('0 12 * * *')
  .timeZone('Europe/Paris')
  .onRun(async (context) => {
    // Cible les utilisateurs inactifs 24h-72h
    // Messages personnalisés selon durée d'inactivité
    // Limite à 100 utilisateurs par exécution
  });
```

### 🧹 `cleanupOldData`
**Exécution**: Tous les dimanches à 2h (UTC+1)  
**Coût**: ~0.005$ par 1000 documents supprimés  
**Fonction**: Nettoie les anciennes données analytics et sessions

```javascript
// Schedule: 0 2 * * 0 (tous les dimanches à 2h)
export const cleanupOldData = functions.pubsub
  .schedule('0 2 * * 0')
  .timeZone('Europe/Paris')
  .onRun(async (context) => {
    // Supprime les analytics > 90 jours
    // Supprime les sessions > 30 jours
    // Traite par lots de 1000 documents
  });
```

## 💰 Optimisation des coûts

### 📊 Estimation des coûts mensuels

| Fonction | Fréquence | Utilisateurs | Coût mensuel estimé |
|----------|-----------|---------------|---------------------|
| `resetDailyMissions` | 30/jour | 1000 | ~0.30$ |
| `sendReEngagementNotifications` | 30/jour | 100 notifications/jour | ~0.03$ |
| `cleanupOldData` | 4/mois | 5000 documents | ~0.01$ |
| **Total** | | | **~0.34$** |

### 🎯 Stratégies d'optimisation

#### 1. **Limitation des requêtes**
```javascript
// Limiter aux utilisateurs actifs (30 derniers jours)
.where('lastActivity', '>=', thirtyDaysAgo)

// Limiter les notifications (max 100 par exécution)
.limit(100)
```

#### 2. **Traitement par lots**
```javascript
// Lots de 50 utilisateurs pour les missions
const batchSize = 50;

// Lots de 10 pour les notifications push
const notificationBatchSize = 10;
```

#### 3. **Filtrage intelligent**
```javascript
// Uniquement les utilisateurs avec token push
.where('pushToken', '!=', null)

// Uniquement les notifications activées
.where('notificationSettings.enabled', '==', true)
```

#### 4. **Pause entre les lots**
```javascript
// Éviter les pics d'utilisation
await new Promise(resolve => setTimeout(resolve, 100));
```

## 🧪 Tests et monitoring

### 📋 Test manuel
```bash
# Tester une fonction planifiée
curl "https://us-central1-your-project.cloudfunctions.net/testScheduledFunctions?function=resetDailyMissions"
```

### 📊 Logs et monitoring
```bash
# Voir les logs des fonctions planifiées
firebase functions:log --only resetDailyMissions
firebase functions:log --only sendReEngagementNotifications
firebase functions:log --only cleanupOldData
```

### 📈 Métriques suivies
- **Temps d'exécution**
- **Nombre d'utilisateurs traités**
- **Taux d'erreur**
- **Coût par exécution**

## 🔧 Déploiement et configuration

### 📦 Déploiement
```bash
# Déployer toutes les fonctions
firebase deploy --only functions

# Déployer uniquement les fonctions planifiées
firebase deploy --only functions:resetDailyMissions,functions:sendReEngagementNotifications,functions:cleanupOldData
```

### ⚙️ Configuration du fuseau horaire
```javascript
.timeZone('Europe/Paris') // UTC+1
```

### 🕐 Horaires d'exécution
| Fonction | Heure locale | Heure UTC | Raison |
|----------|--------------|-----------|--------|
| `resetDailyMissions` | 00:00 | 23:00 (veille) | Début de journée |
| `sendReEngagementNotifications` | 12:00 | 11:00 | Pause déjeuner |
| `cleanupOldData` | 02:00 | 01:00 | Nuit, faible activité |

## 🚨 Gestion des erreurs

### 🛡️ Retry automatique
Firebase Functions réessaie automatiquement en cas d'échec (max 5 fois).

### 📝 Logs détaillés
```javascript
console.log(`✅ Réinitialisation missions terminée:`);
console.log(`   - Utilisateurs traités: ${totalUsers}`);
console.log(`   - Missions réinitialisées: ${resetCount}`);
console.log(`   - Erreurs: ${errorCount}`);
console.log(`   - Durée: ${duration}ms`);
console.log(`   - Coût estimé: ${Math.ceil(totalUsers / 100)} opérations Firestore`);
```

### 🔄 Gestion des erreurs partielles
- Continue le traitement même si certains utilisateurs échouent
- Compte les succès et échecs séparément
- Retourne les erreurs pour debugging

## 📱 Impact utilisateur

### 🔄 `resetDailyMissions`
- **Avant**: 0h00, nouvelles missions disponibles
- **Impact**: Transparent pour l'utilisateur
- **Notification**: Aucune (silencieux)

### 📧 `sendReEngagementNotifications`
- **Message**: Personnalisé selon durée d'inactivité
- **Fréquence**: Maximum 1 notification par jour
- **Opt-out**: Respecte les préférences utilisateur

### 🧹 `cleanupOldData`
- **Impact**: Aucun (données anciennes uniquement)
- **Performance**: Améliore la vitesse de requêtes
- **Stockage**: Réduit les coûts de stockage

## 🔮 Évolutions possibles

### 📊 Analytics avancées
- Taux de réengagement après notification
- Temps moyen avant retour utilisateur
- Segmentation par type d'utilisateur

### 🎯 Personnalisation accrue
- Messages basés sur les préférences utilisateur
- Timing adapté aux habitudes individuelles
- Contenu dynamique selon le profil

### 🤖 Intelligence artificielle
- Prédiction des risques de churn
- Optimisation des temps d'envoi
- Génération de messages personnalisés

## 📞 Support

En cas de problème avec les fonctions planifiées :

1. **Vérifier les logs**: `firebase functions:log`
2. **Tester manuellement**: Endpoint `testScheduledFunctions`
3. **Vérifier le fuseau horaire**: `Europe/Paris`
4. **Contrôler les coûts**: Monitoring Firebase Console

Les fonctions sont conçues pour être **robustes, économiques et maintenables**. 🚀
