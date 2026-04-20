import { useState, useEffect } from 'react';
import useUserData from './useUserData';

const useMissionService = (userId) => {
  const {
    userData,
    completeDailyMission,
    generateDailyMissions,
    shouldResetMissions,
    checkAndResetMissions,
    getUserStats
  } = useUserData(userId);

  const [missionProgress, setMissionProgress] = useState({
    questionsAnswered: 0,
    xpGained: 0,
    streakDays: 0
  });

  // Vérifier et réinitialiser les missions au chargement
  useEffect(() => {
    if (userId) {
      checkAndResetMissions();
    }
  }, [userId, checkAndResetMissions]);

  // Mettre à jour la progression des missions
  const updateMissionProgress = useCallback((missionType, progress) => {
    setMissionProgress(prev => ({
      ...prev,
      [missionType]: progress
    }));
  }, []);

  // Mission : Répondre à 3 questions
  const answerQuestion = useCallback(async () => {
    const newProgress = missionProgress.questionsAnswered + 1;
    updateMissionProgress('questionsAnswered', newProgress);

    // Vérifier si la mission est complétée
    if (newProgress >= 3) {
      const result = await completeDailyMission('daily_answer_questions');
      if (result.success) {
        console.log('✅ Mission "Répondre à 3 questions" complétée !');
      }
    }
  }, [completeDailyMission, missionProgress.questionsAnswered]);

  // Mission : Gagner 50 XP
  const gainXP = useCallback((xpAmount) => {
    const newProgress = missionProgress.xpGained + xpAmount;
    updateMissionProgress('xpGained', newProgress);

    // Vérifier si la mission est complétée
    if (newProgress >= 50) {
      completeDailyMission('daily_gain_xp');
      console.log('✅ Mission "Gagner 50 XP" complétée !');
    }
  }, [completeDailyMission, missionProgress.xpGained]);

  // Mission : Revenir 2 jours de suite
  const maintainStreak = useCallback((days) => {
    const newProgress = Math.max(missionProgress.streakDays, days);
    updateMissionProgress('streakDays', newProgress);

    // Vérifier si la mission est complétée
    if (newProgress >= 2) {
      completeDailyMission('daily_return_streak');
      console.log('✅ Mission "Revenir 2 jours de suite" complétée !');
    }
  }, [completeDailyMission, missionProgress.streakDays]);

  // Réinitialiser la progression (nouveau jour)
  const resetProgress = useCallback(() => {
    setMissionProgress({
      questionsAnswered: 0,
      xpGained: 0,
      streakDays: 0
    });
  }, []);

  // Obtenir le statut des missions
  const getMissionStatus = useCallback(() => {
    const stats = getUserStats();
    const missions = stats.missions?.daily || [];

    return {
      missions,
      progress: missionProgress,
      completedCount: missions.filter(m => m.completed).length,
      totalCount: missions.length,
      completionRate: missions.length > 0 ? 
        Math.round((missions.filter(m => m.completed).length / missions.length) * 100) : 0,
      needsReset: shouldResetMissions(),
      lastReset: stats.missions?.lastReset
    };
  }, [getUserStats, missionProgress, shouldResetMissions]);

  // Calculer les récompenses totales
  const calculateTotalRewards = useCallback(() => {
    const stats = getUserStats();
    const completedMissions = stats.missions?.daily?.filter(m => m.completed) || [];
    
    const totalXPRewards = completedMissions.reduce((total, mission) => {
      return total + (mission.xpReward || 0);
    }, 0);

    return {
      totalXPRewards,
      completedMissionsCount: completedMissions.length,
      averageXPerMission: completedMissions.length > 0 ? 
        Math.round(totalXPRewards / completedMissions.length) : 0
    };
  }, [getUserStats]);

  return {
    // État des missions
    missionProgress,
    missions: getUserStats().missions?.daily || [],
    
    // Actions
    answerQuestion,
    gainXP,
    maintainStreak,
    resetProgress,
    
    // Utilitaires
    getMissionStatus,
    calculateTotalRewards,
    generateDailyMissions,
    shouldResetMissions,
    checkAndResetMissions
  };
};

export default useMissionService;
