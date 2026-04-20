import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  Modal,
  Animated,
  Dimensions
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

const { width, height } = Dimensions.get('window');

const RewardScreen = ({ student }) => {
  const navigation = useNavigation();
  const [userCoins, setUserCoins] = useState(0);
  const [rewards, setRewards] = useState([]);
  const [selectedReward, setSelectedReward] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [fadeAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    loadRewards();
    if (student) {
      setUserCoins(student.coins || 0);
    }
  }, [student]);

  useEffect(() => {
    if (rewards.length > 0) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true
      }).start();
    }
  }, [rewards]);

  const loadRewards = async () => {
    try {
      setLoading(true);
      
      // Mock rewards data
      const mockRewards = [
        {
          id: 'cinema_trip',
          name: 'Sortie au cinéma',
          description: 'Une sortie au cinéma pour voir le film de ton choix',
          category: 'activities',
          coin_cost: 500,
          icon: 'film',
          color: '#FF6B6B',
          available: true,
          image: 'https://via.placeholder.com/100'
        },
        {
          id: 'ice_cream',
          name: 'Glace artisanale',
          description: 'Une glace à l\'artisanat local',
          category: 'activities',
          coin_cost: 100,
          icon: 'ice-cream',
          color: '#4ECDC4',
          available: true,
          image: 'https://via.placeholder.com/100'
        },
        {
          id: 'extra_screen_time',
          name: 'Temps d\'écran bonus',
          description: '30 minutes de temps d\'écran supplémentaire',
          category: 'privileges',
          coin_cost: 150,
          icon: 'phone-portrait',
          color: '#FFD93D',
          available: true,
          image: 'https://via.placeholder.com/100'
        },
        {
          id: 'choose_dinner',
          name: 'Choisir le dîner',
          description: 'Choisir le menu du dîner pour toute la famille',
          category: 'privileges',
          coin_cost: 300,
          icon: 'restaurant',
          color: '#A8E6CF',
          available: true,
          image: 'https://via.placeholder.com/100'
        },
        {
          id: 'book_choice',
          name: 'Livre au choix',
          description: 'Un livre de ton choix dans une librairie',
          category: 'items',
          coin_cost: 350,
          icon: 'book',
          color: '#C7CEEA',
          available: true,
          image: 'https://via.placeholder.com/100'
        },
        {
          id: 'small_toy',
          name: 'Jouet petit budget',
          description: 'Un jouet de moins de 15 euros',
          category: 'items',
          coin_cost: 250,
          icon: 'gift',
          color: '#FFDAB9',
          available: true,
          image: 'https://via.placeholder.com/100'
        }
      ];

      const mockCategories = [
        { id: 'all', name: 'Toutes', icon: 'grid', color: '#667EEA' },
        { id: 'activities', name: 'Activités', icon: 'bicycle', color: '#FF6B6B' },
        { id: 'privileges', name: 'Privilèges', icon: 'star', color: '#FFD93D' },
        { id: 'items', name: 'Objets', icon: 'gift', color: '#4ECDC4' }
      ];

      setRewards(mockRewards);
      setCategories(mockCategories);
      setLoading(false);
    } catch (error) {
      console.error('Error loading rewards:', error);
      setLoading(false);
    }
  };

  const handleRewardPress = (reward) => {
    setSelectedReward(reward);
    setShowModal(true);
  };

  const handleRequestReward = () => {
    if (!selectedReward) return;

    if (userCoins < selectedReward.coin_cost) {
      Alert.alert(
        'Pièces insuffisantes',
        `Tu as besoin de ${selectedReward.coin_cost} pièces pour cette récompense. Tu en as actuellement ${userCoins}.`,
        [{ text: 'OK' }]
      );
      return;
    }

    Alert.alert(
      'Demander la récompense',
      `Veux-tu vraiment demander "${selectedReward.name}" pour ${selectedReward.coin_cost} pièces?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Demander',
          onPress: () => {
            // Here you would make an API call to request the reward
            Alert.alert(
              'Demande envoyée!',
              'Ta demande a été envoyée à tes parents. Ils recevront une notification bientôt.',
              [
                {
                  text: 'OK',
                  onPress: () => {
                    setShowModal(false);
                    setUserCoins(userCoins - selectedReward.coin_cost);
                  }
                }
              ]
            );
          }
        }
      ]
    );
  };

  const filteredRewards = selectedCategory === 'all' 
    ? rewards 
    : rewards.filter(reward => reward.category === selectedCategory);

  const renderHeader = () => (
    <View style={styles.header}>
      <LinearGradient
        colors={['#667EEA', '#764BA2']}
        style={styles.headerGradient}
      >
        <View style={styles.headerContent}>
          <View style={styles.headerTop}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="arrow-back" size={24} color="white" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Récompenses</Text>
            <View style={styles.placeholder} />
          </View>
          
          <View style={styles.coinsContainer}>
            <View style={styles.coinsDisplay}>
              <Ionicons name="cash" size={28} color="#FFD93D" />
              <Text style={styles.coinsText}>{userCoins}</Text>
            </View>
            <Text style={styles.coinsLabel}>Pièces disponibles</Text>
          </View>
        </View>
      </LinearGradient>
    </View>
  );

  const renderCategories = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.categoriesContainer}
      contentContainerStyle={styles.categoriesContent}
    >
      {categories.map((category) => (
        <TouchableOpacity
          key={category.id}
          style={[
            styles.categoryButton,
            selectedCategory === category.id && styles.selectedCategoryButton,
            { borderColor: category.color }
          ]}
          onPress={() => setSelectedCategory(category.id)}
        >
          <Ionicons
            name={category.icon}
            size={20}
            color={selectedCategory === category.id ? category.color : '#666'}
          />
          <Text style={[
            styles.categoryText,
            selectedCategory === category.id && { color: category.color }
          ]}>
            {category.name}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const renderRewardCard = (reward) => {
    const canAfford = userCoins >= reward.coin_cost;
    const isAvailable = reward.available;

    return (
      <Animated.View
        key={reward.id}
        style={[
          styles.rewardCard,
          { opacity: fadeAnim }
        ]}
      >
        <TouchableOpacity
          style={[
            styles.rewardCardContent,
            !isAvailable && styles.disabledRewardCard
          ]}
          onPress={() => isAvailable && handleRewardPress(reward)}
          disabled={!isAvailable}
        >
          <View style={styles.rewardImageContainer}>
            <Image
              source={{ uri: reward.image }}
              style={styles.rewardImage}
              resizeMode="cover"
            />
            <View style={[styles.rewardIcon, { backgroundColor: reward.color }]}>
              <Ionicons name={reward.icon} size={20} color="white" />
            </View>
          </View>
          
          <View style={styles.rewardInfo}>
            <Text style={styles.rewardName}>{reward.name}</Text>
            <Text style={styles.rewardDescription}>{reward.description}</Text>
            
            <View style={styles.rewardFooter}>
              <View style={styles.rewardCost}>
                <Ionicons name="cash" size={16} color="#FFD93D" />
                <Text style={styles.rewardCostText}>{reward.coin_cost}</Text>
              </View>
              
              {!canAfford && (
                <View style={styles.insufficientBadge}>
                  <Text style={styles.insufficientText}>
                    Manque {reward.coin_cost - userCoins}
                  </Text>
                </View>
              )}
              
              {isAvailable && canAfford && (
                <View style={styles.availableBadge}>
                  <Text style={styles.availableText}>Disponible</Text>
                </View>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderRewardModal = () => (
    <Modal
      visible={showModal}
      transparent
      animationType="fade"
      onRequestClose={() => setShowModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {selectedReward && (
            <>
              <View style={styles.modalHeader}>
                <Image
                  source={{ uri: selectedReward.image }}
                  style={styles.modalImage}
                  resizeMode="cover"
                />
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => setShowModal(false)}
                >
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>
              
              <View style={styles.modalBody}>
                <Text style={styles.modalTitle}>{selectedReward.name}</Text>
                <Text style={styles.modalDescription}>
                  {selectedReward.description}
                </Text>
                
                <View style={styles.modalDetails}>
                  <View style={styles.modalDetail}>
                    <Ionicons name="cash" size={20} color="#FFD93D" />
                    <Text style={styles.modalDetailText}>
                      Coût: {selectedReward.coin_cost} pièces
                    </Text>
                  </View>
                  
                  <View style={styles.modalDetail}>
                    <Ionicons name="time" size={20} color="#667EEA" />
                    <Text style={styles.modalDetailText}>
                      Validation parentale requise
                    </Text>
                  </View>
                </View>
                
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.cancelModalButton}
                    onPress={() => setShowModal(false)}
                  >
                    <Text style={styles.cancelModalText}>Annuler</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[
                      styles.requestButton,
                      !canAfford && styles.disabledRequestButton
                    ]}
                    onPress={handleRequestReward}
                    disabled={!canAfford}
                  >
                    <Text style={styles.requestButtonText}>
                      {canAfford ? 'Demander' : 'Pièces insuffisantes'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );

  const renderLoading = () => (
    <View style={styles.loadingContainer}>
      <Ionicons name="gift" size={48} color="#667EEA" />
      <Text style={styles.loadingText}>Chargement des récompenses...</Text>
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="gift-outline" size={64} color="#CCC" />
      <Text style={styles.emptyTitle}>Aucune récompense disponible</Text>
      <Text style={styles.emptyDescription}>
        Les récompenses apparaîtront ici bientôt!
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {renderHeader()}
      {renderCategories()}
      
      {loading ? (
        renderLoading()
      ) : filteredRewards.length === 0 ? (
        renderEmptyState()
      ) : (
        <ScrollView
          style={styles.rewardsList}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.rewardsListContent}
        >
          {filteredRewards.map(renderRewardCard)}
        </ScrollView>
      )}
      
      {renderRewardModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA'
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
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white'
  },
  placeholder: {
    width: 40
  },
  coinsContainer: {
    alignItems: 'center'
  },
  coinsDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20
  },
  coinsText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginLeft: 8
  },
  coinsLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 5
  },
  categoriesContainer: {
    marginTop: 20,
    paddingLeft: 20
  },
  categoriesContent: {
    paddingRight: 20
  },
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    marginRight: 10,
    borderWidth: 2,
    backgroundColor: 'white'
  },
  selectedCategoryButton: {
    backgroundColor: '#F0F4FF'
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginLeft: 6
  },
  rewardsList: {
    flex: 1,
    paddingHorizontal: 20
  },
  rewardsListContent: {
    paddingBottom: 20
  },
  rewardCard: {
    marginBottom: 15
  },
  rewardCardContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 15,
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5
  },
  disabledRewardCard: {
    opacity: 0.6
  },
  rewardImageContainer: {
    position: 'relative',
    marginRight: 15
  },
  rewardImage: {
    width: 80,
    height: 80,
    borderRadius: 15
  },
  rewardIcon: {
    position: 'absolute',
    bottom: -5,
    right: -5,
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'white'
  },
  rewardInfo: {
    flex: 1
  },
  rewardName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5
  },
  rewardDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 15,
    flex: 1
  },
  rewardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  rewardCost: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  rewardCostText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 5
  },
  insufficientBadge: {
    backgroundColor: '#FFF5F5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10
  },
  insufficientText: {
    fontSize: 12,
    color: '#FF6B6B',
    fontWeight: '600'
  },
  availableBadge: {
    backgroundColor: '#E8F8F7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10
  },
  availableText: {
    fontSize: 12,
    color: '#4ECDC4',
    fontWeight: '600'
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    width: '100%',
    maxWidth: 400,
    maxHeight: height * 0.8,
    overflow: 'hidden'
  },
  modalHeader: {
    position: 'relative',
    height: 200
  },
  modalImage: {
    width: '100%',
    height: '100%'
  },
  closeButton: {
    position: 'absolute',
    top: 15,
    right: 15,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  modalBody: {
    padding: 25
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10
  },
  modalDescription: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
    marginBottom: 20
  },
  modalDetails: {
    marginBottom: 25
  },
  modalDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10
  },
  modalDetailText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8
  },
  modalActions: {
    flexDirection: 'row',
    gap: 15
  },
  cancelModalButton: {
    flex: 1,
    padding: 15,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E9ECEF',
    justifyContent: 'center',
    alignItems: 'center'
  },
  cancelModalText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666'
  },
  requestButton: {
    flex: 2,
    padding: 15,
    borderRadius: 12,
    backgroundColor: '#667EEA',
    justifyContent: 'center',
    alignItems: 'center'
  },
  disabledRequestButton: {
    backgroundColor: '#E9ECEF'
  },
  requestButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  loadingText: {
    fontSize: 18,
    color: '#666',
    marginTop: 20
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#666',
    marginTop: 20,
    marginBottom: 10
  },
  emptyDescription: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center'
  }
});

export default RewardScreen;
