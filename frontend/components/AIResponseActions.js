import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const AIResponseActions = ({ 
  onContinue, 
  onUnderstood, 
  onMoreQuestions,
  disabled = false,
  style 
}) => {
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    // Animation d'apparition
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, []);

  const handlePress = (callback) => {
    if (!disabled && callback) {
      // Animation de pression
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 0.8,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
      ]).start();
      
      callback();
    }
  };

  const ActionButton = ({ title, onPress, gradient, icon }) => (
    <TouchableOpacity
      style={[styles.actionButton, disabled && styles.disabledButton]}
      onPress={() => handlePress(onPress)}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={gradient}
        style={styles.buttonGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Text style={styles.buttonIcon}>{icon}</Text>
        <Text style={styles.buttonText}>{title}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );

  return (
    <Animated.View style={[styles.container, style, { opacity: fadeAnim }]}>
      <ActionButton
        title="Continuer"
        onPress={onContinue}
        gradient={['#007AFF', '#5AC8FA']}
        icon="▶️"
      />
      
      <ActionButton
        title="J'ai compris"
        onPress={onUnderstood}
        gradient={['#34C759', '#30D158']}
        icon="✅"
      />
      
      <ActionButton
        title="Encore une question"
        onPress={onMoreQuestions}
        gradient={['#FF9500', '#FF6B00']}
        icon="❓"
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 12,
    paddingHorizontal: 8,
  },
  actionButton: {
    flex: 1,
    marginHorizontal: 4,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  disabledButton: {
    opacity: 0.5,
  },
  buttonGradient: {
    flexDirection: 'column',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    minHeight: 65,
    justifyContent: 'center',
  },
  buttonIcon: {
    fontSize: 18,
    marginBottom: 4,
  },
  buttonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 16,
  },
});

export default AIResponseActions;
