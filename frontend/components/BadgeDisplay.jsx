import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import BadgeUnlockModal from './BadgeUnlockModal';
import { checkAndUnlockBadges, getBadgeInfo, getBadgesByRarity } from '../hooks/badgeService';

const BadgeDisplay = ({ userId, userData }) => {
  const [unlockedModal, setUnlockedModal] = useState({
    visible: false,
    badgeId: null
  });

  const [badges, setBadges] = useState([]);
  const [selectedRarity, setSelectedRarity] = useState('all');

  // Vérifier les badges débloqués
  useEffect(() => {
    if (userData) {
      const { newBadges, allBadges } = checkAndUnlockBadges(userData);
      setBadges(allBadges);

      // Afficher la modal pour chaque nouveau badge
      newBadges.forEach((badgeId, index) => {
        setTimeout(() => {
          setUnlockedModal({
            visible: true,
            badgeId
          });
        }, index * 3500); // Espacer les animations
      });
    }
  }, [userData]);

  // Obtenir les badges filtrés par rareté
  const getFilteredBadges = () => {
    if (selectedRarity === 'all') {
      return badges.map(badgeId => ({
        id: badgeId,
        ...getBadgeInfo(badgeId)
      }));
    }

    const rarityGroups = getBadgesByRarity(badges);
    return rarityGroups[selectedRarity] || [];
  };

  // Fermer la modal
  const handleCloseModal = () => {
    setUnlockedModal({
      visible: false,
      badgeId: null
    });
  };

  // Obtenir la couleur de la rareté
  const getRarityColor = (rarity) => {
    switch (rarity) {
      case 'common':
        return '#9E9E9E'; // Gris
      case 'rare':
        return '#2196F3'; // Bleu
      case 'epic':
        return '#9C27B0'; // Violet
      case 'legendary':
        return '#FFD700'; // Or
      default:
        return '#9E9E9E';
    }
  };

  const filteredBadges = getFilteredBadges();
  const rarityGroups = getBadgesByRarity(badges);

  return (
    <View style={styles.container}>
      {/* Header avec filtres */}
      <View style={styles.header}>
        <Text style={styles.title}>🏆 Mes Badges</Text>
        
        <ScrollView 
          horizontal 
          style={styles.filterContainer}
          showsHorizontalScrollIndicator={false}
        >
          <TouchableOpacity
            style={[
              styles.filterButton,
              selectedRarity === 'all' && styles.filterButtonActive
            ]}
            onPress={() => setSelectedRarity('all')}
          >
            <Text style={[
              styles.filterText,
              selectedRarity === 'all' && styles.filterTextActive
            ]}>
              Tous ({badges.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterButton,
              selectedRarity === 'common' && styles.filterButtonActive
            ]}
            onPress={() => setSelectedRarity('common')}
          >
            <Text style={[
              styles.filterText,
              selectedRarity === 'common' && styles.filterTextActive
            ]}>
              Commun ({rarityGroups.common?.length || 0})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterButton,
              selectedRarity === 'rare' && styles.filterButtonActive
            ]}
            onPress={() => setSelectedRarity('rare')}
          >
            <Text style={[
              styles.filterText,
              selectedRarity === 'rare' && styles.filterTextActive
            ]}>
              Rare ({rarityGroups.rare?.length || 0})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterButton,
              selectedRarity === 'epic' && styles.filterButtonActive
            ]}
            onPress={() => setSelectedRarity('epic')}
          >
            <Text style={[
              styles.filterText,
              selectedRarity === 'epic' && styles.filterTextActive
            ]}>
              Épique ({rarityGroups.epic?.length || 0})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterButton,
              selectedRarity === 'legendary' && styles.filterButtonActive
            ]}
            onPress={() => setSelectedRarity('legendary')}
          >
            <Text style={[
              styles.filterText,
              selectedRarity === 'legendary' && styles.filterTextActive
            ]}>
              Légendaire ({rarityGroups.legendary?.length || 0})
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Grille de badges */}
      <ScrollView style={styles.badgesContainer}>
        <View style={styles.badgesGrid}>
          {filteredBadges.map((badge) => (
            <View
              key={badge.id}
              style={[
                styles.badgeCard,
                { borderColor: getRarityColor(badge.rarity) }
              ]}
            >
              <View style={styles.badgeIconContainer}>
                <Text style={styles.badgeIcon}>
                  {badge.icon}
                </Text>
                {/* Indicateur de rareté */}
                <View style={[
                  styles.rarityIndicator,
                  { backgroundColor: getRarityColor(badge.rarity) }
                ]} />
              </View>
              
              <Text style={styles.badgeName}>
                {badge.name}
              </Text>
              
              <Text style={styles.badgeDescription}>
                {badge.description}
              </Text>

              <Text style={[
                styles.badgeRarity,
                { color: getRarityColor(badge.rarity) }
              ]}>
                {badge.rarity.toUpperCase()}
              </Text>
            </View>
          ))}

          {/* Badges manquants */}
          {filteredBadges.length === 0 && (
            <View style={styles.noBadgesContainer}>
              <Text style={styles.noBadgesText}>
                {selectedRarity === 'all' 
                  ? 'Aucun badge débloqué pour le moment'
                  : `Aucun badge ${selectedRarity} débloqué`
                }
              </Text>
              <Text style={styles.noBadgesSubtext}>
                Continue à jouer pour débloquer de nouveaux badges !
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Modal de déblocage */}
      <BadgeUnlockModal
        visible={unlockedModal.visible}
        onClose={handleCloseModal}
        badgeId={unlockedModal.badgeId}
        autoHideDuration={3000}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
    textAlign: 'center',
  },
  filterContainer: {
    flexDirection: 'row',
  },
  filterButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  filterButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  filterText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  filterTextActive: {
    color: '#FFFFFF',
  },
  badgesContainer: {
    flex: 1,
    padding: 20,
  },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  badgeCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 15,
    marginBottom: 15,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  badgeIconContainer: {
    alignItems: 'center',
    marginBottom: 10,
    position: 'relative',
  },
  badgeIcon: {
    fontSize: 40,
    textAlign: 'center',
  },
  rarityIndicator: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  badgeName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 5,
  },
  badgeDescription: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 16,
  },
  badgeRarity: {
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  noBadgesContainer: {
    width: '100%',
    alignItems: 'center',
    marginTop: 50,
  },
  noBadgesText: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    marginBottom: 10,
  },
  noBadgesSubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export default BadgeDisplay;
