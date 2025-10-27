const cron = require('node-cron');
const winston = require('winston');
const db = require('./database');
const { callContractSplit } = require('./contractService');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()]
});

// Batch process pending tips and allocate next day's allowances at midnight UTC
function startBatchProcessor() {
  logger.info('🤖 Starting batch processor for daily tip cycle');
  
  // Run at midnight UTC every day (0 0 * * *)
  cron.schedule('0 0 * * *', async () => {
    logger.info('🌙 Daily tip cycle processing started at midnight UTC');
    await runDailyTipCycle();
  }, {
    timezone: "UTC"
  });
  
  logger.info('⏰ Batch processor scheduled for daily execution at midnight UTC');
}

// Complete daily tip cycle: process yesterday's tips + allocate today's allowances
async function runDailyTipCycle() {
  logger.info('🔄 Starting complete daily tip cycle');
  
  try {
    // Step 1: Process and validate yesterday's tips
    logger.info('📊 Step 1: Processing yesterday\'s tips...');
    await processPendingTips();
    
    // Step 2: Calculate and distribute today's tip allowances
    logger.info('💰 Step 2: Allocating today\'s tip allowances...');
    await allocateDailyTipAllowances();
    
    logger.info('✅ Daily tip cycle completed successfully');
    
  } catch (error) {
    logger.error('❌ Daily tip cycle failed:', error);
    throw error;
  }
}

