#!/usr/bin/env node

/**
 * Setup Neynar webhook for SteakNStake tip detection
 * Run this script to register the webhook with Neynar
 */

require('dotenv').config();
const fetch = require('node-fetch');

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://steaknstake-backend-production.up.railway.app/api/farcaster/webhook';

async function setupWebhook() {
  if (!NEYNAR_API_KEY) {
    console.error('❌ NEYNAR_API_KEY not found in environment variables');
    process.exit(1);
  }

  console.log('🔧 Setting up Neynar webhook for SteakNStake...');
  console.log(`📡 Webhook URL: ${WEBHOOK_URL}`);

  try {
    // Register webhook for cast creation events
    const response = await fetch('https://api.neynar.com/v2/farcaster/webhook', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api_key': NEYNAR_API_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        name: 'steaknstake-tip-detection',
        url: WEBHOOK_URL,
        events: ['cast.created'],
        active: true,
        description: 'SteakNStake tip detection webhook - monitors for $STEAK tip commands in Farcaster casts'
      })
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Webhook registered successfully!');
      console.log('📋 Webhook details:');
      console.log(JSON.stringify(result, null, 2));
      
      console.log('\n🎯 Next steps:');
      console.log('1. Make sure your backend is running at:', WEBHOOK_URL);
      console.log('2. Test by commenting "25 $STEAK" on any Farcaster cast');
      console.log('3. Check backend logs for webhook events');
    } else {
      const errorText = await response.text();
      console.error('❌ Failed to register webhook:', errorText);
      
      // Check if webhook already exists
      if (errorText.includes('already exists') || response.status === 409) {
        console.log('ℹ️  Webhook may already be registered. Checking existing webhooks...');
        await listWebhooks();
      }
    }

  } catch (error) {
    console.error('❌ Error setting up webhook:', error);
  }
}

async function listWebhooks() {
  try {
    const response = await fetch('https://api.neynar.com/v2/farcaster/webhook', {
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'api_key': NEYNAR_API_KEY
      }
    });

    if (response.ok) {
      const webhooks = await response.json();
      console.log('📋 Existing webhooks:');
      console.log(JSON.stringify(webhooks, null, 2));
    } else {
      console.error('Failed to list webhooks:', await response.text());
    }
  } catch (error) {
    console.error('Error listing webhooks:', error);
  }
}

// Run the setup
setupWebhook();