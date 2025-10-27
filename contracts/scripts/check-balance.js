const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  
  console.log("💰 Deployment Wallet Balance Check");
  console.log("📍 Deployer Address:", deployer.address);
  console.log("💵 Current Balance:", ethers.formatEther(balance), "ETH");
  console.log("⛽ Needed for Upgrade: ~0.003 ETH");
  
  const needed = BigInt("3000000000000000"); // 0.003 ETH in wei
  if (balance < needed) {
    const shortfall = needed - balance;
    console.log("🚨 Insufficient Funds!");
    console.log("💸 Need to Add:", ethers.formatEther(shortfall), "ETH");
    console.log("🔗 Send ETH to:", deployer.address);
  } else {
    console.log("✅ Sufficient funds for upgrade");
  }
}

main().catch(console.error);