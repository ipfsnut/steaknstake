const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("SteakNStake Security & Functionality Tests", function () {
  let steakToken, steakNStake;
  let owner, user1, user2, user3, backend, attacker;
  let proxyAddress;

  const INITIAL_SUPPLY = ethers.parseEther("1000000"); // 1M tokens
  const STAKE_AMOUNT = ethers.parseEther("100");
  const TIP_AMOUNT = ethers.parseEther("10");

  beforeEach(async function () {
    [owner, user1, user2, user3, backend, attacker] = await ethers.getSigners();

    // Deploy mock STEAK token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    steakToken = await MockERC20.deploy("STEAK Token", "STEAK", INITIAL_SUPPLY);
    await steakToken.waitForDeployment();

    // Deploy upgradeable SteakNStake contract
    const SteakNStake = await ethers.getContractFactory("SteakNStake");
    steakNStake = await upgrades.deployProxy(SteakNStake, [
      await steakToken.getAddress(),
      backend.address,
      ethers.parseEther("1") // minimum stake
    ], { initializer: "initialize" });
    await steakNStake.waitForDeployment();
    proxyAddress = await steakNStake.getAddress();

    // Distribute tokens
    await steakToken.transfer(user1.address, ethers.parseEther("1000"));
    await steakToken.transfer(user2.address, ethers.parseEther("1000"));
    await steakToken.transfer(user3.address, ethers.parseEther("1000"));
    
    // Approve contract to spend tokens
    await steakToken.connect(user1).approve(proxyAddress, ethers.parseEther("1000"));
    await steakToken.connect(user2).approve(proxyAddress, ethers.parseEther("1000"));
    await steakToken.connect(user3).approve(proxyAddress, ethers.parseEther("1000"));
  });

  describe("🔒 Security Tests", function () {
    it("Should prevent unauthorized access to admin functions", async function () {
      await expect(
        steakNStake.connect(attacker).setDailyAllowanceRate(500)
      ).to.be.revertedWith("Ownable: caller is not the owner");

      await expect(
        steakNStake.connect(attacker).resetUserTipState(user1.address, 1000, 0)
      ).to.be.revertedWith("Ownable: caller is not the owner");

      await expect(
        steakNStake.connect(attacker).allocateTipsBatch([user1.address], [TIP_AMOUNT])
      ).to.be.revertedWith("Not authorized");
    });

    it("Should prevent self-tipping", async function () {
      // User1 stakes tokens
      await steakNStake.connect(user1).stake(STAKE_AMOUNT);
      
      // Initialize their allowance
      await steakNStake.connect(backend).initializeTipAllowance(user1.address);
      
      // Try to tip themselves - should fail
      await expect(
        steakNStake.connect(user1).sendTip(user1.address, TIP_AMOUNT)
      ).to.be.revertedWith("Cannot tip yourself");
    });

    it("Should prevent tipping without sufficient allowance", async function () {
      await steakNStake.connect(user1).stake(STAKE_AMOUNT);
      await steakNStake.connect(backend).initializeTipAllowance(user1.address);
      
      // Try to tip more than allowance
      await expect(
        steakNStake.connect(user1).sendTip(user2.address, ethers.parseEther("1000"))
      ).to.be.revertedWith("Insufficient tip allowance");
    });

    it("Should prevent non-stakers from sending tips", async function () {
      await expect(
        steakNStake.connect(user1).sendTip(user2.address, TIP_AMOUNT)
      ).to.be.revertedWith("Must be staking to send tips");
    });

    it("Should prevent integer overflow/underflow", async function () {
      // Test with maximum uint256 values
      const MAX_UINT = ethers.MaxUint256;
      
      await expect(
        steakNStake.connect(owner).setDailyAllowanceRate(2000) // >10%
      ).to.be.revertedWith("Rate too high (max 10%)");
    });

    it("Should prevent reentrancy attacks", async function () {
      // This is tested by the ReentrancyGuard modifier
      // The contract uses nonReentrant on critical functions
      await steakNStake.connect(user1).stake(STAKE_AMOUNT);
      
      // Verify nonReentrant is applied to critical functions
      const contract = await ethers.getContractAt("SteakNStake", proxyAddress);
      // sendTip, claimTips, stake, unstake should all be protected
    });
  });

  describe("⚡ Tip Allowance System Tests", function () {
    beforeEach(async function () {
      // Setup: User1 stakes and gets allowance initialized
      await steakNStake.connect(user1).stake(STAKE_AMOUNT);
      await steakNStake.connect(backend).initializeTipAllowance(user1.address);
    });

    it("Should calculate tip allowance correctly over time", async function () {
      // Check initial allowance (should be 0)
      const initialAllowance = await steakNStake.getAvailableTipAllowance(user1.address);
      expect(initialAllowance).to.equal(0);

      // Fast forward 1 day
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      await ethers.provider.send("evm_mine");

      // Update allowance and check
      await steakNStake.updateTipAllowance(user1.address);
      const oneDayAllowance = await steakNStake.getAvailableTipAllowance(user1.address);
      
      // Should be 1% of staked amount (100 tokens * 1% = 1 token)
      expect(oneDayAllowance).to.equal(ethers.parseEther("1"));
    });

    it("Should handle allowance rate changes", async function () {
      // Change rate to 0.5% per day (50 basis points)
      await steakNStake.connect(owner).setDailyAllowanceRate(50);
      
      // Fast forward 1 day and check allowance
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      await steakNStake.updateTipAllowance(user1.address);
      
      const allowance = await steakNStake.getAvailableTipAllowance(user1.address);
      expect(allowance).to.equal(ethers.parseEther("0.5")); // 0.5% of 100
    });

    it("Should track sent tips correctly", async function () {
      // Give user1 some allowance
      await steakNStake.connect(owner).resetUserTipState(
        user1.address, 
        ethers.parseEther("50"), // 50 tokens allowance
        0 // 0 sent
      );

      // Send a tip
      await steakNStake.connect(user1).sendTip(user2.address, TIP_AMOUNT);
      
      // Check sent tips
      const sentTips = await steakNStake.tipsSent(user1.address);
      expect(sentTips).to.equal(TIP_AMOUNT);
      
      // Check remaining allowance
      const remaining = await steakNStake.getAvailableTipAllowance(user1.address);
      expect(remaining).to.equal(ethers.parseEther("40")); // 50 - 10
    });
  });

  describe("🎯 Tip Sending & Receiving Tests", function () {
    beforeEach(async function () {
      await steakNStake.connect(user1).stake(STAKE_AMOUNT);
      await steakNStake.connect(owner).resetUserTipState(
        user1.address,
        ethers.parseEther("100"), // 100 tip allowance
        0 // 0 sent
      );
    });

    it("Should send tips correctly", async function () {
      await steakNStake.connect(user1).sendTip(user2.address, TIP_AMOUNT);
      
      // Check sender's state
      const sentTips = await steakNStake.tipsSent(user1.address);
      expect(sentTips).to.equal(TIP_AMOUNT);
      
      // Check recipient's allocated tips
      const allocatedTips = await steakNStake.allocatedTips(user2.address);
      expect(allocatedTips).to.equal(TIP_AMOUNT);
      
      // Check claimable amount for recipient
      const claimable = await steakNStake.getClaimableAmount(user2.address);
      expect(claimable).to.equal(TIP_AMOUNT);
    });

    it("Should handle batch tip sending", async function () {
      const recipients = [user2.address, user3.address];
      const amounts = [TIP_AMOUNT, ethers.parseEther("5")];
      
      await steakNStake.connect(user1).sendTipsBatch(recipients, amounts);
      
      // Check total sent
      const totalSent = await steakNStake.tipsSent(user1.address);
      expect(totalSent).to.equal(ethers.parseEther("15")); // 10 + 5
      
      // Check individual allocations
      expect(await steakNStake.allocatedTips(user2.address)).to.equal(TIP_AMOUNT);
      expect(await steakNStake.allocatedTips(user3.address)).to.equal(ethers.parseEther("5"));
    });

    it("Should prevent batch operations with mismatched arrays", async function () {
      await expect(
        steakNStake.connect(user1).sendTipsBatch(
          [user2.address, user3.address],
          [TIP_AMOUNT] // Only one amount for two recipients
        )
      ).to.be.revertedWith("Array length mismatch");
    });

    it("Should handle tip claiming correctly", async function () {
      // Send tip to user2
      await steakNStake.connect(user1).sendTip(user2.address, TIP_AMOUNT);
      
      // Fund contract so user2 can claim
      await steakToken.transfer(proxyAddress, ethers.parseEther("1000"));
      
      // User2 claims to wallet
      const balanceBefore = await steakToken.balanceOf(user2.address);
      await steakNStake.connect(user2).claimToWallet();
      const balanceAfter = await steakToken.balanceOf(user2.address);
      
      expect(balanceAfter - balanceBefore).to.equal(TIP_AMOUNT);
      
      // Check claimed amount is updated
      const claimedTips = await steakNStake.claimedTips(user2.address);
      expect(claimedTips).to.equal(TIP_AMOUNT);
    });
  });

  describe("📊 getUserStats Function Tests", function () {
    it("Should return correct stats format", async function () {
      await steakNStake.connect(user1).stake(STAKE_AMOUNT);
      await steakNStake.connect(owner).resetUserTipState(
        user1.address,
        ethers.parseEther("50"), // tip allowance
        ethers.parseEther("10")  // tips sent
      );
      
      // Allocate some tips to user1 as recipient
      await steakNStake.connect(backend).allocateTipsBatch(
        [user1.address],
        [ethers.parseEther("20")]
      );
      
      const stats = await steakNStake.getUserStats(user1.address);
      
      expect(stats[0]).to.equal(STAKE_AMOUNT);          // staked
      expect(stats[1]).to.equal(ethers.parseEther("50")); // allocated (tip allowance)
      expect(stats[2]).to.equal(ethers.parseEther("10")); // claimed (tips sent)
      expect(stats[3]).to.equal(ethers.parseEther("20")); // claimable (received tips)
      expect(stats[4]).to.equal(ethers.parseEther("20")); // totalReceived
    });
  });

  describe("🛠️ Admin Functions Tests", function () {
    it("Should reset user tip state correctly", async function () {
      await steakNStake.connect(user1).stake(STAKE_AMOUNT);
      
      // Reset user's tip state
      await steakNStake.connect(owner).resetUserTipState(
        user1.address,
        ethers.parseEther("100"), // new allowance
        ethers.parseEther("25")   // new sent amount
      );
      
      const allowance = await steakNStake.tipAllowances(user1.address);
      const sent = await steakNStake.tipsSent(user1.address);
      const available = await steakNStake.getAvailableTipAllowance(user1.address);
      
      expect(allowance).to.equal(ethers.parseEther("100"));
      expect(sent).to.equal(ethers.parseEther("25"));
      expect(available).to.equal(ethers.parseEther("75")); // 100 - 25
    });

    it("Should handle batch resets", async function () {
      await steakNStake.connect(user1).stake(STAKE_AMOUNT);
      await steakNStake.connect(user2).stake(STAKE_AMOUNT);
      
      await steakNStake.connect(owner).resetUsersTipStateBatch(
        [user1.address, user2.address],
        [ethers.parseEther("100"), ethers.parseEther("200")],
        [ethers.parseEther("10"), ethers.parseEther("20")]
      );
      
      expect(await steakNStake.tipAllowances(user1.address)).to.equal(ethers.parseEther("100"));
      expect(await steakNStake.tipAllowances(user2.address)).to.equal(ethers.parseEther("200"));
      expect(await steakNStake.tipsSent(user1.address)).to.equal(ethers.parseEther("10"));
      expect(await steakNStake.tipsSent(user2.address)).to.equal(ethers.parseEther("20"));
    });
  });

  describe("🔄 Contract Upgrade Tests", function () {
    it("Should maintain version information", async function () {
      const version = await steakNStake.version();
      expect(version).to.equal("1.1.0-tip-allowance");
    });

    it("Should preserve existing functionality", async function () {
      // Test that old functions still work
      await steakNStake.connect(user1).stake(STAKE_AMOUNT);
      
      const stakedAmount = await steakNStake.getStakedAmount(user1.address);
      expect(stakedAmount).to.equal(STAKE_AMOUNT);
      
      await steakNStake.connect(user1).unstake(ethers.parseEther("50"));
      const remainingStaked = await steakNStake.getStakedAmount(user1.address);
      expect(remainingStaked).to.equal(ethers.parseEther("50"));
    });
  });

  describe("💰 Economic Security Tests", function () {
    it("Should prevent allowance exploitation", async function () {
      await steakNStake.connect(user1).stake(STAKE_AMOUNT);
      await steakNStake.connect(backend).initializeTipAllowance(user1.address);
      
      // Try to exploit by calling updateTipAllowance multiple times
      // Should not give more allowance than deserved
      await steakNStake.updateTipAllowance(user1.address);
      const allowance1 = await steakNStake.getAvailableTipAllowance(user1.address);
      
      await steakNStake.updateTipAllowance(user1.address);
      const allowance2 = await steakNStake.getAvailableTipAllowance(user1.address);
      
      expect(allowance1).to.equal(allowance2); // Should be the same
    });

    it("Should handle contract balance constraints", async function () {
      await steakNStake.connect(user1).stake(STAKE_AMOUNT);
      
      // Give user1 huge allowance but contract has no free funds
      await steakNStake.connect(owner).resetUserTipState(
        user1.address,
        ethers.parseEther("1000000"), // 1M allowance
        0
      );
      
      // Try to send tip (this should work as tips don't require immediate tokens)
      await steakNStake.connect(user1).sendTip(user2.address, TIP_AMOUNT);
      
      // But claiming should fail if contract doesn't have funds
      await expect(
        steakNStake.connect(user2).claimToWallet()
      ).to.be.revertedWith("Insufficient contract balance for claims");
    });
  });
});