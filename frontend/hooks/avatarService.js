// Définition des avatars évolutifs
const AVATAR_TIERS = {
  basic: {
    level: 1,
    name: 'Avatars Basiques',
    avatars: [
      { id: 'basic_1', name: 'Héros Débutant', icon: '🦸', color: '#4CAF50' },
      { id: 'basic_2', name: 'Apprenti Sage', icon: '🧙', color: '#4CAF50' },
      { id: 'basic_3', name: 'Explorateur Curieux', icon: '🔍', color: '#4CAF50' },
      { id: 'basic_4', name: 'Étudiant Motivé', icon: '📚', color: '#4CAF50' },
      { id: 'basic_5', name: 'Créatif Novice', icon: '🎨', color: '#4CAF50' },
      { id: 'basic_6', name: 'Athlète Débutant', icon: '🏃', color: '#4CAF50' }
    ]
  },
  intermediate: {
    level: 3,
    name: 'Avatars Intermédiaires',
    avatars: [
      { id: 'intermediate_1', name: 'Guerrier Courageux', icon: '⚔️', color: '#FF9800' },
      { id: 'intermediate_2', name: 'Mage Érudit', icon: '🧙‍♂️', color: '#FF9800' },
      { id: 'intermediate_3', name: 'Archer Précis', icon: '🏹', color: '#FF9800' },
      { id: 'intermediate_4', name: 'Voleur Agile', icon: '🦇', color: '#FF9800' },
      { id: 'intermediate_5', name: 'Gardien Protecteur', icon: '🛡️', color: '#FF9800' },
      { id: 'intermediate_6', name: 'Alchimiste Ingénieux', icon: '⚗️', color: '#FF9800' }
    ]
  },
  advanced: {
    level: 5,
    name: 'Avatars Avancés',
    avatars: [
      { id: 'advanced_1', name: 'Dragon Légendaire', icon: '🐉', color: '#9C27B0' },
      { id: 'advanced_2', name: 'Phénix Immortel', icon: '🔥', color: '#9C27B0' },
      { id: 'advanced_3', name: 'Titan Puissant', icon: '💪', color: '#9C27B0' },
      { id: 'advanced_4', name: 'Sage Cosmique', icon: '🌌', color: '#9C27B0' },
      { id: 'advanced_5', name: 'Ninja Furtif', icon: '🥷', color: '#9C27B0' },
      { id: 'advanced_6', name: 'Chevalier Sacré', icon: '🛡️', color: '#9C27B0' }
    ]
  },
  legendary: {
    level: 10,
    name: 'Avatars Légendaires',
    avatars: [
      { id: 'legendary_1', name: 'Dieu du Temps', icon: '⏰', color: '#FFD700' },
      { id: 'legendary_2', name: 'Maître de l\'Univers', icon: '🌌', color: '#FFD700' },
      { id: 'legendary_3', name: 'Créateur de Mondes', icon: '🌍', color: '#FFD700' },
      { id: 'legendary_4', name: 'Gardien Cosmique', icon: '🌠', color: '#FFD700' },
      { id: 'legendary_5', name: 'Être Suprême', icon: '✨', color: '#FFD700' },
      { id: 'legendary_6', name: 'Légende Vivante', icon: '👑', color: '#FFD700' }
    ]
  }
};

// Obtenir les avatars débloqués selon le niveau
const getUnlockedAvatars = (userLevel) => {
  const unlockedAvatars = [];
  
  // Ajouter les avatars basiques (toujours disponibles)
  unlockedAvatars.push(...AVATAR_TIERS.basic.avatars);
  
  // Ajouter les avatars intermédiaires (niveau 3+)
  if (userLevel >= 3) {
    unlockedAvatars.push(...AVATAR_TIERS.intermediate.avatars);
  }
  
  // Ajouter les avatars avancés (niveau 5+)
  if (userLevel >= 5) {
    unlockedAvatars.push(...AVATAR_TIERS.advanced.avatars);
  }
  
  // Ajouter les avatars légendaires (niveau 10+)
  if (userLevel >= 10) {
    unlockedAvatars.push(...AVATAR_TIERS.legendary.avatars);
  }
  
  return unlockedAvatars;
};

// Obtenir la catégorie d'un avatar selon le niveau
const getAvatarTier = (userLevel) => {
  if (userLevel >= 10) return 'legendary';
  if (userLevel >= 5) return 'advanced';
  if (userLevel >= 3) return 'intermediate';
  return 'basic';
};

// Vérifier si un avatar est débloqué
const isAvatarUnlocked = (avatarId, userLevel) => {
  const unlockedAvatars = getUnlockedAvatars(userLevel);
  return unlockedAvatars.some(avatar => avatar.id === avatarId);
};

// Obtenir les avatars par catégorie
const getAvatarsByTier = (tier) => {
  return AVATAR_TIERS[tier]?.avatars || [];
};

// Obtenir toutes les catégories disponibles
const getAllAvatarTiers = () => {
  return Object.keys(AVATAR_TIERS).map(tier => ({
    name: tier,
    displayName: AVATAR_TIERS[tier].name,
    level: AVATAR_TIERS[tier].level,
    avatarCount: AVATAR_TIERS[tier].avatars.length,
    avatars: AVATAR_TIERS[tier].avatars
  }));
};

// Calculer la progression vers le prochain palier d'avatar
const getAvatarProgress = (userLevel) => {
  const tiers = [
    { name: 'basic', level: 1, unlocked: true },
    { name: 'intermediate', level: 3, unlocked: userLevel >= 3 },
    { name: 'advanced', level: 5, unlocked: userLevel >= 5 },
    { name: 'legendary', level: 10, unlocked: userLevel >= 10 }
  ];
  
  const currentTier = tiers.find(tier => userLevel >= tier.level);
  const nextTier = tiers.find(tier => !tier.unlocked);
  
  return {
    currentTier: currentTier?.name || 'basic',
    nextTier: nextTier?.name || null,
    currentLevel: userLevel,
    nextLevel: nextTier?.level || null,
    progress: nextTier ? Math.min(100, ((userLevel - currentTier.level) / (nextTier.level - currentTier.level)) * 100) : 100,
    unlocked: nextTier === null
  };
};

// Obtenir un avatar spécifique par son ID
const getAvatarById = (avatarId) => {
  for (const tier of Object.values(AVATAR_TIERS)) {
    const avatar = tier.avatars.find(a => a.id === avatarId);
    if (avatar) {
      return {
        ...avatar,
        tier: Object.keys(AVATAR_TIERS).find(key => AVATAR_TIERS[key] === tier)
      };
    }
  }
  return null;
};

// Exporter les constantes pour utilisation dans les composants
export {
  AVATAR_TIERS,
  getUnlockedAvatars,
  getAvatarTier,
  isAvatarUnlocked,
  getAvatarsByTier,
  getAllAvatarTiers,
  getAvatarProgress,
  getAvatarById
};
