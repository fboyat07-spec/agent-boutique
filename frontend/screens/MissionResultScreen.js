import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Platform } from 'react-native';

export default function MissionResultScreen({ route, navigation }) {
  const { result } = route.params;
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const canUseNativeDriver = Platform.OS !== 'web';

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, tension: 50, friction: 5, useNativeDriver: canUseNativeDriver }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: canUseNativeDriver }),
    ]).start();
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        {/* Level up */}
        {result?.leveledUp && (
          <Animated.View style={[styles.levelUpCard, { transform: [{ scale: scaleAnim }] }]}>
            <Text style={styles.levelUpEmoji}>⬆️</Text>
            <Text style={styles.levelUpTitle}>NIVEAU SUPÉRIEUR !</Text>
            <Text style={styles.levelUpName}>{result.levelName}</Text>
            <Text style={styles.levelUpXP}>Niveau {result.level}</Text>
          </Animated.View>
        )}

        {/* Nouveaux badges */}
        {result?.newBadges?.length > 0 && (
          <View style={styles.badgesSection}>
            <Text style={styles.badgesTitle}>🏆 Nouveaux badges débloqués !</Text>
            {result.newBadges.map((badge, i) => (
              <Animated.View key={i} style={[styles.badgeCard, { transform: [{ scale: scaleAnim }] }]}>
                <Text style={styles.badgeEmoji}>{badge.emoji}</Text>
                <View>
                  <Text style={styles.badgeName}>{badge.name}</Text>
                  <Text style={styles.badgeId}>Badge obtenu !</Text>
                </View>
              </Animated.View>
            ))}
          </View>
        )}

        {/* XP summary */}
        <View style={styles.xpCard}>
          <Text style={styles.xpValue}>+{result?.xpGained} XP</Text>
          <Text style={styles.xpTotal}>Total : {result?.totalXP} XP</Text>
        </View>

        <TouchableOpacity
          style={styles.continueBtn}
          onPress={() => navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] })}
        >
          <Text style={styles.continueBtnText}>Continuer 🎯</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#6C63FF', justifyContent: 'center', alignItems: 'center', padding: 24 },
  content: { width: '100%', alignItems: 'center', gap: 20 },
  levelUpCard: { backgroundColor: '#fff', borderRadius: 28, padding: 32, alignItems: 'center', width: '100%' },
  levelUpEmoji: { fontSize: 72, marginBottom: 8 },
  levelUpTitle: { fontSize: 22, fontWeight: '900', color: '#6C63FF', letterSpacing: 2 },
  levelUpName: { fontSize: 32, fontWeight: '900', color: '#333', marginTop: 4 },
  levelUpXP: { fontSize: 16, color: '#888', marginTop: 6 },
  badgesSection: { width: '100%', gap: 12 },
  badgesTitle: { fontSize: 20, fontWeight: '800', color: '#fff', textAlign: 'center' },
  badgeCard: { backgroundColor: '#fff', borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 16 },
  badgeEmoji: { fontSize: 44 },
  badgeName: { fontSize: 18, fontWeight: '800', color: '#333' },
  badgeId: { fontSize: 13, color: '#6C63FF', marginTop: 2 },
  xpCard: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: 20, alignItems: 'center', width: '100%' },
  xpValue: { fontSize: 40, fontWeight: '900', color: '#fff' },
  xpTotal: { fontSize: 16, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  continueBtn: { backgroundColor: '#FF7043', borderRadius: 18, padding: 18, width: '100%', alignItems: 'center' },
  continueBtnText: { color: '#fff', fontSize: 20, fontWeight: '800' },
});
