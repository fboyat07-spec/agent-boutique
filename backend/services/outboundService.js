const Lead = require('../models/Lead');
const Conversation = require('../models/Conversation');
const { assignCampaign } = require('./campaignService');

// Rate limiting safety
const MAX_MESSAGES_PER_MINUTE = 20;
let messagesSentThisMinute = 0;
let lastMinuteReset = Date.now();

// Track rate limiting
function checkRateLimit() {
  const now = Date.now();
  const currentMinute = Math.floor(now / 60000);
  const lastMinute = Math.floor(lastMinuteReset / 60000);
  
  // Reset counter if new minute
  if (currentMinute !== lastMinute) {
    messagesSentThisMinute = 0;
    lastMinuteReset = now;
  }
  
  if (messagesSentThisMinute >= MAX_MESSAGES_PER_MINUTE) {
    console.log('[RATE LIMIT HIT]', { 
      messagesSent: messagesSentThisMinute,
      limit: MAX_MESSAGES_PER_MINUTE 
    });
    return false;
  }
  
  return true;
}

// Random delay between messages (1-2 seconds)
function randomDelay() {
  return new Promise(resolve => {
    const delay = 1000 + Math.random() * 1000; // 1000-2000ms
    setTimeout(resolve, delay);
  });
}

// Process single lead
async function processLead(lead) {
  try {
    console.log('[LEAD PROCESSING]', { 
      leadId: lead._id, 
      phone: lead.phone,
      businessType: lead.businessType 
    });
    
    // Check if conversation already exists
    const existingConversation = await Conversation.findOne({ phone: lead.phone });
    if (existingConversation) {
      console.log('[LEAD SKIPPED] Conversation already exists', { 
        leadId: lead._id,
        existingConversationId: existingConversation._id
      });
      
      // Update lead status to contacted (since conversation exists)
      await Lead.findByIdAndUpdate(lead._id, {
        status: 'contacted',
        lastContactedAt: new Date()
      });
      
      return { success: true, skipped: true, reason: 'conversation_exists' };
    }
    
    // Create new conversation using existing logic
    const conversationData = {
      phone: lead.phone,
      businessType: lead.businessType || 'other',
      region: lead.region || 'national',
      stage: 'new',
      metadata: {
        source: 'outbound',
        leadId: lead._id,
        tags: ['outbound', lead.source]
      }
    };
    
    const conversation = new Conversation(conversationData);
    await conversation.save();
    
    // Assign campaign (non-blocking)
    assignCampaign(conversation).catch(error => {
      console.error('[OUTBOUND] Campaign assignment failed:', error.message);
    });
    
    // Update lead status
    await Lead.findByIdAndUpdate(lead._id, {
      status: 'contacted',
      lastContactedAt: new Date()
    });
    
    // Increment rate limit counter
    messagesSentThisMinute++;
    
    console.log('[LEAD CONTACTED]', { 
      leadId: lead._id,
      conversationId: conversation._id,
      phone: lead.phone
    });
    
    return { 
      success: true, 
      conversationId: conversation._id,
      phone: lead.phone 
    };
    
  } catch (error) {
    console.error('[OUTBOUND ERROR]', { 
      leadId: lead._id,
      error: error.message 
    });
    
    // Update lead status to failed
    await Lead.findByIdAndUpdate(lead._id, {
      status: 'failed',
      lastContactedAt: new Date()
    });
    
    return { success: false, error: error.message };
  }
}

// Main outbound batch processing
async function processOutboundBatch(limit = 20) {
  try {
    console.log('[OUTBOUND START]', { limit });
    
    const results = {
      processed: 0,
      contacted: 0,
      failed: 0,
      skipped: 0,
      rateLimited: false
    };
    
    // Fetch leads to process
    const leads = await Lead.find({ 
      status: 'new' 
    })
    .limit(limit)
    .sort({ createdAt: 1 }); // Process oldest first
    
    if (leads.length === 0) {
      console.log('[OUTBOUND COMPLETE] No new leads to process');
      return results;
    }
    
    console.log('[OUTBOUND] Processing leads', { 
      totalLeads: leads.length,
      limit 
    });
    
    for (const lead of leads) {
      // Check rate limit before processing each lead
      if (!checkRateLimit()) {
        results.rateLimited = true;
        console.log('[OUTBOUND] Rate limit reached, stopping batch');
        break;
      }
      
      const result = await processLead(lead);
      results.processed++;
      
      if (result.success) {
        if (result.skipped) {
          results.skipped++;
        } else {
          results.contacted++;
        }
      } else {
        results.failed++;
      }
      
      // Add delay between messages (except for last one)
      if (results.processed < leads.length && !results.rateLimited) {
        await randomDelay();
      }
    }
    
    console.log('[OUTBOUND COMPLETE]', results);
    return results;
    
  } catch (error) {
    console.error('[OUTBOUND BATCH ERROR]', error.message);
    throw error;
  }
}

// Get outbound statistics
async function getOutboundStats() {
  try {
    const stats = await Lead.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          status: '$_id',
          count: '$count',
          _id: 0
        }
      }
    ]);
    
    const totalLeads = await Lead.countDocuments();
    const contactedToday = await Lead.countDocuments({
      status: 'contacted',
      lastContactedAt: { 
        $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) 
      }
    });
    
    return {
      totalLeads,
      contactedToday,
      statusBreakdown: stats,
      currentRateLimit: {
        messagesSent: messagesSentThisMinute,
        limit: MAX_MESSAGES_PER_MINUTE,
        resetIn: 60000 - (Date.now() % 60000)
      }
    };
    
  } catch (error) {
    console.error('[OUTBOUND STATS ERROR]', error.message);
    return null;
  }
}

// Create sample leads for testing
async function createSampleLeads() {
  try {
    const sampleLeads = [
      {
        phone: '+33612345678',
        name: 'Sample Barber 1',
        businessType: 'barber',
        region: 'paris',
        source: 'manual'
      },
      {
        phone: '+33687654321',
        name: 'Sample Restaurant 1',
        businessType: 'restaurant',
        region: 'lyon',
        source: 'manual'
      },
      {
        phone: '+33611223344',
        name: 'Sample Retail 1',
        businessType: 'retail',
        region: 'marseille',
        source: 'manual'
      }
    ];
    
    for (const leadData of sampleLeads) {
      const existingLead = await Lead.findOne({ phone: leadData.phone });
      if (!existingLead) {
        const lead = new Lead(leadData);
        await lead.save();
        console.log('[SAMPLE LEAD CREATED]', { phone: leadData.phone });
      }
    }
    
    console.log('[SAMPLE LEADS] Sample leads created successfully');
    
  } catch (error) {
    console.error('[SAMPLE LEADS ERROR]', error.message);
  }
}

module.exports = {
  processOutboundBatch,
  getOutboundStats,
  createSampleLeads,
  checkRateLimit
};
