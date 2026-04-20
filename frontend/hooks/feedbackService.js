import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';

class FeedbackService {
  constructor() {
    this.sounds = {};
    this.isAudioEnabled = true;
    this.isHapticsEnabled = true;
    this.vibrationIntensity = 'medium'; // 'light', 'medium', 'heavy'
    this.initializeSounds();
  }

  // Initialiser les sons
  async initializeSounds() {
    try {
      // Son d'achat dans le shop
      const { sound: purchaseSound } = await Audio.Sound.createAsync(
        require('../assets/sounds/purchase.mp3'),
        { shouldPlay: false, volume: 0.7 }
      );
      this.sounds.purchase = purchaseSound;

      // Son de gain XP
      const { sound: xpGainSound } = await Audio.Sound.createAsync(
        require('../assets/sounds/xp_gain.mp3'),
        { shouldPlay: false, volume: 0.5 }
      );
      this.sounds.xpGain = xpGainSound;

      // Son de level up
      const { sound: levelUpSound } = await Audio.Sound.createAsync(
        require('../assets/sounds/levelup.mp3'),
        { shouldPlay: false, volume: 0.8 }
      );
      this.sounds.levelUp = levelUpSound;

      // Son de succès
      const { sound: successSound } = await Audio.Sound.createAsync(
        require('../assets/sounds/success.mp3'),
        { shouldPlay: false, volume: 0.6 }
      );
      this.sounds.success = successSound;

      // Son d'erreur
      const { sound: errorSound } = await Audio.Sound.createAsync(
        require('../assets/sounds/error.mp3'),
        { shouldPlay: false, volume: 0.4 }
      );
      this.sounds.error = errorSound;

      // Son de notification
      const { sound: notificationSound } = await Audio.Sound.createAsync(
        require('../assets/sounds/notification.mp3'),
        { shouldPlay: false, volume: 0.5 }
      );
      this.sounds.notification = notificationSound;

      console.log('✅ Sons initialisés avec succès');
    } catch (error) {
      console.warn('⚠️ Erreur initialisation sons:', error);
      this.isAudioEnabled = false;
    }
  }

  // Activer/Désactiver l'audio
  setAudioEnabled(enabled) {
    this.isAudioEnabled = enabled;
    console.log(`🔊 Audio ${enabled ? 'activé' : 'désactivé'}`);
  }

  // Activer/Désactiver les haptiques
  setHapticsEnabled(enabled) {
    this.isHapticsEnabled = enabled;
    console.log(`📳 Haptiques ${enabled ? 'activées' : 'désactivées'}`);
  }

  // Définir l'intensité des vibrations
  setVibrationIntensity(intensity) {
    this.vibrationIntensity = intensity;
    console.log(`📳 Intensité vibration: ${intensity}`);
  }

  // Jouer un son
  async playSound(soundName, options = {}) {
    if (!this.isAudioEnabled || !this.sounds[soundName]) {
      return false;
    }

    try {
      const sound = this.sounds[soundName];
      
      // Réinitialiser le son
      await sound.setPositionAsync(0);
      
      // Jouer avec les options
      await sound.playAsync();
      
      console.log(`🔵 Son joué: ${soundName}`);
      return true;
    } catch (error) {
      console.error(`❌ Erreur lecture son ${soundName}:`, error);
      return false;
    }
  }

