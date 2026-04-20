import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Animated } from 'react-native';
import { useSubscription } from '../hooks/useSubscription';
import { getAllSubscriptionPlans, getLocalizedPrice } from '../hooks/subscriptionService';
import useFeedback from '../hooks/useFeedback';

const PremiumScreen = ({ userId, userData }) => {
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scaleAnim] = useState(new Animated.Value(1));

  const {
    subscriptionData,
    loading,
    createSubscription,
    cancelSubscription,
    simulateStripePayment,
    getStats
  } = useSubscription(userId);

  const { purchaseFeedback, errorFeedback } = useFeedback();

  const allPlans = getAllSubscriptionPlans();
  const currentStats = getStats(userData);

  // Animation de sélection
  const animatePlanSelection = (plan) => {
    setSelectedPlan(plan.id);
    
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1.05,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      })
    ]).start();
  };

  // Gérer l'abonnement
  const handleSubscribe = async (plan) => {
    if (plan.id === 'free') {
      Alert.alert('Information', 'Vous êtes déjà sur le plan gratuit.');
      return;
    }

    if (plan.id === subscriptionData.planId) {
      Alert.alert('Information', 'Vous êtes déjà abonné à ce plan.');
      return;
    }

    setIsProcessing(true);
    
    try {
      // Simulation de paiement Stripe
      const result = await simulateStripePayment(plan.id);
      
      if (result.success) {
        // Feedback audio et haptique
        await purchaseFeedback({
          amount: plan.price,
          itemName: `Abonnement ${plan.name}`,
          success: true
        });

        Alert.alert(
          '🎉 Abonnement Réussi !',
          `Félicitations ! Vous êtes maintenant abonné au plan ${plan.name}.\n\nProfitez de tous les avantages premium !`,
          [{ text: 'Super !' }]
        );
      }
    } catch (error) {
      console.error('Erreur abonnement:', error);
      
      await errorFeedback({
        message: 'Erreur lors de l\'abonnement',
        errorType: 'payment'
      });
      
      Alert.alert('Erreur', 'Une erreur est survenue lors de l\'abonnement. Veuillez réessayer.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Gérer l'annulation
  const handleCancel = () => {
    Alert.alert(
      'Annuler l\'Abonnement',
      'Êtes-vous sûr de vouloir annuler votre abonnement ?\n\nVous perdrez tous les avantages premium à la fin de la période actuelle.',
      [
        { text: 'Non', style: 'cancel' },
        { 
          text: 'Oui', 
          style: 'destructive',
          onPress: async () => {
            setIsProcessing(true);
            try {
              await cancelSubscription();
              
              Alert.alert(
                'Abonnement Annulé',
                'Votre abonnement a été annulé. Vous pourrez continuer à profiter des avantages jusqu\'à la fin de votre période actuelle.',
                [{ text: 'Compris' }]
              );
            } catch (error) {
              console.error('Erreur annulation:', error);
              Alert.alert('Erreur', 'Une erreur est survenue lors de l\'annulation.');
            } finally {
              setIsProcessing(false);
            }
          }
        }
      ]
    );
  };

  // Obtenir la couleur du plan
  const getPlanColor = (planId) => {
    switch (planId) {
      case 'free': return '#9E9E9E';
      case 'premium': return '#4CAF50';
      case 'premium_plus': return '#2196F3';
      case 'lifetime': return '#FF9800';
      default: return '#9E9E9E';
    }
  };

  // Rendre une carte de plan
  const renderPlanCard = (plan) => {
    const isSelected = selectedPlan === plan.id;
    const isCurrentPlan = plan.id === subscriptionData.planId;
    const price = getLocalizedPrice(plan);
    const planColor = getPlanColor(plan.id);

    return (
      <Animated.View
        key={plan.id}
        style={[
          styles.planCard,
          isSelected && styles.planCardSelected,
          isCurrentPlan && styles.planCardCurrent,
          { borderColor: planColor },
          { transform: [{ scale: isSelected ? scaleAnim : 1 }] }
        ]}
      >
        {/* Header du plan */}
        <View style={[styles.planHeader, { backgroundColor: planColor }]}>
          <Text style={styles.planName}>{plan.name}</Text>
          {isCurrentPlan && (
            <View style={styles.currentBadge}>
              <Text style={styles.currentBadgeText}>ACTUEL</Text>
            </View>
          )}
        </View>

        {/* Prix */}
        <View style={styles.priceContainer}>
          <Text style={styles.price}>
            {plan.price === 0 ? 'GRATUIT' : price.formatted}
          </Text>
          {plan.duration && (
            <Text style={styles.duration}>
              / {plan.duration === 30 ? 'mois' : 'à vie'}
            </Text>
          )}
        </View>

        {/* Fonctionnalités */}
        <View style={styles.featuresContainer}>
          {Object.entries(plan.features).map(([key, value]) => {
            let featureName = '';
            let featureValue = '';

            switch (key) {
              case 'xpMultiplier':
                featureName = 'Multiplicateur XP';
                featureValue = `x${value}`;
                break;
              case 'maxDailyMissions':
                featureName = 'Missions quotidiennes';
                featureValue = `${value} max`;
                break;
              case 'maxBadges':
                featureName = 'Badges maximum';
                featureValue = `${value}`;
                break;
              case 'avatarAccess':
                featureName = 'Accès avatars';
                featureValue = value === 'all' ? 'Tous' : value;
                break;
              case 'analyticsAccess':
                featureName = 'Accès analytics';
                featureValue = value ? 'Oui' : 'Non';
                break;
              case 'prioritySupport':
                featureName = 'Support prioritaire';
                featureValue = value ? 'Oui' : 'Non';
                break;
              case 'customThemes':
                featureName = 'Thèmes personnalisés';
                featureValue = value ? 'Oui' : 'Non';
                break;
              case 'adsFree':
                featureName = 'Sans publicité';
                featureValue = value ? 'Oui' : 'Non';
                break;
              case 'exclusiveAvatars':
                featureName = 'Avatars exclusifs';
                featureValue = value ? 'Oui' : 'Non';
                break;
              case 'earlyAccess':
                featureName = 'Accès anticipé';
                featureValue = value ? 'Oui' : 'Non';
                break;
              case 'betaAccess':
                featureName = 'Accès bêta';
                featureValue = value ? 'Oui' : 'Non';
                break;
            }

            return (
              <View key={key} style={styles.featureItem}>
                <Text style={[
                  styles.featureName,
                  { color: getPlanColor(plan.id) }
                ]}>
                  {featureName}
                </Text>
                <Text style={styles.featureValue}>
                  {featureValue}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Bouton d'action */}
        <TouchableOpacity
          style={[
            styles.subscribeButton,
            { backgroundColor: planColor },
            isCurrentPlan && styles.currentPlanButton,
            isProcessing && styles.buttonDisabled
          ]}
          onPress={() => handleSubscribe(plan)}
          disabled={isCurrentPlan || isProcessing}
          activeOpacity={0.8}
        >
          <Text style={styles.subscribeButtonText}>
            {isCurrentPlan ? 'ACTUEL' : 'S\'ABONNER'}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Chargement...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>🌟 Premium</Text>
        <Text style={styles.subtitle}>
          Débloquez toutes les fonctionnalités premium
        </Text>
      </View>

      {/* Statut actuel */}
      {currentStats.isPremium && (
        <View style={styles.currentStatus}>
          <Text style={styles.statusText}>
            ✅ Vous êtes {currentStats.planName}
          </Text>
          {currentStats.daysUntilExpiration !== null && (
            <Text style={styles.expirationText}>
              {currentStats.isExpired 
                ? 'Expiré' 
                : `${currentStats.daysUntilExpiration} jours restants`
              }
            </Text>
          )}
          {currentStats.daysUntilExpiration !== null && !currentStats.isExpired && (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancel}
              disabled={isProcessing}
            >
              <Text style={styles.cancelButtonText}>Annuler</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Plans */}
      <ScrollView 
        style={styles.plansContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.plansGrid}>
          {allPlans.map(plan => renderPlanCard(plan))}
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          🔒 Paiement sécurisé via Stripe
        </Text>
        <Text style={styles.footerSubtext}>
          Annulation à tout moment
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    padding: 20,
    paddingTop: 40,
    paddingBottom: 15,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  currentStatus: {
    backgroundColor: '#E8F5E8',
    padding: 15,
    marginHorizontal: 20,
    marginVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  statusText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 5,
  },
  expirationText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 10,
  },
  cancelButton: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  cancelButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  plansContainer: {
    flex: 1,
    padding: 20,
  },
  plansGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  planCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    marginBottom: 15,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
    overflow: 'hidden',
  },
  planCardSelected: {
    transform: [{ scale: 1.02 }],
    shadowOpacity: 0.2,
    elevation: 6,
  },
  planCardCurrent: {
    backgroundColor: '#F0F8FF',
  },
  planHeader: {
    padding: 15,
    alignItems: 'center',
    position: 'relative',
  },
  planName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  currentBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  currentBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  priceContainer: {
    padding: 15,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  price: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  duration: {
    fontSize: 14,
    color: '#666',
  },
  featuresContainer: {
    padding: 15,
  },
  featureItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  featureName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    flex: 1,
  },
  featureValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#666',
  },
  subscribeButton: {
    padding: 15,
    alignItems: 'center',
    borderRadius: 0,
  },
  currentPlanButton: {
    backgroundColor: '#E0E0E0',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  subscribeButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  footer: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
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
  loadingText: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    marginTop: 50,
  },
});

export default PremiumScreen;
