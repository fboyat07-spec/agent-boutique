const jwt = require('jsonwebtoken');
const User = require('../models/User');
const SaaSTenant = require('../models/SaaSTenant');

module.exports = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token manquant' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    
    // Get user with tenant info
    const user = await User.findOne({ 
      user_id: decoded.user_id,
      tenant_id: decoded.tenant_id 
    });
    
    if (!user) {
      return res.status(401).json({ error: 'Utilisateur non trouvé' });
    }

    // Get tenant info
    const tenant = await SaaSTenant.findOne({ tenant_id: user.tenant_id });

    // Check subscription status via User uniquement
    if (user.subscription_status !== 'active' && user.subscription_status !== 'trial') {
      return res.status(403).json({ 
        error: 'Abonnement inactif',
        subscription_status: user.subscription_status 
      });
    }

    req.user = user;
    req.tenant = user.tenant_id;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token invalide' });
  }
};
