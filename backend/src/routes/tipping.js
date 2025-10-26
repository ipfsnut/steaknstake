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

// POST /api/tipping/send - Send a tip via Farcaster
router.post('/send', async (req, res) => {
  try {
    const { 
      tipperWalletAddress,
      recipientFid,
      recipientUsername,
      tipAmount,
      castHash,
      castUrl,
      message 
    } = req.body;
    
    if (!tipperWalletAddress || !recipientFid || !tipAmount || tipAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Tipper wallet, recipient FID, and positive tip amount required'
      });
    }
    
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Get tipper user
      const tipperResult = await client.query(
        'SELECT * FROM users WHERE wallet_address = $1',
        [tipperWalletAddress.toLowerCase()]
      );
      
      if (tipperResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          error: 'Tipper not found'
        });
      }
      
      const tipper = tipperResult.rows[0];
      
      // CRITICAL: Prevent self-tipping via API (check if tipper FID matches recipient FID)
      // Force deployment - 2025-10-26T20:20:30Z
      if (tipper.farcaster_fid && parseInt(tipper.farcaster_fid) === parseInt(recipientFid)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: 'You cannot tip yourself! Tip allowances can only be given to others.'
        });
      }
      
      // Get tipper's staking position and available tip balance
      const positionResult = await client.query(
        'SELECT * FROM staking_positions WHERE user_id = $1',
        [tipper.id]
      );
      
      if (positionResult.rows.length === 0 || parseFloat(positionResult.rows[0].available_tip_balance) < tipAmount) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: 'Insufficient tip balance'
        });
      }
      
      // Check min/max tip amounts
      const settingsResult = await client.query(
        'SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ($1, $2)',
        ['min_tip_amount', 'max_tip_amount']
      );
      
      const settings = {};
      settingsResult.rows.forEach(row => {
        settings[row.setting_key] = parseFloat(row.setting_value);
      });
      
      if (tipAmount < (settings.min_tip_amount || 0.1)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: `Minimum tip amount is ${settings.min_tip_amount || 0.1} STEAK`
        });
      }
      
      if (tipAmount > (settings.max_tip_amount || 1000)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: `Maximum tip amount is ${settings.max_tip_amount || 1000} STEAK`
        });
      }
      
      // Deduct tip amount from tipper's available balance
      await client.query(`
        UPDATE staking_positions 
        SET 
          available_tip_balance = available_tip_balance - $1,
          updated_at = $2
        WHERE user_id = $3
      `, [tipAmount, new Date(), tipper.id]);
      
      // Create tip record
      const tipResult = await client.query(`
        INSERT INTO farcaster_tips 
        (tipper_user_id, recipient_fid, recipient_username, tip_amount, cast_hash, cast_url, message, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'SENT')
        RETURNING *
      `, [tipper.id, recipientFid, recipientUsername, tipAmount, castHash, castUrl, message]);
      
      await client.query('COMMIT');
      
      res.json({
        success: true,
        message: 'Tip sent successfully',
        data: {
          tipId: tipResult.rows[0].id,
          tipAmount,
          recipientFid,
          recipientUsername,
          castHash,
          message
        }
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    logger.error('Error sending tip:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send tip'
    });
  }
});

// GET /api/tipping/received/:fid - Get tips received by a Farcaster user
router.get('/received/:fid', async (req, res) => {
  try {
    const { fid } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    
    const client = await db.getClient();
    
    const tipsResult = await client.query(`
      SELECT 
        ft.*,
        u.wallet_address as tipper_wallet,
        u.farcaster_username as tipper_username,
        tc.id as claim_id,
        tc.claimed_amount,
        tc.claim_type,
        tc.claimed_at
      FROM farcaster_tips ft
      JOIN users u ON ft.tipper_user_id = u.id
      LEFT JOIN tip_claims tc ON ft.id = tc.tip_id
      WHERE ft.recipient_fid = $1
      ORDER BY ft.created_at DESC
      LIMIT $2 OFFSET $3
    `, [parseInt(fid), limit, offset]);
    
    client.release();
    
    const tips = tipsResult.rows.map(row => ({
      tipId: row.id,
      tipAmount: parseFloat(row.tip_amount),
      tipperWallet: row.tipper_wallet,
      tipperUsername: row.tipper_username,
      castHash: row.cast_hash,
      castUrl: row.cast_url,
      message: row.message,
      createdAt: row.created_at,
      isClaimed: !!row.claim_id,
      claimedAmount: row.claimed_amount ? parseFloat(row.claimed_amount) : null,
      claimType: row.claim_type,
      claimedAt: row.claimed_at
    }));
    
    // Calculate total unclaimed tips
    const unclaimedResult = await client.query(`
      SELECT COALESCE(SUM(ft.tip_amount), 0) as total_unclaimed
      FROM farcaster_tips ft
      LEFT JOIN tip_claims tc ON ft.id = tc.tip_id
      WHERE ft.recipient_fid = $1 AND tc.id IS NULL
    `, [parseInt(fid)]);
    
    res.json({
      success: true,
      data: {
        tips,
        totalUnclaimed: parseFloat(unclaimedResult.rows[0].total_unclaimed),
        pagination: {
          limit,
          offset,
          hasMore: tips.length === limit
        }
      }
    });
    
  } catch (error) {
    logger.error('Error getting received tips:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get received tips'
    });
  }
});

