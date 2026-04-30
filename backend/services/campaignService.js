const Campaign = require('../models/Campaign');
const Conversation = require('../models/Conversation');

// Assign campaign to conversation based on business type and region
async function assignCampaign(conversation) {
  try {
    if (!conversation) {
      console.log('[CAMPAIGN ASSIGN] No conversation provided');
      return null;
    }

    // If conversation already has campaign, return it
    if (conversation.campaignId) {
      const campaign = await Campaign.findById(conversation.campaignId);
      if (campaign && campaign.active) {
        console.log('[CAMPAIGN ASSIGN] Using existing campaign', { campaignId: campaign._id });
        return campaign;
      }
    }

    // Find matching campaign
    const businessType = conversation.businessType || 'other';
    const region = conversation.region || 'national';

    const campaign = await Campaign.findOne({
      segment: businessType,
      region: region,
      active: true
    });

    if (campaign) {
      // Update conversation with campaign
      await Conversation.findByIdAndUpdate(
        conversation._id,
        { campaignId: campaign._id }
      );
      
      // Update campaign metrics
      await Campaign.findByIdAndUpdate(
        campaign._id,
        { 
          $inc: { 'metrics.totalConversations': 1 },
          'metrics.lastUsed': new Date()
        }
      );

      console.log('[CAMPAIGN ASSIGN] Campaign assigned', { 
        campaignId: campaign._id, 
        businessType, 
        region 
      });
      
      return campaign;
    }

    // Try fallback to national campaign
    const fallbackCampaign = await Campaign.findOne({
      segment: businessType,
      region: 'national',
      active: true
    });

    if (fallbackCampaign) {
      await Conversation.findByIdAndUpdate(
        conversation._id,
        { campaignId: fallbackCampaign._id }
      );
      
      await Campaign.findByIdAndUpdate(
        fallbackCampaign._id,
        { 
          $inc: { 'metrics.totalConversations': 1 },
          'metrics.lastUsed': new Date()
        }
      );

      console.log('[CAMPAIGN ASSIGN] Fallback campaign assigned', { 
        campaignId: fallbackCampaign._id, 
        businessType 
      });
      
      return fallbackCampaign;
    }

    console.log('[CAMPAIGN ASSIGN] No campaign found', { businessType, region });
    return null;

  } catch (error) {
    console.error('[CAMPAIGN ASSIGN ERROR]', error.message);
    return null;
  }
}

// Get campaign script for conversation
async function getCampaignScript(conversation) {
  try {
    if (!conversation) {
      return null;
    }

    // Try to get campaign from conversation
    let campaign = null;
    
    if (conversation.campaignId) {
      campaign = await Campaign.findById(conversation.campaignId);
    }

    // If no campaign or inactive, try to assign one
    if (!campaign || !campaign.active) {
      campaign = await assignCampaign(conversation);
    }

    if (!campaign) {
      console.log('[CAMPAIGN SCRIPT] No campaign available');
      return null;
    }

    const script = {
      variant: campaign.scriptVariant,
      customScript: campaign.settings?.customScript,
      campaignName: campaign.name,
      segment: campaign.segment,
      region: campaign.region
    };

    console.log('[CAMPAIGN SCRIPT] Retrieved', { 
      campaignId: campaign._id, 
      variant: script.variant 
    });

    return script;

  } catch (error) {
    console.error('[CAMPAIGN SCRIPT ERROR]', error.message);
    return null;
  }
}

// Create default campaigns if none exist
async function createDefaultCampaigns() {
  try {
    const existingCampaigns = await Campaign.countDocuments();
    if (existingCampaigns > 0) {
      console.log('[CAMPAIGN DEFAULT] Campaigns already exist');
      return;
    }

    const defaultCampaigns = [
      {
        name: 'National Barber Campaign',
        segment: 'barber',
        region: 'national',
        scriptVariant: 'direct',
        description: 'Default campaign for barber shops nationwide'
      },
      {
        name: 'National Restaurant Campaign',
        segment: 'restaurant',
        region: 'national',
        scriptVariant: 'soft',
        description: 'Default campaign for restaurants nationwide'
      },
      {
        name: 'National Retail Campaign',
        segment: 'retail',
        region: 'national',
        scriptVariant: 'urgency',
        description: 'Default campaign for retail stores nationwide'
      },
      {
        name: 'General Business Campaign',
        segment: 'other',
        region: 'national',
        scriptVariant: 'direct',
        description: 'Default campaign for all other businesses'
      }
    ];

    await Campaign.insertMany(defaultCampaigns);
    console.log('[CAMPAIGN DEFAULT] Default campaigns created');

  } catch (error) {
    console.error('[CAMPAIGN DEFAULT ERROR]', error.message);
  }
}

// Get campaign statistics
async function getCampaignStats() {
  try {
    const stats = await Campaign.aggregate([
      {
        $match: { active: true }
      },
      {
        $group: {
          _id: '$segment',
          totalCampaigns: { $sum: 1 },
          totalConversations: { $sum: '$metrics.totalConversations' },
          totalConversions: { $sum: '$metrics.conversions' }
        }
      },
      {
        $project: {
          segment: '$_id',
          totalCampaigns: 1,
          totalConversations: 1,
          totalConversions: 1,
          conversionRate: {
            $cond: {
              if: { $gt: ['$totalConversations', 0] },
              then: { $multiply: [{ $divide: ['$totalConversions', '$totalConversations'] }, 100] },
              else: 0
            }
          },
          _id: 0
        }
      }
    ]);

    return stats;

  } catch (error) {
    console.error('[CAMPAIGN STATS ERROR]', error.message);
    return [];
  }
}

module.exports = {
  assignCampaign,
  getCampaignScript,
  createDefaultCampaigns,
  getCampaignStats
};
