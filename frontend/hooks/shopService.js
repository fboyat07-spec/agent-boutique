// Définition des items achetables dans le shop
const SHOP_ITEMS = {
  avatars: {
    category: 'Avatars Premium',
    items: [
      {
        id: 'avatar_premium_1',
        name: 'Ninja Furtif',
        description: 'Un avatar ninja mystérieux et agile',
        icon: '🥷',
        price: 500,
        type: 'avatar',
        rarity: 'rare',
        color: '#2196F3',
        unlocked: false
      },
      {
        id: 'avatar_premium_2',
        name: 'Dragon Cosmique',
        description: 'Un avatar dragon aux pouvoirs cosmiques',
        icon: '🐉',
        price: 1000,
        type: 'avatar',
        rarity: 'epic',
        color: '#9C27B0',
        unlocked: false
      },
      {
        id: 'avatar_premium_3',
        name: 'Phénix Immortel',
        description: 'Un avatar phénix qui renaît de ses cendres',
        icon: '🔥',
        price: 1500,
        type: 'avatar',
        rarity: 'legendary',
        color: '#FFD700',
        unlocked: false
      },
      {
        id: 'avatar_premium_4',
        name: 'Mage Céleste',
        description: 'Un avatar mage maître des éléments',
        icon: '🧙‍♂️',
        price: 800,
        type: 'avatar',
        rarity: 'epic',
        color: '#9C27B0',
        unlocked: false
      },
      {
        id: 'avatar_premium_5',
        name: 'Chevalier Sacré',
        description: 'Un avatar chevalier protecteur',
        icon: '🛡️',
        price: 600,
        type: 'avatar',
        rarity: 'rare',
        color: '#2196F3',
        unlocked: false
      }
    ]
  },
  boosts: {
    category: 'Boosts Temporaires',
    items: [
      {
        id: 'boost_xp_2x',
        name: 'Double XP (24h)',
        description: 'Double tes gains d\'XP pendant 24 heures',
        icon: '⚡',
        price: 300,
        type: 'boost',
        rarity: 'common',
        duration: 24 * 60 * 60 * 1000, // 24h en ms
        multiplier: 2,
        color: '#4CAF50',
        unlocked: false
      },
      {
        id: 'boost_xp_3x',
        name: 'Triple XP (12h)',
        description: 'Triple tes gains d\'XP pendant 12 heures',
        icon: '🚀',
        price: 500,
        type: 'boost',
        rarity: 'rare',
        duration: 12 * 60 * 60 * 1000, // 12h en ms
        multiplier: 3,
        color: '#FF9800',
        unlocked: false
      },
      {
        id: 'boost_streak_freeze',
        name: 'Protection Streak (7j)',
        description: 'Ton streak ne peut pas être perdu pendant 7 jours',
        icon: '🛡️',
        price: 400,
        type: 'boost',
        rarity: 'rare',
        duration: 7 * 24 * 60 * 60 * 1000, // 7j en ms
        color: '#2196F3',
        unlocked: false
      }
    ]
  },
  themes: {
    category: 'Thèmes Personnalisés',
    items: [
      {
        id: 'theme_dark',
        name: 'Thème Sombre',
        description: 'Un thème sombre élégant pour ton interface',
        icon: '🌙',
        price: 200,
        type: 'theme',
        rarity: 'common',
        colors: ['#1A1A1A', '#2D2D2D', '#404040'],
        unlocked: false
      },
      {
        id: 'theme_neon',
        name: 'Thème Néon',
        description: 'Un thème néon vibrant et moderne',
        icon: '💫',
        price: 350,
        type: 'theme',
        rarity: 'rare',
        colors: ['#FF00FF', '#00FFFF', '#FFFF00'],
        unlocked: false
      },
      {
        id: 'theme_nature',
        name: 'Thème Nature',
        description: 'Un thème naturel apaisant',
        icon: '🌿',
        price: 250,
        type: 'theme',
        rarity: 'common',
        colors: ['#4CAF50', '#8BC34A', '#CDDC39'],
        unlocked: false
      }
    ]
  },
  badges: {
    category: 'Badges Exclusifs',
    items: [
      {
        id: 'badge_founder',
        name: 'Badge Fondateur',
        description: 'Un badge exclusif pour les premiers joueurs',
        icon: '👑',
        price: 0,
        type: 'badge',
        rarity: 'legendary',
        color: '#FFD700',
        unlocked: false,
        limited: true,
        maxQuantity: 100
      },
      {
        id: 'badge_vip',
        name: 'Badge VIP',
        description: 'Montre ton statut VIP permanent',
        icon: '⭐',
        price: 2000,
        type: 'badge',
        rarity: 'legendary',
        color: '#FFD700',
        unlocked: false
      },
      {
        id: 'badge_supporter',
        name: 'Badge Supporter',
        description: 'Soutiens le développement du jeu',
        icon: '💎',
        price: 1000,
        type: 'badge',
        rarity: 'epic',
        color: '#9C27B0',
        unlocked: false
      }
    ]
  }
};

// Obtenir tous les items du shop
const getAllShopItems = () => {
  const allItems = [];
  
  Object.values(SHOP_ITEMS).forEach(category => {
    category.items.forEach(item => {
      allItems.push({
        ...item,
        category: category.category
      });
    });
  });
  
  return allItems;
};

// Obtenir les items par catégorie
const getItemsByCategory = (categoryName) => {
  const category = Object.values(SHOP_ITEMS).find(cat => cat.category === categoryName);
  return category ? category.items : [];
};

