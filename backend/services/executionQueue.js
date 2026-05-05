// ACTION 2 - File d'exécution (queue légère)

const { isEnabled } = require('./envFlags');
const BusinessLogger = require('./businessLogger');

// Queue FIFO simple pour lisser charge
class ExecutionQueue {
  constructor() {
    this.enabled = isEnabled('QUEUE_ENABLED');
    this.queue = [];
    this.processing = false;
    this.maxConcurrency = parseInt(process.env.QUEUE_MAX_CONCURRENCY) || 2; // ACTION 2: max concurrency = 1-3
    this.maxRetries = parseInt(process.env.QUEUE_MAX_RETRIES) || 2; // ACTION 2: retry max = 2
    this.currentConcurrency = 0;
    this.stats = {
      total: 0,
      processed: 0,
      errors: 0,
      retries: 0,
      avgWaitTime: 0
    };
  }
  
  // Ajouter tâche à la queue
  async add(task, priority = 'normal') {
    if (!this.enabled) {
      // Fallback: exécution directe
      console.log('[QUEUE_DISABLED] Direct execution');
      return await this.executeDirect(task);
    }
    
    const queueItem = {
      id: this.generateTaskId(),
      task,
      priority,
      addedAt: Date.now(),
      retries: 0,
      maxRetries: this.maxRetries
    };
    
    // Trier par priorité
    if (priority === 'high') {
      this.queue.unshift(queueItem);
    } else if (priority === 'low') {
      this.queue.push(queueItem);
    } else {
      // Normal: insérer au milieu
      const insertIndex = Math.floor(this.queue.length / 2);
      this.queue.splice(insertIndex, 0, queueItem);
    }
    
    this.stats.total++;
    
    console.log('[QUEUE_ADDED]', {
      taskId: queueItem.id,
      priority,
      queueSize: this.queue.length,
      totalTasks: this.stats.total
    });
    
    BusinessLogger.logQueueOperation('added', this.queue.length, priority);
    
    // Démarrer processing si pas déjà en cours
    if (!this.processing && this.currentConcurrency < this.maxConcurrency) {
      this.startProcessing();
    }
    
    return queueItem.id;
  }
  
  // Démarrer le processing
  async startProcessing() {
    if (this.processing || this.currentConcurrency >= this.maxConcurrency) {
      return;
    }
    
    this.processing = true;
    console.log('[QUEUE_STARTED]', {
      concurrency: this.currentConcurrency,
      maxConcurrency: this.maxConcurrency,
      queueSize: this.queue.length
    });
    
    while (this.queue.length > 0 && this.currentConcurrency < this.maxConcurrency) {
      const item = this.queue.shift();
      this.currentConcurrency++;
      
      // Exécuter en parallèle (jusqu'à maxConcurrency)
      this.processItem(item).finally(() => {
        this.currentConcurrency--;
        
        // Continuer si des tâches restent
        if (this.queue.length > 0 && !this.processing) {
          this.startProcessing();
        }
      });
    }
    
    this.processing = false;
  }
  
  // Traiter un item
  async processItem(item) {
    const startTime = Date.now();
    const waitTime = startTime - item.addedAt;
    
    try {
      console.log('[QUEUE_PROCESSING]', {
        taskId: item.id,
        priority: item.priority,
        waitTime,
        retries: item.retries
      });
      
      const result = await item.task();
      
      const duration = Date.now() - startTime;
      this.stats.processed++;
      
      // Mettre à jour temps d'attente moyen
      this.stats.avgWaitTime = ((this.stats.avgWaitTime * (this.stats.processed - 1)) + waitTime) / this.stats.processed;
      
      console.log('[QUEUE_SUCCESS]', {
        taskId: item.id,
        duration,
        waitTime,
        queueSize: this.queue.length
      });
      
      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      item.retries++;
      
      console.log('[QUEUE_ERROR]', {
        taskId: item.id,
        error: error.message,
        retries: item.retries,
        maxRetries: item.maxRetries,
        duration
      });
      
      BusinessLogger.logWebhookError(error.message, {
        context: 'queue_processing',
        taskId: item.id,
        retries: item.retries
      });
      
      // ACTION 2: Retry max = 2
      if (item.retries < item.maxRetries) {
        console.log('[QUEUE_RETRY]', {
          taskId: item.id,
          retries: item.retries,
          maxRetries: item.maxRetries
        });
        
        this.stats.retries++;
        
        // Remettre en fin de queue pour retry
        setTimeout(() => {
          this.queue.push(item);
          if (!this.processing) {
            this.startProcessing();
          }
        }, Math.min(1000 * Math.pow(2, item.retries), 10000)); // Exponential backoff
        
        return { error: error.message, retried: true };
        
      } else {
        // Max retries atteint
        this.stats.errors++;
        
        console.log('[QUEUE_MAX_RETRIES]', {
          taskId: item.id,
          retries: item.retries,
          finalError: error.message
        });
        
        BusinessLogger.logWebhookError('Max retries reached', {
          context: 'queue_max_retries',
          taskId: item.id,
          retries: item.retries
        });
        
        return { error: error.message, maxRetries: true };
      }
    }
  }
  
