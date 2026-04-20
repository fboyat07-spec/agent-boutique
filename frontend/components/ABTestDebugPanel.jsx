import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import useABTest from '../hooks/useABTest';
import { 
  getExperimentConfig, 
  getExperimentStats, 
  getAllExperiments,
  getXPMultiplier,
  getShopDiscount,
  getMissionRewardMultiplier
} from '../hooks/abTestExperiments';

const ABTestDebugPanel = ({ userId }) => {
  const {
    isInitialized,
    loading,
    error,
    assignVariant,
    getFeatureVariant,
    getAllVariants,
    getStatus
  } = useABTest(userId);

  const [expandedExperiments, setExpandedExperiments] = useState(new Set());
  const [refreshKey, setRefreshKey] = useState(0);

  // Rafraîchir le panel
  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  // Basculer l'expansion d'une expérience
  const toggleExperimentExpansion = (featureName) => {
    const newExpanded = new Set(expandedExperiments);
    if (newExpanded.has(featureName)) {
      newExpanded.delete(featureName);
    } else {
      newExpanded.add(featureName);
    }
    setExpandedExperiments(newExpanded);
  };

  // Forcer une variante
  const handleForceVariant = async (featureName, variant) => {
    try {
      await assignVariant(featureName, variant);
      Alert.alert('Succès', `Variante ${variant} forcée pour ${featureName}`);
      handleRefresh();
    } catch (err) {
      Alert.alert('Erreur', 'Impossible de forcer la variante');
    }
  };

  // Réinitialiser une expérience
  const handleResetExperiment = async (featureName) => {
    Alert.alert(
      'Réinitialiser l\'expérience',
      `Voulez-vous réinitialiser ${featureName} ?`,
      [
        { text: 'Non', style: 'cancel' },
        { 
          text: 'Oui', 
          onPress: async () => {
            try {
              const { resetExperiment } = await import('../hooks/abTestService');
              await resetExperiment(featureName);
              Alert.alert('Succès', `${featureName} réinitialisé`);
              handleRefresh();
            } catch (err) {
              Alert.alert('Erreur', 'Impossible de réinitialiser');
            }
          }
        }
      ]
    );
  };

  // Obtenir la couleur de la variante
  const getVariantColor = (variant) => {
    switch (variant) {
      case 'control':
      case 'no_discount':
      case 'normal':
      case 'classic':
      case 'daily':
      case 'standard':
        return '#9E9E9E';
      case 'boost_1_5x':
      case 'small_discount':
      case 'enhanced':
      case 'modern':
      case 'weekly':
      case 'enhanced':
        return '#2196F3';
      case 'boost_2x':
      case 'large_discount':
      case 'premium':
      case 'compact':
      case 'smart':
      case 'mega':
        return '#FF9800';
      default:
        return '#4CAF50';
    }
  };

  // Obtenir l'icône de la variante
  const getVariantIcon = (variant) => {
    switch (variant) {
      case 'control':
      case 'normal':
      case 'classic':
        return '⚪';
      case 'boost_1_5x':
      case 'enhanced':
      case 'modern':
        return '🔵';
      case 'boost_2x':
      case 'premium':
      case 'compact':
        return '🟠';
      default:
        return '🟢';
    }
  };

  // Rendre une carte d'expérience
  const renderExperimentCard = (featureName) => {
    const config = getExperimentConfig(featureName);
    const stats = getExperimentStats(featureName);
    const currentVariant = getFeatureVariant(featureName);
    const isExpanded = expandedExperiments.has(featureName);

    if (!config) return null;

    return (
      <View key={featureName} style={styles.experimentCard}>
        {/* Header */}
        <TouchableOpacity
          style={styles.experimentHeader}
          onPress={() => toggleExperimentExpansion(featureName)}
        >
          <View style={styles.experimentTitleContainer}>
            <Text style={styles.experimentName}>{featureName}</Text>
            {currentVariant && (
              <View style={[styles.variantBadge, { backgroundColor: getVariantColor(currentVariant) }]}>
                <Text style={styles.variantBadgeText}>
                  {getVariantIcon(currentVariant)} {currentVariant}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.experimentDescription}>
            {config.description}
          </Text>
        </TouchableOpacity>

        {/* Détails (expansible) */}
        {isExpanded && (
          <View style={styles.experimentDetails}>
            {/* Variantes disponibles */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Variantes disponibles:</Text>
              <View style={styles.variantsContainer}>
                {config.variants.map(variant => (
                  <TouchableOpacity
                    key={variant}
                    style={[
                      styles.variantOption,
                      currentVariant === variant && styles.variantOptionSelected
                    ]}
                    onPress={() => handleForceVariant(featureName, variant)}
                  >
                    <Text style={[
                      styles.variantOptionText,
                      currentVariant === variant && styles.variantOptionTextSelected
                    ]}>
                      {getVariantIcon(variant)} {variant}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Configuration */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Configuration:</Text>
              <Text style={styles.configText}>
                Split: {config.config.trafficSplit}
              </Text>
              {config.config.weights && (
                <Text style={styles.configText}>
                  Poids: {config.config.weights.join(', ')}
                </Text>
              )}
              <Text style={styles.configText}>
                Variantes: {config.variants.length}
              </Text>
            </View>

            {/* Statistiques */}
            {stats && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Statistiques:</Text>
                <Text style={styles.statsText}>
                  Total assignments: {stats.totalAssignments}
                </Text>
                {Object.entries(stats.variantDistribution).map(([variant, count]) => (
                  <Text key={variant} style={styles.statsText}>
                    {variant}: {count}
                  </Text>
                ))}
              </View>
            )}

            {/* Actions */}
            <View style={styles.actionsContainer}>
              <TouchableOpacity
                style={styles.resetButton}
                onPress={() => handleResetExperiment(featureName)}
              >
                <Text style={styles.resetButtonText}>Réinitialiser</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Chargement A/B Testing...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Erreur: {error}</Text>
      </View>
    );
  }

  const allVariants = getAllVariants();
  const status = getStatus();
  const allExperiments = getAllExperiments();

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🧪 A/B Testing Debug Panel</Text>
        <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh}>
          <Text style={styles.refreshButtonText}>🔄</Text>
        </TouchableOpacity>
      </View>

      {/* Status */}
      <View style={styles.statusCard}>
        <Text style={styles.statusTitle}>Status</Text>
        <Text style={styles.statusText}>
          Initialisé: {isInitialized ? '✅' : '❌'}
        </Text>
        <Text style={styles.statusText}>
          Utilisateur: {userId || 'Non connecté'}
        </Text>
        <Text style={styles.statusText}>
          Expériences actives: {allExperiments.length}
        </Text>
        <Text style={styles.statusText}>
          Variantes assignées: {Object.keys(allVariants).length}
        </Text>
      </View>

      {/* Variantes actuelles */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Variantes actuelles:</Text>
        {Object.entries(allVariants).length > 0 ? (
          Object.entries(allVariants).map(([featureName, variant]) => (
            <View key={featureName} style={styles.variantRow}>
              <Text style={styles.variantFeature}>{featureName}</Text>
              <View style={[styles.variantBadge, { backgroundColor: getVariantColor(variant) }]}>
                <Text style={styles.variantBadgeText}>
                  {getVariantIcon(variant)} {variant}
                </Text>
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.noVariantsText}>Aucune variante assignée</Text>
        )}
      </View>

      {/* Effets des variantes */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Effets actuels:</Text>
        
        <View style={styles.effectRow}>
          <Text style={styles.effectLabel}>XP Multiplier:</Text>
          <Text style={styles.effectValue}>
            x{getXPMultiplier(getFeatureVariant('xp_boost'))}
          </Text>
        </View>
        
        <View style={styles.effectRow}>
          <Text style={styles.effectLabel}>Shop Discount:</Text>
          <Text style={styles.effectValue}>
            {getShopDiscount(getFeatureVariant('shop_discounts')) * 100}%
          </Text>
        </View>
        
        <View style={styles.effectRow}>
          <Text style={styles.effectLabel}>Mission Rewards:</Text>
          <Text style={styles.effectValue}>
            x{getMissionRewardMultiplier(getFeatureVariant('mission_rewards'))}
          </Text>
        </View>
      </View>

      {/* Expériences détaillées */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Expériences détaillées:</Text>
        {allExperiments.map(([featureName, experiment]) => 
          renderExperimentCard(featureName)
        )}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          🧪 Panneau de debug A/B Testing
        </Text>
        <Text style={styles.footerSubtext}>
          Pour les tests et développement uniquement
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
  },
  loadingText: {
    fontSize: 18,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#FF3B30',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 40,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  refreshButton: {
    padding: 8,
    backgroundColor: '#4CAF50',
    borderRadius: 20,
  },
  refreshButtonText: {
    fontSize: 16,
  },
  statusCard: {
    margin: 20,
    padding: 15,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  statusText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  section: {
    margin: 20,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  variantRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  variantFeature: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  variantBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
  },
  variantBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  noVariantsText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
  effectRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    padding: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
  },
  effectLabel: {
    fontSize: 16,
    color: '#333',
  },
  effectValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  experimentCard: {
    marginBottom: 15,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  experimentHeader: {
    padding: 15,
  },
  experimentTitleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  experimentName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  experimentDescription: {
    fontSize: 14,
    color: '#666',
  },
  experimentDetails: {
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  variantsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  variantOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F0F0F0',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  variantOptionSelected: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  variantOptionText: {
    fontSize: 14,
    color: '#333',
  },
  variantOptionTextSelected: {
    color: '#FFFFFF',
  },
  configText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  statsText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 15,
  },
  resetButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    backgroundColor: '#FF3B30',
    borderRadius: 8,
  },
  resetButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  footer: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
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

export default ABTestDebugPanel;
