const { processOutboundBatch, getOutboundStats, createSampleLeads } = require('../services/outboundService');
const { getSchedulerStatus, updateSchedulerConfig, triggerSchedulerRun } = require('../services/outboundScheduler');

// POST /outbound/start
async function startOutbound(req, res) {
  try {
    const { limit = 20 } = req.body;
    
    // Validate limit
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({
        error: 'Limit must be an integer between 1 and 100'
      });
    }
    
    console.log('[OUTBOUND CONTROLLER] Starting outbound batch', { limit });
    
    // Process outbound batch
    const results = await processOutboundBatch(limit);
    
    res.json({
      success: true,
      message: 'Outbound batch completed',
      results
    });
    
  } catch (error) {
    console.error('[OUTBOUND CONTROLLER ERROR]', error.message);
    res.status(500).json({
      error: 'Failed to process outbound batch',
      details: error.message
    });
  }
}

// GET /outbound/stats
async function getStats(req, res) {
  try {
    const stats = await getOutboundStats();
    
    if (!stats) {
      return res.status(500).json({
        error: 'Failed to retrieve outbound statistics'
      });
    }
    
    res.json({
      success: true,
      stats
    });
    
  } catch (error) {
    console.error('[OUTBOUND STATS CONTROLLER ERROR]', error.message);
    res.status(500).json({
      error: 'Failed to get outbound statistics',
      details: error.message
    });
  }
}

// POST /outbound/sample (for testing)
async function createSampleData(req, res) {
  try {
    await createSampleLeads();
    
    res.json({
      success: true,
      message: 'Sample leads created successfully'
    });
    
  } catch (error) {
    console.error('[OUTBOUND SAMPLE CONTROLLER ERROR]', error.message);
    res.status(500).json({
      error: 'Failed to create sample leads',
      details: error.message
    });
  }
}

// GET /outbound/scheduler/status
async function getSchedulerStatusEndpoint(req, res) {
  try {
    const status = getSchedulerStatus();
    
    res.json({
      success: true,
      scheduler: status
    });
    
  } catch (error) {
    console.error('[OUTBOUND SCHEDULER STATUS CONTROLLER ERROR]', error.message);
    res.status(500).json({
      error: 'Failed to get scheduler status',
      details: error.message
    });
  }
}

// POST /outbound/scheduler/config
async function updateSchedulerConfigEndpoint(req, res) {
  try {
    const { enabled, intervalMs, batchSize } = req.body;
    
    // Validate inputs
    if (enabled !== undefined && typeof enabled !== 'boolean') {
      return res.status(400).json({
        error: 'enabled must be a boolean'
      });
    }
    
    if (intervalMs !== undefined && (!Number.isInteger(intervalMs) || intervalMs < 60000)) {
      return res.status(400).json({
        error: 'intervalMs must be an integer >= 60000 (1 minute)'
      });
    }
    
    if (batchSize !== undefined && (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100)) {
      return res.status(400).json({
        error: 'batchSize must be an integer between 1 and 100'
      });
    }
    
    const newConfig = updateSchedulerConfig({ enabled, intervalMs, batchSize });
    
    res.json({
      success: true,
      message: 'Scheduler configuration updated',
      config: newConfig
    });
    
  } catch (error) {
    console.error('[OUTBOUND SCHEDULER CONFIG CONTROLLER ERROR]', error.message);
    res.status(500).json({
      error: 'Failed to update scheduler configuration',
      details: error.message
    });
  }
}

// POST /outbound/scheduler/trigger
async function triggerSchedulerEndpoint(req, res) {
  try {
    console.log('[OUTBOUND SCHEDULER] Manual trigger requested');
    
    const results = await triggerSchedulerRun();
    
    res.json({
      success: true,
      message: 'Scheduler run triggered manually',
      results
    });
    
  } catch (error) {
    console.error('[OUTBOUND SCHEDULER TRIGGER CONTROLLER ERROR]', error.message);
    res.status(500).json({
      error: 'Failed to trigger scheduler run',
      details: error.message
    });
  }
}

module.exports = {
  startOutbound,
  getStats,
  createSampleData,
  getSchedulerStatusEndpoint,
  updateSchedulerConfigEndpoint,
  triggerSchedulerEndpoint
};
