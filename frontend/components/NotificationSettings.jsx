import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, ScrollView, Alert } from 'react-native';
import useNotifications from '../hooks/useNotifications';

const NotificationSettings = ({ userId }) => {
  const {
    permissionStatus,
    registerForPushNotifications,
    updateNotificationSettings,
    getNotificationBadges,
    clearNotificationBadges,
    scheduleReminders
  } = useNotifications(userId);

  const [settings, setSettings] = useState({
    enabled: true,
    streakAlerts: true,
    missionReminders: true,
    levelUpNotifications: true
  });

  const [loading, setLoading] = useState(false);
  const [badgeCount, setBadgeCount] = useState(0);

  // Charger les préférences au montage
  useEffect(() => {
    loadNotificationBadges();
  }, []);

  // Charger le nombre de badges
  const loadNotificationBadges = async () => {
    try {
      const count = await getNotificationBadges();
      setBadgeCount(count);
    } catch (error) {
      console.error('❌ Erreur chargement badges:', error);
    }
  };

  // Activer les notifications
  const handleEnableNotifications = async () => {
    setLoading(true);
    
    try {
      const token = await registerForPushNotifications();
      
      if (token) {
        setSettings(prev => ({ ...prev, enabled: true }));
        Alert.alert('✅ Notifications activées', 'Tu recevras maintenant des notifications !');
      }
    } catch (error) {
      Alert.alert('❌ Erreur', 'Impossible d\'activer les notifications');
    } finally {
      setLoading(false);
    }
  };

  // Mettre à jour une préférence
  const handleUpdateSetting = async (key, value) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    
    try {
      await updateNotificationSettings(newSettings);
      console.log(`⚙️ Préférence ${key} mise à jour: ${value}`);
    } catch (error) {
      console.error('❌ Erreur mise à jour préférence:', error);
      // Revenir à l'état précédent en cas d'erreur
      setSettings(prev => ({ ...prev, [key]: !value }));
    }
  };

  // Effacer les badges
  const handleClearBadges = async () => {
    try {
      await clearNotificationBadges();
      setBadgeCount(0);
      Alert.alert('📱 Badges effacés', 'Les badges de notification ont été effacés');
    } catch (error) {
      Alert.alert('❌ Erreur', 'Impossible d\'effacer les badges');
    }
  };

  // Programmer les rappels
  const handleScheduleReminders = async () => {
    try {
      await scheduleReminders();
      Alert.alert('📅 Rappels programmés', 'Tu recevras des rappels à 9h et 20h chaque jour');
    } catch (error) {
      Alert.alert('❌ Erreur', 'Impossible de programmer les rappels');
    }
  };

  if (!permissionStatus) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionCard}>
          <Text style={styles.permissionTitle}>🔔 Active les notifications</Text>
          <Text style={styles.permissionText}>
            Pour recevoir des rappels et des alertes streak, active les notifications push.
          </Text>
          <TouchableOpacity
            style={[styles.button, styles.enableButton]}
            onPress={handleEnableNotifications}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Chargement...' : 'Activer les notifications'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>⚙️ Notifications</Text>
        <Text style={styles.subtitle}>Gère tes préférences de notification</Text>
      </View>

      {/* Statut des notifications */}
      <View style={styles.card}>
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>📱 Notifications push</Text>
            <Text style={styles.settingDescription}>
              {permissionStatus === 'granted' ? 'Activées' : 'Désactivées'}
            </Text>
          </View>
          <View style={[
            styles.statusBadge,
            { backgroundColor: permissionStatus === 'granted' ? '#4CAF50' : '#FF5252' }
          ]}>
            <Text style={styles.statusText}>
              {permissionStatus === 'granted' ? '✅' : '❌'}
            </Text>
          </View>
        </View>
      </View>

      {/* Préférences de notification */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Préférences</Text>
        
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>🔔 Notifications générales</Text>
            <Text style={styles.settingDescription}>
              Activer/désactiver toutes les notifications
            </Text>
          </View>
          <Switch
            value={settings.enabled}
            onValueChange={(value) => handleUpdateSetting('enabled', value)}
            disabled={permissionStatus !== 'granted'}
          />
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>🔥 Alertes streak</Text>
            <Text style={styles.settingDescription}>
              Sois alerté si ton streak est en danger
            </Text>
          </View>
          <Switch
            value={settings.streakAlerts}
            onValueChange={(value) => handleUpdateSetting('streakAlerts', value)}
            disabled={permissionStatus !== 'granted' || !settings.enabled}
          />
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>✅ Rappels missions</Text>
            <Text style={styles.settingDescription}>
              Reçois des rappels pour tes missions quotidiennes
            </Text>
          </View>
          <Switch
            value={settings.missionReminders}
            onValueChange={(value) => handleUpdateSetting('missionReminders', value)}
            disabled={permissionStatus !== 'granted' || !settings.enabled}
          />
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>🎉 Level up</Text>
            <Text style={styles.settingDescription}>
              Célèbre tes nouveaux niveaux
            </Text>
          </View>
          <Switch
            value={settings.levelUpNotifications}
            onValueChange={(value) => handleUpdateSetting('levelUpNotifications', value)}
            disabled={permissionStatus !== 'granted' || !settings.enabled}
          />
        </View>
      </View>

      {/* Actions */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Actions</Text>
        
        <TouchableOpacity
          style={[styles.actionButton, styles.scheduleButton]}
          onPress={handleScheduleReminders}
          disabled={permissionStatus !== 'granted' || !settings.enabled}
        >
          <Text style={styles.actionButtonText}>📅 Programmer les rappels quotidiens</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.clearButton]}
          onPress={handleClearBadges}
        >
          <Text style={styles.actionButtonText}>🗑️ Effacer les badges de notification</Text>
        </TouchableOpacity>

        {badgeCount > 0 && (
          <View style={styles.badgeInfo}>
            <Text style={styles.badgeText}>
              Tu as {badgeCount} notification{badgeCount > 1 ? 's' : ''} non lue{badgeCount > 1 ? 's' : ''}
            </Text>
          </View>
        )}
      </View>

      {/* Informations */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📖 À savoir</Text>
        <Text style={styles.infoText}>
          • Les notifications push nécessitent une connexion internet
        </Text>
        <Text style={styles.infoText}>
          • Les rappels sont programmés à 9h et 20h chaque jour
        </Text>
        <Text style={styles.infoText}>
          • Les alertes streak sont envoyées si tu n'as pas d'activité depuis 24h
        </Text>
        <Text style={styles.infoText}>
          • Tu peux désactiver chaque type de notification individuellement
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
  permissionCard: {
    backgroundColor: '#FFFFFF',
    margin: 20,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  header: {
    padding: 20,
    paddingTop: 40,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  card: {
    backgroundColor: '#FFFFFF',
    margin: 20,
    marginTop: 10,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  settingInfo: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: '#666',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  actionButton: {
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  scheduleButton: {
    backgroundColor: '#2196F3',
  },
  clearButton: {
    backgroundColor: '#FF9800',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  badgeInfo: {
    backgroundColor: '#FFF3E0',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 14,
    color: '#FF6F00',
    textAlign: 'center',
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    lineHeight: 20,
  },
  button: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  enableButton: {
    backgroundColor: '#4CAF50',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});

export default NotificationSettings;
