#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔧 Réparation pour Expo SDK 54...');

// Vérifier et corriger les fichiers critiques
const fixes = [
  {
    file: 'babel.config.js',
    check: (content) => content.includes('babel-preset-expo'),
    fix: (content) => content.replace('presets: [\'expo\']', 'presets: [\'babel-preset-expo\']')
  },
  {
    file: 'package.json',
    check: (content) => content.includes('"react": "18.3.1"'),
    fix: (content) => {
      // S'assurer que les versions sont correctes
      return content
        .replace(/"react": "\d+\.\d+\.\d+"/g, '"react": "18.3.1"')
        .replace(/"react-native": "\d+\.\d+\.\d+"/g, '"react-native": "0.76.7"')
        .replace(/"expo": "~\d+\.\d+\.\d+"/g, '"expo": "~54.0.0"');
    }
  }
];

fixes.forEach(({ file, check, fix }) => {
  const filePath = path.join(__dirname, '..', file);
  
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    
    if (!check(content)) {
      console.log(`📝 Correction de ${file}...`);
      fs.writeFileSync(filePath, fix(content), 'utf8');
      console.log(`✅ ${file} corrigé`);
    } else {
      console.log(`✅ ${file} déjà correct`);
    }
  } else {
    console.log(`⚠️  ${file} non trouvé`);
  }
});

console.log('🎉 Réparation terminée !');
console.log('📦 Lancez maintenant: npm install');
console.log('🚀 Puis: npx expo start --clear');
