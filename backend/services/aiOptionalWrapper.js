// ACTION 8 - IA optionnelle (non bloquante)

const { detectIntent } = require('./intentionDetector');
const BusinessLogger = require('./businessLogger');

// Wrapper IA avec fallback vers détecteur pure
async function processWithAI(message, lead = null) {
  try {
    // ACTION 8 - Vérifier flag IA_ENABLED
    if (process.env.AI_ENABLED !== 'true') {
      console.log('[AI_DISABLED] Using fallback detector');
      return detectIntent(message);
    }
    
    // Tentative avec IA existante si disponible
    const { generateReply } = require('./aiCloser');
    
    if (!generateReply) {
      console.log('[AI_MODULE_MISSING] Using fallback detector');
      return detectIntent(message);
    }
    
    // Utiliser IA pour générer réponse
    const aiResponse = await generateReply({
      message,
      lead: lead || {
        business: 'unknown',
        city: 'France',
        status: 'NEW'
      }
    });
    
    if (aiResponse) {
      console.log('[AI_RESPONSE_GENERATED]', {
        hasLead: !!lead,
        responseLength: aiResponse.length
      });
      
      BusinessLogger.logWebhookReceived('ai', 'ai_response_generated');
      return aiResponse;
    } else {
      console.log('[AI_RESPONSE_NULL] Using fallback detector');
      BusinessLogger.logWebhookSkipped('ai_fallback_used', { reason: 'null_response' });
      return detectIntent(message);
    }
    
  } catch (error) {
    console.log('[AI_ERROR] Using fallback detector', {
      error: error.message,
      message: message.substring(0, 50)
    });
    
    BusinessLogger.logWebhookError('AI fallback used', {
      error: error.message,
      context: 'ai_optional_wrapper'
    });
    
    // ACTION 8 - Fallback vers detectIntent si erreur
    return detectIntent(message);
  }
}

// Version simplifiée pour détection d'intention avec IA
async function detectIntentWithAI(message, lead = null) {
  try {
    if (process.env.AI_ENABLED !== 'true') {
      return detectIntent(message);
    }
    
    // Pour l'intention, on utilise l'IA pour analyser mais on retourne l'intention détectée
    const aiResponse = await processWithAI(message, lead);
    
    // Analyser la réponse IA pour en extraire l'intention
    const intent = extractIntentFromAIResponse(aiResponse, message);
    
    console.log('[AI_INTENT_DETECTED]', {
      originalIntent: detectIntent(message),
      aiIntent: intent,
      usedAI: true
    });
    
    return intent;
    
  } catch (error) {
    console.log('[AI_INTENT_ERROR] Using fallback', error.message);
    return detectIntent(message);
  }
}

// Extraire intention depuis réponse IA
function extractIntentFromAIResponse(aiResponse, originalMessage) {
  if (!aiResponse || typeof aiResponse !== 'string') {
    return detectIntent(originalMessage);
  }
  
  const response = aiResponse.toLowerCase();
  
  // Mots-clés READY_TO_BUY
  const readyKeywords = [
    'lien', 'paiement', 'payer', 'acheter', 'commander', 'finaliser',
    'activer', 'souscrire', 'inscription'
  ];
  
  // Mots-clés OBJECTION
  const objectionKeywords = [
    'non', 'pas', 'refuse', 'intéressé', 'merci', 'annuler'
  ];
  
  // Mots-clés INTERESTED
  const interestedKeywords = [
    'intéressé', 'curieux', 'savoir', 'plus', 'information',
    'détails', 'expliquez', 'comment'
  ];
  
  // Vérifier mots-clés dans réponse IA
  for (const keyword of readyKeywords) {
    if (response.includes(keyword)) {
      return 'READY_TO_BUY';
    }
  }
  
  for (const keyword of objectionKeywords) {
    if (response.includes(keyword)) {
      return 'OBJECTION';
    }
  }
  
  for (const keyword of interestedKeywords) {
    if (response.includes(keyword)) {
      return 'INTERESTED';
    }
  }
  
  // Fallback vers détecteur original
  return detectIntent(originalMessage);
}

// Wrapper pour génération de message avec IA
async function generateMessageWithAI(message, lead) {
  try {
    if (process.env.AI_ENABLED !== 'true') {
      return null; // Pas d'IA, retourner null pour utiliser messages par défaut
    }
    
    const aiResponse = await processWithAI(message, lead);
    
    if (aiResponse && aiResponse.length > 0) {
      console.log('[AI_MESSAGE_GENERATED]', {
        leadStatus: lead?.status,
        responseLength: aiResponse.length
      });
      
      return aiResponse;
    }
    
    return null;
    
  } catch (error) {
    console.log('[AI_MESSAGE_ERROR]', error.message);
    return null;
  }
}

// Vérifier si IA est disponible
function isAIAvailable() {
  return process.env.AI_ENABLED === 'true';
}

// Stats IA
function getAIStats() {
  return {
    enabled: isAIAvailable(),
    module: !!require('./aiCloser').generateReply,
    fallbackUsed: 0, // Pourrait être incrémenté dynamiquement
    lastUsed: null
  };
}

// Test IA (pour debug)
async function testAI(message = 'test message') {
  try {
    console.log('[AI_TEST] Starting test...');
    
    const result = await processWithAI(message);
    
    console.log('[AI_TEST_RESULT]', {
      message,
      result: result?.substring(0, 100),
      usedAI: isAIAvailable()
    });
    
    return result;
    
  } catch (error) {
    console.log('[AI_TEST_ERROR]', error.message);
    return null;
  }
}

module.exports = {
  processWithAI,
  detectIntentWithAI,
  generateMessageWithAI,
  extractIntentFromAIResponse,
  isAIAvailable,
  getAIStats,
  testAI
};
