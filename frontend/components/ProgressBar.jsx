import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

const ProgressBar = ({ 
  percentage = 0, 
  currentLevel = 1, 
  height = 25, 
  showPercentage = true,
  customColor = null,
  style = {} 
}) => {
  const [progressAnim] = React.useState(new Animated.Value(0));

  React.useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: percentage / 100,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [percentage]);

  const getBarColor = (level) => {
    // Utiliser la couleur personnalisée si fournie
    if (customColor) return customColor;
    
    // Sinon, utiliser la couleur par défaut selon le niveau
    const colors = {
      1: '#4CAF50', // Vert
      2: '#4CAF50', // Vert
      3: '#2196F3', // Bleu
      4: '#2196F3', // Bleu
      5: '#2196F3', // Bleu
      6: '#9C27B0', // Violet
      7: '#9C27B0', // Violet
      8: '#9C27B0', // Violet
      9: '#9C27B0', // Violet
      10: '#9C27B0' // Violet
    };
    return colors[level] || colors[1];
  };

  return (
    <View style={[styles.container, style]}>
      <View style={[styles.progressBar, { height }]}>
        <Animated.View 
          style={[
            styles.progressFill,
            { 
              width: progressAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%']
              }),
              backgroundColor: getBarColor(currentLevel)
            }
          ]}
        />
        {showPercentage && (
          <Text style={styles.progressText}>
            {Math.round(progressAnim._value * 100)}%
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
  },
  progressBar: {
    height: 25,
    backgroundColor: '#E0E0E0',
    borderRadius: 12.5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 12.5,
  },
  progressText: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    textAlign: 'center',
    textAlignVertical: 'center',
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
});

export default ProgressBar;