  // Jouer une vibration
  async triggerVibration(type = 'light', options = {}) {
    if (!this.isHapticsEnabled) {
      return false;
    }

    try {
      switch (type) {
        case 'light':
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          break;
        case 'medium':
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          break;
        case 'heavy':
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          break;
        case 'success':
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          break;
        case 'error':
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          break;
        case 'warning':
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          break;
        default:
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      console.log(`📳 Vibration: ${type}`);
      return true;
    } catch (error) {
      console.error(`❌ Erreur vibration ${type}:`, error);
      return false;
    }
  }

  // Feedback d'achat dans le shop
  async purchaseFeedback(options = {}) {
    const { amount = 0, itemName = '', success = true } = options;

    if (success) {
      // Son d'achat réussi
      await this.playSound('purchase');
      
      // Vibration de succès
      await this.triggerVibration('success');
      
      // Vibration légère additionnelle
      setTimeout(() => {
        this.triggerVibration('light');
      }, 200);
      
      console.log(`🛍️ Feedback achat réussi: ${itemName} (${amount} XP)`);
    } else {
      // Son d'erreur
      await this.playSound('error');
      
      // Vibration d'erreur
      await this.triggerVibration('error');
      
      console.log(`❌ Feedback achat échoué: ${itemName}`);
    }
  }

  // Feedback de gain XP
  async xpGainFeedback(options = {}) {
    const { amount = 0, source = '', levelUp = false } = options;

    if (levelUp) {
      // Son de level up
      await this.playSound('levelUp');
      
      // Vibration intense pour level up
      await this.triggerVibration('heavy');
      
      // Vibration de succès
      setTimeout(() => {
        this.triggerVibration('success');
      }, 300);
      
      console.log(`⭐ Feedback level up: ${amount} XP`);
    } else {
      // Son de gain XP
      await this.playSound('xpGain');
      
      // Vibration légère pour gain XP
      await this.triggerVibration('light');
      
      console.log(`💪 Feedback gain XP: ${amount} XP (${source})`);
    }
  }

  // Feedback de mission complétée
  async missionCompleteFeedback(options = {}) {
    const { missionTitle = '', xpReward = 0 } = options;

    // Son de succès
    await this.playSound('success');
    
    // Vibration de succès
    await this.triggerVibration('success');
    
    // Vibration légère additionnelle
    setTimeout(() => {
      this.triggerVibration('medium');
    }, 150);
    
    console.log(`✅ Feedback mission complétée: ${missionTitle} (+${xpReward} XP)`);
  }

  // Feedback de badge débloqué
  async badgeUnlockFeedback(options = {}) {
    const { badgeName = '', rarity = 'common' } = options;

    // Son de succès
    await this.playSound('success');
    
    // Vibration selon la rareté
    const vibrationType = rarity === 'legendary' ? 'heavy' : 
                         rarity === 'epic' ? 'medium' : 'light';
    
    await this.triggerVibration(vibrationType);
    
    // Double vibration pour badges rares
    if (rarity === 'epic' || rarity === 'legendary') {
      setTimeout(() => {
        this.triggerVibration('success');
      }, 200);
    }
    
    console.log(`🏆 Feedback badge débloqué: ${badgeName} (${rarity})`);
  }

  // Feedback d'erreur
  async errorFeedback(options = {}) {
    const { errorType = 'general', message = '' } = options;

    // Son d'erreur
    await this.playSound('error');
    
    // Vibration d'erreur
    await this.triggerVibration('error');
    
    console.log(`❌ Feedback erreur: ${errorType} - ${message}`);
  }

  // Feedback de notification
  async notificationFeedback(options = {}) {
    const { title = '', type = 'info' } = options;

    // Son de notification
    await this.playSound('notification');
    
    // Vibration légère
    await this.triggerVibration('light');
    
    console.log(`🔔 Feedback notification: ${title} (${type})`);
  }

  // Feedback de chargement
  async loadingFeedback(options = {}) {
    const { action = '', step = 0, total = 0 } = options;

    // Vibration légère pour indiquer le chargement
    if (step === 1) {
      await this.triggerVibration('light');
    }
    
    console.log(`⏳ Feedback chargement: ${action} (${step}/${total})`);
  }

  // Feedback de navigation
  async navigationFeedback(options = {}) {
    const { action = '', screen = '' } = options;

    // Vibration très légère pour les actions de navigation
    await this.triggerVibration('light');
    
    console.log(`🧭 Feedback navigation: ${action} -> ${screen}`);
  }

  // Feedback personnalisé
  async customFeedback(options = {}) {
    const { 
      soundName = null, 
      vibrationType = null, 
      delay = 0,
      repeat = 1,
      repeatDelay = 0
    } = options;

    // Jouer le son si spécifié
    if (soundName) {
      await this.playSound(soundName);
    }

    // Déclencher la vibration si spécifiée
    if (vibrationType) {
      for (let i = 0; i < repeat; i++) {
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, repeatDelay));
        }
        await this.triggerVibration(vibrationType);
      }
    }

    console.log(`🎛️ Feedback personnalisé: ${soundName} + ${vibrationType}`);
  }

  // Feedback combiné (son + vibration)
  async combinedFeedback(options = {}) {
    const { 
      soundName = null, 
      vibrationType = null, 
      vibrationDelay = 0,
      soundDelay = 0 
    } = options;

    // Jouer le son avec délai
    if (soundName) {
      setTimeout(async () => {
        await this.playSound(soundName);
      }, soundDelay);
    }

    // Déclencher la vibration avec délai
    if (vibrationType) {
      setTimeout(async () => {
        await this.triggerVibration(vibrationType);
      }, vibrationDelay);
    }

    console.log(`🎵 Feedback combiné: ${soundName} + ${vibrationType}`);
  }

  // Obtenir le statut du service
  getStatus() {
    return {
      audioEnabled: this.isAudioEnabled,
      hapticsEnabled: this.isHapticsEnabled,
      vibrationIntensity: this.vibrationIntensity,
      loadedSounds: Object.keys(this.sounds).length,
      availableSounds: Object.keys(this.sounds)
    };
  }

  // Nettoyer les ressources
  async cleanup() {
    try {
      // Arrêter et décharger tous les sons
      for (const soundName in this.sounds) {
        const sound = this.sounds[soundName];
        await sound.stopAsync();
        await sound.unloadAsync();
      }
      
      this.sounds = {};
      console.log('🗑️ Ressources audio nettoyées');
    } catch (error) {
      console.error('❌ Erreur nettoyage ressources:', error);
    }
  }
}

// Instance singleton du service
const feedbackService = new FeedbackService();

export default feedbackService;
