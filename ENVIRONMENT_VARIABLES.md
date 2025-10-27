# SteakNStake Environment Variables Guide

## Current State

### 📁 Backend (`/backend/.env`)
**Existing:**
```env
PORT=3005
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
DATABASE_URL=postgresql://username:password@localhost:5432/steaknslip
RPC_URL=https://mainnet.base.org
PRIVATE_KEY=your_private_key_here
CONTRACT_ADDRESS=your_contract_address_here
ETHERSCAN_API_KEY=your_etherscan_api_key
COINGECKO_API_KEY=your_coingecko_api_key
JWT_SECRET=your_jwt_secret_here
CORS_ORIGIN=http://localhost:3000
LOG_LEVEL=info
```

### 📁 Contracts (`/contracts/.env`)
**Existing:**
```env
PRIVATE_KEY=your_private_key_here
BASESCAN_API_KEY=your_basescan_api_key_here
STEAK_TOKEN_ADDRESS=0x...
BACKEND_WALLET_ADDRESS=0x...
FUND_CONTRACT=false
REWARD_FUND_AMOUNT=10000
REPORT_GAS=false
BASE_RPC_URL=https://mainnet.base.org
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
```

### 📁 Frontend (`/frontend/.env`)
**Missing - Needs Creation:**
```env
NEXT_PUBLIC_API_URL=https://happy-determination-production.up.railway.app
NEXT_PUBLIC_CHAIN_ID=8453
NEXT_PUBLIC_STEAK_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_STEAKNSTAKE_CONTRACT_ADDRESS=0x...
```

## Required Additions for Farcaster Bot

### 📁 Backend (Additional Variables Needed)
```env
# Farcaster Bot Configuration
FARCASTER_MNEMONIC=your_farcaster_bot_mnemonic
FARCASTER_FID=your_bot_fid_number
FARCASTER_BOT_USERNAME=steaknstake
FARCASTER_API_KEY=your_farcaster_api_key
WARPCAST_API_TOKEN=your_warpcast_token

# Farcaster Hub Configuration  
FARCASTER_HUB_URL=https://hub.farcaster.standardcrypto.vc:2281
FARCASTER_HUB_API_KEY=optional_hub_api_key

# Bot Behavior Settings
BOT_PERSONALITY_MODE=chipper
BOT_RESPONSE_DELAY_MS=2000
BOT_DAILY_TIP_LIMIT=1000
BOT_AUTO_RESPONSES=true

# Tip Processing Configuration
TIP_MONITORING_ENABLED=true
TIP_BATCH_PROCESSING_TIME=22:00
TIP_MINIMUM_AMOUNT=0.1
TIP_MAXIMUM_AMOUNT=1000

# Database Tip Tracking
TIP_PROCESSING_STATUS_TABLE=tip_processing_queue
TIP_CLAIMS_TABLE=tip_claims

# Smart Contract Integration
STEAKNSTAKE_CONTRACT_ADDRESS=0x...
STEAK_TOKEN_ADDRESS=0x...
BACKEND_WALLET_PRIVATE_KEY=your_backend_wallet_private_key

# Redis for Bot State Management (optional)
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=optional_redis_password

# Batch Processing
BATCH_TRANSACTION_GAS_LIMIT=500000
BATCH_MAX_TIPS_PER_TX=50
```

### 📁 Frontend (Additional Variables Needed)
```env
# Wallet Connection
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=your_walletconnect_project_id

# Farcaster Integration
NEXT_PUBLIC_FARCASTER_BOT_FID=your_bot_fid
NEXT_PUBLIC_FARCASTER_BOT_USERNAME=steaknstake

# Analytics & Monitoring
NEXT_PUBLIC_ANALYTICS_ID=your_analytics_id
NEXT_PUBLIC_SENTRY_DSN=your_sentry_dsn

# Feature Flags
NEXT_PUBLIC_ENABLE_TIP_CLAIMS=true
NEXT_PUBLIC_ENABLE_FARCASTER_INTEGRATION=true
NEXT_PUBLIC_ENABLE_LEADERBOARDS=true
```

## Production Environment Setup

### 🚂 Railway (Backend Deployment)
```env
# Production Database
DATABASE_URL=postgresql://postgres:password@host:5432/steaknstake

# Production URLs
FRONTEND_URL=https://steak.epicdylan.com
CORS_ORIGIN=https://steak.epicdylan.com

# Security (generate new secrets)
JWT_SECRET=production_jwt_secret_256_bit
NODE_ENV=production
LOG_LEVEL=warn

# All Farcaster bot variables from above
```

### ☁️ Cloudflare Pages (Frontend Deployment)
```env
# Production API
NEXT_PUBLIC_API_URL=https://happy-determination-production.up.railway.app

# Production contracts (after deployment)
NEXT_PUBLIC_STEAK_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_STEAKNSTAKE_CONTRACT_ADDRESS=0x...

# Production chain
NEXT_PUBLIC_CHAIN_ID=8453
```

## Security Best Practices

### 🔒 Sensitive Variables (Never Commit)
- `PRIVATE_KEY`
- `FARCASTER_MNEMONIC`
- `JWT_SECRET`
- `DATABASE_URL` (production)
- `BACKEND_WALLET_PRIVATE_KEY`
- `FARCASTER_API_KEY`
- `WARPCAST_API_TOKEN`

### 🌍 Public Variables (Safe to Expose)
- `NEXT_PUBLIC_*` variables (frontend only)
- `PORT`
- `NODE_ENV`
- `LOG_LEVEL`
- Contract addresses (after deployment)
- Chain IDs
- Public API URLs

## Implementation Priority

1. **Immediate**: Create frontend `.env.local`
2. **Before Bot**: Add Farcaster variables to backend
3. **Deployment**: Update production environment variables
4. **Post-Deployment**: Configure contract addresses everywhere

## Environment File Creation Commands

```bash
# Frontend
cp /dev/null frontend/.env.local
# Add NEXT_PUBLIC_API_URL=http://localhost:3005

# Backend (update existing)
# Add Farcaster bot variables to backend/.env

# Production
# Configure Railway and Cloudflare environment variables
```