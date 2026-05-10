/**
 * LEAD CAPTURE TRACKING
 * Tracking simple pour suivre les conversions et interactions
 */

// Configuration
const TRACKING_CONFIG = {
  endpoint: '/api/analytics/track',
  debounceMs: 300,
  sessionTimeout: 30 * 60 * 1000, // 30 minutes
  cookieName: 'ab_session'
};

// Session management
class SessionTracker {
  constructor() {
    this.sessionId = this.getOrCreateSession();
    this.events = [];
    this.startTime = Date.now();
  }
  
  getOrCreateSession() {
    let sessionId = this.getCookie(TRACKING_CONFIG.cookieName);
    if (!sessionId) {
      sessionId = this.generateSessionId();
      this.setCookie(TRACKING_CONFIG.cookieName, sessionId, TRACKING_CONFIG.sessionTimeout);
    }
    return sessionId;
  }
  
  generateSessionId() {
    return 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
  
  getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
  }
  
  setCookie(name, value, maxAge) {
    const expires = new Date();
    expires.setTime(expires.getTime() + maxAge);
    document.cookie = `${name}=${value}; expires=${expires.toUTCString()}; path=/`;
  }
}

// Event tracking
class EventTracker {
  constructor() {
    this.session = new SessionTracker();
    this.debounceTimer = null;
  }
  
  track(eventName, data = {}) {
    const event = {
      event: eventName,
      timestamp: new Date().toISOString(),
      sessionId: this.session.sessionId,
      url: window.location.href,
      userAgent: navigator.userAgent,
      ...data
    };
    
    this.session.events.push(event);
    this.sendEvent(event);
  }
  
  sendEvent(event) {
    // Debounce pour éviter trop d'appels
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
    this.debounceTimer = setTimeout(() => {
      this.sendToServer(event);
    }, TRACKING_CONFIG.debounceMs);
  }
  
  async sendToServer(event) {
    try {
      await fetch(TRACKING_CONFIG.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(event)
      });
    } catch (error) {
      console.warn('[TRACKING] Failed to send event:', error);
      // Stocker localement en cas d'erreur
      this.storeLocally(event);
    }
  }
  
  storeLocally(event) {
    const stored = localStorage.getItem('ab_tracking_events') || '[]';
    const events = JSON.parse(stored);
    events.push(event);
    
    // Garder seulement les 100 derniers événements
    if (events.length > 100) {
      events.splice(0, events.length - 100);
    }
    
    localStorage.setItem('ab_tracking_events', JSON.stringify(events));
  }
  
  // Envoyer les événements stockés localement
  flushStoredEvents() {
    const stored = localStorage.getItem('ab_tracking_events');
    if (!stored) return;
    
    const events = JSON.parse(stored);
    events.forEach(event => this.sendToServer(event));
    localStorage.removeItem('ab_tracking_events');
  }
}

// Tracking automatique
class AutoTracker {
  constructor(eventTracker) {
    this.tracker = eventTracker;
    this.setupAutoTracking();
  }
  
  setupAutoTracking() {
    // Page view
    this.tracker.track('page_view', {
      title: document.title,
      referrer: document.referrer
    });
    
    // Time on page
    this.startTimeTracking();
    
    // Scroll depth
    this.setupScrollTracking();
    
    // Form interactions
    this.setupFormTracking();
    
    // Click tracking
    this.setupClickTracking();
  }
  
  startTimeTracking() {
    this.pageStartTime = Date.now();
    
    window.addEventListener('beforeunload', () => {
      const timeOnPage = Date.now() - this.pageStartTime;
      this.tracker.track('time_on_page', {
        duration: Math.round(timeOnPage / 1000), // en secondes
        page: document.title
      });
    });
  }
  
  setupScrollTracking() {
    let maxScroll = 0;
    const trackScroll = () => {
      const scrollPercent = Math.round(
        (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100
      );
      maxScroll = Math.max(maxScroll, scrollPercent);
    };
    
    window.addEventListener('scroll', this.debounce(trackScroll, 100));
    
    window.addEventListener('beforeunload', () => {
      if (maxScroll > 0) {
        this.tracker.track('scroll_depth', {
          maxDepth: maxScroll
        });
      }
    });
  }
  
  setupFormTracking() {
    document.addEventListener('submit', (e) => {
      const form = e.target;
      if (form.tagName === 'FORM') {
        this.tracker.track('form_submit', {
          formId: form.id || 'unknown',
          formAction: form.action || 'unknown',
          formName: form.name || 'unknown'
        });
      }
    });
  }
  
  setupClickTracking() {
    document.addEventListener('click', (e) => {
      const element = e.target;
      const trackingData = this.getElementTrackingData(element);
      
      if (trackingData) {
        this.tracker.track('click', trackingData);
      }
    });
  }
  
  getElementTrackingData(element) {
    const data = {};
    
    // Boutons avec tracking
    if (element.hasAttribute('data-track')) {
      data.trackName = element.getAttribute('data-track');
    }
    
    // Liens
    if (element.tagName === 'A') {
      data.linkText = element.textContent;
      data.linkHref = element.href;
    }
    
    // Boutons
    if (element.tagName === 'BUTTON') {
      data.buttonText = element.textContent;
      data.buttonType = element.type || 'button';
    }
    
    // Retourner les données seulement si pertinent
    return Object.keys(data).length > 0 ? data : null;
  }
  
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
}

// Initialisation global
let tracker;

window.AgentBoutiqueTracking = {
  init: function() {
    if (tracker) return; // Déjà initialisé
    
    tracker = new EventTracker();
    const autoTracker = new AutoTracker(tracker);
    
    // Envoyer les événements stockés
    tracker.flushStoredEvents();
    
    console.log('[TRACKING] Lead capture tracking initialized');
  },
  
  track: function(eventName, data) {
    if (!tracker) this.init();
    tracker.track(eventName, data);
  },
  
  // Fonctions utilitaires pour le tracking manuel
  trackLeadCapture: function(source, data = {}) {
    this.track('lead_capture', {
      source: source,
      ...data
    });
  },
  
  trackPricingView: function(plan) {
    this.track('pricing_view', {
      plan: plan
    });
  },
  
  trackDemoRequest: function(data = {}) {
    this.track('demo_request', data);
  },
  
  trackContactForm: function(data = {}) {
    this.track('contact_form', data);
  }
};

// Auto-initialisation
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.AgentBoutiqueTracking.init();
  });
} else {
  window.AgentBoutiqueTracking.init();
}
