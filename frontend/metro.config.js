const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Configuration pour Expo SDK 54
config.resolver.assetExts.push(
  // Ajouter les extensions de fichiers supplémentaires si nécessaire
  'db',
  'mp3',
  'ttf',
  'obj',
  'png',
  'jpg'
);

// Optimisation pour le web
config.resolver.platforms = ['ios', 'android', 'web'];

// Configuration de transformation pour React Native Reanimated
config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    inlineRequires: true,
  },
});

module.exports = config;
