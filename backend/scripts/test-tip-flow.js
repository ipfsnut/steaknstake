#!/usr/bin/env node

/**
 * Test the SteakNStake tipping flow end-to-end
 * This script simulates a Farcaster webhook event for testing
 */

require('dotenv').config();
const fetch = require('node-fetch');

const BACKEND_URL = process.env.BACKEND_URL || 'https://steaknstake-backend-production.up.railway.app';

// Mock Farcaster cast data for testing
const mockCastData = {
  type: 'cast.created',
  data: {
    hash: '0x1234567890abcdef', // Mock cast hash
    author: {
      fid: 280578, // Your FID (or test user FID)
      username: 'epicdylan' // Your username
    },
    text: '25 $STEAK', // Tip command
    parent_hash: '0xabcdef1234567890', // Parent cast being replied to
    parent_author: {
      fid: 12345, // Recipient FID
      username: 'testuser' // Recipient username
    },
    timestamp: new Date().toISOString()
  }
};

async function testTipFlow() {
  console.log('🧪 Testing SteakNStake tip flow...');
  console.log('📡 Backend URL:', BACKEND_URL);
  
  try {
    // Send mock webhook event to our backend
    const response = await fetch(`${BACKEND_URL}/api/farcaster/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(mockCastData)
    });

    console.log('📤 Sent mock webhook event...');
    console.log('📋 Mock data:', JSON.stringify(mockCastData, null, 2));

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Webhook processed successfully!');
      console.log('📨 Response:', JSON.stringify(result, null, 2));
    } else {
      const errorText = await response.text();
      console.log('❌ Webhook processing failed');
      console.log('📄 Error response:', errorText);
      console.log('🔍 Status:', response.status);
    }

  } catch (error) {
    console.error('❌ Error testing tip flow:', error);
  }

  console.log('\n📋 To test with real data:');
  console.log('1. Make sure you have staked $STEAK and have tip allowances');
  console.log('2. Reply to any Farcaster cast with "25 $STEAK"');
  console.log('3. Check backend logs for processing');
  console.log('4. Verify tip appears in recipient\'s claimable tips');
}

// Test health endpoint first
async function testHealth() {
  try {
    console.log('🏥 Testing backend health...');
    const response = await fetch(`${BACKEND_URL}/api/health`);
    
    if (response.ok) {
      const health = await response.json();
      console.log('✅ Backend is healthy:', health);
      return true;
    } else {
      console.log('❌ Backend health check failed');
      return false;
    }
  } catch (error) {
    console.error('❌ Cannot reach backend:', error.message);
    return false;
  }
}

// Run the test
async function main() {
  const isHealthy = await testHealth();
  
  if (isHealthy) {
    await testTipFlow();
  } else {
    console.log('⚠️  Backend not available - skipping tip flow test');
  }
}

main();