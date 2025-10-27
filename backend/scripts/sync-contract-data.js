const { createPublicClient, http } = require('viem');
const { base } = require('viem/chains');
const { Client } = require('pg');

const STEAKNSTAKE_CONTRACT = '0xE1F7DECfb1b0A31B660D29246DB078fBa95C542A';
const USER_ADDRESS = '0x18a85ad341b2d6a2bd67fbb104b4827b922a2a3c';

const STEAKNSTAKE_ABI = [
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
  }
];

async function syncContractData() {
  console.log('🔄 Syncing contract data for epicdylan...');
  
  // Get contract data
  const client = createPublicClient({
    chain: base,
    transport: http()
  });

  const userStats = await client.readContract({
    address: STEAKNSTAKE_CONTRACT,
    abi: STEAKNSTAKE_ABI,
    functionName: 'getUserStats',
    args: [USER_ADDRESS]
  });
  
  const stakedAmount = Number(userStats[0]) / 1e18;
  const allocatedTips = Number(userStats[1]) / 1e18;
  const claimedTips = Number(userStats[2]) / 1e18;
  const claimableTips = Number(userStats[3]) / 1e18;
  const totalReceived = Number(userStats[4]);
  
  const availableTipBalance = allocatedTips - claimedTips;
  
  console.log('📊 Contract Data:');
  console.log(`  Staked: ${stakedAmount} STEAK`);
  console.log(`  Allocated: ${allocatedTips} STEAK`);
  console.log(`  Claimed: ${claimedTips} STEAK`);
  console.log(`  Available: ${availableTipBalance} STEAK`);
  console.log(`  Claimable: ${claimableTips} STEAK`);
  
  // Update database
  const dbClient = new Client({
    connectionString: process.env.DATABASE_URL
  });
  
  await dbClient.connect();
  
  // Update staking position with contract data
  const result = await dbClient.query(`
    UPDATE staking_positions 
    SET 
      staked_amount = $1,
      available_tip_balance = $2,
      updated_at = NOW()
    WHERE user_id = (
      SELECT id FROM users 
      WHERE wallet_address = $3
    )
    RETURNING *
  `, [stakedAmount, availableTipBalance, USER_ADDRESS.toLowerCase()]);

  console.log('✅ Database updated:', {
    staked_amount: result.rows[0].staked_amount,
    available_tip_balance: result.rows[0].available_tip_balance
  });

  await dbClient.end();
  console.log('🚀 Sync complete!');
}

require('dotenv').config();
syncContractData().catch(console.error);