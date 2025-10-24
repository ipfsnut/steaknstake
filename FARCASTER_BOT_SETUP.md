# 🤖 @SteakNStake Farcaster Bot Setup

## ✅ What We Have
- **Bot Username**: @steaknstake
- **Neynar UUID**: `1256d313-59b6-40fc-8939-ed5bb0d5ed8a`
- **Neynar API Key**: `67AA399D-B5BA-4EA3-9A4D-315D151D7BBC`
- **Neynar Client ID**: `e3f968a2-44d5-4bf5-b539-ccbb862ebea4`

## 🔍 What We Still Need

### 1. Bot FID (Farcaster ID)
**How to get it:**
```bash
curl -X GET "https://api.neynar.com/v2/farcaster/user/by_username?username=steaknstake" \
  -H "accept: application/json" \
  -H "api_key: 67AA399D-B5BA-4EA3-9A4D-315D151D7BBC"
```
**Expected response**: `{"user": {"fid": 12345, ...}}`

### 2. Bot Wallet Address
**Need to know:**
- What wallet address is associated with the @steaknstake account?
- This will be used for backend wallet operations

### 3. Bot Signing Key/Mnemonic
**For posting casts, we need:**
- The account's private key/mnemonic for signing
- OR setup webhook-based signing through Neynar

### 4. Webhook Configuration (Recommended)
**For real-time tip monitoring:**
- Configure Neynar webhook to notify our backend when:
  - Someone mentions @steaknstake
  - Someone uses $STEAK in a cast
  - Bot gets tagged in replies

## 🔧 Next Implementation Steps

### 1. Create Farcaster Service
```javascript
// backend/src/services/farcaster.js
class FarcasterService {
  constructor() {
    this.neynarApiKey = process.env.NEYNAR_API_KEY;
    this.botFid = process.env.FARCASTER_FID;
    this.botUsername = process.env.FARCASTER_BOT_USERNAME;
  }

  async postCast(text, parentHash = null) {
    // Post cast via Neynar API
  }

  async monitorTips() {
    // Monitor for $STEAK tip mentions
  }

  async respondToMention(cast) {
    // Chipper, friendly responses
  }
}
```

### 2. Add Bot Dependencies
```bash
cd backend
npm install @neynar/nodejs-sdk axios cron node-cron
```

### 3. Database Schema for Tips
```sql
-- Add to database-schema.sql
CREATE TABLE IF NOT EXISTS farcaster_tips (
    id SERIAL PRIMARY KEY,
    cast_hash VARCHAR(64) UNIQUE NOT NULL,
    tipper_fid INTEGER NOT NULL,
    tipper_username VARCHAR(50),
    recipient_fid INTEGER NOT NULL,
    recipient_username VARCHAR(50),
    tip_amount DECIMAL(18, 8) NOT NULL,
    cast_text TEXT,
    cast_timestamp TIMESTAMP NOT NULL,
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP,
    batch_transaction_hash VARCHAR(66),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bot_responses (
    id SERIAL PRIMARY KEY,
    trigger_cast_hash VARCHAR(64) NOT NULL,
    response_cast_hash VARCHAR(64),
    response_type VARCHAR(20) NOT NULL, -- 'tip_confirmation', 'protocol_info', 'friendly_chat'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 4. Bot Personality Responses
```javascript
const responses = {
  greeting: [
    "Hey there! 🥩 Ready to stake some STEAK and spread the love?",
    "Greetings, fellow steak lover! 🔥 What can I help you with today?",
    "Well hello! 🥩✨ Welcome to the juiciest staking protocol around!"
  ],
  tipConfirmation: [
    "Sizzling tip detected! 🔥 That STEAK will be ready for claiming tonight!",
    "What a beautiful tip! 🥩💝 The recipient will be able to claim it this evening!",
    "Tip received and logged! 📝🥩 Batch processing happens at 10 PM daily!"
  ],
  protocolInfo: [
    "SteakNStake is where your rewards become gifts! 🎁 Stake STEAK, earn rewards, tip creators - but you can't claim your own rewards!",
    "Think of it as the most generous staking protocol! 🥩 Your rewards can only be given away as tips to amazing creators!",
    "It's simple: Stake → Earn → Give! 💝 Your staking rewards become tips for the Farcaster community!"
  ]
};
```

## 🎯 Immediate Action Items

1. **Get Bot FID**: Run the API call above to get the numeric FID
2. **Confirm Wallet**: What's the wallet address for @steaknstake?
3. **Signing Method**: Do you have the private key, or should we use Neynar webhooks?
4. **Test Environment**: Set up a test channel to verify bot responses

## 🚀 Bot Features to Implement

### Phase 1: Basic Functionality
- [x] Account setup (@steaknstake created)
- [ ] Get FID and wallet address
- [ ] Post test cast
- [ ] Respond to mentions
- [ ] Monitor for $STEAK tips

### Phase 2: Tip Processing
- [ ] Parse tip amounts from casts
- [ ] Log tips to database
- [ ] Evening batch processing
- [ ] Tip confirmation responses

### Phase 3: Advanced Features
- [ ] Protocol education responses
- [ ] Leaderboard announcements
- [ ] Daily/weekly tip summaries
- [ ] Interactive tip commands

Ready to move forward once we get the FID and confirm the wallet setup! 🥩🚀