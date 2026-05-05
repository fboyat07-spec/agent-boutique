// ACTION 5 - Wrapper envoi WhatsApp

const { getFlag } = require('./envFlags');
const { logOutboundReal, logRealError } = require('./realValidationLogger');
const { addRealStep, recordResponseLatency } = require('./realTraceManager');
const { checkActionAllowed, recordAction } = require('./testModeLimiter');

// Wrapper pour envoi WhatsApp (SAFE - non intrusif)
class WhatsAppWrapper {
  constructor() {
    this.testModeEnabled = getFlag('AGENT_TEST_MODE');
    this.realValidationEnabled = getFlag('AGENT_REAL_VALIDATION_MODE');
    this.stats = {
      totalWrapped: 0,
      successfulSends: 0,
      failedSends: 0,
      retries: 0,
      byType: new Map()
    };
    
    console.log('[WHATSAPP_WRAPPER_INITIALIZED]', {
      testModeEnabled: this.testModeEnabled,
      realValidationEnabled: this.realValidationEnabled
    });
  }
  
  // Wrapper principal pour envoi WhatsApp
  wrapSendWhatsApp(originalSendFunction) {
    if (!this.testModeEnabled && !this.realValidationEnabled) {
      return originalSendFunction; // Retourner fonction originale si aucun mode activé
    }
    
    return async (phone, message, options = {}) => {
      const startTime = Date.now();
      this.stats.totalWrapped++;
      
      console.log('[WHATSAPP_WRAPPER_SEND_START]', {
        phone: this.maskPhone(phone),
        messageLength: message?.length || 0,
        messageType: options.messageType || 'outbound',
        environment: this.getEnvironment()
      });
      
      try {
        // Vérifier les limites d'actions
        const actionCheck = checkActionAllowed('message', {
          tenant_id: options.tenant_id,
          phone
        });
        
        if (!actionCheck.allowed) {
          console.log('[WHATSAPP_WRAPPER_BLOCKED]', {
            phone: this.maskPhone(phone),
            reason: actionCheck.reason
          });
          
          return {
            success: false,
            reason: actionCheck.reason,
            blocked: true,
            environment: this.getEnvironment()
          };
        }
        
        // Logger l'envoi réel
        if (this.realValidationEnabled) {
          logOutboundReal(phone, options.tenant_id, options.lead_id, message, options.messageType || 'outbound', {
            wrapper: true,
            environment: this.getEnvironment()
          });
        }
        
        // Ajouter l'étape à la trace
        if (options.traceId) {
          addRealStep(options.traceId, 'whatsapp_send_start', {
            phone: this.maskPhone(phone),
            messageType: options.messageType,
            messageLength: message?.length || 0
          });
        }
        
        // Appeler la fonction originale
        const result = await originalSendFunction(phone, message, options);
        
        const duration = Date.now() - startTime;
        
        if (result && result.success) {
          this.stats.successfulSends++;
          
          // Logger le succès
          if (this.realValidationEnabled) {
            logOutboundReal(phone, options.tenant_id, options.lead_id, message, 'whatsapp_success', {
              wrapper: true,
              duration,
              messageId: result.messageId,
              environment: this.getEnvironment()
            });
          }
          
          // Ajouter l'étape de succès
          if (options.traceId) {
            addRealStep(options.traceId, 'whatsapp_send_success', {
              phone: this.maskPhone(phone),
              messageId: result.messageId,
              duration
            });
          }
          
          // Enregistrer l'action
          recordAction('message', {
            tenant_id: options.tenant_id,
            phone
          });
          
          console.log('[WHATSAPP_WRAPPER_SEND_SUCCESS]', {
            phone: this.maskPhone(phone),
            duration,
            messageId: result.messageId
          });
          
        } else {
          this.stats.failedSends++;
          
          // Logger l'échec
          if (this.realValidationEnabled) {
            logRealError('whatsapp_send_failed', phone, options.tenant_id, options.lead_id, new Error(result?.error || 'Unknown error'), {
              wrapper: true,
              duration,
              environment: this.getEnvironment()
            });
          }
          
          // Ajouter l'étape d'échec
          if (options.traceId) {
            addRealStep(options.traceId, 'whatsapp_send_failed', {
              phone: this.maskPhone(phone),
              error: result?.error || 'Unknown error',
              duration
            });
          }
          
          console.log('[WHATSAPP_WRAPPER_SEND_FAILED]', {
            phone: this.maskPhone(phone),
            error: result?.error || 'Unknown error',
            duration
          });
        }
        
        // Stats par type
        const messageType = options.messageType || 'outbound';
        this.stats.byType.set(messageType, (this.stats.byType.get(messageType) || 0) + 1);
        
        return result;
        
      } catch (error) {
        const duration = Date.now() - startTime;
        this.stats.failedSends++;
        
        console.log('[WHATSAPP_WRAPPER_SEND_ERROR]', {
          phone: this.maskPhone(phone),
          error: error.message,
          duration
        });
        
        // Logger l'erreur
        if (this.realValidationEnabled) {
          logRealError('whatsapp_send_exception', phone, options.tenant_id, options.lead_id, error, {
            wrapper: true,
            duration,
            environment: this.getEnvironment()
          });
        }
        
        // Ajouter l'étape d'erreur
        if (options.traceId) {
          addRealStep(options.traceId, 'whatsapp_send_exception', {
            phone: this.maskPhone(phone),
            error: error.message,
            stack: error.stack?.substring(0, 500)
          });
        }
        
        // Retourner un résultat d'erreur
        return {
          success: false,
          error: error.message,
          wrapperError: true,
          environment: this.getEnvironment()
        };
      }
    };
  }
  
