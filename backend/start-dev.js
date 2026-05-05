// Script de démarrage développement avec fallback MongoDB local

const { spawn } = require('child_process');
const fs = require('fs');

// Configuration environnement
const env = {
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/agent-boutique-local',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'sk-test-key',
  VERIFY_TOKEN: process.env.VERIFY_TOKEN || 'my_verify_token_2468',
  PORT: process.env.PORT || '3000',
  NODE_ENV: process.env.NODE_ENV || 'development'
};

console.log('🚀 Démarrage serveur agent-boutique');
console.log('📊 Configuration:');
console.log('   - MongoDB:', env.MONGODB_URI);
console.log('   - Port:', env.PORT);
console.log('   - Token:', env.VERIFY_TOKEN ? '✅' : '❌');
console.log('   - OpenAI:', env.OPENAI_API_KEY ? '✅' : '❌');

// Créer le dossier data si inexistant
const dataDir = './data';
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('📁 Dossier data créé');
}

// Créer fichier leads.csv vide si inexistant
const leadsFile = './data/leads.csv';
if (!fs.existsSync(leadsFile)) {
  fs.writeFileSync(leadsFile, 'phone,name,city,business\n+33612345678,Test Lead,Paris,Test Business\n');
  console.log('📄 Fichier leads.csv créé');
}

// Démarrer le serveur avec l'environnement configuré
const serverProcess = spawn('node', ['server.js'], {
  env: { ...process.env, ...env },
  stdio: 'inherit',
  shell: true
});

serverProcess.on('error', (error) => {
  console.error('❌ Erreur démarrage serveur:', error.message);
});

serverProcess.on('close', (code) => {
  console.log(`🔄 Serveur arrêté avec code: ${code}`);
});

// Gestion du signal d'arrêt
process.on('SIGINT', () => {
  console.log('\n🛑 Arrêt du serveur...');
  serverProcess.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Arrêt du serveur...');
  serverProcess.kill('SIGTERM');
});
