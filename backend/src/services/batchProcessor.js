const cron = require('node-cron');
const winston = require('winston');
const db = require('./database');
const { callContractSplit, callContractClaimTip } = require('./contractService');
const { ethers } = require('ethers');

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
    
    // Convert any pending tips to claimable if recipients have connected wallets
    await client.query(`
      UPDATE farcaster_tips 
      SET 
        status = 'CLAIMABLE',
        recipient_wallet_address = u.wallet_address,
        tipper_wallet_address = tu.wallet_address
      FROM users u, users tu
      WHERE farcaster_tips.status = 'PENDING_WALLET'
      AND u.farcaster_fid = farcaster_tips.recipient_fid
      AND tu.id = farcaster_tips.tipper_user_id
      AND u.wallet_address IS NOT NULL
    `);
    
    // Get all claimable tips (those with recipient wallet addresses)
    const claimableTipsResult = await client.query(`
      SELECT 
        ft.*,
        u.wallet_address as tipper_wallet,
        u.farcaster_username as tipper_username
      FROM farcaster_tips ft
      JOIN users u ON ft.tipper_user_id = u.id
      WHERE ft.status = 'CLAIMABLE'
      AND ft.recipient_wallet_address IS NOT NULL
      ORDER BY ft.created_at ASC
    `);
    
    const pendingTips = claimableTipsResult.rows;
    logger.info(`📝 Found ${pendingTips.length} pending tips to process`);
    
    if (pendingTips.length === 0) {
      logger.info('✅ No pending tips to process');
      return;
    }
    
    // Group tips by recipient wallet address for batch processing
    const tipsByRecipient = {};
    let totalTipAmount = 0;
    
    for (const tip of pendingTips) {
      const recipientWallet = tip.recipient_wallet_address;
      
      if (!tipsByRecipient[recipientWallet]) {
        tipsByRecipient[recipientWallet] = {
          recipientWallet: recipientWallet,
          recipientFid: tip.recipient_fid,
          recipientUsername: tip.recipient_username,
          tips: [],
          totalAmount: 0
        };
      }
      
      tipsByRecipient[recipientWallet].tips.push(tip);
      tipsByRecipient[recipientWallet].totalAmount += parseFloat(tip.tip_amount);
      totalTipAmount += parseFloat(tip.tip_amount);
    }
    
    logger.info(`💰 Total tip amount to process: ${totalTipAmount} STEAK`);
    logger.info(`👥 Recipients: ${Object.keys(tipsByRecipient).length}`);
    
    // Signal claimable tip amounts to contract for each recipient
    for (const recipientWallet in tipsByRecipient) {
      const recipientData = tipsByRecipient[recipientWallet];
      
      for (const tip of recipientData.tips) {
        try {
          // Call contract.claimTip(recipient, amount, tipHash) to make tips claimable
          logger.info(`📞 Signaling claimable tip to contract: ${tip.tip_amount} STEAK for ${tip.recipient_username} (${tip.cast_hash})`);
          
          // Call contract to make tip claimable
          await callContractClaimTip(recipientWallet, tip.tip_amount, tip.cast_hash);
          
        } catch (error) {
          logger.error(`❌ Failed to signal tip to contract:`, error);
        }
      }
    }
    
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
    
    // Calculate daily reward amount dynamically based on protocol wallet balance
    const protocolWalletBalance = await getProtocolWalletBalance();
    const allocationPercentage = parseFloat(process.env.DAILY_ALLOCATION_PERCENTAGE || '0.5'); // 0.5% default
    const dailyRewardPool = protocolWalletBalance * (allocationPercentage / 100);
    
    logger.info(`💰 Protocol wallet balance: ${protocolWalletBalance.toLocaleString()} STEAK`);
    logger.info(`📊 Daily allocation: ${allocationPercentage}% = ${dailyRewardPool.toLocaleString()} STEAK`);
    
    // Daily allowances are handled off-chain via protocol wallet
    // No contract interaction needed for daily allocation
    
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
      
      // Add to running tip balance and reset daily tips counter
      await client.query(`
        UPDATE staking_positions 
        SET 
          daily_allowance_start = daily_allowance_start + $1,
          daily_tips_sent = 0,
          last_allowance_reset = CURRENT_DATE,
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

// Get protocol wallet STEAK balance from contract
async function getProtocolWalletBalance() {
  try {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://mainnet.base.org');
    const steakTokenAddress = process.env.STEAK_TOKEN_ADDRESS || '0x1C96D434DEb1fF21Fc5406186Eef1f970fAF3B07';
    const protocolWalletAddress = process.env.PROTOCOL_WALLET_ADDRESS || '0xD31C0C3BdDAcc482Aa5fE64d27cDDBaB72864733';
    
    const ERC20_ABI = [
      'function balanceOf(address owner) view returns (uint256)'
    ];
    
    const steakToken = new ethers.Contract(steakTokenAddress, ERC20_ABI, provider);
    const balance = await steakToken.balanceOf(protocolWalletAddress);
    
    // Convert from wei to STEAK (18 decimals)
    const balanceInSteak = parseFloat(ethers.formatEther(balance));
    
    logger.info(`💰 Protocol wallet balance: ${balanceInSteak.toLocaleString()} STEAK`);
    return balanceInSteak;
    
  } catch (error) {
    logger.error('❌ Failed to get protocol wallet balance:', error);
    // Fallback to a default amount if we can't read the balance
    const fallbackAmount = 100000; // 100k STEAK fallback
    logger.warn(`⚠️ Using fallback balance: ${fallbackAmount} STEAK`);
    return fallbackAmount;
  }
}

module.exports = {
  startBatchProcessor,
  triggerBatchProcessing,
  processPendingTips,
  testContractSplit,
  runDailyTipCycle,
  getProtocolWalletBalance
};