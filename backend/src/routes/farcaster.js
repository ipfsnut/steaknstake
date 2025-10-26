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
    
    // Store the tip in database (this would normally require sender to have staking balance)
    // For now, just log the detection - actual tip processing requires user to have balance
    
    // Respond with confirmation
    await postTipConfirmation(hash, author.username, parent_author.username, tipAmount);
    
  } catch (error) {
    logger.error('Error handling cast created:', error);
  }
}

// Helper function to post tip confirmation
async function postTipConfirmation(parentHash, tipperUsername, recipientUsername, amount) {
  try {
    const confirmationText = `🥩 Tip detected! @${tipperUsername} wants to tip ${amount} $STEAK to @${recipientUsername}! 

To complete this tip, you need:
1. Staked $STEAK balance in SteakNStake
2. Visit steak.epicdylan.com to stake first!

Tips come from your staking rewards - the more you stake, the more you can tip! 🔥`;

    const response = await fetch('https://api.neynar.com/v2/farcaster/cast', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api_key': process.env.NEYNAR_API_KEY || '67AA399D-B5BA-4EA3-9A4D-315D151D7BBC',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        signer_uuid: process.env.NEYNAR_SIGNER_UUID || '1256d313-59b6-40fc-8939-ed5bb0d5ed8a',
        text: confirmationText,
        parent: parentHash
      })
    });
    
    if (response.ok) {
      logger.info('Tip confirmation posted successfully');
    } else {
      logger.error('Failed to post tip confirmation:', await response.text());
    }
    
  } catch (error) {
    logger.error('Error posting tip confirmation:', error);
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