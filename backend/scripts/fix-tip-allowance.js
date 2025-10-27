const { Client } = require('pg');

async function fixTipAllowance() {
  console.log('🔧 Fixing tip allowance for epicdylan...');
  
  // Connect to Railway database
  const dbClient = new Client({
    connectionString: process.env.DATABASE_URL
  });
  
  await dbClient.connect();
  console.log('✅ Connected to database');

  // Update your tip allowance to 1000
  const result = await dbClient.query(`
    UPDATE staking_positions 
    SET available_tip_balance = 1000, updated_at = NOW()
    WHERE user_id = (
      SELECT id FROM users 
      WHERE wallet_address = '0x18a85ad341b2d6a2bd67fbb104b4827b922a2a3c'
    )
    RETURNING *
  `);

  console.log('✅ Updated tip allowance:', result.rows[0]);

  await dbClient.end();
  console.log('🚀 Tip allowance fixed to 1000!');
}

// Load environment variables
require('dotenv').config();

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not found in environment variables');
  process.exit(1);
}

fixTipAllowance().catch(console.error);