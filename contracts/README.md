# SteakNStake Smart Contracts

Smart contracts for the SteakNStake platform - Social Staking meets Farcaster Tipping.

## Overview

SteakNStake uses a simplified smart contract architecture where:
- **SteakToken**: ERC20 token ($STEAK) with mint/burn capabilities
- **SteakNStake**: Staking contract that tracks staked amounts
- **Backend**: Handles reward calculations and tip distributions

## Contracts

### SteakToken.sol
- Upgradeable ERC20 token contract
- Mint/burn functionality for token management
- Owner can mint new tokens as needed

### SteakNStake.sol
- Simple staking contract that tracks user stakes
- Backend wallet can distribute tip rewards
- Upgradeable for future enhancements
- Minimum stake requirement to prevent spam

## Architecture

```
User stakes STEAK → Contract tracks amount → Backend calculates rewards → Backend distributes tips
```

The backend handles:
- Reward rate calculations
- User tip balances
- Farcaster integration
- Tip distribution logic

## Deployment

### Prerequisites

1. Install dependencies:
```bash
npm install
```

2. Configure environment:
```bash
cp .env.example .env
# Edit .env with your private key and API keys
```

### Local Testing

```bash
# Compile contracts
npm run build

# Run tests
npm run test

# Deploy to local hardhat network
npm run deploy:local
```

### Base Testnet (Sepolia)

```bash
# Deploy to Base Sepolia testnet
npm run deploy:base-sepolia

# Verify contracts
npm run verify
```

### Base Mainnet

```bash
# Deploy to Base mainnet
npm run deploy:base
```

## Configuration

Key deployment parameters:
- **Initial Supply**: 1,000,000 STEAK tokens
- **Minimum Stake**: 1 STEAK
- **Reward Fund**: 100,000 STEAK tokens

## Contract Addresses

Deployment addresses will be saved to `deployments/{network}.json`.

## Backend Integration

The backend needs to:
1. Monitor staking events from the contract
2. Calculate rewards based on staking duration
3. Call `distributeTipReward()` when users tip creators
4. Maintain a funded token balance for rewards

## Security

- Uses OpenZeppelin upgradeable contracts
- ReentrancyGuard protection
- Owner-only admin functions
- Backend-only tip distribution

## Gas Optimization

- Minimal on-chain logic
- Efficient storage patterns
- Optimized for Base network gas costs