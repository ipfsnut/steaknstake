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

// GET /api/users/profile/:address - Get user profile by wallet address
router.get('/profile/:address', async (req, res) => {
  try {
    const { address } = req.params;
    
    const client = await db.getClient();
    
    const userResult = await client.query(
      'SELECT * FROM users WHERE wallet_address = $1',
      [address.toLowerCase()]
    );
    
    if (userResult.rows.length === 0) {
      client.release();
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    const user = userResult.rows[0];
    
    // Get staking position
    const positionResult = await client.query(
      'SELECT * FROM staking_positions WHERE user_id = $1',
      [user.id]
    );
    
    // Get tip statistics
    const tipStatsResult = await client.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN ft.tipper_user_id = $1 THEN ft.tip_amount END), 0) as total_sent,
        COUNT(CASE WHEN ft.tipper_user_id = $1 THEN 1 END) as tips_sent,
        COALESCE(SUM(CASE WHEN ft.recipient_fid = $2 THEN ft.tip_amount END), 0) as total_received,
        COUNT(CASE WHEN ft.recipient_fid = $2 THEN 1 END) as tips_received
      FROM farcaster_tips ft
    `, [user.id, user.farcaster_fid || 0]);
    
    // Get unclaimed tips if user has Farcaster FID
    let unclaimedTips = 0;
    if (user.farcaster_fid) {
      const unclaimedResult = await client.query(`
        SELECT COALESCE(SUM(ft.tip_amount), 0) as unclaimed_tips
        FROM farcaster_tips ft
        LEFT JOIN tip_claims tc ON ft.id = tc.tip_id
        WHERE ft.recipient_fid = $1 AND tc.id IS NULL
      `, [user.farcaster_fid]);
      unclaimedTips = parseFloat(unclaimedResult.rows[0].unclaimed_tips);
    }
    
    client.release();
    
    const position = positionResult.rows[0] || {
      staked_amount: 0,
      total_rewards_earned: 0,
      available_tip_balance: 0,
      staked_at: null
    };
    
    const tipStats = tipStatsResult.rows[0];
    
    res.json({
      success: true,
      data: {
        user: {
          walletAddress: user.wallet_address,
          farcasterFid: user.farcaster_fid,
          farcasterUsername: user.farcaster_username,
          createdAt: user.created_at
        },
        staking: {
          stakedAmount: parseFloat(position.staked_amount),
          totalRewardsEarned: parseFloat(position.total_rewards_earned),
          availableTipBalance: parseFloat(position.available_tip_balance),
          stakedAt: position.staked_at
        },
        tipping: {
          totalSent: parseFloat(tipStats.total_sent),
          tipsSent: parseInt(tipStats.tips_sent),
          totalReceived: parseFloat(tipStats.total_received),
          tipsReceived: parseInt(tipStats.tips_received),
          unclaimedTips: unclaimedTips
        }
      }
    });
    
  } catch (error) {
    logger.error('Error getting user profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user profile'
    });
  }
});

// GET /api/users/farcaster/:fid - Get user profile by Farcaster FID
router.get('/farcaster/:fid', async (req, res) => {
  try {
    const { fid } = req.params;
    
    const client = await db.getClient();
    
    const userResult = await client.query(
      'SELECT * FROM users WHERE farcaster_fid = $1',
      [parseInt(fid)]
    );
    
    if (userResult.rows.length === 0) {
      client.release();
      return res.json({
        success: true,
        data: {
          user: null,
          hasWallet: false,
          unclaimedTips: 0
        }
      });
    }
    
    const user = userResult.rows[0];
    
    // Get unclaimed tips
    const unclaimedResult = await client.query(`
      SELECT COALESCE(SUM(ft.tip_amount), 0) as unclaimed_tips
      FROM farcaster_tips ft
      LEFT JOIN tip_claims tc ON ft.id = tc.tip_id
      WHERE ft.recipient_fid = $1 AND tc.id IS NULL
    `, [parseInt(fid)]);
    
    // Get tip statistics
    const tipStatsResult = await client.query(`
      SELECT 
        COALESCE(SUM(ft.tip_amount), 0) as total_received,
        COUNT(*) as tips_received
      FROM farcaster_tips ft
      WHERE ft.recipient_fid = $1
    `, [parseInt(fid)]);
    
    client.release();
    
    const unclaimedTips = parseFloat(unclaimedResult.rows[0].unclaimed_tips);
    const tipStats = tipStatsResult.rows[0];
    
    res.json({
      success: true,
      data: {
        user: {
          walletAddress: user.wallet_address,
          farcasterFid: user.farcaster_fid,
          farcasterUsername: user.farcaster_username
        },
        hasWallet: !!user.wallet_address,
        unclaimedTips: unclaimedTips,
        tipping: {
          totalReceived: parseFloat(tipStats.total_received),
          tipsReceived: parseInt(tipStats.tips_received)
        }
      }
    });
    
  } catch (error) {
    logger.error('Error getting user by FID:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user profile'
    });
  }
});

// PUT /api/users/profile/:address - Update user profile
router.put('/profile/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const { farcasterFid, farcasterUsername } = req.body;
    
    const client = await db.getClient();
    
    const userResult = await client.query(
      'SELECT * FROM users WHERE wallet_address = $1',
      [address.toLowerCase()]
    );
    
    if (userResult.rows.length === 0) {
      client.release();
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Update user profile
    const updatedUserResult = await client.query(`
      UPDATE users 
      SET 
        farcaster_fid = COALESCE($1, farcaster_fid),
        farcaster_username = COALESCE($2, farcaster_username),
        updated_at = $3
      WHERE wallet_address = $4
      RETURNING *
    `, [farcasterFid, farcasterUsername, new Date(), address.toLowerCase()]);
    
    client.release();
    
    const updatedUser = updatedUserResult.rows[0];
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        walletAddress: updatedUser.wallet_address,
        farcasterFid: updatedUser.farcaster_fid,
        farcasterUsername: updatedUser.farcaster_username,
        updatedAt: updatedUser.updated_at
      }
    });
    
  } catch (error) {
    logger.error('Error updating user profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update user profile'
    });
  }
});

// GET /api/users/search - Search users by Farcaster username
router.get('/search', async (req, res) => {
  try {
    const { username, limit = 10 } = req.query;
    
    if (!username || username.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Username query must be at least 2 characters'
      });
    }
    
    const client = await db.getClient();
    
    const searchResult = await client.query(`
      SELECT 
        u.wallet_address,
        u.farcaster_fid,
        u.farcaster_username,
        sp.staked_amount,
        sp.available_tip_balance
      FROM users u
      LEFT JOIN staking_positions sp ON u.id = sp.user_id
      WHERE u.farcaster_username ILIKE $1
      ORDER BY sp.staked_amount DESC NULLS LAST
      LIMIT $2
    `, [`%${username}%`, parseInt(limit)]);
    
    client.release();
    
    const users = searchResult.rows.map(row => ({
      walletAddress: row.wallet_address,
      farcasterFid: row.farcaster_fid,
      farcasterUsername: row.farcaster_username,
      stakedAmount: row.staked_amount ? parseFloat(row.staked_amount) : 0,
      availableTipBalance: row.available_tip_balance ? parseFloat(row.available_tip_balance) : 0
    }));
    
    res.json({
      success: true,
      data: {
        users,
        query: username,
        resultsCount: users.length
      }
    });
    
  } catch (error) {
    logger.error('Error searching users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search users'
    });
  }
});

// GET /api/users/leaderboard/tippers - Get top tippers leaderboard
router.get('/leaderboard/tippers', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    
    const client = await db.getClient();
    
    const leaderboardResult = await client.query(`
      SELECT 
        u.wallet_address,
        u.farcaster_username,
        u.farcaster_fid,
        COALESCE(SUM(ft.tip_amount), 0) as total_tipped,
        COUNT(ft.id) as tips_sent,
        sp.staked_amount,
        sp.available_tip_balance,
        ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(ft.tip_amount), 0) DESC) as rank
      FROM users u
      LEFT JOIN farcaster_tips ft ON u.id = ft.tipper_user_id
      LEFT JOIN staking_positions sp ON u.id = sp.user_id
      GROUP BY u.id, sp.staked_amount, sp.available_tip_balance
      HAVING COALESCE(SUM(ft.tip_amount), 0) > 0
      ORDER BY total_tipped DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    
    client.release();
    
    const leaderboard = leaderboardResult.rows.map(row => ({
      rank: parseInt(row.rank),
      walletAddress: row.wallet_address,
      farcasterUsername: row.farcaster_username,
      farcasterFid: row.farcaster_fid,
      totalTipped: parseFloat(row.total_tipped),
      tipsSent: parseInt(row.tips_sent),
      stakedAmount: row.staked_amount ? parseFloat(row.staked_amount) : 0,
      availableTipBalance: row.available_tip_balance ? parseFloat(row.available_tip_balance) : 0
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
    logger.error('Error getting tippers leaderboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get tippers leaderboard'
    });
  }
});

module.exports = router;