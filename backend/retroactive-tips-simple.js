require('dotenv').config();
const axios = require('axios');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()]
});

// Process retroactive tips by calling our API for each found tip
async function processRetroactiveTips() {
  try {
    logger.info('🔄 Starting retroactive tip processing for recent casts...');
    
    // Search for casts mentioning @steaknstake with $STEAK
    const searchResponse = await axios.get('https://api.neynar.com/v2/farcaster/cast/search', {
      params: {
        q: '@steaknstake $STEAK',
        limit: 50,
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

    // Filter to last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - (24 * 60 * 60 * 1000));
    const recentCasts = casts.filter(cast => {
      const castTime = new Date(cast.timestamp);
      return castTime >= twentyFourHoursAgo;
    });

    logger.info(`Filtered to ${recentCasts.length} casts from last 24 hours`);

    let processedCount = 0;
    let skippedCount = 0;

    for (const cast of recentCasts) {
      try {
        // Parse tip from cast
        const tipData = parseTipFromCast(cast);
        if (!tipData) {
          logger.info(`⏭️ Skipping cast - no valid tip found: ${cast.hash}`);
          skippedCount++;
          continue;
        }

        logger.info(`🎯 Processing retroactive tip:`, {
          castHash: tipData.castHash,
          tipper: tipData.tipperUsername,
          recipient: tipData.recipientUsername,
          amount: tipData.tipAmount
        });

        // Process the tip through our secure endpoint
        await processRetroactiveTip(tipData);
        processedCount++;

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        logger.error(`❌ Error processing cast ${cast.hash}:`, error.message);
        skippedCount++;
      }
    }

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

// Process a single retroactive tip by calling our API
async function processRetroactiveTip(tipData) {
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
    // First, get the tipper's wallet address
    const userResponse = await axios.get(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${tipperFid}`, {
      headers: {
        'accept': 'application/json',
        'api_key': process.env.NEYNAR_API_KEY || '67AA399D-B5BA-4EA3-9A4D-315D151D7BBC'
      }
    });

    if (!userResponse.data?.users?.[0]?.verifications?.[0]) {
      logger.warn(`⚠️ No verified wallet found for tipper FID ${tipperFid} - skipping`);
      return;
    }

    const tipperWalletAddress = userResponse.data.users[0].verifications[0];

    // Call our secure tipping endpoint
    const tipRequest = {
      tipperWalletAddress,
      recipientFid,
      recipientUsername,
      tipAmount,
      castHash,
      castUrl,
      message: castText
    };

    const apiResponse = await axios.post('https://steaknstake-backend.onrender.com/api/tipping/send-secure', tipRequest, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 second timeout
    });

    if (apiResponse.data.success) {
      logger.info(`✅ Retroactive tip processed: ${tipAmount} STEAK from @${tipperUsername} to @${recipientUsername}`);
    } else {
      logger.error(`❌ Retroactive tip failed:`, apiResponse.data.error);
    }

  } catch (error) {
    if (error.response?.data) {
      logger.error('API Error processing retroactive tip:', error.response.data);
    } else {
      logger.error('Error processing retroactive tip:', error.message);
    }
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