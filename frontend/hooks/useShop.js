import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../config/firebaseClean';
import { 
  getAllShopItems, 
  getUserPurchasedItems, 
  getActiveItems,
  getExpiredItems,
  isItemPurchased
} from './shopService';
import useFeedback from './useFeedback';
import useAnalytics from './useAnalytics';
import useABTest from './useABTest';
import { getShopDiscount } from './abTestExperiments';

const useShop = (userId) => {
  const [userXP, setUserXP] = useState(0);
  const [userLevel, setUserLevel] = useState(1);
  const [userPurchases, setUserPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Intégrer le service de feedback
  const { xpGainFeedback } = useFeedback();

  // Intégrer le service analytics
  const { trackShopPurchase } = useAnalytics(userId);

  // Intégrer le service A/B Testing
  const { getFeatureVariant } = useABTest(userId);

  // Écouter les données utilisateur en temps réel
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const userDocRef = doc(db, 'users', userId);
    
    const unsubscribe = onSnapshot(userDocRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        setUserXP(data.xp || 0);
        setUserLevel(data.level || 1);
        setUserPurchases(data.purchases || []);
        setLoading(false);
        setError(null);
      } else {
        setError('Utilisateur non trouvé');
        setLoading(false);
      }
    }, (error) => {
      console.error('Erreur écoute données utilisateur:', error);
      setError(error.message);
      setLoading(false);
    });

    return unsubscribe;
  }, [userId]);

  // Acheter un item
  const purchaseItem = useCallback(async (item) => {
    if (!userId) {
      return { success: false, error: 'Utilisateur non connecté' };
    }

    try {
      const userDocRef = doc(db, 'users', userId);
      
      // Créer l'objet d'achat
      const purchase = {
        itemId: item.id,
        purchaseDate: new Date(),
        price: item.price,
        originalPrice: item.price
      };

      // Ajouter une date d'expiration pour les boosts
      if (item.type === 'boost' && item.duration) {
        purchase.expiresAt = new Date(Date.now() + item.duration);
      }

      await updateDoc(userDocRef, {
        xp: userXP - item.price,
        purchases: arrayUnion(purchase),
        updatedAt: new Date()
      });

      setUserXP(prev => prev - item.price);

      // Feedback audio et haptique pour gain d'XP
      await xpGainFeedback({
        amount: item.price,
        source: 'shop_purchase',
        levelUp: false
      });

      // Tracking analytics de l'achat
      trackShopPurchase(item.id, item.name, item.price, item.type);
      
      console.log(`✅ Achat réussi: ${item.name} pour ${item.price} XP`);
      
      return { success: true, item, remainingXP: userXP - item.price };
    } catch (error) {
      console.error('❌ Erreur lors de l\'achat:', error);
      return { success: false, error: error.message };
    }
  }, [userId, userXP, xpGainFeedback, trackShopPurchase]);

  // Calculer le prix avec les réductions et A/B Testing
  const calculatePrice = useCallback((item) => {
    let price = item.price;
    
    // Réduction selon le niveau
    const levelDiscount = getCurrentDiscount(userLevel);
    if (levelDiscount > 0) {
      price = Math.round(price * (1 - levelDiscount / 100));
    }
    
    // Réduction selon la variante A/B Testing
    const shopDiscountVariant = getFeatureVariant('shop_discounts');
    const discountRate = getShopDiscount(shopDiscountVariant);
    if (discountRate > 0) {
      const discountedPrice = Math.round(price * (1 - discountRate));
      console.log(`🧪 Shop Discount: ${price} → ${discountedPrice} (-${discountRate * 100}%, variante: ${shopDiscountVariant})`);
      price = discountedPrice;
    }
    
    return price;
  }, [userLevel, getFeatureVariant]);

  // Vérifier si l'utilisateur peut acheter un item
  const canAfford = useCallback((item) => {
    return userXP >= calculatePrice(item);
  }, [userXP, calculatePrice]);

  // Obtenir les items achetés
  const getPurchasedItems = useCallback(() => {
    return getUserPurchasedItems(userPurchases);
  }, [userPurchases]);

  // Vérifier si un item est acheté
  const isPurchased = useCallback((itemId) => {
    return isItemPurchased(itemId, userPurchases);
  }, [userPurchases]);

  // Obtenir les items actifs
  const getActivePurchases = useCallback(() => {
    return getActiveItems(userPurchases);
  }, [userPurchases]);

  // Obtenir les items expirés
  const getExpiredPurchases = useCallback(() => {
    return getExpiredItems(userPurchases);
  }, [userPurchases]);

  // Ajouter de l'XP
  const addXP = useCallback(async (amount) => {
    if (!userId) return { success: false };

    try {
      const userDocRef = doc(db, 'users', userId);
      const newXP = userXP + amount;
      
      await updateDoc(userDocRef, {
        xp: newXP,
        updatedAt: new Date()
      });

      setUserXP(newXP);
      
      // Feedback audio et haptique pour gain d'XP
      await xpGainFeedback({
        amount,
        source: 'activity',
        levelUp: false
      });
      
      return { success: true, newXP };
    } catch (error) {
      console.error('❌ Erreur ajout XP:', error);
      return { success: false, error: error.message };
    }
  }, [userId, userXP, xpGainFeedback]);

  // Nettoyer les achats expirés
  const cleanupExpiredPurchases = useCallback(async () => {
    const expiredItems = getExpiredPurchases();
    
    if (expiredItems.length === 0) {
      return { success: true, cleaned: 0 };
    }

    try {
      const userDocRef = doc(db, 'users', userId);
      
      // Garder uniquement les achats non expirés
      const activePurchases = userPurchases.filter(purchase => 
        !expiredItems.some(expired => expired.itemId === purchase.itemId)
      );

      await updateDoc(userDocRef, {
        purchases: activePurchases,
        updatedAt: new Date()
      });

      setUserPurchases(activePurchases);
      
      console.log(`🗑️ Nettoyage: ${expiredItems.length} achats expirés supprimés`);
      
      return { success: true, cleaned: expiredItems.length };
    } catch (error) {
      console.error('❌ Erreur nettoyage achats expirés:', error);
      return { success: false, error: error.message };
    }
  }, [userId, userPurchases, getExpiredPurchases]);

  // Obtenir les statistiques d'achat
  const getPurchaseStats = useCallback(() => {
    const purchasedItems = getPurchasedItems();
    const totalSpent = purchasedItems.reduce((sum, item) => sum + item.price, 0);
    const activeItems = getActivePurchases();
    
    return {
      totalPurchases: purchasedItems.length,
      totalSpent,
      activeItems: activeItems.length,
      averageSpent: purchasedItems.length > 0 ? Math.round(totalSpent / purchasedItems.length) : 0
    };
  }, [getPurchasedItems, getActivePurchases]);

  return {
    // Données utilisateur
    userXP,
    userLevel,
    userPurchases,
    loading,
    error,
    
    // Actions
    purchaseItem,
    addXP,
    cleanupExpiredPurchases,
    
    // Utilitaires
    canAfford,
    getPurchasedItems,
    isPurchased,
    getActivePurchases,
    getExpiredPurchases,
    getPurchaseStats
  };
};

export default useShop;
