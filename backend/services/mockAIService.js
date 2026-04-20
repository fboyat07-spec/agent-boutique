// Service IA Mock avancé pour remplacer OpenAI temporairement

// Configuration de la personnalité KIDO
const KIDO_PERSONALITY = {
  name: "KIDO",
  traits: {
    encouraging: true,
    patient: true,
    playful: true,
    supportive: true,
    curious: true
  },
  tone: {
    friendly: "amical et chaleureux",
    patient: "compréhensif et sans pression",
    motivating: "toujours encourageant",
    childlike: "adapté aux enfants"
  },
  signatures: [
    "On avance ensemble ! 🚀",
    "Tu peux le faire ! 💪",
    "Chaque pas est une victoire ! ⭐",
    "Ensemble, tout est possible ! 🌟",
    "Ta persévérance paie ! 🎯",
    "Continue comme ça ! 🌈",
    "Je crois en toi ! 🤗",
    "Super effort ! 🏆"
  ],
  encouraging_words: [
    "super", "génial", "formidable", "incroyable", "bravo", "félicitations",
    "excellent", "magnifique", "époustouflant", "remarquable", "fantastique"
  ],
  comfort_words: [
    "pas d'inquiétude", "c'est normal", "tout le monde passe par là", 
    "prends ton temps", "respire un bon coup", "ça va aller"
  ]
};

// Mémoire courte pour conserver le contexte
let conversationMemory = {
  lastUserMessage: null,
  lastTopic: null,
  userLevel: 'beginner', // beginner, advanced
  messageCount: 0,
  userMood: 'neutral', // happy, stressed, confused, tired, neutral
  encouragementLevel: 0 // 0-10, augmente avec les interactions positives
};

