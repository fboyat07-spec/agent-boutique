import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, Animated, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';
import { getBadgeInfo } from '../hooks/badgeService';

const BadgeUnlockModal = ({ 
  visible, 
  onClose, 
  badgeId,
  autoHideDuration = 3000 
}) => {
  const [fadeAnim] = useState(new Animated.Value(0));
  const [scaleAnim] = useState(new Animated.Value(0.5));
  const [badgeInfo, setBadgeInfo] = useState(null);

  // Obtenir les informations du badge
  useEffect(() => {
    if (badgeId) {
      const info = getBadgeInfo(badgeId);
      setBadgeInfo(info);
    }
  }, [badgeId]);

  // Animation d'entrée
  useEffect(() => {
    if (visible && badgeInfo) {
      // Vibration de succès
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Animation d'entrée
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        })
      ]).start();

      // Auto-disparition après la durée spécifiée
      if (autoHideDuration > 0) {
        setTimeout(() => {
          hideModal();
        }, autoHideDuration);
      }
    } else {
      // Animation de sortie
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.5,
          duration: 200,
          useNativeDriver: true,
        })
      ]).start();
    }
  }, [visible, badgeInfo, autoHideDuration]);

  // Cacher la modal
  const hideModal = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.5,
        duration: 200,
        useNativeDriver: true,
      })
    ]).start(() => {
      onClose();
    });
  };

  // Gérer le clic sur le bouton
  const handleContinue = () => {
    // Vibration légère de confirmation
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    hideModal();
  };

  // Obtenir la couleur selon la rareté
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

  // Obtenir le fond selon la rareté
  const getRarityBackground = (rarity) => {
    switch (rarity) {
      case 'common':
        return 'rgba(158, 158, 158, 0.1)'; // Gris transparent
      case 'rare':
        return 'rgba(33, 150, 243, 0.1)'; // Bleu transparent
      case 'epic':
        return 'rgba(156, 39, 176, 0.1)'; // Violet transparent
      case 'legendary':
        return 'rgba(255, 215, 0, 0.1)'; // Or transparent
      default:
        return 'rgba(158, 158, 158, 0.1)';
    }
  };

  if (!visible || !badgeInfo) return null;

  return (
    <Modal
      transparent={true}
      visible={visible}
      animationType="fade"
      onRequestClose={hideModal}
    >
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.modalContainer,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
              backgroundColor: getRarityBackground(badgeInfo.rarity)
            }
          ]}
        >
          {/* Icône du badge */}
          <View style={styles.iconContainer}>
            <Text style={styles.badgeIcon}>
              {badgeInfo.icon}
            </Text>
            {/* Éclat selon la rareté */}
            {badgeInfo.rarity === 'legendary' && (
              <View style={styles.legendaryGlow} />
            )}
            {badgeInfo.rarity === 'epic' && (
              <View style={styles.epicGlow} />
            )}
          </View>

          {/* Nom du badge */}
          <Text style={styles.badgeName}>
            {badgeInfo.name}
          </Text>

          {/* Description */}
          <Text style={styles.badgeDescription}>
            {badgeInfo.description}
          </Text>

          {/* Rareté */}
          <View style={styles.rarityContainer}>
            <Text style={[
              styles.rarityText,
              { color: getRarityColor(badgeInfo.rarity) }
            ]}>
              {badgeInfo.rarity.toUpperCase()}
            </Text>
          </View>

          {/* Bouton de continuation */}
          <TouchableOpacity
            style={[
              styles.continueButton,
              { backgroundColor: getRarityColor(badgeInfo.rarity) }
            ]}
            onPress={handleContinue}
            activeOpacity={0.8}
          >
            <Text style={styles.continueButtonText}>
              Continuer
            </Text>
          </TouchableOpacity>

          {/* Particules pour les badges légendaires */}
          {badgeInfo.rarity === 'legendary' && (
            <View style={styles.particlesContainer}>
              <Animated.View style={[styles.particle, styles.particle1]} />
              <Animated.View style={[styles.particle, styles.particle2]} />
              <Animated.View style={[styles.particle, styles.particle3]} />
              <Animated.View style={[styles.particle, styles.particle4]} />
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
    maxWidth: '80%',
    position: 'relative',
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  badgeIcon: {
    fontSize: 48,
    textAlign: 'center',
  },
  legendaryGlow: {
    position: 'absolute',
    top: -10,
    left: -10,
    right: -10,
    bottom: -10,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: 'rgba(255, 215, 0, 0.3)',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 8,
  },
  epicGlow: {
    position: 'absolute',
    top: -5,
    left: -5,
    right: -5,
    bottom: -5,
    borderRadius: 55,
    borderWidth: 2,
    borderColor: 'rgba(156, 39, 176, 0.3)',
    shadowColor: '#9C27B0',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  badgeName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  badgeDescription: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 24,
  },
  rarityContainer: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 15,
    marginBottom: 25,
    backgroundColor: '#F8F9FA',
  },
  rarityText: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  continueButton: {
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
    minWidth: 150,
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  particlesContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
  },
  particle: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFD700',
  },
  particle1: {
    top: '20%',
    left: '10%',
  },
  particle2: {
    top: '15%',
    right: '15%',
  },
  particle3: {
    bottom: '20%',
    left: '20%',
  },
  particle4: {
    bottom: '15%',
    right: '10%',
  },
});

export default BadgeUnlockModal;
