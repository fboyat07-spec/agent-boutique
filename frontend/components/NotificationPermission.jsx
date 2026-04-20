import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import useNotifications from '../hooks/useNotifications';

const NotificationPermission = ({ userId, onPermissionGranted }) => {
  const {
    registerForPushNotifications,
    permissionStatus,
    loading,
    error,
    expoPushToken
  } = useNotifications(userId);

  const [showRequest, setShowRequest] = useState(false);

  // Vérifier le statut de permission au montage
  useEffect(() => {
    if (!permissionStatus) {
      setShowRequest(true);
    } else if (permissionStatus === 'granted') {
      setShowRequest(false);
      onPermissionGranted?.(expoPushToken);
    }
  }, [permissionStatus, expoPushToken, onPermissionGranted]);

  // Demander la permission
  const handleRequestPermission = async () => {
    try {
      const token = await registerForPushNotifications();
      
      if (token) {
        Alert.alert(
          '✅ Notifications activées',
          'Tu recevras maintenant des rappels pour tes missions et des alertes streak !',
          [{ text: 'Super !', style: 'default' }]
        );
        
        setShowRequest(false);
        onPermissionGranted?.(token);
      }
    } catch (error) {
      Alert.alert(
        '❌ Erreur',
        'Impossible d\'activer les notifications. Réessaie plus tard.',
        [{ text: 'OK', style: 'default' }]
      );
    }
  };

  // Refuser la permission
  const handleDenyPermission = () => {
    Alert.alert(
      '⚠️ Notifications désactivées',
      'Tu ne recevras pas de rappels. Tu peux les activer dans les réglages de ton téléphone.',
      [{ text: 'Compris', style: 'default' }]
    );
    
    setShowRequest(false);
  };

  // Expliquer les bénéfices
  const showBenefits = () => {
    Alert.alert(
      '🔔 Pourquoi activer les notifications ?',
      '• 📅 Rappels de missions quotidiennes\n• 🔥 Alertes pour maintenir ton streak\n• 🎉 Célébrations de tes achievements\n• 💡 Conseils personnalisés',
      [
        { text: 'Refuser', style: 'cancel', onPress: handleDenyPermission },
        { text: 'Activer', style: 'default', onPress: handleRequestPermission }
      ]
    );
  };

  if (!showRequest) return null;

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>🔔</Text>
        </View>
        
        <View style={styles.content}>
          <Text style={styles.title}>Active les notifications</Text>
          <Text style={styles.subtitle}>
            Ne manque jamais tes missions et garde ton streak !
          </Text>
          
          {error && (
            <Text style={styles.errorText}>
              ⚠️ {error}
            </Text>
          )}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.button, styles.denyButton]}
            onPress={handleDenyPermission}
            disabled={loading}
          >
            <Text style={styles.denyButtonText}>Plus tard</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.button, styles.allowButton]}
            onPress={handleRequestPermission}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.allowButtonText}>Activer</Text>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.benefitsButton} onPress={showBenefits}>
          <Text style={styles.benefitsText}>ℹ️ En savoir plus</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    margin: 20,
    maxWidth: 400,
    width: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  icon: {
    fontSize: 48,
  },
  content: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
  errorText: {
    fontSize: 14,
    color: '#FF3B30',
    textAlign: 'center',
    marginTop: 12,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 8,
  },
  denyButton: {
    backgroundColor: '#F0F0F0',
  },
  allowButton: {
    backgroundColor: '#4CAF50',
  },
  denyButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#666',
  },
  allowButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  benefitsButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  benefitsText: {
    fontSize: 14,
    color: '#4CAF50',
    textDecorationLine: 'underline',
  },
});

export default NotificationPermission;
