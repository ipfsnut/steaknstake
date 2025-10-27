const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("Debug Failing Claim Test", function () {
  let steakToken, steakNStake;
  let owner, user1, user2, backend;
  let proxyAddress;

  const STAKE_AMOUNT = ethers.parseEther("100");
  const TIP_AMOUNT = ethers.parseEther("10");

  beforeEach(async function () {
    [owner, user1, user2, backend] = await ethers.getSigners();

    // Deploy mock STEAK token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    steakToken = await MockERC20.deploy("STEAK Token", "STEAK", ethers.parseEther("1000000"));
    await steakToken.waitForDeployment();

    // Deploy upgradeable SteakNStake contract
    const SteakNStake = await ethers.getContractFactory("SteakNStake");
    steakNStake = await upgrades.deployProxy(SteakNStake, [
      await steakToken.getAddress(),
      backend.address,
      ethers.parseEther("1")
    ], { initializer: "initialize" });
    await steakNStake.waitForDeployment();
    proxyAddress = await steakNStake.getAddress();

    // Setup tokens and approvals
    await steakToken.transfer(user1.address, ethers.parseEther("1000"));
    await steakToken.transfer(user2.address, ethers.parseEther("1000"));
    await steakToken.connect(user1).approve(proxyAddress, ethers.parseEther("1000"));
    
    // Fund contract for claims
    await steakToken.transfer(proxyAddress, ethers.parseEther("10000"));
    
    console.log("=== SETUP COMPLETE ===");
    console.log("Contract funded with:", ethers.formatEther(await steakToken.balanceOf(proxyAddress)), "STEAK");
    console.log("User1 balance:", ethers.formatEther(await steakToken.balanceOf(user1.address)), "STEAK");
    console.log("User2 balance:", ethers.formatEther(await steakToken.balanceOf(user2.address)), "STEAK");
  });

  it("Debug step-by-step claim flow", async function () {
    console.log("\n🏁 STEP 1: User1 stakes");
    await steakNStake.connect(user1).stake(STAKE_AMOUNT);
    console.log("✅ User1 staked:", ethers.formatEther(await steakNStake.getStakedAmount(user1.address)));

    console.log("\n🏁 STEP 2: Reset user1's tip state");
    await steakNStake.connect(owner).resetUserTipState(
      user1.address,
      ethers.parseEther("100"), // 100 allowance
      0                         // 0 sent
    );
    
    const allowance = await steakNStake.tipAllowances(user1.address);
    const sent = await steakNStake.tipsSent(user1.address);
    const available = await steakNStake.getAvailableTipAllowance(user1.address);
    
    console.log("✅ User1 tip allowance:", ethers.formatEther(allowance));
    console.log("✅ User1 tips sent:", ethers.formatEther(sent));
    console.log("✅ User1 available to tip:", ethers.formatEther(available));

    console.log("\n🏁 STEP 3: Check user2's initial claimable state");
    let user2Allocated = await steakNStake.allocatedTips(user2.address);
    let user2Claimed = await steakNStake.claimedTips(user2.address);
    let user2Claimable = await steakNStake.getClaimableAmount(user2.address);
    
    console.log("✅ User2 allocated tips:", ethers.formatEther(user2Allocated));
    console.log("✅ User2 claimed tips:", ethers.formatEther(user2Claimed));
    console.log("✅ User2 claimable:", ethers.formatEther(user2Claimable));

    console.log("\n🏁 STEP 4: User1 sends tip to user2");
    await steakNStake.connect(user1).sendTip(user2.address, TIP_AMOUNT);
    console.log("✅ Tip sent successfully");

    console.log("\n🏁 STEP 5: Check states after tip");
    // User1's state
    const user1SentAfter = await steakNStake.tipsSent(user1.address);
    const user1AvailableAfter = await steakNStake.getAvailableTipAllowance(user1.address);
    console.log("✅ User1 tips sent after:", ethers.formatEther(user1SentAfter));
    console.log("✅ User1 available after:", ethers.formatEther(user1AvailableAfter));
    
    // User2's state
    user2Allocated = await steakNStake.allocatedTips(user2.address);
    user2Claimed = await steakNStake.claimedTips(user2.address);
    user2Claimable = await steakNStake.getClaimableAmount(user2.address);
    
    console.log("✅ User2 allocated tips after:", ethers.formatEther(user2Allocated));
    console.log("✅ User2 claimed tips after:", ethers.formatEther(user2Claimed));
    console.log("✅ User2 claimable after:", ethers.formatEther(user2Claimable));
    
    // Contract state
    const contractBalance = await steakToken.balanceOf(proxyAddress);
    const totalStaked = await steakNStake.totalStaked();
    console.log("✅ Contract balance:", ethers.formatEther(contractBalance));
    console.log("✅ Total staked:", ethers.formatEther(totalStaked));
    console.log("✅ Available for claims:", ethers.formatEther(contractBalance - totalStaked));

    console.log("\n🏁 STEP 6: Attempt to claim");
    if (user2Claimable > 0) {
      console.log("🎯 User2 has claimable tips, attempting claim...");
      const balanceBefore = await steakToken.balanceOf(user2.address);
      console.log("✅ User2 balance before claim:", ethers.formatEther(balanceBefore));
      
      try {
        await steakNStake.connect(user2).claimToWallet();
        const balanceAfter = await steakToken.balanceOf(user2.address);
        console.log("✅ User2 balance after claim:", ethers.formatEther(balanceAfter));
        console.log("✅ Claimed amount:", ethers.formatEther(balanceAfter - balanceBefore));
        
        // Check final state
        const finalClaimable = await steakNStake.getClaimableAmount(user2.address);
        const finalClaimed = await steakNStake.claimedTips(user2.address);
        console.log("✅ Final claimable:", ethers.formatEther(finalClaimable));
        console.log("✅ Final claimed:", ethers.formatEther(finalClaimed));
        
      } catch (error) {
        console.log("❌ CLAIM FAILED:", error.message);
        throw error;
      }
    } else {
      console.log("❌ ERROR: User2 has no claimable tips!");
      console.log("This means sendTip didn't properly allocate tips");
      
      // Let's check if it's a calculation issue
      console.log("DEBUG: allocated =", ethers.formatEther(user2Allocated));
      console.log("DEBUG: claimed =", ethers.formatEther(user2Claimed));
      console.log("DEBUG: claimable = allocated - claimed =", ethers.formatEther(user2Allocated - user2Claimed));
    }
  });
});