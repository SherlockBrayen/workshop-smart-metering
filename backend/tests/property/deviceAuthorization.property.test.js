/**
 * Property Test: Device Authorization
 *
 * Verifikasi bahwa Backend menolak data (HTTP 403) dari device yang statusnya
 * bukan APPROVED, dan menerima (HTTP 201) dari device APPROVED.
 *
 * **Validates: Requirements 3.3, 3.4**
 */

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');
const supertest = require('supertest');
const express = require('express');
const cors = require('cors');

// ---------------------------------------------------------------------------
// Require real modules so we can patch their exports in-place
// ---------------------------------------------------------------------------
const eccService = require('../../src/services/eccService');
const blockchainService = require('../../src/services/blockchainService');
const EnergyReading = require('../../src/models/EnergyReading');

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

// Random valid Ethereum address: 0x + 40 hex chars
const deviceAddressArb = hexStringArb(40).map(h => '0x' + h);

// Random room number (1-5)
const roomArb = fc.integer({ min: 1, max: 5 });

// Random energy values
const energyArb = fc.float({ min: Math.fround(0.001), max: Math.fround(10000), noNaN: true });
const energyDeltaArb = fc.float({ min: Math.fround(0.0001), max: Math.fround(1), noNaN: true });
const voltageArb = fc.float({ min: Math.fround(218), max: Math.fround(222), noNaN: true });
const currentArb = fc.float({ min: Math.fround(0.1), max: Math.fround(10), noNaN: true });
const powerArb = fc.float({ min: Math.fround(50), max: Math.fround(2000), noNaN: true });
const frequencyArb = fc.float({ min: Math.fround(49.8), max: Math.fround(50.2), noNaN: true });
const powerFactorArb = fc.float({ min: Math.fround(0.85), max: Math.fround(0.95), noNaN: true });

// BatchId: 0x + 64 hex chars
const batchIdArb = hexStringArb(64).map(h => '0x' + h);

// Valid reading data (what decrypt would return as JSON)
const readingDataArb = fc.record({
  batchId: batchIdArb,
  room: roomArb,
  energy: energyArb,
  energyDelta: energyDeltaArb,
  voltage: voltageArb,
  current: currentArb,
  power: powerArb,
  frequency: frequencyArb,
  powerFactor: powerFactorArb,
  measuredAt: fc.integer({ min: 1704067200000, max: 1798761600000 }).map(ts => new Date(ts).toISOString()),
  hourWindowStart: fc.integer({ min: 1700000000, max: 1800000000 }),
  sequenceInBatch: fc.nat({ max: 59 }),
});

// Non-approved device statuses
const nonApprovedStatusArb = fc.constantFrom('UNREGISTERED', 'PENDING', 'REJECTED');

// ---------------------------------------------------------------------------
// Test Setup — Build minimal Express app with mocked services
// ---------------------------------------------------------------------------

describe('Property 2: Device Authorization', () => {
  let request;

  // Store originals for restore
  const originalDecrypt = eccService.decrypt;
  const originalGetDeviceStatus = blockchainService.getDeviceStatus;
  const originalCreate = EnergyReading.create.bind(EnergyReading);

  before(() => {
    // Patch eccService.init to no-op (prevent key loading)
    eccService.init = async () => {};

    // Patch blockchainService.init to no-op (prevent provider creation)
    blockchainService.init = () => {};

    // Build a minimal Express app that mirrors the real app routing
    const app = express();
    app.use(cors());
    app.use(express.json());
    app.use('/api', require('../../src/routes/data'));

    request = supertest(app);
  });

  after(() => {
    // Restore originals
    eccService.decrypt = originalDecrypt;
    blockchainService.getDeviceStatus = originalGetDeviceStatus;
    EnergyReading.create = originalCreate;
  });

  // **Validates: Requirements 3.3, 3.4**
  it('rejects data (HTTP 403) from devices with non-APPROVED status', async () => {
    await fc.assert(
      fc.asyncProperty(
        deviceAddressArb,
        readingDataArb,
        nonApprovedStatusArb,
        async (deviceAddress, readingData, status) => {
          // Mock eccService.decrypt to return valid plaintext JSON
          eccService.decrypt = async () => JSON.stringify(readingData);

          // Mock blockchainService.getDeviceStatus to return non-APPROVED status
          blockchainService.getDeviceStatus = async () => status;

          // Mock EnergyReading.create — should NOT be called
          let createCalled = false;
          EnergyReading.create = async () => {
            createCalled = true;
            return { _id: 'mock-id-123' };
          };

          const res = await request
            .post('/api/readings')
            .send({
              deviceAddress,
              ciphertext: 'bW9ja2VkLWNpcGhlcnRleHQ=', // base64 dummy
            });

          // Must return 403 for non-APPROVED
          assert.strictEqual(res.status, 403,
            `Expected 403 for status "${status}" but got ${res.status}`);

          // EnergyReading.create must NOT have been called
          assert.strictEqual(createCalled, false,
            `EnergyReading.create should not be called for status "${status}"`);
        }
      ),
      { numRuns: 50 }
    );
  });

  // **Validates: Requirements 3.3, 3.4**
  it('accepts data (HTTP 201) from devices with APPROVED status', async () => {
    await fc.assert(
      fc.asyncProperty(
        deviceAddressArb,
        readingDataArb,
        async (deviceAddress, readingData) => {
          // Mock eccService.decrypt to return valid plaintext JSON
          eccService.decrypt = async () => JSON.stringify(readingData);

          // Mock blockchainService.getDeviceStatus to return APPROVED
          blockchainService.getDeviceStatus = async () => 'APPROVED';

          // Mock EnergyReading.create to return a mock document
          EnergyReading.create = async (data) => ({
            _id: 'mock-id-' + Math.random().toString(36).slice(2),
            ...data,
          });

          const res = await request
            .post('/api/readings')
            .send({
              deviceAddress,
              ciphertext: 'bW9ja2VkLWNpcGhlcnRleHQ=', // base64 dummy
            });

          // Must return 201 for APPROVED device
          assert.strictEqual(res.status, 201,
            `Expected 201 for APPROVED device but got ${res.status}`);

          // Response must include an id field
          assert.ok(res.body.id, 'Response should contain an id field');
        }
      ),
      { numRuns: 50 }
    );
  });

  // **Validates: Requirements 3.3, 3.4**
  it('authorization decision depends ONLY on blockchain status, not on reading data content', async () => {
    await fc.assert(
      fc.asyncProperty(
        deviceAddressArb,
        readingDataArb,
        readingDataArb,
        nonApprovedStatusArb,
        async (deviceAddress, readingData1, readingData2, status) => {
          // Same device, same status, different reading data → same HTTP response
          eccService.decrypt = async () => JSON.stringify(readingData1);
          blockchainService.getDeviceStatus = async () => status;
          EnergyReading.create = async () => ({ _id: 'mock-id' });

          const res1 = await request
            .post('/api/readings')
            .send({ deviceAddress, ciphertext: 'Y2lwaGVyMQ==' });

          eccService.decrypt = async () => JSON.stringify(readingData2);

          const res2 = await request
            .post('/api/readings')
            .send({ deviceAddress, ciphertext: 'Y2lwaGVyMg==' });

          // Both should get same status code (403 for non-APPROVED)
          assert.strictEqual(res1.status, res2.status,
            `Same device status "${status}" should yield same HTTP code regardless of reading data`);
          assert.strictEqual(res1.status, 403);
        }
      ),
      { numRuns: 30 }
    );
  });
});
