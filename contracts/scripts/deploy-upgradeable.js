const { ethers, upgrades } = require("hardhat");

async function main() {
  console.log("🚀 Deploying SteakNStake with proxy...");
  
  // Get deployment parameters from environment
  const steakTokenAddress = process.env.STEAK_TOKEN_ADDRESS;
  const backendWalletAddress = process.env.BACKEND_WALLET_ADDRESS;
  const minimumStake = ethers.parseEther("1"); // 1 STEAK minimum
  
  if (!steakTokenAddress || steakTokenAddress === "0x...") {
    throw new Error("STEAK_TOKEN_ADDRESS must be set in .env file");
  }
  
  if (!backendWalletAddress) {
    throw new Error("BACKEND_WALLET_ADDRESS must be set in .env file");
  }

  // Get the contract factory
  const SteakNStake = await ethers.getContractFactory("SteakNStake");

  console.log("📋 Deployment Parameters:");
  console.log("- STEAK Token:", steakTokenAddress);
  console.log("- Backend Wallet:", backendWalletAddress);
  console.log("- Minimum Stake:", ethers.formatEther(minimumStake), "STEAK");
  
  // Deploy with transparent proxy
  console.log("\n🔨 Deploying proxy and implementation...");
  const steakNStake = await upgrades.deployProxy(
    SteakNStake, 
    [steakTokenAddress, backendWalletAddress, minimumStake],
    { 
      initializer: 'initialize',
      kind: 'transparent'
    }
  );

  await steakNStake.waitForDeployment();
  const contractAddress = await steakNStake.getAddress();

  console.log("\n✅ SteakNStake deployed successfully!");
  console.log("📍 Proxy Address:", contractAddress);
  
  // Get implementation and admin addresses
  const implAddress = await upgrades.erc1967.getImplementationAddress(contractAddress);
  const adminAddress = await upgrades.erc1967.getAdminAddress(contractAddress);
  
  console.log("🔧 Implementation Address:", implAddress);
  console.log("👑 Proxy Admin Address:", adminAddress);

  // Verify the deployment
  console.log("\n🔍 Verifying deployment...");
  const version = await steakNStake.version();
  const tokenAddress = await steakNStake.steakToken();
  const backend = await steakNStake.backendWallet();
  
  console.log("- Contract Version:", version);
  console.log("- STEAK Token:", tokenAddress);
  console.log("- Backend Wallet:", backend);
  
  console.log("\n🎉 Deployment complete!");
  console.log("\n📝 Save these addresses for your records:");
  console.log(`STEAKNSTAKE_CONTRACT_ADDRESS=${contractAddress}`);
  console.log(`IMPLEMENTATION_ADDRESS=${implAddress}`);
  console.log(`PROXY_ADMIN_ADDRESS=${adminAddress}`);
  
  // Optional: Fund the contract if specified
  if (process.env.FUND_CONTRACT === "true") {
    const fundAmount = process.env.REWARD_FUND_AMOUNT || "10000";
    console.log(`\n💰 Auto-funding contract with ${fundAmount} STEAK...`);
    
    const [deployer] = await ethers.getSigners();
    const steakToken = await ethers.getContractAt("IERC20", steakTokenAddress);
    
    // Check deployer balance
    const balance = await steakToken.balanceOf(deployer.address);
    const fundAmountWei = ethers.parseEther(fundAmount);
    
    if (balance >= fundAmountWei) {
      // Approve and fund
      await steakToken.approve(contractAddress, fundAmountWei);
      await steakNStake.fundContract(fundAmountWei);
      console.log(`✅ Contract funded with ${fundAmount} STEAK`);
    } else {
      console.log(`❌ Insufficient STEAK balance. Need ${fundAmount}, have ${ethers.formatEther(balance)}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });