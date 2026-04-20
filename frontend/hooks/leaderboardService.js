import { useState, useEffect, useCallback } from 'react';
import { collection, query, orderBy, limit, getDocs, where, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebaseClean';

const useLeaderboard = (userId, currentUsername) => {
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [realtimeEnabled, setRealtimeEnabled] = useState(false);

  // Récupérer les données du leaderboard (une fois)
  const fetchLeaderboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Requête optimisée avec limit et orderBy
      const leaderboardQuery = query(
        collection(db, 'users'),
        where('xp', '>', 0), // Exclure les utilisateurs avec 0 XP
        orderBy('xp', 'desc'),
        limit(10)
      );

      const querySnapshot = await getDocs(leaderboardQuery);
      const leaderboard = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        leaderboard.push({
          id: doc.id,
          username: data.username || 'Anonymous',
          avatar: data.avatar || null,
          xp: data.xp || 0,
          level: data.level || 1,
          streak: data.streak || 0,
          lastActivity: data.lastActivity,
          isCurrentUser: doc.id === userId
        });
      });

      setLeaderboardData(leaderboard);
      console.log(`📊 Leaderboard chargé: ${leaderboard.length} utilisateurs`);
    } catch (error) {
      console.error('❌ Erreur chargement leaderboard:', error);
      setError('Impossible de charger le classement');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  // Activer l'écoute en temps réel
  const enableRealtime = useCallback(() => {
    if (realtimeEnabled) return;

    try {
      setRealtimeEnabled(true);
      
      const leaderboardQuery = query(
        collection(db, 'users'),
        where('xp', '>', 0),
        orderBy('xp', 'desc'),
        limit(10)
      );

      const unsubscribe = onSnapshot(leaderboardQuery, (querySnapshot) => {
        const leaderboard = [];

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          leaderboard.push({
            id: doc.id,
            username: data.username || 'Anonymous',
            avatar: data.avatar || null,
            xp: data.xp || 0,
            level: data.level || 1,
            streak: data.streak || 0,
            lastActivity: data.lastActivity,
            isCurrentUser: doc.id === userId
          });
        });

        setLeaderboardData(leaderboard);
        console.log('🔄 Leaderboard mis à jour en temps réel');
      }, (error) => {
        console.error('❌ Erreur écoute temps réel leaderboard:', error);
        setError('Erreur de synchronisation du classement');
      });

      return unsubscribe;
    } catch (error) {
      console.error('❌ Erreur activation temps réel:', error);
      setError('Impossible d\'activer la synchronisation');
    }
  }, [userId, realtimeEnabled]);

  // Désactiver l'écoute en temps réel
  const disableRealtime = useCallback(() => {
    setRealtimeEnabled(false);
    // Le unsubscribe sera géré par le useEffect
  }, []);

  // Rafraîchir le leaderboard
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchLeaderboard();
  }, [fetchLeaderboard]);

  // Obtenir la position de l'utilisateur actuel
  const getCurrentUserRank = useCallback(() => {
    const currentUserIndex = leaderboardData.findIndex(user => user.isCurrentUser);
    return currentUserIndex >= 0 ? currentUserIndex + 1 : null;
  }, [leaderboardData]);

  // Obtenir les utilisateurs autour de l'utilisateur actuel
  const getNearbyUsers = useCallback((range = 2) => {
    const currentUserIndex = leaderboardData.findIndex(user => user.isCurrentUser);
    if (currentUserIndex < 0) return [];

    const start = Math.max(0, currentUserIndex - range);
    const end = Math.min(leaderboardData.length, currentUserIndex + range + 1);
    
    return leaderboardData.slice(start, end);
  }, [leaderboardData]);

  // Filtrer par niveau minimum
  const filterByMinLevel = useCallback((minLevel) => {
    return leaderboardData.filter(user => user.level >= minLevel);
  }, [leaderboardData]);

  // Filtrer par streak minimum
  const filterByMinStreak = useCallback((minStreak) => {
    return leaderboardData.filter(user => user.streak >= minStreak);
  }, [leaderboardData]);

  // Calculer les statistiques du leaderboard
  const getLeaderboardStats = useCallback(() => {
    if (leaderboardData.length === 0) return null;

    const totalXP = leaderboardData.reduce((sum, user) => sum + user.xp, 0);
    const avgXP = Math.round(totalXP / leaderboardData.length);
    const maxXP = leaderboardData[0]?.xp || 0;
    const minXP = leaderboardData[leaderboardData.length - 1]?.xp || 0;
    
    const levelDistribution = {};
    leaderboardData.forEach(user => {
      const level = user.level;
      levelDistribution[level] = (levelDistribution[level] || 0) + 1;
    });

    const streakDistribution = {};
    leaderboardData.forEach(user => {
      const streak = user.streak;
      if (streak > 0) {
        const streakRange = streak <= 3 ? '1-3' : streak <= 7 ? '4-7' : streak <= 14 ? '8-14' : '15+';
        streakDistribution[streakRange] = (streakDistribution[streakRange] || 0) + 1;
      }
    });

    return {
      totalUsers: leaderboardData.length,
      totalXP,
      avgXP,
      maxXP,
      minXP,
      levelDistribution,
      streakDistribution,
      currentUserRank: getCurrentUserRank(),
      top10XP: leaderboardData.slice(0, 10).map(u => u.xp)
    };
  }, [leaderboardData, getCurrentUserRank]);

  // Charger les données au montage
  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  // Nettoyer l'écoute temps réel au démontage
  useEffect(() => {
    return () => {
      if (realtimeEnabled) {
        console.log('🗑️ Nettoyage de l\'écoute temps réel leaderboard');
      }
    };
  }, [realtimeEnabled]);

  return {
    // Données principales
    leaderboardData,
    loading,
    error,
    refreshing,
    realtimeEnabled,
    
    // Actions
    fetchLeaderboard,
    handleRefresh,
    enableRealtime,
    disableRealtime,
    
    // Utilitaires
    getCurrentUserRank,
    getNearbyUsers,
    filterByMinLevel,
    filterByMinStreak,
    getLeaderboardStats
  };
};

export default useLeaderboard;
