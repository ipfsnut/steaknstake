#!/usr/bin/env node

require('dotenv').config();

async function debugSelfTip() {
  try {
    const db = require('../src/services/database');
    const client = await db.getClient();
    
    const userResult = await client.query(
      'SELECT * FROM users WHERE wallet_address = $1',
      ['0x18a85ad341b2d6a2bd67fbb104b4827b922a2a3c']
    );
    
    console.log('User data:', userResult.rows[0]);
    console.log('Farcaster FID type:', typeof userResult.rows[0].farcaster_fid);
    console.log('Farcaster FID value:', userResult.rows[0].farcaster_fid);
    console.log('Test comparison:', userResult.rows[0].farcaster_fid === 8573);
    console.log('Test comparison (string):', userResult.rows[0].farcaster_fid === '8573');
    
    client.release();
  } catch (error) {
    console.error('Error:', error);
  }
}

debugSelfTip();