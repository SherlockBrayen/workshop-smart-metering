/**
 * hashAuditor.js
 * Service untuk verifikasi integritas batch energi.
 * Membandingkan hash SHA-256 yang dihitung ulang dari readings di MongoDB
 * dengan hash yang tersimpan on-chain.
 *
 * Flow:
 *   1. Query readings dari DB (sorted by sequenceInBatch)
 *   2. Clean fields (remove _id, __v, createdAt)
 *   3. Convert measuredAt Date → ISO string
 *   4. Serialize deterministik (sortedStringify — recursive, keys sorted, no spaces)
 *   5. SHA-256 hex
 *   6. Bandingkan dengan on-chain hash
 *
 * Requirements: 3.8, 3.9, 3.10, 8.3, 8.5
 */

'use strict';

const crypto = require('crypto');
const EnergyReading = require('../models/EnergyReading');
const blockchainService = require('./blockchainService');

/**
 * Recursive deterministic JSON serializer.
 * - Arrays: recursively serialize each element
 * - Objects: keys sorted lexicographically at all levels
 * - Dates: converted to ISO 8601 string
 * - No spaces in output
 *
 * @param {*} obj - Value to serialize
 * @returns {string} Deterministic JSON string
 */
function sortedStringify(obj) {
  if (Array.isArray(obj)) {
    return '[' + obj.map(item => sortedStringify(item)).join(',') + ']';
  }
  if (obj !== null && typeof obj === 'object') {
    if (obj instanceof Date) {
      return JSON.stringify(obj.toISOString());
    }
    const keys = Object.keys(obj).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + sortedStringify(obj[k])).join(',') + '}';
  }
  return JSON.stringify(obj);
}

/**
 * Fields yang di-hash (sama persis dengan yang dikirim edge gateway).
 * Tidak termasuk _id, __v, createdAt (ditambahkan oleh MongoDB/Mongoose).
 */
const HASH_FIELDS = [
  'batchId',
  'current',
  'deviceAddress',
  'energy',
  'energyDelta',
  'frequency',
  'hourWindowStart',
  'measuredAt',
  'power',
  'powerFactor',
  'room',
  'sequenceInBatch',
  'voltage',
];

const ZERO_HASH = '0x' + '0'.repeat(64);

/**
 * Clean a single reading document from MongoDB.
 * Ensures numeric precision matches what edge gateway computed during hash.
 */
function cleanReading(reading) {
  const cleaned = {};
  for (const field of HASH_FIELDS) {
    if (!(field in reading)) continue;

    let val = reading[field];

    if (field === 'measuredAt') {
      // Convert Date → ISO string (same format edge used)
      cleaned[field] = val instanceof Date ? val.toISOString() : val;
    } else if (field === 'energy') {
      // Edge: parseFloat(energy.toFixed(6)) — normalize to 6 decimal places
      cleaned[field] = typeof val === 'number' ? parseFloat(val.toFixed(6)) : val;
    } else if (field === 'energyDelta') {
      // Edge: parseFloat(energyDelta.toFixed(6))
      cleaned[field] = typeof val === 'number' ? parseFloat(val.toFixed(6)) : val;
    } else if (field === 'power') {
      // Edge: parseFloat(power.toFixed(2))
      cleaned[field] = typeof val === 'number' ? parseFloat(val.toFixed(2)) : val;
    } else if (field === 'voltage') {
      // Edge: parseFloat(voltage.toFixed(2))
      cleaned[field] = typeof val === 'number' ? parseFloat(val.toFixed(2)) : val;
    } else if (field === 'current') {
      // Edge: parseFloat(current.toFixed(3))
      cleaned[field] = typeof val === 'number' ? parseFloat(val.toFixed(3)) : val;
    } else if (field === 'frequency') {
      // Edge: parseFloat(frequency.toFixed(2))
      cleaned[field] = typeof val === 'number' ? parseFloat(val.toFixed(2)) : val;
    } else if (field === 'powerFactor') {
      // Edge: parseFloat(powerFactor.toFixed(3))
      cleaned[field] = typeof val === 'number' ? parseFloat(val.toFixed(3)) : val;
    } else {
      cleaned[field] = val;
    }
  }
  return cleaned;
}

/**
 * Serialize readings array deterministically for hash computation.
 *
 * @param {Array} readings - Array of cleaned reading objects
 * @returns {string} Deterministic JSON string (keys sorted, no spaces)
 */
function serializeDeterministic(readings) {
  const cleaned = readings.map(r => cleanReading(r));
  return sortedStringify(cleaned);
}

/**
 * Compute SHA-256 hash from serialized readings.
 *
 * @param {string} serialized - Deterministic JSON string
 * @returns {string} Hex hash (64 chars, no 0x prefix)
 */
function computeHash(serialized) {
  return crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');
}

/**
 * Verify batch integrity:
 * 1. Find readings by batchId sorted by sequenceInBatch
 * 2. Clean each reading (remove _id, __v, createdAt; convert Date)
 * 3. Serialize deterministically (sortedStringify)
 * 4. Compute SHA-256
 * 5. Get on-chain hash via blockchainService
 * 6. Compare: '0x' + computedHash === onChainHash
 */
async function verifyBatch(batchId) {
  // Step 1: Get readings sorted by sequenceInBatch
  const readings = await EnergyReading.find({ batchId })
    .sort({ sequenceInBatch: 1 })
    .lean();

  // Step 2: Validate readings exist
  if (!readings || readings.length === 0) {
    const err = new Error('Batch not found');
    err.statusCode = 404;
    throw err;
  }

  // Step 3: Clean + serialize deterministically
  const cleaned = readings.map(r => cleanReading(r));
  const serialized = sortedStringify(cleaned);

  // Step 4: Compute SHA-256
  const hashHex = computeHash(serialized);
  const computedHash = '0x' + hashHex;

  // Step 5: Get on-chain hash
  const onChainHash = await blockchainService.getHash(batchId);

  if (onChainHash.toLowerCase() === ZERO_HASH) {
    console.warn('[HashAuditor] Batch belum tercatat on-chain:', batchId);
    console.warn('[HashAuditor]   computedHash:', computedHash);
    console.warn('[HashAuditor]   readingsCount:', readings.length);

    return {
      verified: false,
      status: 'NOT_RECORDED',
      batchId,
      computedHash,
      onChainHash,
      readingsCount: readings.length,
    };
  }

  // Step 6: Compare (normalize case)
  const verified = computedHash.toLowerCase() === onChainHash.toLowerCase();

  if (!verified) {
    console.warn('[HashAuditor] Hash mismatch for batchId:', batchId);
    console.warn('[HashAuditor]   computedHash:', computedHash);
    console.warn('[HashAuditor]   onChainHash: ', onChainHash);
    console.warn('[HashAuditor]   readingsCount:', readings.length);
    console.warn('[HashAuditor]   first cleaned reading:', JSON.stringify(cleaned[0]));
    console.warn('[HashAuditor]   serialized (first 200 chars):', serialized.substring(0, 200));
  }

  return {
    verified,
    status: verified ? 'VALID' : 'TAMPERED',
    batchId,
    computedHash,
    onChainHash,
    readingsCount: readings.length,
  };
}

module.exports = {
  verifyBatch,
  serializeDeterministic,
  computeHash,
  sortedStringify,
  cleanReading,
  HASH_FIELDS,
};
