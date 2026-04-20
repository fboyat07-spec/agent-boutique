import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import OnboardingFlow from './OnboardingFlow';
import useOnboarding from '../hooks/useOnboarding';

const OnboardingManager = ({ userId, children }) => {
  const { isCompleted, loading, loadOnboardingProgress } = useOnboarding(userId);
  const [isReady, setIsReady] = useState(false);

  // Charger la progression au montage
  useEffect(() => {
    const loadProgress = async () => {
      await loadOnboardingProgress();
      setIsReady(true);
    };

    if (userId) {
      loadProgress();
    } else {
      setIsReady(true);
    }
  }, [userId, loadOnboardingProgress]);

  // Afficher un indicateur de chargement pendant la vérification
  if (!isReady || loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#667eea" />
      </View>
    );
  }

  // Si l'onboarding est terminé, afficher l'application
  if (isCompleted) {
    return children;
  }

  // Sinon, afficher l'onboarding
  return (
    <OnboardingFlow
      userId={userId}
      onComplete={(result) => {
        console.log('✅ Onboarding terminé:', result);
        // L'application va automatiquement re-render avec isCompleted = true
      }}
    />
  );
};

export default OnboardingManager;
