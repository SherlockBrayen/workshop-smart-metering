/**
 * routes/auth.js — Authentication-related routes.
 *
 * Endpoints:
 *   GET /api/auth/public-key — Return Backend ECC public key (Base64)
 *
 * Requirements: 3.11
 */

'use strict';

const router = require('express').Router();
const eccService = require('../services/eccService');

// GET /api/auth/public-key
router.get('/public-key', async (req, res) => {
  try {
    const publicKey = await eccService.getPublicKey();
    res.json({ publicKey });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
