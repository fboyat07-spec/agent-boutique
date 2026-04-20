import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Animated, Image } from 'react-native';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { auth } from '../config/firebase-clean';
import useUserData from '../hooks/useUserData';
import { getAvatarById } from '../hooks/avatarService';
import LevelBadge from './LevelBadge';
import StreakDisplay from './StreakDisplay';
import LevelUpSound from './LevelUpSound';
import XPGainAnimation from './XPGainAnimation';
import LevelUpModal from './LevelUpModal';

const getCurrentUserId = () => {
  const user = auth.currentUser;
  return user ? user.uid : null;
};

// Couleur dynamique selon le niveau
const getColorByLevel = (level) => {
  if (level <= 2) return '#4CAF50';  // Vert
  if (level <= 5) return '#2196F3';  // Bleu
  return '#9C27B0';  // Violet
};

const UserProgress = () => {
  const userId = getCurrentUserId();
  const {
    userData,
    progressPercentage,
    loading,
    error,
    updateUserData,
    addBadge,
    completeDailyMission,
    resetDailyMissions,
    generateDailyMissions,
    shouldResetMissions,
    checkAndResetMissions,
    getUserStats,
    getLevelName,
    calculateXPForNextLevel,
    calculateXPForCurrentLevel
  } = useUserData(userId);

  const [xpFeedback, setXpFeedback] = useState({
    visible: false,
    xp: 0,
    lastXP: 0
  });

  // Animation du texte de niveau
  const [levelTextAnim] = useState(new Animated.Value(1));

  // Obtenir les informations de l'avatar
  const avatarInfo = userData.avatar ? getAvatarById(userData.avatar) : null;

  // Initialiser le son de level up
  const levelUpSound = LevelUpSound({
    onSoundReady: () => console.log('✅ Son level up prêt'),
    onError: (error) => console.log('❌ Erreur son level up:', error)
  });

  // Détecter les changements de niveau
  useEffect(() => {
    if (loading || !userData) return;

    const currentLevel = userData.level || 1;
    const previousLevel = levelUpModal.newLevel || 1;
    
    if (currentLevel > previousLevel) {
      // Jouer le son de level up
      levelUpSound.playSound();

      // Animation du texte de niveau
      Animated.sequence([
        Animated.timing(levelTextAnim, {
          toValue: 1.2,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(levelTextAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        })
      ]).start();

      // Afficher la modale de level up
      setLevelUpModal({
        visible: true,
        newLevel: currentLevel,
        oldLevel: previousLevel
      });
    }
  }, [userData.level, loading, levelTextAnim, levelUpSound]);

  // Afficher le feedback XP
  useEffect(() => {
    if (loading || !userData) return;

    const currentXP = userData.xp || 0;
    const previousXP = xpFeedback.lastXP || 0;
    const xpDiff = currentXP - previousXP;
    
    if (xpDiff > 0) {
      setXpFeedback({
        visible: true,
        xp: xpDiff,
        lastXP: currentXP
      });
      
      // Masquer après 2 secondes
      setTimeout(() => {
        setXpFeedback(prev => ({ ...prev, visible: false }));
      }, 2000);
    } else {
      xpFeedback.lastXP = currentXP;
    }
  }, [userData.xp, loading]);

  if (!userId) {
    return (
      <View style={styles.container}>
        <View style={styles.notConnectedContainer}>
          <Text style={styles.notConnectedText}>
            🔐 Connecte-toi pour voir ta progression
          </Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Chargement de ta progression...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>❌ Erreur</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.retryText}>Réessaie plus tard</Text>
        </View>
      </View>
    );
  }

  const stats = getUserStats();

  return (
    <View style={styles.container}>
      {/* Header avec niveau et avatar */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <LevelBadge
            level={stats.level}
            levelName={stats.levelName}
            animated={true}
            style={{ transform: [{ scale: levelTextAnim }] }}
          />
          
          {/* Avatar */}
          <View style={styles.avatarContainer}>
            {avatarInfo ? (
              <View style={[styles.avatar, { borderColor: avatarInfo.color }]}>
                <Text style={styles.avatarIcon}>
                  {avatarInfo.icon}
                </Text>
              </View>
            ) : (
              <View style={[styles.avatar, styles.defaultAvatar]}>
                <Text style={styles.defaultAvatarText}>
                  {userData.username ? userData.username.charAt(0).toUpperCase() : '?'}
                </Text>
              </View>
            )}
            <Text style={styles.avatarName}>
              {avatarInfo ? avatarInfo.name : (userData.username || 'Joueur')}
            </Text>
          </View>
        </View>
      </View>

      {/* Stats principales */}
      <View style={styles.statsContainer}>
        <View style={styles.statRow}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>💪 XP Total</Text>
            <Text style={styles.statValue}>{stats.xp}</Text>
          </View>
        </View>
        
        <View style={styles.statRow}>
          <View style={styles.statItem}>
            <StreakDisplay
              streak={stats.streak}
              showIcon={true}
              showDays={true}
            />
          </View>
        </View>
      </View>

      {/* Barre de progression */}
      <View style={styles.progressContainer}>
        <Text style={styles.progressLabel}>
          Niveau {stats.level} → {stats.level + 1}
        </Text>
        <ProgressBar
          percentage={stats.progressPercentage}
          currentLevel={stats.level}
          height={25}
          showPercentage={true}
          customColor={getColorByLevel(stats.level)}
        />
        <Text style={styles.progressInfo}>
          {stats.xp} / {stats.xpForNextLevel} XP
        </Text>
      </View>

      {/* Dernière activité */}
      {stats.lastActivityFormatted && (
        <View style={styles.statRow}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>📅 Dernière activité</Text>
            <Text style={styles.statValue}>
              {stats.lastActivityFormatted}
            </Text>
          </View>
        </View>
      )}

      {/* Feedback XP animé */}
      <XPGainAnimation
        xp={xpFeedback.xp}
        visible={xpFeedback.visible}
      />

      {/* Modale de Level Up */}
      <LevelUpModal
        visible={levelUpModal.visible}
        onClose={() => setLevelUpModal(prev => ({ ...prev, visible: false }))}
        newLevel={levelUpModal.newLevel}
        oldLevel={levelUpModal.oldLevel}
      />
    </View>
  );
};

const getLevelColor = (level) => {
  const colors = {
    1: '#4CAF50', // Vert
    2: '#FF9800', // Orange
    3: '#2196F3', // Bleu
    4: '#9C27B0', // Indigo
    5: '#E91E63'  // Rouge
  };
  return colors[level] || colors[1];
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#F8F9FA',
  },
  header: {
    marginBottom: 30,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  avatarContainer: {
    alignItems: 'center',
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F0F0F0',
    borderWidth: 3,
    borderColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
  defaultAvatar: {
    backgroundColor: '#E0E0E0',
    borderColor: '#E0E0E0',
  },
  defaultAvatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#666',
  },
  avatarIcon: {
    fontSize: 30,
  },
  avatarName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 8,
    textAlign: 'center',
  },
  notConnectedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notConnectedText: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 10,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FF3B30',
    marginBottom: 10,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 10,
  },
  retryText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  levelBadge: {
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  levelText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  levelName: {
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 4,
  },
  statsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  statItem: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 16,
    color: '#666',
    marginBottom: 5,
    textAlign: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  progressContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  progressLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 10,
  },
  progressBar: {
    height: 25,
    backgroundColor: '#E0E0E0',
    borderRadius: 12.5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 12.5,
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
    fontSize: 14,
  },
  progressInfo: {
    textAlign: 'center',
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  xpFeedbackContainer: {
    position: 'absolute',
    top: 100,
    right: 20,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
    zIndex: 1000,
  },
  xpFeedbackText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
});

export default UserProgress;