// GET /api/tipping/sent/:address - Get tips sent by a wallet address
router.get('/sent/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    
    const client = await db.getClient();
    
    // Get user
    const userResult = await client.query(
      'SELECT * FROM users WHERE wallet_address = $1',
      [address.toLowerCase()]
    );
    
    if (userResult.rows.length === 0) {
      return res.json({
        success: true,
        data: {
          tips: [],
          totalSent: 0,
          pagination: { limit, offset, hasMore: false }
        }
      });
    }
    
    const user = userResult.rows[0];
    
    const tipsResult = await client.query(`
      SELECT 
        ft.*,
        tc.id as claim_id,
        tc.claimed_amount,
        tc.claim_type,
        tc.claimed_at
      FROM farcaster_tips ft
      LEFT JOIN tip_claims tc ON ft.id = tc.tip_id
      WHERE ft.tipper_user_id = $1
      ORDER BY ft.created_at DESC
      LIMIT $2 OFFSET $3
    `, [user.id, limit, offset]);
    
    // Get total sent amount
    const totalResult = await client.query(`
      SELECT COALESCE(SUM(tip_amount), 0) as total_sent
      FROM farcaster_tips
      WHERE tipper_user_id = $1
    `, [user.id]);
    
    client.release();
    
    const tips = tipsResult.rows.map(row => ({
      tipId: row.id,
      tipAmount: parseFloat(row.tip_amount),
      recipientFid: row.recipient_fid,
      recipientUsername: row.recipient_username,
      castHash: row.cast_hash,
      castUrl: row.cast_url,
      message: row.message,
      createdAt: row.created_at,
      isClaimed: !!row.claim_id,
      claimedAmount: row.claimed_amount ? parseFloat(row.claimed_amount) : null,
      claimType: row.claim_type,
      claimedAt: row.claimed_at
    }));
    
    res.json({
      success: true,
      data: {
        tips,
        totalSent: parseFloat(totalResult.rows[0].total_sent),
        pagination: {
          limit,
          offset,
          hasMore: tips.length === limit
        }
      }
    });
    
  } catch (error) {
    logger.error('Error getting sent tips:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get sent tips'
    });
  }
});

