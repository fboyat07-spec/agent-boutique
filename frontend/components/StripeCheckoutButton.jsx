import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { WebBrowser } from 'expo-web-browser';
import { useStripePayment } from '../hooks/useStripePayment';
import useSubscription from '../hooks/useSubscription';

const StripeCheckoutButton = ({ 
  userId, 
  planId, 
  planName, 
  price, 
  onSuccess, 
  onError, 
  onCancel,
  style 
}) => {
  const {
    isProcessing,
    error,
    startSubscription,
    handlePaymentSuccess,
    handlePaymentCancel,
    resetPaymentState
  } = useStripePayment(userId);

  const { subscriptionData } = useSubscription(userId);

  // Gérer le démarrage de l'abonnement
  const handleSubscribe = async () => {
    if (!userId) {
      Alert.alert('Erreur', 'Vous devez être connecté pour vous abonner');
      return;
    }

    // URLs de redirection
    const successUrl = `https://yourapp.com/success?plan=${planId}`;
    const cancelUrl = `https://yourapp.com/cancel?plan=${planId}`;

    const result = await startSubscription(planId, successUrl, cancelUrl);
    
    if (result.success) {
      console.log('🔄 Redirection vers Stripe Checkout...');
      
      // Le navigateur s'ouvrira automatiquement via le hook
      // Le retour sera géré par handlePaymentSuccess/handlePaymentCancel
    } else {
      onError && onError(result.error);
    }
  };

  // Gérer le retour du navigateur (à appeler depuis votre écran)
  const handleBrowserReturn = async (url) => {
    try {
      // Extraire les paramètres de l'URL
      const urlObj = new URL(url);
      const sessionId = urlObj.searchParams.get('session_id');
      const plan = urlObj.searchParams.get('plan');
      
      if (url.includes('/success') && sessionId) {
        // Paiement réussi
        const result = await handlePaymentSuccess(sessionId);
        
        if (result.success) {
          onSuccess && onSuccess(result.subscription);
        } else {
          onError && onError(result.error);
        }
      } else if (url.includes('/cancel')) {
        // Paiement annulé
        const result = await handlePaymentCancel();
        
        if (result.cancelled) {
          onCancel && onCancel();
        }
      }
      
      // Fermer le navigateur
      await WebBrowser.dismissBrowser();
      
    } catch (err) {
      console.error('❌ Erreur traitement retour navigateur:', err);
      onError && onError('Erreur lors du traitement du paiement');
    }
  };

  // Réinitialiser en cas d'erreur
  const handleRetry = () => {
    resetPaymentState();
  };

  return (
    <View style={[styles.container, style]}>
      {/* Bouton principal d'abonnement */}
      <TouchableOpacity
        style={[
          styles.subscribeButton,
          isProcessing && styles.buttonDisabled,
          error && styles.buttonError
        ]}
        onPress={handleSubscribe}
        disabled={isProcessing}
        activeOpacity={0.8}
      >
        {isProcessing ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#FFFFFF" />
            <Text style={styles.loadingText}>Traitement...</Text>
          </View>
        ) : (
          <View style={styles.buttonContent}>
            <Text style={styles.buttonText}>
              S'abonner à {planName}
            </Text>
            <Text style={styles.priceText}>
              {price === 0 ? 'GRATUIT' : `€${(price / 100).toFixed(2)}/mois`}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Message d'erreur */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>❌ Erreur de paiement</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={handleRetry}
          >
            <Text style={styles.retryButtonText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Informations de sécurité */}
      <View style={styles.securityInfo}>
        <Text style={styles.securityText}>
          🔒 Paiement sécurisé via Stripe
        </Text>
        <Text style={styles.securitySubtext}>
          Annulation à tout moment • Sans engagement
        </Text>
      </View>

      {/* Badge de statut actuel */}
      {subscriptionData.planId !== 'free' && (
        <View style={styles.currentPlanBadge}>
          <Text style={styles.currentPlanText}>
            ✅ Déjà abonné à {subscriptionData.planId}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  subscribeButton: {
    backgroundColor: '#4CAF50',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    minHeight: 80,
  },
  buttonDisabled: {
    backgroundColor: '#E0E0E0',
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonError: {
    backgroundColor: '#FF3B30',
  },
  buttonContent: {
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
    textAlign: 'center',
  },
  priceText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  errorContainer: {
    backgroundColor: '#FFEBEE',
    padding: 15,
    borderRadius: 10,
    marginTop: 15,
    borderWidth: 1,
    borderColor: '#FF3B30',
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FF3B30',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 12,
  },
  retryButton: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 6,
    alignSelf: 'center',
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  securityInfo: {
    alignItems: 'center',
    marginTop: 15,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  securityText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  securitySubtext: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  currentPlanBadge: {
    backgroundColor: '#E8F5E8',
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  currentPlanText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#4CAF50',
    textAlign: 'center',
  },
});

export default StripeCheckoutButton;
