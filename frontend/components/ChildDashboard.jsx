import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Dimensions,
  Image,
  Alert
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

const { width, height } = Dimensions.get('window');

const ChildDashboard = ({ student, onLogout }) => {
  const navigation = useNavigation();
  const [scrollY] = useState(new Animated.Value(0));
  const [userStats, setUserStats] = useState({
    level: 1,
    xp: 0,
    coins: 50,
    streak: 0,
    badges: []
  });
  const [dailyProgress, setDailyProgress] = useState({
    exercises: 0,
    target: 10,
    accuracy: 0,
    time: 0
  });

  useEffect(() => {
    if (student) {
      setUserStats({
        level: student.level || 1,
        xp: student.xp || 0,
        coins: student.coins || 50,
        streak: student.streak || 0,
        badges: student.badges || []
      });
    }
  }, [student]);

  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [1, 0.8],
    extrapolate: 'clamp'
  });

  const headerTranslateY = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [0, -20],
    extrapolate: 'clamp'
  });

  const menuItems = [
    {
      id: 'exercises',
      title: 'Exercices',
      icon: 'fitness-outline',
      color: '#FF6B6B',
      gradient: ['#FF6B6B', '#FF8E53'],
      screen: 'Exercises',
      description: 'Pratique et améliore-toi'
    },
    {
      id: 'diagnostic',
      title: 'Diagnostic',
      icon: 'analytics-outline',
      color: '#4ECDC4',
      gradient: ['#4ECDC4', '#44A08D'],
      screen: 'Diagnostic',
      description: 'Teste tes connaissances'
    },
    {
      id: 'ai-tutor',
      title: 'Tuteur IA',
      icon: 'robot-outline',
      color: '#FFD93D',
      gradient: ['#FFD93D', '#FCB045'],
      screen: 'AITutor',
      description: 'Apprends avec l\'IA'
    },
    {
      id: 'rewards',
      title: 'Récompenses',
      icon: 'gift-outline',
      color: '#A8E6CF',
      gradient: ['#A8E6CF', '#7FD1AE'],
      screen: 'Rewards',
      description: 'Gagne des prix'
    },
    {
      id: 'progress',
      title: 'Progrès',
      icon: 'trending-up-outline',
      color: '#C7CEEA',
      gradient: ['#C7CEEA', '#B2B7E0'],
      screen: 'Progress',
      description: 'Vois tes progrès'
    },
    {
      id: 'friends',
      title: 'Amis',
      icon: 'people-outline',
      color: '#FFDAB9',
      gradient: ['#FFDAB9', '#FFB88C'],
      screen: 'Friends',
      description: 'Défie tes amis'
    }
  ];

  const renderHeader = () => (
    <Animated.View style={[
      styles.header,
      {
        opacity: headerOpacity,
        transform: [{ translateY: headerTranslateY }]
      }
    ]}>
      <LinearGradient
        colors={['#667EEA', '#764BA2']}
        style={styles.headerGradient}
      >
        <View style={styles.headerContent}>
          <View style={styles.profileSection}>
            <View style={styles.avatarContainer}>
              <Image
                source={{ uri: student?.avatar || 'https://via.placeholder.com/80' }}
                style={styles.avatar}
              />
              <View style={styles.levelBadge}>
                <Text style={styles.levelText}>{userStats.level}</Text>
              </View>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{student?.first_name || 'Élève'}</Text>
              <Text style={styles.userGrade}>{student?.grade || 'CP'}</Text>
              <View style={styles.streakContainer}>
                <Ionicons name="flame" size={16} color="#FF6B6B" />
                <Text style={styles.streakText}>{userStats.streak} jours</Text>
              </View>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Ionicons name="star" size={24} color="#FFD93D" />
              <Text style={styles.statValue}>{userStats.xp}</Text>
              <Text style={styles.statLabel}>XP</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="cash" size={24} color="#4ECDC4" />
              <Text style={styles.statValue}>{userStats.coins}</Text>
              <Text style={styles.statLabel}>Pièces</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="trophy" size={24} color="#FF6B6B" />
              <Text style={styles.statValue}>{userStats.badges.length}</Text>
              <Text style={styles.statLabel}>Badges</Text>
            </View>
          </View>
        </View>
      </LinearGradient>
    </Animated.View>
  );

  const renderDailyProgress = () => (
    <View style={styles.dailyProgressContainer}>
      <Text style={styles.sectionTitle}>Aujourd'hui</Text>
      <View style={styles.progressCard}>
        <View style={styles.progressItem}>
          <View style={styles.progressHeader}>
            <Ionicons name="fitness" size={20} color="#FF6B6B" />
            <Text style={styles.progressLabel}>Exercices</Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[
              styles.progressFill,
              { width: `${(dailyProgress.exercises / dailyProgress.target) * 100}%` }
            ]} />
          </View>
          <Text style={styles.progressText}>
            {dailyProgress.exercises} / {dailyProgress.target}
          </Text>
        </View>

        <View style={styles.progressItem}>
          <View style={styles.progressHeader}>
            <Ionicons name="checkmark-circle" size={20} color="#4ECDC4" />
            <Text style={styles.progressLabel}>Précision</Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[
              styles.progressFill,
              { width: `${dailyProgress.accuracy * 100}%`, backgroundColor: '#4ECDC4' }
            ]} />
          </View>
          <Text style={styles.progressText}>
            {Math.round(dailyProgress.accuracy * 100)}%
          </Text>
        </View>

        <View style={styles.progressItem}>
          <View style={styles.progressHeader}>
            <Ionicons name="time" size={20} color="#FFD93D" />
            <Text style={styles.progressLabel}>Temps</Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[
              styles.progressFill,
              { width: `${(dailyProgress.time / 20) * 100}%`, backgroundColor: '#FFD93D' }
            ]} />
          </View>
          <Text style={styles.progressText}>
            {dailyProgress.time} min
          </Text>
        </View>
      </View>
    </View>
  );

  const renderMenuItem = (item) => (
    <TouchableOpacity
      key={item.id}
      style={styles.menuItem}
      onPress={() => navigation.navigate(item.screen)}
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={item.gradient}
        style={styles.menuItemGradient}
      >
        <View style={styles.menuItemContent}>
          <View style={styles.menuItemIcon}>
            <Ionicons name={item.icon} size={32} color="white" />
          </View>
          <Text style={styles.menuItemTitle}>{item.title}</Text>
          <Text style={styles.menuItemDescription}>{item.description}</Text>
          <View style={styles.menuItemArrow}>
            <Ionicons name="chevron-forward" size={20} color="white" />
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );

  const renderMotivationalQuote = () => (
    <View style={styles.quoteContainer}>
      <LinearGradient
        colors={['#667EEA', '#764BA2']}
        style={styles.quoteGradient}
      >
        <Ionicons name="chatbubble-quote" size={24} color="white" />
        <Text style={styles.quoteText}>
          Chaque exercice te rapproche de la maîtrise!
        </Text>
        <Text style={styles.quoteAuthor}>- Ton tuteur IA</Text>
      </LinearGradient>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      >
        {renderHeader()}
        {renderDailyProgress()}
        
        <View style={styles.menuContainer}>
          <Text style={styles.sectionTitle}>Que veux-tu faire?</Text>
          {menuItems.map(renderMenuItem)}
        </View>

        {renderMotivationalQuote()}

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={() => {
              Alert.alert(
                'Déconnexion',
                'Es-tu sûr de vouloir te déconnecter?',
                [
                  { text: 'Non', style: 'cancel' },
                  { text: 'Oui', onPress: onLogout }
                ]
              );
            }}
          >
            <Ionicons name="log-out" size={20} color="#666" />
            <Text style={styles.logoutText}>Déconnexion</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA'
  },
  scrollView: {
    flex: 1
  },
  header: {
    paddingTop: 50,
    paddingBottom: 20
  },
  headerGradient: {
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30
  },
  headerContent: {
    paddingHorizontal: 20
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 15
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: 'white'
  },
  levelBadge: {
    position: 'absolute',
    bottom: -5,
    right: -5,
    backgroundColor: '#FFD93D',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'white'
  },
  levelText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333'
  },
  userInfo: {
    flex: 1
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 5
  },
  userGrade: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 8
  },
  streakContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
    alignSelf: 'flex-start'
  },
  streakText: {
    fontSize: 14,
    color: 'white',
    marginLeft: 5,
    fontWeight: '600'
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around'
  },
  statItem: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 15,
    minWidth: 80
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginVertical: 2
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)'
  },
  dailyProgressContainer: {
    paddingHorizontal: 20,
    marginTop: 20
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15
  },
  progressCard: {
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5
  },
  progressItem: {
    marginBottom: 15
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  progressLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginLeft: 8
  },
  progressBar: {
    height: 8,
    backgroundColor: '#E9ECEF',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 5
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FF6B6B',
    borderRadius: 4
  },
  progressText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'right'
  },
  menuContainer: {
    paddingHorizontal: 20,
    marginTop: 20
  },
  menuItem: {
    marginBottom: 15,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8
  },
  menuItemGradient: {
    padding: 20,
    borderRadius: 20
  },
  menuItemContent: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  menuItemIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15
  },
  menuItemTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    flex: 1
  },
  menuItemDescription: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 2
  },
  menuItemArrow: {
    marginLeft: 10
  },
  quoteContainer: {
    paddingHorizontal: 20,
    marginTop: 20,
    marginBottom: 20
  },
  quoteGradient: {
    padding: 20,
    borderRadius: 15,
    alignItems: 'center'
  },
  quoteText: {
    fontSize: 16,
    color: 'white',
    textAlign: 'center',
    marginVertical: 10,
    fontStyle: 'italic'
  },
  quoteAuthor: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    fontStyle: 'italic'
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    alignItems: 'center'
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: 'white',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3
  },
  logoutText: {
    fontSize: 16,
    color: '#666',
    marginLeft: 8
  }
});

export default ChildDashboard;
