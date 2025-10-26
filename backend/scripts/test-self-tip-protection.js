#!/usr/bin/env node

/**
 * Test self-tipping protection
 * Simulates a user trying to tip themselves
 */

require('dotenv').config();

const mockSelfTipData = {
  type: 'cast.created',
  data: {
    hash: '0xselftiptest123',
    author: {
      fid: 8573, // Your FID
      username: 'epicdylan'
    },
    text: '500 $STEAK',
    parent_hash: '0xoriginalcast456',
    parent_author: {
      fid: 8573, // SAME FID - self tip attempt!
      username: 'epicdylan'
    },
    timestamp: new Date().toISOString()
  }
};

async function testSelfTipProtection() {
  try {
    console.log('🧪 Testing self-tipping protection...');
    console.log('🎯 Simulating: @epicdylan tips themselves 500 $STEAK');
    console.log('Expected: Should be blocked with error message\n');
    
    const fetch = require('node-fetch');
    const BACKEND_URL = process.env.BACKEND_URL || 'https://steaknstake-backend-production.up.railway.app';
    
    const response = await fetch(`${BACKEND_URL}/api/farcaster/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(mockSelfTipData)
    });
    
    const result = await response.json();
    
    console.log('📡 Response status:', response.status);
    console.log('📄 Response body:', JSON.stringify(result, null, 2));
    
    if (response.ok) {
      console.log('\n✅ Webhook processed successfully');
      console.log('🔍 Check backend logs to see if self-tip was blocked');
    } else {
      console.log('\n❌ Webhook failed');
    }
    
  } catch (error) {
    console.error('❌ Error testing self-tip protection:', error);
  }
  
  console.log('\n📋 What should happen:');
  console.log('1. Webhook receives self-tip attempt');
  console.log('2. System detects tipperFid === recipientFid');
  console.log('3. Posts failure message: "You cannot tip yourself!"');
  console.log('4. No balance deduction occurs');
  console.log('5. No claimable tip is created');
}

testSelfTipProtection();