  // Exécution directe (fallback)
  async executeDirect(task) {
    const startTime = Date.now();
    
    try {
      console.log('[QUEUE_DIRECT_EXECUTION]');
      
      const result = await task();
      
      const duration = Date.now() - startTime;
      console.log('[QUEUE_DIRECT_SUCCESS]', { duration });
      
      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      console.log('[QUEUE_DIRECT_ERROR]', {
        error: error.message,
        duration
      });
      
      BusinessLogger.logWebhookError(error.message, {
        context: 'queue_direct_execution',
        duration
      });
      
      throw error;
    }
  }
  
  // Générer ID de tâche
  generateTaskId() {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // Obtenir stats de la queue
  getStats() {
    return {
      enabled: this.enabled,
      queueSize: this.queue.length,
      processing: this.processing,
      currentConcurrency: this.currentConcurrency,
      maxConcurrency: this.maxConcurrency,
      maxRetries: this.maxRetries,
      stats: this.stats,
      successRate: this.stats.total > 0 ? (this.stats.processed / this.stats.total) * 100 : 0,
      errorRate: this.stats.total > 0 ? (this.stats.errors / this.stats.total) * 100 : 0,
      retryRate: this.stats.total > 0 ? (this.stats.retries / this.stats.total) * 100 : 0
    };
  }
  
  // Vider la queue (urgence)
  clear() {
    const cleared = this.queue.length;
    this.queue = [];
    
    console.log('[QUEUE_CLEARED]', { cleared });
    BusinessLogger.logQueueOperation('cleared', 0, 'emergency');
    
    return cleared;
  }
  
  // Mettre en pause
  pause() {
    this.processing = false;
    console.log('[QUEUE_PAUSED]', {
      queueSize: this.queue.length,
      currentConcurrency: this.currentConcurrency
    });
  }
  
  // Reprendre
  resume() {
    if (!this.processing && this.queue.length > 0) {
      this.startProcessing();
    }
    
    console.log('[QUEUE_RESUMED]');
  }
  
  // Health check
  healthCheck() {
    const stats = this.getStats();
    
    return {
      healthy: stats.queueSize < 100 && stats.errorRate < 20, // Moins de 100 items, moins de 20% d'erreurs
      stats,
      recommendations: this.getRecommendations(stats)
    };
  }
  
  // Recommandations
  getRecommendations(stats) {
    const recommendations = [];
    
    if (stats.queueSize > 50) {
      recommendations.push('Consider increasing maxConcurrency or reducing task frequency');
    }
    
    if (stats.errorRate > 10) {
      recommendations.push('High error rate detected - check task implementations');
    }
    
    if (stats.retryRate > 5) {
      recommendations.push('High retry rate - check external dependencies');
    }
    
    if (stats.avgWaitTime > 5000) {
      recommendations.push('High wait time - consider increasing processing capacity');
    }
    
    return recommendations;
  }
}

// Instance globale de la queue
if (!global.executionQueue) {
  global.executionQueue = new ExecutionQueue();
}

// Wrapper pour ajouter une tâche
async function queueTask(task, priority = 'normal') {
  return await global.executionQueue.add(task, priority);
}

// Stats de la queue
function getQueueStats() {
  return global.executionQueue.getStats();
}

// Contrôle de la queue
function pauseQueue() {
  global.executionQueue.pause();
}

function resumeQueue() {
  global.executionQueue.resume();
}

function clearQueue() {
  return global.executionQueue.clear();
}

// Health check
function queueHealthCheck() {
  return global.executionQueue.healthCheck();
}

module.exports = {
  queueTask,
  getQueueStats,
  pauseQueue,
  resumeQueue,
  clearQueue,
  queueHealthCheck,
  ExecutionQueue
};
