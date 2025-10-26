const express = require('express');
const router = express.Router();
const db = require('../services/database');
const winston = require('winston');
const fetch = require('node-fetch');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()]
});

// GET /api/farcaster/user/:fid - Get Farcaster user info and tip data
router.get('/user/:fid', async (req, res) => {
  try {
    const { fid } = req.params;
    
    const client = await db.getClient();
    
    // Get user if they exist in our system
    const userResult = await client.query(
      'SELECT * FROM users WHERE farcaster_fid = $1',
      [parseInt(fid)]
    );
    
    // Get received tips
    const tipsResult = await client.query(`
      SELECT 
        ft.*,
        u.wallet_address as tipper_wallet,
        u.farcaster_username as tipper_username,
        tc.id as claim_id
      FROM farcaster_tips ft
      JOIN users u ON ft.tipper_user_id = u.id
      LEFT JOIN tip_claims tc ON ft.id = tc.tip_id
      WHERE ft.recipient_fid = $1
      ORDER BY ft.created_at DESC
      LIMIT 10
    `, [parseInt(fid)]);
    
    // Get tip statistics
    const statsResult = await client.query(`
      SELECT 
        COUNT(*) as total_tips_received,
        COALESCE(SUM(ft.tip_amount), 0) as total_amount_received,
        COALESCE(SUM(CASE WHEN tc.id IS NULL THEN ft.tip_amount ELSE 0 END), 0) as unclaimed_amount,
        COUNT(CASE WHEN tc.id IS NULL THEN 1 END) as unclaimed_tips_count
      FROM farcaster_tips ft
      LEFT JOIN tip_claims tc ON ft.id = tc.tip_id
      WHERE ft.recipient_fid = $1
    `, [parseInt(fid)]);
    
    client.release();
    
    const user = userResult.rows[0] || null;
    const recentTips = tipsResult.rows.map(row => ({
      tipId: row.id,
      amount: parseFloat(row.tip_amount),
      tipperWallet: row.tipper_wallet,
      tipperUsername: row.tipper_username,
      message: row.message,
      castHash: row.cast_hash,
      castUrl: row.cast_url,
      createdAt: row.created_at,
      isClaimed: !!row.claim_id
    }));
    
    const stats = statsResult.rows[0];
    
    res.json({
      success: true,
      data: {
        fid: parseInt(fid),
        user: user ? {
          walletAddress: user.wallet_address,
          farcasterUsername: user.farcaster_username,
          hasConnectedWallet: !!user.wallet_address
        } : null,
        stats: {
          totalTipsReceived: parseInt(stats.total_tips_received),
          totalAmountReceived: parseFloat(stats.total_amount_received),
          unclaimedAmount: parseFloat(stats.unclaimed_amount),
          unclaimedTipsCount: parseInt(stats.unclaimed_tips_count)
        },
        recentTips
      }
    });
    
  } catch (error) {
    logger.error('Error getting Farcaster user info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get Farcaster user info'
    });
  }
});

// POST /api/farcaster/webhook - Handle Farcaster webhooks for tip detection
router.post('/webhook', async (req, res) => {
  try {
    const { type, data } = req.body;
    
    logger.info('Received Farcaster webhook:', { type, data });
    
    switch (type) {
      case 'cast.created':
        await handleCastCreated(data);
        break;
      case 'reaction.added':
        // Handle reactions to posts
        break;
      default:
        logger.info('Unhandled webhook type:', type);
    }
    
    res.json({
      success: true,
      message: 'Webhook processed'
    });
    
  } catch (error) {
    logger.error('Error processing Farcaster webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process webhook'
    });
  }
});

// Helper function to parse and process tip commands from casts
async function handleCastCreated(castData) {
  try {
    const { hash, author, text, parent_hash, parent_author } = castData;
    
    // Check if this is a reply with a tip command
    if (!parent_hash || !parent_author) return;
    
    // Look for tip patterns: "25 $STEAK", "$STEAK 10", "@steaknstake 5 $STEAK"
    const tipPatterns = [
      /(\d+(?:\.\d+)?)\s*\$STEAK/i,
      /\$STEAK\s*(\d+(?:\.\d+)?)/i,
      /@steaknstake\s+(\d+(?:\.\d+)?)\s*\$STEAK/i
    ];
    
    let tipAmount = null;
    for (const pattern of tipPatterns) {
      const match = text.match(pattern);
      if (match) {
        tipAmount = parseFloat(match[1]);
        break;
      }
    }
    
    if (!tipAmount || tipAmount <= 0) return;
    
    logger.info('Tip detected:', {
      hash,
      tipperFid: author.fid,
      tipperUsername: author.username,
      recipientFid: parent_author.fid,
      recipientUsername: parent_author.username,
      amount: tipAmount,
      text
    });
    
    // Process the actual tip through the tipping system
    await processTipFromFarcaster({
      hash,
      tipperFid: author.fid,
      tipperUsername: author.username,
      recipientFid: parent_author.fid,
      recipientUsername: parent_author.username,
      tipAmount,
      castText: text
    });
    
  } catch (error) {
    logger.error('Error handling cast created:', error);
  }
}