// Obtenir les items par type
const getItemsByType = (type) => {
  const allItems = getAllShopItems();
  return allItems.filter(item => item.type === type);
};

// Vérifier si un utilisateur peut acheter un item
const canUserAfford = (userXP, itemPrice) => {
  return userXP >= itemPrice;
};

// Calculer le prix après réduction
const getDiscountedPrice = (itemPrice, userLevel) => {
  // Réductions selon le niveau
  if (userLevel >= 10) return Math.floor(itemPrice * 0.8);  // 20% de réduction
  if (userLevel >= 7) return Math.floor(itemPrice * 0.9);   // 10% de réduction
  if (userLevel >= 5) return Math.floor(itemPrice * 0.95);  // 5% de réduction
  return itemPrice;
};

// Obtenir la réduction actuelle
const getCurrentDiscount = (userLevel) => {
  if (userLevel >= 10) return 20;
  if (userLevel >= 7) return 10;
  if (userLevel >= 5) return 5;
  return 0;
};

// Obtenir un item spécifique par son ID
const getShopItemById = (itemId) => {
  const allItems = getAllShopItems();
  return allItems.find(item => item.id === itemId);
};

// Obtenir les items achetés par un utilisateur
const getUserPurchasedItems = (userPurchases) => {
  const purchasedItems = [];
  
  if (userPurchases && Array.isArray(userPurchases)) {
    userPurchases.forEach(purchase => {
      const item = getShopItemById(purchase.itemId);
      if (item) {
        purchasedItems.push({
          ...item,
          purchaseDate: purchase.purchaseDate,
          expiresAt: purchase.expiresAt
        });
      }
    });
  }
  
  return purchasedItems;
};

// Vérifier si un item est acheté
const isItemPurchased = (itemId, userPurchases) => {
  if (!userPurchases || !Array.isArray(userPurchases)) return false;
  return userPurchases.some(purchase => purchase.itemId === itemId);
};

// Obtenir les items expirés
const getExpiredItems = (userPurchases) => {
  if (!userPurchases || !Array.isArray(userPurchases)) return [];
  
  const now = Date.now();
  return userPurchases.filter(purchase => 
    purchase.expiresAt && purchase.expiresAt < now
  );
};

// Obtenir les items actifs
const getActiveItems = (userPurchases) => {
  if (!userPurchases || !Array.isArray(userPurchases)) return [];
  
  const now = Date.now();
  return userPurchases.filter(purchase => 
    !purchase.expiresAt || purchase.expiresAt > now
  );
};

// Calculer la valeur totale des achats
const getTotalPurchaseValue = (userPurchases) => {
  if (!userPurchases || !Array.isArray(userPurchases)) return 0;
  
  let totalValue = 0;
  userPurchases.forEach(purchase => {
    const item = getShopItemById(purchase.itemId);
    if (item) {
      totalValue += item.price;
    }
  });
  
  return totalValue;
};

// Obtenir les recommandations pour l'utilisateur
const getRecommendedItems = (userXP, userLevel, userPurchases) => {
  const allItems = getAllShopItems();
  const purchasedItemIds = userPurchases ? userPurchases.map(p => p.itemId) : [];
  
  // Items que l'utilisateur peut acheter
  const affordableItems = allItems.filter(item => 
    canUserAfford(userXP, item.price) && 
    !purchasedItemIds.includes(item.id)
  );
  
  // Trier par pertinence (prix, rareté, etc.)
  return affordableItems.sort((a, b) => {
    // Prioriser les items que l'utilisateur peut se permettre
    const aAffordability = userXP - a.price;
    const bAffordability = userXP - b.price;
    
    if (aAffordability !== bAffordability) {
      return bAffordability - aAffordability;
    }
    
    // Ensuite, prioriser par rareté
    const rarityOrder = { 'legendary': 4, 'epic': 3, 'rare': 2, 'common': 1 };
    const aRarityValue = rarityOrder[a.rarity] || 0;
    const bRarityValue = rarityOrder[b.rarity] || 0;
    
    return bRarityValue - aRarityValue;
  }).slice(0, 5); // Top 5 recommandations
};

// Obtenir les statistiques du shop
const getShopStats = (userPurchases) => {
  const purchasedItems = getUserPurchasedItems(userPurchases);
  
  const stats = {
    totalPurchases: purchasedItems.length,
    totalSpent: getTotalPurchaseValue(userPurchases),
    purchasesByCategory: {},
    purchasesByRarity: {},
    activeItems: getActiveItems(userPurchases).length,
    expiredItems: getExpiredItems(userPurchases).length
  };
  
  // Calculer les statistiques par catégorie
  purchasedItems.forEach(item => {
    stats.purchasesByCategory[item.category] = 
      (stats.purchasesByCategory[item.category] || 0) + 1;
    
    stats.purchasesByRarity[item.rarity] = 
      (stats.purchasesByRarity[item.rarity] || 0) + 1;
  });
  
  return stats;
};

export {
  SHOP_ITEMS,
  getAllShopItems,
  getItemsByCategory,
  getItemsByType,
  canUserAfford,
  getDiscountedPrice,
  getCurrentDiscount,
  getShopItemById,
  getUserPurchasedItems,
  isItemPurchased,
  getExpiredItems,
  getActiveItems,
  getTotalPurchaseValue,
  getRecommendedItems,
  getShopStats
};
