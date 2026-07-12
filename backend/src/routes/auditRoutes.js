/**
 * routes/auditRoutes.js - Audit verification routes.
 *
 * Endpoints:
 *   GET /api/audit/batches - List batches already recorded on-chain
 *   GET /api/audit/verify/:batchId - Verify batch integrity (on-chain vs off-chain hash)
 *
 * Requirements: 3.8, 3.9, 3.10
 */

'use strict';

const router = require('express').Router();
const { validateBatchId } = require('../middleware/validation');
const { handleVerify, handleListBatches } = require('../controllers/auditController');

// GET /api/audit/batches
router.get('/batches', handleListBatches);

// GET /api/audit/verify/:batchId
router.get('/verify/:batchId', validateBatchId, handleVerify);

module.exports = router;
