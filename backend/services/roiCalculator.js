'use strict';

const Prospect     = require('../models/Prospect');
const Conversation = require('../models/Conversation');
const ProcessedMessage = require('../models/ProcessedMessage');

const PLAN_PRICES = { starter: 49, pro: 149, elite: 399 };

/**
 * Calcule les métriques ROI de l'agent.
 * @returns {Promise<object>}
 */
async function computeROI() {
  const costOfService = Number(process.env.MONTHLY_SERVICE_COST) || 0;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [
    allProspects,
    totalConversations,
    totalMessagesSent,
    avgResponseTimeAgg,
    oldestProspect,
    activeLeads,
    hotLeads,
    messagesToday,
  ] = await Promise.all([
    Prospect.find({}, 'status plan revenue convertedAt').lean(),
    Conversation.countDocuments({}),
    ProcessedMessage.countDocuments({}),
    Conversation.aggregate([
      { $match: { avgResponseTime: { $gt: 0 } } },
      { $group: { _id: null, avg: { $avg: '$avgResponseTime' } } }
    ]),
    Prospect.findOne({}).sort({ createdAt: 1 }).select('createdAt').lean(),
    Conversation.countDocuments({ status: 'active' }),
    Conversation.countDocuments({ score: { $gte: 30 } }),
    ProcessedMessage.countDocuments({ createdAt: { $gte: startOfToday } }),
  ]);

  // ── Ventes ──────────────────────────────────────────────────────────────────
  const converted = allProspects.filter(p => p.status === 'converted');
  const contacted = allProspects.filter(p => ['contacted', 'converted'].includes(p.status));

  const revenueByPlan = { starter: { count: 0, revenue: 0 }, pro: { count: 0, revenue: 0 }, elite: { count: 0, revenue: 0 } };

  let totalRevenue = 0;
  for (const p of converted) {
    // Si revenue manuel défini → l'utiliser ; sinon déduire du plan
    const rev = p.revenue > 0 ? p.revenue : (PLAN_PRICES[p.plan] || 0);
    totalRevenue += rev;
    if (p.plan && revenueByPlan[p.plan]) {
      revenueByPlan[p.plan].count++;
      revenueByPlan[p.plan].revenue += rev;
    }
  }

  // ── Taux de conversion ───────────────────────────────────────────────────────
  const conversionRate = contacted.length > 0
    ? parseFloat(((converted.length / contacted.length) * 100).toFixed(2))
    : 0;

  // ── ROI estimé ───────────────────────────────────────────────────────────────
  const estimatedROI = costOfService > 0
    ? parseFloat(((totalRevenue / costOfService) * 100).toFixed(2))
    : null;

  // ── Temps de réponse moyen ───────────────────────────────────────────────────
  const avgResponseTime = avgResponseTimeAgg[0]?.avg ?? null;

  return {
    // Ventes
    totalConverted:    converted.length,
    totalRevenue:      parseFloat(totalRevenue.toFixed(2)),
    revenueByPlan,

    // Pipeline
    totalProspects:    allProspects.length,
    totalContacted:    contacted.length,
    conversionRate,

    // Activité agent
    totalConversations,
    totalMessagesSent,
    avgResponseTime:   avgResponseTime !== null ? Math.round(avgResponseTime) : null,

    // ROI estimé
    estimatedROI,

    // Dashboard métriques
    activeLeads,
    hotLeads,
    messagesToday,

    // Période
    since: oldestProspect?.createdAt ?? null,
    until: new Date(),
  };
}

module.exports = { computeROI };
