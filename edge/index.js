// edge/index.js
// Entry point: initialize libsodium, fetch backend public key, then run one
// virtual gateway that reads five virtual room sensors.
//
// Demo flow: register -> wait for admin approval -> send data -> record hash.

'use strict';

const sodium = require('libsodium-wrappers');
const config = require('./config');
const eccClient = require('./eccClient');
const Device = require('./device');

async function main() {
  await sodium.ready;
  console.log('[OK] libsodium ready');

  await eccClient.fetchPublicKey(config.backendUrl);

  const gateway = new Device(config.device);
  await gateway.init();

  const currentStatus = await gateway.contract.getDeviceStatus(gateway.address);
  if (Number(currentStatus) !== 2) {
    console.log('\nOpen frontend -> Devices -> Approve this gateway');
    console.log(`Gateway address: ${gateway.address}\n`);
    await gateway.waitForApproval();
  } else {
    console.log(`[OK] [${gateway.name}] Already APPROVED. Starting loops immediately...\n`);
  }

  console.log(`[START] Gateway (${gateway.address}) starting data loops...`);
  console.log(`Reading 5 sensors every ${config.readingInterval / 1000}s`);
  console.log(`Batch hash every ${config.batchInterval / 1000}s\n`);

  gateway.startPollingLoop();
  gateway.startBatchLoop();
}

main().catch(err => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
