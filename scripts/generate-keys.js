// Generate backend ECC keys for Curve25519 Sealed Box.
// Usage from workshop root: node scripts/generate-keys.js

'use strict';

const fs = require('fs');
const path = require('path');
const sodium = require(path.join(__dirname, '../backend/node_modules/libsodium-wrappers'));

async function main() {
  await sodium.ready;

  const keypair = sodium.crypto_box_keypair();
  const privateKeyB64 = Buffer.from(keypair.privateKey).toString('base64');
  const publicKeyB64 = Buffer.from(keypair.publicKey).toString('base64');

  const keysDir = path.join(__dirname, '../backend/keys');
  fs.mkdirSync(keysDir, { recursive: true });

  const privatePath = path.join(keysDir, 'ecc_private.key');
  const publicPath = path.join(keysDir, 'ecc_public.key');

  fs.writeFileSync(privatePath, privateKeyB64, 'utf8');
  fs.writeFileSync(publicPath, publicKeyB64, 'utf8');

  try {
    fs.chmodSync(privatePath, 0o600);
    fs.chmodSync(publicPath, 0o644);
  } catch {
    // chmod is a no-op on some Windows setups.
  }

  console.log('[OK] ECC keypair generated.');
  console.log('Private key file:', privatePath);
  console.log('Public key file :', publicPath);
  console.log('');
  console.log('Use these values in backend/.env:');
  console.log('ECC_PRIVATE_KEY_PATH=./keys/ecc_private.key');
  console.log('ECC_PUBLIC_KEY_PATH=./keys/ecc_public.key');
}

main().catch((err) => {
  console.error('[ERROR] Failed to generate ECC keys:', err.message);
  process.exit(1);
});
