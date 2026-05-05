// ACTION 5 - IA avancée (optionnelle + fallback)

const { isEnabled } = require('./envFlags');
const { detectIntent } = require('./intentionDetector');
const { getLead, updateLead } = require('./leadMemory');
const BusinessLogger = require('./businessLogger');

// Orchestrateur IA avancé avec fallback garanti
class AIOrchestrator {
  constructor() {
    this.enabled = isEnabled('AI_ADVANCED_ENABLED');
    this.stats = {
      total: 0,
      enhanced: 0,
      fallbacks: 0,
      errors: 0
    };
  }
  
  // Améliorer décision avec IA avancée
  async enhanceDecision(context) {
    this.stats.total++;
    
    if (!this.enabled) {
      this.stats.fallbacks++;
      console.log('[AI_ORCHESTRATOR_DISABLED] Using basic logic');
      return await this.fallbackDecision(context);
    }
    
    try {
      console.log('[AI_ORCHESTRATOR_ENHANCING]', {
        phone: context.lead?.phone,
        context: context.type
      });
      
      const enhancement = await this.processWithAdvancedAI(context);
      
      if (enhancement) {
        this.stats.enhanced++;
        console.log('[AI_ORCHESTRATOR_ENHANCED]', {
          phone: context.lead?.phone,
          enhancement: Object.keys(enhancement)
        });
        
        return enhancement;
      } else {
        this.stats.fallbacks++;
        return await this.fallbackDecision(context);
      }
      
    } catch (error) {
      this.stats.errors++;
      console.log('[AI_ORCHESTRATOR_ERROR]', {
        phone: context.lead?.phone,
        error: error.message
      });
      
      BusinessLogger.logAIFallbackUsed(context.lead?.phone, 'orchestrator_error', error.message);
      
      return await this.fallbackDecision(context);
    }
  }
  
  // Traitement avec IA avancée
  async processWithAdvancedAI(context) {
    const { type, lead, message } = context;
    
    switch (type) {
      case 'scoring':
        return await this.enhanceScoring(lead, message);
        
      case 'intent':
        return await this.enhanceIntentDetection(lead, message);
        
      case 'messaging':
        return await this.enhanceMessaging(lead, message);
        
      case 'priority':
        return await this.enhancePriority(lead);
        
      default:
        return null;
    }
  }
  
  // Améliorer scoring avec IA
  async enhanceScoring(lead, message) {
    try {
      // Utiliser IA existante si disponible
      const { generateReply } = require('./aiCloser');
      
      if (!generateReply) {
        return null;
      }
      
      // Analyser message avec IA pour extraire des signaux
      const prompt = `
Analyse ce message client et attribue un score de 0 à 100 basé sur:
- Niveau d'intérêt (0-40 points)
- Urgence (0-30 points)  
- Qualification (0-20 points)
- Potentiel commercial (0-10 points)

Message: "${message}"

Réponds uniquement avec le score numérique.
`;
      
      const response = await generateReply({
        message: prompt,
        lead: lead || { business: 'unknown', status: 'NEW', city: 'France' }
      });
      
      const aiScore = parseInt(response?.match(/\d+/)?.[0]) || 0;
      const normalizedScore = Math.max(0, Math.min(100, aiScore));
      
      console.log('[AI_SCORING_ENHANCED]', {
        phone: lead?.phone,
        aiScore,
        normalizedScore
      });
      
      return {
        score: normalizedScore,
        confidence: aiScore > 0 ? 0.8 : 0.5,
        factors: {
          interest: aiScore > 50,
          urgency: aiScore > 70,
          qualification: aiScore > 30
        }
      };
      
    } catch (error) {
      console.log('[AI_SCORING_ERROR]', error.message);
      return null;
    }
  }
  
  // Améliorer détection intention avec IA
  async enhanceIntentDetection(lead, message) {
    try {
      const { generateReply } = require('./aiCloser');
      
      if (!generateReply) {
        return null;
      }
      
      const prompt = `
Analyse ce message et détermine l'intention principale:
- INFO (demande d'information)
- INTERESTED (intérêt manifeste)
- OBJECTION (résistance/doute)
- READY_TO_BUY (prêt à acheter)

Message: "${message}"

Réponds uniquement avec l'intention exacte: INFO, INTERESTED, OBJECTION, ou READY_TO_BUY
`;
      
      const response = await generateReply({
        message: prompt,
        lead: lead || { business: 'unknown', status: 'NEW', city: 'France' }
      });
      
      const aiIntent = response?.trim()?.toUpperCase();
      const validIntents = ['INFO', 'INTERESTED', 'OBJECTION', 'READY_TO_BUY'];
      
      if (validIntents.includes(aiIntent)) {
        console.log('[AI_INTENT_ENHANCED]', {
          phone: lead?.phone,
          aiIntent,
          confidence: 0.9
        });
        
        return {
          intent: aiIntent,
          confidence: 0.9,
          reasoning: 'ai_analysis'
        };
      }
      
      return null;
      
    } catch (error) {
      console.log('[AI_INTENT_ERROR]', error.message);
      return null;
    }
  }
  
