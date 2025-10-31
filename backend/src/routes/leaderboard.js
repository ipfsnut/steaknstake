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

// GET /api/leaderboard - Get real staking leaderboard
router.get('/', async (req, res) => {
  try {
    logger.info('📊 Fetching leaderboard data');
    const { limit = 50, filter, sort } = req.query;
    
    const client = await db.getClient();
    
    // Get real staking data with user information
    const leaderboardResult = await client.query(`
      SELECT 
        u.farcaster_username,
        u.wallet_address,
        sp.staked_amount,
        sp.total_rewards_earned,
        sp.staked_at,
        sp.daily_allowance_start,
        sp.daily_tips_sent,
        (sp.daily_allowance_start - sp.daily_tips_sent) as available_tips,
        RANK() OVER (ORDER BY sp.staked_amount DESC) as rank
      FROM staking_positions sp
      JOIN users u ON sp.user_id = u.id
      WHERE sp.staked_amount > 0
      ORDER BY sp.staked_amount DESC
      LIMIT $1
    `, [parseInt(limit)]);
    
    client.release();
    
    const leaderboard = leaderboardResult.rows.map(row => ({
      rank: parseInt(row.rank),
      username: row.farcaster_username || 'Unknown',
      address: row.wallet_address,
      stakedAmount: parseFloat(row.staked_amount).toLocaleString(),
      stakedAmountRaw: parseFloat(row.staked_amount),
      totalRewards: parseFloat(row.total_rewards_earned).toLocaleString(),
      availableTips: parseFloat(row.available_tips).toLocaleString(),
      stakingDate: row.staked_at,
      tipsSent: parseFloat(row.daily_tips_sent).toLocaleString()
    }));
    
    // Calculate stats from actual data
    const statsResult = await client.query(`
      SELECT 
        COUNT(*) as total_players,
        COALESCE(SUM(sp.staked_amount), 0) as total_staked
      FROM staking_positions sp
      WHERE sp.staked_amount > 0
    `);
    
    const stats = {
      totalPlayers: parseInt(statsResult.rows[0].total_players),
      activeStakers: leaderboard.length,
      totalStaked: parseFloat(statsResult.rows[0].total_staked).toLocaleString()
    };
    
    res.json({
      success: true,
      data: {
        leaderboard,
        stats,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch leaderboard'
    });
  }
});

// GET /api/leaderboard/top/:count - Get top N players
router.get('/top/:count', async (req, res) => {
  try {
    const count = Math.min(parseInt(req.params.count) || 10, 50);
    
    const client = await db.getClient();
    
    const leaderboardResult = await client.query(`
      SELECT 
        u.farcaster_username,
        u.wallet_address,
        sp.staked_amount,
        sp.total_rewards_earned,
        sp.staked_at,
        RANK() OVER (ORDER BY sp.staked_amount DESC) as rank
      FROM staking_positions sp
      JOIN users u ON sp.user_id = u.id
      WHERE sp.staked_amount > 0
      ORDER BY sp.staked_amount DESC
      LIMIT $1
    `, [count]);
    
    client.release();
    
    const leaderboard = leaderboardResult.rows.map(row => ({
      rank: parseInt(row.rank),
      username: row.farcaster_username || 'Unknown',
      address: row.wallet_address,
      stakedAmount: parseFloat(row.staked_amount).toLocaleString(),
      stakedAmountRaw: parseFloat(row.staked_amount),
      totalRewards: parseFloat(row.total_rewards_earned).toLocaleString(),
      stakingDate: row.staked_at
    }));
    
    res.json({
      success: true,
      data: leaderboard
    });
  } catch (error) {
    console.error('Error fetching top players:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch top players'
    });
  }
});

