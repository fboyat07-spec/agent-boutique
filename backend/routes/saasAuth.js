const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');
const SaaSTenant = require('../models/SaaSTenant');

function createToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET || 'fallback-secret', { expiresIn: '7d' });
}

// Inscription SaaS - créer User + Tenant
router.post('/register', async (req, res) => {
  try {
    const { 
      email, 
      password, 
      business_name,
      business_category,
      whatsapp_token,
      phone_number_id,
      verify_token
    } = req.body;

    if (!email || !password || !business_name || !whatsapp_token || !phone_number_id) {
      return res.status(400).json({ 
        error: 'Champs requis : email, password, business_name, whatsapp_token, phone_number_id' 
      });
    }

    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Mot de passe trop court (minimum 6 caractères)' });
    }

    // Vérifier si l'email existe déjà
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ error: 'Cet email est déjà utilisé' });
    }

    // Créer tenant_id
    const tenant_id = uuidv4();

    // Créer tenant
    const tenant = new SaaSTenant({
      tenant_id,
      name: business_name,
      whatsapp_token,
      phone_number_id,
      verify_token: verify_token || uuidv4(),
      settings: {
        business_name,
        business_category: business_category || 'other',
        offer: 'standard',
        tone: 'professional'
      },
      subscription_status: 'inactive',
      created_by: email
    });

    await tenant.save();

    // Créer user
    const user = new User({
      user_id: uuidv4(),
      email,
      password_hash: password, // Sera hashé automatiquement par le pre-save hook
      tenant_id,
      subscription_status: 'inactive',
      role: 'admin',
      first_name: business_name,
      last_name: ''
    });

    await user.save();

    console.log('[USER CREATED]', {
      user_id: user.user_id,
      tenant_id,
      email,
      subscription_status: 'inactive'
    });

    const token = createToken({ 
      user_id: user.user_id, 
      tenant_id, 
      email 
    });

    res.status(201).json({
      token,
      user: { 
        user_id: user.user_id, 
        email, 
        tenant_id,
        subscription_status: 'inactive',
        role: user.role 
      },
      tenant: {
        tenant_id,
        name: business_name,
        subscription_status: 'inactive'
      }
    });
  } catch (err) {
    console.error('[REGISTER ERROR]', err);
    res.status(500).json({ error: 'Erreur lors de l\'inscription' });
  }
});

// Connexion SaaS - JWT avec tenant_id
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    const valid = await user.comparePassword(password);
    if (!valid) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    const token = createToken({ 
      user_id: user.user_id, 
      tenant_id: user.tenant_id, 
      email 
    });

    res.json({
      token,
      user: {
        user_id: user.user_id,
        email,
        tenant_id: user.tenant_id,
        subscription_status: user.subscription_status,
        role: user.role
      }
    });
  } catch (err) {
    console.error('[LOGIN ERROR]', err);
    res.status(500).json({ error: 'Erreur lors de la connexion' });
  }
});

module.exports = router;
