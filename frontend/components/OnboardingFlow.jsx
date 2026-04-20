import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  TextInput, 
  ScrollView, 
  Animated, 
  Dimensions,
  Alert
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import useOnboarding from '../hooks/useOnboarding';

const { width, height } = Dimensions.get('window');

const OnboardingFlow = ({ userId, onComplete }) => {
  const {
    currentStep,
    isCompleted,
    loading,
    error,
    progressPercentage,
    onboardingData,
    steps,
    avatars,
    objectives,
    nextStep,
    previousStep,
    goToStep,
    savePseudo,
    saveAvatar,
    saveObjective,
    completeFirstMission,
    completeOnboarding,
    getCurrentStep,
    startOnboarding
  } = useOnboarding(userId);

  const [localPseudo, setLocalPseudo] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(null);
  const [selectedObjective, setSelectedObjective] = useState(null);
  const [slideAnimation] = useState(new Animated.Value(0));

  // Animation de slide
  useEffect(() => {
    Animated.timing(slideAnimation, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true
    }).start();
  }, [currentStep, slideAnimation]);

  // Démarrer l'onboarding
  useEffect(() => {
    if (!onboardingData.startTime) {
      startOnboarding();
    }
  }, [onboardingData.startTime, startOnboarding]);

  const currentStepData = getCurrentStep();

  // Rendre le contenu de l'étape actuelle
  const renderStepContent = () => {
    switch (currentStepData.id) {
      case 'welcome':
        return <WelcomeStep onNext={nextStep} />;
      
      case 'pseudo':
        return (
          <PseudoStep
            pseudo={localPseudo}
            setPseudo={setLocalPseudo}
            savedPseudo={onboardingData.pseudo}
            onSave={savePseudo}
            onNext={nextStep}
            onPrevious={previousStep}
          />
        );
      
      case 'avatar':
        return (
          <AvatarStep
            avatars={avatars}
            selectedAvatar={selectedAvatar}
            setSelectedAvatar={setSelectedAvatar}
            savedAvatar={onboardingData.avatar}
            onSave={saveAvatar}
            onNext={nextStep}
            onPrevious={previousStep}
          />
        );
      
      case 'objective':
        return (
          <ObjectiveStep
            objectives={objectives}
            selectedObjective={selectedObjective}
            setSelectedObjective={setSelectedObjective}
            savedObjective={onboardingData.objective}
            onSave={saveObjective}
            onNext={nextStep}
            onPrevious={previousStep}
          />
        );
      
      case 'firstMission':
        return (
          <FirstMissionStep
            onComplete={completeFirstMission}
            onNext={nextStep}
            onPrevious={previousStep}
          />
        );
      
      case 'completion':
        return (
          <CompletionStep
            onboardingData={onboardingData}
            onComplete={completeOnboarding}
            loading={loading}
            error={error}
            onFinish={onComplete}
          />
        );
      
      default:
        return null;
    }
  };

  if (isCompleted) {
    return null; // L'onboarding est terminé
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.gradient}
      />
      
      {/* Header avec progression */}
      <View style={styles.header}>
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View 
              style={[
                styles.progressFill,
                { width: `${progressPercentage}%` }
              ]} 
            />
          </View>
          <Text style={styles.progressText}>
            Étape {currentStep + 1} / {steps.length}
          </Text>
        </View>
      </View>

      {/* Contenu de l'étape */}
      <Animated.View
        style={[
          styles.content,
          {
            transform: [{
              translateX: slideAnimation.interpolate({
                inputRange: [0, 1],
                outputRange: [width, 0]
              })
            }]
          }
        ]}
      >
        <View style={styles.stepHeader}>
          <Text style={styles.stepTitle}>{currentStepData.title}</Text>
          <Text style={styles.stepDescription}>{currentStepData.description}</Text>
        </View>

        {renderStepContent()}
      </Animated.View>

      {/* Navigation dots */}
      <View style={styles.dotsContainer}>
        {steps.map((_, index) => (
          <TouchableOpacity
            key={index}
            style={[
              styles.dot,
              index === currentStep && styles.activeDot
            ]}
            onPress={() => goToStep(index)}
          />
        ))}
      </View>

      {/* Boutons de navigation */}
      <View style={styles.navigation}>
        {currentStep > 0 && (
          <TouchableOpacity
            style={[styles.navButton, styles.previousButton]}
            onPress={previousStep}
          >
            <Text style={styles.previousButtonText}>Précédent</Text>
          </TouchableOpacity>
        )}
        
        {currentStep < steps.length - 1 && (
          <TouchableOpacity
            style={[styles.navButton, styles.nextButton]}
            onPress={nextStep}
          >
            <Text style={styles.nextButtonText}>Suivant</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

// Composants d'étape
const WelcomeStep = ({ onNext }) => (
  <View style={styles.welcomeContainer}>
    <Text style={styles.welcomeEmoji}>🎉</Text>
    <Text style={styles.welcomeTitle}>Bienvenue dans KidAI !</Text>
    <Text style={styles.welcomeText}>
      Je suis ton assistant IA personnel. Ensemble, nous allons :
    </Text>
    <View style={styles.featuresList}>
      <Text style={styles.featureItem}>🎯 Atteindre tes objectifs</Text>
      <Text style={styles.featureItem}>🎮 Apprendre en s'amusant</Text>
      <Text style={styles.featureItem}>🏆 Débloquer des récompenses</Text>
      <Text style={styles.featureItem}>📈 Suivre ta progression</Text>
    </View>
    <TouchableOpacity style={styles.welcomeButton} onPress={onNext}>
      <Text style={styles.welcomeButtonText}>Commencer l'aventure !</Text>
    </TouchableOpacity>
  </View>
);

const PseudoStep = ({ pseudo, setPseudo, savedPseudo, onSave, onNext, onPrevious }) => {
  const [isValid, setIsValid] = useState(false);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (savedPseudo) {
      setPseudo(savedPseudo);
      setIsValid(true);
    }
  }, [savedPseudo, setPseudo]);

  const validatePseudo = (text) => {
    setPseudo(text);
    
    if (text.length < 2) {
      setIsValid(false);
      setLocalError('Le pseudo doit contenir au moins 2 caractères');
    } else if (text.length > 20) {
      setIsValid(false);
      setLocalError('Le pseudo ne peut pas dépasser 20 caractères');
    } else {
      setIsValid(true);
      setLocalError('');
    }
  };

  const handleSave = async () => {
    if (isValid) {
      const success = await onSave(pseudo);
      if (success) {
        onNext();
      }
    }
  };

  return (
    <View style={styles.pseudoContainer}>
      <Text style={styles.inputLabel}>Choisis ton pseudo</Text>
      <TextInput
        style={[
          styles.pseudoInput,
          !isValid && pseudo.length > 0 && styles.errorInput
        ]}
        value={pseudo}
        onChangeText={validatePseudo}
        placeholder="Entre ton pseudo..."
        placeholderTextColor="#999"
        maxLength={20}
        autoCapitalize="words"
        autoCorrect={false}
      />
      {localError ? <Text style={styles.errorText}>{localError}</Text> : null}
      
      <TouchableOpacity
        style={[
          styles.saveButton,
          !isValid && styles.disabledButton
        ]}
        onPress={handleSave}
        disabled={!isValid}
      >
        <Text style={styles.saveButtonText}>Continuer</Text>
      </TouchableOpacity>
    </View>
  );
};

