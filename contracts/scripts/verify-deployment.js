const { ethers } = require("hardhat");

async function main() {
  const contractAddress = "0xE1F7DECfb1b0A31B660D29246DB078fBa95C542A";
  
  console.log("🔍 Verifying deployed contract at:", contractAddress);
  
  const contract = await ethers.getContractAt("SteakNStake", contractAddress);
  
  console.log("📋 Version:", await contract.version());
  console.log("🥩 Stake Token:", await contract.stakeToken());
  console.log("🎁 Reward Token:", await contract.rewardToken());
  console.log("⚖️ Minimum Stake:", ethers.formatEther(await contract.minimumStake()), "STEAK");
  console.log("💰 Total Staked:", ethers.formatEther(await contract.totalStaked()), "STEAK");
  console.log("🎯 Total Rewards Distributed:", ethers.formatEther(await contract.totalRewardsDistributed()), "STEAK");
  
  console.log("\n✅ Contract deployed and initialized successfully!");
}

main().catch(console.error);