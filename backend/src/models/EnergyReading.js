/**
 * EnergyReading.js — Mongoose model for `energyReadings` collection.
 * Stores per-room sensor readings received from edge gateway (Siklus A).
 * Each reading is associated with a batch (Siklus B) for audit trail.
 *
 * Requirements: 3.5
 */

'use strict';

const mongoose = require('mongoose');

const energyReadingSchema = new mongoose.Schema({
  batchId: {
    type: String,
    required: true,
    match: /^0x[a-fA-F0-9]{64}$/,  // bytes32 keccak256 hex
  },
  deviceAddress: {
    type: String,
    required: true,
    match: /^0x[a-fA-F0-9]{40}$/,  // Ethereum address
  },
  room: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
  },
  energy: {
    type: Number,
    required: true,               // kWh total akumulasi
  },
  energyDelta: {
    type: Number,
    required: true,               // kWh interval ini
  },
  voltage: {
    type: Number,
    required: true,
  },
  current: {
    type: Number,
    required: true,
  },
  power: {
    type: Number,
    required: true,
  },
  frequency: {
    type: Number,
    required: true,
  },
  powerFactor: {
    type: Number,
    required: true,
  },
  measuredAt: {
    type: Date,
    required: true,               // ISO 8601 UTC
  },
  hourWindowStart: {
    type: Number,
    required: true,               // Unix timestamp awal window
  },
  sequenceInBatch: {
    type: Number,
    required: true,               // urutan dalam batch (0-based)
  },
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: false },
  collection: 'energyReadings',
});

// Indexes
energyReadingSchema.index({ batchId: 1 });
energyReadingSchema.index({ deviceAddress: 1, measuredAt: -1 });
energyReadingSchema.index({ room: 1, measuredAt: -1 });

const EnergyReading = mongoose.model('EnergyReading', energyReadingSchema);

module.exports = EnergyReading;
