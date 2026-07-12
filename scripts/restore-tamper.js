// Restore a reading changed by scripts/tamper.js so Audit Verifier returns VALID again.
// Usage from workshop root: node scripts/restore-tamper.js <batchId>

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

async function restoreFromBackup(batchId) {
  const backups = mongoose.connection.collection('tamperBackups');
  const backup = await backups.findOne(
    { batchId, restoredAt: { $exists: false } },
    { sort: { createdAt: -1 } }
  );

  if (!backup) return false;

  console.log('');
  console.log('[INFO] Backup found:', String(backup._id));
  console.log('[INFO] Device      :', backup.deviceAddress);
  console.log('[INFO] Room        :', backup.room);
  console.log('[INFO] Sequence    :', backup.sequenceInBatch);
  console.log('[INFO] Field       :', backup.field);
  console.log('[INFO] Current     :', backup.tamperedValue);
  console.log('[INFO] Restore to  :', backup.originalValue);

  const answer = await ask('\nRestore this reading? (y/N) ');
  if (answer.trim().toLowerCase() !== 'y') {
    console.log('Cancelled.');
    return true;
  }

  await EnergyReading.updateOne(
    { _id: new mongoose.Types.ObjectId(backup.readingId) },
    { $set: { [backup.field]: backup.originalValue } }
  );

  await backups.updateOne(
    { _id: backup._id },
    { $set: { restoredAt: new Date() } }
  );

  console.log('');
  console.log('[OK] Restored from tamper backup.');
  return true;
}

async function restoreLegacyTamper(batchId) {
  const reading = await EnergyReading.findOne({ batchId }).sort({ sequenceInBatch: 1 }).lean();
  if (!reading) {
    console.error('[ERROR] Batch not found:', batchId);
    return;
  }

  const field = 'energyDelta';
  const currentValue = reading[field];
  const restoredValue = parseFloat((currentValue / 3.5).toFixed(6));

  console.log('');
  console.log('[WARN] No tamper backup found. Using legacy inverse restore for energyDelta.');
  console.log('[INFO] Device      :', reading.deviceAddress);
  console.log('[INFO] Room        :', reading.room);
  console.log('[INFO] Sequence    :', reading.sequenceInBatch);
  console.log('[INFO] Field       :', field);
  console.log('[INFO] Current     :', currentValue);
  console.log('[INFO] Restore to  :', restoredValue);

  const answer = await ask('\nApply legacy restore? (y/N) ');
  if (answer.trim().toLowerCase() !== 'y') {
    console.log('Cancelled.');
    return;
  }

  await EnergyReading.updateOne(
    { _id: reading._id },
    { $set: { [field]: restoredValue } }
  );

  console.log('');
  console.log('[OK] Legacy restore applied.');
}

async function main() {
  const batchId = process.argv[2];

  if (!batchId) {
    console.error('Usage: node scripts/restore-tamper.js <batchId>');
    process.exit(1);
  }

  if (!/^0x[a-fA-F0-9]{64}$/.test(batchId)) {
    console.error('[ERROR] Invalid batchId. Expected 0x followed by 64 hex characters.');
    process.exit(1);
  }

  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/workshop_demo';
  await mongoose.connect(mongoUri);
  console.log('[OK] Connected to MongoDB:', mongoUri);

  const restoredFromBackup = await restoreFromBackup(batchId);
  if (!restoredFromBackup) {
    await restoreLegacyTamper(batchId);
  }

  console.log('');
  console.log('Next steps:');
  console.log('  1. Open Frontend -> Audit Verifier.');
  console.log('  2. Verify this batchId:', batchId);
  console.log('  3. Expected result: VALID.');

  await mongoose.connection.close();
}

main().catch(async (err) => {
  console.error('[ERROR]', err.message);
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
  }
  process.exit(1);
});
