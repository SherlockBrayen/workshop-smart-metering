/**
 * Property Test: BatchId Uniqueness
 *
 * Verifikasi bahwa keccak256(deviceAddress, batchWindowStart) menghasilkan
 * batchId unik untuk kombinasi device dan waktu yang berbeda.
 *
 * **Validates: Requirements 2.9, 2.10**
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');
const { computeBatchId, getCurrentBatchWindowStart } = require('../../hashComputer');

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

// Helper: generate hex string of fixed length
const hexChars = '0123456789abcdef';
function hexStringArb(length) {
  return fc.array(
    fc.integer({ min: 0, max: 15 }),
    { minLength: length, maxLength: length }
  ).map(arr => arr.map(n => hexChars[n]).join(''));
}

// Valid Ethereum address: 0x + 40 hex chars
const ethAddressArb = hexStringArb(40).map(h => '0x' + h);

// batchWindowStart: Unix timestamp divisible by 120 seconds (default workshop batch interval)
const batchWindowArb = fc.integer({ min: 0, max: 2000000000 })
  .map(n => n - (n % 120));

// ---------------------------------------------------------------------------
// Property 3: BatchId Uniqueness
// ---------------------------------------------------------------------------

describe('Property 3: BatchId Uniqueness', () => {
  // **Validates: Requirements 2.9, 2.10**
  it('same inputs always produce same batchId (determinism)', () => {
    fc.assert(
      fc.property(ethAddressArb, batchWindowArb, (addr, hw) => {
        const id1 = computeBatchId(addr, hw);
        const id2 = computeBatchId(addr, hw);
        assert.strictEqual(id1, id2);
      }),
      { numRuns: 200 }
    );
  });

  // **Validates: Requirements 2.9, 2.10**
  it('different deviceAddress with same hourWindowStart → different batchId', () => {
    fc.assert(
      fc.property(ethAddressArb, ethAddressArb, batchWindowArb, (addr1, addr2, hw) => {
        fc.pre(addr1.toLowerCase() !== addr2.toLowerCase());
        const id1 = computeBatchId(addr1, hw);
        const id2 = computeBatchId(addr2, hw);
        assert.notStrictEqual(id1, id2);
      }),
      { numRuns: 200 }
    );
  });

  // **Validates: Requirements 2.9, 2.10**
  it('same deviceAddress with different hourWindowStart → different batchId', () => {
    fc.assert(
      fc.property(ethAddressArb, batchWindowArb, batchWindowArb, (addr, hw1, hw2) => {
        fc.pre(hw1 !== hw2);
        const id1 = computeBatchId(addr, hw1);
        const id2 = computeBatchId(addr, hw2);
        assert.notStrictEqual(id1, id2);
      }),
      { numRuns: 200 }
    );
  });

  // **Validates: Requirements 2.9, 2.10**
  it('batchId format is valid bytes32 (0x + 64 hex chars)', () => {
    fc.assert(
      fc.property(ethAddressArb, batchWindowArb, (addr, hw) => {
        const id = computeBatchId(addr, hw);
        assert.match(id, /^0x[0-9a-f]{64}$/);
      }),
      { numRuns: 200 }
    );
  });

  it('adjacent 2-minute batch windows produce different batchIds in the same hour', () => {
    fc.assert(
      fc.property(ethAddressArb, batchWindowArb, (addr, windowStart) => {
        const nextWindowStart = windowStart + 120;
        const id1 = computeBatchId(addr, windowStart);
        const id2 = computeBatchId(addr, nextWindowStart);

        assert.notStrictEqual(id1, id2);
      }),
      { numRuns: 200 }
    );
  });

  it('getCurrentBatchWindowStart floors timestamps to the configured interval', () => {
    assert.strictEqual(getCurrentBatchWindowStart(120000, 1704067323456), 1704067320);
    assert.strictEqual(getCurrentBatchWindowStart(120000, 1704067319000), 1704067200);
  });
});
