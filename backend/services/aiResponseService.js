const { chat } = require('./openaiService');

// Sales variants by stage
const SALES_VARIANTS = {
  new: {
    direct: [
      "Besoin d'aide pour votre projet ?",
      "Quelle solution recherchez-vous ?",
      "Comment puis-je vous aider ?"
    ],
    soft: [
      "Bonjour ! Parlez-moi de votre projet",
      "Je suis là pour vous accompagner",
      "Qu'est-ce qui vous amène aujourd'hui ?"
    ],
    urgency: [
      "Démarrons votre projet maintenant",
      "Ne tardez plus, je suis disponible",
      "Commencez dès aujourd'hui"
    ]
  },
  qualified: {
    direct: [
      "Voici la solution parfaite pour vous",
      "Nos résultats prouvent notre efficacité",
      "Cette solution correspond à vos besoins"
    ],
    soft: [
      "Je pense que cette solution vous plaiera",
      "Nos clients adorent cette approche",
      "Découvrez pourquoi nous sommes différents"
    ],
    urgency: [
      "Cette offre est limitée dans le temps",
      "Plusieurs clients intéressés actuellement",
      "Agissez maintenant pour garantir votre place"
    ]
  },
  interested: {
    direct: [
      "Prêt à commencer ?",
      "Je vous prépare l'accès maintenant",
      "Confirmez et nous démarrons"
    ],
    soft: [
      "Y a-t-il des questions avant de commencer ?",
      "Je suis là pour faciliter chaque étape",
      "Procédons à votre rythme"
    ],
    urgency: [
      "Les places se remplissent vite",
      "Ne manquez pas cette opportunité",
      "Dernière chance de vous inscrire"
    ]
  },
  closing: {
    direct: [
      "Finalisons maintenant",
      "Signez aujourd'hui",
      "Confirmez votre choix maintenant"
    ],
    soft: [
      "Prêt à finaliser ensemble ?",
      "Je vous guide jusqu'à la fin",
      "Accompagnons-nous jusqu'au bout"
    ],
    urgency: [
      "Offre expire ce soir",
      "Plus que quelques places disponibles",
      "Dernier jour pour cette offre"
    ]
  }
};

// Fallback responses by stage
const FALLBACK_RESPONSES = {
  new: "Bonjour ! Comment puis-je vous aider aujourd'hui ?",
  qualified: "Je suis là pour trouver la meilleure solution pour vous",
  interested: "Parfait ! Procédons ensemble étape par étape",
  closing: "Prêt à finaliser ? Je suis là pour vous aider"
};

// Select or get variant for conversation
function getVariant(conversation) {
  if (!conversation || !conversation.metadata) {
    return selectRandomVariant();
  }
  
  const existingVariant = conversation.metadata.variant;
  if (existingVariant && ['direct', 'soft', 'urgency'].includes(existingVariant)) {
    return existingVariant;
  }
  
  return selectRandomVariant();
}

function selectRandomVariant() {
  const variants = ['direct', 'soft', 'urgency'];
  return variants[Math.floor(Math.random() * variants.length)];
}

// Generate stage-specific response
function generateStageResponse(stage, variant, context) {
  const stageVariants = SALES_VARIANTS[stage];
  if (!stageVariants) {
    return FALLBACK_RESPONSES[stage] || "Je suis là pour vous aider";
  }
  
  const responses = stageVariants[variant] || stageVariants.direct;
  const response = responses[Math.floor(Math.random() * responses.length)];
  
  console.log('[AI STAGE RESPONSE]', { stage, variant, response });
  return response;
}

// Main AI response function
async function generateAIResponse(conversation, userMessage, context = {}) {
  try {
    const stage = conversation?.stage || 'new';
    const variant = getVariant(conversation);
    
    console.log('[AI VARIANT SELECTED]', { stage, variant, conversationId: conversation?._id });
    
    // Try AI generation first
    const aiPrompt = buildAIPrompt(stage, variant, userMessage, context);
    const aiResponse = await chat(aiPrompt, userMessage, false);
    
    if (aiResponse && !aiResponse.demo && isValidResponse(aiResponse)) {
      return {
        reply: aiResponse,
        tags: ['ai-generated', stage, variant],
        metadata: {
          stage,
          variant,
          source: 'ai'
        }
      };
    }
    
    // Fallback to predefined responses
    const fallbackResponse = generateStageResponse(stage, variant, context);
    
    return {
      reply: fallbackResponse,
      tags: ['fallback', stage, variant],
      metadata: {
        stage,
        variant,
        source: 'fallback'
      }
    };
    
  } catch (error) {
    console.error('[AI RESPONSE ERROR]', error.message);
    
    // Ultimate fallback
    const stage = conversation?.stage || 'new';
    const fallbackResponse = FALLBACK_RESPONSES[stage] || "Je suis là pour vous aider";
    
    return {
      reply: fallbackResponse,
      tags: ['error-fallback', stage],
      metadata: {
        stage,
        source: 'error-fallback',
        error: error.message
      }
    };
  }
}

// Build AI prompt based on stage and variant
function buildAIPrompt(stage, variant, userMessage, context) {
  const variantInstructions = {
    direct: "Sois direct et concis. Va droit au but.",
    soft: "Sois doux et consultatif. Adopte une approche bienveillante.",
    urgency: "Crée un sentiment d'urgence. Pousse à l'action immédiate."
  };
  
  const stageInstructions = {
    new: "Accroche le prospect avec une question. Sois engageant.",
    qualified: "Montre la valeur et la preuve. Sois persuasif.",
    interested: "Élimine les frictions. Facilite la décision.",
    closing: "Appel à l'action fort. Pousse à la finalisation."
  };
  
  const baseRules = `
Règles importantes:
- Réponse < 20 mots maximum
- Ton WhatsApp naturel et amical
- Pas de markdown ou formatage
- Pas d'emojis excessifs
- Une seule idée par message
- Inclus un appel à l'action quand pertinent
`;
  
  return `
Tu es un assistant commercial expert.

Style: ${variantInstructions[variant] || variantInstructions.direct}
Objectif: ${stageInstructions[stage] || stageInstructions.new}
${baseRules}

Message du prospect: "${userMessage}"
${context.previousMessages ? `Contexte: ${context.previousMessages}` : ''}

Génère une réponse parfaite pour ce stage et ce style.
`;
}

// Validate response quality
function isValidResponse(response) {
  if (!response || typeof response !== 'string') return false;
  
  const words = response.trim().split(/\s+/);
  if (words.length > 20) return false;
  
  // Check for basic quality
  return response.length > 5 && response.length < 150;
}

module.exports = {
  generateAIResponse,
  getVariant,
  generateStageResponse
};
