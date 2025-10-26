#!/usr/bin/env node

/**
 * Test Railway PostgreSQL connection
 */

const { Pool } = require('pg');

const DATABASE_URL = 'postgresql://postgres:GoXmqhXCqskDDGTLSAZvUSfGEPEWjKtY@mainline.proxy.rlwy.net:58259/railway';

async function testConnection() {
  console.log('🔗 Testing Railway PostgreSQL connection...');
  console.log('🎯 Host: mainline.proxy.rlwy.net:58259');
  console.log('🗃️ Database: railway\n');
  
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // Required for Railway
    max: 1, // Just for testing
    connectionTimeoutMillis: 5000,
  });
  
  try {
    // Test basic connection
    console.log('1️⃣ Testing connection...');
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
    
    console.log('✅ Connection successful!');
    console.log('📅 Server time:', result.rows[0].current_time);
    console.log('🐘 PostgreSQL version:', result.rows[0].pg_version.split(' ')[0]);
    
    // Test if SteakNStake tables exist
    console.log('\n2️⃣ Checking for SteakNStake tables...');
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('users', 'staking_positions', 'farcaster_tips', 'tip_claims')
      ORDER BY table_name
    `);
    
    if (tablesResult.rows.length > 0) {
      console.log('✅ Found SteakNStake tables:');
      tablesResult.rows.forEach(row => {
        console.log(`   - ${row.table_name}`);
      });
    } else {
      console.log('⚠️  No SteakNStake tables found - database may need initialization');
    }
    
    // Check if your user exists
    console.log('\n3️⃣ Checking for your user record...');
    const userResult = await client.query(
      "SELECT * FROM users WHERE wallet_address = $1",
      ['0x18A85ad341b2D6A2bd67fbb104B4827B922a2A3c'.toLowerCase()]
    );
    
    if (userResult.rows.length > 0) {
      const user = userResult.rows[0];
      console.log('✅ Found your user record:');
      console.log(`   - Wallet: ${user.wallet_address}`);
      console.log(`   - Farcaster FID: ${user.farcaster_fid}`);
      console.log(`   - Username: ${user.farcaster_username}`);
      
      // Check staking position
      const positionResult = await client.query(
        "SELECT * FROM staking_positions WHERE user_id = $1",
        [user.id]
      );
      
      if (positionResult.rows.length > 0) {
        const position = positionResult.rows[0];
        console.log('✅ Found your staking position:');
        console.log(`   - Staked amount: ${position.staked_amount}`);
        console.log(`   - Available tip balance: ${position.available_tip_balance}`);
      } else {
        console.log('⚠️  No staking position found');
      }
    } else {
      console.log('⚠️  Your user record not found in database');
    }
    
    client.release();
    await pool.end();
    
    console.log('\n🎉 Database connection test completed!');
    
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    console.error('🔍 Error details:', {
      code: error.code,
      errno: error.errno,
      syscall: error.syscall,
      hostname: error.hostname
    });
    
    if (error.message.includes('timeout')) {
      console.log('\n💡 Timeout suggestion: Railway database may be sleeping, try again');
    }
    if (error.message.includes('ENOTFOUND')) {
      console.log('\n💡 DNS suggestion: Check if the host URL is correct');
    }
    if (error.message.includes('authentication')) {
      console.log('\n💡 Auth suggestion: Check username/password in URL');
    }
    
    await pool.end();
  }
}

testConnection();