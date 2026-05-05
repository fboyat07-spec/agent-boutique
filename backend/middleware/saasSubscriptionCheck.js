const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Middleware pour vérifier que l'utilisateur a un abonnement actif
module.exports = async (req, res, next) => {
  try {
    // Skip pour les routes publiques et webhooks
    if (req.path.includes('/webhook/') || 
        req.path.includes('/auth/login') || 
        req.path.includes('/auth/register') ||
        req.path.includes('/billing/create-checkout-session') ||
        req.path === '/health' ||
        req.path === '/') {
      return next();
    }

    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token manquant' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    
    const user = await User.findOne({ 
      user_id: decoded.user_id,
      tenant_id: decoded.tenant_id 
    });
    
    if (!user) {
      return res.status(401).json({ error: 'Utilisateur non trouvé' });
    }

    // Vérification OBLIGATOIRE de l'abonnement
    if (user.subscription_status !== 'active' && user.subscription_status !== 'trial') {
      return res.status(403).json({ 
        error: 'Abonnement inactif requis',
        subscription_status: user.subscription_status,
        message: 'Veuillez souscrire à un abonnement pour accéder à cette fonctionnalité'
      });
    }

    req.user = user;
    req.tenant_id = user.tenant_id;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token invalide' });
  }
};
