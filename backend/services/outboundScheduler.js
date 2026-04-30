const { processOutboundBatch } = require('./outboundService');
const Lead = require('../models/Lead');

// Scheduler state
let isRunning = false;
let schedulerInterval = null;
let runCount = 0;
let lastRunTime = null;

// Configuration from environment variables
const config = {
  enabled: process.env.OUTBOUND_ENABLED === "true",
  intervalMs: parseInt(process.env.OUTBOUND_INTERVAL_MS) || 1800000, // 30 minutes default
  batchSize: parseInt(process.env.OUTBOUND_BATCH_SIZE) || 10
};

// Check if there are leads to process
async function hasLeadsToProcess() {
  try {
    const count = await Lead.countDocuments({ status: 'new' });
    return count > 0;
  } catch (error) {
    console.error('[SCHEDULER LEAD CHECK ERROR]', error.message);
    return false;
  }
}

// Main scheduler run function
async function runScheduler() {
  // Prevent overlapping runs
  if (isRunning) {
    console.log('[SCHEDULER SKIPPED - ALREADY RUNNING]');
    return;
  }

  // Check if there are leads to process
  const hasLeads = await hasLeadsToProcess();
  if (!hasLeads) {
    console.log('[SCHEDULER SKIPPED - NO LEADS]');
    return;
  }

  isRunning = true;
  runCount++;
  lastRunTime = new Date();

  try {
    console.log('[SCHEDULER RUN]', { 
      runNumber: runCount,
      batchSize: config.batchSize,
      timestamp: lastRunTime.toISOString()
    });

    // Process outbound batch
    const results = await processOutboundBatch(config.batchSize);

    console.log('[SCHEDULER COMPLETE]', { 
      runNumber: runCount,
      results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[SCHEDULER ERROR]', { 
      runNumber: runCount,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  } finally {
    isRunning = false;
  }
}

// Start the scheduler
function startOutboundScheduler() {
  if (!config.enabled) {
    console.log('[SCHEDULER START] Disabled via OUTBOUND_ENABLED=false');
    return;
  }

  if (schedulerInterval) {
    console.log('[SCHEDULER START] Already running');
    return;
  }

  console.log('[SCHEDULER START]', {
    intervalMs: config.intervalMs,
    batchSize: config.batchSize,
    enabled: config.enabled
  });

  // Run immediately on start
  setTimeout(() => {
    runScheduler().catch(error => {
      console.error('[SCHEDULER INITIAL RUN ERROR]', error.message);
    });
  }, 5000); // Wait 5 seconds after server start

  // Set up recurring interval
  schedulerInterval = setInterval(() => {
    runScheduler().catch(error => {
      console.error('[SCHEDULER INTERVAL ERROR]', error.message);
    });
  }, config.intervalMs);

  console.log('[SCHEDULER STARTED]', {
    intervalMs: config.intervalMs,
    batchSize: config.batchSize,
    nextRun: new Date(Date.now() + config.intervalMs).toISOString()
  });
}

// Stop the scheduler
function stopOutboundScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    isRunning = false;
    console.log('[SCHEDULER STOPPED]');
    return true;
  }
  return false;
}

// Get scheduler status
function getSchedulerStatus() {
  return {
    enabled: config.enabled,
    isRunning,
    intervalMs: config.intervalMs,
    batchSize: config.batchSize,
    runCount,
    lastRunTime,
    nextRunTime: schedulerInterval ? new Date(Date.now() + config.intervalMs).toISOString() : null
  };
}

// Update configuration
function updateSchedulerConfig(newConfig) {
  const wasEnabled = config.enabled;
  
  // Update config
  if (newConfig.enabled !== undefined) config.enabled = newConfig.enabled;
  if (newConfig.intervalMs !== undefined) config.intervalMs = newConfig.intervalMs;
  if (newConfig.batchSize !== undefined) config.batchSize = newConfig.batchSize;

  // Restart scheduler if it was running and configuration changed
  if (schedulerInterval && (wasEnabled !== config.enabled || newConfig.intervalMs !== undefined)) {
    stopOutboundScheduler();
    if (config.enabled) {
      startOutboundScheduler();
    }
  }

  console.log('[SCHEDULER CONFIG UPDATED]', config);
  return config;
}

// Manual trigger for testing
async function triggerSchedulerRun() {
  return await runScheduler();
}

module.exports = {
  startOutboundScheduler,
  stopOutboundScheduler,
  getSchedulerStatus,
  updateSchedulerConfig,
  triggerSchedulerRun,
  config
};
