import React, { useState, useRef } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  FlatList, 
  StyleSheet, 
  KeyboardAvoidingView, 
  Platform,
  SafeAreaView 
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ChatBubble from '../components/ChatBubble';
import useChatAnimation from '../hooks/useChatAnimation';
import { chatWithAI } from '../services/api';

const ChatScreenExample = () => {
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef();
  const { 
    messages, 
    isTyping, 
    isLoading, 
    addUserMessage, 
    addAIResponse 
  } = useChatAnimation();

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;

    const userMessage = inputText.trim();
    setInputText('');
    
    // Add user message immediately
    addUserMessage(userMessage);
    
    // Scroll to bottom
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);

    try {
      // Get AI response
      const response = await chatWithAI(userMessage);
      const aiText = response.content || response.response || 'Je suis là pour t\'aider !';
      
      // Add AI response with typing animation and actions
      addAIResponse(aiText, () => {
        // Scroll to bottom when typing completes
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }, true);
      
    } catch (error) {
      console.error('Error getting AI response:', error);
      addAIResponse('Désolé, j\'ai eu un petit problème. Essayons encore !');
    }
  };

  const handleContinue = () => {
    addAIResponse("Super ! Continuons sur cette lancée. Quelle serait ta prochaine question ?");
  };

  const handleUnderstood = () => {
    addAIResponse("Génial ! Je suis content que tu aies compris. N'hésite pas si tu as d'autres questions !");
  };

  const handleMoreQuestions = () => {
    addAIResponse("Parfait ! J'adore ta curiosité. Vas-y, je suis prêt pour ta question !");
  };

  const renderMessage = ({ item }) => {
    return (
      <ChatBubble
        message={item.text}
        isUser={item.isUser}
        isTyping={item.isTyping}
        isLoading={item.isLoading}
        showActions={item.showActions}
        onTypingComplete={() => {
          // Optional: handle typing completion
          console.log('Typing completed for message:', item.id);
        }}
        onContinue={handleContinue}
        onUnderstood={handleUnderstood}
        onMoreQuestions={handleMoreQuestions}
      />
    );
  };

  const renderLoadingIndicator = () => {
    if (isLoading) {
      return (
        <ChatBubble
          message=""
          isLoading={true}
        />
      );
    }
    return null;
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Chat avec KIDO</Text>
          <Text style={styles.headerSubtitle}>Ton tuteur personnel 🤖</Text>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView 
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id.toString()}
          style={styles.messagesList}
          contentContainerStyle={styles.messagesContainer}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={renderLoadingIndicator}
          onContentSizeChange={() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }}
        />

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Tape ton message ici..."
            placeholderTextColor="#999"
            multiline
            maxLength={500}
            editable={!isTyping && !isLoading}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!inputText.trim() || isTyping || isLoading) && styles.sendButtonDisabled
            ]}
            onPress={handleSendMessage}
            disabled={!inputText.trim() || isTyping || isLoading}
          >
            <Text style={[
              styles.sendButtonText,
              (!inputText.trim() || isTyping || isLoading) && styles.sendButtonTextDisabled
            ]}>
              {isTyping || isLoading ? '...' : 'Envoyer'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    paddingTop: 20,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  headerContent: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  chatContainer: {
    flex: 1,
  },
  messagesList: {
    flex: 1,
  },
  messagesContainer: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    maxHeight: 100,
    marginRight: 12,
    backgroundColor: '#F8F9FA',
  },
  sendButton: {
    backgroundColor: '#007AFF',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 12,
    minWidth: 80,
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#C7C7CC',
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  sendButtonTextDisabled: {
    color: '#8E8E93',
  },
});

export default ChatScreenExample;
