import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebaseClean';

class LeaderboardSyncService {
  constructor() {
    this.syncQueue = [];
    this.isProcessing = false;
    this.lastSyncTime = null;
    this.SYNC_COOLDOWN = 1000; // 1 seconde entre les synchronisations
    this.MAX_QUEUE_SIZE = 10;
  }

  // Ajouter une synchronisation à la file d'attente
  queueSync(userId, userData) {
    if (!userId) {
      console.warn('⚠️ userId manquant pour la synchronisation leaderboard');
      return;
    }

    const syncData = {
      userId,
      xp: userData.xp || 0,
      level: userData.level || 1,
      streak: userData.streak || 0,
      username: userData.username || 'Anonymous',
      avatar: userData.avatar || null,
      lastActivity: userData.lastActivity || null,
      timestamp: Date.now()
    };

    // Vérifier si cette synchronisation est déjà dans la file
    const existingIndex = this.syncQueue.findIndex(item => 
      item.userId === userId && item.timestamp === syncData.timestamp
    );

    if (existingIndex === -1) {
      // Ajouter à la file
      this.syncQueue.push(syncData);
      
      // Limiter la taille de la file
      if (this.syncQueue.length > this.MAX_QUEUE_SIZE) {
        this.syncQueue = this.syncQueue.slice(-this.MAX_QUEUE_SIZE);
      }

      console.log(`📝 Synchronisation leaderboard mise en file: ${userData.username} (XP: ${userData.xp})`);
    }

    // Démarrer le traitement si pas déjà en cours
    this.processQueue();
  }

  // Traiter la file d'attente
  async processQueue() {
    if (this.isProcessing || this.syncQueue.length === 0) {
      return;
    }

    // Vérifier le cooldown
    const now = Date.now();
    if (this.lastSyncTime && (now - this.lastSyncTime) < this.SYNC_COOLDOWN) {
      setTimeout(() => this.processQueue(), this.SYNC_COOLDOWN);
      return;
    }

    this.isProcessing = true;

    try {
      // Prendre le premier élément de la file
      const syncData = this.syncQueue.shift();
      if (!syncData) {
        this.isProcessing = false;
        return;
      }

      await this.syncToLeaderboard(syncData);
      this.lastSyncTime = now;

      console.log(`✅ Synchronisation leaderboard réussie: ${syncData.username} (Position: ${syncData.rank || 'N/A'})`);

      // Continuer avec le prochain élément
      setTimeout(() => this.processQueue(), 100);

    } catch (error) {
      console.error('❌ Erreur synchronisation leaderboard:', error);
      
      // Remettre l'élément en file en cas d'erreur
      this.syncQueue.unshift(syncData);
      
      // Réessayer après un délai
      setTimeout(() => this.processQueue(), 2000);
    } finally {
      this.isProcessing = false;
    }
  }

  // Synchroniser les données dans la collection leaderboard
  async syncToLeaderboard(syncData) {
    const { userId, xp, level, streak, username, avatar, lastActivity } = syncData;

    // Référence au document dans la collection leaderboard
    const leaderboardRef = doc(db, 'leaderboard', userId);

    // Calculer le rang (approximatif basé sur les données locales)
    const rankData = await this.calculateRank(userId, xp);

    const leaderboardData = {
      userId,
      username,
      avatar,
      xp,
      level,
      streak,
      lastActivity,
      rank: rankData.rank,
      rankChange: rankData.rankChange,
      totalUsers: rankData.totalUsers,
      updatedAt: serverTimestamp(),
      lastSync: Date.now()
    };

    // Utiliser setDoc pour créer/mettre à jour
    await setDoc(leaderboardRef, leaderboardData, { merge: true });

    return leaderboardData;
  }

  // Calculer le rang de l'utilisateur
  async calculateRank(userId, userXP) {
    try {
      // Cette fonction est optimisée pour éviter des lectures excessives
      // En production, vous pourriez utiliser une fonction cloud ou un index composite
      
      // Pour l'instant, nous utilisons une estimation basée sur les XP
      const estimatedRank = Math.max(1, Math.floor(1000 / (userXP / 100 + 1)));
      
      return {
        rank: estimatedRank,
        rankChange: 0, // À implémenter avec tracking local
        totalUsers: estimatedRank + 50 // Estimation
      };
    } catch (error) {
      console.error('Erreur calcul rang:', error);
      return {
        rank: null,
        rankChange: 0,
        totalUsers: 0
      };
    }
  }

  // Forcer la synchronisation immédiate
  async forceSync(userId, userData) {
    console.log('⚡ Synchronisation forcée du leaderboard');
    
    // Vider la file et ajouter la synchronisation forcée
    this.syncQueue = [];
    this.lastSyncTime = 0;
    
    return this.queueSync(userId, userData);
  }

  // Nettoyer la file d'attente
  clearQueue() {
    this.syncQueue = [];
    console.log('🗑️ File d\'attente synchronisation vidée');
  }

  // Obtenir le statut de la synchronisation
  getStatus() {
    return {
      queueLength: this.syncQueue.length,
      isProcessing: this.isProcessing,
      lastSyncTime: this.lastSyncTime,
      canSync: !this.isProcessing && this.syncQueue.length > 0
    };
  }
}

// Instance singleton du service
const leaderboardSyncService = new LeaderboardSyncService();

export default leaderboardSyncService;
