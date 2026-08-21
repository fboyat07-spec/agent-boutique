'use strict';

/**
 * Auth console — jeton partagé unique (CONSOLE_TOKEN).
 * ─────────────────────────────────────────────────────
 * Mécanisme déjà utilisé par server.js pour protéger /api/console/* (login sur
 * POST /api/console/login → jeton stocké en sessionStorage → renvoyé en
 * Authorization: Bearer <token>). Le même contrôle était déjà dupliqué
 * indépendamment dans consoleConversationRoutes.js, adminChatRoutes.js et
 * prospecting.routes.js. Centralisé ici pour être require() par n'importe quel
 * routeur sans re-copier la vérification une cinquième fois.
 *
 * Jeton accepté en header `Authorization: Bearer <token>` OU en `?token=`
 * (EventSource ne supporte pas les headers custom — même tolérance que
 * l'implémentation d'origine dans server.js).
 */

const CONSOLE_TOKEN = process.env.CONSOLE_TOKEN || 'console_admin_2024';

function consoleAuth(req, res, next) {
  const headerToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const queryToken  = req.query.token || '';
  const token = headerToken || queryToken;
  if (token !== CONSOLE_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

module.exports = consoleAuth;
