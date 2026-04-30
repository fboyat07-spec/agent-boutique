const express = require('express');
const router = express.Router();
const { 
  startOutbound, 
  getStats, 
  createSampleData,
  getSchedulerStatusEndpoint,
  updateSchedulerConfigEndpoint,
  triggerSchedulerEndpoint
} = require('../controllers/outboundController');

// POST /outbound/start
router.post('/start', startOutbound);

// GET /outbound/stats
router.get('/stats', getStats);

// POST /outbound/sample (for testing)
router.post('/sample', createSampleData);

// Scheduler management endpoints
// GET /outbound/scheduler/status
router.get('/scheduler/status', getSchedulerStatusEndpoint);

// POST /outbound/scheduler/config
router.post('/scheduler/config', updateSchedulerConfigEndpoint);

// POST /outbound/scheduler/trigger
router.post('/scheduler/trigger', triggerSchedulerEndpoint);

module.exports = router;
