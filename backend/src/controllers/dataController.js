/**
 * controllers/dataController.js
 *
 * Handles:
 *   - handlePostReading: decrypt → verify on-chain status → save to MongoDB
 *   - handleGetReadings: query MongoDB with optional filters
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.12
 */

'use strict';

const eccService = require('../services/eccService');
const blockchainService = require('../services/blockchainService');
const EnergyReading = require('../models/EnergyReading');
const logger = require('../utils/logger');

/**
 * POST /api/readings
 *
 * Body: { deviceAddress, ciphertext }
 *
 * Flow:
 *   1. Decrypt ciphertext → plaintext JSON
 *   2. Check device status on-chain (must be APPROVED)
 *   3. Save reading to MongoDB
 */
async function handlePostReading(req, res) {
  const { deviceAddress, ciphertext } = req.body;

  // Step 1: Decrypt ciphertext
  let plaintext;
  try {
    plaintext = await eccService.decrypt(ciphertext);
  } catch (err) {
    logger.warn(`Decryption failed for device ${deviceAddress}: ${err.message}`);
    return res.status(400).json({ error: 'Decryption failed' });
  }

  // Step 2: Parse plaintext JSON
  let readingData;
  try {
    readingData = JSON.parse(plaintext);
  } catch (err) {
    logger.warn(`Invalid JSON in decrypted payload: ${err.message}`);
    return res.status(400).json({ error: 'Invalid payload format' });
  }

  // Step 3: Verify device status on-chain (no cache)
  let status;
  try {
    status = await blockchainService.getDeviceStatus(deviceAddress);
  } catch (err) {
    logger.error(`Blockchain query failed for ${deviceAddress}: ${err.message}`);
    return res.status(502).json({ error: 'Blockchain query failed' });
  }

  if (status !== 'APPROVED') {
    logger.warn(`Device ${deviceAddress} not authorized (status: ${status})`);
    return res.status(403).json({ error: 'Device not authorized' });
  }

  // Step 4: Save to MongoDB
  try {
    const doc = await EnergyReading.create({
      deviceAddress,
      batchId: readingData.batchId,
      room: readingData.room,
      energy: readingData.energy,
      energyDelta: readingData.energyDelta,
      voltage: readingData.voltage,
      current: readingData.current,
      power: readingData.power,
      frequency: readingData.frequency,
      powerFactor: readingData.powerFactor,
      measuredAt: readingData.measuredAt,
      hourWindowStart: readingData.hourWindowStart,
      sequenceInBatch: readingData.sequenceInBatch,
    });

    logger.info(`Reading saved: ${doc._id} (device: ${deviceAddress}, room: ${readingData.room})`);
    return res.status(201).json({ id: doc._id });
  } catch (err) {
    logger.error(`Failed to save reading: ${err.message}`);
    return res.status(500).json({ error: 'Failed to save reading' });
  }
}

/**
 * GET /api/readings
 *
 * Query params:
 *   - limit (default 50, max 200)
 *   - room (optional, filter by room number)
 */
async function handleGetReadings(req, res) {
  try {
    let limit = parseInt(req.query.limit, 10) || 50;
    if (limit > 200) limit = 200;
    if (limit < 1) limit = 1;

    const filter = {};
    if (req.query.room) {
      const room = parseInt(req.query.room, 10);
      if (!isNaN(room)) {
        filter.room = room;
      }
    }

    const readings = await EnergyReading.find(filter)
      .sort({ measuredAt: -1 })
      .limit(limit)
      .lean();

    return res.status(200).json(readings);
  } catch (err) {
    logger.error(`Failed to fetch readings: ${err.message}`);
    return res.status(500).json({ error: 'Failed to fetch readings' });
  }
}

module.exports = { handlePostReading, handleGetReadings };
