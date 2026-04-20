import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  Alert, Animated, Platform
} from 'react-native';
import { getNextMission, answerMission } from '../services/api';

const SUBJECT_COLORS = {
  maths: '#6C63FF', francais: '#FF7043', sciences: '#26C6DA', logique: '#66BB6A'
};

export default function MissionScreen({ navigation }) {
  const [state, setState] = useState('loading'); // loading | ready | answered | allDone | needsDiagnostic
  const [mission, setMission] = useState(null);
  const [selected, setSelected] = useState(null);
  const [result, setResult] = useState(null);
  const [startTime, setStartTime] = useState(null);
  const [timer, setTimer] = useState(30);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef(null);
  const canUseNativeDriver = Platform.OS !== 'web';

  useEffect(() => {
    loadMission();
    return () => clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    if (state === 'ready') {
      setTimer(30);
      timerRef.current = setInterval(() => {
        setTimer(t => {
          if (t <= 1) {
            clearInterval(timerRef.current);
            // Temps écoulé : soumettre une réponse vide
            handleAnswer('__timeout__');
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [state]);

  async function loadMission() {
    setState('loading');
    try {
      const res = await getNextMission();
      if (res.data.allCompleted) {
        setState('allDone');
        return;
      }
      setMission(res.data);
      setStartTime(Date.now());
      setState('ready');
      setSelected(null);
      setResult(null);
    } catch (err) {
      if (err.response?.data?.needsDiagnostic) {
        setState('needsDiagnostic');
      } else {
        Alert.alert('Erreur', 'Impossible de charger la mission.');
        setState('needsDiagnostic');
      }
    }
  }

  function shake() {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: canUseNativeDriver }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: canUseNativeDriver }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver: canUseNativeDriver }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: canUseNativeDriver }),
    ]).start();
  }

  async function handleAnswer(option) {
    if (selected || state !== 'ready') return;
    clearInterval(timerRef.current);
    setSelected(option);
    setState('answered');

    const timeSpent = Math.round((Date.now() - startTime) / 1000);
    try {
      const res = await answerMission(mission.missionId, option, timeSpent);
      setResult(res.data);
      if (!res.data.correct) shake();
    } catch (err) {
      setResult({ correct: false, explanation: 'Erreur réseau. Réessaie.', xpGained: 0 });
    }
  }

  function nextMission() {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: canUseNativeDriver }),
    ]).start(() => {
      if (result?.leveledUp || result?.newBadges?.length > 0) {
        navigation.navigate('MissionResult', { result });
      } else {
        Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: canUseNativeDriver }).start();
        loadMission();
      }
    });
  }

  const subjectColor = SUBJECT_COLORS[mission?.subject] || '#6C63FF';
  const timerColor = timer <= 10 ? '#FF5252' : timer <= 20 ? '#FFA726' : '#66BB6A';

  // États spéciaux
  if (state === 'loading') {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>⏳</Text>
        <ActivityIndicator size="large" color="#6C63FF" />
        <Text style={styles.loadingText}>Préparation de ta mission...</Text>
      </View>
    );
  }

  if (state === 'needsDiagnostic') {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={{ fontSize: 64, marginBottom: 16 }}>🧪</Text>
        <Text style={styles.noMissionTitle}>Diagnostic requis</Text>
        <Text style={styles.noMissionText}>Fais d'abord le diagnostic pour que l'IA crée ton parcours !</Text>
        <TouchableOpacity style={styles.diagBtn} onPress={() => navigation.navigate('Diagnostic')}>
          <Text style={styles.diagBtnText}>Faire le diagnostic 🚀</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (state === 'allDone') {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={{ fontSize: 64, marginBottom: 16 }}>🏆</Text>
        <Text style={styles.noMissionTitle}>Parcours complété !</Text>
        <Text style={styles.noMissionText}>Tu as terminé toutes tes missions. Refais le diagnostic pour continuer !</Text>
        <TouchableOpacity style={styles.diagBtn} onPress={() => navigation.navigate('Diagnostic')}>
          <Text style={styles.diagBtnText}>Nouveau diagnostic 🧪</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: subjectColor }]}>
        <View>
          <Text style={styles.headerSkill}>{mission?.skillLabel || mission?.skill?.replace(/_/g, ' ')}</Text>
          <Text style={styles.headerProgress}>
            Mission {mission?.progress?.current}/{mission?.progress?.total} • Étape {mission?.progress?.skillOrder}/{mission?.progress?.totalSkills}
          </Text>
        </View>
        <View style={[styles.timerCircle, { borderColor: timerColor }]}>
          <Text style={[styles.timerText, { color: timerColor }]}>{timer}</Text>
        </View>
      </View>

      {/* XP reward */}
      <View style={styles.xpBadge}>
        <Text style={styles.xpBadgeText}>⚡ +{mission?.xpReward} XP si correct</Text>
      </View>

      {/* Question */}
      <Animated.View style={[styles.questionCard, { transform: [{ translateX: shakeAnim }] }]}>
        <Text style={styles.questionEmoji}>{mission?.emoji || '❓'}</Text>
        <Text style={styles.questionText}>{mission?.question}</Text>
        {mission?.hint && state === 'ready' && (
          <Text style={styles.hintText}>💡 {mission.hint}</Text>
        )}
      </Animated.View>

      {/* Options */}
      <View style={styles.optionsContainer}>
        {mission?.options?.map((option, i) => {
          let btnStyle = styles.optionBtn;
          let textStyle = styles.optionText;
          let letterStyle = styles.optionLetter;

          if (state === 'answered') {
            if (option === result?.correctAnswer) {
              btnStyle = { ...styles.optionBtn, backgroundColor: '#4CAF50', borderColor: '#4CAF50' };
              textStyle = { ...styles.optionText, color: '#fff' };
              letterStyle = { ...styles.optionLetter, backgroundColor: 'rgba(255,255,255,0.3)', color: '#fff' };
            } else if (option === selected && !result?.correct) {
              btnStyle = { ...styles.optionBtn, backgroundColor: '#FF5252', borderColor: '#FF5252' };
              textStyle = { ...styles.optionText, color: '#fff' };
              letterStyle = { ...styles.optionLetter, backgroundColor: 'rgba(255,255,255,0.3)', color: '#fff' };
            }
          } else if (selected === option) {
            btnStyle = { ...styles.optionBtn, backgroundColor: subjectColor, borderColor: subjectColor };
            textStyle = { ...styles.optionText, color: '#fff' };
          }

          return (
            <TouchableOpacity key={i} style={btnStyle} onPress={() => handleAnswer(option)} disabled={state === 'answered'}>
              <Text style={letterStyle}>{['A', 'B', 'C', 'D'][i]}</Text>
              <Text style={textStyle}>{option}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Feedback */}
      {state === 'answered' && result && (
        <View style={[styles.feedback, { backgroundColor: result.correct ? '#E8F5E9' : '#FFEBEE' }]}>
          <Text style={styles.feedbackEmoji}>{result.correct ? '🎉' : '💡'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.feedbackTitle, { color: result.correct ? '#2E7D32' : '#C62828' }]}>
              {result.correct ? `Bravo ! +${result.xpGained} XP` : 'Pas tout à fait...'}
            </Text>
            <Text style={styles.feedbackExplanation}>{result.explanation}</Text>
          </View>
        </View>
      )}

      {/* Bouton suivant */}
      {state === 'answered' && (
        <TouchableOpacity style={[styles.nextBtn, { backgroundColor: subjectColor }]} onPress={nextMission}>
          <Text style={styles.nextBtnText}>Mission suivante →</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F6FF' },
  center: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 16, fontSize: 16, color: '#888' },
  noMissionTitle: { fontSize: 24, fontWeight: '800', color: '#333', marginBottom: 10, textAlign: 'center' },
  noMissionText: { fontSize: 15, color: '#666', textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  diagBtn: { backgroundColor: '#6C63FF', borderRadius: 16, padding: 16, paddingHorizontal: 28 },
  diagBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  header: { paddingTop: 52, paddingBottom: 20, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerSkill: { fontSize: 20, fontWeight: '800', color: '#fff', textTransform: 'capitalize' },
  headerProgress: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  timerCircle: { width: 52, height: 52, borderRadius: 26, borderWidth: 3, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)' },
  timerText: { fontSize: 20, fontWeight: '900' },
  xpBadge: { alignSelf: 'center', marginVertical: 10, backgroundColor: '#FFF8E1', paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20 },
  xpBadgeText: { color: '#F57F17', fontWeight: '700', fontSize: 13 },
  questionCard: { marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 24, padding: 20, alignItems: 'center', elevation: 3, minHeight: 140, justifyContent: 'center' },
  questionEmoji: { fontSize: 40, marginBottom: 10 },
  questionText: { fontSize: 17, fontWeight: '700', textAlign: 'center', color: '#333', lineHeight: 24 },
  hintText: { marginTop: 10, fontSize: 13, color: '#888', textAlign: 'center', fontStyle: 'italic' },
  optionsContainer: { paddingHorizontal: 16, marginTop: 12, gap: 8 },
  optionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 2, borderColor: '#E8E8E8', gap: 12, elevation: 1 },
  optionLetter: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F0EEFF', textAlign: 'center', lineHeight: 28, fontWeight: '800', color: '#6C63FF', fontSize: 13, overflow: 'hidden' },
  optionText: { fontSize: 15, color: '#333', flex: 1, fontWeight: '500' },
  feedback: { marginHorizontal: 16, marginTop: 12, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  feedbackEmoji: { fontSize: 28 },
  feedbackTitle: { fontSize: 16, fontWeight: '800', marginBottom: 2 },
  feedbackExplanation: { fontSize: 13, color: '#555', lineHeight: 18 },
  nextBtn: { marginHorizontal: 16, marginTop: 12, borderRadius: 16, padding: 16, alignItems: 'center' },
  nextBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
