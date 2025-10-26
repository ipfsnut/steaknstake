#!/usr/bin/env node

/**
 * Fix staking position for @epicdylan
 */

require('dotenv').config();

async function fixStakingPosition() {
  try {
    const db = require('../src/services/database');
    const client = await db.getClient();
    
    console.log('🔧 Fixing staking position...');
    
    // Get user ID
    const userResult = await client.query(
      'SELECT * FROM users WHERE wallet_address = $1',
      ['0x18a85ad341b2d6a2bd67fbb104b4827b922a2a3c']
    );
    
    if (userResult.rows.length === 0) {
      console.log('❌ User not found');
      client.release();
      return;
    }
    
    const user = userResult.rows[0];
    console.log('✅ Found user:', {
      id: user.id,
      username: user.farcaster_username
    });
    
    // Check if staking position exists
    const existingPosition = await client.query(
      'SELECT * FROM staking_positions WHERE user_id = $1',
      [user.id]
    );
    
    if (existingPosition.rows.length > 0) {
      // Update existing position
      await client.query(`
        UPDATE staking_positions 
        SET 
          staked_amount = $1,
          available_tip_balance = $2,
          updated_at = NOW()
        WHERE user_id = $3
      `, [111, 900, user.id]);
      
      console.log('✅ Updated existing staking position');
    } else {
      // Insert new position
      await client.query(`
        INSERT INTO staking_positions (user_id, staked_amount, available_tip_balance, staked_at, updated_at)
        VALUES ($1, $2, $3, NOW(), NOW())
      `, [user.id, 111, 900]);
      
      console.log('✅ Created new staking position');
    }
    
    // Verify the result
    const finalResult = await client.query(
      'SELECT * FROM staking_positions WHERE user_id = $1',
      [user.id]
    );
    
    const position = finalResult.rows[0];
    console.log('🎯 Final position:', {
      staked_amount: position.staked_amount,
      available_tip_balance: position.available_tip_balance,
      staked_at: position.staked_at
    });
    
    client.release();
    
    console.log('\n🎉 Staking position fixed!');
    console.log('💰 Available tip balance: 900 $STEAK');
    console.log('🥩 Staked amount: 111 $STEAK');
    
  } catch (error) {
    console.error('❌ Error fixing staking position:', error);
  }
}

fixStakingPosition();