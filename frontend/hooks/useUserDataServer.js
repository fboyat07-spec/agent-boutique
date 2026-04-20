import { useState, useEffect, useCallback, useMemo } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebaseClean';
import useFirebaseFunctions from './useFirebaseFunctions';
import useFeedback from './useFeedback';
import useAnalytics from './useAnalytics';
import useABTest from './useABTest';

const useUserDataServer = (userId) => {
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

  // Hooks Firebase Functions
  const {
    callAddXp,
    callCompleteMission,
    callCheckBadges,
    callGetUserProgress,
    callGetAvailableMissions,
    callGetUserBadges,
    loading: functionsLoading,
    error: functionsError,
    clearError
  } = useFirebaseFunctions();

  // Hooks existants
  const { xpGainFeedback } = useFeedback();
  const { trackXPGain, trackLevelUp, trackMissionComplete } = useAnalytics(userId);
  const { assignVariant, getFeatureVariant, isTestGroup } = useABTest(userId);

  const [progressPercentage, setProgressPercentage] = useState(0);

  // Calculs XP optimisés avec useMemo
  const xpCalculations = useMemo(() => {
    const currentXP = userData.xp || 0;
    const currentLevel = userData.level || 1;
    
    // Formule exponentielle pour les niveaux
    const xpForNextLevel = Math.floor(100 * Math.pow(1.5, currentLevel - 1));
    const xpForCurrentLevel = currentLevel > 1 ? Math.floor(100 * Math.pow(1.5, currentLevel - 2)) : 0;
    
    const percentage = xpForCurrentLevel > 0 ? 
      ((currentXP - xpForCurrentLevel) / (xpForNextLevel - xpForCurrentLevel)) * 100 : 0;

    return {
      xpForNextLevel,
      xpForCurrentLevel,
      percentage
    };
  }, [userData.xp, userData.level]);

  // Ajouter de l'XP via Firebase Functions
  const addXp = useCallback(async (amount, source = 'manual', metadata = {}) => {
    try {
      clearError();
      
      // Appeler la fonction Firebase
      const result = await callAddXp(amount, source, metadata);
      
      if (result.success) {
        const { newXP, newLevel, progress, leveledUp, levelsGained, streak, bonusXP } = result.data;
        
        // Mettre à jour l'état local
        setUserData(prev => ({
          ...prev,
          xp: newXP,
          level: newLevel,
          progressPercentage: progress.progressPercentage,
          streak: streak || prev.streak,
          lastActivity: new Date()
        }));
        
        setProgressPercentage(progress.progressPercentage);
        
        // Feedback utilisateur
        xpGainFeedback(amount, leveledUp, levelsGained, bonusXP);
        
        // Analytics
        trackXPGain(amount, source, metadata);
        
        if (leveledUp) {
          trackLevelUp(newLevel, levelsGained);
        }
        
        // Vérifier les badges après gain d'XP
        await checkBadges();
        
        console.log(`✅ XP ajouté avec succès: +${amount} XP`, result.data);
        return result.data;
      } else {
        throw new Error(result.error);
      }
      
    } catch (error) {
      console.error('❌ Erreur ajout XP:', error);
      setUserData(prev => ({ ...prev, error: error.message }));
      throw error;
    }
  }, [callAddXp, clearError, xpGainFeedback, trackXPGain, trackLevelUp]);

  // Compléter une mission via Firebase Functions
  const completeMission = useCallback(async (missionId, completionData = {}) => {
    try {
      clearError();
      
      // Appeler la fonction Firebase
      const result = await callCompleteMission(missionId, completionData);
      
      if (result.success) {
        const { 
          missionTitle, 
          missionType, 
          xpRewarded, 
          newXP, 
          newLevel, 
          progress, 
          leveledUp, 
          levelsGained, 
          streak,
          bonusXP 
        } = result.data;
        
        // Mettre à jour l'état local
        setUserData(prev => ({
          ...prev,
          xp: newXP,
          level: newLevel,
          progressPercentage: progress.progressPercentage,
          streak: streak || prev.streak,
          lastActivity: new Date(),
          missions: {
            ...prev.missions,
            totalCompleted: (prev.missions?.totalCompleted || 0) + 1
          }
        }));
        
        setProgressPercentage(progress.progressPercentage);
        
        // Feedback utilisateur
        xpGainFeedback(xpRewarded, leveledUp, levelsGained, bonusXP);
        
        // Analytics
        trackMissionComplete(missionId, missionTitle, xpRewarded, completionData);
        
        if (leveledUp) {
          trackLevelUp(newLevel, levelsGained);
        }
        
        // Vérifier les badges après mission
        await checkBadges();
        
        console.log(`✅ Mission complétée avec succès: ${missionTitle}`, result.data);
        return result.data;
      } else {
        throw new Error(result.error);
      }
      
    } catch (error) {
      console.error('❌ Erreur complétion mission:', error);
      setUserData(prev => ({ ...prev, error: error.message }));
      throw error;
    }
  }, [callCompleteMission, clearError, xpGainFeedback, trackMissionComplete, trackLevelUp]);

  // Vérifier les badges via Firebase Functions
  const checkBadges = useCallback(async (force = false) => {
    try {
      const result = await callCheckBadges(force);
      
      if (result.success) {
        const { badges, newBadges, message } = result.data;
        
        // Mettre à jour l'état local
        setUserData(prev => ({
          ...prev,
          badges
        }));
        
        // Afficher les nouveaux badges
        if (newBadges && newBadges.length > 0) {
          console.log(`🏆 Nouveaux badges débloqués:`, newBadges);
          
          // Feedback pour chaque nouveau badge
          newBadges.forEach(badge => {
            // Afficher une notification ou animation
            console.log(`🎉 Badge débloqué: ${badge.name}`);
          });
        }
        
        return result.data;
      }
      
    } catch (error) {
      console.error('❌ Erreur vérification badges:', error);
      // Ne pas bloquer l'expérience utilisateur pour les erreurs de badges
    }
  }, [callCheckBadges]);

  // Obtenir la progression utilisateur via Firebase Functions
  const getUserProgress = useCallback(async () => {
    try {
      const result = await callGetUserProgress();
      
      if (result.success) {
        const { xp, level, progress, streak, totalXPGained, lastActivity } = result.data;
        
        // Mettre à jour l'état local
        setUserData(prev => ({
          ...prev,
          xp,
          level,
          progressPercentage: progress.progressPercentage,
          streak,
          lastActivity,
          totalXPGained
        }));
        
        setProgressPercentage(progress.progressPercentage);
        
        return result.data;
      }
      
    } catch (error) {
      console.error('❌ Erreur récupération progression:', error);
    }
  }, [callGetUserProgress]);

  // Obtenir les missions disponibles via Firebase Functions
  const getAvailableMissions = useCallback(async (filters = {}) => {
    try {
      const result = await callGetAvailableMissions(filters);
      
      if (result.success) {
        return result.data;
      }
      
    } catch (error) {
      console.error('❌ Erreur récupération missions:', error);
      return { missions: [], total: 0 };
    }
  }, [callGetAvailableMissions]);

  // Obtenir les badges utilisateur via Firebase Functions
  const getUserBadges = useCallback(async () => {
    try {
      const result = await callGetUserBadges();
      
      if (result.success) {
        const { badges } = result.data;
        
        // Mettre à jour l'état local
        setUserData(prev => ({
          ...prev,
          badges
        }));
        
        return result.data;
      }
      
    } catch (error) {
      console.error('❌ Erreur récupération badges utilisateur:', error);
    }
  }, [callGetUserBadges]);

  // Initialiser les données utilisateur
  useEffect(() => {
    if (userId) {
      // Assigner les variantes A/B Testing
      assignVariant('xp_boost');
      assignVariant('mission_rewards');
      assignVariant('shop_discounts');
      
      // Charger la progression utilisateur
      getUserProgress();
      
      // Charger les badges utilisateur
      getUserBadges();
      
      // Vérifier les badges
      checkBadges();
    }
  }, [userId, assignVariant, getUserProgress, getUserBadges, checkBadges]);

  // Écouter les changements en temps réel (uniquement pour les données critiques)
  useEffect(() => {
    if (!userId) {
      setUserData(prev => ({ ...prev, loading: false, error: 'User not logged in' }));
      return;
    }

    const userDocRef = doc(db, 'users', userId);
    
    const unsubscribe = onSnapshot(userDocRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        
        // Mettre à jour seulement les champs critiques (éviter les conflits avec les fonctions serveur)
        setUserData(prev => ({
          ...prev,
          loading: false,
          error: null,
          // Champs qui peuvent changer côté serveur
          subscription: data.subscription || prev.subscription,
          badges: data.badges || prev.badges,
          // Garder les valeurs locales pour XP/level qui sont gérées par les fonctions
          xp: prev.xp,
          level: prev.level,
          progressPercentage: prev.progressPercentage
        }));
      } else {
        setUserData(prev => ({ 
          ...prev, 
          loading: false, 
          error: 'User document not found' 
        }));
      }
    }, (error) => {
      console.error('Erreur écoute données utilisateur:', error);
      setUserData(prev => ({ 
        ...prev, 
        loading: false, 
        error: error.message 
      }));
    });

    return unsubscribe;
  }, [userId]);

  // Gérer l'état de chargement global
  useEffect(() => {
    setUserData(prev => ({
      ...prev,
      loading: functionsLoading
    }));
  }, [functionsLoading]);

  // Gérer les erreurs
  useEffect(() => {
    if (functionsError) {
      setUserData(prev => ({
        ...prev,
        error: functionsError
      }));
    }
  }, [functionsError]);

  // Fonctions utilitaires
  const calculateXPForNextLevel = useCallback((level) => {
    return Math.floor(100 * Math.pow(1.5, level - 1));
  }, []);

  const calculateXPForCurrentLevel = useCallback((level) => {
    return level > 1 ? Math.floor(100 * Math.pow(1.5, level - 2)) : 0;
  }, []);

  const generateDailyMissions = useCallback(() => {
    // Logique de génération de missions quotidiennes
    const missions = [
      {
        id: 'daily_1',
        title: 'Mission Quotidienne 1',
        description: 'Complète 3 conversations',
        xpReward: 20,
        type: 'daily',
        difficulty: 'easy'
      },
      {
        id: 'daily_2',
        title: 'Mission Quotidienne 2',
        description: 'Apprends un nouveau concept',
        xpReward: 30,
        type: 'daily',
        difficulty: 'medium'
      },
      {
        id: 'daily_3',
        title: 'Mission Quotidienne 3',
        description: 'Révise une notion précédente',
        xpReward: 25,
        type: 'daily',
        difficulty: 'easy'
      }
    ];
    
    return missions;
  }, []);

  const initializeDailyMissions = useCallback(async () => {
    // Initialiser les missions quotidiennes si nécessaire
    const today = new Date().toDateString();
    const lastReset = userData.missions?.lastReset?.toDate()?.toDateString();
    
    if (!lastReset || lastReset !== today) {
      const newMissions = generateDailyMissions();
      
      setUserData(prev => ({
        ...prev,
        missions: {
          daily: newMissions,
          lastReset: new Date()
        }
      }));
    }
  }, [userData.missions?.lastReset, generateDailyMissions]);

  return {
    // État
    userData,
    loading,
    error,
    progressPercentage,
    
    // Fonctions principales (utilisent Firebase Functions)
    addXp,
    completeMission,
    checkBadges,
    getUserProgress,
    
    // Fonctions secondaires
    getAvailableMissions,
    getUserBadges,
    
    // Utilitaires
    calculateXPForNextLevel,
    calculateXPForCurrentLevel,
    generateDailyMissions,
    initializeDailyMissions,
    
    // A/B Testing
    assignVariant,
    getFeatureVariant,
    isTestGroup,
    
    // Nettoyage
    clearError
  };
};

export default useUserDataServer;
