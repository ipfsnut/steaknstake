# SteakNStake Deployment Guide

## Prerequisites

1. **STEAK Token**: Create your $STEAK token using Clanker UI first
2. **Base Wallet**: Have ETH on Base network for gas fees
3. **Environment Setup**: Configure your deployment environment

## Step 1: Environment Setup

```bash
cd contracts
npm install
cp .env.example .env
```

Edit `.env` file:
```env
PRIVATE_KEY=your_deployment_private_key_without_0x
BASESCAN_API_KEY=your_basescan_api_key
BACKEND_WALLET_ADDRESS=your_backend_wallet_address
```

## Step 2: Run Tests

```bash
# Run comprehensive test suite
npm test

# Or use the test runner
node test-runner.js
```

## Step 3: Deploy to Base Sepolia (Testnet)

```bash
# Deploy to testnet first
npm run deploy:base-sepolia
```

Update deployment script with your Clanker token address:
```javascript
// In scripts/deploy.js, replace steakTokenAddress with your Clanker token
const steakTokenAddress = "0x..."; // Your Clanker STEAK token address
```

## Step 4: Deploy to Base Mainnet

```bash
# Deploy to mainnet
npm run deploy:base
```

## Step 5: Verify Contracts

```bash
# Verify on Basescan
npm run verify
```

## Step 6: Backend Integration

Update your backend with the deployed contract address:

```javascript
// In your backend config
const STEAK_NSTAKE_CONTRACT = "0x..."; // Deployed contract address
const STEAK_TOKEN_CONTRACT = "0x...";  // Your Clanker token address
```

## Configuration Parameters

- **Minimum Stake**: 1 STEAK (adjustable by owner)
- **Backend Wallet**: Your backend wallet for tip distributions
- **Initial Funding**: Fund contract with STEAK tokens for rewards

## Key Functions for Backend

1. **Monitor Staking Events**:
   ```javascript
   contract.on('Staked', (user, amount, timestamp) => {
     // Update your database with new stake
   });
   ```

2. **Distribute Tips**:
   ```javascript
   await contract.connect(backendWallet).distributeTipReward(recipient, amount);
   ```

3. **Query Staked Amounts**:
   ```javascript
   const stakedAmount = await contract.getStakedAmount(userAddress);
   const stakeTimestamp = await contract.getStakeTimestamp(userAddress);
   ```

## Security Considerations

- Keep your private keys secure
- Use a separate backend wallet for tip distributions
- Monitor contract balance for reward distributions
- Test thoroughly on testnet before mainnet deployment

## Gas Estimates

- **Stake**: ~50-70k gas
- **Unstake**: ~40-60k gas  
- **Tip Distribution**: ~30-50k gas

## Support

- Check deployment logs in `deployments/{network}.json`
- Verify contract on Basescan for transparency
- Monitor events for debugging