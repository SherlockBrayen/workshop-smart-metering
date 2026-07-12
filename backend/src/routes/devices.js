/**
 * routes/devices.js — Device status routes.
 *
 * Endpoints:
 *   GET /api/devices — Query device statuses from Smart Contract
 *
 * If query param ?addresses=0x...,0x... is provided, queries those specific addresses.
 * Otherwise, discovers all unique device addresses from energyReadings collection
 * and queries their on-chain status.
 *
 * Requirements: 3.7, 6.2
 */

'use strict';

const router = require('express').Router();
const blockchainService = require('../services/blockchainService');
const EnergyReading = require('../models/EnergyReading');
const logger = require('../utils/logger');

// Room name mapping for known workshop devices
const ROOM_NAMES = {
  1: 'Kamar 101',
  2: 'Kamar 102',
  3: 'Kamar 103',
  4: 'Kamar 201',
  5: 'Kamar 202',
};

// GET /api/devices?addresses=0x...,0x...
router.get('/', async (req, res) => {
  try {
    const addressesParam = req.query.addresses || '';

    let addresses = [];

    if (addressesParam) {
      // Parse comma-separated addresses from query param
      addresses = addressesParam
        .split(',')
        .map(a => a.trim())
        .filter(a => /^0x[a-fA-F0-9]{40}$/.test(a));
    } else {
      // Discover via blockchain events (DeviceRegistered) — works even before any reading
      const onChainAddresses = await blockchainService.getRegisteredDevices();

      // Also check MongoDB for any addresses that might not be in events
      const dbAddresses = await EnergyReading.distinct('deviceAddress');

      // Merge and deduplicate
      const allAddresses = [...new Set([...onChainAddresses, ...dbAddresses])];
      addresses = allAddresses.filter(a => /^0x[a-fA-F0-9]{40}$/.test(a));
    }

    if (addresses.length === 0) {
      return res.json([]);
    }

    // Query status for each address on-chain
    const results = await Promise.all(
      addresses.map(async (address) => {
        try {
          const status = await blockchainService.getDeviceStatus(address);

          // Try to find room number from readings to provide a name
          let name;
          const reading = await EnergyReading.findOne({ deviceAddress: address })
            .select('room')
            .lean();
          if (reading && reading.room) {
            name = ROOM_NAMES[reading.room] || `Device ${reading.room}`;
          }

          return { address, status, name };
        } catch (err) {
          logger.warn(`Failed to query device status for ${address}: ${err.message}`);
          return { address, status: 'ERROR', error: err.message };
        }
      })
    );

    return res.json(results);
  } catch (err) {
    logger.error(`Failed to query devices: ${err.message}`);
    return res.status(500).json({ error: 'Failed to query device statuses' });
  }
});

module.exports = router;
