console.log('🔍 STAKING ROUTE: Starting to load staking.js v2...');

const express = require('express');
const router = express.Router();

console.log('🔍 STAKING ROUTE: Express router created');

const db = require('../services/database');
console.log('🔍 STAKING ROUTE: Database service imported');

const { ethers } = require('ethers');
console.log('🔍 STAKING ROUTE: Contract service imports added');

// Contract addresses
const CONTRACTS = {
  STEAKNSTAKE: process.env.STEAKNSTAKE_CONTRACT_ADDRESS || '0xdA9BD5c259Ae90e99158f45f00238d1BaDb3694D'
};

const winston = require('winston');
console.log('🔍 STAKING ROUTE: Winston imported');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()]
});

// Calculate and update rewards for a user
async function calculateRewards(userId) {
  const client = await db.getClient();
  
  try {
    await client.query('BEGIN');
    
    // Get user's staking position
    const positionResult = await client.query(
      'SELECT * FROM staking_positions WHERE user_id = $1',
      [userId]
    );
    
    if (positionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { availableTipBalance: 0, totalRewardsEarned: 0 };
    }
    
    const position = positionResult.rows[0];
    const now = new Date();
    const lastCalculated = new Date(position.last_reward_calculated);
    const timeDiff = (now - lastCalculated) / 1000; // seconds
    
    // Get daily reward rate (default 0.1% per day)
    const settingsResult = await client.query(
      'SELECT setting_value FROM system_settings WHERE setting_key = $1',
      ['daily_reward_rate']
    );
    const dailyRate = parseFloat(settingsResult.rows[0]?.setting_value || '0.001');
    
    // Calculate rewards: (staked_amount * daily_rate * time_elapsed_in_days)
    const secondsPerDay = 24 * 60 * 60;
    const timeElapsedDays = timeDiff / secondsPerDay;
    const newRewards = parseFloat(position.staked_amount) * dailyRate * timeElapsedDays;
    
    // Update position with new rewards (tip allowances, not total_rewards_earned)
    const updatedPosition = await client.query(`
      UPDATE staking_positions 
      SET 
        available_tip_balance = available_tip_balance + $1,
        last_reward_calculated = $2,
        updated_at = $2
      WHERE user_id = $3
      RETURNING *
    `, [newRewards, now, userId]);
    
    await client.query('COMMIT');
    
    return {
      availableTipBalance: parseFloat(updatedPosition.rows[0].available_tip_balance),
      totalRewardsEarned: parseFloat(updatedPosition.rows[0].total_rewards_earned), // This will be calculated separately from tips
      newRewards: newRewards
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Get or create user
async function getOrCreateUser(walletAddress, farcasterFid = null, farcasterUsername = null) {
  const client = await db.getClient();
  
  try {
    // Try to find existing user
    let userResult = await client.query(
      'SELECT * FROM users WHERE wallet_address = $1',
      [walletAddress.toLowerCase()]
    );
    
    if (userResult.rows.length === 0) {
      // Create new user
      userResult = await client.query(`
        INSERT INTO users (wallet_address, farcaster_fid, farcaster_username)
        VALUES ($1, $2, $3)
        RETURNING *
      `, [walletAddress.toLowerCase(), farcasterFid, farcasterUsername]);
    }
    
    return userResult.rows[0];
  } finally {
    client.release();
  }
}

console.log('🔍 STAKING ROUTE: About to define routes...');

// SIMPLE TEST ENDPOINT
router.get('/test/:address', async (req, res) => {
  try {
    const { address } = req.params;
    res.json({
      success: true,
      message: 'Test endpoint working',
      address: address
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/staking/position/:address - Get user's staking position
router.get('/position/:address', async (req, res) => {
  console.log('🎯 ROUTE CALLED: /api/staking/position/' + req.params.address);
  
  try {
    const { address } = req.params;
    
    // Get user data with simplified query
    const client = await db.getClient();
    
    // First check if user exists
    const userResult = await client.query(
      'SELECT id, wallet_address, farcaster_fid, farcaster_username FROM users WHERE wallet_address = $1',
      [address.toLowerCase()]
    );
    
    if (userResult.rows.length === 0) {
      client.release();
      // New user - return default values
      return res.json({
        success: true,
        data: {
          walletAddress: address.toLowerCase(),
          stakedAmount: 0,
          totalRewardsEarned: 0,
          availableTipBalance: 0,
          stakedAt: null,
          farcasterFid: null,
          farcasterUsername: null
        }
      });
    }
    
    const user = userResult.rows[0];
    
    // Get staking position with daily allowance
    const positionResult = await client.query(
      'SELECT staked_amount, total_rewards_earned, daily_allowance_start, daily_tips_sent, last_allowance_reset, staked_at FROM staking_positions WHERE user_id = $1',
      [user.id]
    );
    
    client.release();
    
    const position = positionResult.rows[0];
    
    // Calculate current daily allowance
    const dailyAllowanceStart = position ? parseFloat(position.daily_allowance_start) : 0;
    const dailyTipsSent = position ? parseFloat(position.daily_tips_sent) : 0;
    const remainingDailyAllowance = dailyAllowanceStart - dailyTipsSent;
    
    return res.json({
      success: true,
      data: {
        walletAddress: user.wallet_address,
        stakedAmount: position ? parseFloat(position.staked_amount) : 0,
        totalRewardsEarned: position ? parseFloat(position.total_rewards_earned) : 0,
        // Legacy field for backwards compatibility
        availableTipBalance: remainingDailyAllowance,
        // New daily allowance fields
        dailyAllowanceStart: dailyAllowanceStart,
        dailyTipsSent: dailyTipsSent,
        remainingDailyAllowance: remainingDailyAllowance,
        lastAllowanceReset: position ? position.last_allowance_reset : null,
        stakedAt: position ? position.staked_at : null,
        farcasterFid: user.farcaster_fid,
        farcasterUsername: user.farcaster_username
      }
    });
    
  } catch (error) {
    console.error('🚨 STAKING POSITION ERROR:', error);
    console.error('🚨 ERROR DETAILS:', error.stack);
    console.error('🚨 ERROR CODE:', error.code);
    
    // Handle specific database connection errors
    if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
      console.error('🚨 DATABASE CONNECTION ISSUE - attempting retry...');
      // For now, return a more descriptive error
      return res.status(503).json({
        success: false,
        error: 'Database connection issue',
        details: `Database ${error.code}: ${error.message}`,
        code: error.code,
        retryable: true
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'Failed to get staking position',
      details: error.message,
      code: error.code,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
  
  // TODO: Restore full implementation
  /*
  try {
    const { address } = req.params;
    console.log('🎯 INSIDE TRY BLOCK, address:', address);
    
    // TEMPORARILY BYPASS getOrCreateUser - DIRECT QUERY
    const userClient = await db.getClient();
    const userResult = await userClient.query(
      'SELECT * FROM users WHERE wallet_address = $1',
      [address.toLowerCase()]
    );
    userClient.release();
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    const user = userResult.rows[0];
    // const user = await getOrCreateUser(address);
    
    // Calculate latest rewards - TEMPORARILY BYPASSED FOR DEBUGGING
    // const rewards = await calculateRewards(user.id);
    const rewards = { availableTipBalance: 1000, totalRewardsEarned: 1000 };
    
    // Get staking position
    const client = await db.getClient();
    const positionResult = await client.query(
      'SELECT * FROM staking_positions WHERE user_id = $1',
      [user.id]
    );
    client.release();
    
    const position = positionResult.rows[0] || {
      staked_amount: 0,
      total_rewards_earned: 0,
      available_tip_balance: 0,
      staked_at: null
    };
    
    res.json({
      success: true,
      data: {
        walletAddress: user.wallet_address,
        stakedAmount: parseFloat(position.staked_amount),
        totalRewardsEarned: rewards.totalRewardsEarned,
        availableTipBalance: rewards.availableTipBalance,
        stakedAt: position.staked_at,
        farcasterFid: user.farcaster_fid,
        farcasterUsername: user.farcaster_username
      }
    });
    
  } catch (error) {
    console.error('🚨 STAKING POSITION ERROR:', error);
    console.error('🚨 ERROR STACK:', error.stack);
    console.error('🚨 ERROR MESSAGE:', error.message);
    logger.error('Error getting staking position:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get staking position',
      actualError: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
  */
});

// POST /api/staking/stake - Stake STEAK tokens
router.post('/stake', async (req, res) => {
  try {
    const { 
      walletAddress, 
      amount, 
      transactionHash, 
      blockNumber,
      farcasterFid,
      farcasterUsername 
    } = req.body;
    
    if (!walletAddress || !amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Wallet address and positive amount required'
      });
    }
    
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Get or create user
      const user = await getOrCreateUser(walletAddress, farcasterFid, farcasterUsername);
      
      // Update rewards before adding stake
      await calculateRewards(user.id);
      
      // Get or create staking position
      let positionResult = await client.query(
        'SELECT * FROM staking_positions WHERE user_id = $1',
        [user.id]
      );
      
      if (positionResult.rows.length === 0) {
        // Create new position
        await client.query(`
          INSERT INTO staking_positions (user_id, staked_amount, staked_at)
          VALUES ($1, $2, $3)
        `, [user.id, amount, new Date()]);
      } else {
        // Update existing position
        await client.query(`
          UPDATE staking_positions 
          SET 
            staked_amount = staked_amount + $1,
            updated_at = $2
          WHERE user_id = $3
        `, [amount, new Date(), user.id]);
      }
      
      // Record staking transaction
      await client.query(`
        INSERT INTO staking_transactions 
        (user_id, transaction_type, amount, transaction_hash, block_number)
        VALUES ($1, 'STAKE', $2, $3, $4)
      `, [user.id, amount, transactionHash, blockNumber]);
      
      await client.query('COMMIT');
      
      res.json({
        success: true,
        message: 'Stake successful',
        data: {
          userId: user.id,
          stakedAmount: amount,
          transactionHash
        }
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    logger.error('Error staking tokens:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to stake tokens'
    });
  }
});

// POST /api/staking/unstake - Unstake STEAK tokens
router.post('/unstake', async (req, res) => {
  try {
    const { 
      walletAddress, 
      amount, 
      transactionHash, 
      blockNumber 
    } = req.body;
    
    if (!walletAddress || !amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Wallet address and positive amount required'
      });
    }
    
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');
      
      const user = await getOrCreateUser(walletAddress);
      
      // Update rewards before unstaking
      await calculateRewards(user.id);
      
      // Get staking position
      const positionResult = await client.query(
        'SELECT * FROM staking_positions WHERE user_id = $1',
        [user.id]
      );
      
      if (positionResult.rows.length === 0 || parseFloat(positionResult.rows[0].staked_amount) < amount) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: 'Insufficient staked amount'
        });
      }
      
      // Update staking position
      await client.query(`
        UPDATE staking_positions 
        SET 
          staked_amount = staked_amount - $1,
          updated_at = $2
        WHERE user_id = $3
      `, [amount, new Date(), user.id]);
      
      // Record unstaking transaction
      await client.query(`
        INSERT INTO staking_transactions 
        (user_id, transaction_type, amount, transaction_hash, block_number)
        VALUES ($1, 'UNSTAKE', $2, $3, $4)
      `, [user.id, amount, transactionHash, blockNumber]);
      
      await client.query('COMMIT');
      
      res.json({
        success: true,
        message: 'Unstake successful',
        data: {
          userId: user.id,
          unstakedAmount: amount,
          transactionHash
        }
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    logger.error('Error unstaking tokens:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to unstake tokens'
    });
  }
});

// GET /api/staking/stats - Get overall staking statistics
router.get('/stats', async (req, res) => {
  try {
    const client = await db.getClient();
    
    const statsResult = await client.query(`
      SELECT 
        COUNT(DISTINCT user_id) as total_stakers,
        COALESCE(SUM(staked_amount), 0) as total_staked,
        COALESCE(SUM(total_rewards_earned), 0) as total_rewards_earned,
        COALESCE(SUM(daily_allowance_start - daily_tips_sent), 0) as total_available_tips
      FROM staking_positions 
      WHERE staked_amount > 0
    `);
    
    client.release();
    
    const stats = statsResult.rows[0];
    
    res.json({
      success: true,
      data: {
        totalStakers: parseInt(stats.total_stakers),
        totalStaked: parseFloat(stats.total_staked),
        totalRewardsEarned: parseFloat(stats.total_rewards_earned),
        totalAvailableTips: parseFloat(stats.total_available_tips)
      }
    });
    
  } catch (error) {
    console.error('🚨 STAKING STATS ERROR:', error);
    console.error('🚨 ERROR STACK:', error.stack);
    console.error('🚨 ERROR MESSAGE:', error.message);
    logger.error('Error getting staking stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get staking statistics',
      actualError: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// GET /api/staking/leaderboard - Get top stakers
router.get('/leaderboard', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    
    const client = await db.getClient();
    
    // Use leaderboard cache for fast, consistent results
    const leaderboardResult = await client.query(`
      SELECT 
        lc.wallet_address,
        lc.rank,
        lc.staked_amount,
        lc.total_tips_sent,
        lc.total_tips_received,
        lc.leaderboard_score,
        u.farcaster_username,
        u.farcaster_fid,
        sp.staked_at,
        sp.total_rewards_earned
      FROM leaderboard_cache lc
      LEFT JOIN users u ON lc.wallet_address = u.wallet_address
      LEFT JOIN staking_positions sp ON u.id = sp.user_id
      ORDER BY lc.rank
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    
    client.release();
    
    const leaderboard = leaderboardResult.rows.map(row => ({
      rank: parseInt(row.rank),
      walletAddress: row.wallet_address,
      farcasterUsername: row.farcaster_username,
      farcasterFid: row.farcaster_fid,
      stakedAmount: parseFloat(row.staked_amount),
      totalRewardsEarned: parseFloat(row.total_rewards_earned || 0),
      totalTipsSent: parseFloat(row.total_tips_sent),
      totalTipsReceived: parseFloat(row.total_tips_received),
      leaderboardScore: parseFloat(row.leaderboard_score),
      stakedAt: row.staked_at
    }));
    
    res.json({
      success: true,
      data: {
        leaderboard,
        pagination: {
          limit,
          offset,
          hasMore: leaderboard.length === limit
        },
        lastUpdated: leaderboardResult.rows[0]?.last_updated
      }
    });
    
  } catch (error) {
    console.error('🚨 LEADERBOARD ERROR:', error);
    console.error('🚨 LEADERBOARD ERROR STACK:', error.stack);
    logger.error('Error getting leaderboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get leaderboard',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Sync tip allowances from contract to database
async function syncTipAllowanceFromContract(walletAddress) {
  try {
    const rpcUrl = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    
    const contractABI = [
      {
        "inputs": [{"internalType": "address", "name": "user", "type": "address"}],
        "name": "getAvailableTipAllowance",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
      }
    ];
    
    const contract = new ethers.Contract(CONTRACTS.STEAKNSTAKE, contractABI, provider);
    const contractAllowance = await contract.getAvailableTipAllowance(walletAddress);
    const allowanceAmount = parseFloat(ethers.formatEther(contractAllowance));
    
    console.log(`💰 Contract allowance for ${walletAddress}: ${allowanceAmount} STEAK`);
    
    // Update database with contract state
    const client = await db.getClient();
    
    // Get or create user
    let userResult = await client.query(
      'SELECT id FROM users WHERE wallet_address = $1',
      [walletAddress.toLowerCase()]
    );
    
    let userId;
    if (userResult.rows.length === 0) {
      // Create user if doesn't exist
      const createResult = await client.query(
        'INSERT INTO users (wallet_address, created_at) VALUES ($1, NOW()) RETURNING id',
        [walletAddress.toLowerCase()]
      );
      userId = createResult.rows[0].id;
    } else {
      userId = userResult.rows[0].id;
    }
    
    // Update or create staking position with contract tip allowance
    const existingPositionResult = await client.query(
      'SELECT id FROM staking_positions WHERE user_id = $1',
      [userId]
    );
    
    if (existingPositionResult.rows.length > 0) {
      // Update existing position
      await client.query(`
        UPDATE staking_positions 
        SET 
          available_tip_balance = $1,
          last_reward_calculated = NOW(),
          updated_at = NOW()
        WHERE user_id = $2
      `, [allowanceAmount, userId]);
    } else {
      // Create new position
      await client.query(`
        INSERT INTO staking_positions (
          user_id, 
          available_tip_balance, 
          last_reward_calculated, 
          updated_at
        ) VALUES ($1, $2, NOW(), NOW())
      `, [userId, allowanceAmount]);
    }
    
    client.release();
    
    return {
      success: true,
      walletAddress,
      contractAllowance: allowanceAmount,
      syncedAt: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('❌ Error syncing tip allowance from contract:', error);
    throw error;
  }
}

// GET /api/staking/sync-allowance/:address - Sync tip allowance from contract
router.get('/sync-allowance/:address', async (req, res) => {
  try {
    const { address } = req.params;
    console.log(`🔄 Syncing tip allowance for ${address}...`);
    
    const result = await syncTipAllowanceFromContract(address);
    
    res.json({
      success: true,
      message: 'Tip allowance synced from contract',
      data: result
    });
    
  } catch (error) {
    logger.error('Error syncing tip allowance:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync tip allowance from contract',
      details: error.message
    });
  }
});

// DEBUG ENDPOINT: Analyze database corruption
router.get('/debug/corruption-analysis', async (req, res) => {
  try {
    const client = await db.getClient();
    
    // Get raw staking_positions data
    const stakingPositionsResult = await client.query(`
      SELECT 
        u.wallet_address,
        u.farcaster_username,
        sp.staked_amount,
        sp.total_rewards_earned,
        sp.staked_at,
        sp.updated_at
      FROM staking_positions sp
      JOIN users u ON sp.user_id = u.id
      WHERE sp.staked_amount > 0
      ORDER BY sp.staked_amount DESC
    `);
    
    // Get leaderboard cache data for comparison
    const leaderboardResult = await client.query(`
      SELECT 
        wallet_address,
        staked_amount,
        rank
      FROM leaderboard_cache
      ORDER BY rank
    `);
    
    // Calculate totals
    const stakingPositionsTotal = stakingPositionsResult.rows.reduce((sum, row) => 
      sum + parseFloat(row.staked_amount), 0
    );
    const leaderboardTotal = leaderboardResult.rows.reduce((sum, row) => 
      sum + parseFloat(row.staked_amount), 0
    );
    
    // Check for duplicates in staking_positions
    const duplicateCheck = await client.query(`
      SELECT 
        u.wallet_address,
        COUNT(*) as duplicate_count,
        SUM(sp.staked_amount) as total_staked_for_address
      FROM staking_positions sp
      JOIN users u ON sp.user_id = u.id
      WHERE sp.staked_amount > 0
      GROUP BY u.wallet_address
      HAVING COUNT(*) > 1
    `);
    
    client.release();
    
    res.json({
      success: true,
      data: {
        corruption_analysis: {
          staking_positions_total: stakingPositionsTotal,
          leaderboard_cache_total: leaderboardTotal,
          discrepancy: stakingPositionsTotal - leaderboardTotal,
          discrepancy_percentage: ((stakingPositionsTotal - leaderboardTotal) / leaderboardTotal * 100).toFixed(2) + '%'
        },
        staking_positions_records: stakingPositionsResult.rows.map(row => ({
          wallet_address: row.wallet_address,
          farcaster_username: row.farcaster_username,
          staked_amount: parseFloat(row.staked_amount),
          total_rewards_earned: parseFloat(row.total_rewards_earned || 0),
          staked_at: row.staked_at,
          updated_at: row.updated_at
        })),
        leaderboard_records: leaderboardResult.rows.map(row => ({
          wallet_address: row.wallet_address,
          staked_amount: parseFloat(row.staked_amount),
          rank: parseInt(row.rank)
        })),
        duplicates_found: duplicateCheck.rows,
        summary: {
          staking_positions_count: stakingPositionsResult.rows.length,
          leaderboard_count: leaderboardResult.rows.length,
          duplicates_count: duplicateCheck.rows.length,
          problem_identified: stakingPositionsTotal > leaderboardTotal * 2 ? 'YES - Major corruption detected' : 'NO - Minor discrepancy'
        }
      }
    });
    
  } catch (error) {
    logger.error('Error analyzing database corruption:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze database corruption',
      details: error.message
    });
  }
});

console.log('🔍 STAKING ROUTE: All routes defined, exporting router...');
console.log('🔍 STAKING ROUTE: Routes registered:', router.stack?.length || 'unknown');

// POST /api/staking/webhook - Handle staking event webhooks from indexers
router.post('/webhook', async (req, res) => {
  try {
    const { event, address, amount, transactionHash, blockNumber } = req.body;
    
    logger.info('🔗 Staking webhook received:', { event, address, amount, transactionHash });
    
    // Validate required fields
    if (!event || !address) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: event, address'
      });
    }
    
    // Validate event type
    if (!['Stake', 'Unstake'].includes(event)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid event type. Must be Stake or Unstake'
      });
    }
    
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Find or create user
      let userResult = await client.query(
        'SELECT * FROM users WHERE wallet_address = $1',
        [address.toLowerCase()]
      );
      
      let user;
      if (userResult.rows.length === 0) {
        // Create new user
        const newUserResult = await client.query(`
          INSERT INTO users (wallet_address, created_at)
          VALUES ($1, $2)
          RETURNING *
        `, [address.toLowerCase(), new Date()]);
        user = newUserResult.rows[0];
        logger.info('✅ Created new user for webhook:', { userId: user.id, address });
      } else {
        user = userResult.rows[0];
      }
      
      // Get current on-chain stake amount to ensure accuracy - using same method as frontend
      const { ethers } = require('ethers');
      const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://mainnet.base.org');
      const contractAddress = process.env.STEAKNSTAKE_CONTRACT_ADDRESS || '0xdA9BD5c259Ae90e99158f45f00238d1BaDb3694D';
      
      // Use exact same ABI and method as frontend (getStakedAmount)
      const contractABI = [
        {
          "inputs": [{"internalType": "address", "name": "user", "type": "address"}],
          "name": "getStakedAmount",
          "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
          "stateMutability": "view",
          "type": "function"
        }
      ];
      
      const contract = new ethers.Contract(contractAddress, contractABI, provider);
      const currentStakedWei = await contract.getStakedAmount(address);
      const currentStakedAmount = parseFloat(ethers.formatEther(currentStakedWei));
      
      logger.info('📊 Current on-chain stake:', { address, currentStakedAmount });
      
      // Update or create staking position with current on-chain amount
      const positionResult = await client.query(
        'SELECT * FROM staking_positions WHERE user_id = $1',
        [user.id]
      );
      
      if (positionResult.rows.length === 0) {
        // Create new position
        await client.query(`
          INSERT INTO staking_positions (user_id, staked_amount, staked_at, updated_at)
          VALUES ($1, $2, $3, $3)
        `, [user.id, currentStakedAmount, new Date()]);
        logger.info('✅ Created new staking position:', { userId: user.id, stakedAmount: currentStakedAmount });
      } else {
        // Update existing position
        await client.query(`
          UPDATE staking_positions 
          SET 
            staked_amount = $1,
            updated_at = $2
          WHERE user_id = $3
        `, [currentStakedAmount, new Date(), user.id]);
        logger.info('✅ Updated staking position:', { userId: user.id, stakedAmount: currentStakedAmount });
      }
      
      // Record the transaction
      if (amount && transactionHash) {
        await client.query(`
          INSERT INTO staking_transactions 
          (user_id, transaction_type, amount, transaction_hash, block_number, created_at)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [user.id, event.toUpperCase(), amount, transactionHash, blockNumber, new Date()]);
        logger.info('✅ Recorded staking transaction:', { event, amount, transactionHash });
      }
      
      await client.query('COMMIT');
      
      // Auto-refresh leaderboard cache after staking updates
      try {
        await client.query('SELECT refresh_leaderboard_cache()');
        logger.info('✅ Leaderboard cache auto-refreshed');
      } catch (cacheError) {
        logger.warn('⚠️ Failed to auto-refresh leaderboard cache:', cacheError.message);
      }
      
      client.release();
      
      res.json({
        success: true,
        message: 'Staking webhook processed successfully',
        data: {
          event,
          address,
          currentStakedAmount,
          userId: user.id
        }
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      client.release();
      throw error;
    }
    
  } catch (error) {
    logger.error('❌ Error processing staking webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process staking webhook',
      details: error.message
    });
  }
});

module.exports = router;

console.log('✅ STAKING ROUTE: Module exported successfully!');