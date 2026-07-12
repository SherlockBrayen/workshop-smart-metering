/**
 * Property Test: Tampering Detectability
 *
 * Verifikasi bahwa modifikasi field apapun yang termasuk dalam hash computation
 * menyebabkan computedHash ≠ onChainHash (TAMPERED).
 *
 * Simulasi: batch readings di-hash → hash "on-chain" disimpan → satu field dimodifikasi
 * → re-compute hash → hash BERBEDA dari yang tersimpan.
 *
 * **Validates: Requirements 8.3, 8.4, 4.10, 4.11**
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');
const { serializeDeterministic, computeHash, HASH_FIELDS } = require('../../src/services/hashAuditor');

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

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

// Single reading with all HASH_FIELDS
const readingArb = fc.record({
  batchId: batchIdArb,
  current: fc.float({ min: Math.fround(0.1), max: Math.fround(10), noNaN: true }),
  deviceAddress: deviceAddressArb,
  energy: fc.float({ min: Math.fround(0.1), max: Math.fround(10000), noNaN: true }),
  energyDelta: fc.float({ min: Math.fround(0.001), max: Math.fround(1), noNaN: true }),
  frequency: fc.float({ min: Math.fround(49.5), max: Math.fround(50.5), noNaN: true }),
  hourWindowStart: fc.integer({ min: 1700000000, max: 1800000000 }),
  measuredAt: fc.integer({ min: 1704067200000, max: 1735689600000 }).map(ts => new Date(ts).toISOString()),
  power: fc.float({ min: Math.fround(10), max: Math.fround(2000), noNaN: true }),
  powerFactor: fc.float({ min: Math.fround(0.8), max: Math.fround(1), noNaN: true }),
  room: fc.integer({ min: 1, max: 5 }),
  sequenceInBatch: fc.nat({ max: 59 }),
  voltage: fc.float({ min: Math.fround(200), max: Math.fround(240), noNaN: true }),
});

// Array of readings (batch) with unique sequenceInBatch
const batchArb = fc.array(readingArb, { minLength: 1, maxLength: 12 })
  .map(readings => readings.map((r, i) => ({ ...r, sequenceInBatch: i })));

// ---------------------------------------------------------------------------
// Helpers: field tamper functions
// ---------------------------------------------------------------------------

/**
 * Tamper a single field value — similar to what scripts/tamper.js does.
 * For numeric fields: multiply by 3.5 (same as tamper.js)
 * For string fields: append 'X' to change the value
 */
function tamperField(field, originalValue) {
  switch (field) {
    // String fields
    case 'batchId':
      // Change last character of hex
      return originalValue.slice(0, -1) + (originalValue.endsWith('0') ? '1' : '0');
    case 'deviceAddress':
      return originalValue.slice(0, -1) + (originalValue.endsWith('0') ? '1' : '0');
    case 'measuredAt':
      // Change the timestamp slightly (add 1 second)
      const date = new Date(originalValue);
      date.setSeconds(date.getSeconds() + 1);
      return date.toISOString();

    // Numeric fields — multiply by 3.5 (like tamper.js)
    case 'energy':
    case 'energyDelta':
    case 'voltage':
    case 'current':
    case 'power':
    case 'frequency':
    case 'powerFactor':
      return originalValue * 3.5;

    // Integer fields
    case 'room':
      return originalValue + 1;
    case 'sequenceInBatch':
      return originalValue + 1;
    case 'hourWindowStart':
      return originalValue + 3600;

    default:
      return originalValue + 1;
  }
}

// ---------------------------------------------------------------------------
// Property 4: Tampering Detectability
// ---------------------------------------------------------------------------

describe('Property 4: Tampering Detectability', () => {
  // **Validates: Requirements 8.3, 8.4, 4.10, 4.11**
  it('modifying any single field in any reading produces a different hash', () => {
    fc.assert(
      fc.property(batchArb, (readings) => {
        // Step 1: Compute the "on-chain" hash from original data
        const originalSerialized = serializeDeterministic(readings);
        const onChainHash = computeHash(originalSerialized);

        // Step 2: For each field in HASH_FIELDS, tamper it in the first reading
        for (const field of HASH_FIELDS) {
          // Deep copy the readings
          const tampered = readings.map(r => ({ ...r }));

          // Tamper the field in the first reading
          const originalValue = tampered[0][field];
          const tamperedValue = tamperField(field, originalValue);

          // Only test if the value actually changed
          if (tamperedValue === originalValue) continue;

          tampered[0][field] = tamperedValue;

          // Step 3: Re-compute hash from tampered data
          const tamperedSerialized = serializeDeterministic(tampered);
          const computedHash = computeHash(tamperedSerialized);

          // Step 4: Assert TAMPERED — hashes must differ
          assert.notStrictEqual(
            computedHash,
            onChainHash,
            `Tampering field "${field}" (${originalValue} → ${tamperedValue}) should produce different hash`
          );
        }
      }),
      { numRuns: 100 }
    );
  });

  // **Validates: Requirements 8.3, 8.4, 4.10, 4.11**
  it('modifying a field in ANY reading within batch (not just first) produces different hash', () => {
    // Use batches with at least 2 readings to test non-first reading tampering
    const multiBatchArb = fc.array(readingArb, { minLength: 2, maxLength: 10 })
      .map(readings => readings.map((r, i) => ({ ...r, sequenceInBatch: i })));

    fc.assert(
      fc.property(
        multiBatchArb,
        fc.integer({ min: 0, max: 9 }),
        fc.constantFrom(...HASH_FIELDS),
        (readings, readingIdx, field) => {
          // Clamp the reading index to valid range
          const targetIdx = readingIdx % readings.length;

          // Compute original hash
          const originalSerialized = serializeDeterministic(readings);
          const onChainHash = computeHash(originalSerialized);

          // Tamper the chosen field in the chosen reading
          const tampered = readings.map(r => ({ ...r }));
          const originalValue = tampered[targetIdx][field];
          const tamperedValue = tamperField(field, originalValue);

          // Skip if tamper function didn't change the value
          if (tamperedValue === originalValue) return;

          tampered[targetIdx][field] = tamperedValue;

          // Re-compute hash
          const tamperedSerialized = serializeDeterministic(tampered);
          const computedHash = computeHash(tamperedSerialized);

          // Must be TAMPERED
          assert.notStrictEqual(
            computedHash,
            onChainHash,
            `Tampering field "${field}" at reading[${targetIdx}] should produce different hash`
          );
        }
      ),
      { numRuns: 200 }
    );
  });
});
