/**
 * controllers/auditController.js
 *
 * Handles:
 *   - handleVerify: verify batch integrity (recompute hash vs on-chain)
 *   - handleListBatches: list batches that already have HashRecorded events
 *
 * Delegates verification logic to services/hashAuditor.js
 *
 * Requirements: 3.8, 3.9, 3.10
 */

'use strict';

const hashAuditor = require('../services/hashAuditor');
const blockchainService = require('../services/blockchainService');
const logger = require('../utils/logger');

/**
 * GET /api/audit/verify/:batchId
 *
 * Delegates to hashAuditor.verifyBatch() which:
 *   1. Finds readings by batchId, sorted by sequenceInBatch
 *   2. Serializes deterministically
 *   3. Computes SHA-256
 *   4. Gets on-chain hash
 *   5. Compares and returns result
 */
async function handleVerify(req, res) {
  const { batchId } = req.params;

  try {
    const result = await hashAuditor.verifyBatch(batchId);
    return res.json(result);
  } catch (err) {
    if (err.statusCode === 404) {
      return res.status(404).json({ error: err.message });
    }
    logger.error(`Audit verify failed: ${err.message}`);
    return res.status(502).json({ error: 'Verification failed' });
  }
}

/**
 * GET /api/audit/batches
 *
 * Returns batch IDs that are already recorded on-chain via HashRecorded.
 */
async function handleListBatches(req, res) {
  try {
    const batches = await blockchainService.getRecordedBatches();
    return res.json(batches);
  } catch (err) {
    logger.error(`Audit batch list failed: ${err.message}`);
    return res.status(502).json({ error: 'Failed to fetch recorded batches' });
  }
}

module.exports = { handleVerify, handleListBatches };
