'use strict';

const cron          = require('node-cron');
const EmailSequence = require('../models/EmailSequence');

// ─── Config SMTP Zoho ─────────────────────────────────────────────────────────

const FROM_EMAIL = 'contact@agentboutique.fr';

// ─── FROM_NAME par campagne ───────────────────────────────────────────────────
// Décision Florian : reste "Agent Boutique" pour les deux campagnes (Adèle est
// présentée comme un produit recommandé par Agent Boutique, pas comme l'expéditeur).
const DEFAULT_CAMPAIGN = 'agent_boutique';
const FROM_NAMES = {
  agent_boutique: 'Agent Boutique',
  adele:          'Agent Boutique',
};
function getFromName(campaign) {
  return FROM_NAMES[campaign] || FROM_NAMES[DEFAULT_CAMPAIGN];
}

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

// ─── Templates J3 et J7 — campagne agent_boutique (inchangé) ─────────────────

function buildJ3AgentBoutique(seq) {
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
<strong>${getFromName(seq.campaign)}</strong><br>
<a href="mailto:${FROM_EMAIL}">${FROM_EMAIL}</a></p>

<p style="color:#999;font-size:12px;">
<a href="mailto:${FROM_EMAIL}?subject=Désinscription">Se désinscrire</a>
</p>
`.trim(),
  };
}

function buildJ7AgentBoutique(seq) {
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
<strong>${getFromName(seq.campaign)}</strong><br>
<a href="mailto:${FROM_EMAIL}">${FROM_EMAIL}</a></p>

<p style="color:#999;font-size:12px;">
<a href="mailto:${FROM_EMAIL}?subject=Désinscription">Se désinscrire</a>
</p>
`.trim(),
  };
}

// ─── Templates J3 et J7 — campagne adele ──────────────────────────────────────

function buildJ3Adele(seq) {
  const { accroche } = getSectorCtx(seq.sector);
  return {
    subject: `Un appel raté peut vous coûter un client 📞`,
    html: `
<p>Bonjour,</p>

<p>Un constat qui revient souvent chez les indépendants : quand un appel ou un message reste sans réponse, le client ne rappelle généralement pas — il prend rendez-vous ailleurs.</p>

<p>C'est exactement le problème qu'Adèle résout : elle répond à votre place sur WhatsApp/SMS pendant que vous gérez ${accroche}, prend les rendez-vous et qualifie les demandes — configurée sur vos propres motifs de rendez-vous et leurs vraies durées, pas un modèle générique.</p>

<p>Si ça peut avoir un intérêt concret pour <strong>${seq.businessName}</strong>, je peux vous montrer ça en quelques minutes.</p>

<p>Si ce n'est pas le bon moment, dites-le-moi et je ne vous relance pas.</p>

<p>Belle journée,<br>
<strong>${getFromName(seq.campaign)}</strong><br>
<a href="mailto:${FROM_EMAIL}">${FROM_EMAIL}</a></p>

<p style="color:#999;font-size:12px;">
<a href="mailto:${FROM_EMAIL}?subject=Désinscription">Se désinscrire</a>
</p>
`.trim(),
  };
}

function buildJ7Adele(seq) {
  const { accroche } = getSectorCtx(seq.sector);
  return {
    subject: `Adèle pour ${seq.businessName} — 49€/mois, sans engagement`,
    html: `
<p>Bonjour,</p>

<p>Dernier message de ma part, promis.</p>

<p>Pour être concret : Adèle démarre à <strong>49€/mois, sans engagement</strong>, et la configuration (vos motifs de rendez-vous, leurs vraies durées, vos disponibilités) prend <strong>moins de 10 minutes</strong>.</p>

<p>Si un appel raté pendant que vous gérez ${accroche} vous coûte un client de trop, la porte reste ouverte pour <strong>${seq.businessName}</strong> — il vous suffira de répondre à cet email.</p>

<p>Belle continuation,<br>
<strong>${getFromName(seq.campaign)}</strong><br>
<a href="mailto:${FROM_EMAIL}">${FROM_EMAIL}</a></p>

<p style="color:#999;font-size:12px;">
Vous ne souhaitez plus recevoir de message ? <a href="mailto:${FROM_EMAIL}?subject=STOP">Répondez STOP</a> ou <a href="mailto:${FROM_EMAIL}?subject=Désinscription">désinscrivez-vous ici</a>.
</p>
`.trim(),
  };
}

// ─── Dispatchers par campagne ──────────────────────────────────────────────────

function buildJ3(seq) {
  return seq.campaign === 'adele' ? buildJ3Adele(seq) : buildJ3AgentBoutique(seq);
}

function buildJ7(seq) {
  return seq.campaign === 'adele' ? buildJ7Adele(seq) : buildJ7AgentBoutique(seq);
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
            from:    `"${getFromName(seq.campaign)}" <${FROM_EMAIL}>`,
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
