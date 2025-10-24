# 🥩 SteakNStake

**Social Staking meets Farcaster Tipping**

SteakNStake is a revolutionary social staking platform where your rewards can only be given away - not claimed! Stake $STEAK tokens, earn rewards over time, and tip your favorite Farcaster creators to build a stronger community.

## ✨ Key Features

- **Stake $STEAK tokens** → Earn passive rewards over time
- **Rewards can't be claimed** → They accumulate as "tip balance" 
- **Tip via Farcaster** → Use accumulated rewards to tip creators
- **Recipients can stake or withdraw** → Growing the ecosystem

## 🏗️ Project Structure

```
steaknstake/
├── backend/          # Node.js API server
├── frontend/         # Next.js web application
└── README.md         # This file
```

## 🚀 Quick Start

### Backend Setup
```bash
cd backend
npm install
npm run dev
```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

## 📱 Core Concept

1. **Stake $STEAK** - Buy and stake tokens to earn rewards
2. **Earn Rewards** - Passive rewards accumulate automatically  
3. **Tip Creators** - Use rewards to tip Farcaster users
4. **Grow Community** - Recipients can stake tips to expand the ecosystem

## 🛠️ Tech Stack

**Backend:**
- Node.js + Express
- PostgreSQL database
- Farcaster integration
- Railway deployment

**Frontend:**
- Next.js 15 + React 19
- TypeScript
- Tailwind CSS
- Modern gradient design

## 🌐 Deployment

- **Backend**: Railway with PostgreSQL
- **Frontend**: Vercel (recommended) or Railway
- **Database**: PostgreSQL with automatic schema setup

## 🎯 Farcaster Integration

SteakNStake integrates with Farcaster to enable:
- Comment-based tipping
- Creator discovery
- Social reward distribution
- Community growth mechanics

## 📄 API Endpoints

### Staking
- `GET /api/staking/position/:address` - Get user staking position
- `POST /api/staking/stake` - Stake tokens
- `GET /api/staking/leaderboard` - Top stakers

### Tipping
- `POST /api/tipping/send` - Send tip to Farcaster user
- `GET /api/tipping/received/:fid` - Get received tips
- `POST /api/tipping/claim` - Claim tips (withdraw or stake)

### Users
- `GET /api/users/profile/:address` - User profile with stats
- `GET /api/users/search` - Search by Farcaster username

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📜 License

MIT License - see LICENSE file for details

---

**Built with ❤️ for the Farcaster community**