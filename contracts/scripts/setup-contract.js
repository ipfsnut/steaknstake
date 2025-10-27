const { ethers } = require("hardhat");

async function main() {
  const proxyAddress = process.env.STEAKNSTAKE_CONTRACT_ADDRESS;
  console.log("🔧 Setting up upgraded contract at:", proxyAddress);
  
  const contract = await ethers.getContractAt("SteakNStake", proxyAddress);
  
  // 1. Set daily allowance rate to 1% (100 basis points)
  console.log("\n⚡ Setting daily allowance rate to 1% (100 basis points)...");
  const setRateTx = await contract.setDailyAllowanceRate(100);
  await setRateTx.wait();
  console.log("✅ Daily allowance rate set");
  
  // 2. Get current rate to verify
  const currentRate = await contract.dailyAllowanceRate();
  console.log("📊 Current daily allowance rate:", currentRate.toString(), "basis points");
  
  // 3. Check total staked users
  const totalStaked = await contract.totalStaked();
  console.log("💰 Total staked:", ethers.formatEther(totalStaked), "STEAK");
  
  console.log("\n🎉 Contract setup complete!");
  console.log("📝 Contract is ready for tip allowance system");
  console.log("📝 Users can now receive tip allowances based on their staked amounts");
}

main().catch(console.error);