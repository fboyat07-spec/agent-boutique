import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const StreakDisplay = ({ 
  streak = 0, 
  showIcon = true,
  showDays = true,
  style = {},
  textStyle = {},
  iconStyle = {}
}) => {
  // Couleur dynamique selon le streak
  const getStreakColor = (streak) => {
    if (streak >= 30) return '#FF6B6B';  // Rouge intense (mois complet)
    if (streak >= 14) return '#FF9800';  // Orange (2 semaines)
    if (streak >= 7) return '#FFC107';   // Jaune (1 semaine)
    if (streak >= 3) return '#4CAF50';   // Vert (3 jours)
    return '#9E9E9E';  // Gris (moins de 3 jours)
  };

  // Icône dynamique selon le streak
  const getStreakIcon = (streak) => {
    if (streak >= 30) return '🔥🔥🔥';  // Triple feu (mois)
    if (streak >= 14) return '🔥🔥';     // Double feu (2 semaines)
    if (streak >= 7) return '🔥';        // Simple feu (1 semaine)
    if (streak >= 3) return '⚡';        // Éclair (3 jours)
    return '💤';                        // Fumée (moins de 3 jours)
  };

  const streakColor = getStreakColor(streak);
  const streakIcon = getStreakIcon(streak);

  return (
    <View style={[styles.container, style]}>
      <View style={styles.streakRow}>
        {showIcon && (
          <Text style={[styles.streakIcon, { color: streakColor }, iconStyle]}>
            {streakIcon}
          </Text>
        )}
        
        <Text style={[styles.streakText, { color: streakColor }, textStyle]}>
          {streak} jour{streak > 1 ? 's' : ''}
        </Text>
      </View>
      
      {/* Badge spécial pour streaks importants */}
      {streak >= 7 && (
        <View style={[styles.streakBadge, { backgroundColor: streakColor }]}>
          <Text style={styles.streakBadgeText}>
            {streak >= 30 ? 'Mois complet !' : 
             streak >= 14 ? '2 semaines !' : 
             '1 semaine !'}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakIcon: {
    fontSize: 24,
    marginRight: 8,
  },
  streakText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  streakBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  streakBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
});

export default StreakDisplay;
