/**
 * eccService.js
 * Curve25519 Sealed Box decryption using libsodium-wrappers.
 *
 * Main functions:
 *   - init()              : load private key and derive public key
 *   - decrypt(ciphertext) : decrypt sealed box ciphertext to plaintext
 *   - getPublicKey()      : return public key as Base64 string
 *
 * Console logging is intentionally verbose for workshop learning.
 */

'use strict';

const sodium = require('libsodium-wrappers');
const fs = require('fs');
const path = require('path');

let _privateKey = null;
let _publicKey = null;
let _initialized = false;

async function init() {
  if (_initialized) return;

  console.log('[ECC Service] Initializing libsodium...');
  await sodium.ready;
  console.log('[ECC Service] [OK] libsodium ready');

  const privateKeyPath = process.env.ECC_PRIVATE_KEY_PATH || './keys/ecc_private.key';
  const resolvedPath = path.resolve(privateKeyPath);

  console.log('[ECC Service] Loading private key from:', resolvedPath);

  if (!fs.existsSync(resolvedPath)) {
    console.warn('[ECC Service] [WARN] Private key file not found:', resolvedPath);
    console.warn('[ECC Service] Run this from workshop root: node scripts/generate-keys.js');
    console.warn('[ECC Service] Backend will be ready after the ECC keypair is generated.');
    _initialized = true;
    return;
  }

  const privateKeyB64 = fs.readFileSync(resolvedPath, 'utf8').trim();
  _privateKey = new Uint8Array(Buffer.from(privateKeyB64, 'base64'));

  if (_privateKey.length !== sodium.crypto_box_SECRETKEYBYTES) {
    throw new Error(
      `Invalid private key length: expected ${sodium.crypto_box_SECRETKEYBYTES} bytes, ` +
      `got ${_privateKey.length} bytes`
    );
  }

  console.log('[ECC Service] [OK] Private key loaded (32 bytes)');

  _publicKey = sodium.crypto_scalarmult_base(_privateKey);
  console.log('[ECC Service] [OK] Public key derived via crypto_scalarmult_base');
  console.log('[ECC Service] Public key (Base64):', Buffer.from(_publicKey).toString('base64'));

  _initialized = true;
  console.log('[ECC Service] [OK] Initialization complete - ready to decrypt');
}

async function decrypt(ciphertextB64) {
  if (!_initialized) {
    await init();
  }

  if (!_privateKey || !_publicKey) {
    const errMsg = 'ECC keys not loaded - run scripts/generate-keys.js from workshop root first';
    console.error('[DECRYPT] Failed:', errMsg);
    throw new Error(`Decryption failed: ${errMsg}`);
  }

  console.log('[DECRYPT] Received ciphertext:', ciphertextB64.substring(0, 40) + '...');

  let ciphertext;
  try {
    ciphertext = new Uint8Array(Buffer.from(ciphertextB64, 'base64'));
  } catch (err) {
    const errMsg = 'invalid Base64 encoding';
    console.error('[DECRYPT] Failed:', errMsg);
    throw new Error(`Decryption failed: ${errMsg}`);
  }

  console.log('[DECRYPT] Raw ciphertext bytes:', ciphertext.length);

  const minLength = sodium.crypto_box_SEALBYTES;
  if (ciphertext.length <= minLength) {
    const errMsg = `ciphertext too short (${ciphertext.length} bytes, minimum ${minLength + 1})`;
    console.error('[DECRYPT] Failed:', errMsg);
    throw new Error(`Decryption failed: ${errMsg}`);
  }

  let plaintext;
  try {
    plaintext = sodium.crypto_box_seal_open(ciphertext, _publicKey, _privateKey);
  } catch (err) {
    const errMsg = 'MAC verification failed or keys do not match';
    console.error('[DECRYPT] Failed:', errMsg);
    throw new Error(`Decryption failed: ${errMsg}`);
  }

  if (!plaintext) {
    const errMsg = 'MAC verification failed or keys do not match (returned null)';
    console.error('[DECRYPT] Failed:', errMsg);
    throw new Error(`Decryption failed: ${errMsg}`);
  }

  const plaintextStr = Buffer.from(plaintext).toString('utf8');
  const snippet = plaintextStr.length > 80 ? plaintextStr.substring(0, 80) + '...' : plaintextStr;
  console.log('[DECRYPT] Decrypted OK:', snippet);

  return plaintextStr;
}

async function getPublicKey() {
  if (!_initialized) {
    await init();
  }
  if (!_publicKey) {
    throw new Error('ECC public key not available - run scripts/generate-keys.js from workshop root first');
  }
  return Buffer.from(_publicKey).toString('base64');
}

module.exports = { init, decrypt, getPublicKey };
