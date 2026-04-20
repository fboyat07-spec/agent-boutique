import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator
} from 'react-native';
import { getStats } from '../services/api';

const SUBJECT_COLORS = {
  maths: '#6C63FF', francais: '#FF7043', sciences: '#26C6DA', logique: '#66BB6A'
};
const SUBJECT_EMOJIS = {
  maths: '🔢', francais: '📖', sciences: '🔬', logique: '🧩'
};
const LEVEL_NAMES = ['', 'Explorateur', 'Apprenti', 'Curieux', 'Studieux', 'Brillant',
                     'Expert', 'Champion', 'Virtuose', 'Maître', 'Sage', 'Génie'];
const BADGE_INFO = {
  first_mission: { name: 'Première victoire', emoji: '🎯', desc: 'Première mission réussie !' },
  speed_demon: { name: 'Éclair', emoji: '⚡', desc: 'Réponse en moins de 10 secondes' },
  level_3: { name: 'Apprenti confirmé', emoji: '🌿', desc: 'Atteint le niveau 3' },
};

export default function ProgressScreen({ navigation }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { loadStats(); }, []);

  async function loadStats() {
    try {
      const res = await getStats();
      setStats(res.data);
    } catch {}
    setLoading(false);
  }

  async function onRefresh() {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#6C63FF" />
      </View>
    );
  }

  const xp = stats?.xp || 0;
  const level = stats?.level || 1;
  const levelName = LEVEL_NAMES[level] || 'Explorateur';
  const nextLevelXP = stats?.nextLevelXP || 100;
  const progressPct = Math.min((xp / nextLevelXP) * 100, 100);

  // Regrouper le parcours par matière
  const pathBySubject = {};
  stats?.learningPath?.forEach(step => {
    if (!pathBySubject[step.subject]) pathBySubject[step.subject] = [];
    pathBySubject[step.subject].push(step);
  });

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📊 Mes Progrès</Text>
      </View>

      {/* Level card */}
      <View style={styles.levelCard}>
        <View style={styles.levelTop}>
          <View>
            <Text style={styles.levelName}>{levelName}</Text>
            <Text style={styles.levelNumber}>Niveau {level}</Text>
          </View>
          <Text style={styles.levelEmoji}>
            {level <= 2 ? '🌱' : level <= 4 ? '🌿' : level <= 6 ? '🌟' : level <= 9 ? '💎' : '👑'}
          </Text>
        </View>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
        </View>
        <View style={styles.progressLabels}>
          <Text style={styles.progressLabel}>{xp} XP</Text>
          <Text style={styles.progressLabel}>Prochain niveau : {nextLevelXP} XP</Text>
        </View>
      </View>

      {/* Stats rapides */}
      <View style={styles.statsRow}>
        {[
          { emoji: '🔥', value: stats?.streak || 0, label: 'Jours streak' },
          { emoji: '🎯', value: stats?.totalMissionsCompleted || 0, label: 'Missions' },
          { emoji: '✅', value: `${stats?.accuracy || 0}%`, label: 'Précision' },
        ].map((s, i) => (
          <View key={i} style={styles.statCard}>
            <Text style={styles.statEmoji}>{s.emoji}</Text>
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Parcours par matière */}
      {Object.keys(pathBySubject).length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🗺️ Ton parcours d'apprentissage</Text>
          {Object.entries(pathBySubject).map(([subject, steps]) => {
            const completed = steps.filter(s =>
              (stats?.missionProgress?.[s.skill]?.completed || 0) >= s.missionsCount
            ).length;
            const pct = (completed / steps.length) * 100;

            return (
              <View key={subject} style={styles.subjectCard}>
                <View style={styles.subjectHeader}>
                  <Text style={styles.subjectEmoji}>{SUBJECT_EMOJIS[subject] || '📚'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.subjectName}>{subject.charAt(0).toUpperCase() + subject.slice(1)}</Text>
                    <Text style={styles.subjectProgress}>{completed}/{steps.length} compétences</Text>
                  </View>
                  <Text style={[styles.subjectPct, { color: SUBJECT_COLORS[subject] }]}>
                    {Math.round(pct)}%
                  </Text>
                </View>
                <View style={styles.subjectBar}>
                  <View style={[styles.subjectBarFill, {
                    width: `${pct}%`, backgroundColor: SUBJECT_COLORS[subject]
                  }]} />
                </View>

                {/* Détail des compétences */}
                <View style={styles.skillsList}>
                  {steps.map((step, i) => {
                    const done = (stats?.missionProgress?.[step.skill]?.completed || 0);
                    const total = step.missionsCount;
                    const skillDone = done >= total;
                    return (
                      <View key={i} style={styles.skillRow}>
                        <Text style={styles.skillDot}>{skillDone ? '✅' : '⬜'}</Text>
                        <Text style={[styles.skillName, skillDone && styles.skillNameDone]}>
                          {step.label || step.skill.replace(/_/g, ' ')}
                        </Text>
                        <Text style={styles.skillMissions}>{done}/{total}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Badges */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🏆 Mes badges</Text>
        {stats?.badges?.length > 0 ? (
          <View style={styles.badgesGrid}>
            {stats.badges.map(badgeId => {
              const badge = BADGE_INFO[badgeId] || { name: badgeId, emoji: '🏅', desc: 'Badge spécial' };
              return (
                <View key={badgeId} style={styles.badgeCard}>
                  <Text style={styles.badgeEmoji}>{badge.emoji}</Text>
                  <Text style={styles.badgeName}>{badge.name}</Text>
                  <Text style={styles.badgeDesc}>{badge.desc}</Text>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyBadges}>
            <Text style={styles.emptyBadgesText}>Complète des missions pour gagner des badges ! 🎯</Text>
          </View>
        )}
      </View>

      {/* CTA diagnostic */}
      <TouchableOpacity style={styles.diagBtn} onPress={() => navigation.navigate('Diagnostic')}>
        <Text style={styles.diagBtnEmoji}>🧪</Text>
        <View>
          <Text style={styles.diagBtnTitle}>Refaire le diagnostic</Text>
          <Text style={styles.diagBtnSub}>Mettre à jour ton parcours d'apprentissage</Text>
        </View>
        <Text style={{ fontSize: 20, color: '#fff' }}>→</Text>
      </TouchableOpacity>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F6FF' },
  header: { backgroundColor: '#6C63FF', paddingTop: 52, paddingBottom: 20, paddingHorizontal: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerTitle: { fontSize: 24, fontWeight: '900', color: '#fff' },
  levelCard: { margin: 16, backgroundColor: '#fff', borderRadius: 24, padding: 20, elevation: 3 },
  levelTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  levelName: { fontSize: 24, fontWeight: '900', color: '#333' },
  levelNumber: { fontSize: 14, color: '#888', marginTop: 2 },
  levelEmoji: { fontSize: 44 },
  progressBar: { height: 12, backgroundColor: '#EEE', borderRadius: 6, overflow: 'hidden', marginBottom: 8 },
  progressFill: { height: '100%', backgroundColor: '#6C63FF', borderRadius: 6 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { fontSize: 12, color: '#888' },
  statsRow: { flexDirection: 'row', marginHorizontal: 16, gap: 8, marginBottom: 8 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 18, padding: 14, alignItems: 'center', elevation: 2 },
  statEmoji: { fontSize: 26, marginBottom: 4 },
  statValue: { fontSize: 20, fontWeight: '900', color: '#333' },
  statLabel: { fontSize: 11, color: '#888', marginTop: 2, textAlign: 'center' },
  section: { margin: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#333', marginBottom: 12 },
  subjectCard: { backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 10, elevation: 2 },
  subjectHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  subjectEmoji: { fontSize: 28 },
  subjectName: { fontSize: 16, fontWeight: '800', color: '#333', textTransform: 'capitalize' },
  subjectProgress: { fontSize: 12, color: '#888' },
  subjectPct: { fontSize: 18, fontWeight: '900' },
  subjectBar: { height: 8, backgroundColor: '#EEE', borderRadius: 4, overflow: 'hidden', marginBottom: 12 },
  subjectBarFill: { height: '100%', borderRadius: 4 },
  skillsList: { gap: 6 },
  skillRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  skillDot: { fontSize: 14 },
  skillName: { flex: 1, fontSize: 13, color: '#555', textTransform: 'capitalize' },
  skillNameDone: { color: '#aaa', textDecorationLine: 'line-through' },
  skillMissions: { fontSize: 12, color: '#999' },
  badgesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  badgeCard: { backgroundColor: '#fff', borderRadius: 18, padding: 14, alignItems: 'center', width: '30%', elevation: 2 },
  badgeEmoji: { fontSize: 36, marginBottom: 6 },
  badgeName: { fontSize: 11, fontWeight: '700', color: '#333', textAlign: 'center' },
  badgeDesc: { fontSize: 10, color: '#888', textAlign: 'center', marginTop: 2 },
  emptyBadges: { backgroundColor: '#fff', borderRadius: 18, padding: 24, alignItems: 'center' },
  emptyBadgesText: { fontSize: 14, color: '#888', textAlign: 'center' },
  diagBtn: { marginHorizontal: 16, backgroundColor: '#6C63FF', borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 },
  diagBtnEmoji: { fontSize: 32 },
  diagBtnTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  diagBtnSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
});
