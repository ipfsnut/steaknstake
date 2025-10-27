const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("SteakNStake Critical Security Tests", function () {
  let steakToken, steakNStake;
  let owner, user1, user2, backend, attacker;
  let proxyAddress;

  const INITIAL_SUPPLY = ethers.parseEther("1000000");
  const STAKE_AMOUNT = ethers.parseEther("100");
  const TIP_AMOUNT = ethers.parseEther("10");

  beforeEach(async function () {
    [owner, user1, user2, backend, attacker] = await ethers.getSigners();

    // Deploy mock STEAK token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    steakToken = await MockERC20.deploy("STEAK Token", "STEAK", INITIAL_SUPPLY);
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
    await steakToken.connect(user2).approve(proxyAddress, ethers.parseEther("1000"));
    
    // Fund contract for claims
    await steakToken.transfer(proxyAddress, ethers.parseEther("10000"));
  });

  describe("🔒 CRITICAL: Access Control", function () {
    it("❌ Should reject unauthorized admin calls", async function () {
      // Test different unauthorized access attempts
      await expect(
        steakNStake.connect(attacker).setDailyAllowanceRate(500)
      ).to.be.reverted;

      await expect(
        steakNStake.connect(attacker).resetUserTipState(user1.address, 1000, 0)
      ).to.be.reverted;

      await expect(
        steakNStake.connect(user1).allocateTipsBatch([user2.address], [TIP_AMOUNT])
      ).to.be.reverted;
    });

    it("✅ Should allow authorized admin calls", async function () {
      // Owner should be able to call admin functions
      await expect(
        steakNStake.connect(owner).setDailyAllowanceRate(50)
      ).to.not.be.reverted;

      // Backend should be able to allocate tips
      await expect(
        steakNStake.connect(backend).allocateTipsBatch([user1.address], [TIP_AMOUNT])
      ).to.not.be.reverted;
    });
  });

  describe("🚫 CRITICAL: Self-Tipping Prevention", function () {
    it("❌ Should prevent all forms of self-tipping", async function () {
      await steakNStake.connect(user1).stake(STAKE_AMOUNT);
      
      // Give user1 tip allowance
      await steakNStake.connect(owner).resetUserTipState(
        user1.address,
        ethers.parseEther("100"),
        0
      );

      // Direct self-tip should fail
      await expect(
        steakNStake.connect(user1).sendTip(user1.address, TIP_AMOUNT)
      ).to.be.revertedWith("Cannot tip yourself");

      // Batch self-tip should fail
      await expect(
        steakNStake.connect(user1).sendTipsBatch([user1.address], [TIP_AMOUNT])
      ).to.be.revertedWith("Cannot tip yourself");
    });
  });

  describe("💰 CRITICAL: Allowance Validation", function () {
    beforeEach(async function () {
      await steakNStake.connect(user1).stake(STAKE_AMOUNT);
    });

    it("❌ Should prevent tipping without allowance", async function () {
      // No allowance set - should fail
      await expect(
        steakNStake.connect(user1).sendTip(user2.address, TIP_AMOUNT)
      ).to.be.revertedWith("Insufficient tip allowance");
    });

    it("❌ Should prevent over-spending allowance", async function () {
      // Give 50 tokens allowance
      await steakNStake.connect(owner).resetUserTipState(
        user1.address,
        ethers.parseEther("50"),
        0
      );

      // Try to spend 100 tokens - should fail
      await expect(
        steakNStake.connect(user1).sendTip(user2.address, ethers.parseEther("100"))
      ).to.be.revertedWith("Insufficient tip allowance");
    });

    it("✅ Should allow tipping within allowance", async function () {
      await steakNStake.connect(owner).resetUserTipState(
        user1.address,
        ethers.parseEther("100"),
        0
      );

      // Should succeed
      await expect(
        steakNStake.connect(user1).sendTip(user2.address, TIP_AMOUNT)
      ).to.not.be.reverted;

      // Check allowance was reduced
      const available = await steakNStake.getAvailableTipAllowance(user1.address);
      expect(available).to.equal(ethers.parseEther("90"));
    });
  });

  describe("🎯 CRITICAL: Tip Flow Integrity", function () {
    it("✅ Should maintain correct tip accounting", async function () {
      await steakNStake.connect(user1).stake(STAKE_AMOUNT);
      await steakNStake.connect(owner).resetUserTipState(
        user1.address,
        ethers.parseEther("100"),
        0
      );

      // Send tip
      await steakNStake.connect(user1).sendTip(user2.address, TIP_AMOUNT);

      // Check sender's accounting
      const sentTips = await steakNStake.tipsSent(user1.address);
      const available = await steakNStake.getAvailableTipAllowance(user1.address);
      expect(sentTips).to.equal(TIP_AMOUNT);
      expect(available).to.equal(ethers.parseEther("90")); // 100 - 10

      // Check recipient's accounting
      const allocatedTips = await steakNStake.allocatedTips(user2.address);
      const claimable = await steakNStake.getClaimableAmount(user2.address);
      expect(allocatedTips).to.equal(TIP_AMOUNT);
      expect(claimable).to.equal(TIP_AMOUNT);
    });

    it("✅ Should handle claim flow correctly", async function () {
      // Setup: user1 tips user2
      await steakNStake.connect(user1).stake(STAKE_AMOUNT);
      await steakNStake.connect(owner).resetUserTipState(
        user1.address,
        ethers.parseEther("100"),
        0
      );
      await steakNStake.connect(user1).sendTip(user2.address, TIP_AMOUNT);

      // User2 claims
      const balanceBefore = await steakToken.balanceOf(user2.address);
      await steakNStake.connect(user2).claimToWallet();
      const balanceAfter = await steakToken.balanceOf(user2.address);

      // Check claim worked
      expect(balanceAfter - balanceBefore).to.equal(TIP_AMOUNT);
      
      // Check claimed amount is tracked
      const claimedTips = await steakNStake.claimedTips(user2.address);
      expect(claimedTips).to.equal(TIP_AMOUNT);
      
      // Check no longer claimable
      const stillClaimable = await steakNStake.getClaimableAmount(user2.address);
      expect(stillClaimable).to.equal(0);
    });
  });

  describe("⚡ CRITICAL: getUserStats Accuracy", function () {
    it("✅ Should return accurate stats", async function () {
      await steakNStake.connect(user1).stake(STAKE_AMOUNT);
      
      // Set up user1's tip allowance
      await steakNStake.connect(owner).resetUserTipState(
        user1.address,
        ethers.parseEther("50"), // 50 allowance
        ethers.parseEther("10")  // 10 sent
      );
      
      // Allocate tips TO user1 (as recipient)
      await steakNStake.connect(backend).allocateTipsBatch(
        [user1.address],
        [ethers.parseEther("20")]
      );
      
      const stats = await steakNStake.getUserStats(user1.address);
      
      expect(stats[0]).to.equal(STAKE_AMOUNT);          // staked: 100
      expect(stats[1]).to.equal(ethers.parseEther("50")); // allocated (tip allowance): 50
      expect(stats[2]).to.equal(ethers.parseEther("10")); // claimed (tips sent): 10
      expect(stats[3]).to.equal(ethers.parseEther("20")); // claimable (received tips): 20
      expect(stats[4]).to.equal(ethers.parseEther("20")); // totalReceived: 20
    });
  });

  describe("🛡️ CRITICAL: Economic Exploits", function () {
    it("❌ Should prevent allowance time manipulation", async function () {
      await steakNStake.connect(user1).stake(STAKE_AMOUNT);
      await steakNStake.connect(backend).initializeTipAllowance(user1.address);
      
      // Fast forward time
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]); // 1 day
      await ethers.provider.send("evm_mine");
      
      // Update allowance
      await steakNStake.updateTipAllowance(user1.address);
      const allowance1 = await steakNStake.getAvailableTipAllowance(user1.address);
      
      // Calling again immediately shouldn't give more
      await steakNStake.updateTipAllowance(user1.address);
      const allowance2 = await steakNStake.getAvailableTipAllowance(user1.address);
      
      expect(allowance1).to.equal(allowance2);
      expect(allowance1).to.equal(ethers.parseEther("1")); // 1% of 100 tokens
    });

    it("❌ Should prevent batch manipulation", async function () {
      await steakNStake.connect(user1).stake(STAKE_AMOUNT);
      await steakNStake.connect(owner).resetUserTipState(
        user1.address,
        ethers.parseEther("100"),
        0
      );

      // Try invalid batch operations
      await expect(
        steakNStake.connect(user1).sendTipsBatch([], [])
      ).to.be.revertedWith("Empty arrays");

      await expect(
        steakNStake.connect(user1).sendTipsBatch(
          [user2.address],
          [TIP_AMOUNT, TIP_AMOUNT] // Mismatched lengths
        )
      ).to.be.revertedWith("Array length mismatch");
    });
  });

  describe("🔧 CRITICAL: Admin Reset Functions", function () {
    it("✅ Should reset user state correctly", async function () {
      await steakNStake.connect(user1).stake(STAKE_AMOUNT);
      
      // Reset to specific values
      await steakNStake.connect(owner).resetUserTipState(
        user1.address,
        ethers.parseEther("1000"), // 1000 allowance
        0                          // 0 sent
      );
      
      const stats = await steakNStake.getUserStats(user1.address);
      expect(stats[1]).to.equal(ethers.parseEther("1000")); // allocated
      expect(stats[2]).to.equal(0);                         // claimed
      
      const available = await steakNStake.getAvailableTipAllowance(user1.address);
      expect(available).to.equal(ethers.parseEther("1000"));
    });
  });

  describe("📊 Contract Version & Upgrade Safety", function () {
    it("✅ Should report correct version", async function () {
      const version = await steakNStake.version();
      expect(version).to.equal("1.1.0-tip-allowance");
    });

    it("✅ Should preserve core functionality", async function () {
      // Basic staking should still work
      await steakNStake.connect(user1).stake(STAKE_AMOUNT);
      const staked = await steakNStake.getStakedAmount(user1.address);
      expect(staked).to.equal(STAKE_AMOUNT);
      
      // Unstaking should work
      await steakNStake.connect(user1).unstake(ethers.parseEther("50"));
      const remaining = await steakNStake.getStakedAmount(user1.address);
      expect(remaining).to.equal(ethers.parseEther("50"));
    });
  });
});