import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Animated } from 'react-native';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../config/firebaseClean';
import { 
  getAllShopItems, 
  getItemsByCategory, 
  canUserAfford, 
  getDiscountedPrice, 
  getCurrentDiscount,
  isItemPurchased,
  getRecommendedItems
} from '../hooks/shopService';
import useFeedback from '../hooks/useFeedback';

const Shop = ({ userId, userXP, userLevel, userPurchases, onPurchase }) => {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [animatingItem, setAnimatingItem] = useState(null);
  const [scaleAnim] = useState(new Animated.Value(1));

  // Intégrer le service de feedback
  const { purchaseFeedback } = useFeedback();

  // Obtenir tous les items et les items par catégorie
  const allItems = getAllShopItems();
  const categories = Object.keys(getItemsByCategory('')).map(cat => getItemsByCategory(cat));
  
  // Filtrer les items selon la catégorie sélectionnée
  const getFilteredItems = () => {
    if (selectedCategory === 'all') return allItems;
    return getItemsByCategory(selectedCategory);
  };

  const filteredItems = getFilteredItems();
  const recommendedItems = getRecommendedItems(userXP, userLevel, userPurchases);
  const currentDiscount = getCurrentDiscount(userLevel);

  // Acheter un item
  const purchaseItem = async (item) => {
    if (!userId) {
      Alert.alert('Erreur', 'Vous devez être connecté pour acheter des items');
      return;
    }

    // Vérifier si l'utilisateur a assez de XP
    const finalPrice = getDiscountedPrice(item.price, userLevel);
    if (!canUserAfford(userXP, finalPrice)) {
      Alert.alert('XP Insuffisant', `Il vous manque ${finalPrice - userXP} XP pour acheter cet item`);
      return;
    }

    // Vérifier si l'item est déjà acheté
    if (isItemPurchased(item.id, userPurchases)) {
      Alert.alert('Déjà Possédé', 'Vous possédez déjà cet item');
      return;
    }

    // Confirmer l'achat
    Alert.alert(
      'Confirmer l\'achat',
      `Voulez-vous acheter "${item.name}" pour ${finalPrice} XP ?\n\n${item.description}`,
      [
        { text: 'Annuler', style: 'cancel' },
        { 
          text: 'Acheter', 
          onPress: () => confirmPurchase(item, finalPrice)
        }
      ]
    );
  };

  // Confirmer et traiter l'achat
  const confirmPurchase = async (item, finalPrice) => {
    try {
      setAnimatingItem(item.id);
      
      // Animation de scale
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 0.9,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1.1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        })
      ]).start();

      // Mettre à jour Firestore
      const userDocRef = doc(db, 'users', userId);
      
      // Créer l'objet d'achat
      const purchase = {
        itemId: item.id,
        purchaseDate: new Date(),
        price: finalPrice,
        originalPrice: item.price,
        discount: item.price - finalPrice
      };

      // Ajouter une date d'expiration pour les boosts
      if (item.type === 'boost' && item.duration) {
        purchase.expiresAt = new Date(Date.now() + item.duration);
      }

      await updateDoc(userDocRef, {
        xp: userXP - finalPrice,
        purchases: arrayUnion(purchase),
        updatedAt: new Date()
      });

      console.log(`✅ Achat réussi: ${item.name} pour ${finalPrice} XP`);
      
      // Feedback audio et haptique
      await purchaseFeedback({
        amount: finalPrice,
        itemName: item.name,
        success: true
      });
      
      // Notifier le composant parent
      if (onPurchase) {
        onPurchase({
          item,
          finalPrice,
          remainingXP: userXP - finalPrice
        });
      }

      // Afficher une confirmation
      setTimeout(() => {
        Alert.alert(
          'Achat Réussi !',
          `Félicitations ! Vous avez acheté "${item.name}"${finalPrice < item.price ? ` avec une réduction de ${getCurrentDiscount(userLevel)}%` : ''} !`,
          [{ text: 'Super !' }]
        );
      }, 500);

    } catch (error) {
      console.error('❌ Erreur lors de l\'achat:', error);
      
      // Feedback d'erreur
      await purchaseFeedback({
        itemName: item.name,
        success: false,
        error: error.message
      });
      
      Alert.alert('Erreur d\'Achat', 'Une erreur est survenue lors de l\'achat. Veuillez réessayer.');
    } finally {
      setAnimatingItem(null);
    }
  };

  // Obtenir la couleur de la rareté
  const getRarityColor = (rarity) => {
    switch (rarity) {
      case 'common': return '#9E9E9E';
      case 'rare': return '#2196F3';
      case 'epic': return '#9C27B0';
      case 'legendary': return '#FFD700';
      default: return '#9E9E9E';
    }
  };

  // Obtenir le style de la rareté
  const getRarityStyle = (rarity) => {
    return {
      borderColor: getRarityColor(rarity),
      backgroundColor: `${getRarityColor(rarity)}15`
    };
  };

  // Rendre un item du shop
  const renderShopItem = (item) => {
    const isPurchased = isItemPurchased(item.id, userPurchases);
    const canAfford = canUserAfford(userXP, item.price);
    const finalPrice = getDiscountedPrice(item.price, userLevel);
    const hasDiscount = finalPrice < item.price;
    const isAnimating = animatingItem === item.id;

    return (
      <Animated.View
        key={item.id}
        style={[
          styles.itemCard,
          getRarityStyle(item.rarity),
          isPurchased && styles.itemPurchased,
          isAnimating && { transform: [{ scale: scaleAnim }] }
        ]}
      >
        {/* Icône et nom */}
        <View style={styles.itemHeader}>
          <View style={[styles.itemIcon, { backgroundColor: item.color || getRarityColor(item.rarity) }]}>
            <Text style={styles.itemIconText}>{item.icon}</Text>
          </View>
          <View style={styles.itemInfo}>
            <Text style={styles.itemName}>{item.name}</Text>
            <Text style={styles.itemDescription}>{item.description}</Text>
          </View>
        </View>

        {/* Prix et statut */}
        <View style={styles.itemFooter}>
          <View style={styles.priceContainer}>
            {hasDiscount && (
              <View style={styles.discountContainer}>
                <Text style={styles.originalPrice}>{item.price} XP</Text>
                <Text style={styles.discountBadge}>-{getCurrentDiscount(userLevel)}%</Text>
              </View>
            )}
            <Text style={[
              styles.itemPrice,
              !canAfford && styles.priceUnaffordable,
              hasDiscount && styles.discountedPrice
            ]}>
              {finalPrice} XP
            </Text>
          </View>

          {/* Bouton d'achat */}
          <TouchableOpacity
            style={[
              styles.purchaseButton,
              !canAfford && styles.buttonDisabled,
              isPurchased && styles.buttonPurchased
            ]}
            onPress={() => purchaseItem(item)}
            disabled={!canAfford || isPurchased || isAnimating}
            activeOpacity={0.8}
          >
            <Text style={[
              styles.purchaseButtonText,
              !canAfford && styles.buttonTextDisabled,
              isPurchased && styles.buttonTextPurchased
            ]}>
              {isPurchased ? 'Possédé' : canAfford ? 'Acheter' : 'XP Insuffisant'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Badge de rareté */}
        <View style={[styles.rarityBadge, { backgroundColor: getRarityColor(item.rarity) }]}>
          <Text style={styles.rarityText}>{item.rarity.toUpperCase()}</Text>
        </View>
      </Animated.View>
    );
  };

  // Rendre les catégories
  const renderCategoryButton = (categoryName, categoryData) => (
    <TouchableOpacity
      key={categoryName}
      style={[
        styles.categoryButton,
        selectedCategory === categoryName && styles.categoryButtonActive
      ]}
      onPress={() => setSelectedCategory(categoryName)}
    >
      <Text style={[
        styles.categoryButtonText,
        selectedCategory === categoryName && styles.categoryButtonTextActive
      ]}>
        {categoryName === 'all' ? 'Tous' : categoryData.category}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>🛍️ Shop</Text>
        <View style={styles.xpContainer}>
          <Text style={styles.xpText}>💎 {userXP} XP</Text>
          {currentDiscount > 0 && (
            <Text style={styles.discountText}>Réduction: -{currentDiscount}%</Text>
          )}
        </View>
      </View>

      {/* Catégories */}
      <ScrollView 
        horizontal 
        style={styles.categoriesContainer}
        showsHorizontalScrollIndicator={false}
      >
        <TouchableOpacity
          style={[
            styles.categoryButton,
            selectedCategory === 'all' && styles.categoryButtonActive
          ]}
          onPress={() => setSelectedCategory('all')}
        >
          <Text style={[
            styles.categoryButtonText,
            selectedCategory === 'all' && styles.categoryButtonTextActive
          ]}>
            Tous ({allItems.length})
          </Text>
        </TouchableOpacity>
        
        {categories.map(category => renderCategoryButton(category.category, category))}
      </ScrollView>

      {/* Recommandations */}
      {recommendedItems.length > 0 && (
        <View style={styles.recommendationsContainer}>
          <Text style={styles.recommendationsTitle}>🌟 Recommandé pour vous</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {recommendedItems.map(item => renderShopItem(item))}
          </ScrollView>
        </View>
      )}

      {/* Items du shop */}
      <ScrollView style={styles.itemsContainer}>
        <View style={styles.itemsGrid}>
          {filteredItems.map(item => renderShopItem(item))}
        </View>

        {/* Message si aucun item */}
        {filteredItems.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Aucun item dans cette catégorie</Text>
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
  xpContainer: {
    alignItems: 'flex-end',
  },
  xpText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  discountText: {
    fontSize: 12,
    color: '#FF9800',
    fontStyle: 'italic',
  },
  categoriesContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  categoryButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  categoryButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  categoryButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  categoryButtonTextActive: {
    color: '#FFFFFF',
  },
  recommendationsContainer: {
    backgroundColor: '#FFF3E0',
    padding: 15,
    marginHorizontal: 20,
    marginTop: 10,
    borderRadius: 10,
  },
  recommendationsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FF9800',
    marginBottom: 10,
  },
  itemsContainer: {
    flex: 1,
    padding: 20,
  },
  itemsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  itemCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 2,
    position: 'relative',
  },
  itemPurchased: {
    backgroundColor: '#F0F0F0',
    opacity: 0.7,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  itemIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  itemIconText: {
    fontSize: 24,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  itemDescription: {
    fontSize: 12,
    color: '#666',
    lineHeight: 16,
  },
  itemFooter: {
    marginTop: 10,
  },
  priceContainer: {
    marginBottom: 10,
  },
  discountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  originalPrice: {
    fontSize: 14,
    color: '#999',
    textDecorationLine: 'line-through',
    marginRight: 8,
  },
  discountBadge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  itemPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  priceUnaffordable: {
    color: '#FF3B30',
  },
  discountedPrice: {
    color: '#2196F3',
  },
  purchaseButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#E0E0E0',
  },
  buttonPurchased: {
    backgroundColor: '#9E9E9E',
  },
  purchaseButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  buttonTextDisabled: {
    color: '#999',
  },
  buttonTextPurchased: {
    color: '#FFFFFF',
  },
  rarityBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  rarityText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 50,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});

export default Shop;
