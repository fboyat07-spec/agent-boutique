const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token manquant' });
  }

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET || 'kidai-secret-dev');
    req.user = user;
    next();
  } catch {
    return res.status(403).json({ error: 'Token invalide ou expire' });
  }
};