const AvatarStep = ({ avatars, selectedAvatar, setSelectedAvatar, savedAvatar, onSave, onNext, onPrevious }) => {
  const handleSelect = (avatar) => {
    setSelectedAvatar(avatar);
  };

  const handleSave = async () => {
    if (selectedAvatar) {
      const success = await onSave(selectedAvatar);
      if (success) {
        onNext();
      }
    }
  };

  useEffect(() => {
    if (savedAvatar) {
      setSelectedAvatar(savedAvatar);
    }
  }, [savedAvatar, setSelectedAvatar]);

  return (
    <View style={styles.avatarContainer}>
      <Text style={styles.avatarTitle}>Choisis ton avatar</Text>
      <Text style={styles.avatarSubtitle}>Il représentera ton profil dans KidAI</Text>
      
      <ScrollView style={styles.avatarsList}>
        <View style={styles.avatarsGrid}>
          {avatars.map((avatar) => (
            <TouchableOpacity
              key={avatar.id}
              style={[
                styles.avatarCard,
                selectedAvatar?.id === avatar.id && styles.selectedAvatarCard,
                { borderColor: avatar.color }
              ]}
              onPress={() => handleSelect(avatar)}
            >
              <Text style={styles.avatarEmoji}>{avatar.emoji}</Text>
              <Text style={styles.avatarName}>{avatar.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
      
      <TouchableOpacity
        style={[
          styles.saveButton,
          !selectedAvatar && styles.disabledButton
        ]}
        onPress={handleSave}
        disabled={!selectedAvatar}
      >
        <Text style={styles.saveButtonText}>Continuer</Text>
      </TouchableOpacity>
    </View>
  );
};

const ObjectiveStep = ({ objectives, selectedObjective, setSelectedObjective, savedObjective, onSave, onNext, onPrevious }) => {
  const handleSelect = (objective) => {
    setSelectedObjective(objective);
  };

  const handleSave = async () => {
    if (selectedObjective) {
      const success = await onSave(selectedObjective);
      if (success) {
        onNext();
      }
    }
  };

  useEffect(() => {
    if (savedObjective) {
      setSelectedObjective(savedObjective);
    }
  }, [savedObjective, setSelectedObjective]);

  return (
    <View style={styles.objectiveContainer}>
      <Text style={styles.objectiveTitle}>Quel est ton objectif ?</Text>
      <Text style={styles.objectiveSubtitle}>Je vais adapter ton expérience selon tes besoins</Text>
      
      <View style={styles.objectivesList}>
        {objectives.map((objective) => (
          <TouchableOpacity
            key={objective.id}
            style={[
              styles.objectiveCard,
              selectedObjective?.id === objective.id && styles.selectedObjectiveCard
            ]}
            onPress={() => handleSelect(objective)}
          >
            <View style={styles.objectiveHeader}>
              <Text style={styles.objectiveEmoji}>{objective.emoji}</Text>
              <View style={styles.objectiveInfo}>
                <Text style={styles.objectiveCardTitle}>{objective.title}</Text>
                <Text style={styles.objectiveCardDescription}>{objective.description}</Text>
              </View>
            </View>
            
            <View style={styles.objectiveFeatures}>
              {objective.features.map((feature, index) => (
                <Text key={index} style={styles.featureText}>• {feature}</Text>
              ))}
            </View>
            
            <View style={styles.xpBonus}>
              <Text style={styles.xpBonusText}>+{objective.xpBonus} XP bonus</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
      
      <TouchableOpacity
        style={[
          styles.saveButton,
          !selectedObjective && styles.disabledButton
        ]}
        onPress={handleSave}
        disabled={!selectedObjective}
      >
        <Text style={styles.saveButtonText}>Continuer</Text>
      </TouchableOpacity>
    </View>
  );
};

const FirstMissionStep = ({ onComplete, onNext, onPrevious }) => {
  const [missionCompleted, setMissionCompleted] = useState(false);

  const handleComplete = async () => {
    const success = await onComplete();
    if (success) {
      setMissionCompleted(true);
      setTimeout(() => onNext(), 1000);
    }
  };

  return (
    <View style={styles.missionContainer}>
      <Text style={styles.missionTitle}>Ta première mission !</Text>
      
      <View style={styles.missionCard}>
        <Text style={styles.missionCardTitle}>🎯 Bienvenue dans KidAI</Text>
        <Text style={styles.missionCardDescription}>
          Découvre les bases de l'application et commence ton apprentissage
        </Text>
        
        <View style={styles.missionReward}>
          <Text style={styles.missionRewardText}>🏆 Récompense: +25 XP</Text>
        </View>
      </View>
      
      <TouchableOpacity
        style={[
          styles.missionButton,
          missionCompleted && styles.completedMissionButton
        ]}
        onPress={handleComplete}
        disabled={missionCompleted}
      >
        <Text style={styles.missionButtonText}>
          {missionCompleted ? '✅ Mission complétée !' : 'Compléter la mission'}
        </Text>
      </TouchableOpacity>
      
      {missionCompleted && (
        <Text style={styles.missionCompletedText}>
          Excellent ! Tu es prêt pour la suite !
        </Text>
      )}
    </View>
  );
};

const CompletionStep = ({ onboardingData, onComplete, loading, error, onFinish }) => {
  const handleComplete = async () => {
    const result = await onComplete();
    
    if (result.success) {
      Alert.alert(
        '🎉 Félicitations !',
        `Tu as gagné ${result.xpAwarded} XP !${result.leveledUp ? '\n\n🎉 LEVEL UP !' : ''}`,
        [{ text: 'Super !', onPress: () => onFinish(result) }]
      );
    } else {
      Alert.alert('❌ Erreur', error || 'Une erreur est survenue');
    }
  };

  return (
    <View style={styles.completionContainer}>
      <Text style={styles.completionEmoji}>🎉</Text>
      <Text style={styles.completionTitle}>Félicitations !</Text>
      <Text style={styles.completionText}>
        Tu as terminé l'onboarding ! Voici ton profil :
      </Text>
      
      <View style={styles.profileSummary}>
        <View style={styles.profileItem}>
          <Text style={styles.profileLabel}>Pseudo:</Text>
          <Text style={styles.profileValue}>{onboardingData.pseudo}</Text>
        </View>
        
        <View style={styles.profileItem}>
          <Text style={styles.profileLabel}>Avatar:</Text>
          <Text style={styles.profileValue}>
            {onboardingData.avatar?.emoji} {onboardingData.avatar?.name}
          </Text>
        </View>
        
        <View style={styles.profileItem}>
          <Text style={styles.profileLabel}>Objectif:</Text>
          <Text style={styles.profileValue}>{onboardingData.objective?.title}</Text>
        </View>
      </View>
      
      <View style={styles.rewardsSummary}>
        <Text style={styles.rewardsTitle}>🎁 Récompenses de bienvenue :</Text>
        <Text style={styles.rewardItem}>• 50 XP de bienvenue</Text>
        <Text style={styles.rewardItem}>• +{onboardingData.objective?.xpBonus || 0} XP bonus objectif</Text>
        <Text style={styles.rewardTotal}>
          Total: +{50 + (onboardingData.objective?.xpBonus || 0)} XP
        </Text>
      </View>
      
      <TouchableOpacity
        style={[styles.completionButton, loading && styles.loadingButton]}
        onPress={handleComplete}
        disabled={loading}
      >
        <Text style={styles.completionButtonText}>
          {loading ? 'Chargement...' : 'Commencer l\'aventure !'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 300,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  progressContainer: {
    alignItems: 'center',
  },
  progressBar: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  progressText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    marginTop: 20,
  },
  stepHeader: {
    alignItems: 'center',
    marginBottom: 30,
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  stepDescription: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ddd',
    marginHorizontal: 4,
  },
  activeDot: {
    backgroundColor: '#667eea',
    width: 24,
  },
  navigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  navButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  previousButton: {
    backgroundColor: '#f0f0f0',
  },
  nextButton: {
    backgroundColor: '#667eea',
  },
  previousButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  
  // Welcome step
  welcomeContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeEmoji: {
    fontSize: 80,
    marginBottom: 20,
  },
  welcomeTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 20,
  },
  welcomeText: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 26,
  },
  featuresList: {
    alignSelf: 'stretch',
    marginBottom: 40,
  },
  featureItem: {
    fontSize: 16,
    color: '#333',
    marginBottom: 12,
    lineHeight: 24,
  },
  welcomeButton: {
    backgroundColor: '#667eea',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  welcomeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  
  // Pseudo step
  pseudoContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  inputLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  pseudoInput: {
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    marginBottom: 8,
  },
  errorInput: {
    borderColor: '#ff4444',
  },
  errorText: {
    color: '#ff4444',
    fontSize: 14,
    marginBottom: 20,
  },
  saveButton: {
    backgroundColor: '#667eea',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  
  // Avatar step
  avatarContainer: {
    flex: 1,
  },
  avatarTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  avatarSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  avatarsList: {
    flex: 1,
  },
  avatarsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  avatarCard: {
    width: '48%',
    borderWidth: 3,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  selectedAvatarCard: {
    backgroundColor: '#f0f4ff',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  avatarEmoji: {
    fontSize: 40,
    marginBottom: 8,
  },
  avatarName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  
  // Objective step
  objectiveContainer: {
    flex: 1,
  },
  objectiveTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  objectiveSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  objectivesList: {
    flex: 1,
  },
  objectiveCard: {
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  selectedObjectiveCard: {
    borderColor: '#667eea',
    backgroundColor: '#f0f4ff',
  },
  objectiveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  objectiveEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  objectiveInfo: {
    flex: 1,
  },
  objectiveCardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  objectiveCardDescription: {
    fontSize: 14,
    color: '#666',
  },
  objectiveFeatures: {
    marginBottom: 12,
  },
  featureText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  xpBonus: {
    backgroundColor: '#4CAF50',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  xpBonusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  
  // Mission step
  missionContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  missionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 20,
  },
  missionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#667eea',
  },
  missionCardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  missionCardDescription: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
  },
  missionReward: {
    backgroundColor: '#4CAF50',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 12,
  },
  missionRewardText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  missionButton: {
    backgroundColor: '#667eea',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
  },
  completedMissionButton: {
    backgroundColor: '#4CAF50',
  },
  missionButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  missionCompletedText: {
    fontSize: 16,
    color: '#4CAF50',
    textAlign: 'center',
    marginTop: 12,
  },
  
  // Completion step
  completionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completionEmoji: {
    fontSize: 80,
    marginBottom: 20,
  },
  completionTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 20,
  },
  completionText: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 26,
  },
  profileSummary: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 20,
    marginBottom: 30,
    alignSelf: 'stretch',
  },
  profileItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  profileLabel: {
    fontSize: 16,
    color: '#666',
  },
  profileValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  rewardsSummary: {
    backgroundColor: '#fff3cd',
    borderRadius: 12,
    padding: 20,
    marginBottom: 30,
    alignSelf: 'stretch',
  },
  rewardsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#856404',
    marginBottom: 12,
  },
  rewardItem: {
    fontSize: 16,
    color: '#856404',
    marginBottom: 4,
  },
  rewardTotal: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#856404',
    marginTop: 8,
  },
  completionButton: {
    backgroundColor: '#667eea',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  loadingButton: {
    backgroundColor: '#ccc',
  },
  completionButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default OnboardingFlow;
