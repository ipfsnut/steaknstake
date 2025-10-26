#!/usr/bin/env node

/**
 * Create user record for @epicdylan with correct tip balance
 */

require('dotenv').config();

const USER_DATA = {
  walletAddress: '0x18A85ad341b2D6A2bd67fbb104B4827B922a2A3c',
  farcasterFid: 8573,
  farcasterUsername: 'epicdylan',
  stakedAmount: 111, // From your recent staking
  availableTipBalance: 900, // 1000 allocated - 100 tipped = 900 remaining
};

async function createUserRecord() {
  try {
    const db = require('../src/services/database');
    const client = await db.getClient();
    
    console.log('👤 Creating user record for @epicdylan...');
    console.log('📊 User data:', {
      wallet: USER_DATA.walletAddress,
      fid: USER_DATA.farcasterFid,
      username: USER_DATA.farcasterUsername,
      staked: USER_DATA.stakedAmount,
      tipBalance: USER_DATA.availableTipBalance
    });
    
    await client.query('BEGIN');
    
    // 1. Create or update user record
    const userResult = await client.query(`
      INSERT INTO users (wallet_address, farcaster_fid, farcaster_username, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      ON CONFLICT (wallet_address) 
      DO UPDATE SET 
        farcaster_fid = EXCLUDED.farcaster_fid,
        farcaster_username = EXCLUDED.farcaster_username,
        updated_at = NOW()
      RETURNING *
    `, [
      USER_DATA.walletAddress.toLowerCase(),
      USER_DATA.farcasterFid,
      USER_DATA.farcasterUsername
    ]);
    
    const user = userResult.rows[0];
    console.log('✅ User record created/updated:', {
      id: user.id,
      wallet_address: user.wallet_address,
      farcaster_fid: user.farcaster_fid,
      farcaster_username: user.farcaster_username
    });
    
    // 2. Create or update staking position
    const positionResult = await client.query(`
      INSERT INTO staking_positions (user_id, staked_amount, available_tip_balance, staked_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        staked_amount = EXCLUDED.staked_amount,
        available_tip_balance = EXCLUDED.available_tip_balance,
        updated_at = NOW()
      RETURNING *
    `, [
      user.id,
      USER_DATA.stakedAmount,
      USER_DATA.availableTipBalance
    ]);
    
    const position = positionResult.rows[0];
    console.log('✅ Staking position created/updated:', {
      staked_amount: position.staked_amount,
      available_tip_balance: position.available_tip_balance,
      staked_at: position.staked_at
    });
    
    await client.query('COMMIT');
    client.release();
    
    console.log('\n🎉 User record setup complete!');
    console.log('💰 Available tip balance: 900 $STEAK');
    console.log('🥩 Staked amount: 111 $STEAK');
    console.log('\nNow your frontend should show the correct balance!');
    
  } catch (error) {
    console.error('❌ Error creating user record:', error);
  }
}

createUserRecord();