  // Wrapper avec retry (1 seule tentative)
  wrapSendWhatsAppWithRetry(originalSendFunction, maxRetries = 1) {
    const wrappedFunction = this.wrapSendWhatsApp(originalSendFunction);
    
    return async (phone, message, options = {}) => {
      let lastError = null;
      
      for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        try {
          console.log(`[WHATSAPP_WRAPPER_ATTEMPT_${attempt}]`, {
            phone: this.maskPhone(phone),
            maxRetries: maxRetries + 1
          });
          
          const result = await wrappedFunction(phone, message, {
            ...options,
            attempt,
            maxAttempts: maxRetries + 1
          });
          
          if (result.success) {
            if (attempt > 1) {
              this.stats.retries++;
              
              console.log('[WHATSAPP_WRAPPER_RETRY_SUCCESS]', {
                phone: this.maskPhone(phone),
                attempt,
                totalAttempts: maxRetries + 1
              });
            }
            
            return result;
          }
          
          lastError = result.error;
          
          // Si ce n'est pas le dernier essai, attendre avant de réessayer
          if (attempt <= maxRetries) {
            const retryDelay = Math.min(1000 * attempt, 5000); // Max 5 secondes
            console.log('[WHATSAPP_WRAPPER_RETRY_DELAY]', {
              phone: this.maskPhone(phone),
              attempt,
              retryDelay
            });
            
            await this.sleep(retryDelay);
          }
          
        } catch (error) {
          lastError = error.message;
          
          if (attempt <= maxRetries) {
            const retryDelay = Math.min(1000 * attempt, 5000);
            await this.sleep(retryDelay);
          }
        }
      }
      
      // Tous les essais ont échoué
      console.log('[WHATSAPP_WRAPPER_ALL_ATTEMPTS_FAILED]', {
        phone: this.maskPhone(phone),
        totalAttempts: maxRetries + 1,
        lastError
      });
      
      return {
        success: false,
        error: lastError || 'All attempts failed',
        attempts: maxRetries + 1,
        wrapperError: true,
        environment: this.getEnvironment()
      };
    };
  }
  
  // Logger la réception d'un message WhatsApp
  logWhatsAppReceived(phone, message, metadata = {}) {
    if (!this.testModeEnabled && !this.realValidationEnabled) {
      return;
    }
    
    console.log('[WHATSAPP_WRAPPER_RECEIVED]', {
      phone: this.maskPhone(phone),
      messageLength: message?.length || 0,
      environment: this.getEnvironment()
    });
    
    // Logger la réception réelle
    if (this.realValidationEnabled) {
      const { logInboundReal } = require('./realValidationLogger');
      logInboundReal(phone, metadata.tenant_id, {
        message,
        source: 'whatsapp_real',
        ...metadata
      }, {
        wrapper: true,
        environment: this.getEnvironment()
      });
    }
    
    // Ajouter l'étape à la trace
    if (metadata.traceId) {
      addRealStep(metadata.traceId, 'whatsapp_received', {
        phone: this.maskPhone(phone),
        messageLength: message?.length || 0,
        messagePreview: message?.substring(0, 100)
      });
    }
  }
  
  // Logger la réponse utilisateur
  logUserReply(phone, userMessage, metadata = {}) {
    if (!this.testModeEnabled && !this.realValidationEnabled) {
      return;
    }
    
    console.log('[WHATSAPP_WRAPPER_USER_REPLY]', {
      phone: this.maskPhone(phone),
      messageLength: userMessage?.length || 0,
      environment: this.getEnvironment()
    });
    
    // Logger la réponse utilisateur réelle
    if (this.realValidationEnabled) {
      const { logUserReplyReal } = require('./realValidationLogger');
      logUserReplyReal(phone, metadata.tenant_id, metadata.lead_id, userMessage, {
        wrapper: true,
        environment: this.getEnvironment()
      });
    }
    
    // Ajouter l'étape à la trace
    if (metadata.traceId) {
      addRealStep(metadata.traceId, 'whatsapp_user_reply', {
        phone: this.maskPhone(phone),
        messageLength: userMessage?.length || 0,
        messagePreview: userMessage?.substring(0, 100)
      });
    }
    
    // Enregistrer la latence de réponse si disponible
    if (metadata.lastOutboundTime && metadata.traceId) {
      const latency = Date.now() - metadata.lastOutboundTime;
      recordResponseLatency(metadata.traceId, latency);
    }
  }
  
  // Obtenir les stats du wrapper
  getWrapperStats() {
    if (!this.testModeEnabled && !this.realValidationEnabled) {
      return { enabled: false };
    }
    
    const totalAttempts = this.stats.successfulSends + this.stats.failedSends;
    const successRate = totalAttempts > 0 ? 
      (this.stats.successfulSends / totalAttempts) * 100 : 0;
    
    const byTypeStats = {};
    for (const [messageType, count] of this.stats.byType.entries()) {
      byTypeStats[messageType] = count;
    }
    
    return {
      enabled: true,
      environment: this.getEnvironment(),
      stats: {
        totalWrapped: this.stats.totalWrapped,
        successfulSends: this.stats.successfulSends,
        failedSends: this.stats.failedSends,
        retries: this.stats.retries,
        successRate: Math.round(successRate * 100) / 100
      },
      byType: byTypeStats,
      uptime: process.uptime()
    };
  }
  
  // Obtenir l'environnement actuel
  getEnvironment() {
    if (this.realValidationEnabled) {
      return 'real';
    } else if (this.testModeEnabled) {
      return 'test';
    } else {
      return 'production';
    }
  }
  
  // Helper pour pause
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // Masquer téléphone pour logs
  maskPhone(phone) {
    if (!phone || typeof phone !== 'string') return 'unknown';
    return phone.slice(0, -4) + '****';
  }
  
  // Réinitialiser les stats
  resetStats() {
    this.stats = {
      totalWrapped: 0,
      successfulSends: 0,
      failedSends: 0,
      retries: 0,
      byType: new Map()
    };
    
    console.log('[WHATSAPP_WRAPPER_STATS_RESET]');
  }
}

