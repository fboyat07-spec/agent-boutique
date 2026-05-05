// ACTION 4 - Tracking événements (safe)

const BusinessLogger = require('./businessLogger');

// Tracking léger sans dépendance externe
class EventTracker {
  constructor() {
    this.enabled = process.env.EVENT_TRACKING_ENABLED === 'true';
    this.buffer = [];
    this.maxBufferSize = 1000; // Max 1000 événements en mémoire
    this.stats = {
      totalEvents: 0,
      eventsByType: new Map(),
      droppedEvents: 0,
      errors: 0
    };
    
    // Cleanup périodique
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldEvents();
    }, 60000); // Toutes les minutes
    
    console.log('[EVENT_TRACKER_INITIALIZED]', {
      enabled: this.enabled,
      maxBufferSize: this.maxBufferSize
    });
  }
  
  // Tracker événement principal
  trackEvent(eventName, payload = {}, tenant_id = null, lead_id = null) {
    if (!this.enabled) {
      return { tracked: false, reason: 'tracking_disabled' };
    }
    
    try {
      const event = {
        id: this.generateEventId(),
        eventName,
        tenant_id: tenant_id || 'DEFAULT',
        lead_id: lead_id,
        payload: this.sanitizePayload(payload),
        timestamp: new Date().toISOString(),
        instance_id: process.env.INSTANCE_ID || 'unknown'
      };
      
      // Ajouter au buffer
      this.addToBuffer(event);
      
      // Stats
      this.stats.totalEvents++;
      const typeCount = this.stats.eventsByType.get(eventName) || 0;
      this.stats.eventsByType.set(eventName, typeCount + 1);
      
      // Log business
      BusinessLogger.logWithContext('info', `event_tracked_${eventName}`, tenant_id, lead_id, {
        event_id: event.id,
        payload_size: JSON.stringify(payload).length
      });
      
      console.log('[EVENT_TRACKED]', {
        event_id: event.id,
        eventName,
        tenant_id: event.tenant_id,
        lead_id: event.lead_id
      });
      
      return { 
        tracked: true, 
        event_id: event.id,
        timestamp: event.timestamp
      };
      
    } catch (error) {
      this.stats.errors++;
      
      console.log('[EVENT_TRACK_ERROR]', {
        eventName,
        tenant_id,
        error: error.message
      });
      
      return { 
        tracked: false, 
        error: error.message 
      };
    }
  }
  
  // Événements prédéfinis
  trackLeadCreated(phone, tenant_id, lead_id, source = 'webhook') {
    return this.trackEvent('lead_created', {
      phone: this.maskPhone(phone),
      source,
      status: 'NEW'
    }, tenant_id, lead_id);
  }
  
  trackMessageSent(phone, tenant_id, lead_id, messageType = 'text', direction = 'outbound') {
    return this.trackEvent('message_sent', {
      phone: this.maskPhone(phone),
      messageType,
      direction,
      timestamp: new Date().toISOString()
    }, tenant_id, lead_id);
  }
  
  trackReplyReceived(phone, tenant_id, lead_id, messageContent = '') {
    return this.trackEvent('reply_received', {
      phone: this.maskPhone(phone),
      messageLength: messageContent.length,
      timestamp: new Date().toISOString()
    }, tenant_id, lead_id);
  }
  
  trackPaymentConfirmed(phone, tenant_id, lead_id, amount, currency = 'EUR') {
    return this.trackEvent('payment_confirmed', {
      phone: this.maskPhone(phone),
      amount,
      currency,
      timestamp: new Date().toISOString()
    }, tenant_id, lead_id);
  }
  
  trackStatusChanged(phone, tenant_id, lead_id, oldStatus, newStatus) {
    return this.trackEvent('status_changed', {
      phone: this.maskPhone(phone),
      oldStatus,
      newStatus,
      timestamp: new Date().toISOString()
    }, tenant_id, lead_id);
  }
  
  trackQuotaExceeded(tenant_id, current, max, actionType = 'general') {
    return this.trackEvent('quota_exceeded', {
      current,
      max,
      actionType,
      percentage: max > 0 ? ((current / max) * 100).toFixed(2) + '%' : '0%'
    }, tenant_id);
  }
  
  trackTenantPaused(tenant_id, reason, duration = null) {
    return this.trackEvent('tenant_paused', {
      reason,
      duration,
      duration_human: duration ? `${Math.round(duration / 60000)} minutes` : null
    }, tenant_id);
  }
  
  trackTenantResumed(tenant_id, reason) {
    return this.trackEvent('tenant_resumed', {
      reason
    }, tenant_id);
  }
  
  trackBillingUsage(tenant_id, actionType, cost, usageCount) {
    return this.trackEvent('billing_usage', {
      actionType,
      cost,
      usageCount,
      currency: 'EUR'
    }, tenant_id);
  }
  
  trackError(error, context, tenant_id = null, lead_id = null) {
    return this.trackEvent('error_occurred', {
      error: {
        message: error.message,
        name: error.name
      },
      context,
      severity: this.classifyErrorSeverity(error)
    }, tenant_id, lead_id);
  }
  
  // Obtenir événements par tenant
  getEventsByTenant(tenant_id, limit = 100, eventName = null) {
    let events = this.buffer.filter(event => event.tenant_id === tenant_id);
    
    if (eventName) {
      events = events.filter(event => event.eventName === eventName);
    }
    
    // Trier par timestamp (plus récent d'abord)
    events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    return events.slice(0, limit);
  }
  
  // Obtenir événements par type
  getEventsByType(eventName, limit = 100) {
    const events = this.buffer.filter(event => event.eventName === eventName);
    
    // Trier par timestamp (plus récent d'abord)
    events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    return events.slice(0, limit);
  }
  
  // Obtenir événements récents
  getRecentEvents(limit = 50, tenant_id = null) {
    let events = this.buffer;
    
    if (tenant_id) {
      events = events.filter(event => event.tenant_id === tenant_id);
    }
    
    // Trier par timestamp (plus récent d'abord)
    events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    return events.slice(0, limit);
  }
  
  // Obtenir stats de tracking
  getTrackingStats() {
    const typeStats = {};
    
    for (const [eventName, count] of this.stats.eventsByType.entries()) {
      typeStats[eventName] = count;
    }
    
    return {
      enabled: this.enabled,
      buffer: {
        size: this.buffer.length,
        maxSize: this.maxBufferSize,
        utilization: Math.round((this.buffer.length / this.maxBufferSize) * 10000) / 100
      },
      stats: {
        totalEvents: this.stats.totalEvents,
        droppedEvents: this.stats.droppedEvents,
        errors: this.stats.errors,
        errorRate: this.stats.totalEvents > 0 ? 
          Math.round((this.stats.errors / this.stats.totalEvents) * 10000) / 100 : 0
      },
      eventsByType: typeStats,
      uptime: process.uptime()
    };
  }
  
  // Fonctions utilitaires
  generateEventId() {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  maskPhone(phone) {
    if (!phone || typeof phone !== 'string') return 'unknown';
    return phone.slice(0, -4) + '****';
  }
  
  sanitizePayload(payload) {
    if (!payload || typeof payload !== 'object') return {};
    
    const sanitized = {};
    
    for (const [key, value] of Object.entries(payload)) {
      if (typeof value === 'string' && value.length > 500) {
        // Tronquer les longues chaînes
        sanitized[key] = value.substring(0, 500) + '...';
      } else if (typeof value === 'object' && value !== null) {
        // Limiter la profondeur des objets
        sanitized[key] = JSON.stringify(value).substring(0, 200) + '...';
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }
  
  classifyErrorSeverity(error) {
    if (error.name === 'ValidationError') return 'low';
    if (error.name === 'TimeoutError') return 'medium';
    if (error.name === 'DatabaseError') return 'high';
    return 'medium';
  }
  
  addToBuffer(event) {
    // Si buffer plein, supprimer le plus ancien
    if (this.buffer.length >= this.maxBufferSize) {
      this.buffer.shift();
      this.stats.droppedEvents++;
    }
    
    this.buffer.push(event);
  }
  
  cleanupOldEvents() {
    if (!this.enabled) return;
    
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 heures
    const before = this.buffer.length;
    
    this.buffer = this.buffer.filter(event => {
      const eventTime = new Date(event.timestamp).getTime();
      return eventTime > cutoff;
    });
    
    const cleaned = before - this.buffer.length;
    
    if (cleaned > 0) {
      console.log('[EVENT_TRACKER_CLEANUP]', {
        cleaned,
        remaining: this.buffer.length,
        cutoff: new Date(cutoff)
      });
    }
  }
  
  // Vider le buffer
  clearBuffer(tenant_id = null) {
    if (tenant_id) {
      const before = this.buffer.length;
      this.buffer = this.buffer.filter(event => event.tenant_id !== tenant_id);
      const cleared = before - this.buffer.length;
      
      console.log('[EVENT_TRACKER_BUFFER_CLEARED_TENANT]', {
        tenant_id,
        cleared
      });
      
      return cleared;
    } else {
      const cleared = this.buffer.length;
      this.buffer = [];
      
      console.log('[EVENT_TRACKER_BUFFER_CLEARED_ALL]', {
        cleared
      });
      
      return cleared;
    }
  }
  
  // Health check
  healthCheck() {
    const stats = this.getTrackingStats();
    
    const health = {
      status: 'healthy',
      enabled: stats.enabled,
      issues: [],
      recommendations: []
    };
    
    // Vérifier utilisation buffer
    if (stats.buffer.utilization > 80) {
      health.issues.push('High buffer utilization');
      health.recommendations.push('Consider increasing buffer size or reducing event volume');
    }
    
    // Vérifier taux d'erreur
    if (stats.stats.errorRate > 10) {
      health.issues.push('High error rate');
      health.recommendations.push('Check event tracking implementation');
    }
    
    // Vériser événements dropped
    if (stats.stats.droppedEvents > stats.stats.totalEvents * 0.1) {
      health.issues.push('High dropped events rate');
      health.recommendations.push('Increase buffer size or reduce event frequency');
    }
    
    if (health.issues.length > 0) {
      health.status = 'warning';
    }
    
    return {
      ...health,
      stats: {
        bufferSize: stats.buffer.size,
        utilization: stats.buffer.utilization,
        totalEvents: stats.stats.totalEvents,
        errorRate: stats.stats.errorRate,
        droppedEvents: stats.stats.droppedEvents
      }
    };
  }
  
  // Réinitialiser stats
  resetStats() {
    this.stats = {
      totalEvents: 0,
      eventsByType: new Map(),
      droppedEvents: 0,
      errors: 0
    };
    
    console.log('[EVENT_TRACKER_STATS_RESET]');
  }
  
  // Détruire
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.buffer = [];
    
    console.log('[EVENT_TRACKER_DESTROYED]');
  }
}

// Instance globale du tracker
if (!global.eventTracker) {
  global.eventTracker = new EventTracker();
}

// Fonctions principales
function trackEvent(eventName, payload, tenant_id, lead_id) {
  return global.eventTracker.trackEvent(eventName, payload, tenant_id, lead_id);
}

function trackLeadCreated(phone, tenant_id, lead_id, source) {
  return global.eventTracker.trackLeadCreated(phone, tenant_id, lead_id, source);
}

function trackMessageSent(phone, tenant_id, lead_id, messageType, direction) {
  return global.eventTracker.trackMessageSent(phone, tenant_id, lead_id, messageType, direction);
}

function trackReplyReceived(phone, tenant_id, lead_id, messageContent) {
  return global.eventTracker.trackReplyReceived(phone, tenant_id, lead_id, messageContent);
}

function trackPaymentConfirmed(phone, tenant_id, lead_id, amount, currency) {
  return global.eventTracker.trackPaymentConfirmed(phone, tenant_id, lead_id, amount, currency);
}

function trackStatusChanged(phone, tenant_id, lead_id, oldStatus, newStatus) {
  return global.eventTracker.trackStatusChanged(phone, tenant_id, lead_id, oldStatus, newStatus);
}

// Stats et monitoring
function getEventsByTenant(tenant_id, limit, eventName) {
  return global.eventTracker.getEventsByTenant(tenant_id, limit, eventName);
}

function getTrackingStats() {
  return global.eventTracker.getTrackingStats();
}

function trackingHealthCheck() {
  return global.eventTracker.healthCheck();
}

// Administration
function clearEventBuffer(tenant_id) {
  return global.eventTracker.clearBuffer(tenant_id);
}

function resetTrackingStats() {
  return global.eventTracker.resetStats();
}

module.exports = {
  trackEvent,
  trackLeadCreated,
  trackMessageSent,
  trackReplyReceived,
  trackPaymentConfirmed,
  trackStatusChanged,
  getEventsByTenant,
  getTrackingStats,
  trackingHealthCheck,
  clearEventBuffer,
  resetTrackingStats,
  EventTracker
};
