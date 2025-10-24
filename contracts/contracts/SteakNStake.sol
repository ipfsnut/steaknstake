// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title SteakNStake
 * @dev Unified contract combining staking and tip reward allocation
 * Users stake STEAK tokens and can claim/stake tips received via Farcaster
 */
contract SteakNStake is 
    Initializable, 
    OwnableUpgradeable, 
    ReentrancyGuardUpgradeable, 
    PausableUpgradeable 
{
    using SafeERC20 for IERC20;

    // ================================
    // STATE VARIABLES
    // ================================
    
    // Token and core addresses
    IERC20 public steakToken;
    address public backendWallet;
    
    // Staking state
    mapping(address => uint256) public stakedAmounts;
    mapping(address => uint256) public stakeTimestamps;
    uint256 public totalStaked;
    uint256 public minimumStake;
    
    // Tip allocation state
    mapping(address => uint256) public allocatedTips;
    mapping(address => uint256) public claimedTips;
    uint256 public totalAllocated;
    uint256 public totalClaimed;
    
    // Authorization for tip allocation
    mapping(address => bool) public authorized;
    
    // Removed auto-staking functionality for security and simplicity
    
    // Social tracking
    mapping(address => uint256) public totalTipsReceived;
    mapping(address => uint256) public lifetimeStaked;

    // ================================
    // EVENTS
    // ================================
    
    // Staking events
    event Staked(address indexed user, uint256 amount, uint256 timestamp);
    event Unstaked(address indexed user, uint256 amount, uint256 timestamp);
    
    // Tip allocation events
    event TipsAllocated(address indexed user, uint256 amount);
    event TipsClaimed(address indexed user, uint256 amount, ClaimAction action);
    
    // Admin events
    event BackendWalletUpdated(address indexed oldWallet, address indexed newWallet);
    event MinimumStakeUpdated(uint256 oldMinimum, uint256 newMinimum);
    event AuthorizedUpdated(address indexed account, bool authorized);
    event ContractFunded(address indexed funder, uint256 amount);

    // ================================
    // ENUMS
    // ================================
    
    enum ClaimAction {
        TO_WALLET,      // Transfer tips to user wallet
        SPLIT_HALF      // Half to wallet, half to wallet (no auto-staking)
    }

    // ================================
    // MODIFIERS
    // ================================
    
    modifier onlyAuthorized() {
        require(authorized[msg.sender] || msg.sender == backendWallet || msg.sender == owner(), "Not authorized");
        _;
    }
    
    modifier validAddress(address addr) {
        require(addr != address(0), "Invalid address");
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
        address _steakToken,
        address _backendWallet,
        uint256 _minimumStake
    ) public initializer {
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        __Pausable_init();
        
        require(_steakToken != address(0), "Invalid token address");
        require(_backendWallet != address(0), "Invalid backend wallet");
        
        steakToken = IERC20(_steakToken);
        backendWallet = _backendWallet;
        minimumStake = _minimumStake;
        
        // Backend wallet is authorized by default
        authorized[_backendWallet] = true;
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
        steakToken.safeTransferFrom(user, address(this), amount);
        
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
        steakToken.safeTransfer(msg.sender, amount);
        
        emit Unstaked(msg.sender, amount, block.timestamp);
    }

    // ================================
    // TIP ALLOCATION FUNCTIONS (Backend)
    // ================================
    
    /**
     * @dev Allocate tips to multiple users (batch operation)
     */
    function allocateTipsBatch(
        address[] calldata users, 
        uint256[] calldata amounts
    ) external onlyAuthorized whenNotPaused {
        require(users.length == amounts.length, "Array length mismatch");
        require(users.length > 0, "Empty arrays");
        require(users.length <= 50, "Batch too large"); // Reduced for gas safety
        
        uint256 totalBatchAmount = 0;
        
        // First pass: validate all inputs and calculate total
        for (uint256 i = 0; i < users.length; i++) {
            require(users[i] != address(0), "Invalid user");
            require(amounts[i] > 0, "Invalid amount");
            totalBatchAmount += amounts[i];
        }
        
        // Ensure contract has enough funds for this batch
        uint256 contractBalance = steakToken.balanceOf(address(this));
        uint256 availableForTips = contractBalance > totalStaked ? contractBalance - totalStaked : 0;
        require(availableForTips >= totalBatchAmount, "Insufficient funds for batch allocation");
        
        // Second pass: execute allocations
        for (uint256 i = 0; i < users.length; i++) {
            address user = users[i];
            uint256 amount = amounts[i];
            
            allocatedTips[user] += amount;
            totalAllocated += amount;
            totalTipsReceived[user] += amount;
            
            emit TipsAllocated(user, amount);
        }
    }

    // ================================
    // TIP CLAIMING FUNCTIONS (Users)
    // ================================
    
    /**
     * @dev Claim allocated tips with specified action
     */
    function claimTips(ClaimAction action) external nonReentrant whenNotPaused {
        uint256 claimable = getClaimableAmount(msg.sender);
        require(claimable > 0, "No tips to claim");
        
        // Check contract balance BEFORE updating state
        uint256 contractBalance = steakToken.balanceOf(address(this));
        uint256 availableForClaims = contractBalance > totalStaked ? contractBalance - totalStaked : 0;
        require(availableForClaims >= claimable, "Insufficient contract balance for claims");
        
        // Update claimed amount
        claimedTips[msg.sender] += claimable;
        totalClaimed += claimable;
        
        // Execute the chosen action
        if (action == ClaimAction.TO_WALLET) {
            steakToken.safeTransfer(msg.sender, claimable);
        } else if (action == ClaimAction.SPLIT_HALF) {
            uint256 half = claimable / 2;
            uint256 remainder = claimable - half;
            
            // Send both halves to wallet (no auto-staking)
            steakToken.safeTransfer(msg.sender, half);
            steakToken.safeTransfer(msg.sender, remainder);
        }
        
        emit TipsClaimed(msg.sender, claimable, action);
    }
    
    /**
     * @dev Convenience function to claim tips to wallet
     */
    function claimToWallet() external {
        this.claimTips(ClaimAction.TO_WALLET);
    }
    


    // ================================
    // VIEW FUNCTIONS
    // ================================
    
    /**
     * @dev Get user's current staked amount
     */
    function getStakedAmount(address user) external view returns (uint256) {
        return stakedAmounts[user];
    }
    
    /**
     * @dev Get user's stake timestamp
     */
    function getStakeTimestamp(address user) external view returns (uint256) {
        return stakeTimestamps[user];
    }
    
    /**
     * @dev Get claimable tip amount for user
     */
    function getClaimableAmount(address user) public view returns (uint256) {
        return allocatedTips[user] - claimedTips[user];
    }
    
    /**
     * @dev Get comprehensive user stats
     */
    function getUserStats(address user) external view returns (
        uint256 staked,
        uint256 claimableTips,
        uint256 totalTipsReceived_,
        uint256 lifetimeStaked_,
        uint256 stakeTimestamp
    ) {
        return (
            stakedAmounts[user],
            getClaimableAmount(user),
            totalTipsReceived[user],
            lifetimeStaked[user],
            stakeTimestamps[user]
        );
    }
    
    /**
     * @dev Get contract statistics
     */
    function getContractStats() external view returns (
        uint256 totalStaked_,
        uint256 totalAllocated_,
        uint256 totalClaimed_,
        uint256 contractBalance
    ) {
        return (
            totalStaked,
            totalAllocated,
            totalClaimed,
            steakToken.balanceOf(address(this))
        );
    }
    
    /**
     * @dev Get contract's token balance
     */
    function getContractBalance() external view returns (uint256) {
        return steakToken.balanceOf(address(this));
    }

    // ================================
    // ADMIN FUNCTIONS
    // ================================
    
    /**
     * @dev Update backend wallet address
     */
    function setBackendWallet(address newBackendWallet) external onlyOwner {
        require(newBackendWallet != address(0), "Invalid address");
        
        // Remove old backend authorization
        authorized[backendWallet] = false;
        
        address oldWallet = backendWallet;
        backendWallet = newBackendWallet;
        
        // Authorize new backend
        authorized[newBackendWallet] = true;
        
        emit BackendWalletUpdated(oldWallet, newBackendWallet);
    }
    
    /**
     * @dev Set authorization for tip allocation
     */
    function setAuthorized(address account, bool _authorized) external onlyOwner {
        authorized[account] = _authorized;
        emit AuthorizedUpdated(account, _authorized);
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
     * @dev Fund contract with tokens for tip distribution
     */
    function fundContract(uint256 amount) external {
        require(amount > 0, "Invalid amount");
        steakToken.safeTransferFrom(msg.sender, address(this), amount);
        emit ContractFunded(msg.sender, amount);
    }
    
    /**
     * @dev Emergency function to recover NON-STEAK tokens only (only owner)
     */
    function emergencyRecoverTokens(address token, uint256 amount) external onlyOwner {
        require(token != address(0), "Invalid token address");
        require(token != address(steakToken), "Cannot recover staked STEAK tokens");
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
        return "1.0.0-unified";
    }
}