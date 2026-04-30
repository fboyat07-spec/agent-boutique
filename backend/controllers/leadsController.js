const Conversation = require('../models/Conversation');
const { assignCampaign } = require('../services/campaignService');

// POST /leads/import
async function importLead(req, res) {
  try {
    const { phone, businessType, region } = req.body;

    // Validate required fields
    if (!phone) {
      return res.status(400).json({ 
        error: 'Phone number is required' 
      });
    }

    // Check if conversation already exists
    const existingConversation = await Conversation.findOne({ phone });
    if (existingConversation) {
      return res.status(409).json({ 
        error: 'Conversation already exists for this phone number',
        conversationId: existingConversation._id
      });
    }

    // Create new conversation with campaign assignment
    const conversationData = {
      phone,
      businessType: businessType || 'other',
      region: region || 'national',
      stage: 'new',
      metadata: {
        source: 'import',
        tags: ['imported']
      }
    };

    const conversation = new Conversation(conversationData);
    await conversation.save();

    // Assign campaign (non-blocking)
    assignCampaign(conversation).catch(error => {
      console.error('[LEAD IMPORT] Campaign assignment failed:', error.message);
    });

    console.log('[LEAD IMPORT] Lead imported successfully', {
      conversationId: conversation._id,
      phone,
      businessType,
      region
    });

    res.status(201).json({
      success: true,
      conversationId: conversation._id,
      message: 'Lead imported successfully',
      data: {
        phone,
        businessType: conversation.businessType,
        region: conversation.region,
        stage: conversation.stage
      }
    });

  } catch (error) {
    console.error('[LEAD IMPORT ERROR]', error.message);
    res.status(500).json({ 
      error: 'Failed to import lead',
      details: error.message 
    });
  }
}

// GET /leads/import/status (for testing)
async function getImportStatus(req, res) {
  try {
    const { phone } = req.query;
    
    if (!phone) {
      return res.status(400).json({ 
        error: 'Phone number is required' 
      });
    }

    const conversation = await Conversation.findOne({ phone })
      .populate('campaignId', 'name segment region scriptVariant');

    if (!conversation) {
      return res.status(404).json({ 
        error: 'No conversation found for this phone number' 
      });
    }

    res.json({
      success: true,
      conversation: {
        id: conversation._id,
        phone: conversation.phone,
        stage: conversation.stage,
        businessType: conversation.businessType,
        region: conversation.region,
        campaign: conversation.campaignId,
        createdAt: conversation.createdAt,
        lastInteractionAt: conversation.lastInteractionAt
      }
    });

  } catch (error) {
    console.error('[LEAD STATUS ERROR]', error.message);
    res.status(500).json({ 
      error: 'Failed to get lead status',
      details: error.message 
    });
  }
}

module.exports = {
  importLead,
  getImportStatus
};
