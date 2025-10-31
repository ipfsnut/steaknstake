const express = require('express');
const router = express.Router();
const db = require('../services/database');
const winston = require('winston');
const { generateFarcasterTipHash, generateDirectTipHash, isValidTipHash } = require('../utils/tipHash');
const { ethers } = require('ethers');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()]
});

// Note: Contract interactions are handled by batch processor, not during tipping

// POST /api/tipping/send - Send a tip via Farcaster
router.post('/send', async (req, res) => {
  try {
    logger.info('🎯 TIPPING API CALLED:', { 
      timestamp: new Date().toISOString(),
      body: req.body 
    });

    const { 
      tipperWalletAddress,
      tipperFid,
      tipperUsername,
      recipientFid,
      recipientUsername,
      tipAmount,
      castHash,
      castUrl,
      message 
    } = req.body;

    logger.info('📋 PARSED REQUEST DATA:', { 
      tipperWalletAddress, 
      tipperFid,
      tipperUsername,
      recipientFid, 
      recipientUsername, 
      tipAmount 
    });
    
    // Validate required parameters - accept either wallet address OR FID
    if ((!tipperWalletAddress && !tipperFid) || !recipientFid || !tipAmount || tipAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Tipper wallet or FID, recipient FID, and positive tip amount required'
      });
    }

    // Validate wallet address format if provided
    if (tipperWalletAddress && !ethers.isAddress(tipperWalletAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid tipper wallet address'
      });
    }

    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Get tipper user - try by FID first, then by wallet address
      let tipperResult;
      
      if (tipperFid) {
        logger.info('🔍 LOOKING UP TIPPER BY FID:', { fid: tipperFid, username: tipperUsername });
        tipperResult = await client.query(
          'SELECT * FROM users WHERE farcaster_fid = $1',
          [tipperFid]
        );
      } else {
        logger.info('🔍 LOOKING UP TIPPER BY WALLET:', { 
          wallet: tipperWalletAddress, 
          walletLowercase: tipperWalletAddress.toLowerCase() 
        });
        tipperResult = await client.query(
          'SELECT * FROM users WHERE wallet_address = $1',
          [tipperWalletAddress.toLowerCase()]
        );
      }

      logger.info('📊 TIPPER LOOKUP RESULT:', { 
        lookupMethod: tipperFid ? 'FID' : 'wallet',
        rowsFound: tipperResult.rows.length,
        foundUser: tipperResult.rows[0] ? { 
          id: tipperResult.rows[0].id, 
          wallet: tipperResult.rows[0].wallet_address,
          fid: tipperResult.rows[0].farcaster_fid 
        } : null
      });
      
      if (tipperResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          error: 'Tipper not found. Please connect your wallet first.'
        });
      }
      
      const tipper = tipperResult.rows[0];
      
      // CRITICAL: Prevent self-tipping
      if (tipper.farcaster_fid && parseInt(tipper.farcaster_fid) === parseInt(recipientFid)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: 'You cannot tip yourself! Tip allowances can only be given to others.'
        });
      }

      // Get or create recipient user with auto-registration
      let recipientResult = await client.query(
        'SELECT * FROM users WHERE farcaster_fid = $1',
        [recipientFid]
      );

      if (recipientResult.rows.length === 0) {
        // Auto-register recipient by fetching their wallet address from Farcaster
        let recipientWalletAddress = null;
        
        try {
          logger.info('Fetching wallet address for recipient FID:', recipientFid);
          const axios = require('axios');
          const userResponse = await axios.get(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${recipientFid}`, {
            headers: {
              'accept': 'application/json',
              'api_key': process.env.NEYNAR_API_KEY || '67AA399D-B5BA-4EA3-9A4D-315D151D7BBC'
            }
          });
          
          const user = userResponse.data?.users?.[0];
          if (user?.verifications?.length > 0) {
            // Use primary address (verified_addresses.eth_addresses[0]) if available, otherwise fall back to verifications[0]
            recipientWalletAddress = user.verified_addresses?.eth_addresses?.[0] || user.verifications[0];
            logger.info('Found wallet address for recipient:', { 
              recipientFid, 
              recipientWalletAddress,
              isPrimary: !!user.verified_addresses?.eth_addresses?.[0],
              totalVerifications: user.verifications.length 
            });
          } else {
            logger.info('No verified wallet found for recipient FID:', recipientFid);
          }
        } catch (error) {
          logger.error('Failed to fetch recipient wallet from Farcaster:', error.message);
        }
        
        // Only create user if we found their wallet address
        if (!recipientWalletAddress) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            error: `Recipient @${recipientUsername} needs to connect their wallet at steak.epicdylan.com first to receive tips.`
          });
        }

        // Create recipient user with their wallet address
        await client.query(
          'INSERT INTO users (farcaster_fid, farcaster_username, wallet_address) VALUES ($1, $2, $3) RETURNING *',
          [recipientFid, recipientUsername, recipientWalletAddress.toLowerCase()]
        );
        
        logger.info('Created new recipient user', { 
          recipientFid, 
          recipientUsername, 
          walletAddress: recipientWalletAddress 
        });
      }

      // Check tip amount limits
      const minTip = 0.1; // 0.1 STEAK minimum
      const maxTip = 100000; // 100k STEAK maximum per tip
      
      if (tipAmount < minTip) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: `Minimum tip amount is ${minTip} STEAK`
        });
      }
      
      if (tipAmount > maxTip) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: `Maximum tip amount is ${maxTip} STEAK`
        });
      }

      // Check tipper's database allocation instead of contract allowance
      const positionResult = await client.query(
        'SELECT daily_allowance_start, daily_tips_sent FROM staking_positions WHERE user_id = $1',
        [tipper.id]
      );
      
      if (positionResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: 'You must stake STEAK tokens to earn tip allowances. Visit steak.epicdylan.com to get started!'
        });
      }
      
      const position = positionResult.rows[0];
      const dailyAllowanceStart = parseFloat(position.daily_allowance_start) || 0;
      const dailyTipsSent = parseFloat(position.daily_tips_sent) || 0;
      const availableAllowance = dailyAllowanceStart - dailyTipsSent;

      if (availableAllowance < tipAmount) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: `Insufficient tip balance. Available: ${availableAllowance.toFixed(2)} STEAK, Required: ${tipAmount} STEAK`
        });
      }
      
      // Update tipper's daily tips sent
      await client.query(
        'UPDATE staking_positions SET daily_tips_sent = daily_tips_sent + $1 WHERE user_id = $2',
        [tipAmount, tipper.id]
      );

      // Store tip in database
      const tipResult = await client.query(
        `INSERT INTO farcaster_tips (
          tipper_user_id, recipient_fid, recipient_username, tip_amount, 
          cast_hash, cast_url, message, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING') RETURNING *`,
        [
          tipper.id,
          recipientFid,
          recipientUsername,
          tipAmount,
          castHash,
          castUrl,
          message || ''
        ]
      );

      await client.query('COMMIT');

      logger.info('Tip sent successfully', {
        tipId: tipResult.rows[0].id,
        tipper: tipperWalletAddress,
        recipientFid,
        amount: tipAmount
      });

      res.json({
        success: true,
        tip: {
          id: tipResult.rows[0].id,
          amount: tipAmount,
          recipient: {
            fid: recipientFid,
            username: recipientUsername
          },
          castHash,
          status: 'PENDING',
          message: 'Tip sent successfully!'
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    logger.error('Error in send:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
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