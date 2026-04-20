import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, Animated, Platform
} from 'react-native';
import { startDiagnostic, submitDiagnostic } from '../services/api';

export default function DiagnosticScreen({ navigation }) {
  const [phase, setPhase] = useState('intro'); // intro | questions | loading | done
  const [sessionId, setSessionId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [selectedOption, setSelectedOption] = useState(null);
  const [startTime, setStartTime] = useState(null);
  const [loading, setLoading] = useState(false);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const canUseNativeDriver = Platform.OS !== 'web';

  function fadeTransition(callback) {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: canUseNativeDriver }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: canUseNativeDriver }),
    ]).start();
    setTimeout(callback, 200);
  }

  async function startTest() {
    setLoading(true);
    try {
      const res = await startDiagnostic();
      setSessionId(res.data.sessionId);
      setQuestions(res.data.questions);
      setStartTime(Date.now());
      setPhase('questions');
    } catch (err) {
      Alert.alert('Erreur', 'Impossible de démarrer le diagnostic. Vérifie ta connexion.');
    } finally {
      setLoading(false);
    }
  }

  function handleAnswer(option) {
    if (selectedOption) return;
    setSelectedOption(option);

    const timeSpent = Math.round((Date.now() - startTime) / 1000);
    const currentQ = questions[currentIndex];

    const newAnswers = [...answers, { questionId: currentQ.id, answer: option, timeSpent }];

    setTimeout(() => {
      setSelectedOption(null);
      setStartTime(Date.now());
      fadeTransition(() => {
        if (currentIndex < questions.length - 1) {
          setCurrentIndex(i => i + 1);
          setAnswers(newAnswers);
        } else {
          submitTest(newAnswers);
        }
      });
    }, 800);
  }

  async function submitTest(finalAnswers) {
    setPhase('loading');
    try {
      const res = await submitDiagnostic(sessionId, finalAnswers);
      navigation.replace('DiagnosticResult', { analysis: res.data });
    } catch (err) {
      Alert.alert('Erreur', 'Erreur lors de l\'analyse. Réessaie.');
      setPhase('questions');
    }
  }

  const SUBJECT_COLORS = {
    maths: '#6C63FF', francais: '#FF7043', sciences: '#26C6DA', logique: '#66BB6A'
  };
  const SUBJECT_LABELS = {
    maths: 'Maths', francais: 'Français', sciences: 'Sciences', logique: 'Logique'
  };

  if (phase === 'intro') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.center}>
        <Text style={styles.bigEmoji}>🧪</Text>
        <Text style={styles.title}>Diagnostic IA</Text>
        <Text style={styles.desc}>
          Je vais te poser quelques questions pour mieux te connaître.{'\n'}
          L'IA va ensuite créer ton parcours personnalisé !
        </Text>

        <View style={styles.infoCards}>
          {[
            { emoji: '📝', text: '12 questions adaptées à ton âge' },
            { emoji: '⏱️', text: 'Environ 5-10 minutes' },
            { emoji: '🎯', text: '4 matières : Maths, Français, Sciences, Logique' },
            { emoji: '🤖', text: 'L\'IA analyse tes résultats instantanément' },
          ].map((item, i) => (
            <View key={i} style={styles.infoCard}>
              <Text style={styles.infoEmoji}>{item.emoji}</Text>
              <Text style={styles.infoText}>{item.text}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.startBtn} onPress={startTest} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.startBtnText}>C'est parti ! 🚀</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backLink}>← Retour</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (phase === 'loading') {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={{ fontSize: 64, marginBottom: 24 }}>🤖</Text>
        <ActivityIndicator size="large" color="#6C63FF" />
        <Text style={styles.loadingText}>L'IA analyse tes résultats...</Text>
        <Text style={styles.loadingSubText}>Création de ton parcours personnalisé 🎯</Text>
      </View>
    );
  }

  const currentQ = questions[currentIndex];
  const subjectColor = SUBJECT_COLORS[currentQ?.subject] || '#6C63FF';
  const progressPercent = ((currentIndex + 1) / questions.length) * 100;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.questionHeader}>
        <TouchableOpacity onPress={() => Alert.alert('Quitter ?', 'Tu vas perdre ta progression.', [
          { text: 'Continuer' }, { text: 'Quitter', onPress: () => navigation.goBack() }
        ])}>
          <Text style={styles.closeBtn}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.questionCounter}>{currentIndex + 1} / {questions.length}</Text>
        <View style={[styles.subjectBadge, { backgroundColor: subjectColor }]}>
          <Text style={styles.subjectText}>{SUBJECT_LABELS[currentQ?.subject]}</Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progressPercent}%`, backgroundColor: subjectColor }]} />
      </View>

      {/* Question */}
      <Animated.View style={[styles.questionCard, { opacity: fadeAnim }]}>
        <Text style={styles.questionEmoji}>{currentQ?.emoji || '❓'}</Text>
        <Text style={styles.questionText}>{currentQ?.question}</Text>
      </Animated.View>

      {/* Options */}
      <Animated.View style={[styles.optionsContainer, { opacity: fadeAnim }]}>
        {currentQ?.options?.map((option, i) => (
          <TouchableOpacity
            key={i}
            style={[
              styles.optionBtn,
              selectedOption === option && { backgroundColor: subjectColor, borderColor: subjectColor }
            ]}
            onPress={() => handleAnswer(option)}
            disabled={!!selectedOption}
          >
            <Text style={[styles.optionLetter, selectedOption === option && { color: '#fff' }]}>
              {['A', 'B', 'C', 'D'][i]}
            </Text>
            <Text style={[styles.optionText, selectedOption === option && { color: '#fff' }]}>{option}</Text>
          </TouchableOpacity>
        ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F6FF' },
  center: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  bigEmoji: { fontSize: 72, marginBottom: 16 },
  title: { fontSize: 32, fontWeight: '900', color: '#6C63FF', marginBottom: 12 },
  desc: { fontSize: 16, textAlign: 'center', color: '#555', lineHeight: 24, marginBottom: 24 },
  infoCards: { width: '100%', gap: 10, marginBottom: 28 },
  infoCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14, gap: 12, elevation: 1 },
  infoEmoji: { fontSize: 24 },
  infoText: { fontSize: 15, color: '#333', flex: 1 },
  startBtn: { backgroundColor: '#6C63FF', borderRadius: 16, padding: 18, width: '100%', alignItems: 'center' },
  startBtnText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  backLink: { marginTop: 16, color: '#6C63FF', fontSize: 15 },
  loadingText: { fontSize: 22, fontWeight: '700', color: '#333', marginTop: 24 },
  loadingSubText: { fontSize: 16, color: '#888', marginTop: 8 },
  questionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12 },
  closeBtn: { fontSize: 22, color: '#888', padding: 4 },
  questionCounter: { fontSize: 16, fontWeight: '700', color: '#555' },
  subjectBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  subjectText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  progressBar: { height: 6, backgroundColor: '#E0E0E0', marginHorizontal: 20, borderRadius: 3, overflow: 'hidden', marginBottom: 24 },
  progressFill: { height: '100%', borderRadius: 3 },
  questionCard: { marginHorizontal: 20, backgroundColor: '#fff', borderRadius: 24, padding: 24, alignItems: 'center', marginBottom: 20, elevation: 3, minHeight: 160, justifyContent: 'center' },
  questionEmoji: { fontSize: 48, marginBottom: 12 },
  questionText: { fontSize: 18, fontWeight: '700', textAlign: 'center', color: '#333', lineHeight: 26 },
  optionsContainer: { paddingHorizontal: 20, gap: 10 },
  optionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 2, borderColor: '#E8E8E8', gap: 12, elevation: 1 },
  optionLetter: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F0EEFF', textAlign: 'center', lineHeight: 28, fontWeight: '800', color: '#6C63FF', fontSize: 14 },
  optionText: { fontSize: 16, color: '#333', flex: 1, fontWeight: '500' },
});
