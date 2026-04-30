const express = require('express');
const router = express.Router();
const { importLead, getImportStatus } = require('../controllers/leadsController');

// POST /leads/import
router.post('/import', importLead);

// GET /leads/import/status
router.get('/import/status', getImportStatus);

module.exports = router;
