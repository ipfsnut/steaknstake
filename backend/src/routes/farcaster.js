const express = require('express');
const router = express.Router();
const db = require('../services/database');
const winston = require('winston');
const axios = require('axios');

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

// GET /api/farcaster/webhook - Webhook validation endpoint
router.get('/webhook', (req, res) => {
  res.json({
    success: true,
    message: 'Webhook endpoint is active',
    timestamp: new Date().toISOString()
  });
});

// POST /api/farcaster/webhook - Handle Farcaster webhooks for tip detection
router.post('/webhook', async (req, res) => {
  try {
    const { type, data } = req.body;
    
    // Log EVERYTHING for debugging
    logger.info('🌐 WEBHOOK EVENT RECEIVED:', { 
      type, 
      timestamp: new Date().toISOString(),
      castHash: data?.hash,
      author: data?.author?.username 
    });
    logger.info('🌐 WEBHOOK FULL PAYLOAD:', JSON.stringify(req.body, null, 2));
    
    logger.info('🌐 WEBHOOK RECEIVED:', { 
      type, 
      castHash: data?.hash, 
      authorFid: data?.author?.fid,
      authorUsername: data?.author?.username,
      text: data?.text,
      parentHash: data?.parent_hash,
      parentAuthorFid: data?.parent_author?.fid,
      parentAuthorUsername: data?.parent_author?.username,
      parentAuthorDisplayName: data?.parent_author?.display_name,
      parentAuthorData: data?.parent_author,
      timestamp: new Date().toISOString()
    });
    
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
    
    logger.info('🔍 CAST ANALYSIS:', {
      hash,
      authorFid: author?.fid,
      authorUsername: author?.username,
      text,
      hasParent: !!parent_hash,
      parentHash: parent_hash,
      parentAuthorFid: parent_author?.fid,
      parentAuthorUsername: parent_author?.username
    });
    
    // Check if this is a reply with a tip command
    if (!parent_hash || !parent_author) {
      logger.info('❌ SKIP: Not a reply (no parent_hash or parent_author)');
      return;
    }
    
    // Early check: Must mention @steaknstake to be a tip
    if (!text.toLowerCase().includes('@steaknstake')) {
      logger.info('❌ SKIP: No bot mention (@steaknstake not found in text)');
      return;
    }
    
    // Check for batch processing commands first
    const batchCommands = [
      /@steaknstake\s+(process|batch|trigger)(\s+tips?)?/i,  // "@steaknstake process", "@steaknstake batch", "@steaknstake trigger tips"
      /@steaknstake\s+(process\s+tips|batch\s+tips)/i       // "@steaknstake process tips", "@steaknstake batch tips"
    ];
    
    for (const command of batchCommands) {
      if (text.match(command)) {
        logger.info('🔧 BATCH COMMAND DETECTED:', { text, command: command.toString() });
        await handleBatchCommand(author, hash);
        return;
      }
    }
    
    // REQUIRED: Bot must be tagged for tip detection
    const tipPatterns = [
      /@steaknstake\s+(\d+(?:\.\d+)?)\s*\$STEAK/i  // "@steaknstake 100 $STEAK"
    ];
    
    logger.info('🔎 TIP PATTERN MATCHING:', {
      text,
      patterns: tipPatterns.map(p => p.toString())
    });
    
    let tipAmount = null;
    for (let i = 0; i < tipPatterns.length; i++) {
      const pattern = tipPatterns[i];
      const match = text.match(pattern);
      logger.info(`📝 Pattern ${i + 1} (${pattern}):`, { 
        matched: !!match, 
        groups: match ? match : 'no match' 
      });
      if (match) {
        tipAmount = parseFloat(match[1]);
        logger.info(`✅ TIP DETECTED: ${tipAmount} STEAK`);
        break;
      }
    }
    
    if (!tipAmount || tipAmount <= 0) {
      logger.info('❌ SKIP: No valid tip amount found', { tipAmount });
      return;
    }
    
    logger.info('Tip detected:', {
      hash,
      tipperFid: author.fid,
      tipperUsername: author.username,
      recipientFid: parent_author.fid,
      recipientUsername: parent_author.username,
      amount: tipAmount,
      text
    });
    
    // Get recipient username by fetching user details from Neynar API using FID
    let recipientUsername = 'unknown';
    
    if (parent_author?.fid) {
      try {
        logger.info('🔍 FETCHING PARENT AUTHOR DETAILS:', { parentAuthorFid: parent_author.fid });
        
        const userResponse = await axios.get(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${parent_author.fid}`, {
          headers: {
            'accept': 'application/json',
            'api_key': process.env.NEYNAR_API_KEY || '67AA399D-B5BA-4EA3-9A4D-315D151D7BBC'
          }
        });
        
        if (userResponse.data?.users?.[0]?.username) {
          recipientUsername = userResponse.data.users[0].username;
          logger.info('✅ RESOLVED RECIPIENT USERNAME:', { recipientUsername });
        } else {
          logger.warn('⚠️ No username found in Neynar response:', userResponse.data);
        }
        
      } catch (error) {
        logger.error('❌ Failed to fetch parent author details:', error.message);
        recipientUsername = `user_${parent_author.fid}`; // Fallback to FID-based name
      }
    } else {
      logger.warn('⚠️ No parent_author.fid available for recipient lookup');
    }
    
    logger.info('🔍 FINAL RECIPIENT PARSING:', {
      parentAuthorFid: parent_author?.fid,
      resolvedUsername: recipientUsername
    });
    
    // Process the actual tip through our consolidated tipping API
    await processTipFromFarcaster({
      hash,
      tipperFid: author.fid,
      tipperUsername: author.username,
      recipientFid: parent_author.fid,
      recipientUsername: recipientUsername,
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
  
  logger.info('🎯 ENTERING processTipFromFarcaster:', { 
    hash, tipperFid, tipperUsername, recipientFid, recipientUsername, tipAmount,
    timestamp: new Date().toISOString() 
  });
  
  try {
    // Call our consolidated tipping API with FID for lookup
    const tipRequest = {
      tipperFid,
      tipperUsername,
      recipientFid,
      recipientUsername,
      tipAmount,
      castHash: hash,
      castUrl: `https://warpcast.com/~/conversations/${hash}`,
      message: castText
    };

    logger.info('🔄 Calling consolidated tipping API:', tipRequest);

    // Use production URL in production, localhost in development
    const apiUrl = process.env.NODE_ENV === 'production' 
      ? 'https://steaknstake-backend.onrender.com/api/tipping/send'
      : 'http://localhost:10000/api/tipping/send';
    
    logger.info('🔗 Making API call to:', apiUrl);

    const apiResponse = await axios.post(apiUrl, tipRequest, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    logger.info('📥 API Response received:', { success: apiResponse.data.success, status: apiResponse.status });

    if (apiResponse.data.success) {
      logger.info(`✅ Tip processed successfully via API: ${tipAmount} $STEAK from @${tipperUsername} to @${recipientUsername}`);
      logger.info('🏁 EXITING processTipFromFarcaster: SUCCESS');
      await postTipSuccess(hash, tipperUsername, recipientUsername, tipAmount, apiResponse.data.tip.id);
    } else {
      logger.error(`❌ API tip failed:`, apiResponse.data.error);
      logger.info('🏁 EXITING processTipFromFarcaster: API_FAILURE');
      // Preserve specific error message from API
      await postTipFailure(hash, tipperUsername, recipientUsername, tipAmount, apiResponse.data.error || 'API returned no error details');
    }
    
  } catch (error) {
    logger.error('❌ Error processing Farcaster tip:', {
      error: error.message,
      stack: error.stack,
      responseData: error.response?.data,
      responseStatus: error.response?.status,
      tipData: { tipperFid, tipperUsername, recipientFid, recipientUsername, tipAmount }
    });
    
    // Preserve specific error messages instead of masking them
    let errorMessage = 'Unknown error occurred';
    if (error.response?.data?.error) {
      errorMessage = error.response.data.error;
    } else if (error.message.includes('ECONNREFUSED')) {
      errorMessage = 'Unable to connect to tipping service';
    } else if (error.message.includes('timeout')) {
      errorMessage = 'Tipping service timeout - please try again';
    } else {
      errorMessage = error.message;
    }
    
    logger.info('🏁 EXITING processTipFromFarcaster: EXCEPTION', { errorMessage });
    await postTipFailure(hash, tipperUsername, recipientUsername, tipAmount, errorMessage);
  }
}

// Helper function to post successful tip confirmation
async function postTipSuccess(parentHash, tipperUsername, recipientUsername, amount, tipId) {
  try {
    const confirmationText = `✅ Your tip has been recorded and will be processed at midnight UTC.

🎉 @${tipperUsername} tipped ${amount} $STEAK to @${recipientUsername}!

💝 @${recipientUsername}, you can claim it from the SteakNStake miniapp at: https://farcaster.xyz/miniapps/_5-QJXmMm-hF/steak-n-stake

🆔 Tip ID: ${tipId}`;

    await postToFarcaster(confirmationText, parentHash);
  } catch (error) {
    logger.error('Error posting tip success:', error);
  }
}

// Helper function to post pending tip notification
async function postTipPending(parentHash, tipperUsername, recipientUsername, amount) {
  try {
    const confirmationText = `⏳ Your tip has been recorded and will be processed at midnight UTC.

🎉 @${tipperUsername} tipped ${amount} $STEAK to @${recipientUsername}!

💝 @${recipientUsername}, connect your wallet at the SteakNStake miniapp to claim: https://steak.epicdylan.com`;

    await postToFarcaster(confirmationText, parentHash);
  } catch (error) {
    logger.error('Error posting tip pending:', error);
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

    const response = await axios.post('https://api.neynar.com/v2/farcaster/cast', requestBody, {
      headers: {
        'accept': 'application/json',
        'api_key': process.env.NEYNAR_API_KEY || '67AA399D-B5BA-4EA3-9A4D-315D151D7BBC',
        'content-type': 'application/json'
      }
    });
    
    if (response.status >= 200 && response.status < 300) {
      logger.info('Message posted to Farcaster successfully');
      return response.data;
    } else {
      logger.error('Failed to post to Farcaster:', response.data);
      throw new Error(`Farcaster API error: ${JSON.stringify(response.data)}`);
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

// GET /api/farcaster/profiles/:fids - Get Farcaster profile info including avatars for multiple FIDs
router.get('/profiles/:fids', async (req, res) => {
  try {
    const { fids } = req.params;
    
    // Validate FIDs parameter
    if (!fids) {
      return res.status(400).json({
        success: false,
        error: 'FIDs parameter is required'
      });
    }
    
    // Clean and validate FIDs
    const fidArray = fids.split(',')
      .map(fid => parseInt(fid.trim()))
      .filter(fid => !isNaN(fid) && fid > 0);
    
    if (fidArray.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid FIDs provided'
      });
    }
    
    // Limit to prevent abuse
    if (fidArray.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 100 FIDs allowed per request'
      });
    }
    
    logger.info('📸 Fetching Farcaster profiles for FIDs:', fidArray);
    
    // Fetch user details from Neynar API
    const userResponse = await axios.get(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${fidArray.join(',')}`, {
      headers: {
        'accept': 'application/json',
        'api_key': process.env.NEYNAR_API_KEY || '67AA399D-B5BA-4EA3-9A4D-315D151D7BBC'
      }
    });
    
    if (!userResponse.data?.users) {
      return res.status(404).json({
        success: false,
        error: 'No users found for provided FIDs'
      });
    }
    
    // Transform response to include relevant profile data
    const profiles = userResponse.data.users.map(user => ({
      fid: user.fid,
      username: user.username,
      displayName: user.display_name,
      avatarUrl: user.pfp_url,
      bio: user.profile?.bio?.text || '',
      followerCount: user.follower_count || 0,
      followingCount: user.following_count || 0,
      verifications: user.verifications || []
    }));
    
    logger.info(`✅ Successfully fetched ${profiles.length} Farcaster profiles`);
    
    res.json({
      success: true,
      data: {
        profiles,
        totalFound: profiles.length,
        requestedFids: fidArray
      }
    });
    
  } catch (error) {
    logger.error('Error fetching Farcaster profiles:', error);
    
    if (error.response?.status === 401) {
      return res.status(500).json({
        success: false,
        error: 'Neynar API authentication failed'
      });
    }
    
    if (error.response?.status === 429) {
      return res.status(429).json({
        success: false,
        error: 'Rate limited by Neynar API'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch Farcaster profiles'
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

// GET /api/farcaster/webhook-test - Simple test endpoint
router.get('/webhook-test', (req, res) => {
  logger.info('🧪 Webhook test endpoint hit');
  res.json({
    success: true,
    message: 'Webhook endpoint is working',
    timestamp: new Date().toISOString()
  });
});

// POST /api/farcaster/webhook-test - Test POST endpoint
router.post('/webhook-test', (req, res) => {
  logger.info('🧪 Webhook POST test:', req.body);
  res.json({
    success: true,
    message: 'Webhook POST endpoint is working',
    receivedBody: req.body,
    timestamp: new Date().toISOString()
  });
});

// Handle batch processing commands from Farcaster
async function handleBatchCommand(author, castHash) {
  const { triggerBatchProcessing } = require('../services/batchProcessor');
  
  try {
    logger.info(`🔧 Processing batch command from @${author.username} (FID: ${author.fid})`);
    
    // Trigger the batch processing
    logger.info('🚀 Triggering batch processor...');
    await triggerBatchProcessing();
    
    // Reply with confirmation
    const confirmationText = `🔥 Batch processing triggered! 
    
All pending tips are now being processed for claiming. Recipients with connected wallets will receive STEAK token allowances within moments.

Check your tips at steak.epicdylan.com 🥩`;

    await postToFarcaster(confirmationText, castHash);
    
    logger.info(`✅ Batch processing completed and confirmation sent to @${author.username}`);
    
  } catch (error) {
    logger.error('❌ Batch command failed:', error);
    
    // Reply with error message
    const errorText = `⚠️ Batch processing failed. Please try again or contact support.`;
    
    try {
      await postToFarcaster(errorText, castHash);
    } catch (replyError) {
      logger.error('❌ Failed to send error reply:', replyError);
    }
  }
}

module.exports = router;