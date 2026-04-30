const express = require('express');
const router = express.Router();
const { getOverview, getStages, getTopLeads } = require('../controllers/statsController');

// GET /stats/overview
router.get('/overview', getOverview);

// GET /stats/stages
router.get('/stages', getStages);

// GET /stats/top-leads
router.get('/top-leads', getTopLeads);

module.exports = router;
