const express = require('express');
const router = express.Router();
const authService = require('../services/authService');
const dataService = require('../services/dataService');

// Middleware pour vérifier le token Firebase
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Token manquant' });
    }

    const result = await authService.verifyToken(token);
    if (!result.success) {
      return res.status(403).json({ error: 'Token invalide' });
    }

    req.user = result.user;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Erreur d\'authentification' });
  }
};

// Inscription Firebase
router.post('/register', async (req, res) => {
  try {
    const { email, password, displayName, age, parentEmail } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    const result = await authService.register({
      email, 
      password, 
      displayName, 
      age, 
      parentEmail
    });
    
    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Obtenir un token personnalisé (pour les tests)
router.post('/custom-token', async (req, res) => {
  try {
    const { uid } = req.body;
    
    if (!uid) {
      return res.status(400).json({ error: 'UID requis' });
    }

    const result = await authService.generateCustomToken(uid);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Obtenir le profil utilisateur Firebase
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const [profileResult, progressResult] = await Promise.all([
      authService.getUserProfile(req.user.uid),
      dataService.getUserProgress(req.user.uid)
    ]);
    
    if (profileResult.success && progressResult.success) {
      res.json({
        success: true,
        user: {
          ...profileResult.user,
          progress: progressResult.progress
        }
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Mettre à jour le profil Firebase
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { displayName, age, parentEmail, preferences } = req.body;
    
    const [profileResult, prefResult] = await Promise.all([
      authService.updateUserProfile(req.user.uid, {
        displayName,
        age,
        parentEmail
      }),
      preferences ? dataService.saveUserPreferences(req.user.uid, preferences) : 
        Promise.resolve({ success: true })
    ]);
    
    if (profileResult.success && prefResult.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({
        success: false,
        error: 'Échec de la mise à jour'
      });
    }
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Obtenir les préférences utilisateur Firebase
router.get('/preferences', authenticateToken, async (req, res) => {
  try {
    const result = await dataService.getUserPreferences(req.user.uid);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
