const { createPublicClient, http } = require('viem');
const { base } = require('viem/chains');
const { Client } = require('pg');

// Contract addresses from CLAUDE.md
const STEAK_TOKEN_ADDRESS = '0x1C96D434DEb1fF21Fc5406186Eef1f970fAF3B07';
const STEAKNSTAKE_CONTRACT = '0xE1F7DECfb1b0A31B660D29246DB078fBa95C542A';
const USER_ADDRESS = '0x18a85ad341b2d6a2bd67fbb104b4827b922a2a3c'; // Your wallet

// SteakNStake contract ABI (actual functions from contract)
const STEAKNSTAKE_ABI = [
  {
    "inputs": [{"name": "user", "type": "address"}],
    "name": "getStakedAmount",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "user", "type": "address"}],
    "name": "getStakeTimestamp", 
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "user", "type": "address"}],
    "name": "getClaimableAmount",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "user", "type": "address"}],
    "name": "getUserStats",
    "outputs": [
      {"name": "staked", "type": "uint256"},
      {"name": "allocated", "type": "uint256"},
      {"name": "claimed", "type": "uint256"},
      {"name": "claimable", "type": "uint256"},
      {"name": "totalReceived", "type": "uint256"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getContractBalance",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }
];

async function populateRealUserData() {
  console.log('🔍 Reading real staking data from Base mainnet...');
  
  // Create viem client for Base mainnet
  const client = createPublicClient({
    chain: base,
    transport: http()
  });

  try {
    // Try to read staking data from contract
    console.log('📞 Calling contract for user:', USER_ADDRESS);
    
    let stakedAmount, stakingTimestamp, tipAllowance;
    
    // Get comprehensive user stats
    const userStats = await client.readContract({
      address: STEAKNSTAKE_CONTRACT,
      abi: STEAKNSTAKE_ABI,
      functionName: 'getUserStats',
      args: [USER_ADDRESS]
    });
    
    stakedAmount = userStats[0]; // staked
    const allocatedTips = userStats[1]; // allocated  
    const claimedTips = userStats[2]; // claimed
    const claimableTips = userStats[3]; // claimable
    const totalReceived = userStats[4]; // totalReceived
    
    console.log('✅ Got user stats:', {
      stakedAmount: stakedAmount.toString(),
      allocatedTips: allocatedTips.toString(),
      claimedTips: claimedTips.toString(),
      claimableTips: claimableTips.toString(),
      totalReceived: totalReceived.toString()
    });
    
    // Get stake timestamp
    stakingTimestamp = await client.readContract({
      address: STEAKNSTAKE_CONTRACT,
      abi: STEAKNSTAKE_ABI,
      functionName: 'getStakeTimestamp',
      args: [USER_ADDRESS]
    });
    
    console.log('✅ Got stake timestamp:', stakingTimestamp.toString());
    
    // Calculate actual tip allowance from contract data
    // Based on whitepaper: "Daily allowances based on: stake size × time locked × multiplier"
    // Available tip allowance = allocated - claimed
    tipAllowance = allocatedTips - claimedTips;
    
    console.log('🧮 Tip allowance calculation:', {
      allocated: allocatedTips.toString(),
      claimed: claimedTips.toString(),
      available: tipAllowance.toString()
    });

    // Connect to Railway database
    console.log('💾 Connecting to Railway database...');
    const dbClient = new Client({
      connectionString: process.env.DATABASE_URL
    });
    
    await dbClient.connect();
    console.log('✅ Connected to database');

    // Insert/update user record
    console.log('👤 Creating/updating user record...');
    const userResult = await dbClient.query(`
      INSERT INTO users (wallet_address, farcaster_fid, farcaster_username, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      ON CONFLICT (wallet_address) 
      DO UPDATE SET updated_at = NOW()
      RETURNING *
    `, [USER_ADDRESS.toLowerCase(), null, null]);
    
    const user = userResult.rows[0];
    console.log('✅ User record:', user);

    // Convert amounts from wei to readable format
    const stakedAmountFormatted = Number(stakedAmount) / 1e18;
    const tipAllowanceFormatted = Number(tipAllowance) / 1e18;
    const stakingDate = new Date(Number(stakingTimestamp) * 1000);

    console.log('📊 Formatted amounts:', {
      stakedAmount: stakedAmountFormatted,
      tipAllowance: tipAllowanceFormatted,
      stakingDate: stakingDate.toISOString()
    });

    // Insert/update staking position
    console.log('💰 Creating/updating staking position...');
    await dbClient.query(`
      INSERT INTO staking_positions (
        user_id, 
        staked_amount, 
        total_rewards_earned, 
        available_tip_balance,
        staked_at,
        last_reward_calculated,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $5, NOW(), NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET 
        staked_amount = $2,
        available_tip_balance = $4,
        updated_at = NOW()
    `, [
      user.id,
      stakedAmountFormatted,
      0, // total_rewards_earned
      tipAllowanceFormatted, // available_tip_balance
      stakingDate
    ]);

    console.log('✅ Staking position updated');

    // Verify the data
    const verifyResult = await dbClient.query(`
      SELECT 
        u.wallet_address,
        sp.staked_amount,
        sp.available_tip_balance,
        sp.staked_at
      FROM users u
      JOIN staking_positions sp ON u.id = sp.user_id
      WHERE u.wallet_address = $1
    `, [USER_ADDRESS.toLowerCase()]);

    console.log('🎯 Final verification:', verifyResult.rows[0]);

    await dbClient.end();
    console.log('🚀 Real user data populated successfully!');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Load environment variables
require('dotenv').config();

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not found in environment variables');
  process.exit(1);
}

populateRealUserData();