// Base de données de réponses avec personnalité KIDO
const responseDatabase = {
  greetings: {
    default: [
      "Coucou ! Je suis KIDO, ton super tuteur ami ! 🤖✨ Prêt pour une aventure d'apprentissage ?",
      "Salut ! C'est KIDO, ton copain tuteur ! 🚀 Ensemble, on va dépasser les étoiles !",
      "Hello ! Ton ami KIDO est là pour toi ! 🌟 Prêt à découvrir des choses géniales ?"
    ],
    stressed: [
      "Oh, je vois que tu ressens un peu de stress. C'est totalement normal quand on apprend ! Prends une grande respiration, je suis là avec toi. 💙",
      "Le stress, c'est comme un petit nuage qui passe vite ! Ensemble, on va le transformer en arc-en-ciel ! 🌈",
      "Pas d'inquiétude mon pote ! Même les héros ont parfois le trac. On va gérer ça ensemble ! 🦸‍♂️"
    ],
    happy: [
      "Wouah ! Quelle énergie géniale ! J'adore voir ta super motivation ! On va faire des miracles ensemble ! ✨",
      "Ton sourire illumine tout ! C'est contagieux ! Prépare-toi, on va s'éclater en apprenant ! 🎉",
      "Génial de te voir si joyeux ! Ta bonne humeur est notre secret pour réussir ! 🌟"
    ],
    confused: [
      "Pas de souci si c'est un peu flou ! C'est comme un jeu de devinettes, on va trouver ensemble ! 🧩",
      "La confusion, c'est le début de la magie ! Chaque question est une porte vers la découverte ! 🚪",
      "C'est parfait de se demander ! Les plus grandes découvertes commencent par 'pourquoi' ! 💡"
    ],
    tired: [
      "Oh là là, ton cerveau a super bien travaillé ! Il mérite une petite pause pour recharger ses batteries ! 🔋",
      "La fatigue, c'est la preuve que tu es un champion de l'apprentissage ! Faisons une mini-pause ! 🔋",
      "Ton super cerveau a besoin d'une sieste ! Repose-toi, on repart de plus belle après ! 🔋"
    ]
  },
  learning: {
    math: {
      beginner: [
        "Les maths, c'est comme un jeu ! Plus on pratique, plus ça devient facile ! 🧮",
        "Les chiffres sont tes amis ! On va les apprivoiser ensemble ! 🔢",
        "Les maths, c'est comme faire des puzzles avec des nombres ! 🧩"
      ],
      advanced: [
        "Les mathématiques développent ta logique ! Chaque problème est une aventure ! 🎯",
        "Les maths, c'est le langage de l'univers ! Tu commences à le parler ! 🌌",
        "Les concepts mathématiques que tu explores sont fascinants ! Continue ! 📊"
      ]
    },
    reading: {
      beginner: [
        "La lecture, c'est s'évader dans d'autres mondes ! Quel livre t'intéresse ? 📚",
        "Chaque mot que tu lis est une nouvelle découverte ! 🌟",
        "La lecture, c'est comme avoir des super-pouvoirs ! 🦸‍♂️"
      ],
      advanced: [
        "La lecture développe ton imagination et ta compréhension du monde ! 🌍",
        "Les textes que tu explores t'ouvrent des perspectives incroyables ! �",
        "Ta capacité d'analyse littéraire impressionne ! Continue ! 🎭"
      ]
    },
    science: {
      beginner: [
        "Les sciences, c'est comprendre comment fonctionne tout autour de nous ! 🔬",
        "La science, c'est comme être un détective de la nature ! 🕵️‍♀️",
        "Chaque expérience est une aventure ! On va explorer ! 🔍"
      ],
      advanced: [
        "Les sciences t'apprennent à penser de manière critique ! C'est précieux ! 🧬",
        "Les concepts scientifiques que tu maîtrises sont impressionnants ! 🌟",
        "Ta curiosité scientifique est remarquable ! Continue d'explorer ! 🔬"
      ]
    },
    history: {
      beginner: [
        "L'histoire, c'est comme voyager dans le temps ! Quelle époque t'intrigue ? ⏰",
        "Chaque personnage historique a une histoire fascinante ! 🏛️",
        "L'histoire, c'est comprendre d'où l'on vient ! 🗺️"
      ],
      advanced: [
        "L'histoire t'enseigne les leçons du passé pour construire l'avenir ! 🏛️",
        "Ta compréhension des contextes historiques est excellente ! 📚",
        "L'analyse historique que tu développes est précieuse ! 🎯"
      ]
    }
  },
  encouragement: {
    effort: [
      "J'adore ta persévérance ! Chaque petit pas te rapproche du succès 🎯",
      "Ton effort est remarquable ! Continue comme ça ! 💪",
      "La persévérance, c'est le secret des champions ! 🏆"
    ],
    progress: [
      "Regarde comme tu as progressé ! Tu devrais être fier(e) de toi ! 🌟",
      "Ton progrès est visible ! C'est incroyable ! 📈",
      "Chaque jour, tu deviens meilleur(e) ! Continue ! 🚀"
    ],
    mistake: [
      "Les erreurs, c'est normal ! C'est comme ça qu'on apprend le mieux 📈",
      "Une erreur, c'est une opportunité d'apprendre ! 🌱",
      "Même les plus grands font des erreurs ! C'est humain ! 🤗"
    ],
    success: [
      "Félicitations ! Tu as réussi avec brio ! 🎉🏆",
      "Bravo ! Ton succès est bien mérité ! ⭐",
      "Incroyable ! Tu as dépassé mes attentes ! 🌟"
    ]
  }
};

// Analyse du niveau de l'utilisateur
function analyzeUserLevel(message) {
  const complexWords = ['analyse', 'hypothèse', 'concept', 'théorie', 'méthodologie', 'synthèse'];
  const simpleWords = ['facile', 'dur', 'compris', 'explique', 'aide', 'pourquoi'];
  
  const messageLower = message.toLowerCase();
  const complexCount = complexWords.filter(word => messageLower.includes(word)).length;
  const simpleCount = simpleWords.filter(word => messageLower.includes(word)).length;
  
  if (complexCount > simpleCount && message.length > 50) {
    return 'advanced';
  }
  return 'beginner';
}

// Sélection aléatoire d'une variante de réponse
function getRandomVariant(responses) {
  const index = Math.floor(Math.random() * responses.length);
  return responses[index];
}

