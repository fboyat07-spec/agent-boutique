// Service Stripe pour les paiements (Mock pour l'instant)
class StripeService {
  constructor() {
    this.isInitialized = false;
    this.publishableKey = process.env.EXPO_PUBLIC_STRIPE_KEY || 'pk_test_mock_key';
    this.apiBaseUrl = 'https://api.stripe.com/v1';
  }

  // Initialiser Stripe
  async initialize() {
    try {
      // En production, initialiser Stripe avec la clé réelle
      // const stripe = await loadStripe(this.publishableKey);
      
      this.isInitialized = true;
      console.log('✅ Stripe initialisé (mode mock)');
      return { success: true };
    } catch (error) {
      console.error('❌ Erreur initialisation Stripe:', error);
      return { success: false, error: error.message };
    }
  }

  // Créer un PaymentIntent
  async createPaymentIntent(amount, currency = 'eur', metadata = {}) {
    try {
      // En production, appeler l'API Stripe
      // const response = await fetch(`${this.apiBaseUrl}/payment_intents`, {
      //   method: 'POST',
      //   headers: {
      //     'Authorization': `Bearer ${this.secretKey}`,
      //     'Content-Type': 'application/json',
      //   },
      //   body: JSON.stringify({
      //     amount: amount * 100, // Convertir en cents
      //     currency,
      //     metadata,
      //     automatic_payment_methods: {
      //       enabled: ['card', 'apple_pay', 'google_pay']
      //     }
      //   })
      // });
      
      // Mock pour le développement
      const mockPaymentIntent = {
        id: `pi_mock_${Date.now()}`,
        client_secret: `pi_mock_secret_${Date.now()}`,
        amount: amount * 100,
        currency,
        status: 'requires_payment_method',
        created: Math.floor(Date.now() / 1000),
        metadata
      };

      console.log('🔄 PaymentIntent créé (mock):', mockPaymentIntent);
      
      return { 
        success: true, 
        paymentIntent: mockPaymentIntent 
      };
    } catch (error) {
      console.error('❌ Erreur création PaymentIntent:', error);
      return { success: false, error: error.message };
    }
  }

  // Confirmer un PaymentIntent
  async confirmPaymentIntent(paymentIntentId, paymentMethodId) {
    try {
      // En production, appeler l'API Stripe
      // const response = await fetch(`${this.apiBaseUrl}/payment_intents/${paymentIntentId}/confirm`, {
      //   method: 'POST',
      //   headers: {
      //     'Authorization': `Bearer ${this.secretKey}`,
      //     'Content-Type': 'application/json',
      //   },
      //   body: JSON.stringify({
      //     payment_method: paymentMethodId
      //   })
      // });
      
      // Mock pour le développement
      const mockConfirmedIntent = {
        id: paymentIntentId,
        status: 'succeeded',
        amount_paid: true,
        payment_method: paymentMethodId,
        receipt_email: null
      };

      console.log('✅ PaymentIntent confirmé (mock):', mockConfirmedIntent);
      
      return { 
        success: true, 
        paymentIntent: mockConfirmedIntent 
      };
    } catch (error) {
      console.error('❌ Erreur confirmation PaymentIntent:', error);
      return { success: false, error: error.message };
    }
  }

  // Créer une session de checkout
  async createCheckoutSession(items, successUrl, cancelUrl) {
    try {
      // En production, appeler l'API Stripe
      // const response = await fetch(`${this.apiBaseUrl}/checkout/sessions`, {
      //   method: 'POST',
      //   headers: {
      //     'Authorization': `Bearer ${this.secretKey}`,
      //     'Content-Type': 'application/json',
      //   },
      //   body: JSON.stringify({
      //     payment_method_types: ['card'],
      //     line_items: items,
      //     mode: 'payment',
      //     success_url: successUrl,
      //     cancel_url: cancelUrl
      //   })
      // });
      
      // Mock pour le développement
      const mockSession = {
        id: `cs_mock_${Date.now()}`,
        url: `https://checkout.stripe.com/pay/cs_mock_${Date.now()}`,
        payment_status: 'unpaid',
        success_url: successUrl,
        cancel_url: cancelUrl
      };

      console.log('🔄 Session checkout créée (mock):', mockSession);
      
      return { 
        success: true, 
        session: mockSession 
      };
    } catch (error) {
      console.error('❌ Erreur création session checkout:', error);
      return { success: false, error: error.message };
    }
  }

  // Créer un client
  async createCustomer(email, name, metadata = {}) {
    try {
      // En production, appeler l'API Stripe
      // const response = await fetch(`${this.apiBaseUrl}/customers`, {
      //   method: 'POST',
      //   headers: {
      //     'Authorization': `Bearer ${this.secretKey}`,
      //     'Content-Type': 'application/json',
      //   },
      //   body: JSON.stringify({
      //     email,
      //     name,
      //     metadata
      //   })
      // });
      
      // Mock pour le développement
      const mockCustomer = {
        id: `cus_mock_${Date.now()}`,
        email,
        name,
        metadata,
        created: Math.floor(Date.now() / 1000)
      };

      console.log('🔄 Client créé (mock):', mockCustomer);
      
      return { 
        success: true, 
        customer: mockCustomer 
      };
    } catch (error) {
      console.error('❌ Erreur création client:', error);
      return { success: false, error: error.message };
    }
  }

