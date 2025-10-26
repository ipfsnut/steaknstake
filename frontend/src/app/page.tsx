'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { stakingApi, tippingApi } from '@/lib/api';
import { useWalletConnection } from '@/hooks/useWalletConnection';
import { useFarcasterMiniApp } from '@/hooks/useFarcasterMiniApp';
import { useStaking } from '@/hooks/useStaking';

interface StakingStats {
  totalStakers: number;
  totalStaked: number;
  totalRewardsEarned: number;
  totalAvailableTips: number;
}

interface TippingStats {
  totalTips: number;
  totalVolume: number;
  uniqueTippers: number;
  uniqueRecipients: number;
  totalUnclaimed: number;
}

interface UserPosition {
  walletAddress: string;
  stakedAmount: number;
  totalRewardsEarned: number;
  availableTipBalance: number;
  stakedAt: string | null;
  farcasterFid: number | null;
  farcasterUsername: string | null;
}

interface TopStaker {
  rank: number;
  walletAddress: string;
  farcasterUsername?: string;
  stakedAmount: number;
  availableTipBalance: number;
  totalRewardsEarned: number;
}

export default function HomePage() {
  const [activeSection, setActiveSection] = useState('home');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [stakingStats, setStakingStats] = useState<StakingStats>({
    totalStakers: 0,
    totalStaked: 0,
    totalRewardsEarned: 0,
    totalAvailableTips: 0
  });
  const [tippingStats, setTippingStats] = useState<TippingStats | null>(null);
  const [topStakers, setTopStakers] = useState<TopStaker[]>([]);
  const [userPosition, setUserPosition] = useState<UserPosition | null>(null);
  const [loading, setLoading] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [showStakeHelp, setShowStakeHelp] = useState(false);
  const [showTipHelp, setShowTipHelp] = useState(false);
  const [showClaimHelp, setShowClaimHelp] = useState(false);
  const [showStatsHelp, setShowStatsHelp] = useState(false);

  // Direct wagmi wallet connection
  const { address, isConnected } = useAccount();

  // Use real wallet connection
  const { 
    walletAddress, 
    farcasterProfile, 
    isFullyConnected,
    connectBoth,
    disconnectAll,
    isFarcasterLoading 
  } = useWalletConnection();

  // Use Farcaster miniapp integration
  const { isReady, isMiniApp, user, openUrl, sdk } = useFarcasterMiniApp();

  // Use staking contract integration
  const {
    currentStep,
    isProcessing,
    error: stakingError,
    userError,
    successMessage,
    allowance,
    balance,
    stakedAmount: contractStakedAmount,
    approveSteak,
    stakeTokens,
    unstakeTokens,
    refetchData,
    clearError,
    clearSuccess
  } = useStaking();

  // $STEAK token contract address
  const STEAK_TOKEN_ADDRESS = '0x1C96D434DEb1fF21Fc5406186Eef1f970fAF3B07';

  const handleSwapForSteak = async () => {
    if (isMiniApp && sdk) {
      try {
        console.log('🔄 Opening Farcaster native swap widget for STEAK...');
        
        // Use Farcaster's native swap widget with STEAK token pre-filled
        const result = await sdk.actions.swapToken({
          buyToken: `eip155:8453/erc20:${STEAK_TOKEN_ADDRESS}`, // Base network STEAK token
          // Let user choose what to sell (don't pre-fill sellToken)
          // sellAmount is optional - let user decide amount
        });
        
        if (result.success) {
          console.log('Swap initiated successfully:', result);
        } else {
          console.error('Swap failed:', result);
        }
      } catch (err) {
        console.error('Failed to open Farcaster swap widget:', err);
        
        // Fallback to external swap if native widget fails
        const swapUrl = `https://app.uniswap.org/#/swap?outputCurrency=${STEAK_TOKEN_ADDRESS}&chain=base`;
        console.log('🌐 Falling back to external swap:', swapUrl);
        if (openUrl) {
          openUrl(swapUrl);
        }
      }
    } else {
      // Fallback for non-miniapp context
      const swapUrl = `https://app.uniswap.org/#/swap?outputCurrency=${STEAK_TOKEN_ADDRESS}&chain=base`;
      console.log('🌐 Opening swap in regular browser:', swapUrl);
      window.open(swapUrl, '_blank');
    }
  };

  // Debug logging for miniapp state
  useEffect(() => {
    console.log('🎯 Page state - isReady:', isReady, 'isMiniApp:', isMiniApp, 'user:', user);
  }, [isReady, isMiniApp, user]);

  const connectWallet = async () => {
    try {
      await connectBoth();
      
      // Fetch user position from backend after connection
      if (walletAddress) {
        const positionResponse = await stakingApi.getPosition(walletAddress);
        if (positionResponse.data.success) {
          setUserPosition(positionResponse.data.data);
        }
      }
    } catch (error) {
      console.error('Error connecting wallet:', error);
    }
  };

  // Fetch data from backend
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch real data from backend APIs
        const [stakingResponse, tippingResponse, leaderboardResponse] = await Promise.all([
          stakingApi.getStats(),
          tippingApi.getStats(),
          stakingApi.getLeaderboard(5)
        ]);

        if (stakingResponse.data.success) {
          setStakingStats(stakingResponse.data.data);
        }
        
        if (tippingResponse.data.success) {
          setTippingStats(tippingResponse.data.data);
        }
        
        if (leaderboardResponse.data.success) {
          setTopStakers(leaderboardResponse.data.data.leaderboard);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        // Keep default zero values on error
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const handleStakeFlow = async (amount: string) => {
    // In regular web context, check for wallet connection
    if (!isMiniApp && !address && !isConnected) {
      alert('Please connect your wallet first');
      return;
    }
    
    // In Farcaster miniapp, just check for user authentication
    if (isMiniApp && !user) {
      alert('Farcaster user not authenticated');
      return;
    }
    
    console.log('🚀 Starting stake flow:', { 
      isMiniApp, 
      user: user?.username, 
      address, 
      isConnected, 
      amount 
    });

    try {
      if (currentStep === 'approve') {
        // Step 1: Approve tokens
        await approveSteak(amount);
      } else if (currentStep === 'stake') {
        // Step 2: Stake tokens
        await stakeTokens(amount);
        
        // Force refresh contract data immediately
        setTimeout(() => {
          refetchData();
        }, 2000);
        
        // Also update backend if needed
        try {
          const stakeResponse = await stakingApi.stake({
            walletAddress: address || walletAddress,
            amount: parseFloat(amount),
            // transactionHash will be available after the transaction
          });
          
          if (stakeResponse.data.success) {
            const positionResponse = await stakingApi.getPosition(address || walletAddress);
            if (positionResponse.data.success) {
              setUserPosition(positionResponse.data.data);
            }
          }
        } catch (backendError) {
          console.warn('Backend update failed, but contract interaction succeeded:', backendError);
        }
      }
    } catch (error) {
      console.error('Staking flow error:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Transaction failed'}`);
    }
  };

  const handleUnstake = async (amount: string) => {
    if (!address && !isConnected) {
      alert('Please connect your wallet first');
      return;
    }

    try {
      // Call contract to unstake
      await unstakeTokens(amount);
      
      // Also update backend if needed
      try {
        const unstakeResponse = await stakingApi.unstake({
          walletAddress,
          amount: parseFloat(amount),
        });

        if (unstakeResponse.data.success) {
          const positionResponse = await stakingApi.getPosition(walletAddress);
          if (positionResponse.data.success) {
            setUserPosition(positionResponse.data.data);
          }
        }
      } catch (backendError) {
        console.warn('Backend update failed, but contract interaction succeeded:', backendError);
      }
    } catch (error) {
      console.error('Error unstaking:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Transaction failed'}`);
    }
  };

  const refreshData = async () => {
    try {
      setLoading(true);
      
      // Refresh all data
      const [stakingResponse, tippingResponse, leaderboardResponse] = await Promise.all([
        stakingApi.getStats(),
        tippingApi.getStats(),
        stakingApi.getLeaderboard(5)
      ]);

      if (stakingResponse.data.success) {
        setStakingStats(stakingResponse.data.data);
      }
      
      if (tippingResponse.data.success) {
        setTippingStats(tippingResponse.data.data);
      }
      
      if (leaderboardResponse.data.success) {
        setTopStakers(leaderboardResponse.data.data.leaderboard);
      }

      // Refresh user position if connected
      if (walletAddress) {
        const positionResponse = await stakingApi.getPosition(walletAddress);
        if (positionResponse.data.success) {
          setUserPosition(positionResponse.data.data);
        }
      }

      // Refresh contract data
      refetchData();
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderContent = () => {
    switch (activeSection) {
      case 'stake':
        return (
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-center gap-2 mb-8">
              <h2 className="text-3xl font-bold">Stake $STEAK</h2>
              <button 
                onClick={() => setShowStakeHelp(!showStakeHelp)}
                className="text-sm bg-gray-100 hover:bg-gray-200 rounded-full w-6 h-6 flex items-center justify-center"
                title="Staking info"
              >
                ?
              </button>
            </div>
            
            {showStakeHelp && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
                <h3 className="font-bold text-green-800 mb-2">About Staking</h3>
                <div className="text-sm text-green-700 space-y-1">
                  <p>• Stake $STEAK tokens to earn daily allowances</p>
                  <p>• Allowances can only be tipped to others, never claimed</p>
                  <p>• You can unstake your original tokens anytime</p>
                  <p>• Longer stakes earn more tipping power</p>
                </div>
              </div>
            )}
            
            {isMiniApp && user ? (
              <>
                <div className="bg-green-50 rounded-xl p-6 border mb-6 text-center">
                  <h3 className="text-xl font-bold mb-4">Welcome @{user.username}!</h3>
                  <p className="text-gray-600 mb-4">You're connected via Farcaster</p>
                  <div className="text-sm text-green-700">
                    <p>🎯 Farcaster ID: {user.fid}</p>
                    <p>💰 Ready to stake and tip!</p>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-6 border mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold">Your Position</h3>
                    <button 
                      onClick={refreshData}
                      className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1 rounded-md"
                      title="Refresh data"
                    >
                      🔄 Refresh
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-green-600">{contractStakedAmount || userPosition?.stakedAmount || '0'}</div>
                      <div className="text-sm text-gray-500">$STEAK Staked (Contract: {contractStakedAmount})</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-purple-600">{userPosition?.availableTipBalance || 0}</div>
                      <div className="text-sm text-gray-500">Available to Tip</div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-6 border mb-6">
                  <h3 className="text-xl font-bold mb-4">Step 1: Buy $STEAK</h3>
                  <p className="text-gray-600 mb-4">Get $STEAK tokens to start earning rewards.</p>
                  <button 
                    onClick={handleSwapForSteak}
                    className="bg-purple-500 hover:bg-purple-600 text-white px-6 py-3 rounded-lg font-medium w-full flex items-center justify-center gap-2"
                  >
                    {isMiniApp ? (
                      <>
                        <span>🔄</span>
                        <span>Swap for $STEAK</span>
                        <span className="text-xs bg-purple-400 px-2 py-1 rounded">Farcaster</span>
                      </>
                    ) : (
                      <>
                        <span>💰</span>
                        <span>Buy $STEAK</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="bg-white rounded-xl p-6 border mb-6">
                  <h3 className="text-xl font-bold mb-4">Step 2: Stake Tokens</h3>
                  <p className="text-gray-600 mb-4">Stake your $STEAK to start earning daily allowances.</p>
                  
                  {userError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-center justify-between">
                      <p className="text-sm text-red-700">
                        ⚠️ {userError}
                      </p>
                      <button 
                        onClick={clearError}
                        className="text-red-500 hover:text-red-700 text-sm"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                  
                  {successMessage && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 flex items-center justify-between">
                      <p className="text-sm text-green-700">
                        ✅ {successMessage}
                      </p>
                      <button 
                        onClick={clearSuccess}
                        className="text-green-500 hover:text-green-700 text-sm"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                  
                  <div className="space-y-4">
                    <div className="relative">
                      <input 
                        type="number" 
                        placeholder="Amount to stake"
                        className="w-full p-3 border rounded-lg pr-16"
                        id="stakeAmountMiniapp"
                      />
                      <button 
                        onClick={() => {
                          const input = document.getElementById('stakeAmountMiniapp') as HTMLInputElement;
                          if (input && balance) {
                            input.value = balance; // Use actual balance
                          }
                        }}
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-1 rounded"
                      >
                        MAX
                      </button>
                    </div>
                    {!address && !isConnected && !isMiniApp ? (
                      <button 
                        onClick={connectWallet}
                        disabled={isFarcasterLoading}
                        className="px-6 py-3 rounded-lg font-medium w-full text-white bg-green-500 hover:bg-green-600 disabled:bg-gray-400"
                      >
                        {isFarcasterLoading ? '⏳ Connecting...' : '🔗 Connect Wallet'}
                      </button>
                    ) : (
                      <button 
                        onClick={() => {
                          const amount = (document.getElementById('stakeAmountMiniapp') as HTMLInputElement)?.value || '0';
                          if (parseFloat(amount) > 0) handleStakeFlow(amount);
                        }}
                        disabled={isProcessing}
                        className={`px-6 py-3 rounded-lg font-medium w-full text-white ${
                          isProcessing 
                            ? 'bg-gray-400 cursor-not-allowed' 
                            : currentStep === 'approve' 
                              ? 'bg-blue-500 hover:bg-blue-600' 
                              : 'bg-red-500 hover:bg-red-600'
                        }`}
                      >
                        {isProcessing ? (
                          '⏳ Processing...'
                        ) : currentStep === 'approve' ? (
                          '✅ Approve $STEAK'
                        ) : currentStep === 'stake' ? (
                          '🥩 Stake $STEAK'
                        ) : (
                          '✨ Stake Complete!'
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {(userPosition?.stakedAmount || 0) > 0 && (
                  <div className="bg-white rounded-xl p-6 border mb-6">
                    <h3 className="text-xl font-bold mb-4">Unstake Tokens</h3>
                    <p className="text-gray-600 mb-4">Withdraw your staked $STEAK tokens (keeps your earned allowances).</p>
                    <div className="space-y-4">
                      <input 
                        type="number" 
                        placeholder="Amount to unstake"
                        max={userPosition?.stakedAmount || 0}
                        className="w-full p-3 border rounded-lg"
                        id="unstakeAmountMiniapp"
                      />
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            const amount = (document.getElementById('unstakeAmountMiniapp') as HTMLInputElement)?.value || '0';
                            if (parseFloat(amount) > 0) handleUnstake(amount);
                          }}
                          disabled={isProcessing}
                          className="bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-medium flex-1"
                        >
                          {isProcessing ? '⏳ Processing...' : 'Unstake $STEAK'}
                        </button>
                        <button 
                          onClick={() => {
                            if ((userPosition?.stakedAmount || 0) > 0) handleUnstake(userPosition!.stakedAmount.toString());
                          }}
                          disabled={isProcessing}
                          className="bg-gray-500 hover:bg-gray-600 disabled:bg-gray-400 text-white px-4 py-3 rounded-lg font-medium"
                        >
                          Unstake All
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : !walletAddress ? (
              <div className="bg-white rounded-xl p-6 border mb-6 text-center">
                <h3 className="text-xl font-bold mb-4">Connect Your Wallet</h3>
                <p className="text-gray-600 mb-4">Connect your Farcaster wallet to start staking.</p>
                <button 
                  onClick={connectWallet}
                  className="bg-purple-500 hover:bg-purple-600 text-white px-6 py-3 rounded-lg font-medium w-full"
                >
                  Connect Farcaster Wallet
                </button>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-xl p-6 border mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold">Your Position</h3>
                    <button 
                      onClick={refreshData}
                      className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1 rounded-md"
                      title="Refresh data"
                    >
                      🔄 Refresh
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-green-600">{contractStakedAmount || userPosition?.stakedAmount || '0'}</div>
                      <div className="text-sm text-gray-500">$STEAK Staked (Contract: {contractStakedAmount})</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-purple-600">{userPosition?.availableTipBalance || 0}</div>
                      <div className="text-sm text-gray-500">Available to Tip</div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-6 border mb-6">
                  <h3 className="text-xl font-bold mb-4">Step 1: Buy $STEAK</h3>
                  <p className="text-gray-600 mb-4">Get $STEAK tokens to start earning rewards.</p>
                  <button 
                    onClick={handleSwapForSteak}
                    className="bg-purple-500 hover:bg-purple-600 text-white px-6 py-3 rounded-lg font-medium w-full flex items-center justify-center gap-2"
                  >
                    {isMiniApp ? (
                      <>
                        <span>🔄</span>
                        <span>Swap for $STEAK</span>
                        <span className="text-xs bg-purple-400 px-2 py-1 rounded">Farcaster</span>
                      </>
                    ) : (
                      <>
                        <span>💰</span>
                        <span>Buy $STEAK</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="bg-white rounded-xl p-6 border mb-6">
                  <h3 className="text-xl font-bold mb-4">Step 2: Stake Tokens</h3>
                  <p className="text-gray-600 mb-4">Stake your $STEAK to start earning daily allowances.</p>
                  
                  {userError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-center justify-between">
                      <p className="text-sm text-red-700">
                        ⚠️ {userError}
                      </p>
                      <button 
                        onClick={clearError}
                        className="text-red-500 hover:text-red-700 text-sm"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                  
                  {successMessage && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 flex items-center justify-between">
                      <p className="text-sm text-green-700">
                        ✅ {successMessage}
                      </p>
                      <button 
                        onClick={clearSuccess}
                        className="text-green-500 hover:text-green-700 text-sm"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                  
                  <div className="space-y-4">
                    <div className="relative">
                      <input 
                        type="number" 
                        placeholder="Amount to stake"
                        className="w-full p-3 border rounded-lg pr-16"
                        id="stakeAmount"
                      />
                      <button 
                        onClick={() => {
                          const input = document.getElementById('stakeAmount') as HTMLInputElement;
                          if (input) input.value = '1000'; // Default max amount, replace with actual balance
                        }}
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-1 rounded"
                      >
                        MAX
                      </button>
                    </div>
                    <button 
                      onClick={() => {
                        const amount = (document.getElementById('stakeAmount') as HTMLInputElement)?.value || '0';
                        if (parseFloat(amount) > 0) handleStakeFlow(amount);
                      }}
                      disabled={isProcessing}
                      className={`px-6 py-3 rounded-lg font-medium w-full text-white ${
                        isProcessing 
                          ? 'bg-gray-400 cursor-not-allowed' 
                          : currentStep === 'approve' 
                            ? 'bg-blue-500 hover:bg-blue-600' 
                            : 'bg-red-500 hover:bg-red-600'
                      }`}
                    >
                      {isProcessing ? (
                        '⏳ Processing...'
                      ) : currentStep === 'approve' ? (
                        '✅ Approve $STEAK'
                      ) : currentStep === 'stake' ? (
                        '🥩 Stake $STEAK'
                      ) : (
                        '✨ Stake Complete!'
                      )}
                    </button>
                  </div>
                </div>

                {(userPosition?.stakedAmount || 0) > 0 && (
                  <div className="bg-white rounded-xl p-6 border mb-6">
                    <h3 className="text-xl font-bold mb-4">Unstake Tokens</h3>
                    <p className="text-gray-600 mb-4">Withdraw your staked $STEAK tokens (keeps your earned allowances).</p>
                    <div className="space-y-4">
                      <input 
                        type="number" 
                        placeholder="Amount to unstake"
                        max={userPosition?.stakedAmount || 0}
                        className="w-full p-3 border rounded-lg"
                        id="unstakeAmount"
                      />
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            const amount = (document.getElementById('unstakeAmount') as HTMLInputElement)?.value || '0';
                            if (parseFloat(amount) > 0) handleUnstake(amount);
                          }}
                          disabled={isProcessing}
                          className="bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-medium flex-1"
                        >
                          {isProcessing ? '⏳ Processing...' : 'Unstake $STEAK'}
                        </button>
                        <button 
                          onClick={() => {
                            if ((userPosition?.stakedAmount || 0) > 0) handleUnstake(userPosition!.stakedAmount.toString());
                          }}
                          disabled={isProcessing}
                          className="bg-gray-500 hover:bg-gray-600 disabled:bg-gray-400 text-white px-4 py-3 rounded-lg font-medium"
                        >
                          Unstake All
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
              <p className="text-sm text-orange-800">
                <strong>Note:</strong> Staked tokens earn daily allowances that can only be tipped away, not claimed directly.
              </p>
            </div>
          </div>
        );

      case 'tip':
        return (
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-center gap-2 mb-8">
              <h2 className="text-3xl font-bold">How to Tip</h2>
              <button 
                onClick={() => setShowTipHelp(!showTipHelp)}
                className="text-sm bg-gray-100 hover:bg-gray-200 rounded-full w-6 h-6 flex items-center justify-center"
                title="Tipping info"
              >
                ?
              </button>
            </div>
            
            {showTipHelp && (
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-6">
                <h3 className="font-bold text-purple-800 mb-2">About Tipping</h3>
                <div className="text-sm text-purple-700 space-y-1">
                  <p>• Reply to any Farcaster cast with "25 $STEAK"</p>
                  <p>• Bot @steaknstake processes tips in evening batches</p>
                  <p>• You can only tip up to your allowance balance</p>
                  <p>• Tips are deducted immediately when detected</p>
                </div>
              </div>
            )}
            
            <div className="bg-white rounded-xl p-6 border mb-6">
              <h3 className="text-xl font-bold mb-4">🔥 Current Allowance</h3>
              <div className="text-center">
                <div className="text-4xl font-bold text-green-600 mb-2">
                  {userPosition?.availableTipBalance?.toFixed(2) || '0.00'}
                </div>
                <div className="text-gray-500">$STEAK available to tip</div>
                {!walletAddress && !isMiniApp && (
                  <button 
                    onClick={connectWallet}
                    className="mt-4 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm"
                  >
                    Connect Wallet to See Your Allowance
                  </button>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 border mb-6">
              <h3 className="text-xl font-bold mb-4">How to Tip on Farcaster</h3>
              <div className="space-y-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="font-medium mb-2">Reply to any cast with:</p>
                  <code className="bg-gray-800 text-green-400 px-3 py-2 rounded block">
                    25 $STEAK
                  </code>
                </div>
                <div className="text-sm text-gray-600">
                  <p>• Use any amount up to your allowance</p>
                  <p>• Bot @steaknstake will process the tip</p>
                  <p>• Recipient gets notified to claim</p>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-sm text-blue-800">
                <strong>Tip Format:</strong> Just type the amount followed by "$STEAK" in any Farcaster reply.
              </p>
            </div>
          </div>
        );

      case 'claim':
        return (
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-center gap-2 mb-8">
              <h2 className="text-3xl font-bold">Claim Tips</h2>
              <button 
                onClick={() => setShowClaimHelp(!showClaimHelp)}
                className="text-sm bg-gray-100 hover:bg-gray-200 rounded-full w-6 h-6 flex items-center justify-center"
                title="Claiming info"
              >
                ?
              </button>
            </div>
            
            {showClaimHelp && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6">
                <h3 className="font-bold text-orange-800 mb-2">About Claiming</h3>
                <div className="text-sm text-orange-700 space-y-1">
                  <p>• Claim tips you've received from others</p>
                  <p>• Choose full amount or split 50/50</p>
                  <p>• All claimed tips go to your wallet</p>
                  <p>• You can then stake claimed tokens if desired</p>
                </div>
              </div>
            )}
            
            <div className="bg-white rounded-xl p-6 border mb-6">
              <h3 className="text-xl font-bold mb-4">📨 Pending Tips</h3>
              <div className="text-center py-8">
                <div className="text-4xl mb-4">💝</div>
                <p className="text-gray-500">
                  {walletAddress || (isMiniApp && user) ? 'No pending tips' : 'Connect wallet to see pending tips'}
                </p>
                {!walletAddress && !isMiniApp && (
                  <button 
                    onClick={connectWallet}
                    className="mt-4 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg"
                  >
                    Connect Wallet
                  </button>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 border mb-6">
              <h3 className="text-xl font-bold mb-4">Claim Options</h3>
              <div className="space-y-3">
                <button className="w-full p-3 border-2 border-green-500 text-green-700 rounded-lg font-medium hover:bg-green-50">
                  💰 Claim Full Amount
                </button>
                <button className="w-full p-3 border-2 border-purple-500 text-purple-700 rounded-lg font-medium hover:bg-purple-50">
                  ⚖️ Split 50/50 to Wallet
                </button>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-800">
                    💡 <strong>Want to stake?</strong> Claim to wallet first, then use the Stake tab to stake your tokens.
                  </p>
                </div>
              </div>
            </div>
          </div>
        );

      case 'leaderboard':
        return (
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-8">🏆 Leaderboard</h2>
            
            <div className="bg-white rounded-xl border overflow-hidden">
              {loading ? (
                <div className="p-8 text-center">
                  <div className="text-4xl mb-2">🥩</div>
                  <p className="text-gray-500">Loading leaderboard...</p>
                </div>
              ) : topStakers.length > 0 ? (
                <div className="divide-y">
                  {topStakers.map((player) => (
                    <div key={player.rank} className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="text-2xl">
                          {player.rank === 1 ? '👑' : player.rank === 2 ? '🥈' : player.rank === 3 ? '🥉' : '🏅'}
                        </div>
                        <div>
                          <div className="font-bold">#{player.rank}</div>
                          <div className="text-sm text-gray-500">
                            {player.farcasterUsername ? `@${player.farcasterUsername}` : formatAddress(player.walletAddress)}
                          </div>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4 text-center text-sm">
                        <div>
                          <div className="font-bold text-green-600">{formatNumber(player.stakedAmount)}</div>
                          <div className="text-gray-500">Staked</div>
                        </div>
                        <div>
                          <div className="font-bold text-blue-600">{formatNumber(player.availableTipBalance)}</div>
                          <div className="text-gray-500">Allowance</div>
                        </div>
                        <div>
                          <div className="font-bold text-purple-600">{formatNumber(player.totalRewardsEarned)}</div>
                          <div className="text-gray-500">Total Earned</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center">
                  <div className="text-4xl mb-2">🥩</div>
                  <p className="text-gray-500">No stakers yet. Be the first!</p>
                </div>
              )}
            </div>
          </div>
        );

      default:
        return (
          <div className="text-center">
            <div className="mb-4 flex justify-center">
              <div className="w-16 h-16 bg-red-500 rounded-xl flex items-center justify-center">
                <span className="text-white text-2xl">🥩</span>
              </div>
            </div>
            <div className="flex items-center justify-center gap-2 mb-4">
              <h1 className="text-4xl md:text-6xl font-black text-red-600">
                SteakNStake
              </h1>
              <button 
                onClick={() => setShowHelp(!showHelp)}
                className="text-lg bg-gray-100 hover:bg-gray-200 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
                title="How it works"
              >
                ?
              </button>
            </div>
            
            {showHelp && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 max-w-2xl mx-auto text-left">
                <h3 className="font-bold text-blue-800 mb-2">How SteakNStake Works</h3>
                <div className="text-sm text-blue-700 space-y-2">
                  <p><strong>1. Stake:</strong> Lock up $STEAK tokens to earn daily allowances</p>
                  <p><strong>2. Tip:</strong> Use allowances to tip Farcaster creators by replying "25 $STEAK"</p>
                  <p><strong>3. Claim:</strong> Recipients claim tips to their wallet</p>
                  <p><strong>🎯 Key Rule:</strong> You can only tip your rewards away, never claim them directly!</p>
                </div>
              </div>
            )}
            
            <p className="text-lg text-gray-700 mb-4">
              Stake $STEAK, earn allowances, tip Farcaster creators
            </p>
            
            {/* Real-time Stats */}
            <div className="flex items-center justify-center gap-2 mb-4">
              <h3 className="text-lg font-semibold text-gray-600">Platform Stats</h3>
              <button 
                onClick={() => setShowStatsHelp(!showStatsHelp)}
                className="text-xs bg-gray-100 hover:bg-gray-200 rounded-full w-5 h-5 flex items-center justify-center"
                title="Stats explanation"
              >
                ?
              </button>
            </div>
            
            {showStatsHelp && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4 max-w-2xl mx-auto">
                <div className="text-sm text-gray-700 space-y-1">
                  <p><strong>Stakers:</strong> Users with active stakes</p>
                  <p><strong>$STEAK Staked:</strong> Total tokens locked in staking</p>
                  <p><strong>Rewards Earned:</strong> Total allowances generated</p>
                  <p><strong>Tips Available:</strong> Current claimable tip pool</p>
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto mb-8">
              <div className="bg-white rounded-xl p-4 text-center border">
                <div className="text-2xl mb-1">👥</div>
                <div className="text-xl font-bold text-blue-600">{stakingStats.totalStakers}</div>
                <div className="text-xs text-gray-500">Stakers</div>
              </div>
              
              <div className="bg-white rounded-xl p-4 text-center border">
                <div className="text-2xl mb-1">💰</div>
                <div className="text-xl font-bold text-green-600">{formatNumber(stakingStats.totalStaked)}</div>
                <div className="text-xs text-gray-500">$STEAK Staked</div>
              </div>
              
              <div className="bg-white rounded-xl p-4 text-center border">
                <div className="text-2xl mb-1">🎁</div>
                <div className="text-xl font-bold text-purple-600">{formatNumber(stakingStats.totalRewardsEarned)}</div>
                <div className="text-xs text-gray-500">Rewards Earned</div>
              </div>
              
              <div className="bg-white rounded-xl p-4 text-center border">
                <div className="text-2xl mb-1">💝</div>
                <div className="text-xl font-bold text-pink-600">{formatNumber(stakingStats.totalAvailableTips)}</div>
                <div className="text-xs text-gray-500">Tips Available</div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button 
                onClick={() => setActiveSection('stake')}
                className="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-xl font-bold"
              >
                🥩 Start Staking
              </button>
              <button 
                onClick={() => setActiveSection('tip')}
                className="bg-white hover:bg-gray-50 text-gray-700 border-2 border-gray-300 px-6 py-3 rounded-xl font-bold"
              >
                💝 Learn Tipping
              </button>
            </div>
          </div>
        );
    }
  };

  // Show loading screen until miniapp is ready
  if (!isReady) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-500 rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-2xl">🥩</span>
          </div>
          <p className="text-gray-600">Loading SteakNStake...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <button 
              onClick={() => setActiveSection('home')}
              className="flex items-center gap-2"
            >
              <div className="w-8 h-8 bg-red-500 rounded flex items-center justify-center">
                <span className="text-white text-sm">🥩</span>
              </div>
              <span className="text-xl font-bold text-red-600">SteakNStake</span>
            </button>
            
            <nav className="hidden md:flex items-center gap-6">
              <button 
                onClick={() => setActiveSection('home')}
                className={`font-medium ${activeSection === 'home' ? 'text-red-600' : 'text-gray-600 hover:text-red-600'}`}
              >
                Home
              </button>
              <button 
                onClick={() => setActiveSection('stake')}
                className={`font-medium ${activeSection === 'stake' ? 'text-red-600' : 'text-gray-600 hover:text-red-600'}`}
              >
                Stake
              </button>
              <button 
                onClick={() => setActiveSection('tip')}
                className={`font-medium ${activeSection === 'tip' ? 'text-red-600' : 'text-gray-600 hover:text-red-600'}`}
              >
                Tip
              </button>
              <button 
                onClick={() => setActiveSection('claim')}
                className={`font-medium ${activeSection === 'claim' ? 'text-red-600' : 'text-gray-600 hover:text-red-600'}`}
              >
                Claim
              </button>
              <button 
                onClick={() => setActiveSection('leaderboard')}
                className={`font-medium ${activeSection === 'leaderboard' ? 'text-red-600' : 'text-gray-600 hover:text-red-600'}`}
              >
                Leaderboard
              </button>
              <button 
                onClick={connectWallet}
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-medium"
              >
                {walletAddress ? `${formatAddress(walletAddress)}` : 'Connect Wallet'}
              </button>
            </nav>
            
            <button 
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden bg-red-500 text-white px-3 py-1 rounded text-sm"
            >
              Menu
            </button>
          </div>
          
          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="md:hidden mt-4 pb-4 border-t pt-4">
              <div className="space-y-2">
                <button 
                  onClick={() => { setActiveSection('home'); setMobileMenuOpen(false); }}
                  className="block w-full text-left py-2 text-gray-600"
                >
                  Home
                </button>
                <button 
                  onClick={() => { setActiveSection('stake'); setMobileMenuOpen(false); }}
                  className="block w-full text-left py-2 text-gray-600"
                >
                  Stake
                </button>
                <button 
                  onClick={() => { setActiveSection('tip'); setMobileMenuOpen(false); }}
                  className="block w-full text-left py-2 text-gray-600"
                >
                  Tip
                </button>
                <button 
                  onClick={() => { setActiveSection('claim'); setMobileMenuOpen(false); }}
                  className="block w-full text-left py-2 text-gray-600"
                >
                  Claim
                </button>
                <button 
                  onClick={() => { setActiveSection('leaderboard'); setMobileMenuOpen(false); }}
                  className="block w-full text-left py-2 text-gray-600"
                >
                  Leaderboard
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {renderContent()}
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-white mt-8">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="w-6 h-6 bg-red-500 rounded flex items-center justify-center">
                <span className="text-white text-xs">🥩</span>
              </div>
              <span className="font-bold">SteakNStake</span>
            </div>
            <p className="text-gray-500 text-xs">© 2025 SteakNStake</p>
          </div>
        </div>
      </footer>
    </div>
  );
}