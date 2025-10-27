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

// CRITICAL: Request logging MUST be before route registration
app.use((req, res, next) => {
  console.log('📥 INCOMING REQUEST:', req.method, req.path, req.url);
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next();
});

// Import database service
const db = require('./services/database');

// Import routes with error handling
console.log('🔍 INDEX: About to import routes...');

let stakingRoutes, stakingMinimalRoutes, tippingRoutes, userRoutes, farcasterRoutes, debugRoutes, apiDebugRoutes;

try {
  console.log('🔍 INDEX: Importing staking routes...');
  stakingRoutes = require('./routes/staking');
  console.log('✅ INDEX: Staking routes imported successfully');
} catch (error) {
  console.error('❌ INDEX: Failed to import staking routes:', error);
}

try {
  console.log('🔍 INDEX: Importing staking-minimal routes...');
  stakingMinimalRoutes = require('./routes/staking-minimal');
  console.log('✅ INDEX: Staking-minimal routes imported successfully');
} catch (error) {
  console.error('❌ INDEX: Failed to import staking-minimal routes:', error);
}

try {
  console.log('🔍 INDEX: Importing other routes...');
  tippingRoutes = require('./routes/tipping');
  userRoutes = require('./routes/users');
  farcasterRoutes = require('./routes/farcaster');
  debugRoutes = require('./routes/debug');
  apiDebugRoutes = require('./routes/api-debug');
  console.log('✅ INDEX: Other routes imported successfully');
} catch (error) {
  console.error('❌ INDEX: Failed to import other routes:', error);
}

// API routes with error handling
console.log('🔍 INDEX: About to register routes...');

if (stakingRoutes) {
  try {
    console.log('🔍 INDEX: Registering staking routes...');
    console.log('🔍 INDEX: stakingRoutes type:', typeof stakingRoutes);
    console.log('🔍 INDEX: stakingRoutes keys:', Object.keys(stakingRoutes));
    app.use('/api/staking', stakingRoutes);
    console.log('✅ INDEX: Staking routes registered at /api/staking');
  } catch (error) {
    console.error('❌ INDEX: Failed to register staking routes:', error);
    console.error('❌ INDEX: Error details:', error.stack);
  }
} else {
  console.error('❌ INDEX: stakingRoutes is undefined, skipping registration');
}

if (stakingMinimalRoutes) {
  try {
    app.use('/api/staking-minimal', stakingMinimalRoutes);
    console.log('✅ INDEX: Staking-minimal routes registered');
  } catch (error) {
    console.error('❌ INDEX: Failed to register staking-minimal routes:', error);
  }
}

if (debugRoutes) {
  try {
    app.use('/api/debug', debugRoutes);
    console.log('✅ INDEX: Debug routes registered');
  } catch (error) {
    console.error('❌ INDEX: Failed to register debug routes:', error);
  }
}

if (apiDebugRoutes) {
  try {
    app.use('/api/api-debug', apiDebugRoutes);
    console.log('✅ INDEX: API debug routes registered');
  } catch (error) {
    console.error('❌ INDEX: Failed to register API debug routes:', error);
  }
}

if (tippingRoutes) app.use('/api/tipping', tippingRoutes);
if (userRoutes) app.use('/api/users', userRoutes);
if (farcasterRoutes) app.use('/api/farcaster', farcasterRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  console.log('🏥 HEALTH ENDPOINT CALLED');
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

// Debug endpoint to check environment variables
app.get('/api/debug/env', (req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      DATABASE_URL_SET: !!process.env.DATABASE_URL,
      DATABASE_URL_LENGTH: process.env.DATABASE_URL ? process.env.DATABASE_URL.length : 0,
      DATABASE_URL_HOST: process.env.DATABASE_URL ? process.env.DATABASE_URL.split('@')[1]?.split('/')[0] : 'not set',
      FRONTEND_URL: process.env.FRONTEND_URL,
      NEYNAR_API_KEY_SET: !!process.env.NEYNAR_API_KEY
    }
  });
});

// Debug endpoint to check routes
app.get('/api/debug/routes', (req, res) => {
  console.log('🔍 ROUTES DEBUG ENDPOINT CALLED');
  const routes = [];
  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      routes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods)
      });
    } else if (middleware.name === 'router') {
      middleware.handle.stack.forEach((handler) => {
        if (handler.route) {
          routes.push({
            path: handler.route.path,
            methods: Object.keys(handler.route.methods)
          });
        }
      });
    }
  });
  res.json({
    timestamp: new Date().toISOString(),
    routes: routes,
    middlewareCount: app._router.stack.length
  });
});

// Debug endpoint to test database
app.get('/api/debug/database', async (req, res) => {
  console.log('🔍 DATABASE DEBUG ENDPOINT CALLED');
  try {
    const connected = await db.testConnection();
    if (connected) {
      // Try a simple query
      const client = await db.getClient();
      const result = await client.query('SELECT COUNT(*) as user_count FROM users');
      client.release();
      
      res.json({
        timestamp: new Date().toISOString(),
        database: {
          connected: true,
          userCount: result.rows[0].user_count,
          environment: process.env.NODE_ENV,
          databaseUrlSet: !!process.env.DATABASE_URL,
          databaseHost: process.env.DATABASE_URL ? process.env.DATABASE_URL.split('@')[1]?.split('/')[0] : 'not set'
        }
      });
    } else {
      res.status(503).json({
        timestamp: new Date().toISOString(),
        database: {
          connected: false,
          error: 'Connection test failed',
          environment: process.env.NODE_ENV,
          databaseUrlSet: !!process.env.DATABASE_URL,
          databaseHost: process.env.DATABASE_URL ? process.env.DATABASE_URL.split('@')[1]?.split('/')[0] : 'not set'
        }
      });
    }
  } catch (error) {
    console.error('🚨 DATABASE DEBUG ERROR:', error);
    res.status(503).json({
      timestamp: new Date().toISOString(),
      database: {
        connected: false,
        error: error.message,
        code: error.code,
        environment: process.env.NODE_ENV,
        databaseUrlSet: !!process.env.DATABASE_URL,
        databaseHost: process.env.DATABASE_URL ? process.env.DATABASE_URL.split('@')[1]?.split('/')[0] : 'not set'
      }
    });
  }
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

// 404 handler - MUST BE LAST
app.use('*', (req, res) => {
  console.log('🚨 404 HANDLER HIT:', req.method, req.originalUrl);
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
    console.log(`🚀 SERVER STARTED ON PORT ${PORT} - READY FOR REQUESTS`);
    logger.info(`🥩 SteakNStake Backend running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info('🎯 Social Tipping with Farcaster Integration Ready');
    
    // Test that request handling works
    setTimeout(() => {
      console.log('⏰ KEEPALIVE CHECK - SERVER STILL RUNNING');
    }, 5000);
  });
}

// Start the application
startServer();

module.exports = app;