// Instance globale du wrapper
if (!global.whatsappWrapper) {
  global.whatsappWrapper = new WhatsAppWrapper();
}

// Fonctions principales
function wrapSendWhatsApp(originalSendFunction) {
  return global.whatsappWrapper.wrapSendWhatsApp(originalSendFunction);
}

function wrapSendWhatsAppWithRetry(originalSendFunction, maxRetries) {
  return global.whatsappWrapper.wrapSendWhatsAppWithRetry(originalSendFunction, maxRetries);
}

function logWhatsAppReceived(phone, message, metadata) {
  return global.whatsappWrapper.logWhatsAppReceived(phone, message, metadata);
}

function logUserReply(phone, userMessage, metadata) {
  return global.whatsappWrapper.logUserReply(phone, userMessage, metadata);
}

// Stats et monitoring
function getWhatsAppWrapperStats() {
  return global.whatsappWrapper.getWrapperStats();
}

// Administration
function resetWhatsAppWrapperStats() {
  return global.whatsappWrapper.resetStats();
}

module.exports = {
  wrapSendWhatsApp,
  wrapSendWhatsAppWithRetry,
  logWhatsAppReceived,
  logUserReply,
  getWhatsAppWrapperStats,
  resetWhatsAppWrapperStats,
  WhatsAppWrapper
};
