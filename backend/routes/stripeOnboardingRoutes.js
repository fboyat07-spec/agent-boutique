// ACTION 2 - Onboarding Stripe automatisé (safe)

const express = require('express');
const { updateTenantConfig, getTenant } = require('../services/tenantManager');
const BusinessLogger = require('../services/businessLogger');
const { optionalAuthenticate, validateTenant } = require('../middleware/tenantAuth');

const router = express.Router();

// POST /api/stripe/onboard - Onboarding Stripe simplifié
router.post('/onboard', optionalAuthenticate, async (req, res) => {
  try {
    const { tenant_id, email, business_name, country = 'FR' } = req.body;
    
    console.log('[STRIPE_ONBOARD_REQUESTED]', { tenant_id, email, business_name, country });
    
    if (!tenant_id) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'tenant_id required'
      });
    }
    
    if (!email) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'email required'
      });
    }
    
    // Vérifier que le tenant existe
    const tenant = getTenant(tenant_id);
    
    if (!tenant || tenant.tenant_id === 'DEFAULT') {
      return res.status(404).json({
        error: 'tenant_not_found',
        message: 'Tenant not found or cannot onboard default tenant'
      });
    }
    
    // Vérifier si Stripe déjà configuré
    const existingConfig = tenant.config;
    if (existingConfig.stripe_account && existingConfig.stripe_account !== '') {
      console.log('[STRIPE_ONBOARD_ALREADY_CONFIGURED]', { tenant_id });
      
      return res.status(409).json({
        error: 'already_configured',
        message: 'Stripe already configured for this tenant',
        current_config: {
          stripe_account: existingConfig.stripe_account.substring(0, 8) + '****'
        }
      });
    }
    
    // Générer payment link simple (option 1 - sans Connect)
    const paymentLink = generateSimplePaymentLink(tenant_id, business_name);
    
    // Option 2: Si besoin de Connect plus tard, implémenter ici
    // const connectAccount = await createConnectAccount(email, business_name, country);
    
    // Mettre à jour configuration tenant
    const stripeConfig = {
      stripe_payment_link: paymentLink,
      stripe_email: email,
      stripe_business_name: business_name,
      stripe_country: country,
      stripe_configured_at: new Date().toISOString(),
      stripe_onboarding_method: 'payment_link' // ou 'connect'
    };
    
    const updateResult = updateTenantConfig(tenant_id, stripeConfig);
    
    if (!updateResult.success) {
      console.log('[STRIPE_ONBOARD_CONFIG_ERROR]', {
        tenant_id,
        error: updateResult.error
      });
      
      return res.status(500).json({
        error: 'config_update_failed',
        message: 'Failed to update tenant configuration',
        details: updateResult.error
      });
    }
    
    console.log('[STRIPE_ONBOARD_SUCCESS]', {
      tenant_id,
      method: stripeConfig.stripe_onboarding_method,
      payment_link: paymentLink.substring(0, 50) + '****'
    });
    
    BusinessLogger.logTenantEvent('stripe_onboarded', tenant_id, {
      method: stripeConfig.stripe_onboarding_method,
      business_name,
      country
    });
    
    res.status(201).json({
      success: true,
      message: 'Stripe onboarding completed successfully',
      tenant_id,
      configuration: {
        payment_link: paymentLink,
        email,
        business_name,
        country,
        configured_at: stripeConfig.stripe_configured_at
      },
      next_steps: [
        'Share payment link with customers',
        'Test payment processing',
        'Monitor payment status'
      ],
      metadata: {
        onboarding_id: `onboard_${tenant_id}_${Date.now()}`,
        created_at: new Date()
      }
    });
    
  } catch (error) {
    console.log('[STRIPE_ONBOARD_ERROR]', error.message);
    
    res.status(500).json({
      error: 'onboarding_error',
      message: 'Failed to complete Stripe onboarding',
      details: error.message
    });
  }
});

// GET /api/stripe/status?tenant_id= - Statut configuration Stripe
router.get('/status', optionalAuthenticate, async (req, res) => {
  try {
    const { tenant_id } = req.query;
    
    console.log('[STRIPE_STATUS_REQUESTED]', { tenant_id });
    
    if (!tenant_id) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'tenant_id parameter required'
      });
    }
    
    const tenant = getTenant(tenant_id);
    
    if (!tenant || tenant.tenant_id === 'DEFAULT') {
      return res.status(404).json({
        error: 'tenant_not_found',
        message: 'Tenant not found'
      });
    }
    
    const config = tenant.config;
    const stripeConfig = {
      configured: !!(config.stripe_payment_link && config.stripe_payment_link !== ''),
      method: config.stripe_onboarding_method || 'none',
      email: config.stripe_email || null,
      business_name: config.stripe_business_name || null,
      country: config.stripe_country || null,
      configured_at: config.stripe_configured_at || null,
      payment_link: config.stripe_payment_link || null
    };
    
    // Masquer le payment link complet pour sécurité
    if (stripeConfig.payment_link) {
      stripeConfig.payment_link_preview = stripeConfig.payment_link.substring(0, 50) + '****';
      stripeConfig.payment_link = null; // Ne pas exposer le lien complet
    }
    
    console.log('[STRIPE_STATUS_GENERATED]', {
      tenant_id,
      configured: stripeConfig.configured,
      method: stripeConfig.method
    });
    
    res.json({
      tenant_id,
      stripe: stripeConfig,
      health: {
        configured: stripeConfig.configured,
        active: stripeConfig.configured,
        last_check: new Date()
      },
      metadata: {
        generated_at: new Date()
      }
    });
    
  } catch (error) {
    console.log('[STRIPE_STATUS_ERROR]', error.message);
    
    res.status(500).json({
      error: 'status_error',
      message: 'Failed to get Stripe status',
      details: error.message
    });
  }
});

