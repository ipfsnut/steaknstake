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

// Sync staking position from contract for a specific address
router.post('/sync-staking/:address', async (req, res) => {
  try {
    const { address } = req.params;
    console.log('🔄 Syncing staking position from contract for:', address);
    
    const { ethers } = require('ethers');
    
    // Contract setup
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://mainnet.base.org');
    const contractAddress = process.env.STEAKNSTAKE_CONTRACT_ADDRESS || '0xdA9BD5c259Ae90e99158f45f00238d1BaDb3694D';
    
    // Minimal ABI for reading stake amount
    const contractABI = [
      "function stakedAmount(address) view returns (uint256)"
    ];
    
    const contract = new ethers.Contract(contractAddress, contractABI, provider);
    
    // Get current staked amount from contract
    const stakedAmountWei = await contract.stakedAmount(address);
    const stakedAmount = parseFloat(ethers.formatEther(stakedAmountWei));
    
    console.log(`📊 Contract shows ${stakedAmount} $STEAK staked for ${address}`);
    
    // Update database
    const client = await db.getClient();
    
    // Find user
    const userResult = await client.query(
      'SELECT * FROM users WHERE wallet_address = $1',
      [address.toLowerCase()]
    );
    
    if (userResult.rows.length === 0) {
      client.release();
      return res.status(404).json({
        success: false,
        error: 'User not found in database'
      });
    }
    
    const user = userResult.rows[0];
    
    // Update or create staking position
    const positionResult = await client.query(
      'SELECT * FROM staking_positions WHERE user_id = $1',
      [user.id]
    );
    
    if (positionResult.rows.length === 0) {
      // Create new position
      await client.query(`
        INSERT INTO staking_positions (user_id, staked_amount, staked_at, updated_at)
        VALUES ($1, $2, $3, $3)
      `, [user.id, stakedAmount, new Date()]);
    } else {
      // Update existing position
      await client.query(`
        UPDATE staking_positions 
        SET 
          staked_amount = $1,
          updated_at = $2
        WHERE user_id = $3
      `, [stakedAmount, new Date(), user.id]);
    }
    
    client.release();
    
    console.log('✅ Staking position synced successfully');
    res.json({
      success: true,
      message: 'Staking position synced from contract',
      walletAddress: address,
      stakedAmount: stakedAmount
    });
    
  } catch (error) {
    console.error('❌ Failed to sync staking position:', error);
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