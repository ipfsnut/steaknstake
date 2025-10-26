#!/usr/bin/env node

require('dotenv').config();

async function quickUserSetup() {
  try {
    const db = require('../src/services/database');
    const client = await db.getClient();
    
    // Simple insert
    const userResult = await client.query(`
      INSERT INTO users (wallet_address, farcaster_fid, farcaster_username, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      RETURNING *
    `, ['0x18a85ad341b2d6a2bd67fbb104b4827b922a2a3c', 8573, 'epicdylan']);
    
    const user = userResult.rows[0];
    console.log('✅ User created:', user);
    
    // Simple staking position insert
    await client.query(`
      INSERT INTO staking_positions (user_id, staked_amount, available_tip_balance, staked_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
    `, [user.id, 111, 900]);
    
    console.log('✅ Staking position created: 900 $STEAK available');
    
    client.release();
    
  } catch (error) {
    console.error('Error:', error);
  }
}

quickUserSetup();