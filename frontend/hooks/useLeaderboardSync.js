import { useEffect, useCallback, useRef } from 'react';
import leaderboardSyncService from './leaderboardSyncService';

const useLeaderboardSync = (userId, userData) => {
  const previousUserData = useRef(null);
  const syncTimeoutRef = useRef(null);

  // Synchroniser les données utilisateur dans le leaderboard
  const syncLeaderboard = useCallback((newUserData) => {
    if (!userId || !newUserData) {
      return;
    }

    // Éviter les synchronisations inutiles
    if (previousUserData.current) {
      const hasChanged = 
        newUserData.xp !== previousUserData.current.xp ||
        newUserData.level !== previousUserData.current.level ||
        newUserData.streak !== previousUserData.current.streak;

      if (!hasChanged) {
        return;
      }
    }

    // Nettoyer le timeout précédent
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    // Synchroniser avec un léger délai pour éviter les appels multiples
    syncTimeoutRef.current = setTimeout(() => {
      leaderboardSyncService.queueSync(userId, newUserData);
      previousUserData.current = newUserData;
    }, 500); // 500ms de délai

  }, [userId]);

  // Forcer la synchronisation immédiate
  const forceSyncLeaderboard = useCallback((newUserData) => {
    if (!userId || !newUserData) {
      return;
    }

    // Nettoyer le timeout précédent
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    leaderboardSyncService.forceSync(userId, newUserData);
    previousUserData.current = newUserData;
  }, [userId]);

  // Synchroniser les changements de XP
  useEffect(() => {
    if (userData && userData.xp !== undefined) {
      syncLeaderboard(userData);
    }
  }, [userData?.xp, syncLeaderboard]);

  // Synchroniser les changements de niveau
  useEffect(() => {
    if (userData && userData.level !== undefined) {
      syncLeaderboard(userData);
    }
  }, [userData?.level, syncLeaderboard]);

  // Synchroniser les changements de streak
  useEffect(() => {
    if (userData && userData.streak !== undefined) {
      syncLeaderboard(userData);
    }
  }, [userData?.streak, syncLeaderboard]);

  // Synchroniser les changements de username
  useEffect(() => {
    if (userData && userData.username !== undefined) {
      syncLeaderboard(userData);
    }
  }, [userData?.username, syncLeaderboard]);

  // Nettoyer au démontage
  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      previousUserData.current = null;
    };
  }, []);

  // Obtenir le statut de synchronisation
  const getSyncStatus = useCallback(() => {
    return leaderboardSyncService.getStatus();
  }, []);

  // Vider la file d'attente
  const clearSyncQueue = useCallback(() => {
    leaderboardSyncService.clearQueue();
  }, []);

  // Synchroniser manuellement
  const manualSync = useCallback(() => {
    if (userData) {
      forceSyncLeaderboard(userData);
    }
  }, [userData, forceSyncLeaderboard]);

  return {
    // Actions
    syncLeaderboard,
    forceSyncLeaderboard,
    manualSync,
    clearSyncQueue,
    
    // État
    syncStatus: getSyncStatus(),
    
    // Utilitaires
    getSyncStatus,
    clearSyncQueue
  };
};

export default useLeaderboardSync;
