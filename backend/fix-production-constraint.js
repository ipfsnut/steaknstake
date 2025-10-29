require('dotenv').config();
const { Pool } = require('pg');

async function fixProductionConstraint() {
  // Use production database URL
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://steaknstake_user:uKy9rYIZVY5eFsYb8kxnJWfXi1QI0m1W@dpg-cs5lq7btq21c73cmhtng-a.oregon-postgres.render.com/steaknstake',
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔧 Connecting to production database...');
    
    // First check current constraint
    const checkResult = await pool.query(`
      SELECT column_name, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'wallet_address'
    `);
    
    console.log('Current wallet_address column info:', checkResult.rows[0]);
    
    if (checkResult.rows[0]?.is_nullable === 'NO') {
      console.log('🔧 Removing NOT NULL constraint from wallet_address...');
      
      await pool.query('ALTER TABLE users ALTER COLUMN wallet_address DROP NOT NULL');
      
      console.log('✅ Constraint removed successfully!');
    } else {
      console.log('✅ Constraint already removed or column allows NULL');
    }
    
    // Verify the change
    const verifyResult = await pool.query(`
      SELECT column_name, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'wallet_address'
    `);
    
    console.log('Updated wallet_address column info:', verifyResult.rows[0]);
    
  } catch (error) {
    console.error('❌ Error fixing constraint:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

fixProductionConstraint().catch(console.error);