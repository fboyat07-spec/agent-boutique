const express = require('express');
const router = express.Router();
const dataService = require('../services/dataService');

// Middleware pour vérifier le token Firebase
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Token manquant' });
    }

    const authService = require('../services/authService');
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

// Sauvegarder un diagnostic
router.post('/diagnostic', authenticateToken, async (req, res) => {
  try {
    const diagnosticData = req.body;
    
    const result = await dataService.saveDiagnostic(req.user.uid, diagnosticData);
    
    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Obtenir les diagnostics de l'utilisateur
router.get('/diagnostics', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    
    const result = await dataService.getUserDiagnostics(req.user.uid, limit);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Obtenir la progression de l'utilisateur
router.get('/user', authenticateToken, async (req, res) => {
  try {
    const result = await dataService.getUserProgress(req.user.uid);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Mettre à jour la progression
router.put('/user', authenticateToken, async (req, res) => {
  try {
    const updates = req.body;
    
    const result = await dataService.updateUserProgress(req.user.uid, updates);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Sauvegarder une session d'apprentissage
router.post('/session', authenticateToken, async (req, res) => {
  try {
    const sessionData = req.body;
    
    const result = await dataService.saveLearningSession(req.user.uid, sessionData);
    
    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Compléter une session d'apprentissage
router.put('/session/:sessionId', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { results } = req.body;
    
    const result = await dataService.completeLearningSession(sessionId, results);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Sauvegarder une réponse à une question
router.post('/question', authenticateToken, async (req, res) => {
  try {
    const questionData = req.body;
    
    const result = await dataService.saveQuestionAnswer(req.user.uid, questionData);
    
    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Obtenir les recommandations d'apprentissage
router.get('/recommendations', authenticateToken, async (req, res) => {
  try {
    const result = await dataService.getLearningRecommendations(req.user.uid);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Obtenir les questions récentes
router.get('/questions', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    
    const result = await dataService.getRecentQuestions(req.user.uid, limit);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
