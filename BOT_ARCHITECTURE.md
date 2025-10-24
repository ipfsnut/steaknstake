# 🤖 @SteakNStake Bot Architecture

## ✅ Bot Identity
- **Username**: @steaknstake
- **FID**: 1401302
- **Purpose**: Monitor, engage, and process $STEAK tips

## 🏗️ Architecture Design

### Bot Separation Strategy
**CRITICAL SECURITY: The bot has ZERO access to funds or private keys:**

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   @steaknstake  │    │ Automated Batch │    │ SteakNStake App │
│   (AI Bot)      │    │   Processor     │    │   (Frontend)    │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ • Read casts    │───▶│ • Cron job      │    │ • User claims   │
│ • Post replies  │    │ • No AI logic   │    │ • Staking UI    │
│ • Monitor tips  │    │ • Fixed rules   │    │ • Leaderboards  │
│ • Log to DB     │    │ • Contract ops  │    │ • Tip history   │
│ • NO MONEY      │    │ • Wallet access │    │ • NO BOT ACCESS │
└─────────────────┘    └─────────────────┘    └─────────────────┘
        │                        │                        │
        └────────────────────────┼────────────────────────┘
                                 │
                    ┌─────────────────┐
                    │  Database       │
                    │ • Tips queue    │
                    │ • Processing log│
                    │ • Security flags│
                    └─────────────────┘
```

### Wallet Roles
1. **Bot Account Wallet**: Only for Farcaster identity (not used for STEAK)
2. **Backend Wallet**: Handles all STEAK transactions and tip distributions
3. **User Wallets**: Stake STEAK and receive tips

## 🔄 Tip Processing Flow

### 1. Tip Detection
```javascript
// Bot monitors for patterns like:
"Great post! 50 $STEAK @username"
"Love this! Here's 10 $STEAK"
"Amazing work, sending 25 $STEAK your way!"
```

### 2. Database Logging
```sql
INSERT INTO farcaster_tips (
    cast_hash,
    tipper_fid,
    recipient_fid, 
    tip_amount,
    cast_text,
    processed = false
);
```

### 3. Bot Response (Immediate)
```javascript
// Chipper confirmation
"Sizzling tip detected! 🥩🔥 Your 50 $STEAK tip is logged and will be ready for claiming tonight at 10 PM! The recipient can claim it via https://steak.epicdylan.com 💝"
```

### 4. Evening Batch Processing (ISOLATED FROM BOT)
```javascript
// SEPARATE PROCESS - No AI involvement
// At 22:00 daily, automated system:
// 1. Query validated tips (fixed SQL)
// 2. Apply hard-coded business rules
// 3. Execute pre-defined contract calls
// 4. Mark as processed with timestamp
// 5. BOT CANNOT INFLUENCE THIS PROCESS
```

## 🎭 Bot Personality Framework

### Response Categories
```javascript
const BotPersonality = {
  greetings: {
    tone: "chipper, enthusiastic",
    emojis: ["🥩", "🔥", "✨", "💝"],
    examples: [
      "Hey there, steak lover! 🥩 What's cooking?",
      "Well hello! Ready for some sizzling good times? 🔥"
    ]
  },
  
  tipConfirmations: {
    tone: "excited, reassuring",
    format: "Confirmation + Timeline + Action",
    examples: [
      "Tip locked and loaded! 🥩💫 It'll be claimable tonight at 10 PM!",
      "Beautiful tip detected! 🔥 Batch processing happens this evening!"
    ]
  },
  
  protocolEducation: {
    tone: "friendly teacher, enthusiastic",
    focus: "simplify complex concepts",
    examples: [
      "SteakNStake is beautifully simple: your rewards can only be given away! 💝",
      "Think of it as the most generous protocol ever - you earn to give! 🥩✨"
    ]
  }
};
```

## 📊 Bot Capabilities

### ✅ Monitoring (Read-Only)
- Monitor all casts for $STEAK mentions
- Track tip patterns and amounts
- Identify recipients by @username or FID
- Log conversation context

### ✅ Engagement (Write Access via Neynar)
- Reply to tip casts with confirmations
- Answer protocol questions
- Share daily/weekly tip summaries
- Celebrate big tips and milestones

### ✅ Data Processing
- Parse tip amounts from natural language
- Validate recipient addresses
- Queue tips for batch processing
- Track processing status

## 🔧 Implementation Plan

### Phase 1: Basic Bot (This Week)
```javascript
// Core functionality
class SteakNStakeBot {
  async monitorTips() {
    // Watch for $STEAK mentions
    // Parse tip amounts and recipients
    // Log to database
  }
  
  async respondToTip(cast) {
    // Post chipper confirmation
    // Include claim timeline
  }
  
  async answerQuestions(cast) {
    // Detect protocol questions
    // Respond with helpful info
  }
}
```

### Phase 2: Batch Processing (Next Week)
```javascript
// Evening batch system
class TipProcessor {
  async processDailyTips() {
    // Run at 22:00 daily
    // Group tips by recipient
    // Execute contract calls
    // Send confirmation casts
  }
}
```

### Phase 3: Advanced Features (Later)
- Tip leaderboards
- Weekly summaries
- Interactive commands
- Multi-language support

## 🚀 Ready to Implement!

With FID **1401302** and the Neynar credentials, we can now build:
1. **Real-time tip monitoring**
2. **Database logging system** 
3. **Chipper bot responses**
4. **Evening batch processing**

The architecture keeps the bot focused on engagement while the backend wallet handles all financial operations securely.