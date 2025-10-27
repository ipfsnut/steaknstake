const { ethers } = require("hardhat");

async function main() {
  const proxyAddress = process.env.STEAKNSTAKE_CONTRACT_ADDRESS;
  console.log("📍 Checking contract at:", proxyAddress);
  
  const contract = await ethers.getContractAt("SteakNStake", proxyAddress);
  const version = await contract.version();
  const totalStaked = await contract.totalStaked();
  
  console.log("📦 Contract Version:", version);
  console.log("💰 Total Staked:", ethers.formatEther(totalStaked), "STEAK");
  
  // Check if tip allowance functions exist
  try {
    const dailyRate = await contract.dailyAllowanceRate();
    console.log("⚡ Daily Allowance Rate:", dailyRate.toString(), "basis points");
    
    // Check if new functions exist
    const [user] = await ethers.getSigners();
    const tipAllowance = await contract.getAvailableTipAllowance(user.address);
    console.log("✅ Tip allowance functions available");
  } catch (error) {
    console.log("❌ Tip allowance functions not available:", error.message);
  }
}

main().catch(console.error);