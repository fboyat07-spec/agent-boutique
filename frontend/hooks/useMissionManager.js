import { useState, useCallback } from 'react';
import useFirebaseFunctions from './useFirebaseFunctions';
import useXPManager from './useXPManager';
import useAnalytics from './useAnalytics';

// Hook spécialisé pour la gestion des missions via Firebase Functions
const useMissionManager = (userId) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastMissionCompleted, setLastMissionCompleted] = useState(null);

  const {
    callCompleteMission,
    callGetAvailableMissions
  } = useFirebaseFunctions();

  const { addMissionXP } = useXPManager(userId);
  const { trackMissionComplete } = useAnalytics(userId);

  // Compléter une mission avec gestion complète
  const completeMission = useCallback(async (missionId, completionData = {}) => {
    if (!userId) {
      const errorMsg = 'Utilisateur non connecté';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }

    if (!missionId) {
      const errorMsg = 'L\'ID de mission est requis';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }

    try {
      setLoading(true);
      setError(null);

      console.log(`🎯 Tentative de complétion mission: ${missionId}`, completionData);

      // Appeler la fonction Firebase
      const result = await callCompleteMission(missionId, completionData);

      if (result.success) {
        const { 
          missionId: completedMissionId,
          missionTitle, 
          missionType, 
          xpRewarded, 
          newXP, 
          newLevel, 
          progress, 
          leveledUp, 
          levelsGained, 
          streak,
          bonusXP,
          completionData: resultCompletionData
        } = result.data;

        // Mettre à jour la dernière mission complétée
        setLastMissionCompleted({
          timestamp: new Date(),
          missionId: completedMissionId,
          missionTitle,
          missionType,
          xpRewarded,
          leveledUp,
          levelsGained,
          streak,
          completionTime: completionData.completionTime || 0
        });

        // Analytics
        trackMissionComplete(completedMissionId, missionTitle, xpRewarded, completionData);

        console.log(`✅ Mission complétée avec succès:`, {
          missionId: completedMissionId,
          missionTitle,
          xpRewarded,
          newLevel,
          leveledUp,
          streak
        });

        return {
          success: true,
          data: result.data
        };

      } else {
        throw new Error(result.error);
      }

    } catch (error) {
      console.error('❌ Erreur complétion mission:', error);
      setError(error.message);
      return {
        success: false,
        error: error.message
      };

    } finally {
      setLoading(false);
    }
  }, [userId, callCompleteMission, trackMissionComplete]);

  // Compléter une mission avec vérification préalable
  const completeMissionWithValidation = useCallback(async (mission, completionData = {}) => {
    // Validation locale avant l'appel
    if (!mission || !mission.id) {
      const errorMsg = 'Mission invalide';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }

    // Vérifier les prérequis
    if (mission.requirements) {
      const { level: requiredLevel, xp: requiredXP } = mission.requirements;
      
      // Ces vérifications seront aussi faites côté serveur, mais permettent un feedback rapide
      if (requiredLevel && requiredLevel > (userData?.level || 1)) {
        const errorMsg = `Niveau requis: ${requiredLevel}`;
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }
    }

    return await completeMission(mission.id, completionData);
  }, [completeMission, userData]);

  // Obtenir les missions disponibles
  const getAvailableMissions = useCallback(async (filters = {}) => {
    if (!userId) {
      const errorMsg = 'Utilisateur non connecté';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }

    try {
      setLoading(true);
      setError(null);

      const result = await callGetAvailableMissions(filters);

      if (result.success) {
        console.log(`📋 Missions disponibles:`, {
          total: result.data.total,
          filters
        });

        return result;
      } else {
        throw new Error(result.error);
      }

    } catch (error) {
      console.error('❌ Erreur récupération missions:', error);
      setError(error.message);
      return {
        success: false,
        error: error.message
      };

    } finally {
      setLoading(false);
    }
  }, [userId, callGetAvailableMissions]);

  // Obtenir les missions quotidiennes
  const getDailyMissions = useCallback(async () => {
    return await getAvailableMissions({ type: 'daily' });
  }, [getAvailableMissions]);

  // Obtenir les missions hebdomadaires
  const getWeeklyMissions = useCallback(async () => {
    return await getAvailableMissions({ type: 'weekly' });
  }, [getAvailableMissions]);

  // Obtenir les missions tutoriel
  const getTutorialMissions = useCallback(async () => {
    return await getAvailableMissions({ type: 'tutorial' });
  }, [getAvailableMissions]);

  // Obtenir les missions défi
  const getChallengeMissions = useCallback(async () => {
    return await getAvailableMissions({ type: 'challenge' });
  }, [getAvailableMissions]);

  // Obtenir les missions par difficulté
  const getMissionsByDifficulty = useCallback(async (difficulty) => {
    return await getAvailableMissions({ difficulty });
  }, [getAvailableMissions]);

  // Commencer une mission (tracking)
  const startMission = useCallback(async (missionId, missionData = {}) => {
    if (!userId) {
      const errorMsg = 'Utilisateur non connecté';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }

    try {
      console.log(`🚀 Début mission: ${missionId}`, missionData);

      // Analytics tracking du début de mission
      await trackMissionComplete(missionId, missionData.title || 'Mission', 0, {
        ...missionData,
        action: 'start'
      });

      return {
        success: true,
        data: {
          missionId,
          startTime: new Date(),
          missionData
        }
      };

    } catch (error) {
      console.error('❌ Erreur début mission:', error);
      setError(error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }, [userId, trackMissionComplete]);

  // Abandonner une mission
  const abandonMission = useCallback(async (missionId, reason = '') => {
    if (!userId) {
      const errorMsg = 'Utilisateur non connecté';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }

    try {
      console.log(`🚪 Abandon mission: ${missionId}`, { reason });

      // Analytics tracking de l'abandon
      await trackMissionComplete(missionId, 'Mission abandonnée', 0, {
        action: 'abandon',
        reason,
        timestamp: new Date()
      });

      return {
        success: true,
        data: {
          missionId,
          abandonedAt: new Date(),
          reason
        }
      };

    } catch (error) {
      console.error('❌ Erreur abandon mission:', error);
      setError(error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }, [userId, trackMissionComplete]);

  // Calculer les statistiques de missions
  const getMissionStats = useCallback(() => {
    if (!lastMissionCompleted) {
      return null;
    }

    const now = new Date();
    const lastCompletion = lastMissionCompleted.timestamp;
    const hoursSinceLastCompletion = (now - lastCompletion) / (1000 * 60 * 60);

    return {
      lastMission: lastMissionCompleted,
      hoursSinceLastCompletion,
      isRecent: hoursSinceLastCompletion < 24,
      averageXPPerMission: lastMissionCompleted.xpRewarded,
      currentStreak: lastMissionCompleted.streak
    };
  }, [lastMissionCompleted]);

  // Obtenir les recommandations de missions
  const getMissionRecommendations = useCallback(async () => {
    try {
      // Obtenir les missions disponibles
      const missionsResult = await getAvailableMissions();
      
      if (!missionsResult.success) {
        return { missions: [], total: 0 };
      }

      const { missions } = missionsResult.data;

      // Filtrer et recommander les missions
      const recommendations = missions
        .filter(mission => {
          // Exclure les missions déjà complétées (si on avait cette info)
          return mission.canComplete !== false;
        })
        .sort((a, b) => {
          // Prioriser par XP récompense
          return b.xpReward - a.xpReward;
        })
        .slice(0, 5); // Top 5 recommandations

      return {
        missions: recommendations,
        total: recommendations.length
      };

    } catch (error) {
      console.error('❌ Erreur recommandations missions:', error);
      return { missions: [], total: 0 };
    }
  }, [getAvailableMissions]);

  // Réinitialiser l'erreur
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Réinitialiser la dernière mission
  const clearLastMission = useCallback(() => {
    setLastMissionCompleted(null);
  }, []);

  return {
    // État
    loading,
    error,
    lastMissionCompleted,

    // Fonctions principales
    completeMission,
    getAvailableMissions,

    // Fonctions spécialisées
    completeMissionWithValidation,
    getDailyMissions,
    getWeeklyMissions,
    getTutorialMissions,
    getChallengeMissions,
    getMissionsByDifficulty,

    // Gestion de mission
    startMission,
    abandonMission,

    // Utilitaires
    getMissionStats,
    getMissionRecommendations,
    clearError,
    clearLastMission
  };
};

export default useMissionManager;
