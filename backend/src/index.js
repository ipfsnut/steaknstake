const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const winston = require('winston');

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
const PORT = process.env.PORT || 3005;

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next();
});

// Import database service
const db = require('./services/database');

// Import routes
const stakingRoutes = require('./routes/staking');
const tippingRoutes = require('./routes/tipping');
const userRoutes = require('./routes/users');
const farcasterRoutes = require('./routes/farcaster');

// API routes
app.use('/api/staking', stakingRoutes);
app.use('/api/tipping', tippingRoutes);
app.use('/api/users', userRoutes);
app.use('/api/farcaster', farcasterRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'steaknstake-backend',
    version: '1.0.0'
  });
});

// Debug endpoint to check deployment
app.get('/api/debug/deployment', (req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
    selfTipProtectionEnabled: true,
    deploymentHash: 'a96a2836f11bc99d2b572aa0ed27c74368bb9d2f',
    lastUpdated: '2025-10-26T20:52:00Z'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'SteakNStake Backend API - Social Tipping via Farcaster',
    version: '1.0.0',
    endpoints: [
      '/api/health',
      '/api/staking',
      '/api/tipping',
      '/api/users',
      '/api/farcaster'
    ]
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.originalUrl
  });
});

// Initialize database and start server
async function startServer() {
  try {
    // Test database connection
    const connected = await db.testConnection();
    if (connected) {
      // Initialize database schema
      await db.initializeDatabase();
      logger.info('✅ Database initialized successfully');
    } else {
      logger.warn('⚠️  Database connection failed, continuing without database');
    }
  } catch (error) {
    logger.error('❌ Database initialization error:', error);
  }

  // Start server
  app.listen(PORT, () => {
    logger.info(`🥩 SteakNStake Backend running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info('🎯 Social Tipping with Farcaster Integration Ready');
  });
}

// Start the application
startServer();

module.exports = app;