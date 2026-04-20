import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebaseClean';
import { 
  isPremium,
  getCurrentPlan,
  getSubscriptionStats,
  getXPBonus,
  getDailyMissionsForUser,
  getMissionRewards
} from './subscriptionService';

const useSubscription = (userId) => {
  const [subscriptionData, setSubscriptionData] = useState({
    planId: 'free',
    status: 'active',
    startDate: null,
    endDate: null,
    autoRenew: false,
    loading: true,
    error: null
  });

  // Écouter les données d'abonnement en temps réel
  useEffect(() => {
    if (!userId) {
      setSubscriptionData(prev => ({ 
        ...prev, 
        loading: false, 
        error: 'User not logged in' 
      }));
      return;
    }

    const userDocRef = doc(db, 'users', userId);
    
    const unsubscribe = onSnapshot(userDocRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        const subscription = data.subscription || {
          planId: 'free',
          status: 'active',
          startDate: null,
          endDate: null,
          autoRenew: false
        };

        setSubscriptionData({
          ...subscription,
          loading: false,
          error: null
        });
      } else {
        setSubscriptionData(prev => ({ 
          ...prev, 
          loading: false, 
          error: 'User document not found' 
        }));
      }
    }, (error) => {
      console.error('Erreur écoute abonnement:', error);
      setSubscriptionData(prev => ({ 
        ...prev, 
        loading: false, 
        error: error.message 
      }));
    });

    return unsubscribe;
  }, [userId]);

  // Créer ou mettre à jour un abonnement
  const createSubscription = useCallback(async (planId, paymentMethod = 'stripe') => {
    if (!userId) {
      return { success: false, error: 'User not logged in' };
    }

    try {
      const plan = getCurrentPlan({ subscription: { planId } });
      const now = new Date();
      const endDate = plan.duration ? new Date(now.getTime() + plan.duration * 24 * 60 * 60 * 1000) : null;

      const subscription = {
        planId,
        status: 'active',
        startDate: now.toISOString(),
        endDate: endDate ? endDate.toISOString() : null,
        autoRenew: plan.duration !== null,
        paymentMethod,
        amount: plan.price,
        currency: 'EUR',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      };

      const userDocRef = doc(db, 'users', userId);
      await updateDoc(userDocRef, {
        subscription,
        updatedAt: now
      });

      setSubscriptionData(subscription);

      console.log(`✅ Abonnement créé: ${plan.name}`);
      return { success: true, subscription };
    } catch (error) {
      console.error('❌ Erreur création abonnement:', error);
      return { success: false, error: error.message };
    }
  }, [userId]);

  // Annuler un abonnement
  const cancelSubscription = useCallback(async () => {
    if (!userId) {
      return { success: false, error: 'User not logged in' };
    }

    try {
      const now = new Date();
      const subscription = {
        ...subscriptionData,
        status: 'cancelled',
        cancelledAt: now.toISOString(),
        updatedAt: now.toISOString()
      };

      const userDocRef = doc(db, 'users', userId);
      await updateDoc(userDocRef, {
        subscription,
        updatedAt: now
      });

      setSubscriptionData(prev => ({ ...prev, status: 'cancelled' }));

      console.log('❌ Abonnement annulé');
      return { success: true };
    } catch (error) {
      console.error('❌ Erreur annulation abonnement:', error);
      return { success: false, error: error.message };
    }
  }, [userId, subscriptionData]);

  // Mettre à jour le statut de paiement
  const updatePaymentStatus = useCallback(async (status, paymentIntentId = null) => {
    if (!userId) {
      return { success: false, error: 'User not logged in' };
    }

    try {
      const userDocRef = doc(db, 'users', userId);
      const now = new Date();
      
      await updateDoc(userDocRef, {
        'subscription.paymentStatus': status,
        'subscription.paymentIntentId': paymentIntentId,
        'subscription.updatedAt': now.toISOString()
      });

      setSubscriptionData(prev => ({ 
        ...prev, 
        paymentStatus: status,
        paymentIntentId
      }));

      console.log(`📊 Statut paiement mis à jour: ${status}`);
      return { success: true };
    } catch (error) {
      console.error('❌ Erreur mise à jour statut paiement:', error);
      return { success: false, error: error.message };
    }
  }, [userId]);

  // Vérifier si l'utilisateur est premium
  const checkPremiumStatus = useCallback((userData) => {
    return isPremium(userData);
  }, []);

  // Obtenir les statistiques d'abonnement
  const getStats = useCallback((userData) => {
    return getSubscriptionStats(userData);
  }, []);

  // Obtenir le bonus d'XP pour l'utilisateur
  const calculateXPBonus = useCallback((baseXP, userData) => {
    return getXPBonus(baseXP, userData);
  }, []);

  // Obtenir les missions quotidiennes adaptées
  const getAdaptedMissions = useCallback((userData) => {
    return getDailyMissionsForUser(userData);
  }, []);

  // Calculer les récompenses de mission
  const calculateMissionRewards = useCallback((baseReward, userData) => {
    return getMissionRewards(userData, baseReward);
  }, []);

  // Vérifier l'accès à une fonctionnalité
  const hasFeatureAccess = useCallback((feature, userData) => {
    return canAccessFeature(userData, feature);
  }, []);

  // Simuler un paiement Stripe (mock)
  const simulateStripePayment = useCallback(async (planId) => {
    try {
      console.log('🔄 Simulation paiement Stripe pour:', planId);
      
      // Simuler la création d'un PaymentIntent
      const paymentIntent = {
        id: 'pi_mock_' + Date.now(),
        client_secret: 'pi_mock_secret_' + Date.now(),
        amount: getCurrentPlan({ subscription: { planId } }).price * 100, // en cents
        currency: 'eur',
        status: 'requires_payment_method'
      };

      // Mettre à jour le statut de paiement
      await updatePaymentStatus('requires_payment_method', paymentIntent.id);

      // Simuler un délai de traitement
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Simuler la confirmation du paiement
      await updatePaymentStatus('succeeded', paymentIntent.id);

      // Créer l'abonnement
      const result = await createSubscription(planId, 'stripe');
      
      return { 
        success: true, 
        paymentIntent,
        subscription: result.subscription 
      };
    } catch (error) {
      console.error('❌ Erreur simulation paiement:', error);
      return { success: false, error: error.message };
    }
  }, [userId, createSubscription, updatePaymentStatus]);

  // Gérer le renouvellement automatique
  const handleAutoRenewal = useCallback(async () => {
    if (!subscriptionData.autoRenew || !subscriptionData.endDate) {
      return { success: false, error: 'No auto-renewal or no end date' };
    }

    try {
      const now = new Date();
      const endDate = new Date(subscriptionData.endDate);
      
      // Vérifier si l'abonnement expire dans les 24h
      const hoursUntilExpiry = (endDate - now) / (1000 * 60 * 60);
      
      if (hoursUntilExpiry <= 24) {
        console.log('🔄 Renouvellement automatique dans 24h');
        
        // Simuler le renouvellement
        const result = await createSubscription(subscriptionData.planId, 'stripe_auto_renew');
        
        return { 
          success: true, 
          renewedSubscription: result.subscription 
        };
      } else {
        return { success: true, message: 'No renewal needed yet' };
      }
    } catch (error) {
      console.error('❌ Erreur renouvellement:', error);
      return { success: false, error: error.message };
    }
  }, [userId, subscriptionData, createSubscription]);

  return {
    // État actuel
    subscriptionData,
    loading,
    error,
    
    // Actions
    createSubscription,
    cancelSubscription,
    updatePaymentStatus,
    simulateStripePayment,
    handleAutoRenewal,
    
    // Utilitaires
    checkPremiumStatus,
    getStats,
    calculateXPBonus,
    getAdaptedMissions,
    calculateMissionRewards,
    hasFeatureAccess
  };
};

export default useSubscription;
