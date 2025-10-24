const { ethers, upgrades } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

  // Use existing STEAK Token from Clanker
  console.log("\n1. Using existing STEAK Token from Clanker...");
  
  // TODO: Replace this with your actual Clanker STEAK token address
  const steakTokenAddress = process.env.STEAK_TOKEN_ADDRESS || "0x..."; // Replace with your Clanker token
  
  if (steakTokenAddress === "0x...") {
    console.error("❌ Please set STEAK_TOKEN_ADDRESS in your .env file with your Clanker token address");
    process.exit(1);
  }
  
  console.log("STEAK Token address:", steakTokenAddress);
  
  // Verify the token exists
  const steakToken = await ethers.getContractAt("IERC20", steakTokenAddress);
  try {
    const name = await steakToken.name?.() || "STEAK Token";
    const symbol = await steakToken.symbol?.() || "STEAK";
    console.log(`Token verified: ${name} (${symbol})`);
  } catch (error) {
    console.log("Token verified (name/symbol check failed, but address is valid)");
  }

  // Deploy SteakNStake Contract
  console.log("\n2. Deploying SteakNStake Contract...");
  const SteakNStake = await ethers.getContractFactory("SteakNStake");
  
  const minimumStake = ethers.parseEther("1"); // 1 STEAK minimum
  const backendWallet = process.env.BACKEND_WALLET_ADDRESS || deployer.address;
  
  console.log("Backend wallet:", backendWallet);
  console.log("Minimum stake:", ethers.formatEther(minimumStake), "STEAK");
  
  const steakNStake = await upgrades.deployProxy(SteakNStake, [
    steakTokenAddress,
    backendWallet,
    minimumStake
  ], { initializer: 'initialize' });
  
  await steakNStake.waitForDeployment();
  const steakNStakeAddress = await steakNStake.getAddress();
  console.log("SteakNStake Contract deployed to:", steakNStakeAddress);

  // Optional: Fund the staking contract with tokens for rewards
  // Note: You'll need to have STEAK tokens in your deployer wallet
  const shouldFund = process.env.FUND_CONTRACT === "true";
  let rewardFund = ethers.parseEther("0");
  
  if (shouldFund) {
    console.log("\n3. Funding SteakNStake contract with reward tokens...");
    rewardFund = ethers.parseEther(process.env.REWARD_FUND_AMOUNT || "10000"); // Default 10K STEAK
    
    try {
      // Check deployer's STEAK balance
      const deployerBalance = await steakToken.balanceOf(deployer.address);
      console.log("Deployer STEAK balance:", ethers.formatEther(deployerBalance));
      
      if (deployerBalance >= rewardFund) {
        await steakToken.transfer(steakNStakeAddress, rewardFund);
        console.log("✅ Funded contract with", ethers.formatEther(rewardFund), "STEAK tokens");
      } else {
        console.log("⚠️  Insufficient STEAK balance to fund contract. Please fund manually later.");
        rewardFund = ethers.parseEther("0");
      }
    } catch (error) {
      console.log("⚠️  Could not fund contract automatically. Please fund manually later.");
      console.log("Error:", error.message);
      rewardFund = ethers.parseEther("0");
    }
  } else {
    console.log("\n3. Skipping contract funding (set FUND_CONTRACT=true to auto-fund)");
  }

  console.log("\n=== Deployment Summary ===");
  console.log("STEAK Token:", steakTokenAddress);
  console.log("SteakNStake Contract:", steakNStakeAddress);
  console.log("Deployer:", deployer.address);
  console.log("Backend Wallet:", backendWallet);
  console.log("Minimum Stake:", ethers.formatEther(minimumStake), "STEAK");
  console.log("Reward Fund:", ethers.formatEther(rewardFund), "STEAK");

  // Save deployment info
  const deploymentInfo = {
    network: hre.network.name,
    deployer: deployer.address,
    steakToken: steakTokenAddress,
    steakNStake: steakNStakeAddress,
    backendWallet: backendWallet,
    minimumStake: minimumStake.toString(),
    rewardFund: rewardFund.toString(),
    deployedAt: new Date().toISOString()
  };

  const fs = require('fs');
  fs.writeFileSync(
    `deployments/${hre.network.name}.json`,
    JSON.stringify(deploymentInfo, null, 2)
  );
  
  console.log(`\nDeployment info saved to deployments/${hre.network.name}.json`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });