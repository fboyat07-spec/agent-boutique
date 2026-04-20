const checkAndUnlockBadges = (userData) => {
  const currentBadges = userData.badges || [];
  const newBadges = [];
  
  // Vérifier les conditions et ajouter les badges correspondants
  
  // Badge: first_xp (obtenir 100 XP pour la première fois)
  if (!currentBadges.includes('first_xp') && userData.xp >= 100) {
    newBadges.push('first_xp');
    console.log('🏆 Badge débloqué: first_xp (100 XP atteints)');
  }
  
  // Badge: streak_7 (7 jours d'affilée)
  if (!currentBadges.includes('streak_7') && userData.streak >= 7) {
    newBadges.push('streak_7');
    console.log('🔥 Badge débloqué: streak_7 (7 jours d\'affilée)');
  }
  
  // Badge: level_5 (atteindre le niveau 5)
  if (!currentBadges.includes('level_5') && userData.level >= 5) {
    newBadges.push('level_5');
    console.log('⭐ Badge débloqué: level_5 (Niveau 5 atteint)');
  }
  
  // Badges supplémentaires
  if (!currentBadges.includes('first_mission') && userData.missions?.daily?.filter(m => m.completed).length >= 1) {
    newBadges.push('first_mission');
    console.log('🎯 Badge débloqué: first_mission (Première mission complétée)');
  }
  
  if (!currentBadges.includes('mission_master') && userData.missions?.daily?.filter(m => m.completed).length >= 5) {
    newBadges.push('mission_master');
    console.log('🏆 Badge débloqué: mission_master (5 missions complétées)');
  }
  
  if (!currentBadges.includes('xp_collector') && userData.xp >= 1000) {
    newBadges.push('xp_collector');
    console.log('💎 Badge débloqué: xp_collector (1000 XP)');
  }
  
  if (!currentBadges.includes('streak_master') && userData.streak >= 30) {
    newBadges.push('streak_master');
    console.log('🔥🔥 Badge débloqué: streak_master (30 jours d\'affilée)');
  }
  
  if (!currentBadges.includes('level_expert') && userData.level >= 10) {
    newBadges.push('level_expert');
    console.log('🌟 Badge débloqué: level_expert (Niveau 10)');
  }
  
  if (!currentBadges.includes('perfect_day') && 
      userData.missions?.daily?.filter(m => m.completed).length === userData.missions?.daily?.length &&
      userData.missions?.daily?.length > 0) {
    newBadges.push('perfect_day');
    console.log('✨ Badge débloqué: perfect_day (Toutes les missions du jour complétées)');
  }
  
  if (!currentBadges.includes('early_bird') && userData.lastActivity) {
    const lastActivity = new Date(userData.lastActivity.toDate());
    const now = new Date();
    const isEarlyMorning = lastActivity.getHours() <= 8 && lastActivity.getMinutes() <= 30;
    
    if (isEarlyMorning) {
      newBadges.push('early_bird');
      console.log('🌅 Badge débloqué: early_bird (Matin actif)');
    }
  }
  
  if (!currentBadges.includes('social_butterfly') && userData.xp >= 500 && userData.streak >= 3) {
    newBadges.push('social_butterfly');
    console.log('🦋 Badge débloqué: social_butterfly (500 XP + 3 jours streak)');
  }
  
  if (!currentBadges.includes('dedication_master') && userData.xp >= 2500) {
    newBadges.push('dedication_master');
    console.log('🏅 Badge débloqué: dedication_master (2500 XP)');
  }
  
  if (!currentBadges.includes('speed_learner') && userData.level >= 3 && userData.streak >= 14) {
    newBadges.push('speed_learner');
    console.log('⚡ Badge débloqué: speed_learner (Niveau 3 + 14 jours streak)');
  }
  
  // Retourner uniquement les nouveaux badges débloqués
  return {
    newBadges,
    allBadges: [...currentBadges, ...newBadges],
    totalBadges: [...currentBadges, ...newBadges].length
  };
};

