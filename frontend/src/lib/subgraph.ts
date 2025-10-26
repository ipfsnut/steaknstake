// Subgraph client for querying indexed contract data

const SUBGRAPH_URL = process.env.NEXT_PUBLIC_SUBGRAPH_URL || 'https://api.studio.thegraph.com/query/YOUR_SUBGRAPH_ID/steaknstake/v1.0.0'

export interface SubgraphUser {
  id: string
  stakedAmount: string
  totalStaked: string
  tipsReceived: string
  tipsClaimed: string
  tipsAvailable: string
  firstStakeTimestamp: string
  lastStakeTimestamp: string
}

export interface LeaderboardEntry {
  user: SubgraphUser
  rank: number
  score: string
}

export interface GlobalStats {
  totalStaked: string
  totalUsers: number
  totalTipsAllocated: string
  totalTipsClaimed: string
}

export interface StakeEvent {
  id: string
  amount: string
  type: 'STAKE' | 'UNSTAKE'
  timestamp: string
  transactionHash: string
  newTotal: string
}

class SubgraphClient {
  private async query(query: string, variables?: Record<string, any>) {
    try {
      const response = await fetch(SUBGRAPH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables: variables || {},
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      
      if (result.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`)
      }

      return result.data
    } catch (error) {
      console.error('Subgraph query error:', error)
      throw error
    }
  }

  async getLeaderboard(limit: number = 10): Promise<LeaderboardEntry[]> {
    const query = `
      query GetLeaderboard($limit: Int!) {
        leaderboardEntries(
          first: $limit
          orderBy: score
          orderDirection: desc
          where: { stakedAmount_gt: "0" }
        ) {
          user {
            id
            stakedAmount
            totalStaked
            tipsReceived
            tipsClaimed
            tipsAvailable
            firstStakeTimestamp
            lastStakeTimestamp
          }
          rank
          score
        }
      }
    `

    const data = await this.query(query, { limit })
    return data.leaderboardEntries || []
  }

  async getUser(address: string): Promise<SubgraphUser | null> {
    const query = `
      query GetUser($address: String!) {
        user(id: $address) {
          id
          stakedAmount
          totalStaked
          tipsReceived
          tipsClaimed
          tipsAvailable
          firstStakeTimestamp
          lastStakeTimestamp
        }
      }
    `

    const data = await this.query(query, { address: address.toLowerCase() })
    return data.user
  }

  async getUserStakeHistory(address: string, limit: number = 10): Promise<StakeEvent[]> {
    const query = `
      query GetUserStakeHistory($address: String!, $limit: Int!) {
        stakeEvents(
          where: { user: $address }
          first: $limit
          orderBy: timestamp
          orderDirection: desc
        ) {
          id
          amount
          type
          timestamp
          transactionHash
          newTotal
        }
      }
    `

    const data = await this.query(query, { address: address.toLowerCase(), limit })
    return data.stakeEvents || []
  }

  async getGlobalStats(): Promise<GlobalStats | null> {
    const query = `
      query GetGlobalStats {
        globalStats(id: "global") {
          totalStaked
          totalUsers
          totalTipsAllocated
          totalTipsClaimed
        }
      }
    `

    const data = await this.query(query)
    return data.globalStats
  }

  async getTopStakersByAmount(limit: number = 10): Promise<SubgraphUser[]> {
    const query = `
      query GetTopStakers($limit: Int!) {
        users(
          first: $limit
          orderBy: stakedAmount
          orderDirection: desc
          where: { stakedAmount_gt: "0" }
        ) {
          id
          stakedAmount
          totalStaked
          tipsReceived
          tipsClaimed
          tipsAvailable
          firstStakeTimestamp
          lastStakeTimestamp
        }
      }
    `

    const data = await this.query(query, { limit })
    return data.users || []
  }

  async getTotalStakers(): Promise<number> {
    const query = `
      query GetTotalStakers {
        users(where: { stakedAmount_gt: "0" }) {
          id
        }
      }
    `

    const data = await this.query(query)
    return data.users?.length || 0
  }

  async isSubgraphHealthy(): Promise<boolean> {
    try {
      await this.getGlobalStats()
      return true
    } catch {
      return false
    }
  }
}

export const subgraphClient = new SubgraphClient()

// Helper functions for common queries
export const getLeaderboardData = (limit?: number) => subgraphClient.getLeaderboard(limit)
export const getUserProfile = (address: string) => subgraphClient.getUser(address)
export const getPlatformStats = () => subgraphClient.getGlobalStats()
export const getStakeHistory = (address: string, limit?: number) => 
  subgraphClient.getUserStakeHistory(address, limit)
export const checkSubgraphHealth = () => subgraphClient.isSubgraphHealthy()