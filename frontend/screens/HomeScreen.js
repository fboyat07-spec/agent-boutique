import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getStats } from '../services/api';

const LEVEL_NAMES = ['', 'Explorateur', 'Apprenti', 'Curieux', 'Studieux', 'Brillant',
                     'Expert', 'Champion', 'Virtuose', 'Maitre', 'Sage', 'Genie'];

export default function HomeScreen({ navigation }) {
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const stored = await AsyncStorage.getItem('user');
      if (stored) setUser(JSON.parse(stored));
      const res = await getStats();
      setStats(res.data);
    } catch {
      // no-op
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  async function handleLogout() {
    Alert.alert('Deconnexion', 'Tu veux vraiment te deconnecter ?', [
      { text: 'Annuler' },
      {
        text: 'Oui',
        onPress: async () => {
          await AsyncStorage.clear();
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        },
      },
    ]);
  }

  const xp = stats?.xp || 0;
  const level = stats?.level || 1;
  const levelName = LEVEL_NAMES[level] || 'Explorateur';
  const streak = stats?.streak || 0;
  const nextLevelXP = stats?.nextLevelXP || 100;
  const progress = Math.min((xp / nextLevelXP) * 100, 100);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Bonjour {user?.childName || 'Champion'} !</Text>
          <Text style={styles.levelText}>Niveau {level} - {levelName}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logoutBtn}>⚙️</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: '#FFE8D6' }]}>
          <Text style={styles.statEmoji}>⚡</Text>
          <Text style={styles.statValue}>{xp}</Text>
          <Text style={styles.statLabel}>XP Total</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: '#D6F0FF' }]}>
          <Text style={styles.statEmoji}>🔥</Text>
          <Text style={styles.statValue}>{streak}</Text>
          <Text style={styles.statLabel}>Jours streak</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: '#D6FFE8' }]}>
          <Text style={styles.statEmoji}>🎯</Text>
          <Text style={styles.statValue}>{stats?.totalMissionsCompleted || 0}</Text>
          <Text style={styles.statLabel}>Missions</Text>
        </View>
      </View>

      <View style={styles.xpCard}>
        <View style={styles.xpHeader}>
          <Text style={styles.xpTitle}>Progression vers Niveau {level + 1}</Text>
          <Text style={styles.xpNumbers}>{xp} / {nextLevelXP} XP</Text>
        </View>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
      </View>

      <Text style={styles.sectionTitle}>Que veux-tu faire ?</Text>

      {!stats?.learningPath?.length ? (
        <TouchableOpacity style={styles.diagnosticBtn} onPress={() => navigation.navigate('Diagnostic')}>
          <Text style={styles.diagnosticEmoji}>🧪</Text>
          <View style={styles.diagnosticText}>
            <Text style={styles.diagnosticTitle}>Commencer le diagnostic</Text>
            <Text style={styles.diagnosticSub}>L'IA va analyser ton niveau et creer ton parcours personnalise.</Text>
          </View>
          <Text style={styles.arrow}>→</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.missionBtn} onPress={() => navigation.navigate('Mission')}>
          <Text style={styles.missionEmoji}>🎯</Text>
          <View>
            <Text style={styles.missionTitle}>Continuer les missions</Text>
            <Text style={styles.missionSub}>{stats?.learningPath?.length || 0} competences dans ton parcours</Text>
          </View>
          <Text style={styles.arrow}>→</Text>
        </TouchableOpacity>
      )}

      <View style={styles.quickActions}>
        <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('Tuteur')}>
          <Text style={styles.quickEmoji}>🤖</Text>
          <Text style={styles.quickLabel}>Tuteur IA</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('Progres')}>
          <Text style={styles.quickEmoji}>📊</Text>
          <Text style={styles.quickLabel}>Mes progres</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('Diagnostic')}>
          <Text style={styles.quickEmoji}>🧪</Text>
          <Text style={styles.quickLabel}>Diagnostic</Text>
        </TouchableOpacity>
      </View>

      {stats?.badges?.length > 0 && (
        <View style={styles.badgesCard}>
          <Text style={styles.sectionTitle}>Mes badges</Text>
          <View style={styles.badgesRow}>
            {stats.badges.map((badge) => (
              <View key={badge} style={styles.badge}>
                <Text style={styles.badgeEmoji}>
                  {badge === 'first_mission' ? '🎯' : badge === 'speed_demon' ? '⚡' : badge === 'level_3' ? '🌿' : '🏅'}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F6FF' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, paddingTop: 60, backgroundColor: '#6C63FF', borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  greeting: { fontSize: 22, fontWeight: '800', color: '#fff' },
  levelText: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  logoutBtn: { fontSize: 28 },
  statsRow: { flexDirection: 'row', padding: 16, gap: 8 },
  statCard: { flex: 1, borderRadius: 16, padding: 12, alignItems: 'center' },
  statEmoji: { fontSize: 24, marginBottom: 4 },
  statValue: { fontSize: 22, fontWeight: '800', color: '#333' },
  statLabel: { fontSize: 11, color: '#666', marginTop: 2 },
  xpCard: { marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 8, elevation: 2 },
  xpHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  xpTitle: { fontSize: 14, fontWeight: '600', color: '#333' },
  xpNumbers: { fontSize: 14, color: '#6C63FF', fontWeight: '700' },
  progressBar: { height: 10, backgroundColor: '#EEE', borderRadius: 5, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#6C63FF', borderRadius: 5 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#333', paddingHorizontal: 16, marginVertical: 12 },
  diagnosticBtn: { marginHorizontal: 16, backgroundColor: '#6C63FF', borderRadius: 20, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  diagnosticEmoji: { fontSize: 36 },
  diagnosticText: { flex: 1 },
  diagnosticTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  diagnosticSub: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  missionBtn: { marginHorizontal: 16, backgroundColor: '#FF7043', borderRadius: 20, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  missionEmoji: { fontSize: 36 },
  missionTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  missionSub: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  arrow: { fontSize: 24, color: '#fff', fontWeight: '700' },
  quickActions: { flexDirection: 'row', marginHorizontal: 16, marginTop: 16, gap: 8 },
  quickBtn: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 16, alignItems: 'center', elevation: 2 },
  quickEmoji: { fontSize: 28, marginBottom: 6 },
  quickLabel: { fontSize: 12, fontWeight: '600', color: '#555' },
  badgesCard: { margin: 16, backgroundColor: '#fff', borderRadius: 20, padding: 16, elevation: 2 },
  badgesRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  badge: { width: 52, height: 52, backgroundColor: '#FFF8E1', borderRadius: 26, justifyContent: 'center', alignItems: 'center' },
  badgeEmoji: { fontSize: 28 },
});
