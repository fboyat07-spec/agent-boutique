import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Animated } from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebaseClean';
import { 
  getUnlockedAvatars, 
  getAvatarTier, 
  getAllAvatarTiers, 
  getAvatarProgress,
  isAvatarUnlocked 
} from '../hooks/avatarService';

const AvatarSelector = ({ userId, currentLevel, currentAvatar, onAvatarChange }) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState(currentAvatar);
  const [animatingAvatar, setAnimatingAvatar] = useState(null);
  const [scaleAnim] = useState(new Animated.Value(1));

  // Initialiser l'avatar sélectionné
  useEffect(() => {
    setSelectedAvatar(currentAvatar);
  }, [currentAvatar]);

  // Obtenir les avatars débloqués
  const unlockedAvatars = getUnlockedAvatars(currentLevel);
  const avatarProgress = getAvatarProgress(currentLevel);
  const allTiers = getAllAvatarTiers();

  // Sauvegarder l'avatar dans Firestore
  const saveAvatar = async (avatar) => {
    if (!userId || !avatar) return;

    try {
      const userDocRef = doc(db, 'users', userId);
      await updateDoc(userDocRef, {
        avatar: avatar,
        updatedAt: new Date()
      });

      setSelectedAvatar(avatar);
      onAvatarChange && onAvatarChange(avatar);
      
      console.log(`✅ Avatar sauvegardé: ${avatar.name}`);
    } catch (error) {
      console.error('❌ Erreur sauvegarde avatar:', error);
    }
  };

  // Animer la sélection d'avatar
  const animateAvatarSelection = (avatar) => {
    setAnimatingAvatar(avatar.id);
    
    // Animation de scale
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.8,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1.2,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      })
    ]).start(() => {
      setAnimatingAvatar(null);
    });
  };

  // Gérer la sélection d'avatar
  const handleAvatarSelect = (avatar) => {
    if (isAvatarUnlocked(avatar, currentLevel)) {
      animateAvatarSelection(avatar);
      setTimeout(() => saveAvatar(avatar), 400);
    }
  };

  // Rendre l'avatar actuel
  const renderCurrentAvatar = () => {
    if (!selectedAvatar) return null;
    
    const tier = getAvatarTier(currentLevel);
    const avatarColor = tier === 'legendary' ? '#FFD700' : 
                        tier === 'advanced' ? '#9C27B0' :
                        tier === 'intermediate' ? '#FF9800' : '#4CAF50';

    return (
      <View style={styles.currentAvatarContainer}>
        <View style={[styles.currentAvatar, { borderColor: avatarColor }]}>
          <Text style={styles.currentAvatarIcon}>
            {selectedAvatar.icon}
          </Text>
        </View>
        <Text style={styles.currentAvatarName}>
          {selectedAvatar.name}
        </Text>
      </View>
    );
  };

  // Rendre un avatar dans la grille
  const renderAvatar = (avatar) => {
    const isUnlocked = isAvatarUnlocked(avatar, currentLevel);
    const isAnimating = animatingAvatar === avatar.id;
    const isSelected = selectedAvatar?.id === avatar.id;

    return (
      <TouchableOpacity
        key={avatar.id}
        style={[
          styles.avatarCard,
          !isUnlocked && styles.avatarLocked,
          isSelected && styles.avatarSelected,
          isAnimating && styles.avatarAnimating
        ]}
        onPress={() => handleAvatarSelect(avatar)}
        disabled={!isUnlocked}
        activeOpacity={isUnlocked ? 0.8 : 1}
      >
        <Animated.View
          style={[
            styles.avatarContainer,
            {
              transform: [{ scale: isAnimating ? scaleAnim : 1 }]
            }
          ]}
        >
          <View style={[
            styles.avatarIcon,
            { backgroundColor: avatar.color }
          ]}>
            <Text style={styles.avatarIconText}>
              {avatar.icon}
            </Text>
          </View>
          
          <Text style={[
            styles.avatarName,
            !isUnlocked && styles.avatarNameLocked
          ]}>
            {avatar.name}
          </Text>
          
          {!isUnlocked && (
            <View style={styles.lockContainer}>
              <Text style={styles.lockText}>🔒</Text>
              <Text style={styles.unlockLevel}>
                Niv. {avatar.level}
              </Text>
            </View>
          )}
        </Animated.View>
      </TouchableOpacity>
    );
  };

  // Rendre la section de progression
  const renderProgressSection = () => {
    if (avatarProgress.unlocked) return null;

    return (
      <View style={styles.progressSection}>
        <Text style={styles.progressTitle}>
          🎯 Prochain palier d'avatar
        </Text>
        <View style={styles.progressBar}>
          <View style={[
            styles.progressFill,
            { width: `${avatarProgress.progress}%` }
          ]} />
        </View>
        <Text style={styles.progressText}>
          Niveau {avatarProgress.currentLevel} → {avatarProgress.nextLevel}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Avatar actuel */}
      <View style={styles.currentSection}>
        <Text style={styles.sectionTitle}>👤 Mon Avatar</Text>
        {renderCurrentAvatar()}
        <TouchableOpacity
          style={styles.changeButton}
          onPress={() => setModalVisible(true)}
        >
          <Text style={styles.changeButtonText}>Changer d'avatar</Text>
        </TouchableOpacity>
      </View>

      {/* Progression vers le prochain palier */}
      {renderProgressSection()}

      {/* Modal de sélection */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🎨 Choisir un avatar</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Avatars par paliers */}
            <ScrollView style={styles.avatarList}>
              {allTiers.map((tier) => (
                <View key={tier.name} style={styles.tierSection}>
                  <View style={styles.tierHeader}>
                    <Text style={styles.tierName}>{tier.displayName}</Text>
                    <Text style={styles.tierLevel}>
                      Niv. {tier.level}+
                    </Text>
                  </View>
                  
                  <View style={styles.avatarGrid}>
                    {tier.avatars.map(avatar => renderAvatar(avatar))}
                  </View>
                </View>
              ))}
            </ScrollView>

            {/* Bouton de fermeture */}
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.modalCloseButtonText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#F8F9FA',
  },
  currentSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
    textAlign: 'center',
  },
  currentAvatarContainer: {
    alignItems: 'center',
    marginBottom: 15,
  },
  currentAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
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
  currentAvatarIcon: {
    fontSize: 40,
  },
  currentAvatarName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 10,
  },
  changeButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  changeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  progressSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 15,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    maxHeight: '80%',
    width: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    color: '#666',
  },
  avatarList: {
    flex: 1,
  },
  tierSection: {
    marginBottom: 25,
  },
  tierHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  tierName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  tierLevel: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  avatarCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  avatarLocked: {
    opacity: 0.6,
  },
  avatarSelected: {
    borderColor: '#4CAF50',
    backgroundColor: '#E8F5E8',
  },
  avatarAnimating: {
    transform: [{ scale: 1.1 }],
  },
  avatarContainer: {
    alignItems: 'center',
  },
  avatarIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  avatarIconText: {
    fontSize: 24,
  },
  avatarName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  avatarNameLocked: {
    color: '#999',
  },
  lockContainer: {
    alignItems: 'center',
    marginTop: 5,
  },
  lockText: {
    fontSize: 16,
    marginBottom: 2,
  },
  unlockLevel: {
    fontSize: 12,
    color: '#FF9800',
    fontWeight: 'bold',
  },
  modalCloseButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    marginTop: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  modalCloseButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

export default AvatarSelector;
