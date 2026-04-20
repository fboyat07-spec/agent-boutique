import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const TypingAnimation = ({ 
  text, 
  typingSpeed = 50, 
  showCursor = true, 
  isLoading = false,
  onComplete,
  style,
  textStyle 
}) => {
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showLoader, setShowLoader] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const typingTimeout = useRef();
  const loaderTimeout = useRef();

  useEffect(() => {
    // Reset state when text changes
    setDisplayedText('');
    setIsTyping(false);
    setShowLoader(true);
    
    // Clear existing timeouts
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    if (loaderTimeout.current) clearTimeout(loaderTimeout.current);
    
    // Show loader for minimum time
    loaderTimeout.current = setTimeout(() => {
      setShowLoader(false);
      startTyping();
    }, 800 + Math.random() * 700); // Random delay between 800-1500ms
    
    return () => {
      if (typingTimeout.current) clearTimeout(typingTimeout.current);
      if (loaderTimeout.current) clearTimeout(loaderTimeout.current);
    };
  }, [text]);

  const startTyping = () => {
    if (!text) return;
    
    setIsTyping(true);
    let currentIndex = 0;
    
    // Fade in animation
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    const typeNextChar = () => {
      if (currentIndex < text.length) {
        setDisplayedText(text.substring(0, currentIndex + 1));
        currentIndex++;
        
        // Variable typing speed for natural effect
        const delay = typingSpeed + (Math.random() * 20 - 10);
        typingTimeout.current = setTimeout(typeNextChar, delay);
      } else {
        setIsTyping(false);
        if (onComplete) onComplete();
      }
    };

    typeNextChar();
  };

  if (isLoading || showLoader) {
    return <TypingLoader />;
  }

  return (
    <Animated.View style={[styles.container, style, { opacity: fadeAnim }]}>
      <Text style={[styles.text, textStyle]}>
        {displayedText}
        {showCursor && isTyping && (
          <Text style={styles.cursor}>|</Text>
        )}
      </Text>
    </Animated.View>
  );
};

const TypingLoader = () => {
  const dotAnim1 = useRef(new Animated.Value(0)).current;
  const dotAnim2 = useRef(new Animated.Value(0)).current;
  const dotAnim3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animateDots = () => {
      Animated.sequence([
        Animated.parallel([
          Animated.timing(dotAnim1, { toValue: 1, duration: 200, useNativeDriver: true }),
          Animated.timing(dotAnim2, { toValue: 1, duration: 200, delay: 100, useNativeDriver: true }),
          Animated.timing(dotAnim3, { toValue: 1, duration: 200, delay: 200, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(dotAnim1, { toValue: 0, duration: 200, useNativeDriver: true }),
          Animated.timing(dotAnim2, { toValue: 0, duration: 200, useNativeDriver: true }),
          Animated.timing(dotAnim3, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]),
      ]).start(() => animateDots());
    };

    animateDots();
  }, []);

  return (
    <View style={styles.loaderContainer}>
      <View style={styles.loaderDots}>
        <Animated.View 
          style={[
            styles.loaderDot, 
            { 
              opacity: dotAnim1,
              transform: [{ scale: dotAnim1.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.2]
              })}]
            }
          ]} 
        />
        <Animated.View 
          style={[
            styles.loaderDot, 
            { 
              opacity: dotAnim2,
              transform: [{ scale: dotAnim2.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.2]
              })}]
            }
          ]} 
        />
        <Animated.View 
          style={[
            styles.loaderDot, 
            { 
              opacity: dotAnim3,
              transform: [{ scale: dotAnim3.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.2]
              })}]
            }
          ]} 
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 12,
    borderRadius: 12,
    maxWidth: '85%',
  },
  text: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
    fontFamily: 'System',
  },
  cursor: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: 'bold',
    animation: 'blink 1s infinite',
  },
  loaderContainer: {
    padding: 12,
    alignItems: 'center',
  },
  loaderDots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#007AFF',
    marginHorizontal: 3,
  },
});

export default TypingAnimation;
