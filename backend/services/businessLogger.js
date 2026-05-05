// ACTION 8 - Logs business (obligatoires)

// Logger business sécurisé (pas de données sensibles)
class BusinessLogger {
  
  // Log création lead
  static logLeadCreated(phone, tenant_id, source = 'webhook') {
    console.log('[LEAD_CREATED]', {
      phone: this.maskPhone(phone),
      tenant_id,
      source,
      timestamp: new Date().toISOString()
    });
  }
  
  // Log doublon téléphone
  static logDuplicatePhone(phone, tenant_id) {
    console.log('[DUPLICATE_PHONE]', {
      phone: this.maskPhone(phone),
      tenant_id,
      timestamp: new Date().toISOString()
    });
  }
  
  // Log envoi outbound
  static logOutboundSent(phone, status, messageType = 'text') {
    console.log('[OUTBOUND_SENT]', {
      phone: this.maskPhone(phone),
      status,
      messageType,
      timestamp: new Date().toISOString()
    });
  }
  
  // Log outbound skip
  static logOutboundSkipped(phone, reason, details = {}) {
    console.log('[OUTBOUND_SKIPPED]', {
      phone: this.maskPhone(phone),
      reason,
      details: this.sanitizeDetails(details),
      timestamp: new Date().toISOString()
    });
  }
  
  // Log détection intention
  static logIntentDetected(phone, intent, confidence = 1.0, message = '') {
    console.log('[INTENT_DETECTED]', {
      phone: this.maskPhone(phone),
      intent,
      confidence,
      message: this.sanitizeMessage(message),
      timestamp: new Date().toISOString()
    });
  }
  
  // Log changement statut
  static logStatusChanged(phone, oldStatus, newStatus, reason = 'user_intent') {
    console.log('[STATUS_CHANGED]', {
      phone: this.maskPhone(phone),
      oldStatus,
      newStatus,
      reason,
      timestamp: new Date().toISOString()
    });
  }
  
  // Log envoi lien paiement
  static logPaymentLinkSent(phone, tenant_id, paymentLink) {
    console.log('[PAYMENT_LINK_SENT]', {
      phone: this.maskPhone(phone),
      tenant_id,
      paymentLink: this.maskUrl(paymentLink),
      timestamp: new Date().toISOString()
    });
  }
  
  // Log paiement skip
  static logPaymentSkipped(phone, reason, details = {}) {
    console.log('[PAYMENT_SKIPPED]', {
      phone: this.maskPhone(phone),
      reason,
      details: this.sanitizeDetails(details),
      timestamp: new Date().toISOString()
    });
  }
  
  // Log webhook erreur
  static logWebhookError(error, context = {}) {
    console.log('[WEBHOOK_ERROR]', {
      error: error.message,
      context: this.sanitizeContext(context),
      timestamp: new Date().toISOString()
    });
  }
  
  // Log webhook reçu
  static logWebhookReceived(phone, messageType) {
    console.log('[WEBHOOK_RECEIVED]', {
      phone: this.maskPhone(phone),
      messageType,
      timestamp: new Date().toISOString()
    });
  }
  
  // Log webhook skip
  static logWebhookSkipped(reason, details = {}) {
    console.log('[WEBHOOK_SKIPPED]', {
      reason,
      details: this.sanitizeDetails(details),
      timestamp: new Date().toISOString()
    });
  }
  
  // Log transition appliquée
  static logTransitionApplied(phone, oldStatus, newStatus, intent) {
    console.log('[TRANSITION_APPLIED]', {
      phone: this.maskPhone(phone),
      oldStatus,
      newStatus,
      intent,
      timestamp: new Date().toISOString()
    });
  }
  
  // Log transition bloquée
  static logTransitionBlocked(phone, reason, details = {}) {
    console.log('[TRANSITION_BLOCKED]', {
      phone: this.maskPhone(phone),
      reason,
      details: this.sanitizeDetails(details),
      timestamp: new Date().toISOString()
    });
  }
  