// Process all pending tips from the last 24 hours
async function processPendingTips() {
  const client = await db.getClient();
  
  try {
    logger.info('📊 Starting batch tip processing...');
    
    // Get all unprocessed tips from the last 24 hours
    const pendingTipsResult = await client.query(`
      SELECT 
        ft.*,
        u.wallet_address as tipper_wallet,
        u.farcaster_username as tipper_username
      FROM farcaster_tips ft
      JOIN users u ON ft.tipper_user_id = u.id
      WHERE ft.status = 'SENT' 
      AND ft.created_at >= NOW() - INTERVAL '24 hours'
      ORDER BY ft.created_at ASC
    `);
    
    const pendingTips = pendingTipsResult.rows;
    logger.info(`📝 Found ${pendingTips.length} pending tips to process`);
    
    if (pendingTips.length === 0) {
      logger.info('✅ No pending tips to process');
      return;
    }
    
    // Group tips by recipient for batch processing
    const tipsByRecipient = {};
    let totalTipAmount = 0;
    
    for (const tip of pendingTips) {
      if (!tipsByRecipient[tip.recipient_fid]) {
        tipsByRecipient[tip.recipient_fid] = {
          recipientFid: tip.recipient_fid,
          recipientUsername: tip.recipient_username,
          tips: [],
          totalAmount: 0
        };
      }
      
      tipsByRecipient[tip.recipient_fid].tips.push(tip);
      tipsByRecipient[tip.recipient_fid].totalAmount += parseFloat(tip.tip_amount);
      totalTipAmount += parseFloat(tip.tip_amount);
    }
    
    logger.info(`💰 Total tip amount to process: ${totalTipAmount} STEAK`);
    logger.info(`👥 Recipients: ${Object.keys(tipsByRecipient).length}`);
    
    // Call smart contract split() function to distribute rewards
    await processContractSplit(totalTipAmount);
    
    // Mark all tips as processed
    await client.query('BEGIN');
    
    for (const tip of pendingTips) {
      await client.query(`
        UPDATE farcaster_tips 
        SET 
          status = 'PROCESSED',
          processed_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
      `, [tip.id]);
    }
    
    await client.query('COMMIT');
    
    logger.info('✅ Batch tip processing completed successfully');
    
    // Post summary to Farcaster
    await postBatchSummary(Object.keys(tipsByRecipient).length, totalTipAmount, pendingTips.length);
    
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('❌ Batch tip processing failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Allocate daily tip allowances to all stakers based on rewards
async function allocateDailyTipAllowances() {
  const client = await db.getClient();
  
  try {
    logger.info('🎯 Starting daily tip allowance allocation...');
    
    // Get total staked amount and number of stakers
    const stakingStatsResult = await client.query(`
      SELECT 
        COUNT(*) as total_stakers,
        COALESCE(SUM(staked_amount), 0) as total_staked
      FROM staking_positions 
      WHERE staked_amount > 0
    `);
    
    const { total_stakers, total_staked } = stakingStatsResult.rows[0];
    logger.info(`📊 Staking stats: ${total_stakers} stakers, ${total_staked} total staked`);
    
    if (total_stakers == 0 || total_staked == 0) {
      logger.info('⚠️ No stakers found, skipping allocation');
      return;
    }
    
    // Calculate daily reward amount (configurable)
    const dailyRewardPool = parseFloat(process.env.DAILY_REWARD_POOL || '100'); // 100 STEAK per day default
    logger.info(`💰 Daily reward pool: ${dailyRewardPool} STEAK`);
    
    // Call smart contract split() function to create tip allowances
    await processContractSplit(dailyRewardPool);
    
    // Update database with new tip allowances (proportional to stake)
    const stakersResult = await client.query(`
      SELECT sp.*, u.farcaster_username 
      FROM staking_positions sp
      JOIN users u ON sp.user_id = u.id
      WHERE sp.staked_amount > 0
      ORDER BY sp.staked_amount DESC
    `);
    
    await client.query('BEGIN');
    
    for (const staker of stakersResult.rows) {
      const stakePercent = parseFloat(staker.staked_amount) / parseFloat(total_staked);
      const dailyAllowance = dailyRewardPool * stakePercent;
      
      // Add to their available tip balance
      await client.query(`
        UPDATE staking_positions 
        SET 
          available_tip_balance = available_tip_balance + $1,
          total_rewards_earned = total_rewards_earned + $1,
          last_reward_calculated = NOW(),
          updated_at = NOW()
        WHERE user_id = $2
      `, [dailyAllowance, staker.user_id]);
      
      logger.info(`💝 Allocated ${dailyAllowance.toFixed(4)} STEAK to @${staker.farcaster_username} (${(stakePercent * 100).toFixed(2)}% stake)`);
    }
    
    await client.query('COMMIT');
    
    logger.info('✅ Daily tip allowance allocation completed');
    
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('❌ Daily tip allowance allocation failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Call the smart contract split() function to distribute rewards
async function processContractSplit(rewardAmount) {
  logger.info(`🔗 Processing contract split for ${rewardAmount} STEAK rewards`);
  
  try {
    // Call the actual smart contract split() function
    const result = await callContractSplit(rewardAmount);
    
    logger.info(`✅ Contract split successful:`, {
      transactionHash: result.transactionHash,
      blockNumber: result.blockNumber,
      gasUsed: result.gasUsed,
      rewardAmount
    });
    
    return result;
    
  } catch (error) {
    logger.error(`❌ Contract split failed for ${rewardAmount} STEAK:`, error);
    throw new Error(`Failed to call contract split(): ${error.message}`);
  }
}

// Post batch processing summary to Farcaster
async function postBatchSummary(recipientCount, totalAmount, tipCount) {
  try {
    logger.info(`📢 Posting batch summary: ${tipCount} tips, ${totalAmount} STEAK to ${recipientCount} recipients`);
    
    const message = `🌙 Daily tip processing complete!
    
📊 ${tipCount} tips processed
💰 ${totalAmount.toFixed(2)} $STEAK distributed  
👥 ${recipientCount} recipients
🕛 Processed at midnight UTC

Tip allowances are now available for claiming! 🥩`;
    
    // TODO: Post to Farcaster using Neynar API
    logger.info('📝 Would post to Farcaster:', message);
    
  } catch (error) {
    logger.error('❌ Failed to post batch summary:', error);
  }
}

// Manual trigger for testing (can be called via API endpoint)
async function triggerBatchProcessing() {
  logger.info('🔧 Manual batch processing triggered');
  await runDailyTipCycle();
}

// Test contract split function
async function testContractSplit(amount = 1) {
  logger.info(`🧪 Testing contract split with ${amount} STEAK`);
  try {
    const result = await processContractSplit(amount);
    logger.info('✅ Contract split test successful:', result);
    return result;
  } catch (error) {
    logger.error('❌ Contract split test failed:', error);
    throw error;
  }
}

module.exports = {
  startBatchProcessor,
  triggerBatchProcessing,
  processPendingTips,
  testContractSplit,
  runDailyTipCycle
};