import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView
} from 'react-native';

const SUBJECT_COLORS = {
  maths: '#6C63FF', francais: '#FF7043', sciences: '#26C6DA', logique: '#66BB6A'
};
const SUBJECT_EMOJIS = {
  maths: '🔢', francais: '📖', sciences: '🔬', logique: '🧩'
};
const LEVEL_LABELS = {
  beginner: { label: 'Débutant', emoji: '🌱', color: '#66BB6A' },
  intermediate: { label: 'Intermédiaire', emoji: '🌿', color: '#26C6DA' },
  advanced: { label: 'Avancé', emoji: '🌟', color: '#6C63FF' },
};

export default function DiagnosticResultScreen({ route, navigation }) {
  const { analysis } = route.params;
  const { aiAnalysis, learningPath, overallLevel, strengths, directGaps, fundamentalGaps, xpGained } = analysis;

  const level = LEVEL_LABELS[overallLevel] || LEVEL_LABELS.beginner;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Hero */}
      <View style={styles.hero}>
        <Text style={styles.heroEmoji}>🎉</Text>
        <Text style={styles.heroTitle}>Diagnostic terminé !</Text>
        <Text style={styles.heroXP}>+{xpGained || 50} XP gagnés</Text>
      </View>

      {/* Niveau global */}
      <View style={[styles.levelCard, { backgroundColor: level.color }]}>
        <Text style={styles.levelEmoji}>{level.emoji}</Text>
        <View>
          <Text style={styles.levelLabel}>Ton niveau</Text>
          <Text style={styles.levelName}>{level.label}</Text>
        </View>
      </View>

      {/* Message IA */}
      {aiAnalysis && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🤖 Ce que KIDO pense</Text>
          <Text style={styles.aiMessage}>{aiAnalysis.summary}</Text>
          {aiAnalysis.encouragement && (
            <View style={styles.encourageBox}>
              <Text style={styles.encourageText}>💪 {aiAnalysis.encouragement}</Text>
            </View>
          )}
        </View>
      )}

      {/* Points forts */}
      {strengths?.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>✨ Tes points forts</Text>
          {strengths.map((s, i) => (
            <View key={i} style={styles.strengthRow}>
              <Text style={styles.strengthEmoji}>{SUBJECT_EMOJIS[s.subject] || '📚'}</Text>
              <View style={styles.strengthInfo}>
                <Text style={styles.strengthSkill}>{s.skill.replace(/_/g, ' ')}</Text>
                <View style={styles.strengthBarBg}>
                  <View style={[styles.strengthBarFill, {
                    width: `${Math.round(s.accuracy * 100)}%`,
                    backgroundColor: SUBJECT_COLORS[s.subject] || '#6C63FF'
                  }]} />
                </View>
              </View>
              <Text style={styles.strengthPct}>{Math.round(s.accuracy * 100)}%</Text>
            </View>
          ))}
        </View>
      )}

      {/* Lacunes détectées */}
      {(directGaps?.length > 0 || fundamentalGaps?.length > 0) && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🔍 Lacunes détectées par l'IA</Text>
          <Text style={styles.gapSubtitle}>Ces compétences ont besoin de travail :</Text>
          {[...(fundamentalGaps || []), ...(directGaps || [])].slice(0, 5).map((gap, i) => (
            <View key={i} style={styles.gapRow}>
              <View style={[styles.gapDot, { backgroundColor: SUBJECT_COLORS[gap.subject] || '#aaa' }]} />
              <Text style={styles.gapText}>{gap.label || gap.skill.replace(/_/g, ' ')}</Text>
              <View style={[styles.gapBadge, { backgroundColor: gap.priority === 'high' ? '#FF5252' : '#FFA726' }]}>
                <Text style={styles.gapBadgeText}>{gap.priority === 'high' ? 'Priorité' : 'À revoir'}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Parcours personnalisé */}
      {learningPath?.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🗺️ Ton parcours personnalisé</Text>
          <Text style={styles.pathSubtitle}>L'IA a créé {learningPath.length} étapes rien que pour toi</Text>
          {learningPath.map((step, i) => (
            <View key={i} style={styles.pathStep}>
              <View style={[styles.pathNumber, { backgroundColor: SUBJECT_COLORS[step.subject] || '#6C63FF' }]}>
                <Text style={styles.pathNumberText}>{i + 1}</Text>
              </View>
              <View style={styles.pathInfo}>
                <Text style={styles.pathLabel}>{step.label || step.skill.replace(/_/g, ' ')}</Text>
                <Text style={styles.pathMeta}>
                  {SUBJECT_EMOJIS[step.subject]} {step.subject} • {step.missionsCount} missions • ~{step.estimatedMinutes} min
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* CTA */}
      <TouchableOpacity
        style={styles.startBtn}
        onPress={() => navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] })}
      >
        <Text style={styles.startBtnText}>Commencer les missions 🎯</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F6FF' },
  hero: { backgroundColor: '#6C63FF', paddingTop: 60, paddingBottom: 32, alignItems: 'center' },
  heroEmoji: { fontSize: 64, marginBottom: 8 },
  heroTitle: { fontSize: 28, fontWeight: '900', color: '#fff' },
  heroXP: { marginTop: 8, backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, color: '#fff', fontWeight: '700', fontSize: 16 },
  levelCard: { margin: 16, borderRadius: 20, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16 },
  levelEmoji: { fontSize: 40 },
  levelLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  levelName: { color: '#fff', fontSize: 24, fontWeight: '900' },
  card: { marginHorizontal: 16, marginBottom: 12, backgroundColor: '#fff', borderRadius: 20, padding: 20, elevation: 2 },
  cardTitle: { fontSize: 17, fontWeight: '800', color: '#333', marginBottom: 14 },
  aiMessage: { fontSize: 15, color: '#555', lineHeight: 22 },
  encourageBox: { marginTop: 12, backgroundColor: '#F0EEFF', borderRadius: 12, padding: 12 },
  encourageText: { fontSize: 14, color: '#6C63FF', fontWeight: '600' },
  strengthRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  strengthEmoji: { fontSize: 22 },
  strengthInfo: { flex: 1 },
  strengthSkill: { fontSize: 13, fontWeight: '600', color: '#333', marginBottom: 4, textTransform: 'capitalize' },
  strengthBarBg: { height: 6, backgroundColor: '#EEE', borderRadius: 3, overflow: 'hidden' },
  strengthBarFill: { height: '100%', borderRadius: 3 },
  strengthPct: { fontSize: 13, fontWeight: '700', color: '#555', width: 36, textAlign: 'right' },
  gapSubtitle: { fontSize: 13, color: '#888', marginBottom: 10 },
  gapRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  gapDot: { width: 10, height: 10, borderRadius: 5 },
  gapText: { flex: 1, fontSize: 14, color: '#333', textTransform: 'capitalize' },
  gapBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  gapBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  pathSubtitle: { fontSize: 13, color: '#888', marginBottom: 12 },
  pathStep: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 },
  pathNumber: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  pathNumberText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  pathInfo: { flex: 1 },
  pathLabel: { fontSize: 15, fontWeight: '700', color: '#333', textTransform: 'capitalize' },
  pathMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  startBtn: { marginHorizontal: 16, marginTop: 8, backgroundColor: '#FF7043', borderRadius: 18, padding: 18, alignItems: 'center' },
  startBtnText: { color: '#fff', fontSize: 20, fontWeight: '800' },
});
