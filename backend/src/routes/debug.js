const express = require('express');
const router = express.Router();
const db = require('../services/database');
const { testContractConnection, callFundContract, approveContractSpending } = require('../services/contractService');
const { testContractSplit, triggerBatchProcessing } = require('../services/batchProcessor');

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

// Refresh leaderboard cache
router.post('/refresh-leaderboard', async (req, res) => {
  try {
    console.log('🔄 Refreshing leaderboard cache...');
    
    const client = await db.getClient();
    
    // Call the refresh function
    await client.query('SELECT refresh_leaderboard_cache()');
    
    // Get updated count
    const countResult = await client.query('SELECT COUNT(*) as count FROM leaderboard_cache');
    client.release();
    
    console.log('✅ Leaderboard cache refreshed successfully');
    res.json({
      success: true,
      message: 'Leaderboard cache refreshed',
      cachedEntries: parseInt(countResult.rows[0].count)
    });
    
  } catch (error) {
    console.error('❌ Failed to refresh leaderboard cache:', error);
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

// Test contract connection
router.get('/contract-test', async (req, res) => {
  try {
    console.log('🔍 Testing smart contract connection...');
    const result = await testContractConnection();
    
    console.log('✅ Contract test result:', result);
    res.json({
      success: true,
      message: 'Contract connection test completed',
      ...result
    });
    
  } catch (error) {
    console.error('❌ Contract test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// Test contract split function
router.post('/contract-split-test', async (req, res) => {
  try {
    const { amount = 1 } = req.body;
    console.log(`🔍 Testing contract split with ${amount} STEAK...`);
    
    const result = await testContractSplit(amount);
    
    console.log('✅ Contract split test successful:', result);
    res.json({
      success: true,
      message: `Contract split test completed for ${amount} STEAK`,
      ...result
    });
    
  } catch (error) {
    console.error('❌ Contract split test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// Approve contract to spend STEAK tokens
router.post('/approve-contract', async (req, res) => {
  try {
    const { amount = 10000 } = req.body; // Default 10k STEAK approval
    console.log(`🔍 Approving contract to spend ${amount} STEAK...`);
    
    const result = await approveContractSpending(amount);
    
    console.log('✅ Contract approval successful:', result);
    res.json({
      success: true,
      message: `Contract approved to spend ${amount} STEAK`,
      ...result
    });
    
  } catch (error) {
    console.error('❌ Contract approval failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// Fund contract with rewards
router.post('/fund-contract', async (req, res) => {
  try {
    const { amount = 1000 } = req.body;
    console.log(`🔍 Funding contract with ${amount} STEAK...`);
    
    const result = await callFundContract(amount);
    
    console.log('✅ Contract funding successful:', result);
    res.json({
      success: true,
      message: `Contract funded with ${amount} STEAK`,
      ...result
    });
    
  } catch (error) {
    console.error('❌ Contract funding failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// Trigger manual batch processing
router.post('/batch-trigger', async (req, res) => {
  try {
    console.log('🔍 Triggering manual batch processing...');
    await triggerBatchProcessing();
    
    console.log('✅ Batch processing completed');
    res.json({
      success: true,
      message: 'Batch processing triggered successfully'
    });
    
  } catch (error) {
    console.error('❌ Batch processing failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

module.exports = router;