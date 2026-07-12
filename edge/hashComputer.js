// edge/hashComputer.js
// Modul untuk menghitung batchId (keccak256) dan hash SHA-256 deterministik
// Requirements: 2.9, 2.10

'use strict';

const crypto = require('crypto');
const { ethers } = require('ethers');

/**
 * Serialisasi objek secara deterministik (rekursif):
 * - Kunci diurutkan leksikografis di semua level
 * - Tidak ada spasi setelah `:` atau `,`
 * - Array dipertahankan urutannya, elemen objek di dalamnya juga diurutkan
 *
 * Harus identik dengan backend hashAuditor.serializeDeterministic()
 *
 * @param {*} obj
 * @returns {string} JSON string deterministik
 */
function serializeDeterministic(obj) {
  if (obj === null || obj === undefined) {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    const items = obj.map((item) => serializeDeterministic(item));
    return '[' + items.join(',') + ']';
  }

  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const sortedKeys = Object.keys(obj).sort();
    const pairs = sortedKeys.map((key) => {
      const keyStr = JSON.stringify(key);
      const valStr = serializeDeterministic(obj[key]);
      return keyStr + ':' + valStr;
    });
    return '{' + pairs.join(',') + '}';
  }

  // Primitives: number, string, boolean
  return JSON.stringify(obj);
}

/**
 * Hitung batchId dari deviceAddress dan windowStart.
 * batchId = keccak256(abi.encodePacked(address, uint256))
 *
 * @param {string} deviceAddress - Ethereum address (0x + 40 hex)
 * @param {number} windowStart - Unix timestamp awal window batch audit
 * @returns {string} bytes32 hex string (0x + 64 hex chars)
 */
function computeBatchId(deviceAddress, windowStart) {
  return ethers.keccak256(
    ethers.solidityPacked(
      ['address', 'uint256'],
      [deviceAddress, windowStart]
    )
  );
}

/**
 * Hitung SHA-256 dari array readings secara deterministik.
 * Kunci JSON diurutkan leksikografis, tanpa spasi.
 *
 * @param {Array<object>} readings - array objek reading
 * @returns {string} hash hex string (0x + 64 hex chars) — bytes32 untuk Solidity
 */
function computeHash(readings) {
  const serialized = serializeDeterministic(readings);
  const hashHex = crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');
  return '0x' + hashHex;
}

/**
 * Dapatkan hourWindowStart: pembulatan ke jam penuh UTC (floor).
 *
 * @returns {number} Unix timestamp (seconds) yang habis dibagi 3600
 */
function getCurrentHourWindowStart() {
  const now = Math.floor(Date.now() / 1000);
  return now - (now % 3600);
}

/**
 * Dapatkan awal window batch audit berdasarkan interval runtime.
 * Default workshop: 120 detik, sehingga setiap batch 2 menit punya batchId unik.
 *
 * @param {number} batchIntervalMs - Interval batch dalam milidetik
 * @param {number} nowMs - Timestamp saat ini dalam milidetik
 * @returns {number} Unix timestamp awal window batch
 */
function getCurrentBatchWindowStart(batchIntervalMs = 120000, nowMs = Date.now()) {
  const intervalSeconds = Math.max(1, Math.floor(batchIntervalMs / 1000));
  const now = Math.floor(nowMs / 1000);
  return now - (now % intervalSeconds);
}

module.exports = {
  computeBatchId,
  computeHash,
  getCurrentBatchWindowStart,
  getCurrentHourWindowStart,
  serializeDeterministic,
};
