// ACTION 6 - Lock léger anti double instance

const BusinessLogger = require('./businessLogger');

// Lock léger pour éviter double traitement entre instances
class LeadLock {
  constructor() {
    this.enabled = process.env.MULTI_INSTANCE_ENABLED === 'true';
    this.locks = new Map(); // leadKey -> lock info
    this.defaultTimeout = 30000; // 30 secondes
    this.stats = {
      totalLocks: 0,
      successfulLocks: 0,
      lockConflicts: 0,
      expiredLocks: 0,
      releasedLocks: 0
    };
    
    // Cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredLocks();
    }, 10000); // Toutes les 10 secondes
    
    console.log('[LEAD_LOCK_INITIALIZED]', {
      enabled: this.enabled,
      defaultTimeout: this.defaultTimeout
    });
  }
  
  // Obtenir clé pour lead
  getLeadKey(phone, tenant_id) {
    return `${phone}:${tenant_id}`;
  }
  
  // Tenter d'acquérir lock
  acquireLock(phone, tenant_id, timeout = null) {
    if (!this.enabled) {
      // Single instance: pas de lock nécessaire
      return { locked: true, reason: 'single_instance_mode' };
    }
    
    const leadKey = this.getLeadKey(phone, tenant_id);
    const now = Date.now();
    const lockTimeout = timeout || this.defaultTimeout;
    
    this.stats.totalLocks++;
    
    // Vérifier si lock existe et n'est pas expiré
    const existingLock = this.locks.get(leadKey);
    
    if (existingLock) {
      if (existingLock.expiresAt > now) {
        // Lock encore valide
        this.stats.lockConflicts++;
        
        console.log('[LEAD_LOCK_CONFLICT]', {
          leadKey: leadKey.substring(0, -4) + '****',
          existingLock: {
            instanceId: existingLock.instanceId,
            lockedAt: new Date(existingLock.lockedAt),
            expiresAt: new Date(existingLock.expiresAt)
          },
          reason: 'lock_still_active'
        });
        
        return { 
          locked: false, 
          reason: 'already_locked',
          existingLock: {
            instanceId: existingLock.instanceId,
            expiresAt: existingLock.expiresAt
          }
        };
      } else {
        // Lock expiré
        this.stats.expiredLocks++;
        
        console.log('[LEAD_LOCK_EXPIRED]', {
          leadKey: leadKey.substring(0, -4) + '****',
          expiredAt: new Date(existingLock.expiresAt)
        });
        
        // Supprimer lock expiré
        this.locks.delete(leadKey);
      }
    }
    
    // Créer nouveau lock
    const lockInfo = {
      instanceId: process.env.INSTANCE_ID || 'unknown',
      lockedAt: now,
      expiresAt: now + lockTimeout,
      timeout: lockTimeout
    };
    
    this.locks.set(leadKey, lockInfo);
    this.stats.successfulLocks++;
    
    console.log('[LEAD_LOCK_ACQUIRED]', {
      leadKey: leadKey.substring(0, -4) + '****',
      instanceId: lockInfo.instanceId,
      timeout: lockTimeout,
      expiresAt: new Date(lockInfo.expiresAt)
    });
    
    return { 
      locked: true, 
      lockId: `${leadKey}:${now}`,
      expiresAt: lockInfo.expiresAt
    };
  }
  
  // Libérer lock
  releaseLock(phone, tenant_id, lockId = null) {
    if (!this.enabled) {
      return { released: true, reason: 'single_instance_mode' };
    }
    
    const leadKey = this.getLeadKey(phone, tenant_id);
    const lock = this.locks.get(leadKey);
    
    if (!lock) {
      console.log('[LEAD_LOCK_NOT_FOUND]', {
        leadKey: leadKey.substring(0, -4) + '****',
        reason: 'no_lock_exists'
      });
      
      return { released: false, reason: 'no_lock_exists' };
    }
    
    // Vérifier lockId si fourni
    if (lockId && !lockId.includes(leadKey)) {
      console.log('[LEAD_LOCK_ID_MISMATCH]', {
        leadKey: leadKey.substring(0, -4) + '****',
        providedLockId: lockId.substring(0, -4) + '****',
        reason: 'lock_id_mismatch'
      });
      
      return { released: false, reason: 'lock_id_mismatch' };
    }
    
    this.locks.delete(leadKey);
    this.stats.releasedLocks++;
    
    console.log('[LEAD_LOCK_RELEASED]', {
      leadKey: leadKey.substring(0, -4) + '****',
      instanceId: lock.instanceId,
      lockDuration: Date.now() - lock.lockedAt
    });
    
    return { released: true, instanceId: lock.instanceId };
  }
  
  // Vérifier si lead est locké
  isLocked(phone, tenant_id) {
    if (!this.enabled) {
      return { locked: false, reason: 'single_instance_mode' };
    }
    
    const leadKey = this.getLeadKey(phone, tenant_id);
    const lock = this.locks.get(leadKey);
    const now = Date.now();
    
    if (!lock) {
      return { locked: false, reason: 'no_lock' };
    }
    
    if (lock.expiresAt <= now) {
      // Lock expiré
      this.locks.delete(leadKey);
      this.stats.expiredLocks++;
      
      return { locked: false, reason: 'lock_expired' };
    }
    
    return { 
      locked: true, 
      lock: {
        instanceId: lock.instanceId,
        lockedAt: lock.lockedAt,
        expiresAt: lock.expiresAt,
        remainingTime: lock.expiresAt - now
      }
    };
  }
  
  // Wrapper pour exécuter action avec lock
  async executeWithLock(phone, tenant_id, actionFunction, timeout = null, actionType = 'general') {
    const leadKey = this.getLeadKey(phone, tenant_id);
    
    // Tenter d'acquérir lock
    const lockResult = this.acquireLock(phone, tenant_id, timeout);
    
    if (!lockResult.locked) {
      console.log('[LEAD_LOCK_ACTION_SKIPPED]', {
        leadKey: leadKey.substring(0, -4) + '****',
        actionType,
        reason: lockResult.reason
      });
      
      return { 
        success: false, 
        reason: lockResult.reason,
        skipped: true 
      };
    }
    
    const startTime = Date.now();
    
    try {
      console.log('[LEAD_LOCK_ACTION_START]', {
        leadKey: leadKey.substring(0, -4) + '****',
        actionType,
        lockId: lockResult.lockId
      });
      
      // Exécuter action
      const result = await actionFunction();
      
      const duration = Date.now() - startTime;
      
      // Libérer lock
      this.releaseLock(phone, tenant_id, lockResult.lockId);
      
      console.log('[LEAD_LOCK_ACTION_SUCCESS]', {
        leadKey: leadKey.substring(0, -4) + '****',
        actionType,
        duration,
        lockReleased: true
      });
      
      return { 
        success: true, 
        result, 
        duration,
        lockId: lockResult.lockId
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Libérer lock même en cas d'erreur
      this.releaseLock(phone, tenant_id, lockResult.lockId);
      
      console.log('[LEAD_LOCK_ACTION_ERROR]', {
        leadKey: leadKey.substring(0, -4) + '****',
        actionType,
        error: error.message,
        duration,
        lockReleased: true
      });
      
      BusinessLogger.logWebhookError(error.message, {
        context: 'lead_lock_execution',
        tenant_id,
        actionType,
        leadKey: leadKey.substring(0, -4) + '****'
      });
      
      return { 
        success: false, 
        error: error.message, 
        duration,
        lockId: lockResult.lockId
      };
    }
  }
  
  // Nettoyer locks expirés
  cleanupExpiredLocks() {
    if (!this.enabled) {
      return;
    }
    
    const now = Date.now();
    const expiredKeys = [];
    
    for (const [leadKey, lock] of this.locks.entries()) {
      if (lock.expiresAt <= now) {
        expiredKeys.push(leadKey);
      }
    }
    
    for (const key of expiredKeys) {
      const lock = this.locks.get(key);
      this.locks.delete(key);
      this.stats.expiredLocks++;
      
      console.log('[LEAD_LOCK_CLEANUP_EXPIRED]', {
        leadKey: key.substring(0, -4) + '****',
        instanceId: lock.instanceId,
        expiredAt: new Date(lock.expiresAt)
      });
    }
    
    if (expiredKeys.length > 0) {
      console.log('[LEAD_LOCK_CLEANUP_COMPLETED]', {
        cleaned: expiredKeys.length,
        remaining: this.locks.size
      });
    }
  }
  
  // Forcer libération de tous les locks (urgence)
  forceReleaseAll() {
    const released = this.locks.size;
    
    this.locks.clear();
    
    console.log('[LEAD_LOCK_FORCE_RELEASE_ALL]', {
      released,
      reason: 'manual_cleanup'
    });
    
    return released;
  }
  
  // Obtenir stats des locks
  getLockStats() {
    const now = Date.now();
    const activeLocks = [];
    const locksByInstance = new Map();
    
    for (const [leadKey, lock] of this.locks.entries()) {
      const remainingTime = lock.expiresAt - now;
      
      activeLocks.push({
        leadKey: leadKey.substring(0, -4) + '****',
        instanceId: lock.instanceId,
        lockedAt: new Date(lock.lockedAt),
        expiresAt: new Date(lock.expiresAt),
        remainingTime
      });
      
      // Compter par instance
      const instanceCount = locksByInstance.get(lock.instanceId) || 0;
      locksByInstance.set(lock.instanceId, instanceCount + 1);
    }
    
    return {
      enabled: this.enabled,
      stats: this.stats,
      activeLocks: this.locks.size,
      locksByInstance: Object.fromEntries(locksByInstance),
      conflictRate: this.stats.totalLocks > 0 ? (this.stats.lockConflicts / this.stats.totalLocks) * 100 : 0,
      successRate: this.stats.totalLocks > 0 ? (this.stats.successfulLocks / this.stats.totalLocks) * 100 : 0,
      expirationRate: this.stats.totalLocks > 0 ? (this.stats.expiredLocks / this.stats.totalLocks) * 100 : 0,
      sampleLocks: activeLocks.slice(0, 5) // Top 5 pour debug
    };
  }
  
  // Health check des locks
  healthCheck() {
    const stats = this.getLockStats();
    
    const health = {
      status: 'healthy',
      enabled: stats.enabled,
      activeLocks: stats.activeLocks,
      issues: [],
      recommendations: []
    };
    
    // Trop de locks actifs
    if (stats.activeLocks > 100) {
      health.issues.push('Too many active locks');
      health.recommendations.push('Check for stuck locks or reduce timeout');
    }
    
    // Taux de conflit élevé
    if (stats.conflictRate > 20) {
      health.issues.push('High lock conflict rate');
      health.recommendations.push('Check instance synchronization');
    }
    
    // Taux d'expiration élevé
    if (stats.expirationRate > 30) {
      health.issues.push('High lock expiration rate');
      health.recommendations.push('Increase timeout or check action performance');
    }
    
    // Locks par instance déséquilibrés
    const instanceCounts = Object.values(stats.locksByInstance);
    if (instanceCounts.length > 1) {
      const max = Math.max(...instanceCounts);
      const min = Math.min(...instanceCounts);
      
      if (max > min * 2) {
        health.issues.push('Unbalanced lock distribution');
        health.recommendations.push('Check instance load distribution');
      }
    }
    
    if (health.issues.length > 0) {
      health.status = 'warning';
    }
    
    return {
      ...health,
      stats: {
        activeLocks: stats.activeLocks,
        conflictRate: Math.round(stats.conflictRate * 100) / 100,
        successRate: Math.round(stats.successRate * 100) / 100,
        expirationRate: Math.round(stats.expirationRate * 100) / 100
      }
    };
  }
  
  // Réinitialiser stats
  resetStats() {
    this.stats = {
      totalLocks: 0,
      successfulLocks: 0,
      lockConflicts: 0,
      expiredLocks: 0,
      releasedLocks: 0
    };
    
    console.log('[LEAD_LOCK_STATS_RESET]');
  }
  
  // Arrêter cleanup interval
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.forceReleaseAll();
    
    console.log('[LEAD_LOCK_DESTROYED]');
  }
}

