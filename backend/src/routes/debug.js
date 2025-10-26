const express = require('express');
const router = express.Router();
const db = require('../services/database');

// Simple database test endpoint
router.get('/db-test', async (req, res) => {
  try {
    console.log('🔍 Testing database connection...');
    const client = await db.getClient();
    
    // Simple query
    const result = await client.query('SELECT NOW() as current_time');
    client.release();
    
    console.log('✅ Database test successful');
    res.json({
      success: true,
      message: 'Database connection working',
      currentTime: result.rows[0].current_time
    });
    
  } catch (error) {
    console.error('❌ Database test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// Test user lookup
router.get('/user-test/:address', async (req, res) => {
  try {
    const { address } = req.params;
    console.log('🔍 Testing user lookup for:', address);
    
    const client = await db.getClient();
    const result = await client.query(
      'SELECT * FROM users WHERE wallet_address = $1',
      [address.toLowerCase()]
    );
    client.release();
    
    console.log('✅ User lookup successful');
    res.json({
      success: true,
      userFound: result.rows.length > 0,
      user: result.rows[0] || null
    });
    
  } catch (error) {
    console.error('❌ User lookup failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

module.exports = router;