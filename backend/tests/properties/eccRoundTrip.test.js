/**
 * Property Test: ECC Round-Trip
 *
 * Verifikasi bahwa encrypt(plaintext, pubKey) → decrypt(ciphertext, privKey)
 * menghasilkan plaintext identik, dan decrypt dengan key salah gagal.
 *
 * **Validates: Requirements 9.5, 9.6, 2.6, 3.2**
 */

'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');
const sodium = require('libsodium-wrappers');

describe('Property 5: ECC Round-Trip', () => {
  before(async () => {
    await sodium.ready;
  });

  // **Validates: Requirements 9.5, 9.6, 2.6, 3.2**
  it('encrypt then decrypt returns identical plaintext (round-trip)', async () => {
    // Generate ephemeral keypair for this test
    const keypair = sodium.crypto_box_keypair();
    const publicKey = keypair.publicKey;
    const privateKey = keypair.privateKey;

    fc.assert(
      fc.property(
        // Generate random plaintext strings simulating JSON sensor data payloads
        fc.string({ minLength: 10, maxLength: 500 }).filter(s => s.length > 0),
        (plaintext) => {
          // Encrypt with Sealed Box (as edge simulator does)
          const plaintextBytes = sodium.from_string(plaintext);
          const ciphertext = sodium.crypto_box_seal(plaintextBytes, publicKey);

          // Decrypt with matching private key (as backend does)
          const decrypted = sodium.crypto_box_seal_open(ciphertext, publicKey, privateKey);
          const decryptedStr = sodium.to_string(decrypted);

          // Round-trip: decrypted must equal original plaintext
          assert.strictEqual(decryptedStr, plaintext);
        }
      ),
      { numRuns: 100 }
    );
  });

  // **Validates: Requirements 9.5, 9.6, 2.6, 3.2**
  it('decrypt with wrong private key fails', async () => {
    // Correct keypair (used for encryption)
    const correctKeypair = sodium.crypto_box_keypair();
    // Wrong keypair (used for attempted decryption)
    const wrongKeypair = sodium.crypto_box_keypair();

    fc.assert(
      fc.property(
        fc.string({ minLength: 10, maxLength: 500 }).filter(s => s.length > 0),
        (plaintext) => {
          // Encrypt with correct public key
          const plaintextBytes = sodium.from_string(plaintext);
          const ciphertext = sodium.crypto_box_seal(plaintextBytes, correctKeypair.publicKey);

          // Attempt decrypt with wrong private key — should fail
          let didFail = false;
          try {
            const result = sodium.crypto_box_seal_open(
              ciphertext,
              wrongKeypair.publicKey,
              wrongKeypair.privateKey
            );
            // Some implementations return null/false instead of throwing
            if (!result) didFail = true;
          } catch (err) {
            didFail = true;
          }

          assert.strictEqual(didFail, true, 'Decryption with wrong key should fail');
        }
      ),
      { numRuns: 50 }
    );
  });

  // **Validates: Requirements 9.5, 9.6, 2.6, 3.2**
  it('ciphertext is always longer than plaintext (MAC + ephemeral key overhead)', async () => {
    const keypair = sodium.crypto_box_keypair();

    fc.assert(
      fc.property(
        fc.string({ minLength: 10, maxLength: 500 }).filter(s => s.length > 0),
        (plaintext) => {
          const plaintextBytes = sodium.from_string(plaintext);
          const ciphertext = sodium.crypto_box_seal(plaintextBytes, keypair.publicKey);

          // Sealed Box adds exactly crypto_box_SEALBYTES (48) bytes of overhead
          // (32 bytes ephemeral public key + 16 bytes MAC)
          assert.strictEqual(
            ciphertext.length,
            plaintextBytes.length + sodium.crypto_box_SEALBYTES,
            `Ciphertext should be plaintext length + ${sodium.crypto_box_SEALBYTES} bytes overhead`
          );

          // Ciphertext is strictly longer than plaintext bytes
          assert.ok(
            ciphertext.length > plaintextBytes.length,
            'Ciphertext must always be longer than plaintext'
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});