  // Log follow-up envoyé
  static logFollowUpSent(phone, status) {
    console.log('[FOLLOW_UP_SENT]', {
      phone: this.maskPhone(phone),
      status,
      timestamp: new Date().toISOString()
    });
  }
  
  // Log follow-up skip
  static logFollowUpSkipped(phone, reason) {
    console.log('[FOLLOW_UP_SKIPPED]', {
      phone: this.maskPhone(phone),
      reason,
      timestamp: new Date().toISOString()
    });
  }
  
  // ACTION 10 - Log final status block
  static logFinalStatusBlock(phone, status, operation) {
    console.log('[FINAL_STATUS_BLOCK]', {
      phone: this.maskPhone(phone),
      status,
      operation,
      timestamp: new Date().toISOString()
    });
  }
  
  // ACTION 10 - Log AI fallback utilisé
  static logAIFallbackUsed(phone, reason, originalError = null) {
    console.log('[AI_FALLBACK_USED]', {
      phone: this.maskPhone(phone),
      reason,
      originalError: originalError ? this.sanitizeMessage(originalError) : null,
      timestamp: new Date().toISOString()
    });
  }
  
  // Log scheduler run summary
  static logSchedulerRunSummary(type, processed, sent, errors = 0, duration = 0) {
    console.log('[SCHEDULER_RUN_SUMMARY]', {
      type,
      processed,
      sent,
      errors,
      duration,
      successRate: processed > 0 ? ((sent / processed) * 100).toFixed(1) + '%' : '0%',
      timestamp: new Date().toISOString()
    });
  }
  
  // Log payment confirmed (détaillé)
  static logPaymentConfirmed(phone, amount, currency, paymentMethod = 'stripe') {
    console.log('[PAYMENT_CONFIRMED]', {
      phone: this.maskPhone(phone),
      amount,
      currency,
      paymentMethod,
      timestamp: new Date().toISOString()
    });
  }
  
  // Log queue operation
  static logQueueOperation(operation, queueSize, priority = 'normal') {
    console.log('[QUEUE_OPERATION]', {
      operation,
      queueSize,
      priority,
      timestamp: new Date().toISOString()
    });
  }
  
  // Log tenant resolution
  static logTenantResolution(phone_number_id, tenant_id, method = 'db') {
    console.log('[TENANT_RESOLUTION]', {
      phone_number_id,
      tenant_id,
      method,
      timestamp: new Date().toISOString()
    });
  }
  
  // Log score update (détaillé)
  static logScoreUpdate(phone, oldScore, newScore, action, reason = '') {
    console.log('[SCORE_UPDATE]', {
      phone: this.maskPhone(phone),
      oldScore,
      newScore,
      change: newScore - oldScore,
      action,
      reason,
      timestamp: new Date().toISOString()
    });
  }
  
  // Log limit reached (détaillé)
  static logLimitReached(limitType, current, limit, resetAt = null) {
    console.log('[LIMIT_REACHED_DETAILED]', {
      limitType,
      current,
      limit,
      percentage: ((current / limit) * 100).toFixed(1) + '%',
      resetAt: resetAt ? new Date(resetAt).toISOString() : null,
      timestamp: new Date().toISOString()
    });
  }
  
  // Log scheduler run
  static logSchedulerRun(type, processed, sent, errors = 0) {
    console.log('[SCHEDULER_RUN]', {
      type,
      processed,
      sent,
      errors,
      timestamp: new Date().toISOString()
    });
  }
  
  // Log limite atteinte
  static logLimitReached(type, limit, current) {
    console.log('[LIMIT_REACHED]', {
      type,
      limit,
      current,
      timestamp: new Date().toISOString()
    });
  }
  
  // --- Fonctions de sécurité ---
  
