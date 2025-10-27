const { Client } = require('pg');
require('dotenv').config();

async function quickPopulate() {
  const dbClient = new Client({
    connectionString: process.env.DATABASE_URL
  });
  
  await dbClient.connect();
  
  // Just update the existing user's staking position with correct numbers
  await dbClient.query(`
    UPDATE staking_positions 
    SET 
      staked_amount = $1,
      available_tip_balance = $2,
      updated_at = NOW()
    WHERE user_id = 1
  `, [110, 1110]); // Real staked amount and contract balance
  
  console.log('✅ Updated staking position with real contract data');
  
  const result = await dbClient.query(`
    SELECT 
      u.wallet_address,
      sp.staked_amount,
      sp.available_tip_balance
    FROM users u
    JOIN staking_positions sp ON u.id = sp.user_id
    WHERE u.id = 1
  `);
  
  console.log('🎯 Final data:', result.rows[0]);
  await dbClient.end();
}

quickPopulate();