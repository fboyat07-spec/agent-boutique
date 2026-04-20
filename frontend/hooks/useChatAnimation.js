import React, { useState, useCallback, useRef } from 'react';

const useChatAnimation = () => {
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const typingTimeoutRef = useRef();

  const addMessage = useCallback((newMessage, isUser = false) => {
    setMessages(prev => [...prev, {
      id: Date.now() + Math.random(),
      text: newMessage,
      isUser,
      timestamp: new Date(),
      isTyping: !isUser, // IA messages start as typing
      isLoading: false,
    }]);
  }, []);

  const addUserMessage = useCallback((text) => {
    addMessage(text, true);
  }, [addMessage]);

  const addAIResponse = useCallback((text, onTypingComplete, showActions = true) => {
    const messageId = Date.now() + Math.random();
    
    // Add loading state first
    setIsLoading(true);
    
    // Simulate processing delay
    setTimeout(() => {
      setIsLoading(false);
      setIsTyping(true);
      
      // Add the AI message as typing
      setMessages(prev => [...prev, {
        id: messageId,
        text,
        isUser: false,
        timestamp: new Date(),
        isTyping: true,
        isLoading: false,
        showActions: false, // Actions will show after typing completes
      }]);
      
      // Clear typing state after animation completes
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      typingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false);
        setMessages(prev => prev.map(msg => 
          msg.id === messageId ? { ...msg, isTyping: false, showActions } : msg
        ));
        if (onTypingComplete) onTypingComplete();
      }, text.length * 30 + 1000); // Estimate typing duration
    }, 800 + Math.random() * 700); // Random delay between 800-1500ms
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setIsTyping(false);
    setIsLoading(false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
  }, []);

  const updateMessage = useCallback((messageId, updates) => {
    setMessages(prev => prev.map(msg => 
      msg.id === messageId ? { ...msg, ...updates } : msg
    ));
  }, []);

  const removeMessage = useCallback((messageId) => {
    setMessages(prev => prev.filter(msg => msg.id !== messageId));
  }, []);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  return {
    messages,
    isTyping,
    isLoading,
    addUserMessage,
    addAIResponse,
    addMessage,
    clearMessages,
    updateMessage,
    removeMessage,
  };
};

export default useChatAnimation;
