require('dotenv').config();
const { Pool } = require('pg');

async function fixWalletConstraint() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🔧 Removing NOT NULL constraint from wallet_address...');
    
    await pool.query('ALTER TABLE users ALTER COLUMN wallet_address DROP NOT NULL');
    
    console.log('✅ Constraint removed successfully!');
    console.log('📝 Users can now be created without wallet addresses for Farcaster tipping');
    
  } catch (error) {
    if (error.message.includes('column "wallet_address" of relation "users" does not exist')) {
      console.log('ℹ️ Column does not exist - migration not needed');
    } else if (error.message.includes('column "wallet_address" of relation "users" is not defined as NOT NULL')) {
      console.log('ℹ️ Constraint already removed - migration not needed');
    } else {
      console.error('❌ Migration failed:', error.message);
      throw error;
    }
  } finally {
    await pool.end();
  }
}

fixWalletConstraint().catch(console.error);