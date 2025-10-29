require('dotenv').config();
const axios = require('axios');
const winston = require('winston');
const db = require('./src/services/database');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()]
});

// Process retroactive tips from the last 5 hours
async function processRetroactiveTips() {
  try {
    logger.info('🔄 Starting retroactive tip processing for last 24 hours...');
    
    // Search for casts mentioning @steaknstake with $STEAK in the last 24 hours
    const hoursBack = 24;
    const searchResponse = await axios.get('https://api.neynar.com/v2/farcaster/cast/search', {
      params: {
        q: '@steaknstake $STEAK',
        limit: 50,
        // Note: Neynar's search API may not support time filtering, so we'll filter results
      },
      headers: {
        'accept': 'application/json',
        'api_key': process.env.NEYNAR_API_KEY || '67AA399D-B5BA-4EA3-9A4D-315D151D7BBC'
      }
    });

    if (!searchResponse.data?.result?.casts) {
      logger.info('No casts found with @steaknstake $STEAK mentions');
      return;
    }

    const casts = searchResponse.data.result.casts;
    logger.info(`Found ${casts.length} casts with @steaknstake $STEAK mentions`);

    // Filter to last 5 hours
    const fiveHoursAgo = new Date(Date.now() - (hoursBack * 60 * 60 * 1000));
    const recentCasts = casts.filter(cast => {
      const castTime = new Date(cast.timestamp);
      return castTime >= fiveHoursAgo;
    });

    logger.info(`Filtered to ${recentCasts.length} casts from last ${hoursBack} hours`);

    const client = await db.getClient();

    let processedCount = 0;
    let skippedCount = 0;

    for (const cast of recentCasts) {
      try {
        // Check if we already processed this cast
        const existingTip = await client.query(
          'SELECT id FROM farcaster_tips WHERE cast_hash = $1',
          [cast.hash]
        );

        if (existingTip.rows.length > 0) {
          logger.info(`⏭️ Skipping already processed cast: ${cast.hash}`);
          skippedCount++;
          continue;
        }

        // Parse tip from cast
        const tipData = parseTipFromCast(cast);
        if (!tipData) {
          logger.info(`⏭️ Skipping cast - no valid tip found: ${cast.hash}`);
          skippedCount++;
          continue;
        }

        logger.info(`🎯 Processing retroactive tip:`, tipData);

        // Process the tip through our secure endpoint
        await processRetroactiveTip(tipData, client);
        processedCount++;

      } catch (error) {
        logger.error(`❌ Error processing cast ${cast.hash}:`, error.message);
        skippedCount++;
      }
    }

    client.release();

    logger.info(`✅ Retroactive processing complete: ${processedCount} processed, ${skippedCount} skipped`);

  } catch (error) {
    logger.error('❌ Error in retroactive tip processing:', error);
  }
}

// Parse tip data from a cast
function parseTipFromCast(cast) {
  try {
    const { hash, author, text, parent_hash, parent_author, timestamp } = cast;

    // Must be a reply
    if (!parent_hash || !parent_author) {
      return null;
    }

    // Must mention @steaknstake
    if (!text.toLowerCase().includes('@steaknstake')) {
      return null;
    }

    // Extract tip amount
    const tipPatterns = [
      /@steaknstake\s+(\d+(?:\.\d+)?)\s*\$STEAK/i  // "@steaknstake 100 $STEAK"
    ];

    let tipAmount = null;
    for (const pattern of tipPatterns) {
      const match = text.match(pattern);
      if (match) {
        tipAmount = parseFloat(match[1]);
        break;
      }
    }

    if (!tipAmount || tipAmount <= 0) {
      return null;
    }

    return {
      castHash: hash,
      tipperFid: author.fid,
      tipperUsername: author.username,
      recipientFid: parent_author.fid,
      recipientUsername: parent_author.username,
      tipAmount,
      castText: text,
      castUrl: `https://warpcast.com/~/conversations/${hash}`,
      timestamp
    };

  } catch (error) {
    logger.error('Error parsing tip from cast:', error);
    return null;
  }
}