// Obtenir les informations des badges
const getBadgeInfo = (badgeId) => {
  const badgeInfo = {
    first_xp: {
      id: 'first_xp',
      name: 'Premiers Pas',
      description: 'Atteindre 100 XP pour la première fois',
      icon: '🎯',
      rarity: 'common',
      condition: 'xp >= 100'
    },
    streak_7: {
      id: 'streak_7',
      name: 'Semaine d\'Or',
      description: 'Maintenir un streak de 7 jours consécutifs',
      icon: '🔥',
      rarity: 'rare',
      condition: 'streak >= 7'
    },
    level_5: {
      id: 'level_5',
      name: 'Expert',
      description: 'Atteindre le niveau 5',
      icon: '⭐',
      rarity: 'epic',
      condition: 'level >= 5'
    },
    first_mission: {
      id: 'first_mission',
      name: 'Initié',
      description: 'Compléter votre première mission quotidienne',
      icon: '🎮',
      rarity: 'common',
      condition: 'missions_completed >= 1'
    },
    mission_master: {
      id: 'mission_master',
      name: 'Maître des Missions',
      description: 'Compléter 5 missions quotidiennes',
      icon: '🏆',
      rarity: 'epic',
      condition: 'missions_completed >= 5'
    },
    xp_collector: {
      id: 'xp_collector',
      name: 'Collectionneur d\'XP',
      description: 'Accumuler 1000 XP',
      icon: '💎',
      rarity: 'rare',
      condition: 'xp >= 1000'
    },
    streak_master: {
      id: 'streak_master',
      name: 'Légende du Streak',
      description: 'Maintenir un streak de 30 jours',
      icon: '🔥🔥',
      rarity: 'legendary',
      condition: 'streak >= 30'
    },
    level_expert: {
      id: 'level_expert',
      name: 'Maître Absolu',
      description: 'Atteindre le niveau 10',
      icon: '🌟',
      rarity: 'legendary',
      condition: 'level >= 10'
    },
    perfect_day: {
      id: 'perfect_day',
      name: 'Journée Parfaite',
      description: 'Compléter toutes les missions quotidiennes',
      icon: '✨',
      rarity: 'epic',
      condition: 'all_daily_missions_completed'
    },
    early_bird: {
      id: 'early_bird',
      name: 'Matin Actif',
      description: 'Se connecter avant 8h30',
      icon: '🌅',
      rarity: 'rare',
      condition: 'early_morning_activity'
    },
    social_butterfly: {
      id: 'social_butterfly',
      name: 'Papillon Social',
      description: '500 XP avec un streak de 3 jours',
      icon: '🦋',
      rarity: 'rare',
      condition: 'xp >= 500 && streak >= 3'
    },
    dedication_master: {
      id: 'dedication_master',
      name: 'Maître de la Dévotion',
      description: 'Accumuler 2500 XP',
      icon: '🏅',
      rarity: 'legendary',
      condition: 'xp >= 2500'
    },
    speed_learner: {
      id: 'speed_learner',
      name: 'Apprenti Rapide',
      description: 'Niveau 3 avec un streak de 14 jours',
      icon: '⚡',
      rarity: 'epic',
      condition: 'level >= 3 && streak >= 14'
    }
  };
  
  return badgeInfo[badgeId] || null;
};

// Filtrer les badges par rareté
const getBadgesByRarity = (badges) => {
  const rarityGroups = {
    common: [],
    rare: [],
    epic: [],
    legendary: []
  };
  
  badges.forEach(badgeId => {
    const info = getBadgeInfo(badgeId);
    if (info) {
      rarityGroups[info.rarity].push({
        id: badgeId,
        ...info
      });
    }
  });
  
  return rarityGroups;
};

// Calculer la progression vers le prochain badge
const getBadgeProgress = (userData, badgeId) => {
  const info = getBadgeInfo(badgeId);
  if (!info) return { current: 0, target: 1, percentage: 0 };
  
  let current = 0;
  let target = 1;
  
  switch (badgeId) {
    case 'first_xp':
      current = Math.min(userData.xp, 100);
      target = 100;
      break;
    case 'streak_7':
      current = Math.min(userData.streak, 7);
      target = 7;
      break;
    case 'level_5':
      current = Math.min(userData.level, 5);
      target = 5;
      break;
    case 'xp_collector':
      current = Math.min(userData.xp, 1000);
      target = 1000;
      break;
    case 'streak_master':
      current = Math.min(userData.streak, 30);
      target = 30;
      break;
    default:
      return { current: 0, target: 1, percentage: 0 };
  }
  
  return {
    current,
    target,
    percentage: Math.round((current / target) * 100)
  };
};

export {
  checkAndUnlockBadges,
  getBadgeInfo,
  getBadgesByRarity,
  getBadgeProgress
};
