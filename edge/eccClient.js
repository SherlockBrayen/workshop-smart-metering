/**
 * eccClient.js
 * Curve25519 Sealed Box encryption using libsodium-wrappers.
 * Fetches the backend's public key and encrypts sensor data payloads
 * before transmission.
 *
 * Console logs every step for educational transparency (workshop demo).
 *
 * Requirements: 2.6, 2.7, 9.1, 9.3
 */

'use strict';

const sodium = require('libsodium-wrappers');
const axios = require('axios');

let backendPublicKey = null; // Uint8Array (32 bytes)

/**
 * Fetch the backend's Curve25519 public key from GET /api/auth/public-key.
 * Stores the key for subsequent encrypt() calls.
 *
 * @param {string} backendUrl - Base URL of the backend (e.g. http://localhost:3000)
 * @returns {Promise<Uint8Array>} The backend public key (32 bytes)
 */
async function fetchPublicKey(backendUrl) {
  const url = `${backendUrl}/api/auth/public-key`;
  const res = await axios.get(url);

  // Backend returns { publicKey: "<base64>" }
  const publicKeyB64 = typeof res.data === 'string'
    ? res.data.trim()
    : (res.data.publicKey || res.data).toString().trim();
  backendPublicKey = Buffer.from(publicKeyB64, 'base64');

  if (backendPublicKey.length !== sodium.crypto_box_PUBLICKEYBYTES) {
    throw new Error(
      `Invalid public key length: expected ${sodium.crypto_box_PUBLICKEYBYTES} bytes, got ${backendPublicKey.length}`
    );
  }

  console.log('[ECC] Backend public key fetched:', publicKeyB64);
  return backendPublicKey;
}

/**
 * Encrypt plaintext using Curve25519 Sealed Box (crypto_box_seal).
 * Logs every step to console for educational purposes.
 *
 * @param {string|object} plaintext - Data to encrypt (string or object to JSON-serialize)
 * @returns {string} Base64-encoded ciphertext
 */
function encrypt(plaintext) {
  if (!backendPublicKey) {
    throw new Error('Public key not fetched yet. Call fetchPublicKey() first.');
  }

  const plaintextStr = typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext);

  // Log step (a): data plaintext sebelum enkripsi
  console.log('[ECC] Plaintext:', plaintextStr);

  // Log step (b): public key Backend yang digunakan
  console.log('[ECC] Public key used:', Buffer.from(backendPublicKey).toString('base64'));

  // Encrypt using Sealed Box (X25519 + XSalsa20-Poly1305)
  const plaintextBytes = sodium.from_string(plaintextStr);
  const ciphertext = sodium.crypto_box_seal(plaintextBytes, backendPublicKey);

  // Log step (c): ciphertext hex-encoded
  console.log('[ECC] Ciphertext (hex):', Buffer.from(ciphertext).toString('hex'));

  // Return Base64-encoded for HTTP transmission
  const ciphertextBase64 = Buffer.from(ciphertext).toString('base64');
  return ciphertextBase64;
}

module.exports = { fetchPublicKey, encrypt };
