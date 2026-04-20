import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import useAnalyticsData from '../hooks/useAnalyticsData';

const AnalyticsDashboard = ({ userId }) => {
  const {
    loading,
    error,
    analyticsData,
    loadAnalyticsData,
    refreshData,
    getUserStats,
    getXPStats,
    getMissionStats,
    getRevenueStats,
    getGrowthStats
  } = useAnalyticsData();

  // Rafraîchir les données
  const handleRefresh = async () => {
    await refreshData();
  };

  // Charger les données au montage
  useEffect(() => {
    loadAnalyticsData(true); // Utiliser les données mock
  }, [loadAnalyticsData]);

  // Formater les nombres
  const formatNumber = (num) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  };

  // Formater la monnaie
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };

  // Obtenir la couleur de croissance
  const getGrowthColor = (growth) => {
    if (growth > 0) return '#4CAF50';
    if (growth < 0) return '#FF3B30';
    return '#666666';
  };

  // Calculer les pourcentages
  const calculatePercentage = (value, total) => {
    if (total === 0) return '0%';
    return ((value / total) * 100).toFixed(1) + '%';
  };

  // Rendre une carte analytics
  const renderAnalyticsCard = (title, value, subtitle, color = '#4CAF50', icon = '📊') => (
    <View style={[styles.card, { borderLeftColor: color }]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardIcon}>{icon}</Text>
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      <Text style={[styles.cardValue, { color }]}>{value}</Text>
      {subtitle && <Text style={styles.cardSubtitle}>{subtitle}</Text>}
    </View>
  );

  // Rendre une carte de croissance
  const renderGrowthCard = (title, growth, icon = '📈') => {
    const growthColor = getGrowthColor(growth);
    const growthSymbol = growth > 0 ? '+' : '';
    
    return (
      <View style={[styles.card, styles.growthCard]}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardIcon}>{icon}</Text>
          <Text style={styles.cardTitle}>{title}</Text>
        </View>
        <View style={styles.growthContainer}>
          <Text style={[styles.growthValue, { color: growthColor }]}>
            {growthSymbol}{growth}%
          </Text>
          <View style={[
            styles.growthIndicator,
            { backgroundColor: growthColor }
          ]} />
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Chargement des analytics...</Text>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          colors={['#4CAF50']}
          tintColor="#4CAF50"
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📊 Analytics Dashboard</Text>
        <Text style={styles.headerSubtitle}>
          Vue d'ensemble des performances de l'application
        </Text>
      </View>

      {/* Statistiques principales */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>👥 Utilisateurs</Text>
        <View style={styles.cardsGrid}>
          {renderAnalyticsCard(
            'Total Utilisateurs',
            formatNumber(analyticsData.totalUsers),
            'Inscrits au total',
            '#2196F3',
            '👤'
          )}
          {renderAnalyticsCard(
            'Utilisateurs Actifs',
            formatNumber(analyticsData.activeUsers),
            '30 derniers jours',
            '#4CAF50',
            '✅'
          )}
          {renderGrowthCard(
            'Croissance Hebdomadaire',
            analyticsData.weeklyGrowth,
            '📈'
          )}
          {renderGrowthCard(
            'Croissance Mensuelle',
            analyticsData.monthlyGrowth,
            '📊'
          )}
        </View>
      </View>

      {/* Statistiques XP */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>💪 XP & Progression</Text>
        <View style={styles.cardsGrid}>
          {renderAnalyticsCard(
            'XP Moyen',
            formatNumber(analyticsData.averageXP),
            'Par utilisateur',
            '#FF9800',
            '⭐'
          )}
          {renderAnalyticsCard(
            'XP Total',
            formatNumber(analyticsData.totalXP),
            'Cumulé',
            '#9C27B0',
            '🏆'
          )}
          {renderAnalyticsCard(
            'Missions Complétées',
            formatNumber(analyticsData.completedMissions),
            `${calculatePercentage(analyticsData.completedMissions, analyticsData.totalMissions)} du total`,
            '#4CAF50',
            '✅'
          )}
          {renderAnalyticsCard(
            'Missions Moyennes',
            formatNumber(analyticsData.averageMissionsPerUser),
            'Par utilisateur',
            '#2196F3',
            '🎯'
          )}
        </View>
      </View>

      {/* Statistiques Premium */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🌟 Abonnements</Text>
        <View style={styles.cardsGrid}>
          {renderAnalyticsCard(
            'Utilisateurs Premium',
            formatNumber(analyticsData.premiumUsers),
            `${calculatePercentage(analyticsData.premiumUsers, analyticsData.totalUsers)} des utilisateurs`,
            '#FFD700',
            '👑'
          )}
          {renderAnalyticsCard(
            'Utilisateurs Gratuits',
            formatNumber(analyticsData.freeUsers),
            `${calculatePercentage(analyticsData.freeUsers, analyticsData.totalUsers)} des utilisateurs`,
            '#9E9E9E',
            '🆓'
          )}
          {renderAnalyticsCard(
            'Total Achats',
            formatNumber(analyticsData.totalPurchases),
            'Dans le shop',
            '#4CAF50',
            '🛍️'
          )}
          {renderAnalyticsCard(
            'Revenus Totaux',
            formatCurrency(analyticsData.totalRevenue),
            'Depuis le lancement',
            '#4CAF50',
            '💰'
          )}
        </View>
      </View>

      {/* Statistiques d'engagement */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📈 Engagement</Text>
        <View style={styles.cardsGrid}>
          {renderAnalyticsCard(
            'Durée Session Moyenne',
            `${analyticsData.averageSessionDuration} min`,
            'Par utilisateur',
            '#FF9800',
            '⏱️'
          )}
        </View>
      </View>

      {/* Graphique utilisateurs actifs (mock) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📊 Utilisateurs Actifs (7 jours)</Text>
        <View style={styles.chartContainer}>
          {analyticsData.dailyActiveUsers.map((day, index) => (
            <View key={index} style={styles.chartBar}>
              <Text style={styles.chartDate}>
                {day.date.split('/')[0]}
              </Text>
              <View style={styles.chartBarContainer}>
                <View 
                  style={[
                    styles.chartBarFill,
                    { 
                      height: Math.max(20, (day.count / 300) * 100),
                      backgroundColor: '#4CAF50'
                    }
                  ]} 
                />
              </View>
              <Text style={styles.chartValue}>
                {day.count}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          📊 Données mises à jour en temps réel
        </Text>
        <Text style={styles.footerSubtext}>
          Dernière synchronisation: {new Date().toLocaleTimeString('fr-FR')}
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  loadingText: {
    fontSize: 18,
    color: '#666',
    marginTop: 20,
  },
  header: {
    padding: 20,
    paddingTop: 40,
    paddingBottom: 15,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  section: {
    padding: 20,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
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
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  growthCard: {
    borderLeftColor: '#666666',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  cardValue: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  growthContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  growthValue: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  growthIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chartContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  chartBar: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  chartDate: {
    fontSize: 12,
    color: '#666',
    marginBottom: 5,
  },
  chartBarContainer: {
    width: '100%',
    height: 100,
    backgroundColor: '#F0F0F0',
    borderRadius: 4,
    justifyContent: 'flex-end',
    marginBottom: 5,
  },
  chartBarFill: {
    width: '100%',
    borderRadius: 4,
    minHeight: 20,
  },
  chartValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  footer: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  footerSubtext: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
});

export default AnalyticsDashboard;
