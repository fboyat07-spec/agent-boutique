'use strict';

const cron          = require('node-cron');
const EmailSequence = require('../models/EmailSequence');

// ─── Config SMTP Zoho ─────────────────────────────────────────────────────────

const FROM_EMAIL = 'contact@agentboutique.fr';
const FROM_NAME  = 'Agent Boutique';

function createTransporter() {
  // nodemailer installé dans backend/node_modules (npm install nodemailer)
  const nodemailer = require('nodemailer');
  return nodemailer.createTransport({
    host:   'smtp.zoho.eu',
    port:   587,
    secure: false,
    auth: { user: FROM_EMAIL, pass: process.env.SMTP_PASS },
  });
}

// ─── Connexion MongoDB lazy (server déjà connecté ; tool script → connect ici) ─

async function ensureMongoConnected() {
  const mongoose = require('mongoose');
  if (mongoose.connection.readyState === 1) return; // déjà connecté (serveur)

  // Charger MONGODB_URI depuis le .env racine si absent
  if (!process.env.MONGODB_URI) {
    try {
      require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
    } catch (_) {}
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('[EmailSequenceService] MONGODB_URI manquant — définir dans .env');
  await mongoose.connect(uri);
  console.log('[EmailSequenceService] MongoDB connecté (standalone)');
}

// ─── Personnalisation par secteur ─────────────────────────────────────────────

function getSectorCtx(sector) {
  const s = (sector || '').toLowerCase();
  if (s.includes('coaching') || s.includes('formation'))
    return { accroche: 'votre activité de coaching' };
  if (s.includes('photo') || s.includes('vid'))
    return { accroche: 'votre studio' };
  if (s.includes('immo'))
    return { accroche: 'votre agence' };
  if (s.includes('coiffure'))
    return { accroche: 'votre salon' };
  if (s.includes('esthét') || s.includes('beauté') || s.includes('institut'))
    return { accroche: 'votre institut' };
  if (s.includes('auto-école') || s.includes('auto'))
    return { accroche: 'votre auto-école' };
  if (s.includes('restaurant'))
    return { accroche: 'votre restaurant' };
  if (s.includes('électricien') || s.includes('elec'))
    return { accroche: 'votre activité' };
  if (s.includes('plombier') || s.includes('plomb'))
    return { accroche: 'votre activité' };
  if (s.includes('personal') || s.includes('trainer') || s.includes('bien-être'))
    return { accroche: 'votre activité' };
  return { accroche: 'votre activité' };
}

// ─── Templates J3 et J7 ───────────────────────────────────────────────────────

function buildJ3(seq) {
  const { accroche } = getSectorCtx(seq.sector);
  return {
    subject: `Toujours là si vous avez 10 min 😊`,
    html: `
<p>Bonjour,</p>

<p>Je me permets de revenir vers vous — simplement pour m'assurer que mon message vous a bien atteint.</p>

<p>Je sais que vous êtes occupé(e) : gérer ${accroche} au quotidien ne laisse pas beaucoup de temps pour le reste. C'est précisément pourquoi je vous contacte.</p>

<p>Ma solution est là pour <strong>vous faire gagner du temps</strong>, pas pour en prendre davantage.</p>

<p>Si vous avez <strong>10 minutes cette semaine</strong>, on peut regarder ensemble si ça peut apporter quelque chose de concret à <strong>${seq.businessName}</strong>. Pas de présentation commerciale interminable — juste un échange direct.</p>

<p>Un créneau qui vous convient ?</p>

<p>Belle journée,<br>
<strong>${FROM_NAME}</strong><br>
<a href="mailto:${FROM_EMAIL}">${FROM_EMAIL}</a></p>

<p style="color:#999;font-size:12px;">
<a href="mailto:${FROM_EMAIL}?subject=Désinscription">Se désinscrire</a>
</p>
`.trim(),
  };
}

function buildJ7(seq) {
  const { accroche } = getSectorCtx(seq.sector);
  return {
    subject: `Mon dernier message — bonne continuation 🙏`,
    html: `
<p>Bonjour,</p>

<p>Je ne voudrais pas vous importuner davantage — promis, c'est mon dernier message.</p>

<p>Si le timing n'est pas bon en ce moment, c'est tout à fait compréhensible. Gérer ${accroche} comme vous le faites demande toute l'énergie disponible.</p>

<p>Mais si un jour vous souhaitez explorer comment automatiser votre relation client et attirer plus de prospects pour <strong>${seq.businessName}</strong>, <strong>la porte reste grande ouverte</strong>. Il vous suffira de répondre à cet email.</p>

<p>Je vous souhaite une belle continuation, et surtout… beaucoup de nouveaux clients !</p>

<p>Avec plaisir,<br>
<strong>${FROM_NAME}</strong><br>
<a href="mailto:${FROM_EMAIL}">${FROM_EMAIL}</a></p>

<p style="color:#999;font-size:12px;">
<a href="mailto:${FROM_EMAIL}?subject=Désinscription">Se désinscrire</a>
</p>
`.trim(),
  };
}

// ─── scheduleEmailSequence ────────────────────────────────────────────────────

async function scheduleEmailSequence(lead) {
  await ensureMongoConnected();

  const now = Date.now();
  await EmailSequence.create([
    {
      contactEmail: lead.email,
      contactName:  lead.nom            || '',
      businessName: lead.nom            || '',
      phone:        lead.phoneFormatted || lead.telephone || '',
      sector:       lead.secteur        || lead.naf       || '',
      step:         'J3',
      scheduledAt:  new Date(now + 3 * 24 * 60 * 60 * 1000),
    },
    {
      contactEmail: lead.email,
      contactName:  lead.nom            || '',
      businessName: lead.nom            || '',
      phone:        lead.phoneFormatted || lead.telephone || '',
      sector:       lead.secteur        || lead.naf       || '',
      step:         'J7',
      scheduledAt:  new Date(now + 7 * 24 * 60 * 60 * 1000),
    },
  ]);

  console.log(`[EmailSequence] ✅ J3+J7 planifiés → ${lead.email}`);
}

// ─── startEmailCron ───────────────────────────────────────────────────────────

function startEmailCron() {
  // Toutes les 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    try {
      const pending = await EmailSequence.find({
        status:      'pending',
        scheduledAt: { $lte: new Date() },
      }).limit(50);

      if (!pending.length) return;
      console.log(`[EMAIL CRON] ${pending.length} email(s) à envoyer`);

      const transporter = createTransporter();

      for (const seq of pending) {
        try {
          const { subject, html } = seq.step === 'J3' ? buildJ3(seq) : buildJ7(seq);
          await transporter.sendMail({
            from:    `"${FROM_NAME}" <${FROM_EMAIL}>`,
            to:      seq.contactEmail,
            subject,
            html,
          });
          await EmailSequence.updateOne(
            { _id: seq._id },
            { status: 'sent', sentAt: new Date() }
          );
          console.log(`[EMAIL CRON] ✅ ${seq.step} → ${seq.contactEmail}`);
        } catch (err) {
          await EmailSequence.updateOne({ _id: seq._id }, { status: 'failed' });
          console.error(`[EMAIL CRON] ❌ ${seq.step} → ${seq.contactEmail} | ${err.message}`);
        }
      }
    } catch (err) {
      console.error('[EMAIL CRON ERROR]', err.message);
    }
  });

  console.log('[EMAIL CRON] Démarré — vérification toutes les 15 min');
}

module.exports = { scheduleEmailSequence, startEmailCron };
