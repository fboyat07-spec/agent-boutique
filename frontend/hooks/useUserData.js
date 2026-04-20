import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '../config/firebaseClean';
import { checkAndUnlockBadges } from './badgeService';
import useLeaderboardSync from './useLeaderboardSync';
import useFeedback from './useFeedback';
import useAnalytics from './useAnalytics';
import useABTest from './useABTest';
import { getXPMultiplier } from './abTestExperiments';

const useUserData = (userId) => {
  const [userData, setUserData] = useState({
    xp: 0,
    level: 1,
    streak: 0,
    lastActivity: null,
    loading: true,
    error: null,
    badges: [],
    missions: {
      daily: [],
      lastReset: null
    },
    subscription: {
      planId: 'free',
      status: 'active',
      startDate: null,
      endDate: null,
      autoRenew: false
    }
  });

  // Refs pour éviter les re-renders
  const previousUserDataRef = useRef();
  const unsubscribeRef = useRef(null);
  const isInitializedRef = useRef(false);

  // Intégrer la synchronisation leaderboard - optimisée avec useMemo
  const leaderboardData = useMemo(() => ({
    userId,
    xp: userData.xp,
    level: userData.level,
    username: userData.username,
    avatar: userData.avatar
  }), [userId, userData.xp, userData.level, userData.username, userData.avatar]);

  const { syncLeaderboard } = useLeaderboardSync(userId, leaderboardData);

  // Intégrer le service de feedback - optimisé
  const { xpGainFeedback } = useFeedback();

  // Intégrer le service analytics - optimisé
  const { trackXPGain, trackLevelUp, trackMissionComplete } = useAnalytics(userId);

  // Intégrer le service A/B Testing - optimisé
  const { assignVariant, getFeatureVariant, isTestGroup } = useABTest(userId);

  const [progressPercentage, setProgressPercentage] = useState(0);

  // Initialiser les données utilisateur
  useEffect(() => {
    if (userId) {
      initializeDailyMissions();
      
      // Assigner les variantes A/B Testing
      assignVariant('xp_boost');
      assignVariant('mission_rewards');
      assignVariant('shop_discounts');
    }
  }, [userId, initializeDailyMissions, assignVariant]);

  // Optimisation: Calculs XP mémorisés
  const xpCalculations = useMemo(() => {
    const currentXP = userData.xp || 0;
    const currentLevel = userData.level || 1;
    
    const xpForNextLevel = calculateXPForNextLevel(currentLevel);
    const xpForCurrentLevel = calculateXPForCurrentLevel(currentLevel);
    
    const percentage = xpForCurrentLevel > 0 ? 
      ((currentXP - xpForCurrentLevel) / (xpForNextLevel - xpForCurrentLevel)) * 100 : 0;

    return {
      xpForNextLevel,
      xpForCurrentLevel,
      percentage
    };
  }, [userData.xp, userData.level]);

  // Écouter les changements en temps réel - optimisé
  useEffect(() => {
    if (!userId) {
      setUserData(prev => ({ ...prev, loading: false, error: 'User not logged in' }));
      return;
    }

    // Nettoyer l'écoute précédente
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }

    const userDocRef = doc(db, 'users', userId);
    
    unsubscribeRef.current = onSnapshot(userDocRef, (docSnapshot) => {
      if (!docSnapshot.exists()) {
        setUserData(prev => ({ 
          ...prev, 
          loading: false, 
          error: 'User document not found' 
        }));
        return;
      }

      const data = docSnapshot.data();
      const currentXP = data.xp || 0;
      const currentLevel = data.level || 1;
      
      // Optimisation: Vérifier si les données ont vraiment changé
      const hasDataChanged = !previousUserDataRef.current || 
        previousUserDataRef.current.xp !== currentXP ||
        previousUserDataRef.current.level !== currentLevel ||
        JSON.stringify(previousUserDataRef.current.missions) !== JSON.stringify(data.missions) ||
        JSON.stringify(previousUserDataRef.current.badges) !== JSON.stringify(data.badges);

      if (!hasDataChanged) {
        return; // Pas de re-render si pas de changement
      }

      // Calculer le pourcentage de progression (utilise le memo)
      const percentage = xpCalculations.percentage;

      // Vérifier et générer les missions quotidiennes
      const missions = data.missions || {
        daily: [],
        lastReset: null
      };

      // Vérifier et débloquer les nouveaux badges
      const { allBadges } = checkAndUnlockBadges({
        xp: currentXP,
        level: currentLevel,
        streak: data.streak || 0,
        badges: data.badges || [],
        missions: missions
      });

      // Obtenir les données d'abonnement
      const subscription = data.subscription || {
        planId: 'free',
        status: 'active',
        startDate: null,
        endDate: null,
        autoRenew: false
      };

      const newUserData = {
        xp: currentXP,
        level: currentLevel,
        streak: data.streak || 0,
        lastActivity: data.lastActivity || null,
        loading: false,
        error: null,
        badges: allBadges,
        missions: missions,
        subscription: subscription,
        username: data.username,
        avatar: data.avatar
      };

      previousUserDataRef.current = newUserData;
      setUserData(newUserData);
      setProgressPercentage(percentage);
    }, (error) => {
      console.error('Erreur écoute données utilisateur:', error);
      setUserData(prev => ({ 
        ...prev, 
        loading: false, 
        error: error.message 
      }));
    });

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [userId, xpCalculations.percentage]);

  // Fonctions utilitaires
  const calculateXPForNextLevel = useCallback((level) => {
    switch (level) {
      case 1: return 100;
      case 2: return 300;
      case 3: return 600;
      case 4: return 1200;
      default: return 100;
    }
  }, []);

  const calculateXPForCurrentLevel = useCallback((level) => {
    switch (level) {
      case 1: return 0;
      case 2: return 100;
      case 3: return 300;
      case 4: return 600;
      default: return 0;
    }
  }, []);

  // Mettre à jour les données utilisateur
  const updateUserData = useCallback(async (updates) => {
    if (!userId) {
      return { success: false, error: 'User not logged in' };
    }

    try {
      const userDocRef = doc(db, 'users', userId);
      await updateDoc(userDocRef, {
        ...updates,
        updatedAt: new Date()
      });

      // Mettre à jour l'état local
      const updatedData = { ...userData, ...updates };
      setUserData(updatedData);
      
      // Tracking du gain d'XP avec A/B Testing
      if (updates.xp && updates.xp > userData.xp) {
        const xpGained = updates.xp - userData.xp;
        
        // Appliquer le multiplicateur XP selon la variante A/B
        const xpBoostVariant = getFeatureVariant('xp_boost');
        const xpMultiplier = getXPMultiplier(xpBoostVariant);
        const finalXPGained = Math.round(xpGained * xpMultiplier);
        
        // Mettre à jour avec le XP boosté
        updates.xp = userData.xp + finalXPGained;
        
        trackXPGain(finalXPGained, 'user_update', userData.level);
        
        console.log(`🧪 XP Boost: ${xpGained} → ${finalXPGained} (x${xpMultiplier}, variante: ${xpBoostVariant})`);
      }
      
      // Vérifier et débloquer les nouveaux badges après mise à jour
      const { allBadges } = checkAndUnlockBadges(updatedData);
      
      // Mettre à jour les badges dans Firestore si de nouveaux badges
      if (allBadges.length > userData.badges.length) {
        await updateDoc(userDocRef, {
          badges: allBadges,
          updatedAt: new Date()
        });
        
        setUserData(prev => ({ ...prev, badges: allBadges }));
      }
      
      // Synchroniser automatiquement avec le leaderboard
      syncLeaderboard(updatedData);
      
      return { success: true };
    } catch (error) {
      console.error('Error updating user data:', error);
      return { success: false, error: error.message };
    }
  }, [userId, userData, syncLeaderboard, trackXPGain]);

  // Ajouter un badge à l'utilisateur
  const addBadge = useCallback(async (badgeId) => {
    if (!userId) {
      return { success: false, error: 'User not logged in' };
    }

    useEffect(() => {
      if (loading || !userData) return;

      const currentLevel = userData.level || 1;
      const previousLevel = levelUpModal.newLevel || 1;
      
      if (currentLevel > previousLevel) {
        // Feedback audio et haptique pour level up
        xpGainFeedback({
          amount: userData.xp || 0,
          source: 'level_up',
          levelUp: true
        });

        // Tracking analytics du level up
        trackLevelUp(currentLevel, previousLevel, userData.xp || 0);

        // Animation du texte de niveau
        Animated.sequence([
          Animated.timing(levelTextAnim, {
            toValue: 1.2,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(levelTextAnim, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          })
        ]).start();

        // Afficher la modale de level up
        setLevelUpModal({
          visible: true,
          newLevel: currentLevel,
          oldLevel: previousLevel
        });
      }
    }, [userData.level, loading, levelTextAnim, xpGainFeedback, trackLevelUp]);

    try {
      const userDocRef = doc(db, 'users', userId);
      const currentBadges = userData.badges || [];
      
      if (!currentBadges.includes(badgeId)) {
        const updatedBadges = [...currentBadges, badgeId];
        
        await updateDoc(userDocRef, {
          badges: updatedBadges,
          updatedAt: new Date()
        });

        setUserData(prev => ({ ...prev, badges: updatedBadges }));
        
        // Tracking analytics du déblocage de badge
        const badgeInfo = getBadgeInfo ? getBadgeInfo(badgeId) : { name: 'Badge Inconnu', rarity: 'common' };
        trackBadgeUnlock(badgeId, badgeInfo.name, badgeInfo.rarity);
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error adding badge:', error);
      return { success: false, error: error.message };
    }
  }, [userId, userData, trackBadgeUnlock]);

  // Compléter une mission quotidienne
  const completeDailyMission = useCallback(async (missionId) => {
    if (!userId) {
    }

    try {
      const userDocRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        const data = userDoc.data();
        const missions = data.missions || {
          daily: [],
          lastReset: null
        };

        // Vérifier si les missions doivent être réinitialisées
        const lastReset = missions.lastReset;
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        if (!lastReset || today > new Date(lastReset)) {
          // Générer de nouvelles missions
          const newDailyMissions = generateDailyMissions();
          
          await updateDoc(userDocRef, {
            missions: {
              daily: newDailyMissions,
              lastReset: now
            },
            updatedAt: now
          });

          setUserData(prev => ({
            ...prev,
            missions: {
              daily: newDailyMissions,
              lastReset: now
            }
          }));
          
          console.log('🔄 Missions quotidiennes initialisées');
        }
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error initializing missions:', error);
      return { success: false, error: error.message };
    }
  }, [userId]);

  // Générer les missions quotidiennes
  const generateDailyMissions = useCallback(() => {
    const missions = [
      {
        id: 'daily_answer_questions',
        title: 'Répondre à 3 questions',
        description: 'Pose 3 questions à l\'IA et obtiens des réponses',
        xpReward: 30,
        completed: false,
        type: 'interaction',
        target: 3,
        current: 0
      },
      {
        id: 'daily_gain_xp',
        title: 'Gagner 50 XP',
        description: 'Accumule 50 XP aujourd\'ui par tes activités',
        xpReward: 50,
        completed: false,
        type: 'progression',
        target: 50,
        current: 0
      },
      {
        id: 'daily_return_streak',
        title: 'Revenir 2 jours de suite',
        description: 'Maintiens ton streak pendant 2 jours consécutifs',
        xpReward: 25,
        completed: false,
        type: 'streak',
        target: 2,
        current: 0
      }
    ];

    return missions;
  }, []);

  // Vérifier si les missions doivent être réinitialisées
  const shouldResetMissions = useCallback(() => {
    if (!userData.missions?.lastReset) {
      return true; // Première fois, pas de lastReset
    }

    const lastReset = new Date(userData.missions.lastReset);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Vérifier si c'est un nouveau jour (après minuit)
    const isNewDay = today > lastReset;
    
    return isNewDay;
  }, [userData.missions]);

  // Réinitialiser les missions si nécessaire
  const checkAndResetMissions = useCallback(async () => {
    if (shouldResetMissions()) {
      console.log('🔄 Réinitialisation des missions quotidiennes');
      return await resetDailyMissions();
    }
    return { success: true, needsReset: false };
  }, [shouldResetMissions, resetDailyMissions]);

  // Obtenir le nom du niveau
  const getLevelName = useCallback((level) => {
    const levelNames = {
      1: 'Débutant',
      2: 'Apprenti',
      3: 'Intermédiaire',
      4: 'Avancé',
      5: 'Expert'
    };
    return levelNames[level] || 'Débutant';
  }, []);

  // Calculer les statistiques avancées
  const getUserStats = useCallback(() => {
    const { xp, level, streak, badges, missions } = userData;
    
    return {
      xp,
      level,
      levelName: getLevelName(level),
      streak,
      progressPercentage,
      xpForNextLevel: calculateXPForNextLevel(level),
      xpToNextLevel: calculateXPForNextLevel(level) - xp,
      lastActivityFormatted: userData.lastActivity ? 
        new Date(userData.lastActivity.toDate()).toLocaleDateString('fr-FR') : null,
      badges: badges || [],
      missions: missions || {
        daily: [],
        lastReset: null
      },
      completedMissionsCount: missions?.daily?.filter(m => m.completed).length || 0,
      totalMissionsCount: missions?.daily?.length || 0,
      missionsProgress: missions?.daily ? 
        Math.round((missions.daily.filter(m => m.completed).length / missions.daily.length) * 100) : 0
    };
  }, [userData, progressPercentage]);

  // Calculer les badges
  const calculateBadges = useCallback((xp, level, streak) => {
    const badges = [];
    
    // Badge de streak
    if (streak >= 3) badges.push('first_xp');
    if (streak >= 7) badges.push('streak_7');
    if (streak >= 14) badges.push('streak_14');
    if (streak >= 30) badges.push('streak_30');
    
    // Badge de niveau
    if (level >= 2) badges.push('level_2');
    if (level >= 3) badges.push('level_3');
    if (level >= 4) badges.push('level_4');
    if (level >= 5) badges.push('level_5');
    
    // Badge d'XP
    if (xp >= 100) badges.push('first_xp');
    if (xp >= 250) badges.push('xp_250');
    if (xp >= 500) badges.push('xp_500');
    if (xp >= 1000) badges.push('xp_1000');
    if (xp >= 2500) badges.push('xp_2500');
    if (xp >= 5000) badges.push('xp_5000');
    
    return badges;
  }, []);

  // Calculer les succès
  const calculateAchievements = useCallback((xp, level, streak) => {
    const achievements = [];
    
    // Succès d'XP
    if (xp >= 100) achievements.push({ id: 'first_100', name: '🎯 100 XP atteints', unlocked: true });
    if (xp >= 500) achievements.push({ id: 'xp_master', name: '🏆 Maître de l\'XP', unlocked: xp >= 1000 });
    
    // Succès de streak
    if (streak >= 3) achievements.push({ id: 'streak_3', name: '📅 3 jours d\'affilé', unlocked: true });
    if (streak >= 7) achievements.push({ id: 'streak_7', name: '🔥 Une semaine !', unlocked: true });
    if (streak >= 30) achievements.push({ id: 'streak_30', name: '🌟 Un mois complet !', unlocked: true });
    
    // Succès de niveau
    if (level >= 2) achievements.push({ id: 'level_2', name: '🎓 Niveau Apprenti', unlocked: true });
    if (level >= 3) achievements.push({ id: 'level_3', name: '🎓 Niveau Intermédiaire', unlocked: true });
    if (level >= 4) achievements.push({ id: 'level_4', name: '🏆 Niveau Avancé', unlocked: true });
    
    return achievements;
  }, []);

  return {
    userData,
    progressPercentage,
    loading: userData.loading,
    error: userData.error,
    
    // Fonctions de mise à jour
    updateUserData,
    addBadge,
    completeDailyMission,
    resetDailyMissions,
    initializeDailyMissions,
    
    // Fonctions utilitaires
    generateDailyMissions,
    shouldResetMissions,
    checkAndResetMissions,
    getUserStats,
    getLevelName,
    calculateXPForNextLevel,
    calculateXPForCurrentLevel,
    
    // Accès direct aux services
    checkAndUnlockBadges,
    
    // Synchronisation leaderboard
    syncLeaderboard,
    
    // Abonnement
    subscription: userData.subscription,
    isPremium: userData.subscription?.planId !== 'free'
  };
};

export default useUserData;
