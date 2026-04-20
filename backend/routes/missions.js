const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../middleware/auth');
const { generateMission } = require('../services/adaptiveEngine');
const { store } = require('../database/firebase');

const XP_TABLE = {
  easy: 10,
  medium: 20,
  hard: 35,
};

const LEVEL_THRESHOLDS = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 4000, 5000];
const LEVEL_NAMES = ['', 'Explorateur', 'Apprenti', 'Curieux', 'Studieux', 'Brillant', 'Expert', 'Champion', 'Virtuose', 'Maitre', 'Sage', 'Genie'];

function calculateLevel(xp) {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i -= 1) {
    if (xp >= LEVEL_THRESHOLDS[i]) return i + 1;
  }
  return 1;
}

router.get('/next', authMiddleware, async (req, res) => {
  try {
    const user = await store.get('users', req.user.userId);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    if (!user.diagnosticDone || !Array.isArray(user.learningPath) || user.learningPath.length === 0) {
      return res.status(400).json({
        error: 'Diagnostic requis avant les missions',
        needsDiagnostic: true,
      });
    }

    const progress = user.missionProgress || {};

    const nextSkill = user.learningPath.find((step) => {
      const stepProgress = progress[step.skill] || { completed: 0 };
      return stepProgress.completed < step.missionsCount;
    });

    if (!nextSkill) {
      return res.json({
        allCompleted: true,
        message: 'Parcours complete.',
        xp: user.xp || 0,
        level: calculateLevel(user.xp || 0),
      });
    }

    const stepProgress = progress[nextSkill.skill] || { completed: 0, errors: 0, recentErrors: [] };

    let difficulty = nextSkill.difficulty || 'medium';
    if (stepProgress.errors > 2) difficulty = 'easy';
    if (stepProgress.completed >= 2 && stepProgress.errors === 0) difficulty = 'hard';

    const mission = await generateMission(
      nextSkill.skill,
      nextSkill.subject,
      difficulty,
      user.childAge || 10,
      stepProgress.recentErrors || []
    );

    const missionId = uuidv4();
    const xpReward = XP_TABLE[difficulty] || 15;

    await store.set('missions', missionId, {
      ...mission,
      missionId,
      userId: req.user.userId,
      skill: nextSkill.skill,
      subject: nextSkill.subject,
      xpReward,
      createdAt: new Date().toISOString(),
    });

    res.json({
      missionId,
      skill: nextSkill.skill,
      subject: nextSkill.subject,
      skillLabel: nextSkill.label,
      question: mission.question,
      options: mission.options,
      hint: mission.hint,
      emoji: mission.emoji || '📚',
      xpReward,
      difficulty,
      progress: {
        current: stepProgress.completed + 1,
        total: nextSkill.missionsCount,
        skillOrder: user.learningPath.indexOf(nextSkill) + 1,
        totalSkills: user.learningPath.length,
      },
    });
  } catch (err) {
    console.error('Next mission error:', err);
    res.status(500).json({ error: 'Erreur generation mission' });
  }
});

router.post('/answer', authMiddleware, async (req, res) => {
  try {
    const { missionId, answer, timeSpent } = req.body;

    if (!missionId) {
      return res.status(400).json({ error: 'missionId requis' });
    }

    const mission = await store.get('missions', missionId);
    if (!mission) return res.status(404).json({ error: 'Mission introuvable' });
    if (mission.userId !== req.user.userId) return res.status(403).json({ error: 'Mission invalide' });

    const isCorrect = answer === mission.answer;
    const user = await store.get('users', req.user.userId);

    const progress = user.missionProgress || {};
    const skillProgress = progress[mission.skill] || { completed: 0, errors: 0, recentErrors: [] };

    if (isCorrect) {
      skillProgress.completed += 1;
      skillProgress.recentErrors = [];
    } else {
      skillProgress.errors += 1;
      skillProgress.recentErrors = [...(skillProgress.recentErrors || []), answer].slice(-3);
    }

    progress[mission.skill] = skillProgress;

    const xpGained = isCorrect ? Number(mission.xpReward || 15) : 3;
    const newXP = Number(user.xp || 0) + xpGained;
    const newLevel = calculateLevel(newXP);
    const oldLevel = calculateLevel(user.xp || 0);
    const leveledUp = newLevel > oldLevel;

    const newBadges = [];
    const badges = Array.isArray(user.badges) ? [...user.badges] : [];

    if (skillProgress.completed === 1 && !badges.includes('first_mission')) {
      newBadges.push({ id: 'first_mission', name: 'Premiere victoire', emoji: '🎯' });
      badges.push('first_mission');
    }
    if (isCorrect && Number(timeSpent || 0) > 0 && Number(timeSpent) < 10 && !badges.includes('speed_demon')) {
      newBadges.push({ id: 'speed_demon', name: 'Eclair', emoji: '⚡' });
      badges.push('speed_demon');
    }
    if (newLevel >= 3 && !badges.includes('level_3')) {
      newBadges.push({ id: 'level_3', name: 'Apprenti confirme', emoji: '🌿' });
      badges.push('level_3');
    }

    await store.set('users', req.user.userId, {
      xp: newXP,
      level: newLevel,
      missionProgress: progress,
      badges,
      lastMissionAt: new Date().toISOString(),
    });

    await store.set('missions', missionId, {
      answered: true,
      userAnswer: answer,
      correct: isCorrect,
      answeredAt: new Date().toISOString(),
    });

    res.json({
      correct: isCorrect,
      explanation: mission.explanation,
      correctAnswer: mission.answer,
      xpGained,
      totalXP: newXP,
      level: newLevel,
      levelName: LEVEL_NAMES[newLevel] || 'Genie',
      leveledUp,
      newBadges,
      skillProgress: {
        completed: skillProgress.completed,
        total: 3,
      },
    });
  } catch (err) {
    console.error('Answer mission error:', err);
    res.status(500).json({ error: 'Erreur soumission reponse' });
  }
});

router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const user = await store.get('users', req.user.userId);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const progress = user.missionProgress || {};
    const totalCompleted = Object.values(progress).reduce((sum, s) => sum + Number(s.completed || 0), 0);

    const accuracyBySkill = Object.values(progress)
      .map((s) => {
        const total = Number(s.completed || 0) + Number(s.errors || 0);
        return total > 0 ? Number(s.completed || 0) / total : null;
      })
      .filter((n) => n !== null);

    const accuracy = accuracyBySkill.length > 0
      ? Math.round((accuracyBySkill.reduce((a, b) => a + b, 0) / accuracyBySkill.length) * 100)
      : 0;

    const currentLevel = calculateLevel(user.xp || 0);

    res.json({
      xp: user.xp || 0,
      level: currentLevel,
      levelName: LEVEL_NAMES[currentLevel] || 'Explorateur',
      streak: user.streak || 0,
      totalMissionsCompleted: totalCompleted,
      accuracy,
      badges: user.badges || [],
      learningPath: user.learningPath || [],
      missionProgress: progress,
      nextLevelXP: LEVEL_THRESHOLDS[Math.min(currentLevel, LEVEL_THRESHOLDS.length - 1)] || 5000,
    });
  } catch (err) {
    console.error('Stats mission error:', err);
    res.status(500).json({ error: 'Erreur stats' });
  }
});

module.exports = router;
