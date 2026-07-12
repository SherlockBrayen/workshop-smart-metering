/**
 * Property Test: Hash Determinism
 *
 * Verifikasi bahwa serialisasi deterministik menghasilkan hash identik
 * untuk data yang sama terlepas dari urutan insert.
 *
 * **Validates: Requirements 2.9, 3.9, 8.3**
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');
const { serializeDeterministic, computeHash, sortedStringify } = require('../../src/services/hashAuditor');

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

// Helper: generate hex string of fixed length from array of hex digits
const hexChars = '0123456789abcdef';
function hexStringArb(length) {
  return fc.array(
    fc.integer({ min: 0, max: 15 }),
    { minLength: length, maxLength: length }
  ).map(arr => arr.map(n => hexChars[n]).join(''));
}

// Device address: 0x + 40 hex chars
const deviceAddressArb = hexStringArb(40).map(h => '0x' + h);

// Batch ID: 0x + 64 hex chars
const batchIdArb = hexStringArb(64).map(h => '0x' + h);

// Single reading with all required fields matching HASH_FIELDS
const readingArb = fc.record({
  batchId: batchIdArb,
  current: fc.float({ min: Math.fround(0), max: Math.fround(10), noNaN: true }),
  deviceAddress: deviceAddressArb,
  energy: fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true }),
  energyDelta: fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
  frequency: fc.float({ min: Math.fround(49), max: Math.fround(51), noNaN: true }),
  hourWindowStart: fc.integer({ min: 1700000000, max: 1800000000 }),
  measuredAt: fc.integer({ min: 1704067200000, max: 1735689600000 }).map(ts => new Date(ts).toISOString()),
  power: fc.float({ min: Math.fround(0), max: Math.fround(2000), noNaN: true }),
  powerFactor: fc.float({ min: Math.fround(0.8), max: Math.fround(1), noNaN: true }),
  room: fc.integer({ min: 1, max: 5 }),
  sequenceInBatch: fc.nat({ max: 59 }),
  voltage: fc.float({ min: Math.fround(200), max: Math.fround(240), noNaN: true }),
});

// Array of readings with unique sequenceInBatch values
const readingsArb = fc.array(readingArb, { minLength: 1, maxLength: 20 })
  .map(readings => readings.map((r, i) => ({ ...r, sequenceInBatch: i })));

// ---------------------------------------------------------------------------
// Property 1: Hash Determinism
// ---------------------------------------------------------------------------

describe('Property 1: Hash Determinism', () => {
  // **Validates: Requirements 2.9, 3.9, 8.3**
  it('produces identical hash regardless of input array order (sorted by sequenceInBatch)', () => {
    fc.assert(
      fc.property(readingsArb, (readings) => {
        // Shuffle the array using Fisher-Yates
        const shuffled = [...readings];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        // Sort both by sequenceInBatch (as the real verifyBatch code does)
        const sorted1 = [...readings].sort((a, b) => a.sequenceInBatch - b.sequenceInBatch);
        const sorted2 = [...shuffled].sort((a, b) => a.sequenceInBatch - b.sequenceInBatch);

        // Compute hashes — must be identical
        const hash1 = computeHash(serializeDeterministic(sorted1));
        const hash2 = computeHash(serializeDeterministic(sorted2));

        assert.strictEqual(hash1, hash2);
      }),
      { numRuns: 100 }
    );
  });

  // **Validates: Requirements 2.9, 3.9, 8.3**
  it('produces identical hash regardless of key order in input objects (sortedStringify handles this)', () => {
    fc.assert(
      fc.property(readingArb, (reading) => {
        // Create two objects with same data but different key insertion order
        const keys = Object.keys(reading);
        const reversedKeys = [...keys].reverse();
        const reversed = {};
        for (const k of reversedKeys) reversed[k] = reading[k];

        const hash1 = computeHash(serializeDeterministic([reading]));
        const hash2 = computeHash(serializeDeterministic([reversed]));

        assert.strictEqual(hash1, hash2);
      }),
      { numRuns: 100 }
    );
  });

  // **Validates: Requirements 2.9, 3.9, 8.3**
  it('hash is stable across multiple computations (same data → same hash every time)', () => {
    fc.assert(
      fc.property(readingsArb, (readings) => {
        const sorted = [...readings].sort((a, b) => a.sequenceInBatch - b.sequenceInBatch);

        // Compute hash 5 times — must always be identical
        const hashes = [];
        for (let i = 0; i < 5; i++) {
          hashes.push(computeHash(serializeDeterministic(sorted)));
        }

        // All hashes must be equal to the first
        for (let i = 1; i < hashes.length; i++) {
          assert.strictEqual(hashes[0], hashes[i]);
        }
      }),
      { numRuns: 100 }
    );
  });

  // **Validates: Requirements 2.9, 3.9, 8.3**
  it('sortedStringify produces identical output for objects with shuffled keys', () => {
    fc.assert(
      fc.property(readingArb, (reading) => {
        // Shuffle keys randomly
        const keys = Object.keys(reading);
        const shuffledKeys = [...keys].sort(() => Math.random() - 0.5);
        const shuffled = {};
        for (const k of shuffledKeys) shuffled[k] = reading[k];

        const s1 = sortedStringify(reading);
        const s2 = sortedStringify(shuffled);

        assert.strictEqual(s1, s2);
      }),
      { numRuns: 100 }
    );
  });
});
