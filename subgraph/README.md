# SteakNStake Subgraph

This subgraph indexes events from the SteakNStake contract on Base mainnet to provide efficient querying for leaderboards and user data.

## Setup

1. Install dependencies:
```bash
cd subgraph
npm install
```

2. Install Graph CLI globally:
```bash
npm install -g @graphprotocol/graph-cli
```

3. Authenticate with The Graph Studio:
```bash
graph auth --studio YOUR_DEPLOY_KEY
```

## Development

1. Generate code from schema:
```bash
npm run codegen
```

2. Build the subgraph:
```bash
npm run build
```

3. Deploy to The Graph Studio:
```bash
npm run deploy
```

## Entities

### User
- Tracks individual user staking and tip data
- Fields: stakedAmount, totalStaked, tipsReceived, tipsClaimed, etc.

### StakeEvent
- Records all stake/unstake events
- Includes timestamp, amounts, and transaction details

### TipAllocation
- Records when tips are allocated to users
- Tracks the source and amount of tips

### ClaimEvent
- Records when users claim their tips
- Links to the user and amount claimed

### LeaderboardEntry
- Calculated rankings based on staked amounts and tips
- Updated automatically when user data changes

### GlobalStats
- Platform-wide statistics
- Total staked, total users, tip volumes

## Queries

### Top Stakers
```graphql
{
  leaderboardEntries(
    first: 10
    orderBy: score
    orderDirection: desc
  ) {
    user {
      id
      stakedAmount
      tipsReceived
    }
    rank
    score
  }
}
```

### User Profile
```graphql
{
  user(id: "0x...") {
    stakedAmount
    totalStaked
    tipsReceived
    tipsClaimed
    tipsAvailable
    stakeEvents(first: 10, orderBy: timestamp, orderDirection: desc) {
      amount
      type
      timestamp
    }
  }
}
```

### Platform Stats
```graphql
{
  globalStats(id: "global") {
    totalStaked
    totalUsers
    totalTipsAllocated
    totalTipsClaimed
  }
}
```

## Contract Events

The subgraph listens to these events:
- `Staked(address user, uint256 amount, uint256 timestamp)`
- `Unstaked(address user, uint256 amount, uint256 timestamp)`
- `TipsAllocated(address user, uint256 amount)`
- `TipsClaimed(address user, uint256 amount)`

## Deployment

Contract: `0x9900fbFfc6bbb6c082aC0488040fB88dd00c1622`
Network: Base Mainnet
Start Block: 37357000

## Integration

Once deployed, you can query the subgraph from your frontend:

```typescript
const SUBGRAPH_URL = 'https://api.studio.thegraph.com/query/YOUR_SUBGRAPH_ID/steaknstake/v1.0.0'

const query = `
  query GetLeaderboard {
    leaderboardEntries(first: 10, orderBy: score, orderDirection: desc) {
      user {
        id
        stakedAmount
        tipsReceived
      }
      rank
      score
    }
  }
`

const response = await fetch(SUBGRAPH_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query })
})
```