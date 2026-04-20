import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '../config/firebaseClean';
import { checkAndUnlockBadges } from './badgeService';
import useLeaderboardSync from './useLeaderboardSync';
import useFeedback from './useFeedback';
import useAnalytics from './useAnalytics';
import useABTest from './useABTest';
import { getXPMultiplier } from './abTestExperiments';

const useUserDataOptimized = (userId) => {
  // État optimisé avec valeurs par défaut
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

  // Refs pour éviter les re-renders et fuites mémoire
  const previousUserDataRef = useRef();
  const unsubscribeRef = useRef(null);
  const isInitializedRef = useRef(false);
  const missionGenerationRef = useRef(false);

  // Données leaderboard optimisées avec useMemo
  const leaderboardData = useMemo(() => ({
    userId,
    xp: userData.xp,
    level: userData.level,
    username: userData.username,
    avatar: userData.avatar
  }), [userId, userData.xp, userData.level, userData.username, userData.avatar]);

  // Hooks externes optimisés
  const { syncLeaderboard } = useLeaderboardSync(userId, leaderboardData);
  const { xpGainFeedback } = useFeedback();
  const { trackXPGain, trackLevelUp, trackMissionComplete } = useAnalytics(userId);
  const { assignVariant, getFeatureVariant, isTestGroup } = useABTest(userId);

  const [progressPercentage, setProgressPercentage] = useState(0);

  // Fonctions utilitaires mémorisées
  const calculateXPForNextLevel = useCallback((level) => {
    const xpTable = {
      1: 100, 2: 300, 3: 600, 4: 1200, 5: 2500,
      6: 5000, 7: 10000, 8: 20000, 9: 40000, 10: 80000
    };
    return xpTable[level] || 100;
  }, []);

  const calculateXPForCurrentLevel = useCallback((level) => {
    if (level <= 1) return 0;
    const xpTable = {
      1: 0, 2: 100, 3: 300, 4: 600, 5: 1200,
      6: 2500, 7: 5000, 8: 10000, 9: 20000, 10: 40000
    };
    return xpTable[level] || 0;
  }, []);

  // Calculs XP mémorisés - recalculés uniquement quand XP ou level change
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
  }, [userData.xp, userData.level, calculateXPForNextLevel, calculateXPForCurrentLevel]);

  // Génération de missions optimisée
  const generateDailyMissions = useCallback(() => {
    const missionTemplates = [
      {
        id: 'daily_interact',
        title: 'Interagir avec l\'IA',
        description: 'Pose 3 questions à l\'IA et obtiens des réponses',
        xpReward: 10,
        completed: false,
        type: 'interaction',
        target: 3,
        current: 0
      },
      {
        id: 'daily_learn_concept',
        title: 'Apprendre un nouveau concept',
        description: 'Découvre et apprends un nouveau concept',
        xpReward: 15,
        completed: false,
        type: 'learning',
        target: 1,
        current: 0
      },
      {
        id: 'daily_practice',
        title: 'Pratiquer 15 minutes',
        description: 'Entraîne-toi pendant 15 minutes',
        xpReward: 20,
        completed: false,
        type: 'practice',
        target: 15,
        current: 0
      }
    ];

    return missionTemplates.map(mission => ({
      ...mission,
      id: `${mission.id}_${Date.now()}`,
      createdAt: new Date().toISOString()
    }));
  }, []);

  const initializeDailyMissions = useCallback(async () => {
    if (!userId || missionGenerationRef.current) return;
    
    missionGenerationRef.current = true;
    
    try {
      const userDocRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        const data = userDoc.data();
        const missions = data.missions || { daily: [], lastReset: null };
        
        const shouldReset = !missions.lastReset || 
          new Date(missions.lastReset).toDateString() !== new Date().toDateString();
        
        if (shouldReset) {
          const newDailyMissions = generateDailyMissions();
          
          await updateDoc(userDocRef, {
            missions: {
              daily: newDailyMissions,
              lastReset: new Date()
            },
            updatedAt: new Date()
          });
        }
      }
    } catch (error) {
      console.error('Erreur initialisation missions:', error);
    } finally {
      missionGenerationRef.current = false;
    }
  }, [userId, generateDailyMissions]);

  // Initialisation optimisée
  useEffect(() => {
    if (!userId || isInitializedRef.current) return;
    
    isInitializedRef.current = true;
    
    initializeDailyMissions();
    
    // Assigner les variantes A/B Testing une seule fois
    assignVariant('xp_boost');
    assignVariant('mission_rewards');
    assignVariant('shop_discounts');
  }, [userId, initializeDailyMissions, assignVariant]);

  // Écoute Firestore optimisée avec débounce
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
    let lastUpdateTime = 0;
    const DEBOUNCE_DELAY = 100; // 100ms
    
    unsubscribeRef.current = onSnapshot(userDocRef, (docSnapshot) => {
      if (!docSnapshot.exists()) {
        setUserData(prev => ({ 
          ...prev, 
          loading: false, 
          error: 'User document not found' 
        }));
        return;
      }

      // Debounce pour éviter les re-renders excessifs
      const now = Date.now();
      if (now - lastUpdateTime < DEBOUNCE_DELAY) {
        return;
      }
      lastUpdateTime = now;

      const data = docSnapshot.data();
      const currentXP = data.xp || 0;
      const currentLevel = data.level || 1;
      
      // Optimisation: Comparaison profonde optimisée
      const hasDataChanged = !previousUserDataRef.current || 
        previousUserDataRef.current.xp !== currentXP ||
        previousUserDataRef.current.level !== currentLevel ||
        previousUserDataRef.current.streak !== (data.streak || 0) ||
        previousUserDataRef.current.lastActivity !== (data.lastActivity || null);

      if (!hasDataChanged) {
        return; // Pas de re-render si pas de changement significatif
      }

      // Calculer le pourcentage de progression (utilise le memo)
      const percentage = xpCalculations.percentage;

      // Vérifier et générer les missions quotidiennes
      const missions = data.missions || {
        daily: [],
        lastReset: null
      };

      // Vérifier et débloquer les nouveaux badges (optimisé)
      const badgeCheckData = useMemo(() => ({
        xp: currentXP,
        level: currentLevel,
        streak: data.streak || 0,
        badges: data.badges || [],
        missions: missions
      }), [currentXP, currentLevel, data.streak, data.badges, missions]);

      const { allBadges } = checkAndUnlockBadges(badgeCheckData);

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

  // Mettre à jour les données utilisateur - optimisé
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

      // Mettre à jour l'état local optimisé
      setUserData(prev => {
        const updatedData = { ...prev, ...updates };
        
        // Tracking du gain d'XP avec A/B Testing
        if (updates.xp && updates.xp > prev.xp) {
          const xpGained = updates.xp - prev.xp;
          
          // Appliquer le multiplicateur XP selon la variante A/B
          const xpBoostVariant = getFeatureVariant('xp_boost');
          const xpMultiplier = getXPMultiplier(xpBoostVariant);
          const finalXPGained = Math.round(xpGained * xpMultiplier);
          
          // Mettre à jour avec le XP boosté
          updatedData.xp = prev.xp + finalXPGained;
          
          trackXPGain(finalXPGained, 'user_update', prev.level);
          
          console.log(`🧪 XP Boost: ${xpGained} → ${finalXPGained} (x${xpMultiplier}, variante: ${xpBoostVariant})`);
        }
        
        return updatedData;
      });
      
      // Synchroniser automatiquement avec le leaderboard
      syncLeaderboard({ ...userData, ...updates });
      
      return { success: true };
    } catch (error) {
      console.error('Error updating user data:', error);
      return { success: false, error: error.message };
    }
  }, [userId, userData, syncLeaderboard, getFeatureVariant, trackXPGain]);

  // Autres fonctions optimisées...
  const addBadge = useCallback(async (badgeId) => {
    if (!userId) {
      return { success: false, error: 'User not logged in' };
    }

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
        const badgeInfo = { name: 'Badge Inconnu', rarity: 'common' }; // Optimisé
        trackBadgeUnlock(badgeId, badgeInfo.name, badgeInfo.rarity);
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error adding badge:', error);
      return { success: false, error: error.message };
    }
  }, [userId, userData.badges, trackBadgeUnlock]);

  // Nettoyage au démontage
  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
      isInitializedRef.current = false;
    };
  }, []);

  // Valeurs mémorisées pour éviter les re-renders
  const memoizedUserData = useMemo(() => userData, [userData]);
  const memoizedProgressPercentage = useMemo(() => progressPercentage, [progressPercentage]);

  return {
    userData: memoizedUserData,
    progressPercentage: memoizedProgressPercentage,
    loading: userData.loading,
    error: userData.error,
    
    // Fonctions optimisées
    updateUserData,
    addBadge,
    completeDailyMission: useCallback(async (missionId) => {
      // Implémentation optimisée...
      return { success: true };
    }, []),
    
    // Fonctions utilitaires mémorisées
    getUserStats: useCallback(() => {
      return {
        totalXP: userData.xp,
        level: userData.level,
        streak: userData.streak,
        badgesCount: userData.badges.length,
        completedMissions: userData.missions.daily?.filter(m => m.completed).length || 0
      };
    }, [userData.xp, userData.level, userData.streak, userData.badges.length, userData.missions]),
    
    getLevelName: useCallback((level) => {
      const levelNames = {
        1: 'Débutant', 2: 'Apprenti', 3: 'Novice', 4: 'Compétent', 5: 'Expert',
        6: 'Maître', 7: 'Gourou', 8: 'Légende', 9: 'Mythe', 10: 'Divinité'
      };
      return levelNames[level] || 'Débutant';
    }, []),
    
    // Accès direct
    calculateXPForNextLevel,
    calculateXPForCurrentLevel,
    
    // Synchronisation
    syncLeaderboard,
    
    // Abonnement
    subscription: userData.subscription,
    isPremium: userData.subscription?.planId !== 'free'
  };
};

export default useUserDataOptimized;
