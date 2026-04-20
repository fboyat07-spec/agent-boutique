import { useState, useCallback } from 'react';
import useFirebaseFunctions from './useFirebaseFunctions';
import useFeedback from './useFeedback';
import useAnalytics from './useAnalytics';

// Hook spécialisé pour la gestion de l'XP via Firebase Functions
const useXPManager = (userId) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastXPUpdate, setLastXPUpdate] = useState(null);

  const {
    callAddXp,
    callGetUserProgress
  } = useFirebaseFunctions();

  const { xpGainFeedback } = useFeedback();
  const { trackXPGain, trackLevelUp } = useAnalytics(userId);

  // Ajouter de l'XP avec gestion complète
  const addXP = useCallback(async (amount, source = 'manual', metadata = {}) => {
    if (!userId) {
      const errorMsg = 'Utilisateur non connecté';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }

    if (!amount || amount <= 0) {
      const errorMsg = 'Le montant d\'XP doit être positif';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }

    try {
      setLoading(true);
      setError(null);

      console.log(`🚀 Ajout de ${amount} XP (source: ${source})`, metadata);

      // Appeler la fonction Firebase
      const result = await callAddXp(amount, source, metadata);

      if (result.success) {
        const { 
          previousXP, 
          newXP, 
          level, 
          progress, 
          leveledUp, 
          levelsGained, 
          streak, 
          bonusXP 
        } = result.data;

        // Mettre à jour le dernier update
        setLastXPUpdate({
          timestamp: new Date(),
          amount,
          source,
          previousXP,
          newXP,
          leveledUp,
          levelsGained
        });

        // Feedback utilisateur
        xpGainFeedback(amount, leveledUp, levelsGained, bonusXP);

        // Analytics
        trackXPGain(amount, source, metadata);
        
        if (leveledUp) {
          trackLevelUp(level, levelsGained);
        }

        console.log(`✅ XP ajouté avec succès:`, {
          amount,
          source,
          previousXP,
          newXP,
          level,
          leveledUp,
          levelsGained,
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
      console.error('❌ Erreur ajout XP:', error);
      setError(error.message);
      return {
        success: false,
        error: error.message
      };

    } finally {
      setLoading(false);
    }
  }, [userId, callAddXp, xpGainFeedback, trackXPGain, trackLevelUp]);

  // Ajouter de l'XP pour une mission
  const addMissionXP = useCallback(async (missionData, completionData = {}) => {
    const { id, title, type, difficulty, baseReward } = missionData;
    
    const metadata = {
      missionId: id,
      missionTitle: title,
      missionType: type,
      difficulty,
      completionTime: completionData.completionTime || 0,
      completionData
    };

    return await addXP(baseReward || 20, 'mission_completion', metadata);
  }, [addXP]);

  // Ajouter de l'XP pour un bonus
  const addBonusXP = useCallback(async (bonusType, amount, reason = '') => {
    const metadata = {
      bonusType,
      reason,
      isBonus: true
    };

    return await addXP(amount, 'bonus', metadata);
  }, [addXP]);

  // Ajouter de l'XP pour un streak
  const addStreakXP = useCallback(async (streakDays, baseAmount = 10) => {
    // Calculer le bonus de streak
    let streakBonus = 1;
    if (streakDays >= 30) streakBonus = 3;
    else if (streakDays >= 7) streakBonus = 2;
    else if (streakDays >= 3) streakBonus = 1.5;

    const totalAmount = Math.floor(baseAmount * streakBonus);

    const metadata = {
      streakDays,
      baseAmount,
      streakBonus,
      totalAmount
    };

    return await addXP(totalAmount, 'streak_bonus', metadata);
  }, [addXP]);

  // Ajouter de l'XP pour un level up
  const addLevelUpXP = useCallback(async (newLevel, previousLevel) => {
    const levelsGained = newLevel - previousLevel;
    const baseAmount = 50; // XP de base pour level up
    const totalAmount = baseAmount * Math.max(levelsGained, 1);

    const metadata = {
      newLevel,
      previousLevel,
      levelsGained,
      baseAmount,
      totalAmount
    };

    return await addXP(totalAmount, 'level_up', metadata);
  }, [addXP]);

  // Obtenir la progression utilisateur
  const getUserProgress = useCallback(async () => {
    if (!userId) {
      const errorMsg = 'Utilisateur non connecté';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }

    try {
      setLoading(true);
      setError(null);

      const result = await callGetUserProgress();

      if (result.success) {
        console.log('📊 Progression utilisateur:', result.data);
        return result;
      } else {
        throw new Error(result.error);
      }

    } catch (error) {
      console.error('❌ Erreur récupération progression:', error);
      setError(error.message);
      return {
        success: false,
        error: error.message
      };

    } finally {
      setLoading(false);
    }
  }, [userId, callGetUserProgress]);

  // Calculer le temps avant le prochain niveau
  const getTimeToNextLevel = useCallback(async () => {
    const progress = await getUserProgress();
    
    if (progress.success) {
      const { xp, xpForNextLevel } = progress.data;
      const xpNeeded = xpForNextLevel - xp;
      
      // Estimations basées sur différentes sources
      const estimates = {
        daily_missions: Math.ceil(xpNeeded / 70), // ~70 XP par jour avec missions
        active_learning: Math.ceil(xpNeeded / 50), // ~50 XP par jour actif
        power_user: Math.ceil(xpNeeded / 100) // ~100 XP par jour power user
      };

      return {
        xpNeeded,
        estimates,
        currentXP: xp
      };
    }
    
    return null;
  }, [getUserProgress]);

  // Calculer les statistiques XP
  const getXPStats = useCallback(() => {
    if (!lastXPUpdate) {
      return null;
    }

    const now = new Date();
    const lastUpdate = lastXPUpdate.timestamp;
    const hoursSinceLastUpdate = (now - lastUpdate) / (1000 * 60 * 60);

    return {
      lastUpdate,
      amount: lastXPUpdate.amount,
      source: lastXPUpdate.source,
      previousXP: lastXPUpdate.previousXP,
      newXP: lastXPUpdate.newXP,
      leveledUp: lastXPUpdate.leveledUp,
      levelsGained: lastXPUpdate.levelsGained,
      hoursSinceLastUpdate,
      isRecent: hoursSinceLastUpdate < 1
    };
  }, [lastXPUpdate]);

  // Réinitialiser l'erreur
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Réinitialiser le dernier update
  const clearLastUpdate = useCallback(() => {
    setLastXPUpdate(null);
  }, []);

  return {
    // État
    loading,
    error,
    lastXPUpdate,

    // Fonctions principales
    addXP,
    getUserProgress,

    // Fonctions spécialisées
    addMissionXP,
    addBonusXP,
    addStreakXP,
    addLevelUpXP,

    // Utilitaires
    getTimeToNextLevel,
    getXPStats,
    clearError,
    clearLastUpdate
  };
};

export default useXPManager;
