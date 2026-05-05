// ACTION 9 - File de sécurité (anti burst)

// File d'attente simple en mémoire pour éviter les bursts
class SafetyQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.maxConcurrent = 1; // ACTION 9 - Limiter envois simultanés
    this.processDelay = 1000; // 1 seconde entre chaque envoi
    this.maxQueueSize = 100;
  }
  
  // Ajouter une tâche à la file
  async add(task, priority = 'normal') {
    if (this.queue.length >= this.maxQueueSize) {
      console.log('[SAFETY_QUEUE_FULL] Task rejected', {
        queueSize: this.queue.length,
        maxSize: this.maxQueueSize
      });
      return false;
    }
    
    const queueItem = {
      task,
      priority,
      addedAt: new Date(),
      id: Date.now() + Math.random()
    };
    
    // Trier par priorité
    if (priority === 'high') {
      this.queue.unshift(queueItem);
    } else {
      this.queue.push(queueItem);
    }
    
    console.log('[SAFETY_QUEUE_ADDED]', {
      priority,
      queueSize: this.queue.length,
      taskId: queueItem.id
    });
    
    // Démarrer le processing si pas déjà en cours
    if (!this.processing) {
      this.startProcessing();
    }
    
    return true;
  }
  
  // Démarrer le processing
  async startProcessing() {
    if (this.processing) {
      return;
    }
    
    this.processing = true;
    console.log('[SAFETY_QUEUE_STARTED]', {
      queueSize: this.queue.length,
      maxConcurrent: this.maxConcurrent
    });
    
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      
      try {
        await this.processItem(item);
      } catch (error) {
        console.log('[SAFETY_QUEUE_ITEM_ERROR]', {
          taskId: item.id,
          error: error.message
        });
      }
      
      // ACTION 9 - Délai entre chaque envoi pour éviter rate limit
      if (this.queue.length > 0) {
        await this.delay(this.processDelay);
      }
    }
    
    this.processing = false;
    console.log('[SAFETY_QUEUE_FINISHED]');
  }
  
  // Traiter un item
  async processItem(item) {
    const startTime = Date.now();
    
    try {
      console.log('[SAFETY_QUEUE_PROCESSING]', {
        taskId: item.id,
        priority: item.priority,
        waitTime: startTime - item.addedAt.getTime()
      });
      
      await item.task();
      
      const duration = Date.now() - startTime;
      console.log('[SAFETY_QUEUE_COMPLETED]', {
        taskId: item.id,
        duration,
        queueSize: this.queue.length
      });
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.log('[SAFETY_QUEUE_FAILED]', {
        taskId: item.id,
        error: error.message,
        duration
      });
      throw error;
    }
  }
  
  // Delay simple
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // Stats de la file
  getStats() {
    return {
      queueSize: this.queue.length,
      processing: this.processing,
      maxConcurrent: this.maxConcurrent,
      processDelay: this.processDelay,
      maxQueueSize: this.maxQueueSize
    };
  }
  
  // Vider la file (urgence)
  clear() {
    const cleared = this.queue.length;
    this.queue = [];
    console.log('[SAFETY_QUEUE_CLEARED]', { cleared });
    return cleared;
  }
  
  // Mettre en pause
  pause() {
    this.processing = false;
    console.log('[SAFETY_QUEUE_PAUSED]', {
      queueSize: this.queue.length
    });
  }
  
  // Reprendre
  resume() {
    if (!this.processing && this.queue.length > 0) {
      this.startProcessing();
    }
  }
}

// File globale pour les messages WhatsApp
if (!global.whatsappQueue) {
  global.whatsappQueue = new SafetyQueue();
}

// Wrapper pour envoi WhatsApp sécurisé
async function safeWhatsAppSend(phone, message, priority = 'normal') {
  const { sendWhatsAppMessage } = require('./messageSender');
  
  const task = async () => {
    try {
      await sendWhatsAppMessage(phone, message);
      
      console.log('[SAFE_WHATSAPP_SENT]', {
        phone: phone.substring(0, -4) + '****',
        messageLength: message.length,
        priority
      });
      
      return true;
      
    } catch (error) {
      console.log('[SAFE_WHATSAPP_ERROR]', {
        phone: phone.substring(0, -4) + '****',
        error: error.message,
        priority
      });
      
      throw error;
    }
  };
  
  return await global.whatsappQueue.add(task, priority);
}

// Wrapper pour envoi paiement sécurisé
async function safePaymentSend(phone, paymentLink, priority = 'high') {
  const { sendWhatsAppMessage } = require('./messageSender');
  
  const task = async () => {
    try {
      const message = `Voici le lien pour activer le service : ${paymentLink}`;
      await sendWhatsAppMessage(phone, message);
      
      console.log('[SAFE_PAYMENT_SENT]', {
        phone: phone.substring(0, -4) + '****',
        priority
      });
      
      return true;
      
    } catch (error) {
      console.log('[SAFE_PAYMENT_ERROR]', {
        phone: phone.substring(0, -4) + '****',
        error: error.message,
        priority
      });
      
      throw error;
    }
  };
  
  return await global.whatsappQueue.add(task, priority);
}

// Stats globales
function getQueueStats() {
  const stats = global.whatsappQueue.getStats();
  
  return {
    ...stats,
    globalQueue: true,
    uptime: process.uptime()
  };
}

// Configuration dynamique
function configureQueue(options = {}) {
  if (options.maxConcurrent) {
    global.whatsappQueue.maxConcurrent = options.maxConcurrent;
  }
  
  if (options.processDelay) {
    global.whatsappQueue.processDelay = options.processDelay;
  }
  
  if (options.maxQueueSize) {
    global.whatsappQueue.maxQueueSize = options.maxQueueSize;
  }
  
  console.log('[SAFETY_QUEUE_CONFIGURED]', {
    maxConcurrent: global.whatsappQueue.maxConcurrent,
    processDelay: global.whatsappQueue.processDelay,
    maxQueueSize: global.whatsappQueue.maxQueueSize
  });
}

// Health check
function healthCheck() {
  const stats = getQueueStats();
  
  return {
    healthy: stats.queueSize < stats.maxQueueSize * 0.8, // 80% de capacité
    stats,
    recommendations: []
  };
}

module.exports = {
  SafetyQueue,
  safeWhatsAppSend,
  safePaymentSend,
  getQueueStats,
  configureQueue,
  healthCheck
};