  // Créer un abonnement
  async createSubscription(customerId, priceId, metadata = {}) {
    try {
      // En production, appeler l'API Stripe
      // const response = await fetch(`${this.apiBaseUrl}/subscriptions`, {
      //   method: 'POST',
      //   headers: {
      //     'Authorization': `Bearer ${this.secretKey}`,
      //     'Content-Type': 'application/json',
      //   },
      //   body: JSON.stringify({
      //     customer: customerId,
      //     items: [{ price: priceId }],
      //     metadata,
      //     payment_behavior: 'default_incomplete',
      //     payment_settings: {
      //       save_default_payment_method: 'on_subscription'
      //     }
      //   })
      // });
      
      // Mock pour le développement
      const mockSubscription = {
        id: `sub_mock_${Date.now()}`,
        customer: customerId,
        status: 'active',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000),
        items: [{
          price: priceId,
          quantity: 1
        }],
        metadata
      };

      console.log('🔄 Abonnement créé (mock):', mockSubscription);
      
      return { 
        success: true, 
        subscription: mockSubscription 
      };
    } catch (error) {
      console.error('❌ Erreur création abonnement:', error);
      return { success: false, error: error.message };
    }
  }

  // Annuler un abonnement
  async cancelSubscription(subscriptionId) {
    try {
      // En production, appeler l'API Stripe
      // const response = await fetch(`${this.apiBaseUrl}/subscriptions/${subscriptionId}`, {
      //   method: 'DELETE',
      //   headers: {
      //     'Authorization': `Bearer ${this.secretKey}`,
      //     'Content-Type': 'application/json',
      //   }
      // });
      
      // Mock pour le développement
      const mockCancelledSubscription = {
        id: subscriptionId,
        status: 'canceled',
        canceled_at: Math.floor(Date.now() / 1000),
        ended_at: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000)
      };

      console.log('❌ Abonnement annulé (mock):', mockCancelledSubscription);
      
      return { 
        success: true, 
        subscription: mockCancelledSubscription 
      };
    } catch (error) {
      console.error('❌ Erreur annulation abonnement:', error);
      return { success: false, error: error.message };
    }
  }

  // Obtenir les méthodes de paiement disponibles
  getPaymentMethods() {
    return [
      {
        id: 'card',
        type: 'card',
        label: 'Carte de crédit/débit',
        icon: '💳',
        available: true
      },
      {
        id: 'apple_pay',
        type: 'apple_pay',
        label: 'Apple Pay',
        icon: '🍎',
        available: Platform.OS === 'ios'
      },
      {
        id: 'google_pay',
        type: 'google_pay',
        label: 'Google Pay',
        icon: '🤖',
        available: Platform.OS === 'android'
      }
    ];
  }

  // Valider un numéro de carte
  validateCardNumber(cardNumber) {
    // Validation basique du numéro de carte
    const cleanedNumber = cardNumber.replace(/\s/g, '');
    
    if (!/^\d+$/.test(cleanedNumber)) {
      return { valid: false, error: 'Numéro de carte invalide' };
    }
    
    if (cleanedNumber.length < 13 || cleanedNumber.length > 19) {
      return { valid: false, error: 'Numéro de carte invalide' };
    }
    
    // Algorithme de Luhn pour la validation des cartes
    let sum = 0;
    let isEven = false;
    
    for (let i = cleanedNumber.length - 1; i >= 0; i--) {
      let digit = parseInt(cleanedNumber[i]);
      
      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }
      
      sum += digit;
      isEven = !isEven;
    }
    
    const isValid = sum % 10 === 0;
    
    return {
      valid: isValid,
      error: isValid ? null : 'Numéro de carte invalide'
    };
  }

  // Valider une date d'expiration
  validateExpiry(expiry) {
    const match = expiry.match(/^(0[1-9]|1[0-2])\/(\d{2})$/);
    
    if (!match) {
      return { valid: false, error: 'Format invalide (MM/AA)' };
    }
    
    const month = parseInt(match[1]);
    const year = parseInt(match[2]) + 2000;
    const now = new Date();
    const expiryDate = new Date(year, month, 0);
    
    if (expiryDate < now) {
      return { valid: false, error: 'Carte expirée' };
    }
    
    return { valid: true };
  }

  // Valider un CVV
  validateCVV(cvv) {
    if (!/^\d{3,4}$/.test(cvv)) {
      return { valid: false, error: 'CVV invalide' };
    }
    
    return { valid: true };
  }

  // Obtenir le statut du service
  getStatus() {
    return {
      initialized: this.isInitialized,
      publishableKey: this.publishableKey,
      availablePaymentMethods: this.getPaymentMethods()
    };
  }
}

// Instance singleton du service
const stripeService = new StripeService();

export default stripeService;
