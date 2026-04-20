import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Image,
  Alert,
  ActivityIndicator,
  ScrollView
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

const { width, height } = Dimensions.get('window');

const ExerciseScreen = ({ route, student }) => {
  const navigation = useNavigation();
  const { skill, difficulty } = route.params || {};
  
  const [exercise, setExercise] = useState(null);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [streak, setStreak] = useState(0);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(50));

  useEffect(() => {
    loadExercise();
  }, [skill, difficulty]);

  useEffect(() => {
    if (exercise) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true
        })
      ]).start();
    }
  }, [exercise]);

  const loadExercise = async () => {
    try {
      setLoading(true);
      // Simulate API call to get exercise
      const mockExercise = {
        exercise_id: 'ex_123',
        question: 'Combien font 7 + 5 ?',
        skill: 'addition',
        difficulty: difficulty || 'medium',
        options: ['10', '11', '12', '13'],
        correct_answer: '12',
        explanation: '7 + 5 = 12. Tu peux compter sur tes doigts: 7, 8, 9, 10, 11, 12!',
        hints: [
          'Commence par 7 et ajoute 5',
          'Essaie de compter sur tes doigts',
          '7 + 3 = 10, puis il reste 2 à ajouter'
        ],
        xp_value: 15,
        coin_value: 8,
        time_limit: 60
      };
      
      setTimeout(() => {
        setExercise(mockExercise);
        setLoading(false);
      }, 1000);
    } catch (error) {
      console.error('Error loading exercise:', error);
      setLoading(false);
    }
  };

  const handleAnswer = (answer) => {
    if (showResult) return;
    
    setSelectedAnswer(answer);
    const correct = answer === exercise.correct_answer;
    setIsCorrect(correct);
    setShowResult(true);
    
    if (correct) {
      setStreak(streak + 1);
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 0.8,
          duration: 200,
          useNativeDriver: true
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true
        })
      ]).start();
    } else {
      setStreak(0);
    }

    // Update progress
    setProgress(Math.min(progress + 10, 100));
  };

  const handleNext = () => {
    if (isCorrect) {
      // Load next exercise
      setSelectedAnswer(null);
      setShowResult(false);
      loadExercise();
    } else {
      // Try again or show hint
      setSelectedAnswer(null);
      setShowResult(false);
    }
  };

  const handleHint = () => {
    const hint = exercise.hints[Math.floor(Math.random() * exercise.hints.length)];
    Alert.alert('Indice', hint);
  };

  const renderLoading = () => (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#667EEA" />
      <Text style={styles.loadingText}>Préparation de l'exercice...</Text>
    </View>
  );

  const renderExercise = () => (
    <Animated.View style={[
      styles.exerciseContainer,
      {
        opacity: fadeAnim,
        transform: [{ translateY: slideAnim }]
      }
    ]}>
      {/* Header */}
      <View style={styles.header}>
        <LinearGradient
          colors={['#667EEA', '#764BA2']}
          style={styles.headerGradient}
        >
          <View style={styles.headerContent}>
            <View style={styles.headerTop}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => navigation.goBack()}
              >
                <Ionicons name="arrow-back" size={24} color="white" />
              </TouchableOpacity>
              <View style={styles.progressContainer}>
                <Text style={styles.progressText}>Progression</Text>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${progress}%` }]} />
                </View>
              </View>
            </View>
            
            <View style={styles.skillInfo}>
              <Text style={styles.skillName}>{exercise.skill}</Text>
              <View style={styles.difficultyBadge}>
                <Text style={styles.difficultyText}>
                  {exercise.difficulty === 'easy' ? 'Facile' : 
                   exercise.difficulty === 'medium' ? 'Moyen' : 'Difficile'}
                </Text>
              </View>
              <View style={styles.streakBadge}>
                <Ionicons name="flame" size={16} color="#FF6B6B" />
                <Text style={styles.streakText}>{streak}</Text>
              </View>
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* Question */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.questionContainer}>
          <View style={styles.questionHeader}>
            <Ionicons name="help-circle" size={24} color="#667EEA" />
            <Text style={styles.questionTitle}>Question</Text>
          </View>
          <Text style={styles.questionText}>{exercise.question}</Text>
          
          {exercise.media_url && (
            <Image
              source={{ uri: exercise.media_url }}
              style={styles.questionImage}
              resizeMode="contain"
            />
          )}
        </View>

        {/* Options */}
        <View style={styles.optionsContainer}>
          <Text style={styles.optionsTitle}>Choisis ta réponse:</Text>
          {exercise.options.map((option, index) => {
            const isSelected = selectedAnswer === option;
            const isCorrectOption = option === exercise.correct_answer;
            const showCorrect = showResult && isCorrectOption;
            const showWrong = showResult && isSelected && !isCorrectOption;
            
            return (
              <TouchableOpacity
                key={index}
                style={[
                  styles.optionButton,
                  isSelected && styles.selectedOption,
                  showCorrect && styles.correctOption,
                  showWrong && styles.wrongOption
                ]}
                onPress={() => handleAnswer(option)}
                disabled={showResult}
              >
                <View style={styles.optionContent}>
                  <View style={[
                    styles.optionRadio,
                    isSelected && styles.selectedRadio,
                    showCorrect && styles.correctRadio,
                    showWrong && styles.wrongRadio
                  ]}>
                    {isSelected && (
                      <Ionicons
                        name={isCorrect ? "checkmark" : "close"}
                        size={16}
                        color="white"
                      />
                    )}
                    {showCorrect && !isSelected && (
                      <Ionicons name="checkmark" size={16} color="white" />
                    )}
                  </View>
                  <Text style={[
                    styles.optionText,
                    isSelected && styles.selectedOptionText,
                    showCorrect && styles.correctOptionText,
                    showWrong && styles.wrongOptionText
                  ]}>
                    {option}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Result */}
        {showResult && (
          <Animated.View style={styles.resultContainer}>
            <LinearGradient
              colors={isCorrect ? ['#4ECDC4', '#44A08D'] : ['#FF6B6B', '#FF8E53']}
              style={styles.resultGradient}
            >
              <View style={styles.resultContent}>
                <Ionicons
                  name={isCorrect ? "checkmark-circle" : "close-circle"}
                  size={40}
                  color="white"
                />
                <Text style={styles.resultTitle}>
                  {isCorrect ? 'Bravo!' : 'Essaie encore!'}
                </Text>
                <Text style={styles.resultMessage}>
                  {isCorrect 
                    ? `Tu as gagné ${exercise.xp_value} XP et ${exercise.coin_value} pièces!`
                    : 'La bonne réponse est en verte. Réfléchis encore!'}
                </Text>
                
                {!isCorrect && (
                  <TouchableOpacity style={styles.hintButton} onPress={handleHint}>
                    <Ionicons name="bulb" size={20} color="#667EEA" />
                    <Text style={styles.hintButtonText}>Besoin d'un indice?</Text>
                  </TouchableOpacity>
                )}
                
                <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
                  <Text style={styles.nextButtonText}>
                    {isCorrect ? 'Exercice suivant' : 'Réessayer'}
                  </Text>
                  <Ionicons name="arrow-forward" size={20} color="white" />
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </Animated.View>
        )}

        {/* Explanation */}
        {showResult && isCorrect && (
          <View style={styles.explanationContainer}>
            <Text style={styles.explanationTitle}>Explication</Text>
            <Text style={styles.explanationText}>{exercise.explanation}</Text>
          </View>
        )}
      </ScrollView>
    </Animated.View>
  );

  return (
    <View style={styles.container}>
      {loading ? renderLoading() : renderExercise()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  loadingText: {
    fontSize: 18,
    color: '#666',
    marginTop: 20
  },
  exerciseContainer: {
    flex: 1
  },
  header: {
    paddingTop: 50,
    paddingBottom: 20
  },
  headerGradient: {
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30
  },
  headerContent: {
    paddingHorizontal: 20
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  progressContainer: {
    flex: 1,
    marginLeft: 15
  },
  progressText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 5
  },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4ECDC4',
    borderRadius: 2
  },
  skillInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  skillName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    flex: 1
  },
  difficultyBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginRight: 10
  },
  difficultyText: {
    fontSize: 12,
    color: 'white',
    fontWeight: '600'
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12
  },
  streakText: {
    fontSize: 12,
    color: 'white',
    fontWeight: '600',
    marginLeft: 5
  },
  content: {
    flex: 1,
    paddingHorizontal: 20
  },
  questionContainer: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 25,
    marginTop: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15
  },
  questionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 10
  },
  questionText: {
    fontSize: 20,
    color: '#333',
    lineHeight: 30,
    textAlign: 'center'
  },
  questionImage: {
    width: '100%',
    height: 200,
    marginTop: 20,
    borderRadius: 10
  },
  optionsContainer: {
    marginTop: 30
  },
  optionsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20
  },
  optionButton: {
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 20,
    marginBottom: 15,
    borderWidth: 2,
    borderColor: '#E9ECEF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 3
  },
  selectedOption: {
    borderColor: '#667EEA',
    backgroundColor: '#F0F4FF'
  },
  correctOption: {
    borderColor: '#4ECDC4',
    backgroundColor: '#E8F8F7'
  },
  wrongOption: {
    borderColor: '#FF6B6B',
    backgroundColor: '#FFF5F5'
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  optionRadio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E9ECEF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15
  },
  selectedRadio: {
    borderColor: '#667EEA',
    backgroundColor: '#667EEA'
  },
  correctRadio: {
    borderColor: '#4ECDC4',
    backgroundColor: '#4ECDC4'
  },
  wrongRadio: {
    borderColor: '#FF6B6B',
    backgroundColor: '#FF6B6B'
  },
  optionText: {
    fontSize: 16,
    color: '#333',
    flex: 1
  },
  selectedOptionText: {
    fontWeight: '600'
  },
  correctOptionText: {
    fontWeight: '600',
    color: '#4ECDC4'
  },
  wrongOptionText: {
    fontWeight: '600',
    color: '#FF6B6B'
  },
  resultContainer: {
    marginTop: 30,
    borderRadius: 20,
    overflow: 'hidden'
  },
  resultGradient: {
    padding: 25
  },
  resultContent: {
    alignItems: 'center'
  },
  resultTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 10,
    marginBottom: 10
  },
  resultMessage: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    marginBottom: 20
  },
  hintButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    marginBottom: 15
  },
  hintButtonText: {
    fontSize: 14,
    color: '#667EEA',
    fontWeight: '600',
    marginLeft: 8
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 25,
    paddingVertical: 12,
    borderRadius: 20
  },
  nextButtonText: {
    fontSize: 16,
    color: 'white',
    fontWeight: '600',
    marginRight: 10
  },
  explanationContainer: {
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 20,
    marginTop: 20,
    marginBottom: 20
  },
  explanationTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10
  },
  explanationText: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24
  }
});

export default ExerciseScreen;
