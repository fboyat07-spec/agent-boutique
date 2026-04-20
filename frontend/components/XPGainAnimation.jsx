import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

const XPGainAnimation = ({ 
  xp = 0, 
  visible = true, 
  onAnimationEnd = () => {} 
}) => {
  const [animValue] = useState(new Animated.Value(0));
  const [fadeValue] = useState(new Animated.Value(0));
  const [isVisible, setIsVisible] = useState(visible);

  useEffect(() => {
    if (visible && !isVisible) {
      setIsVisible(true);
      
      // Animation de montée + fade in
      Animated.parallel([
        Animated.timing(animValue, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(fadeValue, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        })
      ]).start(() => {
        // Disparition après 2 secondes
        setTimeout(() => {
          Animated.parallel([
            Animated.timing(animValue, {
              toValue: 0,
              duration: 300,
              useNativeDriver: true,
            }),
            Animated.timing(fadeValue, {
              toValue: 0,
              duration: 300,
              useNativeDriver: true,
            })
          ]).start(() => {
            setIsVisible(false);
            onAnimationEnd();
          });
        }, 2000);
      });
    } else if (!visible) {
      setIsVisible(false);
    }
  }, [visible, isVisible]);

  if (!isVisible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [
            {
              translateY: animValue.interpolate({
                inputRange: [0, 1],
                outputRange: [50, -20]
              })
            }
          ],
          opacity: fadeValue
        }
      ]}
    >
      <Text style={styles.xpText}>+{xp} XP</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 100,
    right: 20,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
    zIndex: 1000,
  },
  xpText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
});

export default XPGainAnimation;