// Process a single retroactive tip
async function processRetroactiveTip(tipData, client) {
  const { 
    castHash, 
    tipperFid, 
    tipperUsername, 
    recipientFid, 
    recipientUsername, 
    tipAmount, 
    castText, 
    castUrl 
  } = tipData;

  try {
    await client.query('BEGIN');

    // Find tipper by FID
    const tipperResult = await client.query(
      'SELECT * FROM users WHERE farcaster_fid = $1',
      [tipperFid]
    );

    if (tipperResult.rows.length === 0) {
      logger.warn(`⚠️ Tipper FID ${tipperFid} (@${tipperUsername}) not found - skipping`);
      await client.query('ROLLBACK');
      return;
    }

    const tipper = tipperResult.rows[0];

    // Prevent self-tipping
    if (tipperFid === recipientFid) {
      logger.warn(`⚠️ Self-tip detected - skipping`);
      await client.query('ROLLBACK');
      return;
    }

    // Get or create recipient user (with auto-registration)
    let recipientResult = await client.query(
      'SELECT * FROM users WHERE farcaster_fid = $1',
      [recipientFid]
    );

    let recipient;
    if (recipientResult.rows.length === 0) {
      // Auto-register recipient by fetching their wallet address from Farcaster
      let recipientWalletAddress = null;
      
      try {
        logger.info('Fetching wallet address for recipient FID:', recipientFid);
        const userResponse = await axios.get(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${recipientFid}`, {
          headers: {
            'accept': 'application/json',
            'api_key': process.env.NEYNAR_API_KEY || '67AA399D-B5BA-4EA3-9A4D-315D151D7BBC'
          }
        });
        
        if (userResponse.data?.users?.[0]?.verifications?.[0]) {
          recipientWalletAddress = userResponse.data.users[0].verifications[0];
          logger.info('Found wallet address for recipient:', { recipientFid, recipientWalletAddress });
        }
      } catch (error) {
        logger.error('Failed to fetch recipient wallet from Farcaster:', error.message);
      }
      
      // Create recipient user with their wallet address (if found)
      const insertResult = await client.query(
        'INSERT INTO users (farcaster_fid, farcaster_username, wallet_address) VALUES ($1, $2, $3) RETURNING *',
        [recipientFid, recipientUsername, recipientWalletAddress]
      );
      recipient = insertResult.rows[0];
      
      logger.info('Created new recipient user for retroactive tip', { 
        recipientFid, 
        recipientUsername, 
        hasWallet: !!recipientWalletAddress 
      });
    } else {
      recipient = recipientResult.rows[0];
    }

    // Use secure tipping endpoint logic - call the actual API
    const tipRequest = {
      tipperWalletAddress: tipper.wallet_address,
      recipientFid,
      recipientUsername,
      tipAmount,
      castHash,
      castUrl,
      message: castText
    };

    // Call our secure tipping endpoint directly
    const apiResponse = await axios.post(`${process.env.API_BASE_URL || 'https://steaknstake-backend.onrender.com'}/api/tipping/send-secure`, tipRequest, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (apiResponse.data.success) {
      logger.info(`✅ Retroactive tip processed successfully: ${tipAmount} STEAK from @${tipperUsername} to @${recipientUsername}`);
    } else {
      logger.error(`❌ Retroactive tip failed:`, apiResponse.data.error);
    }

    await client.query('COMMIT');

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error processing retroactive tip:', error.message);
    throw error;
  }
}

// Run the retroactive processor
if (require.main === module) {
  processRetroactiveTips()
    .then(() => {
      logger.info('🏁 Retroactive tip processing finished');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('💥 Retroactive tip processing failed:', error);
      process.exit(1);
    });
}

module.exports = { processRetroactiveTips };