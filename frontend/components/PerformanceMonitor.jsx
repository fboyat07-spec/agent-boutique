import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import performanceOptimizer from '../hooks/performanceOptimizer';
import firestoreOptimizer from '../hooks/firestoreOptimizer';

const PerformanceMonitor = ({ visible = false }) => {
  const [metrics, setMetrics] = useState(null);
  const [cacheStats, setCacheStats] = useState(null);
  const [refreshInterval, setRefreshInterval] = useState(null);

  // Rafraîchir les métriques
  const refreshMetrics = () => {
    const performanceReport = performanceOptimizer.getPerformanceReport();
    const cacheData = firestoreOptimizer.getCacheStats();
    
    setMetrics(performanceReport);
    setCacheStats(cacheData);
  };

  // Démarrer la surveillance
  useEffect(() => {
    if (visible) {
      performanceOptimizer.startMonitoring();
      refreshMetrics();
      
      // Rafraîchir toutes les 2 secondes
      const interval = setInterval(refreshMetrics, 2000);
      setRefreshInterval(interval);
    }

    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
      performanceOptimizer.stopMonitoring();
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🚀 Performance Monitor</Text>
        <TouchableOpacity style={styles.refreshButton} onPress={refreshMetrics}>
          <Text style={styles.refreshButtonText}>🔄</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Résumé */}
        {metrics && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📊 Résumé</Text>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Re-renders totaux:</Text>
              <Text style={styles.metricValue}>{metrics.summary.totalRerenders}</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Temps montage moyen:</Text>
              <Text style={styles.metricValue}>{metrics.summary.averageMountTime?.toFixed(2)}ms</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Usage mémoire:</Text>
              <Text style={[
                styles.metricValue,
                { color: metrics.summary.memoryUsage > 80 ? '#FF3B30' : '#4CAF50' }
              ]}>
                {metrics.summary.memoryUsage?.toFixed(1)}%
              </Text>
            </View>
          </View>
        )}

        {/* Cache Firestore */}
        {cacheStats && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📄 Cache Firestore</Text>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Taille cache:</Text>
              <Text style={styles.metricValue}>{cacheStats.size}/{cacheStats.maxSize}</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Hits moyens:</Text>
              <Text style={styles.metricValue}>{cacheStats.averageHits?.toFixed(1)}</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Âge moyen:</Text>
              <Text style={styles.metricValue}>{(cacheStats.averageAge / 1000).toFixed(1)}s</Text>
            </View>
          </View>
        )}

        {/* Composants problématiques */}
        {metrics && metrics.problematicComponents.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>⚠️ Composants problématiques</Text>
            {metrics.problematicComponents.map((component, index) => (
              <View key={index} style={styles.problematicComponent}>
                <Text style={styles.componentName}>{component.component}</Text>
                <Text style={styles.componentIssue}>
                  {component.issue}: {component.count || component.time}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Recommandations */}
        {metrics && metrics.recommendations.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>💡 Recommandations</Text>
            {metrics.recommendations.map((rec, index) => (
              <Text key={index} style={styles.recommendation}>
                • {rec}
              </Text>
            ))}
          </View>
        )}

        {/* Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔧 Actions</Text>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => firestoreOptimizer.optimizeCache()}
          >
            <Text style={styles.actionButtonText}>Optimiser le cache</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => firestoreOptimizer.clearCache()}
          >
            <Text style={styles.actionButtonText}>Vider le cache</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => performanceOptimizer.cleanup()}
          >
            <Text style={styles.actionButtonText}>Nettoyer les métriques</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    right: 10,
    width: 300,
    height: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 1000,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  refreshButton: {
    padding: 8,
    backgroundColor: '#4CAF50',
    borderRadius: 15,
  },
  refreshButtonText: {
    fontSize: 14,
  },
  content: {
    flex: 1,
    padding: 15,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  metricLabel: {
    fontSize: 12,
    color: '#666',
    flex: 1,
  },
  metricValue: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
  },
  problematicComponent: {
    backgroundColor: '#FFF3E0',
    padding: 8,
    borderRadius: 5,
    marginBottom: 5,
  },
  componentName: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
  },
  componentIssue: {
    fontSize: 11,
    color: '#FF6F00',
  },
  recommendation: {
    fontSize: 12,
    color: '#4CAF50',
    marginBottom: 5,
  },
  actionButton: {
    backgroundColor: '#2196F3',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
    marginBottom: 10,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});

export default PerformanceMonitor;