  // Masquer téléphone (garder 4 derniers chiffres)
  static maskPhone(phone) {
    if (!phone || typeof phone !== 'string') return 'unknown';
    return phone.slice(0, -4) + '****';
  }
  
  // Masquer URL
  static maskUrl(url) {
    if (!url || typeof url !== 'string') return 'unknown';
    try {
      const urlObj = new URL(url);
      return urlObj.hostname + '/****';
    } catch {
      return '****';
    }
  }
  
  // Nettoyer message (supprimer données sensibles)
  static sanitizeMessage(message) {
    if (!message || typeof message !== 'string') return '';
    return message.substring(0, 50).replace(/\d/g, '*');
  }
  
  // Nettoyer détails
  static sanitizeDetails(details) {
    if (!details || typeof details !== 'object') return {};
    
    const sanitized = {};
    for (const [key, value] of Object.entries(details)) {
      if (typeof value === 'string' && value.length > 100) {
        sanitized[key] = value.substring(0, 100) + '...';
      } else if (typeof value === 'string') {
        sanitized[key] = value.replace(/\d/g, '*');
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }
  
  // Nettoyer contexte
  static sanitizeContext(context) {
    return this.sanitizeDetails(context);
  }
  
  // --- ACTION 12 - Logs multi-tenant ---
  
  // Log événement tenant
  static logTenantEvent(event, tenant_id, metadata = {}) {
    console.log('[TENANT_EVENT]', {
      event,
      tenant_id,
      metadata: this.sanitizeDetails(metadata),
      timestamp: new Date().toISOString()
    });
  }
  
  // Log événement quota
  static logQuotaEvent(event, tenant_id, current, max, lead_id = null, metadata = {}) {
    console.log('[QUOTA_EVENT]', {
      event,
      tenant_id,
      lead_id,
      quota: {
        current,
        max,
        remaining: Math.max(0, max - current),
        usage_rate: max > 0 ? ((current / max) * 100).toFixed(2) + '%' : '0%'
      },
      metadata: this.sanitizeDetails(metadata),
      timestamp: new Date().toISOString()
    });
  }
  
  // Log événement billing
  static logBillingEvent(event, tenant_id, amount, usage_count = null, lead_id = null, metadata = {}) {
    console.log('[BILLING_EVENT]', {
      event,
      tenant_id,
      lead_id,
      billing: {
        amount,
        usage_count,
        currency: 'EUR'
      },
      metadata: this.sanitizeDetails(metadata),
      timestamp: new Date().toISOString()
    });
  }
  
  // Log événement instance
  static logInstanceEvent(event, instance_id, tenant_id = null, lead_id = null, metadata = {}) {
    console.log('[INSTANCE_EVENT]', {
      event,
      instance_id,
      tenant_id,
      lead_id,
      metadata: this.sanitizeDetails(metadata),
      timestamp: new Date().toISOString()
    });
  }
  
  // Log événement lock
  static logLockEvent(event, phone, tenant_id, instance_id = null, lead_id = null, metadata = {}) {
    console.log('[LOCK_EVENT]', {
      event,
      phone: this.maskPhone(phone),
      tenant_id,
      lead_id,
      instance_id,
      metadata: this.sanitizeDetails(metadata),
      timestamp: new Date().toISOString()
    });
  }
  
  // Log événement pause
  static logPauseEvent(event, tenant_id, reason = null, duration = null, lead_id = null, metadata = {}) {
    console.log('[PAUSE_EVENT]', {
      event,
      tenant_id,
      lead_id,
      pause: {
        reason,
        duration,
        duration_human: duration ? `${Math.round(duration / 60000)} minutes` : null
      },
      metadata: this.sanitizeDetails(metadata),
      timestamp: new Date().toISOString()
    });
  }
  
  // Log événement auth
  static logAuthEvent(event, tenant_id = null, api_key = null, ip = null, metadata = {}) {
    console.log('[AUTH_EVENT]', {
      event,
      tenant_id,
      api_key: api_key ? api_key.substring(0, 8) + '****' : null,
      ip: ip ? ip.split('.').map((part, i) => i === 0 || i === 1 ? part : 'xxx').join('.') : null,
      metadata: this.sanitizeDetails(metadata),
      timestamp: new Date().toISOString()
    });
  }
  
  // Log contexte avec metadata automatique
  static logWithContext(level, event, tenant_id = null, lead_id = null, metadata = {}) {
    console.log('[CONTEXT_LOG]', {
      level, // info, warn, error, debug
      event,
      tenant_id,
      lead_id,
      instance_id: process.env.INSTANCE_ID || 'unknown',
      metadata: {
        ...this.sanitizeDetails(metadata),
        uptime: process.uptime(),
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
        }
      },
      timestamp: new Date().toISOString()
    });
  }
  
  // Log performance
  static logPerformance(operation, duration, tenant_id = null, lead_id = null, metadata = {}) {
    console.log('[PERFORMANCE_LOG]', {
      operation,
      duration_ms: duration,
      tenant_id,
      lead_id,
      performance: {
        duration,
        operation,
        slow_threshold: duration > 1000 ? 'slow' : 'normal'
      },
      metadata: this.sanitizeDetails(metadata),
      timestamp: new Date().toISOString()
    });
  }
  
  // Log erreur avec contexte
  static logErrorWithContext(error, context, tenant_id = null, lead_id = null, metadata = {}) {
    console.log('[ERROR_LOG]', {
      context,
      tenant_id,
      lead_id,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      },
      metadata: this.sanitizeDetails(metadata),
      timestamp: new Date().toISOString()
    });
  }
  