// GET /api/leaderboard/player/:address - Get specific player position
router.get('/player/:address', async (req, res) => {
  try {
    const { address } = req.params;
    
    const client = await db.getClient();
    
    // Get player's position
    const playerResult = await client.query(`
      WITH ranked_players AS (
        SELECT 
          u.farcaster_username,
          u.wallet_address,
          sp.staked_amount,
          sp.total_rewards_earned,
          sp.staked_at,
          RANK() OVER (ORDER BY sp.staked_amount DESC) as rank
        FROM staking_positions sp
        JOIN users u ON sp.user_id = u.id
        WHERE sp.staked_amount > 0
      )
      SELECT * FROM ranked_players
      WHERE LOWER(wallet_address) = LOWER($1)
    `, [address]);
    
    let player;
    if (playerResult.rows.length === 0) {
      player = {
        rank: null,
        address: address,
        stakedAmount: '0',
        stakedAmountRaw: 0,
        totalRewards: '0',
        stakingDate: null
      };
    } else {
      const row = playerResult.rows[0];
      player = {
        rank: parseInt(row.rank),
        username: row.farcaster_username || 'Unknown',
        address: row.wallet_address,
        stakedAmount: parseFloat(row.staked_amount).toLocaleString(),
        stakedAmountRaw: parseFloat(row.staked_amount),
        totalRewards: parseFloat(row.total_rewards_earned).toLocaleString(),
        stakingDate: row.staked_at
      };
    }
    
    // Get nearby players if ranked
    let context = null;
    if (player.rank) {
      const contextResult = await client.query(`
        WITH ranked_players AS (
          SELECT 
            u.farcaster_username,
            u.wallet_address,
            sp.staked_amount,
            RANK() OVER (ORDER BY sp.staked_amount DESC) as rank
          FROM staking_positions sp
          JOIN users u ON sp.user_id = u.id
          WHERE sp.staked_amount > 0
        )
        SELECT * FROM ranked_players
        WHERE rank IN ($1, $2)
      `, [player.rank - 1, player.rank + 1]);
      
      const above = contextResult.rows.find(p => parseInt(p.rank) === player.rank - 1);
      const below = contextResult.rows.find(p => parseInt(p.rank) === player.rank + 1);
      context = { above, below };
    }
    
    client.release();
    
    res.json({
      success: true,
      data: {
        player,
        context,
        needToClimb: player.rank ? player.rank - 1 : 'Need to stake',
        stakeDifference: player.rank && player.rank > 1 ? 
          (contextResult.rows.find(p => parseInt(p.rank) === 1)?.staked_amount || 0) - player.stakedAmountRaw : 0
      }
    });
  } catch (error) {
    console.error('Error fetching player position:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch player position'
    });
  }
});

// GET /api/leaderboard/history - Get recent distribution history
router.get('/history', async (req, res) => {
  try {
    const { days = 7 } = req.query;
    
    const client = await db.getClient();
    
    const historyResult = await client.query(`
      SELECT 
        calculation_date,
        total_rewards_distributed,
        total_staked,
        daily_reward_rate
      FROM reward_calculations
      WHERE calculation_date >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
      ORDER BY calculation_date DESC
    `);
    
    client.release();
    
    const distributions = historyResult.rows.map(row => ({
      date: row.calculation_date,
      totalDistributed: parseFloat(row.total_rewards_distributed).toFixed(2) + ' STEAK',
      totalStaked: parseFloat(row.total_staked).toFixed(2) + ' STEAK',
      rewardRate: (parseFloat(row.daily_reward_rate) * 100).toFixed(3) + '%'
    }));
    
    const totalDistributed = distributions.reduce((sum, d) => 
      sum + parseFloat(d.totalDistributed.replace(' STEAK', '')), 0
    );
    
    res.json({
      success: true,
      data: {
        distributions,
        totalDistributed: totalDistributed.toFixed(2) + ' STEAK',
        averageDaily: distributions.length > 0 ? 
          (totalDistributed / distributions.length).toFixed(2) + ' STEAK' : '0 STEAK',
        period: `Last ${days} days`
      }
    });
  } catch (error) {
    console.error('Error fetching distribution history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch distribution history'
    });
  }
});

// GET /api/leaderboard/decay-info - Get decay system information
router.get('/decay-info', (req, res) => {
  try {
    const decayInfo = {
      enabled: false,
      message: 'Decay system not currently implemented in SteakNStake'
    };
    res.json({
      success: true,
      data: decayInfo
    });
  } catch (error) {
    console.error('Error fetching decay info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch decay information'
    });
  }
});

module.exports = router;