'use client';

import { useState, useEffect } from 'react';
import { stakingApi } from '@/lib/api';

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

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        setLoading(true);
        const response = await stakingApi.getLeaderboard();
        
        if (response.data.success) {
          setPlayers(response.data.data.leaderboard);
          setStats(response.data.data.stats);
        }
      } catch (error) {
        console.error('Error fetching leaderboard:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, [filter]);

  const formatAddress = (address: string) => {
    if (address.length <= 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatTimeRemaining = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    if (diff <= 0) return 'Expired';
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return `${days}d ${hours}h`;
  };

  const getDecayBadge = (effectiveStake?: EffectiveStake) => {
    if (!effectiveStake) return '⚖️';
    const { decay } = effectiveStake;
    if (decay.isBoosted) return '🔥';
    if (decay.isDecaying && decay.multiplier <= 0.7) return '💀';
    if (decay.isDecaying && decay.multiplier <= 0.8) return '🔻';
    if (decay.isDecaying) return '📉';
    return '⚖️';
  };

  const getRankBadge = (rank: number, isTopTen: boolean) => {
    if (!isTopTen) return '⚫';
    if (rank === 1) return '👑';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return '🏅';
  };

  const getDaysStaked = (stakeDate: string) => {
    return Math.floor((Date.now() - new Date(stakeDate).getTime()) / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-filter backdrop-blur-lg border-b border-slate-200/50">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-2xl">🥩</div>
              <span className="text-xl font-bold text-orange-600">SteakNStake</span>
            </div>
            <nav className="hidden md:flex items-center gap-6">
              <a href="/" className="text-slate-600 hover:text-orange-600 transition">Game</a>
              <a href="/leaderboard" className="text-orange-600 font-medium">Leaderboard</a>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-orange-400/20 via-rose-400/20 to-violet-400/20">
        <div className="container py-12">
          <div className="text-center">
            <div className="text-4xl md:text-6xl mb-4">🏆</div>
            <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Leaderboard</h1>
            <p className="text-lg text-slate-600">Complete rankings with decay system</p>
          </div>
        </div>
      </section>

      <div className="container py-8">
        <div className="grid lg:grid-cols-4 gap-8">
          
          {/* Main Leaderboard */}
          <div className="lg:col-span-3">
            
            {/* Filters */}
            <div className="card p-6 mb-6">
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => setFilter('all')}
                  className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                >
                  All Players
                </button>
                <button
                  onClick={() => setFilter('top10')}
                  className={`btn ${filter === 'top10' ? 'btn-primary' : 'btn-secondary'}`}
                >
                  Top 10 Only
                </button>
                <button
                  onClick={() => setFilter('active')}
                  className={`btn ${filter === 'active' ? 'btn-primary' : 'btn-secondary'}`}
                >
                  Active Stakes
                </button>
              </div>
            </div>

            {/* Leaderboard */}
            <div className="card overflow-hidden">
              <div className="bg-gradient-to-r from-orange-500 to-rose-500 text-white p-6">
                <h2 className="text-xl md:text-2xl font-bold mb-2">Player Rankings</h2>
                <p className="text-orange-100">{players.length} players • Live updates</p>
              </div>
              
              {loading ? (
                <div className="p-12 text-center">
                  <div className="text-4xl mb-4">🥩</div>
                  <p className="text-slate-600">Loading leaderboard...</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-200">
                  {players.map((player) => {
                    const daysStaked = getDaysStaked(player.stakeDate);
                    
                    return (
                      <div key={player.address} className={`p-4 md:p-6 transition hover:bg-slate-50 ${!player.isTopTen ? 'opacity-60' : ''}`}>
                        <div className="flex items-center justify-between">
                          
                          {/* Rank & Player */}
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <span className="text-2xl">{getRankBadge(player.rank, player.isTopTen)}</span>
                              <span className={`font-bold text-lg ${player.rank <= 3 ? 'text-orange-600' : 'text-slate-600'}`}>
                                #{player.rank}
                              </span>
                            </div>
                            <div>
                              {player.ensName && (
                                <div className="font-semibold text-orange-600 text-sm md:text-base">{player.ensName}</div>
                              )}
                              <div className="font-mono text-xs md:text-sm text-slate-500">
                                {formatAddress(player.address)}
                              </div>
                            </div>
                          </div>

                          {/* Mobile: Simple View */}
                          <div className="block md:hidden text-right">
                            <div className="font-semibold text-emerald-600 text-sm">
                              {player.stakedAmount} STEAK
                            </div>
                            {player.effectiveStake && (
                              <div className="flex items-center gap-1 justify-end">
                                <span className="text-lg">{getDecayBadge(player.effectiveStake)}</span>
                                <span className="text-xs text-sky-600 font-medium">
                                  {player.effectiveStake.effectiveAmount.toLocaleString()}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Desktop: Full Details */}
                          <div className="hidden md:flex items-center gap-8">
                            
                            {/* Staked Amount */}
                            <div className="text-right">
                              <div className="font-semibold text-emerald-600">{player.stakedAmount} STEAK</div>
                              <div className="text-xs text-slate-500">Staked {daysStaked} days ago</div>
                            </div>
                            
                            {/* Effective Stake */}
                            <div className="text-right min-w-[120px]">
                              {player.effectiveStake ? (
                                <div>
                                  <div className="flex items-center gap-1 justify-end mb-1">
                                    <span className="text-lg">{getDecayBadge(player.effectiveStake)}</span>
                                    <span className="font-semibold text-sky-600 text-sm">
                                      {player.effectiveStake.effectiveAmount.toLocaleString()}
                                    </span>
                                  </div>
                                  <div className="text-xs">
                                    <span className={`font-medium ${
                                      player.effectiveStake.decay.isBoosted ? 'text-emerald-600' : 
                                      player.effectiveStake.decay.isDecaying ? 'text-orange-600' : 'text-slate-600'
                                    }`}>
                                      {player.effectiveStake.decay.multiplier}x
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div className="font-semibold text-emerald-600 text-sm">{player.stakedAmount}</div>
                              )}
                            </div>
                            
                            {/* Lock Status */}
                            <div className="text-right min-w-[80px]">
                              <div className={`font-medium text-sm ${new Date(player.lockExpiry) > new Date() ? 'text-sky-600' : 'text-rose-600'}`}>
                                {formatTimeRemaining(player.lockExpiry)}
                              </div>
                              <div className="text-xs text-slate-500">
                                {new Date(player.lockExpiry) > new Date() ? 'Locked' : 'Unlocked'}
                              </div>
                            </div>
                            
                            {/* Total Earned */}
                            <div className="text-right min-w-[80px]">
                              <div className="font-semibold text-violet-600 text-sm">{player.totalEarned}</div>
                              <div className="text-xs text-slate-500">All time</div>
                            </div>
                          </div>
                        </div>
                        
                        {/* Mobile: Additional Details */}
                        <div className="block md:hidden mt-3 pt-3 border-t border-slate-200">
                          <div className="grid grid-cols-2 gap-4 text-xs">
                            <div>
                              <span className="text-slate-500">Lock:</span>
                              <span className={`ml-1 font-medium ${new Date(player.lockExpiry) > new Date() ? 'text-sky-600' : 'text-rose-600'}`}>
                                {formatTimeRemaining(player.lockExpiry)}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-slate-500">Earned:</span>
                              <span className="ml-1 font-medium text-violet-600">{player.totalEarned}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            
            {/* Decay System Info */}
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">⏰ Decay System</h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg">
                  <span className="flex items-center gap-2">
                    <span>🔥</span>
                    <span>Fresh (Week 0)</span>
                  </span>
                  <span className="font-semibold text-emerald-600">1.2x</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <span className="flex items-center gap-2">
                    <span>⚖️</span>
                    <span>Standard (Week 1)</span>
                  </span>
                  <span className="font-semibold">1.0x</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                  <span className="flex items-center gap-2">
                    <span>📉</span>
                    <span>Decay (Week 2+)</span>
                  </span>
                  <span className="font-semibold text-orange-600">0.9x-0.6x</span>
                </div>
                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Stake amounts are multiplied by time-based factors. Re-stake to reset your timer!
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            {stats && (
              <div className="card p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">📊 Quick Stats</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Total Players:</span>
                    <span className="font-semibold">{stats.totalPlayers}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Top 10 Earning:</span>
                    <span className="font-semibold text-emerald-600">{stats.earningPlayers}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Active Stakes:</span>
                    <span className="font-semibold text-sky-600">{stats.activeStakers}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Total Staked:</span>
                    <span className="font-semibold text-violet-600">{stats.totalStaked} STEAK</span>
                  </div>
                </div>
              </div>
            )}

            {/* Join Game */}
            <div className="card p-6 text-center bg-gradient-to-br from-blue-50 to-indigo-50">
              <h3 className="text-lg font-semibold text-slate-900 mb-3">🎮 Join the Game</h3>
              <p className="text-sm text-slate-600 mb-4">
                Start staking STEAK tokens to compete for a spot on the leaderboard.
              </p>
              <a href="/" className="btn btn-primary w-full">
                🥩 Start Staking
              </a>
            </div>

            {/* Prize Distribution */}
            <div className="card p-6 bg-gradient-to-br from-violet-50 to-rose-50">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">🏆 Prize Structure</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">👑 #1:</span>
                  <span className="font-semibold">25%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">🥈 #2:</span>
                  <span className="font-semibold">17%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">🥉 #3:</span>
                  <span className="font-semibold">14%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">🏅 #4-10:</span>
                  <span className="font-semibold">4-12%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-16 bg-slate-900 text-white">
        <div className="container py-12">
          <div className="text-center">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="text-2xl">🥩</div>
              <span className="text-xl font-bold">SteakNStake</span>
            </div>
            <p className="text-slate-400 text-sm mb-6">
              Stake $STEAK tokens, earn rewards, and tip your favorite Farcaster creators.
            </p>
            <div className="flex flex-wrap justify-center gap-6 text-sm text-slate-400">
              <a href="#" className="hover:text-white transition">Whitepaper</a>
              <a href="#" className="hover:text-white transition">Documentation</a>
              <a href="#" className="hover:text-white transition">GitHub</a>
              <a href="#" className="hover:text-white transition">Discord</a>
            </div>
            <div className="mt-8 pt-8 border-t border-slate-800">
              <p className="text-xs text-slate-500">
                © 2024 SteakNStake. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}