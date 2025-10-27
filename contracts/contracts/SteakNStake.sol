// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title SteakNStake
 * @dev TipN-style reward distribution where rewards become tip allowances
 * Users stake STEAK tokens and receive STEAK tip allowances via split() distribution
 */
contract SteakNStake is 
    Ownable, 
    ReentrancyGuard, 
    Pausable 
{
    using SafeERC20 for IERC20;

    // ================================
    // STATE VARIABLES
    // ================================
    
    // Tokens (same token for staking and rewards)
    IERC20 public stakeToken;   // STEAK for staking
    IERC20 public rewardToken;  // STEAK for rewards (same token)
    
    // Staking state
    mapping(address => uint256) public stakedAmounts;
    mapping(address => uint256) public stakeTimestamps;
    uint256 public totalStaked;
    uint256 public minimumStake;
    
    // Tip allowance distribution state (TipN pattern modified for tipping)
    mapping(address => uint256) public tippedOut;  // How much user has tipped out
    uint256 public totalRewardsDistributed;        // Total distributed via split()
    
    // Authorization for reward distribution (distributors)
    mapping(address => bool) public distributors;
    
    // Tip tracking
    mapping(bytes32 => bool) public processedTips;  // Track processed tip hashes
    mapping(bytes32 => uint256) public allocatedAmounts;  // Track allocated tip amounts
    uint256 public totalTipsSent;
    
    // Simple tracking (keep for compatibility)
    mapping(address => uint256) public lifetimeStaked;

    // ================================
    // EVENTS
    // ================================
    
    // Staking events
    event Staked(address indexed user, uint256 amount, uint256 timestamp);
    event Unstaked(address indexed user, uint256 amount, uint256 timestamp);
    
    // Tip allowance distribution events (TipN pattern)
    event RewardsSplit(uint256 amount, address indexed distributor);
    event TipSent(address indexed tipper, address indexed recipient, uint256 amount, bytes32 indexed tipHash);
    event TipClaimed(address indexed recipient, uint256 amount, bytes32 indexed tipHash);
    
    // Admin events
    event DistributorAdded(address indexed distributor);
    event DistributorRemoved(address indexed distributor);
    event MinimumStakeUpdated(uint256 oldMinimum, uint256 newMinimum);

    // ================================
    // MODIFIERS
    // ================================
    
    modifier onlyDistributor() {
        require(distributors[msg.sender] || msg.sender == owner(), "Not authorized distributor");
        _;
    }

    // ================================
    // CONSTRUCTOR
    // ================================
    
    constructor(
        address _stakeToken,
        address _rewardToken,
        uint256 _minimumStake
    ) Ownable(msg.sender) {
        require(_stakeToken != address(0), "Invalid stake token");
        require(_rewardToken != address(0), "Invalid reward token");
        
        stakeToken = IERC20(_stakeToken);
        rewardToken = IERC20(_rewardToken);
        minimumStake = _minimumStake;
    }

    // ================================
    // STAKING FUNCTIONS
    // ================================
    
    /**
     * @dev Stake STEAK tokens
     * @param amount Amount of tokens to stake
     */
    function stake(uint256 amount) external nonReentrant whenNotPaused {
        _stake(msg.sender, amount);
    }
    
    /**
     * @dev Internal staking logic
     */
    function _stake(address user, uint256 amount) internal {
        require(amount >= minimumStake, "Amount below minimum stake");
        require(amount > 0, "Cannot stake zero tokens");
        
        // Transfer tokens from user to contract
        stakeToken.safeTransferFrom(user, address(this), amount);
        
        // Update user's staked amount
        stakedAmounts[user] += amount;
        stakeTimestamps[user] = block.timestamp;
        lifetimeStaked[user] += amount;
        
        // Update total staked
        totalStaked += amount;
        
        emit Staked(user, amount, block.timestamp);
    }
    

    /**
     * @dev Unstake STEAK tokens
     * @param amount Amount of tokens to unstake
     */
    function unstake(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "Cannot unstake zero tokens");
        require(stakedAmounts[msg.sender] >= amount, "Insufficient staked balance");
        
        // Update user's staked amount
        stakedAmounts[msg.sender] -= amount;
        
        // Update total staked
        totalStaked -= amount;
        
        // If user unstaked everything, reset timestamp
        if (stakedAmounts[msg.sender] == 0) {
            stakeTimestamps[msg.sender] = 0;
        }
        
        // Transfer tokens back to user
        stakeToken.safeTransfer(msg.sender, amount);
        
        emit Unstaked(msg.sender, amount, block.timestamp);
    }

    // ================================
    // TIP ALLOWANCE DISTRIBUTION FUNCTIONS (TipN Pattern Modified)
    // ================================
    
    /**
     * @dev Split tip allowances among all current stakers (like TipN's split function)
     */
    function split(uint256 rewardQuantity) external onlyDistributor nonReentrant whenNotPaused {
        require(rewardQuantity > 0, "Invalid reward quantity");
        require(totalStaked > 0, "No stakers to distribute to");
        
        // Transfer reward tokens from distributor to contract
        rewardToken.safeTransferFrom(msg.sender, address(this), rewardQuantity);
        
        // Track total rewards distributed (this becomes available tip allowances)
        totalRewardsDistributed += rewardQuantity;
        
        emit RewardsSplit(rewardQuantity, msg.sender);
    }
    
    /**
     * @dev Send tip using accumulated tip allowances (replaces claim function)
     */
    function sendTip(address recipient, uint256 amount, bytes32 tipHash) external nonReentrant whenNotPaused {
        require(recipient != address(0), "Invalid recipient");
        require(recipient != msg.sender, "Cannot tip yourself");
        require(amount > 0, "Invalid tip amount");
        require(!processedTips[tipHash], "Tip already processed");
        
        uint256 availableAllowance = getAvailableTipAllowance(msg.sender);
        require(availableAllowance >= amount, "Insufficient tip allowance");
        
        // Update tipped out amount
        tippedOut[msg.sender] += amount;
        
        // Mark tip as processed
        processedTips[tipHash] = true;
        totalTipsSent += amount;
        
        // Transfer tokens to recipient
        rewardToken.safeTransfer(recipient, amount);
        
        emit TipSent(msg.sender, recipient, amount, tipHash);
    }
    
    /**
     * @dev Alternative: Send tip that recipient can claim later (for Farcaster integration)
     */
    function allocateTip(address recipient, uint256 amount, bytes32 tipHash) external nonReentrant whenNotPaused {
        require(recipient != address(0), "Invalid recipient");
        require(recipient != msg.sender, "Cannot tip yourself");
        require(amount > 0, "Invalid tip amount");
        require(!processedTips[tipHash], "Tip already processed");
        
        uint256 availableAllowance = getAvailableTipAllowance(msg.sender);
        require(availableAllowance >= amount, "Insufficient tip allowance");
        
        // Update tipped out amount
        tippedOut[msg.sender] += amount;
        
        // Mark tip as allocated (but not transferred yet) AND store amount
        processedTips[tipHash] = true;
        allocatedAmounts[tipHash] = amount;  // Store allocated amount for validation
        totalTipsSent += amount;
        
        emit TipSent(msg.sender, recipient, amount, tipHash);
    }
    
    /**
     * @dev Claim allocated tip (for Farcaster recipients)
     */
    function claimTip(address recipient, uint256 amount, bytes32 tipHash) external onlyDistributor nonReentrant whenNotPaused {
        require(processedTips[tipHash], "Tip not found");
        require(amount > 0, "Invalid amount");
        uint256 allocatedAmount = allocatedAmounts[tipHash];
        require(allocatedAmount > 0, "Tip already claimed or invalid");
        require(amount == allocatedAmount, "Amount mismatch with allocated tip");
        
        // Clear the allocated amount to prevent double claiming
        allocatedAmounts[tipHash] = 0;
        
        // Transfer tokens to recipient
        rewardToken.safeTransfer(recipient, amount);
        
        emit TipClaimed(recipient, amount, tipHash);
    }

    // ================================
    // VIEW FUNCTIONS (TipN Pattern Modified)
    // ================================
    
    /**
     * @dev Get available tip allowance for a user (replaces getUnclaimedEarnings)
     */
    function getAvailableTipAllowance(address user) public view returns (uint256) {
        if (stakedAmounts[user] == 0 || totalStaked == 0 || totalRewardsDistributed == 0) {
            return 0;
        }
        
        // Enhanced proportional calculation with overflow protection:
        // user_allowance = (user_stake * total_rewards_distributed) / total_stake
        uint256 userStake = stakedAmounts[user];
        uint256 totalRewards = totalRewardsDistributed;
        uint256 totalStake = totalStaked;
        
        uint256 totalEarned;
        
        // Check for potential overflow before multiplication
        if (totalRewards > 0 && userStake > type(uint256).max / totalRewards) {
            // Use scaled calculation to prevent overflow
            // Scale down by 1e18, calculate, then scale back up
            uint256 scaledUserStake = userStake / 1e18;
            uint256 scaledTotalRewards = totalRewards / 1e18;  
            uint256 scaledTotalStake = totalStake / 1e18;
            
            if (scaledTotalStake == 0) return 0; // Avoid division by zero
            totalEarned = (scaledUserStake * scaledTotalRewards * 1e18) / scaledTotalStake;
        } else {
            // Normal calculation - safe from overflow
            totalEarned = (userStake * totalRewards) / totalStake;
        }
        
        // Subtract already tipped out amount
        uint256 alreadyTipped = tippedOut[user];
        if (totalEarned <= alreadyTipped) return 0;
        
        return totalEarned - alreadyTipped;
    }
    
    /**
     * @dev Get user's staked amount
     */
    function getStakedAmount(address user) external view returns (uint256) {
        return stakedAmounts[user];
    }
    
    /**
     * @dev Get user's total tipped out amount
     */
    function getTippedOut(address user) external view returns (uint256) {
        return tippedOut[user];
    }
    
    /**
     * @dev Get total earned allowances for user (for display purposes)
     */
    function getTotalEarnedAllowances(address user) external view returns (uint256) {
        if (stakedAmounts[user] == 0 || totalStaked == 0 || totalRewardsDistributed == 0) {
            return 0;
        }
        
        uint256 userStake = stakedAmounts[user];
        uint256 totalRewards = totalRewardsDistributed;
        uint256 totalStake = totalStaked;
        
        // Check for potential overflow before multiplication
        if (totalRewards > 0 && userStake > type(uint256).max / totalRewards) {
            // Use scaled calculation to prevent overflow
            uint256 scaledUserStake = userStake / 1e18;
            uint256 scaledTotalRewards = totalRewards / 1e18;  
            uint256 scaledTotalStake = totalStake / 1e18;
            
            if (scaledTotalStake == 0) return 0;
            return (scaledUserStake * scaledTotalRewards * 1e18) / scaledTotalStake;
        } else {
            // Normal calculation - safe from overflow
            return (userStake * totalRewards) / totalStake;
        }
    }

    // Legacy compatibility functions (to avoid breaking frontend)
    function getUnclaimedEarnings(address user, uint256 limit) public view returns (uint256) {
        uint256 available = getAvailableTipAllowance(user);
        return available > limit ? limit : available;
    }
    
    function getClaimedEarnings(address user) external view returns (uint256) {
        return tippedOut[user];
    }
    
    


    // ================================
    // ADMIN FUNCTIONS
    // ================================
    
    /**
     * @dev Add distributor (can call split function)
     */
    function addDistributor(address distributor) external onlyOwner {
        require(distributor != address(0), "Invalid distributor");
        require(!distributors[distributor], "Already a distributor");
        
        distributors[distributor] = true;
        
        emit DistributorAdded(distributor);
    }
    
    /**
     * @dev Remove distributor
     */
    function removeDistributor(address distributor) external onlyOwner {
        require(distributors[distributor], "Not a distributor");
        
        distributors[distributor] = false;
        
        emit DistributorRemoved(distributor);
    }
    
    /**
     * @dev Check if address is distributor
     */
    function isDistributor(address account) external view returns (bool) {
        return distributors[account];
    }
    
    
    /**
     * @dev Update minimum stake amount
     */
    function setMinimumStake(uint256 newMinimumStake) external onlyOwner {
        uint256 oldMinimum = minimumStake;
        minimumStake = newMinimumStake;
        emit MinimumStakeUpdated(oldMinimum, newMinimumStake);
    }
    
    /**
     * @dev Fund contract with reward tokens for distribution (only distributors/owner)
     */
    function fundContract(uint256 amount) external onlyDistributor {
        require(amount > 0, "Invalid amount");
        rewardToken.safeTransferFrom(msg.sender, address(this), amount);
    }
    
    /**
     * @dev Emergency function to recover other tokens only (only owner)
     */
    function emergencyRecoverTokens(address token, uint256 amount) external onlyOwner {
        require(token != address(0), "Invalid token address");
        require(token != address(stakeToken), "Cannot recover stake tokens");
        require(token != address(rewardToken), "Cannot recover reward tokens");
        IERC20(token).safeTransfer(owner(), amount);
    }
    
    /**
     * @dev Pause contract functions
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @dev Unpause contract functions
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    

    // ================================
    // VERSION
    // ================================
    
    /**
     * @dev Get contract version
     */
    function version() external pure returns (string memory) {
        return "3.0.0-tipn-tipping";
    }
}