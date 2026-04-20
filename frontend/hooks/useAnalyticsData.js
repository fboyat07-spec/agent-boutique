import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, query, orderBy, limit, where, getDoc, doc, sum, average } from 'firebase/firestore';
import { db } from '../config/firebaseClean';

const useAnalyticsData = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [analyticsData, setAnalyticsData] = useState({
    totalUsers: 0,
    activeUsers: 0,
    averageXP: 0,
    totalXP: 0,
    completedMissions: 0,
    totalMissions: 0,
    averageMissionsPerUser: 0,
    premiumUsers: 0,
    freeUsers: 0,
    totalPurchases: 0,
    totalRevenue: 0,
    averageSessionDuration: 0,
    dailyActiveUsers: [],
    weeklyGrowth: 0,
    monthlyGrowth: 0,
    topUsers: [],
    popularMissions: [],
    popularItems: []
  });

  // Générer des données mock pour le développement
  const generateMockData = useCallback(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    return {
      totalUsers: Math.floor(Math.random() * 1000) + 500,
      activeUsers: Math.floor(Math.random() * 500) + 200,
      averageXP: Math.floor(Math.random() * 2000) + 500,
      totalXP: Math.floor(Math.random() * 1000000) + 500000,
      completedMissions: Math.floor(Math.random() * 5000) + 2000,
      totalMissions: Math.floor(Math.random() * 8000) + 3000,
      averageMissionsPerUser: Math.floor(Math.random() * 10) + 3,
      premiumUsers: Math.floor(Math.random() * 200) + 50,
      freeUsers: Math.floor(Math.random() * 800) + 400,
      totalPurchases: Math.floor(Math.random() * 300) + 100,
      totalRevenue: Math.floor(Math.random() * 10000) + 2000,
      averageSessionDuration: Math.floor(Math.random() * 30) + 10,
      dailyActiveUsers: Array.from({ length: 7 }, (_, i) => ({
        date: new Date(now.getTime() - (6 - i) * 24 * 60 * 60 * 1000).toLocaleDateString(),
        count: Math.floor(Math.random() * 200) + 100
      })),
      weeklyGrowth: Math.floor(Math.random() * 20) - 5,
      monthlyGrowth: Math.floor(Math.random() * 30) - 10,
      topUsers: Array.from({ length: 5 }, (_, i) => ({
        userId: `user_${i + 1}`,
        username: `User${i + 1}`,
        xp: Math.floor(Math.random() * 5000) + 1000,
        level: Math.floor(Math.random() * 20) + 5,
        avatar: `avatar_${i + 1}`,
        rank: i + 1
      })),
      popularMissions: [
        { id: 'daily_interact', title: 'Interagir avec l\'IA', completions: Math.floor(Math.random() * 100) + 50 },
        { id: 'daily_learn_concept', title: 'Apprendre un concept', completions: Math.floor(Math.random() * 80) + 30 },
        { id: 'daily_practice', title: 'Pratiquer 15 minutes', completions: Math.floor(Math.random() * 120) + 60 }
      ],
      popularItems: [
        { id: 'avatar_premium_1', name: 'Ninja Furtif', purchases: Math.floor(Math.random() * 50) + 20 },
        { id: 'boost_xp_2x', name: 'Double XP (24h)', purchases: Math.floor(Math.random() * 80) + 40 },
        { id: 'theme_dark', name: 'Thème Sombre', purchases: Math.floor(Math.random() * 30) + 15 }
      ]
    };
  }, []);

  // Charger les données réelles depuis Firestore (production)
  const loadRealAnalyticsData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Statistiques utilisateurs
      const usersRef = collection(db, 'users');
      const usersSnapshot = await getDocs(usersRef);
      const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      const totalUsers = users.length;
      const activeUsers = users.filter(user => {
        const lastActivity = user.lastActivity ? new Date(user.lastActivity) : null;
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        return lastActivity && lastActivity > thirtyDaysAgo;
      }).length;

      // 2. Statistiques XP
      const totalXP = users.reduce((sum, user) => sum + (user.xp || 0), 0);
      const averageXP = totalUsers > 0 ? Math.round(totalXP / totalUsers) : 0;

      // 3. Statistiques missions
      let completedMissions = 0;
      let totalMissions = 0;
      
      users.forEach(user => {
        if (user.missions && user.missions.daily) {
          const dailyMissions = user.missions.daily;
          completedMissions += dailyMissions.filter(m => m.completed).length;
          totalMissions += dailyMissions.length;
        }
      });

      const averageMissionsPerUser = totalUsers > 0 ? (completedMissions / totalUsers).toFixed(1) : 0;

      // 4. Statistiques abonnements
      const premiumUsers = users.filter(user => 
        user.subscription && user.subscription.planId !== 'free'
      ).length;
      const freeUsers = totalUsers - premiumUsers;

      // 5. Statistiques achats
      let totalPurchases = 0;
      let totalRevenue = 0;
      
      users.forEach(user => {
        if (user.purchases && Array.isArray(user.purchases)) {
          totalPurchases += user.purchases.length;
          totalRevenue += user.purchases.reduce((sum, purchase) => sum + (purchase.price || 0), 0);
        }
      });

      // 6. Top utilisateurs
      const topUsers = users
        .sort((a, b) => (b.xp || 0) - (a.xp || 0))
        .slice(0, 5)
        .map((user, index) => ({
          userId: user.id,
          username: user.username || `User${index + 1}`,
          xp: user.xp || 0,
          level: user.level || 1,
          avatar: user.avatar,
          rank: index + 1
        }));

      // 7. Utilisateurs actifs quotidiens (7 derniers jours)
      const dailyActiveUsers = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
        
        const activeCount = users.filter(user => {
          const lastActivity = user.lastActivity ? new Date(user.lastActivity) : null;
          return lastActivity && lastActivity >= startOfDay && lastActivity < endOfDay;
        }).length;
        
        dailyActiveUsers.push({
          date: startOfDay.toLocaleDateString(),
          count: activeCount
        });
      }

      // 8. Calculer croissance
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const usersOneWeekAgo = users.filter(user => {
        const createdAt = user.createdAt ? new Date(user.createdAt) : null;
        return createdAt && createdAt >= oneWeekAgo;
      }).length;
      
      const usersOneMonthAgo = users.filter(user => {
        const createdAt = user.createdAt ? new Date(user.createdAt) : null;
        return createdAt && createdAt >= oneMonthAgo;
      }).length;

      const weeklyGrowth = totalUsers > 0 ? ((usersOneWeekAgo / totalUsers) * 100 - 100).toFixed(1) : 0;
      const monthlyGrowth = totalUsers > 0 ? ((usersOneMonthAgo / totalUsers) * 100 - 100).toFixed(1) : 0;

      const analyticsData = {
        totalUsers,
        activeUsers,
        averageXP,
        totalXP,
        completedMissions,
        totalMissions,
        averageMissionsPerUser,
        premiumUsers,
        freeUsers,
        totalPurchases,
        totalRevenue,
        averageSessionDuration: 15, // Mock - à calculer avec les vraies données
        dailyActiveUsers,
        weeklyGrowth: parseFloat(weeklyGrowth),
        monthlyGrowth: parseFloat(monthlyGrowth),
        topUsers,
        popularMissions: [], // À calculer avec les vraies données
        popularItems: [] // À calculer avec les vraies données
      };

      setAnalyticsData(analyticsData);
      console.log('📊 Données analytics réelles chargées:', analyticsData);
      
      return { success: true, data: analyticsData };

    } catch (error) {
      console.error('❌ Erreur chargement analytics réelles:', error);
      setError(error.message);
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  }, []);

  // Charger les données (mock ou réelles)
  const loadAnalyticsData = useCallback(async (useMock = true) => {
    if (useMock) {
      // Mode développement - utiliser les données mock
      setLoading(true);
      
      // Simuler un délai réseau
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const mockData = generateMockData();
      setAnalyticsData(mockData);
      setLoading(false);
      
      console.log('📊 Données analytics mock chargées:', mockData);
      return { success: true, data: mockData };
    } else {
      // Mode production - charger les vraies données
      return await loadRealAnalyticsData();
    }
  }, [generateMockData, loadRealAnalyticsData]);

  // Rafraîchir les données
  const refreshData = useCallback(async () => {
    await loadAnalyticsData(true); // Utiliser mock pour le moment
  }, [loadAnalyticsData]);

  // Obtenir des statistiques spécifiques
  const getUserStats = useCallback(() => {
    return {
      totalUsers: analyticsData.totalUsers,
      activeUsers: analyticsData.activeUsers,
      premiumUsers: analyticsData.premiumUsers,
      freeUsers: analyticsData.freeUsers,
      premiumRate: analyticsData.totalUsers > 0 ? 
        ((analyticsData.premiumUsers / analyticsData.totalUsers) * 100).toFixed(1) + '%' : '0%'
    };
  }, [analyticsData]);

  const getXPStats = useCallback(() => {
    return {
      totalXP: analyticsData.totalXP,
      averageXP: analyticsData.averageXP,
      averageXPPerLevel: analyticsData.averageXP > 0 ? 
        Math.round(analyticsData.averageXP / 10) : 0 // Approximation
    };
  }, [analyticsData]);

  const getMissionStats = useCallback(() => {
    return {
      completedMissions: analyticsData.completedMissions,
      totalMissions: analyticsData.totalMissions,
      averageMissionsPerUser: analyticsData.averageMissionsPerUser,
      completionRate: analyticsData.totalMissions > 0 ? 
        ((analyticsData.completedMissions / analyticsData.totalMissions) * 100).toFixed(1) + '%' : '0%'
    };
  }, [analyticsData]);

  const getRevenueStats = useCallback(() => {
    return {
      totalPurchases: analyticsData.totalPurchases,
      totalRevenue: analyticsData.totalRevenue,
      averagePurchaseValue: analyticsData.totalPurchases > 0 ? 
        (analyticsData.totalRevenue / analyticsData.totalPurchases).toFixed(2) : 0,
      revenuePerUser: analyticsData.totalUsers > 0 ? 
        (analyticsData.totalRevenue / analyticsData.totalUsers).toFixed(2) : 0
    };
  }, [analyticsData]);

  const getGrowthStats = useCallback(() => {
    return {
      weeklyGrowth: analyticsData.weeklyGrowth,
      monthlyGrowth: analyticsData.monthlyGrowth,
      dailyActiveUsers: analyticsData.dailyActiveUsers,
      averageDailyActive: analyticsData.dailyActiveUsers.length > 0 ? 
        Math.round(analyticsData.dailyActiveUsers.reduce((sum, day) => sum + day.count, 0) / analyticsData.dailyActiveUsers.length) : 0
    };
  }, [analyticsData]);

  // Exporter les données
  const exportData = useCallback(() => {
    const exportData = {
      ...analyticsData,
      exportedAt: new Date().toISOString(),
      exportVersion: '1.0'
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    // En production, vous pourriez utiliser Sharing pour partager le fichier
    console.log('📊 Données exportées:', exportData);
    
    return dataUri;
  }, [analyticsData]);

  return {
    // État
    loading,
    error,
    analyticsData,
    
    // Actions
    loadAnalyticsData,
    refreshData,
    exportData,
    
    // Statistiques groupées
    getUserStats,
    getXPStats,
    getMissionStats,
    getRevenueStats,
    getGrowthStats
  };
};

export default useAnalyticsData;