// POST /api/tipping/claim - Claim received tips
router.post('/claim', async (req, res) => {
  try {
    const { 
      recipientWalletAddress,
      recipientFid,
      tipIds, // Array of tip IDs to claim
      claimType, // 'WITHDRAW' or 'STAKE'
      transactionHash,
      farcasterUsername
    } = req.body;
    
    if (!recipientWalletAddress || !recipientFid || !tipIds || !Array.isArray(tipIds) || tipIds.length === 0 || !claimType) {
      return res.status(400).json({
        success: false,
        error: 'Recipient wallet, FID, tip IDs array, and claim type required'
      });
    }
    
    if (!['WITHDRAW', 'STAKE'].includes(claimType)) {
      return res.status(400).json({
        success: false,
        error: 'Claim type must be WITHDRAW or STAKE'
      });
    }
    
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Get or create recipient user
      let userResult = await client.query(
        'SELECT * FROM users WHERE wallet_address = $1 OR farcaster_fid = $2',
        [recipientWalletAddress.toLowerCase(), parseInt(recipientFid)]
      );
      
      let user;
      if (userResult.rows.length === 0) {
        // Create new user
        const newUserResult = await client.query(`
          INSERT INTO users (wallet_address, farcaster_fid, farcaster_username)
          VALUES ($1, $2, $3)
          RETURNING *
        `, [recipientWalletAddress.toLowerCase(), parseInt(recipientFid), farcasterUsername]);
        user = newUserResult.rows[0];
      } else {
        user = userResult.rows[0];
        // Update user info if needed
        await client.query(`
          UPDATE users 
          SET 
            wallet_address = COALESCE($1, wallet_address),
            farcaster_fid = COALESCE($2, farcaster_fid),
            farcaster_username = COALESCE($3, farcaster_username),
            updated_at = $4
          WHERE id = $5
        `, [recipientWalletAddress.toLowerCase(), parseInt(recipientFid), farcasterUsername, new Date(), user.id]);
      }
      
      // Get unclaimed tips
      const tipsResult = await client.query(`
        SELECT ft.* 
        FROM farcaster_tips ft
        LEFT JOIN tip_claims tc ON ft.id = tc.tip_id
        WHERE ft.id = ANY($1) AND ft.recipient_fid = $2 AND tc.id IS NULL
      `, [tipIds, parseInt(recipientFid)]);
      
      if (tipsResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: 'No valid unclaimed tips found'
        });
      }
      
      const totalClaimAmount = tipsResult.rows.reduce((sum, tip) => sum + parseFloat(tip.tip_amount), 0);
      
      // Create tip claims
      for (const tip of tipsResult.rows) {
        await client.query(`
          INSERT INTO tip_claims 
          (tip_id, recipient_user_id, claimed_amount, claim_type, transaction_hash)
          VALUES ($1, $2, $3, $4, $5)
        `, [tip.id, user.id, tip.tip_amount, claimType, transactionHash]);
      }
      
      // If claiming as STAKE, add to user's staking position
      if (claimType === 'STAKE') {
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
          `, [user.id, totalClaimAmount, new Date()]);
        } else {
          // Update existing position
          await client.query(`
            UPDATE staking_positions 
            SET 
              staked_amount = staked_amount + $1,
              updated_at = $2
            WHERE user_id = $3
          `, [totalClaimAmount, new Date(), user.id]);
        }
        
        // Record staking transaction
        await client.query(`
          INSERT INTO staking_transactions 
          (user_id, transaction_type, amount, transaction_hash)
          VALUES ($1, 'STAKE', $2, $3)
        `, [user.id, totalClaimAmount, transactionHash]);
      }
      
      await client.query('COMMIT');
      
      res.json({
        success: true,
        message: `Tips claimed successfully as ${claimType.toLowerCase()}`,
        data: {
          claimedAmount: totalClaimAmount,
          claimType,
          tipsClaimed: tipsResult.rows.length,
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
    logger.error('Error claiming tips:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to claim tips'
    });
  }
});

// GET /api/tipping/stats - Get overall tipping statistics
router.get('/stats', async (req, res) => {
  try {
    const client = await db.getClient();
    
    const statsResult = await client.query(`
      SELECT 
        COUNT(*) as total_tips,
        COALESCE(SUM(tip_amount), 0) as total_volume,
        COUNT(DISTINCT tipper_user_id) as unique_tippers,
        COUNT(DISTINCT recipient_fid) as unique_recipients,
        COALESCE(AVG(tip_amount), 0) as avg_tip_amount
      FROM farcaster_tips
    `);
    
    const claimsResult = await client.query(`
      SELECT 
        COUNT(*) as total_claims,
        COALESCE(SUM(claimed_amount), 0) as total_claimed,
        COUNT(CASE WHEN claim_type = 'STAKE' THEN 1 END) as stakes_from_tips,
        COUNT(CASE WHEN claim_type = 'WITHDRAW' THEN 1 END) as withdrawals
      FROM tip_claims
    `);
    
    const unclaimedResult = await client.query(`
      SELECT COALESCE(SUM(ft.tip_amount), 0) as total_unclaimed
      FROM farcaster_tips ft
      LEFT JOIN tip_claims tc ON ft.id = tc.tip_id
      WHERE tc.id IS NULL
    `);
    
    client.release();
    
    const stats = statsResult.rows[0];
    const claims = claimsResult.rows[0];
    const unclaimed = unclaimedResult.rows[0];
    
    res.json({
      success: true,
      data: {
        totalTips: parseInt(stats.total_tips),
        totalVolume: parseFloat(stats.total_volume),
        uniqueTippers: parseInt(stats.unique_tippers),
        uniqueRecipients: parseInt(stats.unique_recipients),
        avgTipAmount: parseFloat(stats.avg_tip_amount),
        totalClaims: parseInt(claims.total_claims),
        totalClaimed: parseFloat(claims.total_claimed),
        stakesFromTips: parseInt(claims.stakes_from_tips),
        withdrawals: parseInt(claims.withdrawals),
        totalUnclaimed: parseFloat(unclaimed.total_unclaimed)
      }
    });
    
  } catch (error) {
    logger.error('Error getting tipping stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get tipping statistics'
    });
  }
});

module.exports = router;