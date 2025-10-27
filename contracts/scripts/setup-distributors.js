const { ethers } = require("hardhat");

async function main() {
  const contractAddress = "0xE1F7DECfb1b0A31B660D29246DB078fBa95C542A";
  const protocolWallet = "0xD31C0C3BdDAcc482Aa5fE64d27cDDBaB72864733";
  
  console.log("🔧 Setting up distributors for contract:", contractAddress);
  
  const contract = await ethers.getContractAt("SteakNStake", contractAddress);
  
  // Add protocol wallet as distributor
  console.log("➕ Adding protocol wallet as distributor:", protocolWallet);
  const addTx = await contract.addDistributor(protocolWallet);
  await addTx.wait();
  console.log("✅ Protocol wallet added as distributor");
  
  // Verify distributor was added
  const isDistributor = await contract.isDistributor(protocolWallet);
  console.log("🔍 Protocol wallet is distributor:", isDistributor);
  
  console.log("\n🎉 Setup complete!");
  console.log("📝 Protocol wallet can now call split() to distribute rewards");
  console.log("📝 Users can stake STEAK and claim rewards via claim()");
}

main().catch(console.error);