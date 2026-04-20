import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, KeyboardAvoidingView, Platform, ActivityIndicator
} from 'react-native';
import { chatWithAI } from '../services/api';

const QUICK_QUESTIONS = [
  "Je ne comprends pas les fractions 😕",
  "Explique-moi les tables de multiplication",
  "Comment conjuguer au passé composé ?",
  "C'est quoi la photosynthèse ?",
  "Je suis bloqué sur un exercice",
  "Donne-moi un exemple de suite logique",
];

export default function AITutorScreen() {
  const [messages, setMessages] = useState([
    {
      id: '0', role: 'assistant',
      text: "Salut ! Je suis KIDO, ton tuteur IA 🤖✨\nPose-moi n'importe quelle question sur tes cours, je suis là pour t'aider !"
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  async function sendMessage(text) {
    const msg = text || input.trim();
    if (!msg) return;
    setInput('');

    const userMsg = { id: Date.now().toString(), role: 'user', text: msg };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await chatWithAI(msg);
      const aiMsg = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: res.data.response,
        demo: res.data.demo,
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: "Oups ! Je n'ai pas pu répondre. Vérifie ta connexion et réessaie 🙏",
      }]);
    } finally {
      setLoading(false);
    }
  }

  function renderMessage({ item }) {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.msgRow, isUser && styles.msgRowUser]}>
        {!isUser && <Text style={styles.avatar}>🤖</Text>}
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAI]}>
          <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>{item.text}</Text>
          {item.demo && <Text style={styles.demoLabel}>mode démo</Text>}
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerEmoji}>🤖</Text>
        <View>
          <Text style={styles.headerTitle}>KIDO - Tuteur IA</Text>
          <Text style={styles.headerSub}>Toujours là pour t'aider !</Text>
        </View>
        <View style={styles.onlineDot} />
      </View>

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
      />

      {/* Typing indicator */}
      {loading && (
        <View style={styles.typingRow}>
          <Text style={styles.avatar}>🤖</Text>
          <View style={styles.typingBubble}>
            <ActivityIndicator size="small" color="#6C63FF" />
            <Text style={styles.typingText}>KIDO réfléchit...</Text>
          </View>
        </View>
      )}

      {/* Questions rapides */}
      {messages.length <= 2 && (
        <View style={styles.quickContainer}>
          <Text style={styles.quickTitle}>Questions rapides :</Text>
          <FlatList
            horizontal
            data={QUICK_QUESTIONS}
            keyExtractor={(_, i) => i.toString()}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.quickBtn} onPress={() => sendMessage(item)}>
                <Text style={styles.quickBtnText}>{item}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* Input */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Pose ta question à KIDO..."
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={500}
          onSubmitEditing={() => sendMessage()}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
          onPress={() => sendMessage()}
          disabled={!input.trim() || loading}
        >
          <Text style={styles.sendBtnText}>↑</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F6FF' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#6C63FF', paddingHorizontal: 20, paddingTop: 52, paddingBottom: 16, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerEmoji: { fontSize: 36 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)' },
  onlineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#69F0AE', marginLeft: 'auto' },
  messagesList: { padding: 16, gap: 12, paddingBottom: 8 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  msgRowUser: { flexDirection: 'row-reverse' },
  avatar: { fontSize: 28, marginBottom: 4 },
  bubble: { maxWidth: '78%', borderRadius: 20, padding: 14 },
  bubbleAI: { backgroundColor: '#fff', borderBottomLeftRadius: 4, elevation: 1 },
  bubbleUser: { backgroundColor: '#6C63FF', borderBottomRightRadius: 4 },
  bubbleText: { fontSize: 15, color: '#333', lineHeight: 22 },
  bubbleTextUser: { color: '#fff' },
  demoLabel: { fontSize: 10, color: '#aaa', marginTop: 4, fontStyle: 'italic' },
  typingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginBottom: 4 },
  typingBubble: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 16, padding: 12, elevation: 1 },
  typingText: { fontSize: 13, color: '#888' },
  quickContainer: { paddingVertical: 10 },
  quickTitle: { fontSize: 12, color: '#999', paddingHorizontal: 16, marginBottom: 6 },
  quickBtn: { backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1.5, borderColor: '#6C63FF' },
  quickBtnText: { color: '#6C63FF', fontSize: 13, fontWeight: '600' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#EEE' },
  input: { flex: 1, backgroundColor: '#F5F5F5', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 100, color: '#333' },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#6C63FF', justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { backgroundColor: '#CCC' },
  sendBtnText: { color: '#fff', fontSize: 20, fontWeight: '900', lineHeight: 24 },
});
