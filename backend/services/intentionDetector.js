// ACTION 3 - Pipeline intention (detectIntent pure sans API externe)

// Fonction PURE de détection d'intention
function detectIntent(message) {
  if (!message || typeof message !== 'string') {
    return 'INFO';
  }
  
  const normalized = message.toLowerCase().trim();
  
  // Mots-clés READY_TO_BUY (priorité haute)
  const readyToBuy = [
    'oui', 'je veux', 'je commande', 'je prends', 'ok je veux',
    'je suis prêt', 'allons-y', 'je veux bien', 'je veux acheter',
    'je veux commander', 'je veux activer', 'je veux souscrire',
    'je veux payer', 'je veux acheter', 'je veux prendre',
    'je suis partant', 'je veux bien', 'je veux essayer',
    'je veux commencer', 'je veux démarrer', 'je veux m\'inscrire'
  ];
  
  // Mots-clés OBJECTION
  const objections = [
    'non', 'pas', 'refuse', 'non merci', 'ça va pas', 'ça ne m\'intéresse pas',
    'je ne veux pas', 'pas intéressé', 'pas pour moi', 'je ne suis pas intéressé',
    'ça ne me plaît pas', 'je ne veux pas', 'je ne suis pas partant',
    'je ne suis pas intéressé', 'je ne veux pas acheter', 'je ne veux pas commander'
  ];
  
  // Mots-clés INTERESTED
  const interested = [
    'intéressé', 'intéressante', 'ça m\'intéresse', 'je suis intéressé',
    'je suis intéressée', 'je voudrais savoir', 'je veux savoir',
    'dis-moi en plus', 'j\'aimerais savoir', 'ça m\'intéresse',
    'je suis curieux', 'je suis curieuse', 'je veux en savoir plus',
    'explique-moi', 'dis-en plus', 'j\'aimerais comprendre',
    'combien ça coûte', 'c\'est combien', 'quel prix', 'prix',
    'tarif', 'coût', 'combien', 'prix', 'tarif', 'coût'
  ];
  
  // Check READY_TO_BUY (priorité haute)
  for (const keyword of readyToBuy) {
    if (normalized.includes(keyword)) {
      console.log('[INTENT_DETECTED]', { intent: 'READY_TO_BUY', keyword });
      return 'READY_TO_BUY';
    }
  }
  
  // Check OBJECTION
  for (const keyword of objections) {
    if (normalized.includes(keyword)) {
      console.log('[INTENT_DETECTED]', { intent: 'OBJECTION', keyword });
      return 'OBJECTION';
    }
  }
  
  // Check INTERESTED
  for (const keyword of interested) {
    if (normalized.includes(keyword)) {
      console.log('[INTENT_DETECTED]', { intent: 'INTERESTED', keyword });
      return 'INTERESTED';
    }
  }
  
  // Default INFO
  console.log('[INTENT_DETECTED]', { intent: 'INFO', message: normalized.substring(0, 50) });
  return 'INFO';
}

// Test rapide (optionnel)
function testIntentDetector() {
  const tests = [
    'oui je veux commander',
    'je suis intéressé',
    'non merci',
    'bonjour'
  ];
  
  tests.forEach(test => {
    console.log(`TEST: "${test}" -> ${detectIntent(test)}`);
  });
}

module.exports = {
  detectIntent,
  testIntentDetector
};
