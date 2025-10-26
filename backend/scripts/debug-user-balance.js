#!/usr/bin/env node

/**
 * Debug user balance discrepancy
 * Check what's actually in the database for the user
 */

require('dotenv').config();

const USER_ADDRESS = '0x18A85ad341b2D6A2bd67fbb104B4827B922a2A3c'; // Your wallet address

async function debugUserBalance() {
  try {
    const db = require('../src/services/database');
    const client = await db.getClient();
    
    console.log('🔍 Debugging balance for user:', USER_ADDRESS);
    console.log('='.repeat(60));
    
    // 1. Check if user exists
    const userResult = await client.query(
      'SELECT * FROM users WHERE wallet_address = $1',
      [USER_ADDRESS.toLowerCase()]
    );
    
    if (userResult.rows.length === 0) {
      console.log('❌ User not found in database');
      console.log('💡 This means the backend has no record of your staking position');
      client.release();
      return;
    }
    
    const user = userResult.rows[0];
    console.log('✅ User found:', {
      id: user.id,
      wallet_address: user.wallet_address,
      farcaster_fid: user.farcaster_fid,
      farcaster_username: user.farcaster_username,
      created_at: user.created_at
    });
    
    // 2. Check staking position
    const positionResult = await client.query(
      'SELECT * FROM staking_positions WHERE user_id = $1',
      [user.id]
    );
    
    if (positionResult.rows.length === 0) {
      console.log('❌ No staking position found');
      console.log('💡 User exists but has no staking position in backend');
    } else {
      const position = positionResult.rows[0];
      console.log('✅ Staking position found:', {
        staked_amount: position.staked_amount,
        available_tip_balance: position.available_tip_balance,
        staked_at: position.staked_at,
        updated_at: position.updated_at
      });
    }
    
    // 3. Check sent tips
    const sentTipsResult = await client.query(`
      SELECT 
        ft.*,
        tc.id as claim_id
      FROM farcaster_tips ft
      LEFT JOIN tip_claims tc ON ft.id = tc.tip_id
      WHERE ft.tipper_user_id = $1
      ORDER BY ft.created_at DESC
    `, [user.id]);
    
    console.log('\n📤 Tips sent by user:');
    if (sentTipsResult.rows.length === 0) {
      console.log('  No tips sent');
    } else {
      let totalTipped = 0;
      sentTipsResult.rows.forEach((tip, index) => {
        totalTipped += parseFloat(tip.tip_amount);
        console.log(`  ${index + 1}. ${tip.tip_amount} $STEAK to @${tip.recipient_username} (${tip.created_at})`);
      });
      console.log(`  📊 Total tipped: ${totalTipped} $STEAK`);
    }
    
    // 4. Check received tips
    const receivedTipsResult = await client.query(`
      SELECT ft.*, tc.id as claim_id
      FROM farcaster_tips ft
      LEFT JOIN tip_claims tc ON ft.id = tc.tip_id
      WHERE ft.recipient_fid = $1
      ORDER BY ft.created_at DESC
    `, [user.farcaster_fid]);
    
    console.log('\n📥 Tips received by user:');
    if (receivedTipsResult.rows.length === 0) {
      console.log('  No tips received');
    } else {
      let totalReceived = 0;
      receivedTipsResult.rows.forEach((tip, index) => {
        totalReceived += parseFloat(tip.tip_amount);
        console.log(`  ${index + 1}. ${tip.tip_amount} $STEAK from tipper_id ${tip.tipper_user_id} (${tip.created_at})`);
      });
      console.log(`  📊 Total received: ${totalReceived} $STEAK`);
    }
    
    // 5. Summary calculation
    console.log('\n📊 BALANCE CALCULATION:');
    if (positionResult.rows.length > 0) {
      const position = positionResult.rows[0];
      const allocatedBalance = parseFloat(position.available_tip_balance);
      const totalTipped = sentTipsResult.rows.reduce((sum, tip) => sum + parseFloat(tip.tip_amount), 0);
      
      console.log(`  Available tip balance: ${allocatedBalance} $STEAK`);
      console.log(`  Total tips sent: ${totalTipped} $STEAK`);
      console.log(`  Expected balance: Should match available_tip_balance after deductions`);
      
      if (allocatedBalance === 0 && totalTipped > 0) {
        console.log('  🔍 ISSUE: Balance is 0 but user has sent tips');
        console.log('  💡 Possible causes:');
        console.log('     - Balance was never allocated in backend');
        console.log('     - Balance deduction logic is wrong');
        console.log('     - Multiple deductions for same tip');
      }
    }
    
    client.release();
    
  } catch (error) {
    console.error('❌ Error debugging user balance:', error);
  }
}

debugUserBalance();