// edge/device.js
// Represents one virtual gateway with one Ethereum wallet.
// The gateway generates readings for five virtual room sensors, encrypts each
// payload, posts it to the backend, and records a batch hash on-chain.

'use strict';

const { ethers } = require('ethers');
const axios = require('axios');
const config = require('./config');
const dataGenerator = require('./dataGenerator');
const eccClient = require('./eccClient');
const hashComputer = require('./hashComputer');

const CONTRACT_ABI = [
  'function registerDevice() external',
  'function getDeviceStatus(address device) external view returns (uint8)',
  'function recordHash(bytes32 batchId, bytes32 hash, uint256 hourWindowStart) external',
];

class Device {
  constructor(deviceConfig) {
    this.name = deviceConfig.name;
    this.wallet = new ethers.Wallet(
      deviceConfig.privateKey,
      new ethers.JsonRpcProvider(config.infuraUrl)
    );
    this.address = this.wallet.address;
    this.contract = new ethers.Contract(config.contractAddress, CONTRACT_ABI, this.wallet);
    this.buffer = [];
    this.sequenceCounter = 0;
    this.activeBatchWindowStart = null;
    this.activeBatchId = null;
    this.isPolling = false;
    this.isRecordingBatch = false;
    this.pollTimer = null;
    this.batchTimer = null;
  }

  beginNewBatch() {
    this.activeBatchWindowStart = hashComputer.getCurrentBatchWindowStart(config.batchInterval);
    this.activeBatchId = hashComputer.computeBatchId(this.address, this.activeBatchWindowStart);
    this.sequenceCounter = 0;
  }

  async init() {
    const status = await this.contract.getDeviceStatus(this.address);
    // DeviceStatus: 0=UNREGISTERED, 1=PENDING, 2=APPROVED, 3=REJECTED
    if (status === 0n || status === 0) {
      console.log(`[INFO] [${this.name}] Registering device: ${this.address}`);
      const tx = await this.contract.registerDevice();
      const receipt = await tx.wait();
      console.log(`[INFO] [${this.name}] Registered. txHash: ${receipt.hash}, block: ${receipt.blockNumber}`);
      console.log(`[WAIT] [${this.name}] Status: PENDING - waiting for admin approval via frontend...`);
    } else {
      const statusLabels = ['UNREGISTERED', 'PENDING', 'APPROVED', 'REJECTED'];
      console.log(`[INFO] [${this.name}] Device status: ${statusLabels[Number(status)]} (${this.address})`);
    }
  }

  async waitForApproval() {
    const CHECK_INTERVAL = 10000;
    const spinner = ['|', '/', '-', '\\'];
    let frame = 0;

    return new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        try {
          const status = await this.contract.getDeviceStatus(this.address);
          const s = Number(status);

          if (s === 2) {
            clearInterval(interval);
            console.log(`\n[OK] [${this.name}] Device APPROVED. Starting data loops...\n`);
            resolve();
          } else if (s === 3) {
            clearInterval(interval);
            console.error(`\n[ERROR] [${this.name}] Device REJECTED by admin. Exiting.`);
            reject(new Error('Device rejected by admin'));
          } else {
            process.stdout.write(
              `\r${spinner[frame]} [${this.name}] Waiting for admin approval...   `
            );
            frame = (frame + 1) % spinner.length;
          }
        } catch (err) {
          console.error(`\n[ERROR] [${this.name}] Error checking status:`, err.message);
        }
      }, CHECK_INTERVAL);
    });
  }

  async pollOnce() {
    if (this.isPolling) {
      console.warn(`[WAIT] [${this.name}] Previous polling cycle still running, skipping this tick`);
      return;
    }

    this.isPolling = true;

    try {
      if (!this.activeBatchId) {
        this.beginNewBatch();
      }

      const batchId = this.activeBatchId;
      const hourWindowStart = this.activeBatchWindowStart;

      for (const room of config.rooms) {
        const reading = dataGenerator.generate(room.id);
        reading.deviceAddress = this.address;
        reading.hourWindowStart = hourWindowStart;
        reading.sequenceInBatch = this.sequenceCounter++;
        reading.batchId = batchId;

        const ciphertext = eccClient.encrypt(reading);
        await axios.post(`${config.backendUrl}/api/readings`, {
          deviceAddress: this.address,
          ciphertext,
        });

        this.buffer.push(reading);
      }

      console.log(`[DATA] [${this.name}] 5 sensor readings sent (buffer: ${this.buffer.length})`);
    } catch (err) {
      console.error(`[ERROR] [${this.name}] Polling error:`, err.message);
    } finally {
      this.isPolling = false;
    }
  }

  startPollingLoop() {
    const run = async () => {
      await this.pollOnce();
      this.pollTimer = setTimeout(run, config.readingInterval);
    };

    this.pollTimer = setTimeout(run, config.readingInterval);
  }

  async closeBatchOnce() {
    if (this.isPolling) {
      console.log(`[WAIT] [${this.name}] Polling in progress, delaying batch close`);
      return 'deferred';
    }

    if (this.isRecordingBatch) {
      console.log(`[WAIT] [${this.name}] Previous batch transaction still running`);
      return 'deferred';
    }

    this.isRecordingBatch = true;

    try {
      if (this.buffer.length === 0) {
        console.log(`[WAIT] [${this.name}] No readings in buffer, skipping batch`);
        return 'skipped';
      }

      const batchReadings = this.buffer.map((reading) => ({ ...reading }));
      const batchId = batchReadings[0].batchId;
      const hourWindowStart = batchReadings[0].hourWindowStart;
      const sameBatch = batchReadings.every((reading) =>
        reading.batchId === batchId && reading.hourWindowStart === hourWindowStart
      );

      if (!batchId || !hourWindowStart || !sameBatch) {
        console.error(`[ERROR] [${this.name}] Batch metadata inconsistent, not recording hash`);
        return 'skipped';
      }

      const hash = hashComputer.computeHash(batchReadings);

      const status = await this.contract.getDeviceStatus(this.address);
      if (status !== 2n && status !== 2) {
        console.warn(`[WAIT] [${this.name}] Device not APPROVED yet (status: ${status}), skipping batch hash`);
        return 'skipped';
      }

      console.log(`[CHAIN] [${this.name}] Recording hash | batchId: ${batchId}`);
      console.log(`[CHAIN] [${this.name}] Batch contains ${batchReadings.length} readings from 5 sensors`);

      this.buffer = [];
      this.activeBatchWindowStart = null;
      this.activeBatchId = null;
      this.sequenceCounter = 0;

      const tx = await this.contract.recordHash(batchId, hash, hourWindowStart);
      const receipt = await tx.wait();
      console.log(`[CHAIN] [${this.name}] Hash recorded | txHash: ${receipt.hash} | block: ${receipt.blockNumber}`);
      return 'recorded';
    } catch (err) {
      console.error(`[ERROR] [${this.name}] Batch error:`, err.message);
      return 'error';
    } finally {
      this.isRecordingBatch = false;
    }
  }

  startBatchLoop() {
    const run = async () => {
      const result = await this.closeBatchOnce();
      const delay = result === 'deferred' ? 1000 : config.batchInterval;
      this.batchTimer = setTimeout(run, delay);
    };

    this.batchTimer = setTimeout(run, config.batchInterval);
  }
}

module.exports = Device;
