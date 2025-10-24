# SteakNSlip Backend

The backend API for SteakNSlip - a competitive staking game with time-based decay mechanics.

## Features

- **Time-Based Decay System**: Stakes automatically decay over time to encourage active gameplay
- **Leaderboard Management**: Track top 10 players with real-time rankings
- **Treasury Management**: Handle daily distributions and funding sources
- **Staking Operations**: Handle stake/unstake operations with lock periods
- **Comprehensive APIs**: Full REST API for all game functionality

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Setup**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start Development Server**
   ```bash
   npm run dev
   ```

4. **Start Production Server**
   ```bash
   npm start
   ```

## API Endpoints

### Game Overview
- `GET /api/game/overview` - Complete game overview with stats and top players
- `GET /api/game/stats` - Current game statistics
- `GET /api/game/events` - Recent game events
- `GET /api/game/competition` - Competition status and rules
- `GET /api/game/prizes` - Prize distribution information

### Leaderboard
- `GET /api/leaderboard` - Full leaderboard with decay calculations
- `GET /api/leaderboard/top/:count` - Top N players
- `GET /api/leaderboard/player/:address` - Specific player position
- `GET /api/leaderboard/history` - Distribution history
- `GET /api/leaderboard/decay-info` - Decay system information

### Staking
- `GET /api/staking/user/:address` - User's staking position and stats
- `POST /api/staking/stake` - Stake tokens
- `POST /api/staking/unstake` - Unstake tokens
- `GET /api/staking/rewards/:address` - User's reward history
- `GET /api/staking/requirements` - Staking requirements and rules

### Treasury
- `GET /api/treasury` - Current treasury status
- `GET /api/treasury/balance` - Current balance
- `GET /api/treasury/distribution/next` - Next distribution info
- `GET /api/treasury/history` - Distribution history
- `GET /api/treasury/funding` - Funding sources breakdown
- `GET /api/treasury/projections` - Treasury projections
- `GET /api/treasury/analytics` - Detailed analytics

### Health Check
- `GET /api/health` - Service health status

## Decay System

The time-based decay system is the core mechanic that prevents "set and forget" strategies:

- **Week 0 (Days 0-6)**: 1.2x Fresh Stake Boost
- **Week 1 (Days 7-13)**: 1.0x Standard Rate
- **Week 2 (Days 14-20)**: 0.9x Early Decay
- **Week 3 (Days 21-27)**: 0.8x Moderate Decay
- **Week 4 (Days 28-34)**: 0.7x Heavy Decay
- **Week 5+ (Days 35+)**: 0.6x Maximum Decay

## Game Rules

- **Minimum Stake**: 1,000 STEAK tokens
- **Lock Period**: 7 days
- **Early Unstake Penalty**: 5%
- **Top Earners**: Top 10 players only
- **Daily Distribution**: 33.33% of treasury
- **Distribution Time**: UTC Midnight

## Prize Distribution

| Rank | Percentage | Description |
|------|------------|-------------|
| 1 | 25% | Champion |
| 2 | 17% | Runner-up |
| 3 | 14% | Third Place |
| 4-10 | 4-12% each | Top Performers |

## Development

### Project Structure
```
src/
├── index.js          # Main server file
├── routes/           # API route handlers
│   ├── game.js       # Game overview and stats
│   ├── leaderboard.js # Leaderboard management
│   ├── staking.js    # Staking operations
│   └── treasury.js   # Treasury management
└── utils/
    └── decay-calculator.js # Time-based decay logic
```

### Scripts
- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm test` - Run tests

### Environment Variables
See `.env.example` for all available configuration options.

## Mock Data

Currently uses mock data for development and testing. In production, this will be replaced with:
- Database connections for persistent storage
- Blockchain integration for real staking operations
- Real treasury wallet management
- Actual reward distributions

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.