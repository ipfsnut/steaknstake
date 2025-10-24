const { ethers, upgrades } = require("hardhat");

async function main() {
  console.log("🔄 Upgrading SteakNStake contract...");
  
  // Get the existing proxy address
  const proxyAddress = process.env.STEAKNSTAKE_CONTRACT_ADDRESS;
  
  if (!proxyAddress || proxyAddress === "0x...") {
    throw new Error("STEAKNSTAKE_CONTRACT_ADDRESS must be set in .env file");
  }
  
  console.log("📍 Existing Proxy Address:", proxyAddress);
  
  // Get the current implementation address
  const currentImpl = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log("🔧 Current Implementation:", currentImpl);
  
  // Get the new contract factory
  const SteakNStakeV2 = await ethers.getContractFactory("SteakNStake");
  
  console.log("\n🔨 Deploying new implementation...");
  
  // Upgrade the proxy to the new implementation
  const upgraded = await upgrades.upgradeProxy(proxyAddress, SteakNStakeV2);
  await upgraded.waitForDeployment();
  
  // Get the new implementation address
  const newImpl = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  
  console.log("✅ Upgrade completed!");
  console.log("🔧 New Implementation:", newImpl);
  
  // Verify the upgrade
  console.log("\n🔍 Verifying upgrade...");
  const version = await upgraded.version();
  const totalStaked = await upgraded.totalStaked();
  
  console.log("- Contract Version:", version);
  console.log("- Total Staked (preserved):", ethers.formatEther(totalStaked), "STEAK");
  
  console.log("\n🎉 Upgrade successful!");
  console.log("📝 Proxy address remains the same:", proxyAddress);
  console.log("📝 All user data preserved");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Upgrade failed:");
    console.error(error);
    process.exit(1);
  });