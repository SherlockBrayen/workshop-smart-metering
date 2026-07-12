/**
 * blockchainService.js
 * Read-only blockchain interaction via ethers.js v6 JsonRpcProvider (Infura).
 *
 * Fungsi utama:
 *   - init()                    : Buat provider + contract instance
 *   - getDeviceStatus(address)  : Query status perangkat on-chain
 *   - getHash(batchId)          : Query hash batch on-chain
 *   - getAdmin()                : Query alamat admin on-chain
 *   - getRecordedBatches()      : Query batch yang sudah tercatat via HashRecorded
 *
 * TANPA wallet/signer - backend hanya membaca dari blockchain.
 *
 * Requirements: 3.3, 5.1
 */

'use strict';

const { ethers } = require('ethers');
const path = require('path');

// Status enum mapping sesuai smart contract
const STATUS_NAMES = ['UNREGISTERED', 'PENDING', 'APPROVED', 'REJECTED'];
const FALLBACK_BLOCK_RANGE = 9000;

let _provider = null;   // ethers.JsonRpcProvider
let _contract = null;   // ethers.Contract (read-only, no signer)
let _initialized = false;
let _deployBlock = null;

function loadDeployment() {
  const deploymentPath = path.resolve(__dirname, '../../../contracts/deployments/sepolia.json');

  try {
    return require(deploymentPath);
  } catch (err) {
    console.warn('[Blockchain Service] Gagal load deployment file:', deploymentPath);
    console.warn('[Blockchain Service] Akan menggunakan CONTRACT_ADDRESS dari .env dan minimal ABI');
    return { address: '', abi: [] };
  }
}

/**
 * Inisialisasi Blockchain Service:
 * 1. Buat JsonRpcProvider dari INFURA_URL
 * 2. Load ABI dari contracts/deployments/sepolia.json
 * 3. Buat Contract instance (read-only)
 */
function init() {
  if (_initialized) return;

  const infuraUrl = process.env.INFURA_URL;

  // Validasi INFURA_URL (required)
  if (!infuraUrl) {
    console.error('[Blockchain Service] INFURA_URL tidak ditemukan di environment');
    console.error('[Blockchain Service] Tambahkan INFURA_URL=https://sepolia.infura.io/v3/<KEY> ke file .env');
    throw new Error('INFURA_URL environment variable is required');
  }

  _provider = new ethers.JsonRpcProvider(infuraUrl);

  const deployment = loadDeployment();
  _deployBlock = deployment.deployBlock && deployment.deployBlock > 0 ? deployment.deployBlock : null;

  // CONTRACT_ADDRESS dari env var takes precedence, fallback ke sepolia.json
  const contractAddress = process.env.CONTRACT_ADDRESS || deployment.address;

  if (!contractAddress || contractAddress === '0x0000000000000000000000000000000000000000') {
    console.error('[Blockchain Service] CONTRACT_ADDRESS tidak tersedia');
    console.error('[Blockchain Service] Set CONTRACT_ADDRESS di .env atau deploy contract terlebih dahulu');
    throw new Error('CONTRACT_ADDRESS is required (set env var or deploy contract)');
  }

  console.log('[Blockchain Service] Initializing...');
  console.log('[Blockchain Service] RPC URL:', infuraUrl.replace(/\/v3\/.+/, '/v3/***'));
  console.log('[Blockchain Service] Contract:', contractAddress);

  // Gunakan ABI dari sepolia.json jika tersedia, fallback ke minimal ABI
  let abi = deployment.abi;
  if (!abi || abi.length === 0) {
    console.warn('[Blockchain Service] ABI kosong di sepolia.json, menggunakan minimal ABI');
    abi = [
      'function getDeviceStatus(address device) external view returns (uint8)',
      'function getHash(bytes32 batchId) external view returns (bytes32)',
      'function getAdmin() external view returns (address)',
      'event DeviceRegistered(address indexed device, uint256 timestamp)',
      'event DeviceApproved(address indexed device, uint256 timestamp)',
      'event DeviceRejected(address indexed device, uint256 timestamp)',
      'event HashRecorded(address indexed device, bytes32 batchId, bytes32 hash, uint256 hourWindowStart, uint256 timestamp)',
    ];
  }

  _contract = new ethers.Contract(contractAddress, abi, _provider);

  _initialized = true;
  console.log('[Blockchain Service] Initialized - read-only mode (no signer)');
}

async function getEventFromBlock() {
  if (!_initialized) init();

  if (_deployBlock) {
    return _deployBlock;
  }

  const currentBlock = await _provider.getBlockNumber();
  const fromBlock = Math.max(0, currentBlock - FALLBACK_BLOCK_RANGE);
  console.log(`[Blockchain Service] No deployBlock found, querying last ${FALLBACK_BLOCK_RANGE} blocks (from ${fromBlock})`);
  return fromBlock;
}

