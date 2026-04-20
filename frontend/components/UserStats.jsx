import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import useUserData from '../hooks/useUserData';

const UserStats = ({ userId }) => {
  const { getUserStats } = useUserData(userId);
  const stats = getUserStats();

  // Animation pour le changement de niveau
  const levelAnimation = React.useRef(new Animated.Value(0)).current;
  
  React.useEffect(() => {
    Animated.timing(levelAnimation, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [stats.level]);

  if (stats.loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Chargement...</Text>
      </View>
    );
  }

  if (stats.error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Erreur: {stats.error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header avec niveau */}
      <View style={styles.header}>
        <LinearGradient
          colors={getLevelColors(stats.level)}
          style={styles.levelBadge}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={styles.levelText}>Niveau {stats.level}</Text>
          <Text style={styles.levelName}>{stats.levelName}</Text>
        </LinearGradient>
      </View>

      {/* Stats principales */}
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>XP Total</Text>
          <Text style={styles.statValue}>{stats.xp}</Text>
        </View>
        
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Streak</Text>
          <Text style={styles.statValue}>{stats.streak} jours 🔥</Text>
        </View>
      </View>

      {/* Barre de progression */}
      <View style={styles.progressContainer}>
        <Text style={styles.progressLabel}>Progression vers niveau {stats.level + 1}</Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${stats.progressPercentage}%` }]} />
          <Text style={styles.progressText}>{stats.progressPercentage}%</Text>
        </View>
        <Text style={styles.progressInfo}>
          {stats.xp} / {stats.xpForNextLevel} XP
        </Text>
      </View>

      {/* Badges */}
      {stats.badges.length > 0 && (
        <View style={styles.badgesContainer}>
          <Text style={styles.sectionTitle}>🏆 Badges</Text>
          <View style={styles.badgesGrid}>
            {stats.badges.map((badge, index) => (
              <View key={badge.id} style={styles.badge}>
                <Text style={styles.badgeIcon}>{badge.icon}</Text>
                <Text style={styles.badgeName}>{badge.name}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Succès */}
      {stats.achievements.length > 0 && (
        <View style={styles.achievementsContainer}>
          <Text style={styles.sectionTitle}>🎯 Succès</Text>
          {stats.achievements.map((achievement, index) => (
            <View key={achievement.id} style={[
              styles.achievement,
              !achievement.unlocked && styles.achievementLocked
            ]}>
              <Text style={styles.achievementIcon}>
                {achievement.unlocked ? '✅' : '🔒'}
              </Text>
              <Text style={styles.achievementName}>
                {achievement.name}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Dernière activité */}
      {stats.lastActivityFormatted && (
        <View style={styles.lastActivityContainer}>
          <Text style={styles.sectionTitle}>📅 Dernière activité</Text>
          <Text style={styles.lastActivityText}>
            {stats.lastActivityFormatted}
          </Text>
        </View>
      )}
    </View>
  );
};

const getLevelColors = (level) => {
  const colors = {
    1: ['#4CAF50', '#81C784'], // Vert - Débutant
    2: ['#FF9800', '#F57C00'], // Orange - Apprenti
    3: ['#2196F3', '#1976D2'], // Bleu - Intermédiaire
    4: ['#9C27B0', '#7B1FA2'], // Indigo - Avancé
    5: ['#E91E63', '#F44336'], // Rouge - Expert
  };
  return colors[level] || colors[1];
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f8f9fa',
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  levelBadge: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  levelText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  levelName: {
    fontSize: 14,
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 2,
  },
  statsContainer: {
    marginBottom: 20,
  },
  statItem: {
    backgroundColor: '#FFFFFF',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  statLabel: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  progressContainer: {
    marginBottom: 20,
  },
  progressLabel: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
    textAlign: 'center',
  },
  progressBar: {
    height: 20,
    backgroundColor: '#E0E0E0',
    borderRadius: 10,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 10,
  },
  progressText: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    textAlign: 'center',
    textAlignVertical: 'center',
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  progressInfo: {
    textAlign: 'center',
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  badgesContainer: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  badge: {
    backgroundColor: '#F0F0F0',
    padding: 10,
    borderRadius: 15,
    margin: 5,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  badgeIcon: {
    fontSize: 20,
    marginBottom: 2,
  },
  badgeName: {
    fontSize: 12,
    color: '#333',
    textAlign: 'center',
  },
  achievementsContainer: {
    marginBottom: 20,
  },
  achievement: {
    backgroundColor: '#F0F0F0',
    padding: 15,
    borderRadius: 10,
    margin: 5,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  achievementLocked: {
    opacity: 0.5,
  },
  achievementIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  achievementName: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  lastActivityContainer: {
    backgroundColor: '#F0F0F0',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  lastActivityText: {
    fontSize: 16,
    color: '#666',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#FF3B30',
    textAlign: 'center',
  },
});

export default UserStats;
