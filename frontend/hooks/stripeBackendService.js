// Service backend Stripe (Mock pour développement)
// En production, ces fonctions appelleraient votre vrai backend Node.js/Express

class StripeBackendService {
  constructor() {
    this.baseUrl = process.env.EXPO_PUBLIC_STRIPE_BACKEND_URL || 'http://localhost:3000/api/stripe';
    this.isMock = true; // Passer à false pour backend réel
  }

  // Créer une session de checkout
  async createCheckoutSession(planId, userId, successUrl, cancelUrl) {
    try {
      if (this.isMock) {
        // Mock: Simuler la création d'une session
        console.log('🔄 Mock: Création session checkout pour plan:', planId);
        
        // Simuler un délai réseau
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const mockSession = {
          id: `cs_mock_${Date.now()}`,
          url: `https://checkout.stripe.com/pay/cs_mock_${Date.now()}`,
          payment_status: 'unpaid',
          success_url: successUrl,
          cancel_url: cancelUrl,
          metadata: {
            plan_id: planId,
            user_id: userId
          },
          created: Math.floor(Date.now() / 1000)
        };

        return {
          success: true,
          session: mockSession
        };
      }

      // Appel backend réel
      const response = await fetch(`${this.baseUrl}/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          planId,
          userId,
          successUrl,
          cancelUrl
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur création session');
      }

      return {
        success: true,
        session: data.session
      };

    } catch (error) {
      console.error('❌ Erreur création session checkout:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Créer un PaymentIntent pour PaymentSheet
  async createPaymentIntent(planId, userId, amount, currency = 'eur') {
    try {
      if (this.isMock) {
        // Mock: Simuler la création d'un PaymentIntent
        console.log('🔄 Mock: Création PaymentIntent pour plan:', planId);
        
        // Simuler un délai réseau
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const mockPaymentIntent = {
          id: `pi_mock_${Date.now()}`,
          client_secret: `pi_mock_secret_${Date.now()}`,
          amount: amount * 100, // Convertir en cents
          currency,
          status: 'requires_payment_method',
          created: Math.floor(Date.now() / 1000),
          metadata: {
            plan_id: planId,
            user_id: userId,
            subscription_type: 'recurring'
          },
          payment_method_types: ['card']
        };

        return {
          success: true,
          paymentIntent: mockPaymentIntent
        };
      }

      // Appel backend réel
      const response = await fetch(`${this.baseUrl}/create-payment-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          planId,
          userId,
          amount,
          currency
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur création PaymentIntent');
      }

      return {
        success: true,
        paymentIntent: data.paymentIntent
      };

    } catch (error) {
      console.error('❌ Erreur création PaymentIntent:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Confirmer un PaymentIntent
  async confirmPaymentIntent(paymentIntentId, paymentMethodId) {
    try {
      if (this.isMock) {
        // Mock: Simuler la confirmation
        console.log('🔄 Mock: Confirmation PaymentIntent:', paymentIntentId);
        
        // Simuler un délai réseau
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const mockConfirmedIntent = {
          id: paymentIntentId,
          status: 'succeeded',
          amount_paid: true,
          payment_method: paymentMethodId,
          receipt_email: null,
          created: Math.floor(Date.now() / 1000)
        };

        return {
          success: true,
          paymentIntent: mockConfirmedIntent
        };
      }

      // Appel backend réel
      const response = await fetch(`${this.baseUrl}/confirm-payment-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentIntentId,
          paymentMethodId
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur confirmation PaymentIntent');
      }

      return {
        success: true,
        paymentIntent: data.paymentIntent
      };

    } catch (error) {
      console.error('❌ Erreur confirmation PaymentIntent:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Récupérer une session de checkout
  async retrieveCheckoutSession(sessionId) {
    try {
      if (this.isMock) {
        // Mock: Simuler la récupération
        console.log('🔄 Mock: Récupération session:', sessionId);
        
        // Simuler un délai réseau
        await new Promise(resolve => setTimeout(resolve, 200));
        
        const mockSession = {
          id: sessionId,
          payment_status: 'paid',
          metadata: {
            plan_id: 'premium' // À extraire de la vraie session
          },
          customer: 'cus_mock_' + Date.now(),
          subscription: 'sub_mock_' + Date.now(),
          created: Math.floor(Date.now() / 1000)
        };

        return {
          success: true,
          session: mockSession
        };
      }

      // Appel backend réel
      const response = await fetch(`${this.baseUrl}/retrieve-checkout-session/${sessionId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur récupération session');
      }

      return {
        success: true,
        session: data.session
      };

    } catch (error) {
      console.error('❌ Erreur récupération session:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Créer un client Stripe
  async createCustomer(userId, email, name, metadata = {}) {
    try {
      if (this.isMock) {
        // Mock: Simuler la création d'un client
        console.log('🔄 Mock: Création client pour:', email);
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const mockCustomer = {
          id: `cus_mock_${Date.now()}`,
          email,
          name,
          metadata: {
            ...metadata,
            user_id: userId
          },
          created: Math.floor(Date.now() / 1000)
        };

        return {
          success: true,
          customer: mockCustomer
        };
      }

      // Appel backend réel
      const response = await fetch(`${this.baseUrl}/create-customer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          email,
          name,
          metadata
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur création client');
      }

      return {
        success: true,
        customer: data.customer
      };

    } catch (error) {
      console.error('❌ Erreur création client:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Créer un abonnement
  async createSubscription(userId, planId, paymentMethodId = null) {
    try {
      if (this.isMock) {
        // Mock: Simuler la création d'un abonnement
        console.log('🔄 Mock: Création abonnement pour plan:', planId);
        
        await new Promise(resolve => setTimeout(resolve, 800));
        
        const mockSubscription = {
          id: `sub_mock_${Date.now()}`,
          customer: `cus_mock_${userId}`,
          status: 'active',
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000),
          items: [{
            price: `price_${planId}`,
            quantity: 1
          }],
          metadata: {
            plan_id: planId,
            user_id: userId
          }
        };

        return {
          success: true,
          subscription: mockSubscription
        };
      }

      // Appel backend réel
      const response = await fetch(`${this.baseUrl}/create-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          planId,
          paymentMethodId
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur création abonnement');
      }

      return {
        success: true,
        subscription: data.subscription
      };

    } catch (error) {
      console.error('❌ Erreur création abonnement:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Annuler un abonnement
  async cancelSubscription(subscriptionId, userId) {
    try {
      if (this.isMock) {
        // Mock: Simuler l'annulation
        console.log('🔄 Mock: Annulation abonnement:', subscriptionId);
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const mockCancelledSubscription = {
          id: subscriptionId,
          status: 'canceled',
          canceled_at: Math.floor(Date.now() / 1000),
          ended_at: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000)
        };

        return {
          success: true,
          subscription: mockCancelledSubscription
        };
      }

      // Appel backend réel
      const response = await fetch(`${this.baseUrl}/cancel-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subscriptionId,
          userId
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur annulation abonnement');
      }

      return {
        success: true,
        subscription: data.subscription
      };

    } catch (error) {
      console.error('❌ Erreur annulation abonnement:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Obtenir les webhooks events
  async handleWebhook(event, signature) {
    try {
      if (this.isMock) {
        // Mock: Simuler le traitement du webhook
        console.log('🔄 Mock: Traitement webhook event:', event.type);
        
        // Simuler la validation de signature
        const isValidSignature = true; // En production, valider avec la clé secrète
        
        if (!isValidSignature) {
          throw new Error('Signature invalide');
        }

        return {
          success: true,
          processed: true
        };
      }

      // Appel backend réel
      const response = await fetch(`${this.baseUrl}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Stripe-Signature': signature
        },
        body: JSON.stringify({
          event,
          signature
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur traitement webhook');
      }

      return {
        success: true,
        processed: data.processed
      };

    } catch (error) {
      console.error('❌ Erreur traitement webhook:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Obtenir le statut du service
  getStatus() {
    return {
      isMock: this.isMock,
      baseUrl: this.baseUrl,
      available: true
    };
  }

  // Basculer entre mock et backend réel
  setMockMode(isMock) {
    this.isMock = isMock;
    console.log(`🔄 Mode backend changé vers: ${isMock ? 'MOCK' : 'RÉEL'}`);
  }
}

// Instance singleton du service
const stripeBackendService = new StripeBackendService();

export default stripeBackendService;