// Process tip detected from Farcaster webhook
async function processTipFromFarcaster(tipData) {
  const { hash, tipperFid, tipperUsername, recipientFid, recipientUsername, tipAmount, castText } = tipData;
  
  try {
    const client = await db.getClient();
    
    // Find tipper by Farcaster FID
    const tipperResult = await client.query(
      'SELECT * FROM users WHERE farcaster_fid = $1',
      [tipperFid]
    );
    
    if (tipperResult.rows.length === 0) {
      logger.warn(`Tip failed: Tipper FID ${tipperFid} (@${tipperUsername}) not found in database`);
      await postTipFailure(hash, tipperUsername, recipientUsername, tipAmount, 'Please connect your wallet at steak.epicdylan.com first!');
      client.release();
      return;
    }
    
    const tipper = tipperResult.rows[0];
    
    // CRITICAL: Prevent self-tipping (breaks the core mechanic)
    if (tipperFid === recipientFid) {
      logger.warn(`Tip failed: Self-tipping attempted. ${tipperUsername} tried to tip themselves ${tipAmount} $STEAK`);
      await postTipFailure(hash, tipperUsername, recipientUsername, tipAmount, 'You cannot tip yourself! Tip allowances can only be given to others. 🥩');
      client.release();
      return;
    }
    
    // Check if tipper has sufficient balance
    const positionResult = await client.query(
      'SELECT * FROM staking_positions WHERE user_id = $1',
      [tipper.id]
    );
    
    if (positionResult.rows.length === 0 || parseFloat(positionResult.rows[0].available_tip_balance) < tipAmount) {
      const currentBalance = positionResult.rows.length > 0 ? parseFloat(positionResult.rows[0].available_tip_balance) : 0;
      logger.warn(`Tip failed: Insufficient balance. ${tipperUsername} has ${currentBalance} but tried to tip ${tipAmount}`);
      await postTipFailure(hash, tipperUsername, recipientUsername, tipAmount, `Insufficient balance! You have ${currentBalance.toFixed(2)} $STEAK available to tip.`);
      client.release();
      return;
    }
    
    try {
      await client.query('BEGIN');
      
      // Deduct from tipper's balance
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
      `, [
        tipper.id,
        recipientFid,
        recipientUsername,
        tipAmount,
        hash,
        `https://warpcast.com/~/conversations/${hash}`,
        castText
      ]);
      
      await client.query('COMMIT');
      
      logger.info(`✅ Tip processed successfully: ${tipAmount} $STEAK from @${tipperUsername} to @${recipientUsername}`);
      
      // Post success confirmation
      await postTipSuccess(hash, tipperUsername, recipientUsername, tipAmount, tipResult.rows[0].id);
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    logger.error('Error processing Farcaster tip:', error);
    await postTipFailure(hash, tipperUsername, recipientUsername, tipAmount, 'Processing error - please try again!');
  }
}

// Helper function to post successful tip confirmation
async function postTipSuccess(parentHash, tipperUsername, recipientUsername, amount, tipId) {
  try {
    const confirmationText = `🎉 Tip sent! @${tipperUsername} tipped ${amount} $STEAK to @${recipientUsername}!

💝 @${recipientUsername}, visit steak.epicdylan.com to claim your tip!
🆔 Tip ID: ${tipId}`;

    await postToFarcaster(confirmationText, parentHash);
  } catch (error) {
    logger.error('Error posting tip success:', error);
  }
}

// Helper function to post tip failure message
async function postTipFailure(parentHash, tipperUsername, recipientUsername, amount, reason) {
  try {
    const failureText = `❌ Tip failed! @${tipperUsername} tried to tip ${amount} $STEAK to @${recipientUsername}

${reason}

Visit steak.epicdylan.com to stake and earn tip allowances! 🥩`;

    await postToFarcaster(failureText, parentHash);
  } catch (error) {
    logger.error('Error posting tip failure:', error);
  }
}

// Generic function to post messages to Farcaster
async function postToFarcaster(text, parentHash = null) {
  try {
    const requestBody = {
      signer_uuid: process.env.NEYNAR_SIGNER_UUID || '1256d313-59b6-40fc-8939-ed5bb0d5ed8a',
      text: text
    };
    
    if (parentHash) {
      requestBody.parent = parentHash;
    }

    const response = await fetch('https://api.neynar.com/v2/farcaster/cast', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api_key': process.env.NEYNAR_API_KEY || '67AA399D-B5BA-4EA3-9A4D-315D151D7BBC',
        'content-type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (response.ok) {
      logger.info('Message posted to Farcaster successfully');
      return await response.json();
    } else {
      const errorText = await response.text();
      logger.error('Failed to post to Farcaster:', errorText);
      throw new Error(`Farcaster API error: ${errorText}`);
    }
    
  } catch (error) {
    logger.error('Error posting to Farcaster:', error);
    throw error;
  }
}