  // Améliorer messaging avec IA
  async enhanceMessaging(lead, message) {
    try {
      const { generateReply } = require('./aiCloser');
      
      if (!generateReply) {
        return null;
      }
      
      // Utiliser IA existante pour générer message personnalisé
      const aiMessage = await generateReply({
        message,
        lead: lead || { business: 'unknown', status: 'NEW', city: 'France' }
      });
      
      if (aiMessage && aiMessage.length > 0) {
        console.log('[AI_MESSAGING_ENHANCED]', {
          phone: lead?.phone,
          messageLength: aiMessage.length,
          personalized: true
        });
        
        return {
          message: aiMessage,
          personalized: true,
          confidence: 0.85
        };
      }
      
      return null;
      
    } catch (error) {
      console.log('[AI_MESSAGING_ERROR]', error.message);
      return null;
    }
  }
  
  // Améliorer priorité avec IA
  async enhancePriority(lead) {
    try {
      // Scorer le lead avec IA pour déterminer priorité
      const scoringResult = await this.enhanceScoring(lead, '');
      
      if (scoringResult) {
        // Calculer priorité basée sur score et autres facteurs
        const priority = this.calculatePriorityFromScore(scoringResult.score, lead);
        
        console.log('[AI_PRIORITY_ENHANCED]', {
          phone: lead?.phone,
          score: scoringResult.score,
          priority
        });
        
        return {
          priority,
          score: scoringResult.score,
          factors: scoringResult.factors
        };
      }
      
      return null;
      
    } catch (error) {
      console.log('[AI_PRIORITY_ERROR]', error.message);
      return null;
    }
  }
  
  // Calculer priorité depuis score
  calculatePriorityFromScore(score, lead) {
    // Facteurs additionnels
    const daysSinceContact = lead.lastContactAt 
      ? (Date.now() - new Date(lead.lastContactAt).getTime()) / (1000 * 60 * 60 * 24)
      : 999;
    
    const followUpCount = lead.followUpCount || 0;
    
    // Calcul priorité (plus haut = plus urgent)
    let priority = score;
    
    // Bonus pour leads récents
    if (daysSinceContact < 1) priority += 10;
    else if (daysSinceContact < 7) priority += 5;
    
    // Malus pour trop de follow-ups
    if (followUpCount > 2) priority -= 10;
    
    // Bonus pour statuts avancés
    if (lead.status === 'CLOSING') priority += 15;
    else if (lead.status === 'INTERESTED') priority += 10;
    
    return Math.max(0, Math.min(100, priority));
  }
  
  // Fallback vers logique existante
  async fallbackDecision(context) {
    console.log('[AI_ORCHESTRATOR_FALLBACK]', {
      type: context.type,
      phone: context.lead?.phone
    });
    
    switch (context.type) {
      case 'scoring':
        return {
          score: this.basicScoring(context.lead, context.message),
          confidence: 0.6,
          factors: { basic: true }
        };
        
      case 'intent':
        return {
          intent: detectIntent(context.message),
          confidence: 0.7,
          reasoning: 'basic_detection'
        };
        
      case 'messaging':
        return {
          message: this.basicMessage(context.lead, context.message),
          personalized: false,
          confidence: 0.5
        };
        
      case 'priority':
        return {
          priority: this.basicPriority(context.lead),
          score: context.lead?.score || 0,
          factors: { basic: true }
        };
        
      default:
        return null;
    }
  }
  
  // Scoring basique
  basicScoring(lead, message) {
    let score = 10; // Base
    
    if (message) {
      // +20 pour réponse inbound
      score += 20;
      
      // +30 si interested
      if (detectIntent(message) === 'INTERESTED') score += 30;
      
      // +50 si ready to buy
      if (detectIntent(message) === 'READY_TO_BUY') score += 50;
    }
    
    return Math.min(100, score);
  }
  
  // Message basique
  basicMessage(lead, message) {
    const intent = detectIntent(message);
    
    switch (intent) {
      case 'INTERESTED':
        return 'Super ! Je peux vous donner plus d\'informations ?';
      case 'READY_TO_BUY':
        return 'Parfait ! Voici le lien pour finaliser : [LIEN]';
      case 'OBJECTION':
        return 'Je comprends. Quelle est votre préoccupation ?';
      default:
        return 'Merci pour votre réponse. Comment puis-je vous aider ?';
    }
  }
  
  // Priorité basique
  basicPriority(lead) {
    return lead?.score || 10;
  }
  
  // Stats de l'orchestrateur
  getStats() {
    return {
      enabled: this.enabled,
      stats: this.stats,
      enhancementRate: this.stats.total > 0 ? (this.stats.enhanced / this.stats.total) * 100 : 0,
      fallbackRate: this.stats.total > 0 ? (this.stats.fallbacks / this.stats.total) * 100 : 0,
      errorRate: this.stats.total > 0 ? (this.stats.errors / this.stats.total) * 100 : 0
    };
  }
}

// Instance globale de l'orchestrateur
if (!global.aiOrchestrator) {
  global.aiOrchestrator = new AIOrchestrator();
}

// Fonction principale d'amélioration
async function enhanceDecision(context) {
  return await global.aiOrchestrator.enhanceDecision(context);
}

// Stats de l'orchestrateur
function getOrchestratorStats() {
  return global.aiOrchestrator.getStats();
}

module.exports = {
  enhanceDecision,
  getOrchestratorStats,
  AIOrchestrator
};
