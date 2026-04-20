import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

const LevelBadge = ({ 
  level = 1, 
  levelName = 'Débutant',
  animated = false,
  style = {} 
}) => {
  // Couleur dynamique selon le niveau
  const getColorByLevel = (level) => {
    if (level <= 2) return '#4CAF50';  // Vert
    if (level <= 5) return '#2196F3';  // Bleu
    return '#9C27B0';  // Violet
  };

  // Animation si demandée
  const AnimatedView = animated ? Animated.View : View;
  const AnimatedText = animated ? Animated.Text : Text;

  return (
    <AnimatedView 
      style={[
        styles.levelBadge, 
        { backgroundColor: getColorByLevel(level) },
        style
      ]}
    >
      <AnimatedText style={styles.levelText}>
        Niveau {level}
      </AnimatedText>
      <Text style={styles.levelName}>{levelName}</Text>
    </AnimatedView>
  );
};

const styles = StyleSheet.create({
  levelBadge: {
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    alignItems: 'center',
  },
  levelText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  levelName: {
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 4,
  },
});

export default LevelBadge;