async function queryFilterChunked(filter, fromBlock) {
  if (!_initialized) init();

  const latestBlock = await _provider.getBlockNumber();
  const startBlock = typeof fromBlock === 'number' ? fromBlock : await getEventFromBlock();
  const events = [];

  for (let start = startBlock; start <= latestBlock; start += FALLBACK_BLOCK_RANGE) {
    const end = Math.min(start + FALLBACK_BLOCK_RANGE - 1, latestBlock);
    events.push(...await _contract.queryFilter(filter, start, end));
  }

  return events;
}

/**
 * Query status perangkat on-chain.
 *
 * Smart contract mengembalikan uint8 (enum index):
 *   0 -> UNREGISTERED, 1 -> PENDING, 2 -> APPROVED, 3 -> REJECTED
 *
 * @param {string} address - Ethereum address perangkat (0x...)
 * @returns {Promise<string>} Status name: 'UNREGISTERED', 'PENDING', 'APPROVED', atau 'REJECTED'
 */
async function getDeviceStatus(address) {
  if (!_initialized) init();

  console.log('[Blockchain Service] getDeviceStatus:', address);

  const statusIndex = await _contract.getDeviceStatus(address);
  const statusName = STATUS_NAMES[Number(statusIndex)] || 'UNREGISTERED';

  console.log('[Blockchain Service] Device status:', statusName, `(index: ${statusIndex})`);
  return statusName;
}

/**
 * Query hash yang tersimpan on-chain untuk suatu batchId.
 *
 * @param {string} batchId - Bytes32 hex string (0x + 64 hex chars)
 * @returns {Promise<string>} Hash bytes32 yang tersimpan on-chain
 */
async function getHash(batchId) {
  if (!_initialized) init();

  console.log('[Blockchain Service] getHash:', batchId);

  const hash = await _contract.getHash(batchId);

  console.log('[Blockchain Service] On-chain hash:', hash);
  return hash;
}

/**
 * Query alamat admin dari smart contract.
 *
 * @returns {Promise<string>} Alamat Ethereum admin (0x...)
 */
async function getAdmin() {
  if (!_initialized) init();

  console.log('[Blockchain Service] getAdmin()');

  const adminAddress = await _contract.getAdmin();

  console.log('[Blockchain Service] Admin address:', adminAddress);
  return adminAddress;
}

/**
 * Query semua device yang pernah registerDevice() via event DeviceRegistered.
 * Query dari deployBlock (tersimpan di sepolia.json) untuk menghindari limit Infura.
 *
 * @returns {Promise<string[]>} Array of device addresses
 */
async function getRegisteredDevices() {
  if (!_initialized) init();

  console.log('[Blockchain Service] getRegisteredDevices() - querying DeviceRegistered events...');

  try {
    const fromBlock = await getEventFromBlock();
    const filter = _contract.filters.DeviceRegistered();
    const events = await queryFilterChunked(filter, fromBlock);

    const addresses = [...new Set(events.map(e => e.args[0]))];
    console.log(`[Blockchain Service] Found ${addresses.length} registered device(s):`, addresses);
    return addresses;
  } catch (err) {
    console.warn('[Blockchain Service] Failed to query DeviceRegistered events:', err.message);
    return [];
  }
}

/**
 * Query semua batch yang sudah tercatat on-chain via event HashRecorded.
 *
 * @returns {Promise<Array>} Recorded batch metadata, sorted newest first
 */
async function getRecordedBatches() {
  if (!_initialized) init();

  console.log('[Blockchain Service] getRecordedBatches() - querying HashRecorded events...');

  try {
    const fromBlock = await getEventFromBlock();
    const filter = _contract.filters.HashRecorded();
    const events = await queryFilterChunked(filter, fromBlock);

    const batches = events
      .filter(e => e.args)
      .map((e) => {
        const timestamp = Number(e.args[4]);
        return {
          deviceAddress: e.args[0],
          batchId: e.args[1],
          onChainHash: e.args[2],
          hourWindowStart: Number(e.args[3]),
          recordedAt: new Date(timestamp * 1000).toISOString(),
          txHash: e.transactionHash,
          blockNumber: e.blockNumber,
        };
      })
      .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());

    console.log(`[Blockchain Service] Found ${batches.length} recorded batch(es)`);
    return batches;
  } catch (err) {
    console.warn('[Blockchain Service] Failed to query HashRecorded events:', err.message);
    return [];
  }
}

module.exports = {
  init,
  getDeviceStatus,
  getHash,
  getAdmin,
  getRegisteredDevices,
  getRecordedBatches,
};
