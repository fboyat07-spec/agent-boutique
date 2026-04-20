const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { store } = require('../database/firebase');

function createToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET || 'kidai-secret-dev', { expiresIn: '7d' });
}

// Inscription
router.post('/register', async (req, res) => {
  try {
    const { email, password, childName, childAge, parentName } = req.body;

    if (!email || !password || !childName || !childAge) {
      return res.status(400).json({ error: 'Champs requis : email, password, childName, childAge' });
    }

    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Mot de passe trop court (minimum 6 caracteres)' });
    }

    const parsedAge = Number.parseInt(childAge, 10);
    if (!Number.isInteger(parsedAge) || parsedAge < 5 || parsedAge > 18) {
      return res.status(400).json({ error: 'Age enfant invalide (5-18)' });
    }

    const existing = await store.query('users', 'email', email);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Cet email est deja utilise' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    const user = {
      id: userId,
      email,
      password: hashedPassword,
      childName,
      childAge: parsedAge,
      parentName: parentName || '',
      xp: 0,
      level: 1,
      streak: 0,
      lastActiveDate: new Date().toISOString().split('T')[0],
      badges: [],
      diagnosticDone: false,
      learningPath: [],
      missionProgress: {},
      createdAt: new Date().toISOString(),
    };

    await store.set('users', userId, user);

    const token = createToken({ userId, email, childName });

    res.status(201).json({
      token,
      user: { id: userId, email, childName, childAge: user.childAge, xp: 0, level: 1, streak: 0 },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Erreur lors de l\'inscription' });
  }
});

// Connexion
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    const users = await store.query('users', 'email', email);
    if (users.length === 0) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    const user = users[0];
    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    const today = new Date().toISOString().split('T')[0];
    const lastActive = user.lastActiveDate;
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    let streak = user.streak || 0;
    if (lastActive === yesterday) streak += 1;
    else if (lastActive !== today) streak = 1;

    await store.set('users', user.id, { lastActiveDate: today, streak });

    const token = createToken({ userId: user.id, email, childName: user.childName });

    res.json({
      token,
      user: {
        id: user.id,
        email,
        childName: user.childName,
        childAge: user.childAge,
        xp: user.xp || 0,
        level: user.level || 1,
        streak,
        diagnosticDone: Boolean(user.diagnosticDone),
        badges: user.badges || [],
        learningPath: user.learningPath || [],
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Erreur lors de la connexion' });
  }
});

// Profil utilisateur (route protegee)
router.get('/profile', require('../middleware/auth'), async (req, res) => {
  try {
    const user = await store.get('users', req.user.userId);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const { password, ...safeUser } = user;
    res.json(safeUser);
  } catch (err) {
    console.error('Profile error:', err);
    res.status(500).json({ error: 'Erreur profil' });
  }
});

module.exports = router;
