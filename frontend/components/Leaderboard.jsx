import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { collection, query, orderBy, limit, getDocs, where } from 'firebase/firestore';
import { db } from '../config/firebaseClean';
import { getAvatarById } from '../hooks/avatarService';

const Leaderboard = ({ userId, currentUsername }) => {
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Récupérer les données du leaderboard
  const fetchLeaderboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Requête optimisée avec limit et orderBy
      const leaderboardQuery = query(
        collection(db, 'users'),
        where('xp', '>', 0), // Exclure les utilisateurs avec 0 XP
        orderBy('xp', 'desc'),
        limit(10)
      );

      const querySnapshot = await getDocs(leaderboardQuery);
      const leaderboard = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        leaderboard.push({
          id: doc.id,
          username: data.username || 'Anonymous',
          avatar: data.avatar || null,
          xp: data.xp || 0,
          level: data.level || 1,
          streak: data.streak || 0,
          isCurrentUser: doc.id === userId
        });
      });

      setLeaderboardData(leaderboard);
      console.log(`📊 Leaderboard chargé: ${leaderboard.length} utilisateurs`);
    } catch (error) {
      console.error('❌ Erreur chargement leaderboard:', error);
      setError('Impossible de charger le classement');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  // Rafraîchir le leaderboard
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchLeaderboard();
  }, [fetchLeaderboard]);

  // Charger les données au montage
  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  // Obtenir la couleur du rang
  const getRankColor = (rank) => {
    switch (rank) {
      case 1:
        return '#FFD700'; // Or
      case 2:
        return '#C0C0C0'; // Argent
      case 3:
        return '#CD7F32'; // Bronze
      default:
        return '#666666'; // Gris
    }
  };

  // Obtenir l'icône du rang
  const getRankIcon = (rank) => {
    switch (rank) {
      case 1:
        return '🥇';
      case 2:
        return '🥈';
      case 3:
        return '🥉';
      default:
        return `#${rank}`;
    }
  };

  // Obtenir la couleur de l'XP selon le rang
  const getXPColor = (rank) => {
    if (rank <= 3) return '#333333'; // Noir pour top 3
    return '#666666'; // Gris pour les autres
  };

  // Obtenir le style de l'utilisateur actuel
  const getCurrentUserStyle = (isCurrentUser) => {
    return isCurrentUser ? styles.currentUserCard : styles.userCard;
  };

  // Obtenir l'avatar par défaut
  const getDefaultAvatar = (username) => {
    const firstLetter = username ? username.charAt(0).toUpperCase() : 'A';
    return {
      type: 'text',
      content: firstLetter,
      color: '#007AFF'
    };
  };

  // Obtenir l'avatar d'un utilisateur
  const getUserAvatar = (user) => {
    if (user.avatar) {
      return getAvatarById(user.avatar);
    }
    return getDefaultAvatar(user.username);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Chargement du classement...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>❌ {error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchLeaderboard}>
            <Text style={styles.retryButtonText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>🏆 Classement</Text>
        <TouchableOpacity 
          style={styles.refreshButton} 
          onPress={handleRefresh}
          disabled={refreshing}
        >
          <ActivityIndicator 
            size="small" 
            color="#007AFF" 
            animating={refreshing} 
          />
          <Text style={styles.refreshText}>Actualiser</Text>
        </TouchableOpacity>
      </View>

      {/* Liste du leaderboard */}
      <ScrollView 
        style={styles.leaderboardList}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#007AFF']}
          />
        }
      >
        {leaderboardData.map((user, index) => {
          const rank = index + 1;
          const rankIcon = getRankIcon(rank);
          const rankColor = getRankColor(rank);
          const xpColor = getXPColor(rank);
          const userStyle = getCurrentUserStyle(user.isCurrentUser);
          const avatar = getUserAvatar(user);

          return (
            <View 
              key={user.id} 
              style={[
                styles.userCard,
                userStyle,
                { borderLeftColor: rankColor }
              ]}
            >
              {/* Rang */}
              <View style={styles.rankContainer}>
                <Text style={[styles.rankIcon, { color: rankColor }]}>
                  {rankIcon}
                </Text>
                <Text style={[styles.rankNumber, { color: rankColor }]}>
                  {rank > 3 ? `#${rank}` : ''}
                </Text>
              </View>

              {/* Avatar */}
              <View style={styles.avatarContainer}>
                {avatar.type === 'image' ? (
                  <Image 
                    source={{ uri: avatar.content }} 
                    style={styles.avatarImage}
                  />
                ) : (
                  <View style={[
                    styles.avatarPlaceholder,
                    { backgroundColor: avatar.color }
                  ]}>
                    <Text style={styles.avatarText}>
                      {avatar.content}
                    </Text>
                  </View>
                )}
              </View>

              {/* Informations utilisateur */}
              <View style={styles.userInfoContainer}>
                <View style={styles.usernameContainer}>
                  <Text style={styles.username}>
                    {user.username}
                  </Text>
                  {user.isCurrentUser && (
                    <View style={styles.currentBadge}>
                      <Text style={styles.currentBadgeText}>VOUS</Text>
                    </View>
                  )}
                </View>
                
                <View style={styles.statsContainer}>
                  <Text style={[styles.xpText, { color: xpColor }]}>
                    💪 {user.xp.toLocaleString()} XP
                  </Text>
                  <Text style={styles.levelText}>
                    🎯 Niveau {user.level}
                  </Text>
                  <Text style={styles.streakText}>
                    🔥 {user.streak} jours
                  </Text>
                </View>
              </View>
            </View>
          );
        })}

        {/* Message si pas de données */}
        {leaderboardData.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              🎮 Aucun joueur dans le classement pour le moment
            </Text>
            <Text style={styles.emptySubtext}>
              Soit le premier à jouer et à gagner de l'XP !
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
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
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#FF3B30',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 40,
    paddingBottom: 15,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
  },
  refreshText: {
    fontSize: 14,
    color: '#007AFF',
    marginLeft: 8,
  },
  leaderboardList: {
    flex: 1,
    padding: 0,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 15,
    marginHorizontal: 20,
    marginVertical: 8,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderLeftWidth: 4,
    borderLeftColor: '#666666',
  },
  currentUserCard: {
    backgroundColor: '#E3F2FD',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  rankContainer: {
    width: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankIcon: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  rankNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  avatarContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginLeft: 15,
    marginRight: 15,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 25,
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  userInfoContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  usernameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  username: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  currentBadge: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    marginLeft: 10,
  },
  currentBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  xpText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 15,
  },
  levelText: {
    fontSize: 14,
    color: '#666',
    marginRight: 15,
  },
  streakText: {
    fontSize: 14,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    marginBottom: 10,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export default Leaderboard;
