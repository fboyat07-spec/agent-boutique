const User = require('../models/User');

// Middleware global pour vérifier l'abonnement sur toutes les routes protégées
module.exports = async (req, res, next) => {
  try {
    // Skip pour webhooks et routes publiques
    if (req.path.includes('/webhook/') || 
        req.path.includes('/create-checkout-session') ||
        req.path === '/health' ||
        req.path === '/') {
      return next();
    }

    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token manquant' });
    }

    const token = authHeader.substring(7);
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    
    const user = await User.findOne({ 
      user_id: decoded.user_id,
      tenant_id: decoded.tenant_id 
    });
    
    if (!user) {
      return res.status(401).json({ error: 'Utilisateur non trouvé' });
    }

    // Vérification abonnement UNIQUEMENT via User.subscription_status
    if (user.subscription_status !== 'active' && user.subscription_status !== 'trial') {
      return res.status(403).json({ 
        error: 'Abonnement inactif',
        subscription_status: user.subscription_status 
      });
    }

    req.user = user;
    req.tenant_id = user.tenant_id;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token invalide' });
  }
};