// GET /api/farcaster/cast/:hash - Get cast info and associated tips
router.get('/cast/:hash', async (req, res) => {
  try {
    const { hash } = req.params;
    
    const client = await db.getClient();
    
    // Get tips associated with this cast
    const tipsResult = await client.query(`
      SELECT 
        ft.*,
        u.wallet_address as tipper_wallet,
        u.farcaster_username as tipper_username,
        tc.id as claim_id,
        tc.claim_type,
        tc.claimed_at
      FROM farcaster_tips ft
      JOIN users u ON ft.tipper_user_id = u.id
      LEFT JOIN tip_claims tc ON ft.id = tc.tip_id
      WHERE ft.cast_hash = $1
      ORDER BY ft.created_at DESC
    `, [hash]);
    
    client.release();
    
    const tips = tipsResult.rows.map(row => ({
      tipId: row.id,
      amount: parseFloat(row.tip_amount),
      tipperWallet: row.tipper_wallet,
      tipperUsername: row.tipper_username,
      recipientFid: row.recipient_fid,
      recipientUsername: row.recipient_username,
      message: row.message,
      createdAt: row.created_at,
      isClaimed: !!row.claim_id,
      claimType: row.claim_type,
      claimedAt: row.claimed_at
    }));
    
    const totalTipped = tips.reduce((sum, tip) => sum + tip.amount, 0);
    const totalClaimed = tips.filter(tip => tip.isClaimed).reduce((sum, tip) => sum + tip.amount, 0);
    
    res.json({
      success: true,
      data: {
        castHash: hash,
        tips,
        summary: {
          totalTips: tips.length,
          totalAmount: totalTipped,
          totalClaimed: totalClaimed,
          totalUnclaimed: totalTipped - totalClaimed,
          uniqueTippers: new Set(tips.map(tip => tip.tipperWallet)).size,
          uniqueRecipients: new Set(tips.map(tip => tip.recipientFid)).size
        }
      }
    });
    
  } catch (error) {
    logger.error('Error getting cast tips:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get cast tips'
    });
  }
});

// GET /api/farcaster/trending-tippers - Get trending tippers (most active in last 24h)
router.get('/trending-tippers', async (req, res) => {
  try {
    const hoursBack = parseInt(req.query.hours) || 24;
    const limit = parseInt(req.query.limit) || 10;
    
    const client = await db.getClient();
    
    const trendingResult = await client.query(`
      SELECT 
        u.wallet_address,
        u.farcaster_username,
        u.farcaster_fid,
        COUNT(ft.id) as tips_sent,
        COALESCE(SUM(ft.tip_amount), 0) as total_tipped,
        COALESCE(AVG(ft.tip_amount), 0) as avg_tip_amount
      FROM users u
      JOIN farcaster_tips ft ON u.id = ft.tipper_user_id
      WHERE ft.created_at >= NOW() - INTERVAL '${hoursBack} hours'
      GROUP BY u.id
      ORDER BY total_tipped DESC, tips_sent DESC
      LIMIT $1
    `, [limit]);
    
    client.release();
    
    const trendingTippers = trendingResult.rows.map((row, index) => ({
      rank: index + 1,
      walletAddress: row.wallet_address,
      farcasterUsername: row.farcaster_username,
      farcasterFid: row.farcaster_fid,
      tipsSent: parseInt(row.tips_sent),
      totalTipped: parseFloat(row.total_tipped),
      avgTipAmount: parseFloat(row.avg_tip_amount)
    }));
    
    res.json({
      success: true,
      data: {
        timeframe: `${hoursBack} hours`,
        trendingTippers
      }
    });
    
  } catch (error) {
    logger.error('Error getting trending tippers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get trending tippers'
    });
  }
});

// GET /api/farcaster/trending-recipients - Get trending tip recipients
router.get('/trending-recipients', async (req, res) => {
  try {
    const hoursBack = parseInt(req.query.hours) || 24;
    const limit = parseInt(req.query.limit) || 10;
    
    const client = await db.getClient();
    
    const trendingResult = await client.query(`
      SELECT 
        ft.recipient_fid,
        ft.recipient_username,
        COUNT(ft.id) as tips_received,
        COALESCE(SUM(ft.tip_amount), 0) as total_received,
        COALESCE(AVG(ft.tip_amount), 0) as avg_tip_amount,
        COUNT(DISTINCT ft.tipper_user_id) as unique_tippers
      FROM farcaster_tips ft
      WHERE ft.created_at >= NOW() - INTERVAL '${hoursBack} hours'
      GROUP BY ft.recipient_fid, ft.recipient_username
      ORDER BY total_received DESC, tips_received DESC
      LIMIT $1
    `, [limit]);
    
    client.release();
    
    const trendingRecipients = trendingResult.rows.map((row, index) => ({
      rank: index + 1,
      farcasterFid: row.recipient_fid,
      farcasterUsername: row.recipient_username,
      tipsReceived: parseInt(row.tips_received),
      totalReceived: parseFloat(row.total_received),
      avgTipAmount: parseFloat(row.avg_tip_amount),
      uniqueTippers: parseInt(row.unique_tippers)
    }));
    
    res.json({
      success: true,
      data: {
        timeframe: `${hoursBack} hours`,
        trendingRecipients
      }
    });
    
  } catch (error) {
    logger.error('Error getting trending recipients:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get trending recipients'
    });
  }
});

module.exports = router;