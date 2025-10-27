// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title SteakNStake
 * @dev TipN-style reward distribution contract
 * Users stake STEAK tokens and receive STEAK rewards via split() distribution
 */
contract SteakNStake is 
    Initializable, 
    OwnableUpgradeable, 
    ReentrancyGuardUpgradeable, 
    PausableUpgradeable,
    UUPSUpgradeable 
{
    using SafeERC20 for IERC20;

    // ================================
    // STATE VARIABLES
    // ================================
    
    // Tokens (TipN pattern: stakeToken and rewardToken)
    IERC20 public stakeToken;   // STEAK for staking
    IERC20 public rewardToken;  // STEAK for rewards (same token)
    
    // Staking state
    mapping(address => uint256) public stakedAmounts;
    mapping(address => uint256) public stakeTimestamps;
    uint256 public totalStaked;
    uint256 public minimumStake;
    
    // Reward distribution state (TipN pattern)
    mapping(address => uint256) public claimedEarnings;
    uint256 public totalRewardsDistributed;
    
    // Authorization for reward distribution (distributors like TipN)
    mapping(address => bool) public distributors;
    
    // Simple tracking (keep for compatibility)
    mapping(address => uint256) public lifetimeStaked;

    // ================================
    // EVENTS
    // ================================
    
    // Staking events
    event Staked(address indexed user, uint256 amount, uint256 timestamp);
    event Unstaked(address indexed user, uint256 amount, uint256 timestamp);
    
    // Reward distribution events (TipN pattern)
    event RewardsSplit(uint256 amount, address indexed distributor);
    event RewardsClaimed(address indexed user, uint256 amount);
    
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
    // INITIALIZATION
    // ================================
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _stakeToken,
        address _rewardToken,
        uint256 _minimumStake
    ) public initializer {
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        __Pausable_init();
        
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
    // REWARD DISTRIBUTION FUNCTIONS (TipN Pattern)
    // ================================
    
    /**
     * @dev Split rewards among all current stakers (like TipN's split function)
     */
    function split(uint256 rewardQuantity) external onlyDistributor nonReentrant whenNotPaused {
        require(rewardQuantity > 0, "Invalid reward quantity");
        require(totalStaked > 0, "No stakers to distribute to");
        
        // Transfer reward tokens from distributor to contract
        rewardToken.safeTransferFrom(msg.sender, address(this), rewardQuantity);
        
        // Track total rewards distributed
        totalRewardsDistributed += rewardQuantity;
        
        emit RewardsSplit(rewardQuantity, msg.sender);
    }
    
    /**
     * @dev Claim accumulated rewards (like TipN's claim function)
     */
    function claim(address to, uint256 limit) external nonReentrant whenNotPaused {
        uint256 claimableAmount = getUnclaimedEarnings(msg.sender, limit);
        require(claimableAmount > 0, "No rewards to claim");
        
        // Update claimed amount
        claimedEarnings[msg.sender] += claimableAmount;
        
        // Transfer rewards to specified address
        rewardToken.safeTransfer(to, claimableAmount);
        
        emit RewardsClaimed(msg.sender, claimableAmount);
    }
    
    /**
     * @dev Convenience function to claim to sender's wallet
     */
    function claimToWallet() external {
        this.claim(msg.sender, type(uint256).max);
    }

    // ================================
    // VIEW FUNCTIONS (TipN Pattern)
    // ================================
    
    /**
     * @dev Get unclaimed earnings for a user up to a limit (like TipN)
     */
    function getUnclaimedEarnings(address user, uint256 limit) public view returns (uint256) {
        if (stakedAmounts[user] == 0 || totalStaked == 0 || totalRewardsDistributed == 0) {
            return 0;
        }
        
        // Simple proportional calculation:
        // user_earnings = (user_stake / total_stake) * total_rewards_distributed
        uint256 totalEarned = (stakedAmounts[user] * totalRewardsDistributed) / totalStaked;
        
        // Subtract already claimed amount
        uint256 alreadyClaimed = claimedEarnings[user];
        if (totalEarned <= alreadyClaimed) return 0;
        
        uint256 unclaimed = totalEarned - alreadyClaimed;
        return unclaimed > limit ? limit : unclaimed;
    }
    
    /**
     * @dev Get user's staked amount
     */
    function getStakedAmount(address user) external view returns (uint256) {
        return stakedAmounts[user];
    }
    
    /**
     * @dev Get user's claimed earnings
     */
    function getClaimedEarnings(address user) external view returns (uint256) {
        return claimedEarnings[user];
    }

    // Note: TipN pattern uses split() for distribution, not allocateTipsBatch()
    
    


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
     * @dev Fund contract with reward tokens for distribution
     */
    function fundContract(uint256 amount) external {
        require(amount > 0, "Invalid amount");
        rewardToken.safeTransferFrom(msg.sender, address(this), amount);
    }
    
    /**
     * @dev Emergency function to recover other tokens only (only owner)
     */
    function emergencyRecoverTokens(address token, uint256 amount) external onlyOwner {
        require(token != address(0), "Invalid token address");
        require(token != address(stakeToken), "Cannot recover STEAK tokens");
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
    
    /**
     * @dev Authorize upgrades (UUPS pattern)
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ================================
    // VERSION
    // ================================
    
    /**
     * @dev Get contract version
     */
    function version() external pure returns (string memory) {
        return "2.0.0-tipn-style";
    }
}