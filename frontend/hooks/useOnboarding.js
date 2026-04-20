import { useState, useEffect, useCallback } from 'react';
import { doc, setDoc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebaseClean';
import { addXp } from './useUserData';

const ONBOARDING_STEPS = [
  { id: 'welcome', title: 'Bienvenue !', description: 'Découvons KidAI ensemble' },
  { id: 'pseudo', title: 'Choisis ton pseudo', description: 'Comment veux-tu être appelé ?' },
  { id: 'avatar', title: 'Choisis ton avatar', description: 'Personnalise ton profil' },
  { id: 'objective', title: 'Quel est ton objectif ?', description: 'Adaptons ton expérience' },
  { id: 'firstMission', title: 'Ta première mission', description: 'Commence ton voyage !' },
  { id: 'completion', title: 'Félicitations !', description: 'Tu es prêt à commencer' }
];

const AVATARS = [
  { id: 'robot', name: 'Robot', emoji: '🤖', color: '#4CAF50' },
  { id: 'wizard', name: 'Magicien', emoji: '🧙', color: '#9C27B0' },
  { id: 'astronaut', name: 'Astronaute', emoji: '👨‍🚀', color: '#2196F3' },
  { id: 'ninja', name: 'Ninja', emoji: '🥷', color: '#000000' },
  { id: 'pirate', name: 'Pirate', emoji: '🏴‍☠️', color: '#FF5722' },
  { id: 'superhero', name: 'Super-héros', emoji: '🦸', color: '#FF9800' },
  { id: 'artist', name: 'Artiste', emoji: '🎨', color: '#E91E63' },
  { id: 'scientist', name: 'Scientifique', emoji: '👨‍🔬', color: '#00BCD4' },
  { id: 'musician', name: 'Musicien', emoji: '🎵', color: '#8BC34A' },
  { id: 'chef', name: 'Chef', emoji: '👨‍🍳', color: '#795548' }
];

const OBJECTIVES = [
  { 
    id: 'fun', 
    title: 'Fun & Découverte', 
    description: 'Je veux m\'amuser et découvrir',
    emoji: '🎮',
    features: ['Missions créatives', 'Récompenses fun', 'Progression rapide'],
    xpBonus: 10
  },
  { 
    id: 'learn', 
    title: 'Apprentissage', 
    description: 'Je veux apprendre sérieusement',
    emoji: '📚',
    features: ['Cours structurés', 'Exercices pratiques', 'Certification'],
    xpBonus: 20
  },
  { 
    id: 'quick', 
    title: 'Rapide & Efficace', 
    description: 'Je veux des résultats rapides',
    emoji: '⚡',
    features: ['Missions courtes', 'Tips quotidiens', 'Quick wins'],
    xpBonus: 15
  }
];

const useOnboarding = (userId) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Données de l'onboarding
  const [onboardingData, setOnboardingData] = useState({
    pseudo: '',
    avatar: null,
    objective: null,
    firstMissionCompleted: false,
    startTime: null,
    completedAt: null,
    totalDuration: null
  });

  // Charger la progression de l'onboarding
  useEffect(() => {
    if (userId) {
      loadOnboardingProgress();
    }
  }, [userId]);

  const loadOnboardingProgress = async () => {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const onboardingProgress = userData.onboardingProgress || {};
        
        if (onboardingProgress.completed) {
          setIsCompleted(true);
          setCurrentStep(ONBOARDING_STEPS.length - 1);
        } else {
          setCurrentStep(onboardingProgress.currentStep || 0);
          setOnboardingData(prev => ({
            ...prev,
            ...onboardingProgress.data
          }));
        }
      }
    } catch (error) {
      console.error('❌ Erreur chargement progression onboarding:', error);
      setError(error.message);
    }
  };

  // Sauvegarder la progression
  const saveProgress = useCallback(async (step, data = {}) => {
    if (!userId) return;

    try {
      const userDocRef = doc(db, 'users', userId);
      
      await updateDoc(userDocRef, {
        onboardingProgress: {
          currentStep: step,
          data: { ...onboardingData, ...data },
          completed: step >= ONBOARDING_STEPS.length - 1,
          lastUpdated: new Date()
        }
      });

      setOnboardingData(prev => ({ ...prev, ...data }));
      
    } catch (error) {
      console.error('❌ Erreur sauvegarde progression:', error);
      setError(error.message);
    }
  }, [userId, onboardingData]);

  // Passer à l'étape suivante
  const nextStep = useCallback(async () => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      const nextStepIndex = currentStep + 1;
      setCurrentStep(nextStepIndex);
      await saveProgress(nextStepIndex);
    }
  }, [currentStep, saveProgress]);

  // Revenir à l'étape précédente
  const previousStep = useCallback(async () => {
    if (currentStep > 0) {
      const prevStepIndex = currentStep - 1;
      setCurrentStep(prevStepIndex);
      await saveProgress(prevStepIndex);
    }
  }, [currentStep, saveProgress]);

  // Aller à une étape spécifique
  const goToStep = useCallback(async (stepIndex) => {
    if (stepIndex >= 0 && stepIndex < ONBOARDING_STEPS.length) {
      setCurrentStep(stepIndex);
      await saveProgress(stepIndex);
    }
  }, [saveProgress]);

  // Sauvegarder le pseudo
  const savePseudo = useCallback(async (pseudo) => {
    if (!pseudo || pseudo.trim().length < 2) {
      setError('Le pseudo doit contenir au moins 2 caractères');
      return false;
    }

    try {
      const userDocRef = doc(db, 'users', userId);
      
      await updateDoc(userDocRef, {
        username: pseudo.trim(),
        displayName: pseudo.trim()
      });

      await saveProgress(currentStep, { pseudo: pseudo.trim() });
      
      console.log('✅ Pseudo sauvegardé:', pseudo);
      return true;
      
    } catch (error) {
      console.error('❌ Erreur sauvegarde pseudo:', error);
      setError(error.message);
      return false;
    }
  }, [userId, currentStep, saveProgress]);

  // Sauvegarder l'avatar
  const saveAvatar = useCallback(async (avatar) => {
    try {
      const userDocRef = doc(db, 'users', userId);
      
      await updateDoc(userDocRef, {
        avatar: avatar,
        avatarUpdatedAt: new Date()
      });

      await saveProgress(currentStep, { avatar });
      
      console.log('✅ Avatar sauvegardé:', avatar);
      return true;
      
    } catch (error) {
      console.error('❌ Erreur sauvegarde avatar:', error);
      setError(error.message);
      return false;
    }
  }, [userId, currentStep, saveProgress]);

  // Sauvegarder l'objectif
  const saveObjective = useCallback(async (objective) => {
    try {
      const userDocRef = doc(db, 'users', userId);
      
      await updateDoc(userDocRef, {
        objective: objective.id,
        objectiveFeatures: objective.features,
        xpBonus: objective.xpBonus,
        preferences: {
          learningStyle: objective.id,
          difficulty: 'adaptive',
          notificationsEnabled: true
        }
      });

      await saveProgress(currentStep, { objective });
      
      console.log('✅ Objectif sauvegardé:', objective);
      return true;
      
    } catch (error) {
      console.error('❌ Erreur sauvegarde objectif:', error);
      setError(error.message);
      return false;
    }
  }, [userId, currentStep, saveProgress]);

  // Compléter la première mission
  const completeFirstMission = useCallback(async () => {
    try {
      const userDocRef = doc(db, 'users', userId);
      
      // Créer la première mission
      const firstMission = {
        id: 'onboarding_welcome',
        title: 'Bienvenue dans KidAI !',
        description: 'Découvre les bases de l\'application',
        xpReward: 25,
        completed: true,
        completedAt: new Date(),
        type: 'onboarding'
      };

      await updateDoc(userDocRef, {
        'missions.daily': [firstMission],
        'missions.lastReset': new Date()
      });

      await saveProgress(currentStep, { firstMissionCompleted: true });
      
      console.log('✅ Première mission complétée');
      return true;
      
    } catch (error) {
      console.error('❌ Erreur complétion première mission:', error);
      setError(error.message);
      return false;
    }
  }, [userId, currentStep, saveProgress]);

  // Terminer l'onboarding
  const completeOnboarding = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const endTime = Date.now();
      const duration = onboardingData.startTime ? endTime - onboardingData.startTime : 0;

      // Données finales de l'onboarding
      const finalData = {
        ...onboardingData,
        completedAt: new Date(),
        totalDuration: duration,
        completed: true
      };

      // Mettre à jour le document utilisateur
      const userDocRef = doc(db, 'users', userId);
      
      await updateDoc(userDocRef, {
        onboardingProgress: {
          completed: true,
          completedAt: new Date(),
          totalDuration: duration,
          data: finalData
        },
        hasCompletedOnboarding: true,
        onboardedAt: new Date()
      });

      // Bonus XP de bienvenue
      const welcomeXP = 50;
      const objectiveBonus = onboardingData.objective?.xpBonus || 0;
      const totalXP = welcomeXP + objectiveBonus;

      // Ajouter l'XP via le hook
      const xpResult = await addXp(welcomeXP + objectiveBonus, 'onboarding_complete', {
        pseudo: onboardingData.pseudo,
        avatar: onboardingData.avatar,
        objective: onboardingData.objective?.id,
        duration
      });

      setIsCompleted(true);
      setCurrentStep(ONBOARDING_STEPS.length - 1);
      setOnboardingData(finalData);

      console.log('✅ Onboarding terminé avec succès !');
      console.log(`🎉 XP bonus: +${totalXP} XP`);

      return {
        success: true,
        xpAwarded: totalXP,
        newXP: xpResult.newXP,
        newLevel: xpResult.newLevel,
        leveledUp: xpResult.leveledUp
      };

    } catch (error) {
      console.error('❌ Erreur complétion onboarding:', error);
      setError(error.message);
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  }, [userId, onboardingData, addXp]);

  // Réinitialiser l'onboarding
  const resetOnboarding = useCallback(async () => {
    try {
      const userDocRef = doc(db, 'users', userId);
      
      await updateDoc(userDocRef, {
        onboardingProgress: {
          currentStep: 0,
          data: {},
          completed: false,
          lastUpdated: new Date()
        },
        hasCompletedOnboarding: false
      });

      setCurrentStep(0);
      setIsCompleted(false);
      setOnboardingData({
        pseudo: '',
        avatar: null,
        objective: null,
        firstMissionCompleted: false,
        startTime: null,
        completedAt: null,
        totalDuration: null
      });

      console.log('🔄 Onboarding réinitialisé');
      
    } catch (error) {
      console.error('❌ Erreur réinitialisation onboarding:', error);
      setError(error.message);
    }
  }, [userId]);

  // Démarrer l'onboarding
  const startOnboarding = useCallback(() => {
    setOnboardingData(prev => ({
      ...prev,
      startTime: Date.now()
    }));
  }, []);

  // Obtenir l'étape actuelle
  const getCurrentStep = useCallback(() => {
    return ONBOARDING_STEPS[currentStep];
  }, [currentStep]);

  // Vérifier si une étape est valide
  const isStepValid = useCallback((stepIndex) => {
    return stepIndex >= 0 && stepIndex < ONBOARDING_STEPS.length;
  }, []);

  // Progression en pourcentage
  const progressPercentage = ((currentStep + 1) / ONBOARDING_STEPS.length) * 100;

  return {
    // État
    currentStep,
    isCompleted,
    loading,
    error,
    progressPercentage,
    onboardingData,
    
    // Données
    steps: ONBOARDING_STEPS,
    avatars: AVATARS,
    objectives: OBJECTIVES,
    
    // Actions de navigation
    nextStep,
    previousStep,
    goToStep,
    
    // Actions de sauvegarde
    savePseudo,
    saveAvatar,
    saveObjective,
    completeFirstMission,
    completeOnboarding,
    
    // Utilitaires
    getCurrentStep,
    isStepValid,
    startOnboarding,
    resetOnboarding,
    loadOnboardingProgress
  };
};

export default useOnboarding;
