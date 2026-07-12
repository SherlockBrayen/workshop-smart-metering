/**
 * validation.js — Request validation middleware.
 *
 * Validates:
 *   - deviceAddress format (0x + 40 hex chars)
 *   - batchId format (0x + 64 hex chars)
 *
 * Requirements: 3.1, 3.8
 */

'use strict';

/**
 * Validate deviceAddress format in request body.
 * Expected: 0x followed by exactly 40 hexadecimal characters (Ethereum address).
 */
function validateDeviceAddress(req, res, next) {
  const { deviceAddress } = req.body;
  if (!deviceAddress || !/^0x[a-fA-F0-9]{40}$/.test(deviceAddress)) {
    return res.status(400).json({ error: 'Invalid deviceAddress format' });
  }
  next();
}

/**
 * Validate batchId format in route params.
 * Expected: 0x followed by exactly 64 hexadecimal characters (bytes32).
 */
function validateBatchId(req, res, next) {
  const { batchId } = req.params;
  if (!batchId || !/^0x[a-fA-F0-9]{64}$/.test(batchId)) {
    return res.status(400).json({ error: 'Invalid batchId format' });
  }
  next();
}

module.exports = { validateDeviceAddress, validateBatchId };
