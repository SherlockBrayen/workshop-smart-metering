// edge/config.js
require('dotenv').config();

module.exports = {
  // 1 device (gateway) dengan 5 sensor (kamar)
  device: {
    name: 'Gateway',
    privateKey: process.env.DEVICE_PRIVATE_KEY,
  },
  rooms: [
    { id: 1, name: 'Kamar 101' },
    { id: 2, name: 'Kamar 102' },
    { id: 3, name: 'Kamar 103' },
    { id: 4, name: 'Kamar 201' },
    { id: 5, name: 'Kamar 202' },
  ],
  backendUrl:        process.env.BACKEND_URL      || 'http://localhost:3000',
  infuraUrl:         process.env.INFURA_URL,
  contractAddress:   process.env.CONTRACT_ADDRESS,
  readingInterval:   parseInt(process.env.READING_INTERVAL_MS)  || 10000,  // 10 detik
  batchInterval:     parseInt(process.env.BATCH_INTERVAL_MS)    || 120000, // 2 menit
};
