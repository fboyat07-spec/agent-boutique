const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../middleware/auth');
const { selectDiagnosticQuestions } = require('../services/adaptiveEngine');
const { analyzeGaps } = require('../services/gapAnalyzer');
// const { store } = require('../database/firebase');

// Store simulé pour mode démo
const mockStore = {
  users: new Map(),
  diagnosticSessions: new Map(),
  
  async get(collection, id) {
    if (collection === 'users') {
      return this.users.get(id) || { childAge: 10, diagnosticDone: false };
    }
    return this.diagnosticSessions.get(id);
  },
  
  async set(collection, id, data) {
    if (collection === 'users') {
      this.users.set(id, data);
    } else if (collection === 'diagnosticSessions') {
      this.diagnosticSessions.set(id, data);
    }
  }
};

// Démarrer un diagnostic
router.post('/start', authMiddleware, async (req, res) => {
  try {
    const user = await mockStore.get('users', req.user.userId);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const questions = selectDiagnosticQuestions(user.childAge || 10);
    const sessionId = uuidv4();

    // Stocker la session (sans les réponses, pour sécurité)
    const session = {
      id: sessionId,
      userId: req.user.userId,
      questions: questions.map(q => ({
        id: q.id, question: q.question, options: q.options,
        skill: q.skill, subject: q.subject, difficulty: q.difficulty, emoji: q.emoji || '📚'
      })),
      answers: [],
      startedAt: new Date().toISOString(),
      completed: false,
    };

    // Stocker les vraies réponses côté serveur (jamais envoyées au client)
    const sessionAnswers = {};
    questions.forEach(q => { sessionAnswers[q.id] = q.answer; });
    await mockStore.set('diagnosticSessions', sessionId, { ...session, correctAnswers: sessionAnswers });

    res.json({
      sessionId,
      questions: session.questions,
      totalQuestions: questions.length,
      message: `Diagnostic démarré ! ${questions.length} questions adaptées à l'âge de ${user.childAge} ans.`
    });

  } catch (err) {
    console.error('Diagnostic start error:', err);
    res.status(500).json({ error: 'Erreur démarrage diagnostic' });
  }
});

// Soumettre les réponses du diagnostic
router.post('/submit', authMiddleware, async (req, res) => {
  try {
    const { sessionId, answers } = req.body;

    if (!sessionId || !Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: 'sessionId et answers sont requis' });
    }

    const session = await mockStore.get('diagnosticSessions', sessionId);
    if (!session) return res.status(404).json({ error: 'Session introuvable' });
    if (session.userId !== req.user.userId) return res.status(403).json({ error: 'Session invalide' });

    const user = await mockStore.get('users', req.user.userId);

    // Corriger les réponses
    const correctedAnswers = answers.map(ans => {
      const question = session.questions.find(q => q.id === ans.questionId);
      const correctAnswer = session.correctAnswers?.[ans.questionId];

      return {
        questionId: ans.questionId,
        skill: question?.skill || 'general',
        subject: question?.subject || 'general',
        correct: ans.answer === correctAnswer,
        timeSpent: Number(ans.timeSpent || 0),
        userAnswer: ans.answer,
        correctAnswer,
      };
    });

    // Analyser les lacunes avec l'IA
    const analysis = await analyzeGaps(correctedAnswers, user?.childAge || 10);

    await mockStore.set('diagnosticSessions', sessionId, {
      completed: true,
      correctedAnswers,
      analysis,
      completedAt: new Date().toISOString(),
    });

    await mockStore.set('users', req.user.userId, {
      diagnosticDone: true,
      learningPath: analysis.learningPath,
      overallLevel: analysis.overallLevel,
      lastDiagnosticAt: new Date().toISOString(),
      xp: (user?.xp || 0) + 50,
    });

    res.json({
      analysis,
      xpGained: 50,
      message: 'Diagnostic terminé. Parcours personnalisé mis à jour.',
    });

  } catch (err) {
    console.error('Diagnostic submit error:', err);
    res.status(500).json({ error: 'Erreur soumission diagnostic' });
  }
});

// Récupérer le résultat du dernier diagnostic
router.get('/result', authMiddleware, async (req, res) => {
  try {
    const user = await mockStore.get('users', req.user.userId);
    if (!user || !user.diagnosticDone) {
      return res.status(404).json({ error: 'Aucun diagnostic effectué', diagnosticDone: false });
    }

    res.json({
      learningPath: user.learningPath || [],
      overallLevel: user.overallLevel || 'beginner',
      diagnosticDone: true,
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur récupération résultat' });
  }
});

module.exports = router;