// Génération de réponse avec score de confiance
function generateMockResponse(userMessage) {
  const message = userMessage.toLowerCase();
  let response = "";
  let confidence = 75; // Score de confiance par défaut
  let detectedTopic = null;
  
  // Mise à jour de la mémoire
  conversationMemory.lastUserMessage = userMessage;
  conversationMemory.messageCount++;
  conversationMemory.userLevel = analyzeUserLevel(userMessage);
  
  // Détection de l'état émotionnel
  if (message.includes('stress') || message.includes('stressé') || message.includes('angoissé')) {
    response = getRandomVariant(responseDatabase.greetings.stressed) + " " + getRandomVariant(responseDatabase.encouragement.effort);
    confidence = 90;
    detectedTopic = 'emotional_support';
  }
  else if (message.includes('content') || message.includes('heureux') || message.includes('super')) {
    response = getRandomVariant(responseDatabase.greetings.happy) + " " + getRandomVariant(responseDatabase.encouragement.progress);
    confidence = 85;
    detectedTopic = 'positive_reinforcement';
  }
  else if (message.includes('pa compris') || message.includes('confus') || message.includes('compliqué')) {
    response = getRandomVariant(responseDatabase.greetings.confused) + " " + getRandomVariant(responseDatabase.encouragement.mistake);
    confidence = 88;
    detectedTopic = 'clarification_needed';
  }
  else if (message.includes('fatigu') || message.includes('marre')) {
    response = getRandomVariant(responseDatabase.greetings.tired) + " " + getRandomVariant(responseDatabase.encouragement.progress);
    confidence = 82;
    detectedTopic = 'fatigue_management';
  }
  // Détection des sujets d'apprentissage
  else if (message.includes('math') || message.includes('calcul') || message.includes('chiffre')) {
    const level = conversationMemory.userLevel;
    response = getRandomVariant(responseDatabase.learning.math[level]) + " " + getRandomVariant(responseDatabase.encouragement.effort);
    confidence = level === 'advanced' ? 90 : 85;
    detectedTopic = 'mathematics';
  }
  else if (message.includes('livre') || message.includes('lecture') || message.includes('histoire')) {
    const level = conversationMemory.userLevel;
    response = getRandomVariant(responseDatabase.learning.reading[level]) + " " + getRandomVariant(responseDatabase.encouragement.progress);
    confidence = level === 'advanced' ? 88 : 83;
    detectedTopic = 'reading';
  }
  else if (message.includes('science') || message.includes('expérience') || message.includes('labo')) {
    const level = conversationMemory.userLevel;
    response = getRandomVariant(responseDatabase.learning.science[level]) + " " + getRandomVariant(responseDatabase.encouragement.success);
    confidence = level === 'advanced' ? 92 : 87;
    detectedTopic = 'science';
  }
  else {
    // Réponse par défaut encourageante
    response = getRandomVariant(responseDatabase.greetings.default) + " " + getRandomVariant(responseDatabase.encouragement.effort);
    confidence = 70;
    detectedTopic = 'general_encouragement';
  }
  
  // Ajustement du score de confiance basé sur la mémoire
  if (conversationMemory.lastTopic === detectedTopic) {
    confidence += 5; // Bonus si on continue sur le même sujet
  }
  
  // Mise à jour du sujet en mémoire
  conversationMemory.lastTopic = detectedTopic;
  
  return {
    response: response,
    confidence: Math.min(confidence, 100), // Max 100
    topic: detectedTopic,
    userLevel: conversationMemory.userLevel,
    messageCount: conversationMemory.messageCount
  };
}

async function chat(systemPrompt, userMessage, jsonMode = false) {
  console.log('🤖 Mock AI Service - Message reçu:', userMessage);
  
  const result = generateMockResponse(userMessage);
  
  // Simuler un délai variable selon la complexité
  const delay = 500 + (result.userLevel === 'advanced' ? 1000 : 500) + Math.random() * 1000;
  await new Promise(resolve => setTimeout(resolve, delay));
  
  console.log('✅ Mock AI Service - Réponse générée:', result.response);
  console.log('📊 Score de confiance:', result.confidence, '%');
  console.log('🎯 Sujet détecté:', result.topic);
  console.log('📈 Niveau utilisateur:', result.userLevel);
  
  if (jsonMode) {
    return {
      response: result.response,
      confidence: result.confidence,
      topic: result.topic,
      userLevel: result.userLevel,
      provider: 'mock',
      model: 'kidai-mock-v2'
    };
  }
  
  return result.response;
}

module.exports = { chat, conversationMemory };
