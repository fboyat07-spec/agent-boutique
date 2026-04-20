import { useState, useCallback } from 'react';
import { Platform } from 'react-native';
import stripeService from './stripeService';
import useSubscription from './useSubscription';
import useFeedback from './useFeedback';

const useStripePayment = (userId) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [paymentSheetVisible, setPaymentSheetVisible] = useState(false);
  const [paymentIntent, setPaymentIntent] = useState(null);

  const { createSubscription, updatePaymentStatus } = useSubscription(userId);
  const { errorFeedback, successFeedback } = useFeedback();

  // Initialiser Stripe
  const initializeStripe = useCallback(async () => {
    try {
      const result = await stripeService.initialize();
      if (!result.success) {
        setError(result.error);
        return false;
      }
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, []);

  // Démarrer un abonnement avec Stripe Checkout
  const startSubscription = useCallback(async (planId, successUrl, cancelUrl) => {
    if (!userId) {
      setError('Utilisateur non connecté');
      return { success: false, error: 'Utilisateur non connecté' };
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Obtenir les informations du plan
      const plan = stripeService.getSubscriptionPlan(planId);
      
      if (!plan) {
        throw new Error('Plan d\'abonnement invalide');
      }

      // Créer les items pour Stripe Checkout
      const checkoutItems = [
        {
          price_data: {
            currency: 'eur',
            unit_amount: plan.price * 100, // Convertir en cents
            product_data: {
              name: plan.name,
              description: `Abonnement ${plan.name} - ${plan.duration ? plan.duration + ' jours' : 'à vie'}`,
              images: []
            }
          },
          quantity: 1
        }
      ];

      // Créer une session de checkout
      const sessionResult = await stripeService.createCheckoutSession(
        checkoutItems,
        successUrl || 'https://yourapp.com/success',
        cancelUrl || 'https://yourapp.com/cancel'
      );

      if (!sessionResult.success) {
        throw new Error(sessionResult.error);
      }

      const session = sessionResult.session;

      // Sur mobile, ouvrir la session dans le navigateur ou WebView
      if (Platform.OS === 'web') {
        // Web: Rediriger vers Stripe Checkout
        window.location.href = session.url;
      } else {
        // Mobile: Ovrir dans un navigateur ou WebView
        // Pour Expo, vous pouvez utiliser WebBrowser
        const { WebBrowser } = await import('expo-web-browser');
        await WebBrowser.openBrowserAsync(session.url, {
          toolbarColor: '#4CAF50',
          controlsColor: '#4CAF50'
        });
      }

      console.log('🔄 Session Stripe Checkout créée:', session.id);
      
      return { 
        success: true, 
        sessionId: session.id,
        checkoutUrl: session.url
      };

    } catch (err) {
      console.error('❌ Erreur démarrage abonnement:', err);
      setError(err.message);
      
      // Feedback d'erreur
      await errorFeedback({
        message: 'Erreur lors de l\'abonnement',
        errorType: 'payment'
      });
      
      return { success: false, error: err.message };
    } finally {
      setIsProcessing(false);
    }
  }, [userId, createSubscription, errorFeedback]);

  // Démarrer un abonnement avec PaymentSheet (plus natif)
  const startSubscriptionWithPaymentSheet = useCallback(async (planId) => {
    if (!userId) {
      setError('Utilisateur non connecté');
      return { success: false, error: 'Utilisateur non connecté' };
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Obtenir les informations du plan
      const plan = stripeService.getSubscriptionPlan(planId);
      
      if (!plan) {
        throw new Error('Plan d\'abonnement invalide');
      }

      // Créer un PaymentIntent pour PaymentSheet
      const paymentIntentResult = await stripeService.createPaymentIntent(
        plan.price,
        'eur',
        {
          plan_id: planId,
          user_id: userId,
          subscription_type: 'recurring'
        }
      );

      if (!paymentIntentResult.success) {
        throw new Error(paymentIntentResult.error);
      }

      const paymentIntent = paymentIntentResult.paymentIntent;
      setPaymentIntent(paymentIntent);

      // Pour PaymentSheet, vous utiliseriez @stripe/stripe-react-native
      // const { presentPaymentSheet } = await import('@stripe/stripe-react-native');
      
      // Mock: Simuler l'affichage de PaymentSheet
      setPaymentSheetVisible(true);
      
      console.log('🔄 PaymentIntent créé pour PaymentSheet:', paymentIntent.id);
      
      return { 
        success: true, 
        paymentIntentId: paymentIntent.id 
      };

    } catch (err) {
      console.error('❌ Erreur PaymentSheet:', err);
      setError(err.message);
      
      // Feedback d'erreur
      await errorFeedback({
        message: 'Erreur lors du paiement',
        errorType: 'payment'
      });
      
      return { success: false, error: err.message };
    } finally {
      setIsProcessing(false);
    }
  }, [userId, errorFeedback]);

  // Confirmer le paiement (pour PaymentSheet)
  const confirmPayment = useCallback(async (paymentMethodId) => {
    if (!paymentIntent) {
      setError('Aucun paiement en cours');
      return { success: false, error: 'Aucun paiement en cours' };
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Confirmer le PaymentIntent
      const confirmResult = await stripeService.confirmPaymentIntent(
        paymentIntent.id,
        paymentMethodId
      );

      if (!confirmResult.success) {
        throw new Error(confirmResult.error);
      }

      const confirmedPayment = confirmResult.paymentIntent;

      // Extraire le plan_id des métadonnées
      const planId = paymentIntent.metadata?.plan_id || 'premium';

      // Créer l'abonnement dans Firestore
      const subscriptionResult = await createSubscription(planId, 'stripe');

      if (!subscriptionResult.success) {
        throw new Error(subscriptionResult.error);
      }

      // Mettre à jour le statut de paiement
      await updatePaymentStatus('succeeded', paymentIntent.id);

      // Feedback de succès
      await successFeedback({
        amount: paymentIntent.amount / 100,
        itemName: `Abonnement ${planId}`,
        success: true
      });

      // Fermer la PaymentSheet
      setPaymentSheetVisible(false);
      setPaymentIntent(null);

      console.log('✅ Paiement confirmé et abonnement créé:', confirmedPayment.id);
      
      return { 
        success: true, 
        payment: confirmedPayment,
        subscription: subscriptionResult.subscription
      };

    } catch (err) {
      console.error('❌ Erreur confirmation paiement:', err);
      setError(err.message);
      
      // Feedback d'erreur
      await errorFeedback({
        message: 'Erreur lors de la confirmation du paiement',
        errorType: 'payment'
      });
      
      return { success: false, error: err.message };
    } finally {
      setIsProcessing(false);
    }
  }, [paymentIntent, createSubscription, updatePaymentStatus, successFeedback, errorFeedback]);

  // Annuler le paiement
  const cancelPayment = useCallback(async () => {
    setPaymentSheetVisible(false);
    setPaymentIntent(null);
    setError(null);
    
    console.log('❌ Paiement annulé par l\'utilisateur');
    
    return { success: true, cancelled: true };
  }, []);

  // Gérer le succès du paiement (pour Stripe Checkout)
  const handlePaymentSuccess = useCallback(async (sessionId) => {
    setIsProcessing(true);
    setError(null);

    try {
      // En production, vous vérifieriez le statut de la session
      // const session = await stripeService.retrieveCheckoutSession(sessionId);
      
      // Mock: Simuler la vérification
      const mockSession = {
        id: sessionId,
        payment_status: 'paid',
        metadata: {
          plan_id: 'premium' // À extraire de la vraie session
        }
      };

      if (mockSession.payment_status === 'paid') {
        const planId = mockSession.metadata.plan_id || 'premium';
        
        // Créer l'abonnement dans Firestore
        const subscriptionResult = await createSubscription(planId, 'stripe');

        if (!subscriptionResult.success) {
          throw new Error(subscriptionResult.error);
        }

        // Feedback de succès
        await successFeedback({
          amount: 999, // À extraire de la session
          itemName: `Abonnement ${planId}`,
          success: true
        });

        console.log('✅ Paiement Stripe Checkout réussi:', sessionId);
        
        return { 
          success: true, 
          subscription: subscriptionResult.subscription 
        };
      } else {
        throw new Error('Paiement non complété');
      }

    } catch (err) {
      console.error('❌ Erreur traitement succès paiement:', err);
      setError(err.message);
      
      return { success: false, error: err.message };
    } finally {
      setIsProcessing(false);
    }
  }, [createSubscription, successFeedback]);

  // Gérer l'annulation du paiement (pour Stripe Checkout)
  const handlePaymentCancel = useCallback(() => {
    setError('Paiement annulé');
    setPaymentSheetVisible(false);
    setPaymentIntent(null);
    
    console.log('❌ Paiement annulé');
    
    return { success: true, cancelled: true };
  }, []);

  // Obtenir les méthodes de paiement disponibles
  const getPaymentMethods = useCallback(() => {
    return stripeService.getPaymentMethods();
  }, []);

  // Valider les informations de paiement
  const validatePaymentInfo = useCallback((cardInfo) => {
    const errors = {};

    // Valider le numéro de carte
    if (cardInfo.number) {
      const cardValidation = stripeService.validateCardNumber(cardInfo.number);
      if (!cardValidation.valid) {
        errors.number = cardValidation.error;
      }
    }

    // Valider la date d'expiration
    if (cardInfo.expiry) {
      const expiryValidation = stripeService.validateExpiry(cardInfo.expiry);
      if (!expiryValidation.valid) {
        errors.expiry = expiryValidation.error;
      }
    }

    // Valider le CVV
    if (cardInfo.cvv) {
      const cvvValidation = stripeService.validateCVV(cardInfo.cvv);
      if (!cvvValidation.valid) {
        errors.cvv = cvvValidation.error;
      }
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  }, []);

  // Obtenir le statut du paiement
  const getPaymentStatus = useCallback(() => {
    return {
      isProcessing,
      error,
      paymentSheetVisible,
      paymentIntent,
      canMakePayment: !isProcessing && !error
    };
  }, [isProcessing, error, paymentSheetVisible, paymentIntent]);

  // Réinitialiser l'état du paiement
  const resetPaymentState = useCallback(() => {
    setIsProcessing(false);
    setError(null);
    setPaymentSheetVisible(false);
    setPaymentIntent(null);
  }, []);

  return {
    // État
    isProcessing,
    error,
    paymentSheetVisible,
    paymentIntent,
    
    // Actions principales
    startSubscription,              // Stripe Checkout
    startSubscriptionWithPaymentSheet, // PaymentSheet
    confirmPayment,                 // Confirmer paiement
    cancelPayment,                  // Annuler paiement
    
    // Gestion des callbacks
    handlePaymentSuccess,            // Succès Checkout
    handlePaymentCancel,             // Annulation Checkout
    
    // Utilitaires
    getPaymentMethods,               // Méthodes disponibles
    validatePaymentInfo,            // Validation carte
    getPaymentStatus,               // Statut actuel
    resetPaymentState,              // Réinitialiser
    initializeStripe                 // Initialiser Stripe
  };
};

export default useStripePayment;
