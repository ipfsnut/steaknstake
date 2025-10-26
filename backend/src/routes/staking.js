const express = require('express');
const router = express.Router();
const db = require('../services/database');
const winston = require('winston');

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
    
    // Update position with new rewards
    const updatedPosition = await client.query(`
      UPDATE staking_positions 
      SET 
        total_rewards_earned = total_rewards_earned + $1,
        available_tip_balance = available_tip_balance + $1,
        last_reward_calculated = $2,
        updated_at = $2
      WHERE user_id = $3
      RETURNING *
    `, [newRewards, now, userId]);
    
    await client.query('COMMIT');
    
    return {
      availableTipBalance: parseFloat(updatedPosition.rows[0].available_tip_balance),
      totalRewardsEarned: parseFloat(updatedPosition.rows[0].total_rewards_earned),
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

// GET /api/staking/position/:address - Get user's staking position
router.get('/position/:address', async (req, res) => {
  try {
    const { address } = req.params;
    
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
    logger.error('Error getting staking position:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get staking position'
    });
  }
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
        COALESCE(SUM(available_tip_balance), 0) as total_available_tips
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
    logger.error('Error getting staking stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get staking statistics'
    });
  }
});

// GET /api/staking/leaderboard - Get top stakers
router.get('/leaderboard', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    
    const client = await db.getClient();
    
    const leaderboardResult = await client.query(`
      SELECT 
        u.wallet_address,
        u.farcaster_username,
        u.farcaster_fid,
        sp.staked_amount,
        sp.total_rewards_earned,
        sp.available_tip_balance,
        sp.staked_at,
        ROW_NUMBER() OVER (ORDER BY sp.staked_amount DESC) as rank
      FROM staking_positions sp
      JOIN users u ON sp.user_id = u.id
      WHERE sp.staked_amount > 0
      ORDER BY sp.staked_amount DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    
    client.release();
    
    const leaderboard = leaderboardResult.rows.map(row => ({
      rank: parseInt(row.rank),
      walletAddress: row.wallet_address,
      farcasterUsername: row.farcaster_username,
      farcasterFid: row.farcaster_fid,
      stakedAmount: parseFloat(row.staked_amount),
      totalRewardsEarned: parseFloat(row.total_rewards_earned),
      availableTipBalance: parseFloat(row.available_tip_balance),
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
        }
      }
    });
    
  } catch (error) {
    logger.error('Error getting leaderboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get leaderboard'
    });
  }
});

module.exports = router;