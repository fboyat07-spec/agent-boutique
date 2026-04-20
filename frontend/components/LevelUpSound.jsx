import React, { useState, useEffect, useCallback } from 'react';
import { Audio } from 'expo-av';

const LevelUpSound = ({ 
  onSoundReady = () => {},
  onError = (error) => {},
  soundFile = require('../assets/sounds/levelup.mp3')
}) => {
  const [sound, setSound] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Charger le son
  useEffect(() => {
    const loadSound = async () => {
      try {
        console.log('🔵 Chargement du son de level up...');
        
        const { sound } = await Audio.Sound.createAsync(
          soundFile,
          {
            shouldPlay: false,
            volume: 0.8,
          }
        );
        
        setSound(sound);
        setIsLoaded(true);
        onSoundReady();
        
        console.log('✅ Son de level up chargé avec succès');
      } catch (error) {
        console.error('❌ Erreur chargement son level up:', error);
        onError(error);
      }
    };

    loadSound();

    // Nettoyer le son au démontage
    return () => {
      if (sound) {
        console.log('🗑️ Nettoyage du son de level up...');
        sound.unloadAsync();
      }
    };
  }, [soundFile, onSoundReady, onError]);

  // Jouer le son de level up
  const playSound = useCallback(async () => {
    if (!sound || !isLoaded) {
      console.warn('⚠️ Son non chargé, impossible de jouer');
      return false;
    }

    try {
      await sound.replayAsync();
      console.log('🔊 Son de level up joué');
      return true;
    } catch (error) {
      console.error('❌ Erreur lecture son level up:', error);
      return false;
    }
  }, [sound, isLoaded]);

  // Arrêter le son
  const stopSound = useCallback(async () => {
    if (!sound || !isLoaded) return false;

    try {
      await sound.stopAsync();
      console.log('⏹️ Son de level up arrêté');
      return true;
    } catch (error) {
      console.error('❌ Erreur arrêt son level up:', error);
      return false;
    }
  }, [sound, isLoaded]);

  // Obtenir le statut
  const getStatus = useCallback(() => {
    return {
      isLoaded,
      sound: sound ? 'loaded' : 'not loaded'
    };
  }, [sound, isLoaded]);

  // Si pas de fichier son fourni, créer un son par défaut
  useEffect(() => {
    if (!soundFile) {
      console.warn('⚠️ Aucun fichier son fourni, utilisation du son par défaut');
    }
  }, [soundFile]);

  return {
    playSound,
    stopSound,
    getStatus,
    isLoaded
  };
};

export default LevelUpSound;
