'use client';

import { useEffect, useState } from 'react';
import { useReadContract } from 'wagmi';
import { formatEther } from 'viem';
import { useRouter } from 'next/navigation';
import { CONTRACTS, STEAKNSTAKE_ABI } from '@/lib/contracts';
import { stakingApi, farcasterApi, leaderboardApi } from '@/lib/api';

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
  farcasterFid?: number;
  farcasterUsername?: string;
  avatarUrl?: string;
}

interface LeaderboardStats {
  totalPlayers: number;
  activeStakers: number;
  earningPlayers: number;
  totalStaked: string;
}

export default function LeaderboardPage() {
  console.log('🏆 LeaderboardPage component mounted');
  
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [stats, setStats] = useState<LeaderboardStats | null>(null);
  const [loading, setLoading] = useState(true);
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
        
        // Use backend API as primary data source
        console.log('📊 Fetching leaderboard from backend API');
        setUsingSubgraph(false);
        
        try {
          console.log('🔍 Calling leaderboard and stats APIs...');
          const [leaderboardResponse, statsResponse] = await Promise.all([
            leaderboardApi.getLeaderboard(100), // Get top 100 stakers from new endpoint
            stakingApi.getStats()
          ]);
          
          console.log('📡 Leaderboard response:', leaderboardResponse.data);
          console.log('📡 Stats response:', statsResponse.data);
          
          if (leaderboardResponse.data.success && leaderboardResponse.data.data?.leaderboard?.length > 0) {
            console.log('✅ Setting leaderboard players:', leaderboardResponse.data.data.leaderboard.length, 'players');
            
            // Transform backend data to match frontend interface
            const transformedPlayers: Player[] = leaderboardResponse.data.data.leaderboard.map((player: any) => ({
              rank: player.rank,
              address: player.address,
              ensName: player.username || undefined,
              stakedAmount: player.stakedAmount,
              stakedAmountRaw: player.stakedAmountRaw,
              lockExpiry: '', // Backend doesn't provide lock expiry yet
              stakeDate: player.stakingDate,
              totalEarned: player.totalRewards,
              isTopTen: player.rank <= 10,
              farcasterFid: undefined, // Need to get this from backend
              farcasterUsername: player.username
            }));
            
            setPlayers(transformedPlayers);
            
            // Set stats from leaderboard response
            if (leaderboardResponse.data.data?.stats) {
              const statsData = leaderboardResponse.data.data.stats;
              setStats({
                totalPlayers: statsData.totalPlayers,
                activeStakers: statsData.activeStakers,
                earningPlayers: statsData.totalPlayers, // For now, assume all stakers are earning
                totalStaked: statsData.totalStaked
              });
            }
            
            return; // Successfully used backend API
          } else {
            console.log('❌ Leaderboard API returned empty or unsuccessful response');
          }
        } catch (apiError) {
          console.log('❌ Backend API error:', apiError);
        }

        // Fallback to contract data only if backend fails
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
  }, [contractTotalStaked]);

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


  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <button 
              onClick={() => router.push('/')}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <div className="text-2xl">🥩</div>
              <span className="text-xl font-bold text-red-600">SteakNStake</span>
            </button>
            
            <nav className="flex items-center gap-4">
              <button 
                onClick={() => router.push('/')}
                className="font-medium text-gray-600 hover:text-red-600 transition-colors"
              >
                Home
              </button>
              <button 
                className="font-medium text-red-600"
              >
                Leaderboard
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">🏆 Leaderboard</h1>
          <p className="text-gray-600">Top 100 $STEAK stakers ranked by staked amount</p>
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


        {/* Leaderboard */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-gray-500">Loading leaderboard...</p>
            </div>
          ) : players.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rank</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Player</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Staked Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Earned</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {players.map((player) => (
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
                        <div className="flex items-center">
                          {player.avatarUrl ? (
                            <img
                              className="h-10 w-10 rounded-full mr-3 object-cover flex-shrink-0"
                              src={player.avatarUrl}
                              alt={`${player.ensName || player.farcasterUsername || 'User'}'s avatar`}
                              style={{
                                width: '40px',
                                height: '40px',
                                minWidth: '40px',
                                minHeight: '40px',
                                maxWidth: '40px',
                                maxHeight: '40px'
                              }}
                              onError={(e) => {
                                // Hide broken images
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          ) : player.farcasterUsername ? (
                            <div className="h-10 w-10 rounded-full mr-3 bg-purple-100 flex items-center justify-center flex-shrink-0" style={{width: '40px', height: '40px', minWidth: '40px', minHeight: '40px'}}>
                              <span className="text-purple-600 font-bold text-sm">
                                {player.farcasterUsername.charAt(0).toUpperCase()}
                              </span>
                            </div>
                          ) : (
                            <div className="h-10 w-10 rounded-full mr-3 bg-gray-100 flex items-center justify-center flex-shrink-0" style={{width: '40px', height: '40px', minWidth: '40px', minHeight: '40px'}}>
                              <span className="text-gray-600 font-bold text-sm">
                                {player.address.slice(2, 4).toUpperCase()}
                              </span>
                            </div>
                          )}
                          <div>
                            {player.ensName ? (
                              <div className="text-sm font-medium text-gray-900">{player.ensName}</div>
                            ) : player.farcasterUsername ? (
                              <div className="text-sm font-medium text-gray-900">@{player.farcasterUsername}</div>
                            ) : null}
                            <div className="text-sm text-gray-500 font-mono">{formatAddress(player.address)}</div>
                          </div>
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