// Instance globale des locks
if (!global.leadLock) {
  global.leadLock = new LeadLock();
}

// Fonctions principales
function acquireLeadLock(phone, tenant_id, timeout) {
  return global.leadLock.acquireLock(phone, tenant_id, timeout);
}

function releaseLeadLock(phone, tenant_id, lockId) {
  return global.leadLock.releaseLock(phone, tenant_id, lockId);
}

function isLeadLocked(phone, tenant_id) {
  return global.leadLock.isLocked(phone, tenant_id);
}

async function executeWithLeadLock(phone, tenant_id, actionFunction, timeout, actionType) {
  return await global.leadLock.executeWithLock(phone, tenant_id, actionFunction, timeout, actionType);
}

// Stats et monitoring
function getLockStats() {
  return global.leadLock.getLockStats();
}

function lockHealthCheck() {
  return global.leadLock.healthCheck();
}

// Administration
function forceReleaseAllLocks() {
  return global.leadLock.forceReleaseAll();
}

function resetLockStats() {
  return global.leadLock.resetStats();
}

module.exports = {
  acquireLeadLock,
  releaseLeadLock,
  isLeadLocked,
  executeWithLeadLock,
  getLockStats,
  lockHealthCheck,
  forceReleaseAllLocks,
  resetLockStats,
  LeadLock
};
