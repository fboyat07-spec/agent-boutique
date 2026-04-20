import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, ScrollView } from 'react-native';
import useMissionService from '../hooks/missionService';

const DailyMissions = ({ userId }) => {
  const {
    missions,
    missionProgress,
    answerQuestion,
    gainXP,
    maintainStreak,
    getMissionStatus
  } = useMissionService(userId);

  const [animatedMissions, setAnimatedMissions] = useState({});

  // Animer une mission complétée
  const animateMissionComplete = (missionId) => {
    setAnimatedMissions(prev => ({
      ...prev,
      [missionId]: {
        animating: true,
        checked: true
      }
    }));

    // Finir l'animation après 1 seconde
    setTimeout(() => {
      setAnimatedMissions(prev => ({
        ...prev,
        [missionId]: {
          animating: false,
          checked: true
        }
      }));
    }, 1000);
  };

  // Gérer le clic sur une mission
  const handleMissionPress = async (mission) => {
    if (mission.completed) return;

    switch (mission.id) {
      case 'daily_answer_questions':
        await answerQuestion();
        break;
      case 'daily_gain_xp':
        // Cette mission est complétée automatiquement via gainXP()
        break;
      case 'daily_return_streak':
        await maintainStreak(1);
        break;
    }
  };

  // Calculer la progression pour chaque mission
  const getMissionProgress = (mission) => {
    switch (mission.id) {
      case 'daily_answer_questions':
        return {
          current: missionProgress.questionsAnswered,
          target: mission.target,
          percentage: Math.round((missionProgress.questionsAnswered / mission.target) * 100)
        };
      case 'daily_gain_xp':
        return {
          current: missionProgress.xpGained,
          target: mission.target,
          percentage: Math.round((missionProgress.xpGained / mission.target) * 100)
        };
      case 'daily_return_streak':
        return {
          current: missionProgress.streakDays,
          target: mission.target,
          percentage: Math.round((missionProgress.streakDays / mission.target) * 100)
        };
      default:
        return { current: 0, target: 1, percentage: 0 };
    }
  };

  // Obtenir l'icône de la mission
  const getMissionIcon = (mission) => {
    switch (mission.id) {
      case 'daily_answer_questions':
        return '❓';
      case 'daily_gain_xp':
        return '💪';
      case 'daily_return_streak':
        return '🔥';
      default:
        return '📋';
    }
  };

  // Obtenir la couleur de la mission
  const getMissionColor = (mission) => {
    if (mission.completed) return '#4CAF50'; // Vert pour complétée
    return '#FF9800'; // Orange pour en cours
  };

  if (!userId) {
    return (
      <View style={styles.container}>
        <Text style={styles.notConnectedText}>
          🔐 Connecte-toi pour voir tes missions quotidiennes
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🎯 Missions Quotidiennes</Text>
      
      <ScrollView style={missions.missionsList}>
        {missions.map((mission) => {
          const progress = getMissionProgress(mission);
          const isAnimating = animatedMissions[mission.id]?.animating;
          const isChecked = animatedMissions[mission.id]?.checked;
          
          return (
            <Animated.View
              key={mission.id}
              style={[
                styles.missionCard,
                {
                  opacity: isAnimating ? 0.7 : 1,
                  transform: [{
                    scale: isAnimating ? 0.95 : 1
                  }]
                }
              ]}
            >
              <TouchableOpacity
                style={styles.missionContent}
                onPress={() => handleMissionPress(mission)}
                disabled={mission.completed}
                activeOpacity={0.8}
              >
                {/* Icône et titre */}
                <View style={styles.missionHeader}>
                  <Text style={styles.missionIcon}>
                    {getMissionIcon(mission)}
                  </Text>
                  <View style={styles.missionTitleContainer}>
                    <Text style={styles.missionTitle}>
                      {mission.title}
                    </Text>
                    <Text style={styles.missionDescription}>
                      {mission.description}
                    </Text>
                  </View>
                </View>

                {/* Progression */}
                <View style={styles.progressContainer}>
                  <View style={styles.progressBar}>
                    <View style={[
                      styles.progressFill,
                      {
                        width: `${progress.percentage}%`,
                        backgroundColor: getMissionColor(mission)
                      }
                    ]} />
                  </View>
                  <Text style={styles.progressText}>
                    {progress.current}/{progress.target}
                  </Text>
                </View>

                {/* Récompense XP */}
                <View style={styles.rewardContainer}>
                  <Text style={styles.rewardLabel}>Récompense</Text>
                  <Text style={styles.rewardXP}>+{mission.xpReward} XP</Text>
                </View>

                {/* État et animation */}
                <View style={styles.statusContainer}>
                  {mission.completed ? (
                    <Animated.View
                      style={[
                        styles.checkContainer,
                        {
                          opacity: isChecked ? 1 : 0,
                          transform: [{
                            scale: isChecked ? 1 : 0
                          }]
                        }
                      ]}
                    >
                      <Text style={styles.checkIcon}>✅</Text>
                    </Animated.View>
                  ) : (
                    <View style={styles.incompleteContainer}>
                      <Text style={styles.incompleteText}>
                        {progress.percentage}% complété
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#F8F9FA',
  },
  notConnectedText: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    marginTop: 50,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  missionsList: {
    flex: 1,
  },
  missionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 20,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  missionContent: {
    flex: 1,
  },
  missionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  missionIcon: {
    fontSize: 32,
    marginRight: 15,
    textAlign: 'center',
  },
  missionTitleContainer: {
    flex: 1,
  },
  missionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  missionDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    marginRight: 10,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    minWidth: 50,
    textAlign: 'center',
  },
  rewardContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0F8FF',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 10,
  },
  rewardLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  rewardXP: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkContainer: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  checkIcon: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  incompleteContainer: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    backgroundColor: '#FFF3E0',
  },
  incompleteText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FF9800',
  },
});

export default DailyMissions;
