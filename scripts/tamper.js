// Tamper one MongoDB reading so Audit Verifier returns TAMPERED.
// Usage from workshop root: node scripts/tamper.js <batchId>

'use strict';

const path = require('path');
const readline = require('readline');

const backendRoot = path.resolve(__dirname, '..', 'backend');
const mongoose = require(path.join(backendRoot, 'node_modules', 'mongoose'));
const dotenv = require(path.join(backendRoot, 'node_modules', 'dotenv'));

dotenv.config({ path: path.join(backendRoot, '.env') });

const EnergyReading = require(path.join(backendRoot, 'src', 'models', 'EnergyReading'));

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  const batchId = process.argv[2];

  if (!batchId) {
    console.error('Usage: node scripts/tamper.js <batchId>');
    process.exit(1);
  }

  if (!/^0x[a-fA-F0-9]{64}$/.test(batchId)) {
    console.error('[ERROR] Invalid batchId. Expected 0x followed by 64 hex characters.');
    process.exit(1);
  }

  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/workshop_demo';
  await mongoose.connect(mongoUri);
  console.log('[OK] Connected to MongoDB:', mongoUri);

  const reading = await EnergyReading.findOne({ batchId }).sort({ sequenceInBatch: 1 }).lean();
  if (!reading) {
    console.error('[ERROR] Batch not found:', batchId);
    await mongoose.connection.close();
    process.exit(1);
  }

  const field = 'energyDelta';
  const originalValue = reading[field];
  const newValue = parseFloat((originalValue * 3.5).toFixed(6));

  console.log('');
  console.log('[INFO] Target batch:', batchId);
  console.log('[INFO] Device      :', reading.deviceAddress);
  console.log('[INFO] Room        :', reading.room);
  console.log('[INFO] Field       :', field);
  console.log('[INFO] Before      :', originalValue);
  console.log('[INFO] After       :', newValue);

  const answer = await ask('\nModify this reading? (y/N) ');
  if (answer.trim().toLowerCase() !== 'y') {
    console.log('Cancelled.');
    await mongoose.connection.close();
    return;
  }

  const backups = mongoose.connection.collection('tamperBackups');
  await backups.insertOne({
    batchId,
    readingId: String(reading._id),
    deviceAddress: reading.deviceAddress,
    room: reading.room,
    sequenceInBatch: reading.sequenceInBatch,
    field,
    originalValue,
    tamperedValue: newValue,
    createdAt: new Date(),
  });

  await EnergyReading.updateOne(
    { _id: reading._id },
    { $set: { [field]: newValue } }
  );

  console.log('');
  console.log('[OK] TAMPERED. MongoDB data was changed.');
  console.log('Next steps:');
  console.log('  1. Open Frontend -> Audit Verifier.');
  console.log('  2. Verify this batchId:', batchId);
  console.log('  3. Expected result: TAMPERED.');
  console.log('');
  console.log('To restore this batch later:');
  console.log('  node scripts/restore-tamper.js ' + batchId);

  await mongoose.connection.close();
}

main().catch(async (err) => {
  console.error('[ERROR]', err.message);
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
  }
  process.exit(1);
});