// POST /api/stripe/update-link - Mettre à jour payment link
router.post('/update-link', optionalAuthenticate, async (req, res) => {
  try {
    const { tenant_id, business_name } = req.body;
    
    console.log('[STRIPE_UPDATE_LINK_REQUESTED]', { tenant_id, business_name });
    
    if (!tenant_id) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'tenant_id required'
      });
    }
    
    const tenant = getTenant(tenant_id);
    
    if (!tenant || tenant.tenant_id === 'DEFAULT') {
      return res.status(404).json({
        error: 'tenant_not_found',
        message: 'Tenant not found'
      });
    }
    
    // Générer nouveau payment link
    const newPaymentLink = generateSimplePaymentLink(tenant_id, business_name || tenant.config.stripe_business_name);
    
    // Mettre à jour configuration
    const updateConfig = {
      stripe_payment_link: newPaymentLink,
      stripe_updated_at: new Date().toISOString()
    };
    
    if (business_name) {
      updateConfig.stripe_business_name = business_name;
    }
    
    const updateResult = updateTenantConfig(tenant_id, updateConfig);
    
    if (!updateResult.success) {
      return res.status(500).json({
        error: 'update_failed',
        message: 'Failed to update payment link',
        details: updateResult.error
      });
    }
    
    console.log('[STRIPE_UPDATE_LINK_SUCCESS]', {
      tenant_id,
      new_link_preview: newPaymentLink.substring(0, 50) + '****'
    });
    
    BusinessLogger.logTenantEvent('stripe_link_updated', tenant_id, {
      business_name: updateConfig.stripe_business_name
    });
    
    res.json({
      success: true,
      message: 'Payment link updated successfully',
      tenant_id,
      payment_link_preview: newPaymentLink.substring(0, 50) + '****',
      updated_at: updateConfig.stripe_updated_at,
      metadata: {
        updated_by: 'api_request',
        generated_at: new Date()
      }
    });
    
  } catch (error) {
    console.log('[STRIPE_UPDATE_LINK_ERROR]', error.message);
    
    res.status(500).json({
      error: 'update_link_error',
      message: 'Failed to update payment link',
      details: error.message
    });
  }
});

// GET /api/stripe/test-link - Tester payment link (générer un test)
router.get('/test-link', optionalAuthenticate, async (req, res) => {
  try {
    const { tenant_id } = req.query;
    
    console.log('[STRIPE_TEST_LINK_REQUESTED]', { tenant_id });
    
    if (!tenant_id) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'tenant_id parameter required'
      });
    }
    
    const tenant = getTenant(tenant_id);
    
    if (!tenant || tenant.tenant_id === 'DEFAULT') {
      return res.status(404).json({
        error: 'tenant_not_found',
        message: 'Tenant not found'
      });
    }
    
    // Générer un payment link de test
    const testLink = generateTestPaymentLink(tenant_id);
    
    console.log('[STRIPE_TEST_LINK_GENERATED]', {
      tenant_id,
      test_link_preview: testLink.substring(0, 50) + '****'
    });
    
    res.json({
      tenant_id,
      test_link: testLink,
      test_mode: true,
      amount: 9700, // €97.00 en cents
      currency: 'eur',
      description: 'Test payment for agent services',
      metadata: {
        generated_at: new Date(),
        tenant_id,
        test: true
      }
    });
    
  } catch (error) {
    console.log('[STRIPE_TEST_LINK_ERROR]', error.message);
    
    res.status(500).json({
      error: 'test_link_error',
      message: 'Failed to generate test link',
      details: error.message
    });
  }
});

// Fonctions utilitaires (générées localement, pas d'appel API Stripe obligatoire)

function generateSimplePaymentLink(tenant_id, business_name) {
  // Générer un payment link simulé pour l'instant
  // En production, utiliser l'API Stripe réelle
  
  const baseUrl = process.env.STRIPE_BASE_URL || 'https://checkout.stripe.com';
  const testMode = process.env.NODE_ENV !== 'production' ? '/test' : '';
  
  // Simuler un payment link ID
  const linkId = `pl_${tenant_id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  return `${baseUrl}${testMode}/pay/${linkId}`;
}

function generateTestPaymentLink(tenant_id) {
  // Générer un payment link de test
  const baseUrl = 'https://checkout.stripe.com/test';
  const linkId = `test_${tenant_id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  return `${baseUrl}/pay/${linkId}`;
}

// Fonction pour créer un Connect Account (pour implémentation future)
async function createConnectAccount(email, business_name, country) {
  // Implémentation future avec API Stripe Connect
  // Pour l'instant, retourner null pour utiliser payment links
  
  console.log('[STRIPE_CONNECT_NOT_IMPLEMENTED]', {
    email,
    business_name,
    country,
    note: 'Using payment links instead'
  });
  
  return null;
}

module.exports = router;
