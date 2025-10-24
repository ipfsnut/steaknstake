#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

console.log('🥩 SteakNStake Contract Test Runner');
console.log('===================================\n');

const contractsDir = __dirname;
process.chdir(contractsDir);

try {
  console.log('📦 Installing dependencies...');
  execSync('npm install', { stdio: 'inherit' });
  
  console.log('\n🔨 Compiling contracts...');
  execSync('npx hardhat compile', { stdio: 'inherit' });
  
  console.log('\n🧪 Running comprehensive test suite...');
  execSync('npx hardhat test --reporter spec', { stdio: 'inherit' });
  
  console.log('\n✅ All tests completed successfully!');
  console.log('\nNext steps:');
  console.log('1. Deploy to Base Sepolia testnet: npm run deploy:base-sepolia');
  console.log('2. Deploy to Base mainnet: npm run deploy:base');
  console.log('3. Integrate with your Clanker-created STEAK token');
  
} catch (error) {
  console.error('\n❌ Test failed:', error.message);
  process.exit(1);
}