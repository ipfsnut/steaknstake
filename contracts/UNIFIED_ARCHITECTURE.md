# SteakNStake Unified Contract Architecture

## 🏗️ Single Contract vs Separate Contracts

### Option 1: Separate Contracts ❌
```
SteakNStake.sol (staking only)
    ↓
SteakRewards.sol (tip allocation/claiming)
    ↓
STEAK Token (external)
```

**Problems:**
- Users need to approve both contracts
- Complex integration between contracts  
- Higher gas costs (cross-contract calls)
- More attack surface
- Harder to upgrade coordination

### Option 2: Unified Contract ✅
```
SteakNStakeV2.sol
├── Staking Functions
│   ├── stake()
│   ├── unstake()
│   └── getStakedAmount()
├── Tip Allocation (Backend)
│   ├── allocateTipsBatch()
│   └── setAuthorized()
└── Tip Claiming (Users)
    ├── claimTips()
    ├── claimAndStake()
    └── getClaimableAmount()
```

## 🎯 Unified Contract Benefits

### ✅ **Gas Efficiency**
- Single approval for all functions
- Internal transfers (no external calls)
- Shared storage optimization

### ✅ **User Experience**
```javascript
// One contract, all features
await contract.stake(amount);           // Direct staking
await contract.claimAndStake();         // Claim tips as stake
await contract.unstake(amount);         // Unstake everything
```

### ✅ **Developer Experience**
- Single deployment
- Unified testing
- Coordinated upgrades
- Single contract address to manage

### ✅ **Security**
- Smaller attack surface
- Internal function calls
- Centralized access control

## 🔧 Implementation Plan

### Contract Structure:
```solidity
contract SteakNStakeV2 is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable {
    
    // === STAKING FUNCTIONALITY ===
    mapping(address => uint256) public stakedAmounts;
    mapping(address => uint256) public stakeTimestamps;
    uint256 public totalStaked;
    
    // === TIP ALLOCATION FUNCTIONALITY ===
    mapping(address => uint256) public allocatedTips;
    mapping(address => uint256) public claimedTips;
    uint256 public totalAllocated;
    uint256 public totalClaimed;
    
    // === SHARED ===
    IERC20 public steakToken;
    address public backendWallet;
    mapping(address => bool) public authorized;
    
    // Staking functions...
    // Tip allocation functions...
    // Unified claiming functions...
}
```

### Enhanced Claiming Options:
```solidity
enum ClaimAction {
    TO_WALLET,      // Transfer to user wallet
    TO_STAKE,       // Auto-stake the tips
    SPLIT_HALF      // Half to wallet, half to stake
}

function claimTips(ClaimAction action) external {
    uint256 claimable = getClaimableAmount(msg.sender);
    require(claimable > 0, "No tips to claim");
    
    claimedTips[msg.sender] += claimable;
    totalClaimed += claimable;
    
    if (action == ClaimAction.TO_WALLET) {
        steakToken.transfer(msg.sender, claimable);
    } else if (action == ClaimAction.TO_STAKE) {
        _stakeFor(msg.sender, claimable);
    } else if (action == ClaimAction.SPLIT_HALF) {
        uint256 half = claimable / 2;
        steakToken.transfer(msg.sender, half);
        _stakeFor(msg.sender, claimable - half);
    }
}
```

## 📊 Contract Interaction Flow

### Backend Batch Processing:
```javascript
// Evening batch: allocate all daily tips
await contract.allocateTipsBatch(
    [user1, user2, user3, ...],
    [amount1, amount2, amount3, ...]
);
```

### User Interface:
```javascript
// Rich claiming interface
const claimable = await contract.getClaimableAmount(userAddress);
const staked = await contract.getStakedAmount(userAddress);

// User chooses claim action
await contract.claimTips(ClaimAction.TO_STAKE); // Auto-compound!
```

### Unified Statistics:
```javascript
// Single contract for all data
const userStats = await contract.getUserStats(address);
// Returns: staked, claimable tips, total earned, etc.
```

## 🚀 Migration Strategy

### Phase 1: Deploy Unified Contract
```bash
npm run deploy:base  # Deploy SteakNStakeV2
```

### Phase 2: Update Backend
```javascript
// Replace separate calls with unified contract
const contract = new ethers.Contract(UNIFIED_ADDRESS, ABI, signer);

// Staking operations
await contract.stake(amount);

// Tip processing  
await contract.allocateTipsBatch(users, amounts);
```

### Phase 3: Enhanced Frontend
```jsx
// Single contract for everything
const contract = useSteakNStakeContract();

// Unified user dashboard
<UserDashboard 
  stakedAmount={staked}
  claimableTips={claimable}
  contract={contract}
/>
```

## 🔧 Development Steps

1. **Merge contracts into SteakNStakeV2.sol**
2. **Add unified test suite**
3. **Update deployment scripts**
4. **Create unified frontend interface**
5. **Update backend to use single contract**

## 💡 Additional Benefits

### Smart Tip Auto-Staking:
```solidity
// Users can set preferences
mapping(address => bool) public autoStakeTips;

function setAutoStake(bool enabled) external {
    autoStakeTips[msg.sender] = enabled;
}

// Backend can respect user preferences
function allocateWithPreference(address user, uint256 amount) internal {
    if (autoStakeTips[user]) {
        _stakeFor(user, amount);
    } else {
        allocatedTips[user] += amount;
    }
}
```

### Social Features:
```solidity
// Track tip relationships
mapping(address => mapping(address => uint256)) public tipsSentTo;
mapping(address => uint256) public totalTipsReceived;
mapping(address => uint256) public totalTipsSent;

// Leaderboards and social proof
function getTopTippers() external view returns (address[] memory);
function getTopRecipients() external view returns (address[] memory);
```

**Ready to implement the unified contract approach?** This will give us maximum flexibility and the best user experience! 🥩🚀