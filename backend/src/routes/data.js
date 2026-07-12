/**
 * routes/data.js — Data reading routes.
 *
 * Endpoints:
 *   POST /api/readings — Receive encrypted energy reading from Edge Simulator
 *   GET  /api/readings — Retrieve stored readings with optional filters
 *
 * Requirements: 3.1, 3.6
 */

'use strict';

const router = require('express').Router();
const { validateDeviceAddress } = require('../middleware/validation');
const { handlePostReading, handleGetReadings } = require('../controllers/dataController');

// POST /api/readings — validate device address then process
router.post('/readings', validateDeviceAddress, handlePostReading);

// GET /api/readings — query readings (optional: ?limit=N&room=N)
router.get('/readings', handleGetReadings);

module.exports = router;
