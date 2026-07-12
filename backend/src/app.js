require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const logger = require('./utils/logger');
const eccService = require('./services/eccService');
const blockchainService = require('./services/blockchainService');

const app = express();

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
}));
app.use(express.json());

// Health check endpoint
app.get('/health', async (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus = dbState === 1 ? 'connected' : 'disconnected';

  res.json({
    status: 'ok',
    db: dbStatus,
  });
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/data'));
app.use('/api/devices', require('./routes/devices'));
app.use('/api/audit', require('./routes/auditRoutes'));

// MongoDB connection + server startup
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/workshop_demo';

async function start() {
  try {
    await mongoose.connect(MONGODB_URI);
    logger.info(`MongoDB connected: ${MONGODB_URI}`);

    // Initialize ECC service (load keys)
    await eccService.init();

    // Initialize Blockchain service (provider + contract)
    blockchainService.init();
    logger.info('Blockchain service initialized (read-only)');

    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (err) {
    logger.error(`Failed to start: ${err.message}`);
    process.exit(1);
  }
}

start();

module.exports = app;
