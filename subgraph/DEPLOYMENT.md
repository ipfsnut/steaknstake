# SteakNStake Subgraph Deployment

## Prerequisites

1. Install Graph CLI globally:
```bash
npm install -g @graphprotocol/graph-cli
```

2. Get your deploy key from [The Graph Studio](https://thegraph.com/studio/)

## Deploy to The Graph Studio

1. Create a new subgraph in The Graph Studio:
   - Go to https://thegraph.com/studio/
   - Click "Create a Subgraph"
   - Name: `steaknstake`
   - Blockchain: Base

2. Get your deploy key from the dashboard

3. Authenticate with your deploy key:
```bash
graph auth --studio YOUR_DEPLOY_KEY_HERE
```

4. Deploy the subgraph:
```bash
cd subgraph
npm run deploy
```

## Local Development

For local testing with Graph Node:

1. Start a local Graph Node (requires Docker):
```bash
git clone https://github.com/graphprotocol/graph-node
cd graph-node/docker
./setup.sh
docker-compose up
```

2. Create and deploy locally:
```bash
npm run create-local
npm run deploy-local
```

## Subgraph URL

After deployment, your subgraph will be available at:
`https://api.studio.thegraph.com/query/YOUR_SUBGRAPH_ID/steaknstake/v1.0.0`

Update this URL in your frontend environment variables:
```bash
# frontend/.env.local
NEXT_PUBLIC_SUBGRAPH_URL=https://api.studio.thegraph.com/query/YOUR_SUBGRAPH_ID/steaknstake/v1.0.0
```

## Verification

After deployment, you can query the subgraph:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"query": "{ globalStats(id: \"global\") { totalStaked totalUsers } }"}' \
  https://api.studio.thegraph.com/query/YOUR_SUBGRAPH_ID/steaknstake/v1.0.0
```

## Integration with Frontend

Once deployed, update the frontend to use the subgraph:

1. Add the subgraph URL to `.env.local`
2. Import and use the subgraph client:

```typescript
import { getLeaderboardData, getPlatformStats } from '@/lib/subgraph'

// Get leaderboard
const leaderboard = await getLeaderboardData(10)

// Get platform stats  
const stats = await getPlatformStats()
```

## Monitoring

- Monitor subgraph health in The Graph Studio dashboard
- Check for sync errors and indexing issues
- The subgraph will automatically index new events from the contract