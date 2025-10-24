#!/usr/bin/env node

const { ethers } = require("hardhat");

async function deriveFromSeedphrase() {
  const seedphrase = "goose foil creek snack pigeon boring clog insect roof kangaroo animal orange";
  
  // Create wallet from seedphrase
  const wallet = ethers.Wallet.fromPhrase(seedphrase);
  
  console.log("🔑 Deployment Wallet Derived:");
  console.log("Address:", wallet.address);
  console.log("Private Key:", wallet.privateKey);
  console.log("\n📝 Add this to your .env file:");
  console.log(`PRIVATE_KEY=${wallet.privateKey.slice(2)}`); // Remove 0x prefix
  console.log(`BACKEND_WALLET_ADDRESS=${wallet.address}`);
  
  // Check balance on Base
  try {
    const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");
    const balance = await provider.getBalance(wallet.address);
    console.log("\n💰 Current Balance on Base:");
    console.log(`${ethers.formatEther(balance)} ETH`);
    
    if (balance === 0n) {
      console.log("\n⚠️  Wallet needs ETH for gas fees!");
      console.log("Send some ETH to:", wallet.address);
    }
  } catch (error) {
    console.log("\n⚠️  Could not check balance:", error.message);
  }
}

deriveFromSeedphrase().catch(console.error);