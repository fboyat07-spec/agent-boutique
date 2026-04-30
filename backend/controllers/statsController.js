const Conversation = require('../models/Conversation');
const Metric = require('../models/Metric');

// GET /stats/overview
async function getOverview(req, res) {
  try {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const overview = await Conversation.aggregate([
      {
        $facet: {
          totalConversations: [
            { $count: "total" }
          ],
          activeConversations: [
            {
              $match: {
                lastInteractionAt: { $gte: yesterday }
              }
            },
            { $count: "active" }
          ],
          conversions: [
            {
              $match: {
                stage: "won"
              }
            },
            { $count: "conversions" }
          ],
          avgResponseTime: [
            {
              $match: {
                avgResponseTime: { $exists: true, $ne: null }
              }
            },
            {
              $group: {
                _id: null,
                avgResponseTime: { $avg: "$avgResponseTime" }
              }
            }
          ]
        }
      },
      {
        $project: {
          totalConversations: { $arrayElemAt: ["$totalConversations.total", 0] },
          activeConversations: { $arrayElemAt: ["$activeConversations.active", 0] },
          conversions: { $arrayElemAt: ["$conversions.conversions", 0] },
          avgResponseTime: { $arrayElemAt: ["$avgResponseTime.avgResponseTime", 0] },
          conversionRate: {
            $cond: {
              if: { $gt: [{ $arrayElemAt: ["$totalConversations.total", 0] }, 0] },
              then: {
                $multiply: [
                  { $divide: [{ $arrayElemAt: ["$conversions.conversions", 0] }, { $arrayElemAt: ["$totalConversations.total", 0] }] },
                  100
                ]
              },
              else: 0
            }
          }
        }
      },
      {
        $project: {
          totalConversations: { $ifNull: ["$totalConversations", 0] },
          activeConversations: { $ifNull: ["$activeConversations", 0] },
          conversions: { $ifNull: ["$conversions", 0] },
          conversionRate: { $round: ["$conversionRate", 2] },
          avgResponseTime: { $ifNull: ["$avgResponseTime", 0] }
        }
      }
    ]);

    res.json(overview[0] || {
      totalConversations: 0,
      activeConversations: 0,
      conversions: 0,
      conversionRate: 0,
      avgResponseTime: 0
    });

  } catch (error) {
    console.error('[STATS OVERVIEW ERROR]', error);
    res.status(500).json({ error: 'Failed to fetch overview stats' });
  }
}

// GET /stats/stages
async function getStages(req, res) {
  try {
    const stages = await Conversation.aggregate([
      {
        $group: {
          _id: "$stage",
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          stage: "$_id",
          count: "$count",
          _id: 0
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    res.json(stages);

  } catch (error) {
    console.error('[STATS STAGES ERROR]', error);
    res.status(500).json({ error: 'Failed to fetch stage stats' });
  }
}

// GET /stats/top-leads
async function getTopLeads(req, res) {
  try {
    const topLeads = await Conversation.aggregate([
      {
        $match: {
          phone: { $exists: true, $ne: null },
          score: { $exists: true, $ne: null }
        }
      },
      {
        $project: {
          phone: 1,
          score: 1,
          stage: 1,
          _id: 0
        }
      },
      {
        $sort: { score: -1 }
      },
      {
        $limit: 20
      }
    ]);

    res.json(topLeads);

  } catch (error) {
    console.error('[STATS TOP LEADS ERROR]', error);
    res.status(500).json({ error: 'Failed to fetch top leads' });
  }
}

module.exports = {
  getOverview,
  getStages,
  getTopLeads
};
