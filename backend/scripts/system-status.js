#!/usr/bin/env node

/**
 * SteakNStake System Status Checker
 * Verifies all components are ready for live tipping
 */

require('dotenv').config();
const fetch = require('node-fetch');

const checks = {
  environment: () => checkEnvironment(),
  backend: () => checkBackend(),
  database: () => checkDatabase(),
  farcaster: () => checkFarcaster(),
  contracts: () => checkContracts()
};

async function checkEnvironment() {
  const required = ['NEYNAR_API_KEY', 'NEYNAR_SIGNER_UUID', 'DATABASE_URL'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    return { status: '❌', message: `Missing env vars: ${missing.join(', ')}` };
  }
  return { status: '✅', message: 'All environment variables present' };
}

async function checkBackend() {
  try {
    const BACKEND_URL = process.env.BACKEND_URL || 'https://happy-determination-production.up.railway.app';
    const response = await fetch(`${BACKEND_URL}/api/health`, { timeout: 5000 });
    
    if (response.ok) {
      return { status: '✅', message: 'Backend is running and healthy' };
    } else {
      return { status: '❌', message: `Backend returned ${response.status}` };
    }
  } catch (error) {
    return { status: '❌', message: `Backend unreachable: ${error.message}` };
  }
}

async function checkDatabase() {
  try {
    const db = require('../src/services/database');
    const client = await db.getClient();
    
    // Test basic query
    const result = await client.query('SELECT COUNT(*) FROM users');
    client.release();
    
    return { status: '✅', message: `Database connected (${result.rows[0].count} users)` };
  } catch (error) {
    return { status: '❌', message: `Database error: ${error.message}` };
  }
}

async function checkFarcaster() {
  try {
    const API_KEY = process.env.NEYNAR_API_KEY;
    if (!API_KEY) {
      return { status: '❌', message: 'NEYNAR_API_KEY not set' };
    }
    
    // Test Neynar API access
    const response = await fetch('https://api.neynar.com/v2/farcaster/user/bulk?fids=1', {
      headers: { 'api_key': API_KEY }
    });
    
    if (response.ok) {
      return { status: '✅', message: 'Neynar API access working' };
    } else {
      return { status: '❌', message: `Neynar API error: ${response.status}` };
    }
  } catch (error) {
    return { status: '❌', message: `Farcaster check failed: ${error.message}` };
  }
}

async function checkContracts() {
  const STEAK_TOKEN = process.env.STEAK_TOKEN_ADDRESS || '0x1C96D434DEb1fF21Fc5406186Eef1f970fAF3B07';
  const STEAKNSTAKE = process.env.STEAKNSTAKE_CONTRACT_ADDRESS || '0xE1F7DECfb1b0A31B660D29246DB078fBa95C542A';
  
  if (!STEAK_TOKEN || !STEAKNSTAKE) {
    return { status: '❌', message: 'Contract addresses not configured' };
  }
  
  return { status: '✅', message: `Contracts configured (STEAK: ${STEAK_TOKEN.slice(0,8)}...)` };
}

async function runAllChecks() {
  console.log('🥩 SteakNStake System Status Check\n');
  
  for (const [name, checkFn] of Object.entries(checks)) {
    try {
      const result = await checkFn();
      console.log(`${result.status} ${name.toUpperCase()}: ${result.message}`);
    } catch (error) {
      console.log(`❌ ${name.toUpperCase()}: Check failed - ${error.message}`);
    }
  }
  
  console.log('\n🎯 Ready for live tipping when all checks show ✅');
  console.log('\n📋 To test tipping:');
  console.log('1. Stake $STEAK tokens to get tip allowances');
  console.log('2. Reply to any Farcaster cast with "25 $STEAK"');
  console.log('3. Check that your allowance decreases');
  console.log('4. Verify recipient can claim the tip');
}

runAllChecks().catch(console.error);