import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import TypingAnimation from './TypingAnimation';
import AIResponseActions from './AIResponseActions';

const ChatBubble = ({ 
  message, 
  isUser = false, 
  isTyping = false,
  isLoading = false,
  onTypingComplete,
  onPress,
  showActions = false,
  onContinue,
  onUnderstood,
  onMoreQuestions
}) => {
  if (isLoading) {
    return (
      <View style={[styles.container, styles.aiContainer]}>
        <TypingLoader />
      </View>
    );
  }

  if (isTyping) {
    return (
      <View style={[styles.container, styles.aiContainer]}>
        <TypingAnimation
          text={message}
          typingSpeed={30}
          showCursor={true}
          onComplete={onTypingComplete}
          textStyle={styles.aiText}
        />
      </View>
    );
  }

  return (
    <View style={[
      styles.container, 
      isUser ? styles.userContainer : styles.aiContainer
    ]}>
      <TouchableOpacity 
        style={styles.bubbleContainer}
        onPress={onPress}
        disabled={!onPress}
      >
        {isUser ? (
          <View style={styles.userBubble}>
            <Text style={styles.userText}>{message}</Text>
          </View>
        ) : (
          <LinearGradient
            colors={['#007AFF', '#5AC8FA']}
            style={styles.aiBubble}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={styles.aiText}>{message}</Text>
          </LinearGradient>
        )}
      </TouchableOpacity>
      
      {/* Boutons d'action pour les messages IA */}
      {!isUser && !isTyping && showActions && (
        <AIResponseActions
          onContinue={onContinue}
          onUnderstood={onUnderstood}
          onMoreQuestions={onMoreQuestions}
          disabled={isTyping}
        />
      )}
    </View>
  );
};

const TypingLoader = () => {
  return (
    <View style={styles.typingContainer}>
      <View style={styles.typingIndicator}>
        <View style={[styles.typingDot, { backgroundColor: '#007AFF' }]} />
        <View style={[styles.typingDot, { backgroundColor: '#007AFF' }]} />
        <View style={[styles.typingDot, { backgroundColor: '#007AFF' }]} />
      </View>
      <Text style={styles.typingText}>KIDO réfléchit...</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    maxWidth: '85%',
  },
  userContainer: {
    alignSelf: 'flex-end',
    marginLeft: '15%',
  },
  aiContainer: {
    alignSelf: 'flex-start',
    marginRight: '15%',
  },
  userBubble: {
    backgroundColor: '#E5E5EA',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  userText: {
    fontSize: 16,
    lineHeight: 22,
    color: '#000',
    fontFamily: 'System',
  },
  aiText: {
    fontSize: 16,
    lineHeight: 22,
    color: '#FFFFFF',
    fontFamily: 'System',
  },
  bubbleContainer: {
    marginBottom: 8,
  },
  typingContainer: {
    padding: 12,
    alignItems: 'center',
    backgroundColor: '#F8F8F8',
    borderRadius: 20,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 2,
  },
  typingText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
});

export default ChatBubble;
