#!/usr/bin/env node

require('dotenv').config();
const fetch = require('node-fetch');

async function testSelfTipFix() {
  try {
    console.log('🧪 Testing self-tip protection fix...');
    
    const response = await fetch('https://steaknstake-backend-production.up.railway.app/api/tipping/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipperWalletAddress: '0x18A85ad341b2D6A2bd67fbb104B4827B922a2A3c',
        recipientFid: 8573, // Same FID as tipper - should fail
        recipientUsername: 'epicdylan',
        tipAmount: 5,
        castHash: '0xselftest456'
      })
    });
    
    const result = await response.json();
    
    console.log('Status:', response.status);
    console.log('Response:', result);
    
    if (response.status === 400 && result.error?.includes('cannot tip yourself')) {
      console.log('✅ Self-tip protection is now working correctly!');
    } else {
      console.log('❌ Self-tip protection still broken!');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testSelfTipFix();