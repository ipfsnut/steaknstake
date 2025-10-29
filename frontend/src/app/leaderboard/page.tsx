'use client';

import { useEffect, useState } from 'react';
import { useReadContract } from 'wagmi';
import { formatEther } from 'viem';
import { CONTRACTS, STEAKNSTAKE_ABI } from '@/lib/contracts';
import { stakingApi } from '@/lib/api';
import { getLeaderboardData, getPlatformStats, checkSubgraphHealth } from '@/lib/subgraph';

interface EffectiveStake {
  effectiveAmount: number;
  rawAmount: number;
  decay: {
    multiplier: number;
    weekNumber: number;
    label: string;
    daysStaked: number;
    isDecaying: boolean;
    isBoosted: boolean;
  };
  difference: number;
  percentageChange: string;
}

interface Player {
  rank: number;
  address: string;
  ensName?: string;
  stakedAmount: string;
  stakedAmountRaw: number;
  lockExpiry: string;
  stakeDate: string;
  totalEarned: string;
  effectiveStake?: EffectiveStake;
  isTopTen: boolean;
}

interface LeaderboardStats {
  totalPlayers: number;
  activeStakers: number;
  earningPlayers: number;
  totalStaked: string;
}

export default function LeaderboardPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [stats, setStats] = useState<LeaderboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'top10' | 'active'>('all');
  const [usingSubgraph, setUsingSubgraph] = useState(false);

  // Read contract data for real platform stats
  const { data: contractTotalStaked } = useReadContract({
    address: CONTRACTS.STEAKNSTAKE as `0x${string}`,
    abi: STEAKNSTAKE_ABI,
    functionName: 'totalStaked',
  });

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        setLoading(true);
        
        // Skip subgraph for now (not configured)
        const isSubgraphHealthy = false; // await checkSubgraphHealth();
        if (isSubgraphHealthy) {
          console.log('📊 Using subgraph for leaderboard data');
          setUsingSubgraph(true);
          
          const [subgraphLeaderboard, subgraphStats] = await Promise.all([
            getLeaderboardData(10),
            getPlatformStats()
          ]);
          
          if (subgraphLeaderboard.length > 0) {
            // Convert subgraph data to frontend format
            const convertedPlayers = subgraphLeaderboard.map((entry, index) => ({
              rank: index + 1,
              address: entry.user.id,
              stakedAmount: parseFloat(formatEther(BigInt(entry.user.stakedAmount))).toLocaleString(),
              stakedAmountRaw: parseFloat(formatEther(BigInt(entry.user.stakedAmount))),
              lockExpiry: '',
              stakeDate: new Date(parseInt(entry.user.firstStakeTimestamp) * 1000).toISOString(),
              totalEarned: parseFloat(formatEther(BigInt(entry.user.tipsReceived))).toLocaleString(),
              isTopTen: index < 10
            }));
            
            setPlayers(convertedPlayers);
            
            if (subgraphStats) {
              setStats({
                totalPlayers: subgraphStats.totalUsers,
                activeStakers: subgraphStats.totalUsers,
                earningPlayers: subgraphStats.totalUsers,
                totalStaked: parseFloat(formatEther(BigInt(subgraphStats.totalStaked))).toLocaleString()
              });
            }
            
            return; // Successfully used subgraph
          }
        }
        
        // Fallback to backend API first, then contract
        console.log('📊 Falling back to backend data');
        setUsingSubgraph(false);
        
        // Try backend API first
        try {
          const response = await stakingApi.getLeaderboard();
          if (response.data.success && response.data.data.leaderboard.length > 0) {
            setPlayers(response.data.data.leaderboard);
            setStats(response.data.data.stats);
            return; // Successfully used backend API
          }
        } catch (apiError) {
          console.log('Backend API not available, showing contract stats only');
        }

        // Final fallback to contract data only if backend fails
        if (contractTotalStaked) {
          const totalStaked = formatEther(contractTotalStaked);
          setStats({
            totalPlayers: 1,
            activeStakers: 1,
            earningPlayers: 1,
            totalStaked: parseFloat(totalStaked).toLocaleString()
          });
        }
        
      } catch (error) {
        console.error('Error fetching leaderboard:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, [filter, contractTotalStaked]);

  const formatAddress = (address: string) => {
    if (address.length <= 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatTimeRemaining = (dateString: string) => {
    if (!dateString) return 'No lock';
    
    const expiry = new Date(dateString);
    const now = new Date();
    const diffMs = expiry.getTime() - now.getTime();
    
    if (diffMs <= 0) return 'Unlocked';
    
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h`;
  };

  const filteredPlayers = players.filter(player => {
    switch(filter) {
      case 'top10': return player.isTopTen;
      case 'active': return player.stakedAmountRaw > 0;
      default: return true;
    }
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">🏆 Leaderboard</h1>
          <p className="text-gray-600">Top stakers and their performance</p>
          {usingSubgraph && (
            <div className="mt-2 inline-flex items-center px-3 py-1 rounded-full text-xs bg-green-100 text-green-800">
              📊 Real-time data via subgraph
            </div>
          )}
        </div>

        {/* Stats */}
        {stats && (
          <div className="bg-white rounded-xl p-6 shadow-lg mb-8">
            <h2 className="text-xl font-bold mb-4">Platform Statistics</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{stats.totalPlayers}</div>
                <div className="text-sm text-gray-500">Total Players</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{stats.activeStakers}</div>
                <div className="text-sm text-gray-500">Active Stakers</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{stats.earningPlayers}</div>
                <div className="text-sm text-gray-500">Earning Players</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">{stats.totalStaked}</div>
                <div className="text-sm text-gray-500">Total Staked</div>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex justify-center mb-6">
          <div className="bg-white rounded-lg p-1 shadow-md">
            {(['all', 'top10', 'active'] as const).map((filterOption) => (
              <button
                key={filterOption}
                onClick={() => setFilter(filterOption)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  filter === filterOption
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-600 hover:text-blue-500'
                }`}
              >
                {filterOption === 'all' ? 'All Players' : 
                 filterOption === 'top10' ? 'Top 10' : 'Active Stakers'}
              </button>
            ))}
          </div>
        </div>

        {/* Leaderboard */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-gray-500">Loading leaderboard...</p>
            </div>
          ) : filteredPlayers.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rank</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Player</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Staked Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Earned</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lock Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredPlayers.map((player) => (
                    <tr key={player.address} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <span className="text-2xl mr-2">
                            {player.rank === 1 ? '👑' : player.rank === 2 ? '🥈' : player.rank === 3 ? '🥉' : '🏅'}
                          </span>
                          <span className="text-sm font-medium text-gray-900">#{player.rank}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          {player.ensName ? (
                            <div className="text-sm font-medium text-gray-900">{player.ensName}</div>
                          ) : null}
                          <div className="text-sm text-gray-500 font-mono">{formatAddress(player.address)}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{player.stakedAmount} $STEAK</div>
                        {player.effectiveStake && (
                          <div className="text-xs text-gray-500">
                            Effective: {player.effectiveStake.effectiveAmount.toLocaleString()} 
                            ({player.effectiveStake.percentageChange})
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-green-600">{player.totalEarned} $STEAK</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          formatTimeRemaining(player.lockExpiry) === 'Unlocked' || formatTimeRemaining(player.lockExpiry) === 'No lock'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {formatTimeRemaining(player.lockExpiry)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center">
              <div className="text-4xl mb-4">🥩</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No players yet</h3>
              <p className="text-gray-500">Be the first to stake and claim your spot on the leaderboard!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}