  // Log conversion
  static logConversion(phone, tenant_id, status, amount = null, lead_id = null, metadata = {}) {
    console.log('[CONVERSION_LOG]', {
      phone: this.maskPhone(phone),
      tenant_id,
      lead_id,
      conversion: {
        status,
        amount,
        currency: amount ? 'EUR' : null
      },
      metadata: this.sanitizeDetails(metadata),
      timestamp: new Date().toISOString()
    });
  }
  
  // Créer entrée de log structurée
  static createLogEntry(type, event, tenant_id = null, lead_id = null, metadata = {}) {
    return {
      timestamp: new Date().toISOString(),
      type,
      event,
      tenant_id,
      lead_id,
      instance_id: process.env.INSTANCE_ID || 'unknown',
      metadata: this.sanitizeDetails(metadata)
    };
  }
  
  // Stats de logs
  static getLogStats() {
    // Cette fonction pourrait compter les logs par type si nécessaire
    return {
      logTypes: [
        'LEAD_CREATED',
        'DUPLICATE_PHONE', 
        'OUTBOUND_SENT',
        'OUTBOUND_SKIPPED',
        'INTENT_DETECTED',
        'STATUS_CHANGED',
        'PAYMENT_LINK_SENT',
        'PAYMENT_SKIPPED',
        'WEBHOOK_ERROR',
        'WEBHOOK_RECEIVED',
        'WEBHOOK_SKIPPED',
        'TRANSITION_APPLIED',
        'TRANSITION_BLOCKED',
        'FOLLOW_UP_SENT',
        'FOLLOW_UP_SKIPPED',
        'SCHEDULER_RUN',
        'LIMIT_REACHED',
        // ACTION 12 - Nouveaux types
        'TENANT_EVENT',
        'QUOTA_EVENT',
        'BILLING_EVENT',
        'INSTANCE_EVENT',
        'LOCK_EVENT',
        'PAUSE_EVENT',
        'AUTH_EVENT',
        'CONTEXT_LOG',
        'PERFORMANCE_LOG',
        'ERROR_LOG',
        'CONVERSION_LOG'
      ]
    };
  }
}

module.exports = BusinessLogger;
