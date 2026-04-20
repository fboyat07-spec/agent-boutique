import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useStripePayment } from '../hooks/useStripePayment';
import useSubscription from '../hooks/useSubscription';

const StripePaymentSheet = ({ userId, planId, onSuccess, onCancel, onError }) => {
  const {
    isProcessing,
    error,
    paymentSheetVisible,
    paymentIntent,
    startSubscriptionWithPaymentSheet,
    confirmPayment,
    cancelPayment,
    getPaymentMethods,
    validatePaymentInfo,
    resetPaymentState
  } = useStripePayment(userId);

  const { subscriptionData } = useSubscription(userId);

  // État du formulaire de carte
  const [cardInfo, setCardInfo] = useState({
    number: '',
    expiry: '',
    cvv: '',
    name: ''
  });

  // État de validation
  const [validationErrors, setValidationErrors] = useState({});

  // Méthodes de paiement disponibles
  const paymentMethods = getPaymentMethods();

  // Valider le formulaire
  const validateForm = () => {
    const validation = validatePaymentInfo(cardInfo);
    setValidationErrors(validation.errors);
    return validation.isValid;
  };

  // Gérer le changement des champs
  const handleInputChange = (field, value) => {
    let formattedValue = value;

    // Formater le numéro de carte
    if (field === 'number') {
      formattedValue = value.replace(/\s/g, '').replace(/(\d{4})/g, '$1 ').trim();
    }

    // Formater la date d'expiration
    if (field === 'expiry') {
      formattedValue = value.replace(/\D/g, '').replace(/(\d{2})/, '$1/');
      if (formattedValue.length > 5) {
        formattedValue = formattedValue.slice(0, 5);
      }
    }

    // Formater le CVV
    if (field === 'cvv') {
      formattedValue = value.replace(/\D/g, '').slice(0, 4);
    }

    setCardInfo(prev => ({
      ...prev,
      [field]: formattedValue
    }));

    // Valider en temps réel
    if (validationErrors[field]) {
      const validation = validatePaymentInfo({
        ...cardInfo,
        [field]: formattedValue
      });
      setValidationErrors(validation.errors);
    }
  };

  // Démarrer le paiement
  const handleStartPayment = async () => {
    if (!validateForm()) {
      Alert.alert('Erreur', 'Veuillez corriger les erreurs dans le formulaire');
      return;
    }

    const result = await startSubscriptionWithPaymentSheet(planId);
    
    if (result.success) {
      // La PaymentSheet sera affichée automatiquement
      console.log('🔄 PaymentSheet démarrée');
    } else {
      onError && onError(result.error);
    }
  };

  // Confirmer le paiement avec la méthode sélectionnée
  const handleConfirmPayment = async (paymentMethodId) => {
    const result = await confirmPayment(paymentMethodId);
    
    if (result.success) {
      onSuccess && onSuccess(result.subscription);
    } else {
      onError && onError(result.error);
    }
  };

  // Annuler le paiement
  const handleCancelPayment = async () => {
    const result = await cancelPayment();
    
    if (result.cancelled) {
      onCancel && onCancel();
    }
  };

  // Réinitialiser le formulaire
  const resetForm = () => {
    setCardInfo({
      number: '',
      expiry: '',
      cvv: '',
      name: ''
    });
    setValidationErrors({});
    resetPaymentState();
  };

  // Nettoyer au démontage
  useEffect(() => {
    return () => {
      resetPaymentState();
    };
  }, [resetPaymentState]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>💳 Paiement Sécurisé</Text>
        <Text style={styles.subtitle}>
          Votre abonnement sera activé immédiatement
        </Text>
      </View>

      {/* Méthodes de paiement */}
      <View style={styles.paymentMethodsContainer}>
        <Text style={styles.sectionTitle}>Méthodes de paiement</Text>
        <View style={styles.paymentMethodsGrid}>
          {paymentMethods.map(method => (
            <TouchableOpacity
              key={method.id}
              style={[
                styles.paymentMethodCard,
                !method.available && styles.paymentMethodDisabled
              ]}
              onPress={() => method.available && handleConfirmPayment(method.id)}
              disabled={!method.available || isProcessing}
              activeOpacity={method.available ? 0.8 : 1}
            >
              <Text style={styles.paymentMethodIcon}>
                {method.icon}
              </Text>
              <Text style={[
                styles.paymentMethodLabel,
                !method.available && styles.paymentMethodLabelDisabled
              ]}>
                {method.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Formulaire de carte (pour développement) */}
      <View style={styles.cardFormContainer}>
        <Text style={styles.sectionTitle}>Informations de carte</Text>
        
        {/* Nom du titulaire */}
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Nom du titulaire</Text>
          <Text style={[
            styles.input,
            styles.textInput
          ]}>
            {cardInfo.name || 'John Doe'}
          </Text>
        </View>

        {/* Numéro de carte */}
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Numéro de carte</Text>
          <Text style={[
            styles.input,
            styles.textInput,
            validationErrors.number && styles.inputError
          ]}>
            {cardInfo.number || '4242 4242 4242 4242'}
          </Text>
          {validationErrors.number && (
            <Text style={styles.errorText}>{validationErrors.number}</Text>
          )}
        </View>

        {/* Date d'expiration et CVV */}
        <View style={styles.row}>
          <View style={[styles.inputContainer, styles.halfWidth]}>
            <Text style={styles.inputLabel}>Expiration</Text>
            <Text style={[
              styles.input,
              styles.textInput,
              validationErrors.expiry && styles.inputError
            ]}>
              {cardInfo.expiry || '12/25'}
            </Text>
            {validationErrors.expiry && (
              <Text style={styles.errorText}>{validationErrors.expiry}</Text>
            )}
          </View>

          <View style={[styles.inputContainer, styles.halfWidth]}>
            <Text style={styles.inputLabel}>CVV</Text>
            <Text style={[
              styles.input,
              styles.textInput,
              validationErrors.cvv && styles.inputError
            ]}>
              {cardInfo.cvv || '123'}
            </Text>
            {validationErrors.cvv && (
              <Text style={styles.errorText}>{validationErrors.cvv}</Text>
            )}
          </View>
        </View>
      </View>

      {/* Boutons d'action */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={[
            styles.payButton,
            isProcessing && styles.buttonDisabled
          ]}
          onPress={handleStartPayment}
          disabled={isProcessing}
          activeOpacity={0.8}
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.payButtonText}>
              Payer {planId === 'premium' ? '€9.99' : planId === 'premium_plus' ? '€19.99' : '€99.99'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cancelButton}
          onPress={handleCancelPayment}
          disabled={isProcessing}
          activeOpacity={0.8}
        >
          <Text style={styles.cancelButtonText}>Annuler</Text>
        </TouchableOpacity>
      </View>

      {/* Message d'erreur */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>❌ Erreur de paiement</Text>
          <Text style={styles.errorMessage}>{error}</Text>
        </View>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          🔒 Paiement sécurisé et crypté via Stripe
        </Text>
        <Text style={styles.footerSubtext}>
          Vos informations de carte ne sont pas stockées
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  paymentMethodsContainer: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  paymentMethodsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  paymentMethodCard: {
    alignItems: 'center',
    padding: 15,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#E0E0E0',
    minWidth: 100,
  },
  paymentMethodDisabled: {
    opacity: 0.5,
    backgroundColor: '#F0F0F0',
  },
  paymentMethodIcon: {
    fontSize: 24,
    marginBottom: 5,
  },
  paymentMethodLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  paymentMethodLabelDisabled: {
    color: '#999',
  },
  cardFormContainer: {
    marginBottom: 30,
  },
  inputContainer: {
    marginBottom: 20,
  },
  halfWidth: {
    width: '48%',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    fontSize: 16,
    padding: 15,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  textInput: {
    color: '#666',
    fontStyle: 'italic',
  },
  inputError: {
    borderColor: '#FF3B30',
  },
  errorText: {
    fontSize: 12,
    color: '#FF3B30',
    marginTop: 5,
  },
  actionsContainer: {
    gap: 15,
  },
  payButton: {
    backgroundColor: '#4CAF50',
    padding: 18,
    borderRadius: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  buttonDisabled: {
    backgroundColor: '#E0E0E0',
    shadowOpacity: 0,
    elevation: 0,
  },
  payButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  cancelButton: {
    backgroundColor: '#FFFFFF',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#666',
  },
  errorContainer: {
    backgroundColor: '#FFEBEE',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FF3B30',
    marginBottom: 5,
  },
  errorMessage: {
    fontSize: 14,
    color: '#666',
  },
  footer: {
    alignItems: 'center',
    marginTop: 20,
  },
  footerText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  footerSubtext: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
});

export default StripePaymentSheet;
