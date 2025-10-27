const { Pool } = require('pg');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()]
});

// Log database configuration for debugging
console.log('🔍 DATABASE: NODE_ENV =', process.env.NODE_ENV);
console.log('🔍 DATABASE: DATABASE_URL =', process.env.DATABASE_URL ? 'SET' : 'NOT SET');
if (process.env.DATABASE_URL) {
  const urlParts = process.env.DATABASE_URL.split('/');
  console.log('🔍 DATABASE: Database name =', urlParts[urlParts.length - 1]);
}

// Create connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/steaknstake',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20, // Maximum number of connections
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 2000, // Return error after 2 seconds if connection could not be established
});

// Handle pool errors
pool.on('error', (err) => {
  logger.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Test database connection
async function testConnection() {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    logger.info('✅ Database connection successful', { timestamp: result.rows[0].now });
    return true;
  } catch (error) {
    logger.error('❌ Database connection failed:', error);
    return false;
  }
}

// Initialize database (create tables if they don't exist)
async function initializeDatabase() {
  try {
    const client = await pool.connect();
    
    // Read and execute schema
    const fs = require('fs');
    const path = require('path');
    const schemaPath = path.join(__dirname, '../../database-schema.sql');
    
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf8');
      await client.query(schema);
      logger.info('✅ Database schema initialized successfully');
    } else {
      logger.warn('⚠️  Database schema file not found, skipping initialization');
    }
    
    client.release();
    return true;
  } catch (error) {
    logger.error('❌ Database initialization failed:', error);
    return false;
  }
}

// Get a client from the pool
async function getClient() {
  try {
    return await pool.connect();
  } catch (error) {
    logger.error('Error getting database client:', error);
    throw error;
  }
}

// Execute a query with automatic client management
async function query(text, params) {
  const client = await getClient();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

// Execute multiple queries in a transaction
async function transaction(queries) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    
    const results = [];
    for (const { text, params } of queries) {
      const result = await client.query(text, params);
      results.push(result);
    }
    
    await client.query('COMMIT');
    return results;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Graceful shutdown
async function closePool() {
  try {
    await pool.end();
    logger.info('🔌 Database connection pool closed');
  } catch (error) {
    logger.error('Error closing database pool:', error);
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, closing database connections...');
  await closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, closing database connections...');
  await closePool();
  process.exit(0);
});

module.exports = {
  pool,
  getClient,
  query,
  transaction,
  testConnection,
  initializeDatabase,
  closePool
};