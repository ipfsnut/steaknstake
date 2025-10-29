'use client';

import { useEffect, useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { formatEther } from 'viem';
import { useRouter } from 'next/navigation';
import { stakingApi, tippingApi } from '@/lib/api';
import { useWalletConnection } from '@/hooks/useWalletConnection';
import { useFarcasterMiniApp } from '@/hooks/useFarcasterMiniApp';
import { useStaking } from '@/hooks/useStaking';
import { CONTRACTS, STEAKNSTAKE_ABI } from '@/lib/contracts';

interface StakingStats {
  totalStakers: number;
  totalStaked: number;
  tipsAvailable: number; // User's claimable balance for tipping
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
  remainingDailyAllowance: number;
  dailyAllowanceStart: number;
  dailyTipsSent: number;
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
  const router = useRouter();
  const [activeSection, setActiveSection] = useState('home');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [stakingStats, setStakingStats] = useState<StakingStats>({
    totalStakers: 0,
    totalStaked: 0,
    tipsAvailable: 0
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
  const [userClaimableTips, setUserClaimableTips] = useState(0);
  const [userAllowanceBalance, setUserAllowanceBalance] = useState(0); // Track tipping allowances
  const [backendUserPosition, setBackendUserPosition] = useState<UserPosition | null>(null);
  const [unclaimedTips, setUnclaimedTips] = useState<any[]>([]);
  const [unclaimedAmount, setUnclaimedAmount] = useState<number>(0);

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

  // Read real contract data for platform stats
  const { data: contractTotalStaked } = useReadContract({
    address: CONTRACTS.STEAKNSTAKE as `0x${string}`,
    abi: STEAKNSTAKE_ABI,
    functionName: 'totalStaked',
  });

  // Contract doesn't have totalSupply - we'll calculate stakers differently

  // Read user's claimed earnings (TipN pattern)
  const { data: claimedEarnings } = useReadContract({
    address: CONTRACTS.STEAKNSTAKE as `0x${string}`,
    abi: STEAKNSTAKE_ABI,
    functionName: 'getClaimedEarnings',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address
    }
  });

  // Removed: Read user's unclaimed earnings (TipN pattern) - using backend API instead

  // Read total rewards distributed globally (TipN pattern)
  const { data: totalRewardsDistributed } = useReadContract({
    address: CONTRACTS.STEAKNSTAKE as `0x${string}`,
    abi: STEAKNSTAKE_ABI,
    functionName: 'totalRewardsDistributed',
    query: {
      enabled: true
    }
  });

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
  } = useStaking(user); // Pass Farcaster user data

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

  // Fetch unclaimed tips for the user
  const fetchUnclaimedTips = async () => {
    if (!address || !user?.fid) return;
    
    try {
      console.log('🔍 Fetching unclaimed tips...', { address, fid: user.fid });
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/farcaster/user/${user.fid}`);
      if (response.ok) {
        const data = await response.json();
        const unclaimedAmount = data.data?.stats?.unclaimedAmount || 0;
        const recentTips = data.data?.recentTips?.filter((tip: any) => !tip.isClaimed) || [];
        
        setUnclaimedAmount(unclaimedAmount);
        setUnclaimedTips(recentTips);
        
        console.log('📨 Unclaimed tips:', { unclaimedAmount, count: recentTips.length });
      }
    } catch (error) {
      console.error('❌ Error fetching unclaimed tips:', error);
    }
  };

  // Auto-sync user data when both wallet and Farcaster are connected
  useEffect(() => {
    const autoSyncUserData = async () => {
      if (address && user?.fid && user?.username) {
        console.log('🔗 Auto-syncing user data:', { address, fid: user.fid, username: user.username });
        
        try {
          // Update user profile with Farcaster data
          const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/profile/${address}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              farcasterFid: user.fid,
              farcasterUsername: user.username
            })
          });
          
          if (response.ok) {
            console.log('✅ User profile auto-synced with Farcaster data');
          } else {
            console.warn('⚠️ Failed to auto-sync user data:', response.status);
          }
        } catch (error) {
          console.error('❌ Error auto-syncing user data:', error);
        }
      }
    };
    
    autoSyncUserData();
  }, [address, user]);

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

  // Initialize with contract data only (no backend dependency)
  useEffect(() => {
    setLoading(false);
  }, []);

  // Fetch user position from backend when wallet connects
  useEffect(() => {
    const fetchUserPosition = async () => {
      if (address) {
        try {
          console.log('🔍 Fetching user position for address:', address);
          const response = await stakingApi.getPosition(address);
          console.log('📡 Backend response:', response.data);
          
          if (response.data.success) {
            console.log('✅ User position fetched successfully:', response.data.data);
            setBackendUserPosition(response.data.data);
          } else {
            console.log('❌ Backend returned failure:', response.data);
            setBackendUserPosition(null);
          }
        } catch (error) {
          console.error('❌ Error fetching user position from backend:', error);
          console.error('Error details:', {
            message: (error as any)?.message,
            code: (error as any)?.code,
            response: (error as any)?.response?.data
          });
          setBackendUserPosition(null);
        }
      }
    };

    fetchUserPosition();
  }, [address]);

  // Update all stats when contract data changes
  useEffect(() => {
    const realTotalStaked = contractTotalStaked ? parseFloat(formatEther(contractTotalStaked)) : 0;
    const userClaimedEarnings = claimedEarnings ? parseFloat(formatEther(claimedEarnings)) : 0;
    
    // Use backend data for tip balance - no need to read from contract anymore
    const fetchBackendData = async () => {
      if (!address) return;
      
      try {
        console.log('📡 Fetching user position from backend API...');
        
        // Fetch backend position data
        const response = await stakingApi.getPosition(address);
        const position = response.data.data;
        setBackendUserPosition(position);
        
        const backendTipAllowance = position?.remainingDailyAllowance || 0;
        console.log('💰 Using backend tip allowance:', {
          backendTipAllowance,
          dailyAllowanceStart: position?.dailyAllowanceStart,
          dailyTipsSent: position?.dailyTipsSent,
          address
        });
        
        // Update state with backend data
        setUserClaimableTips(backendTipAllowance);
        setUserAllowanceBalance(backendTipAllowance);
        
      } catch (error) {
        console.error('❌ Error fetching backend data:', error);
        // Fallback to 0 if backend fails
        setUserClaimableTips(0);
        setUserAllowanceBalance(0);
      }
    };
    
    fetchBackendData();
    
    // Fetch unclaimed tips if user has Farcaster FID
    fetchUnclaimedTips();
    
    // Debug logging
    console.log('📊 Contract data update:', {
      address,
      contractTotalStaked: contractTotalStaked?.toString(),
      realTotalStaked,
      claimedEarnings: claimedEarnings?.toString(),
      userClaimedEarnings,
      contractStakedAmount
    });
    
    // Calculate total stakers: if there's any staked amount, there's at least 1 staker
    const totalStakers = realTotalStaked > 0 ? 1 : 0; // For now, simple calculation
    
    // Update platform stats with backend data
    setStakingStats({
      totalStakers,
      totalStaked: realTotalStaked,
      tipsAvailable: userClaimableTips // Use backend data
    });
    
    // Create leaderboard with real user if they have stakes
    const leaderboard = [];
    if (contractStakedAmount && parseFloat(contractStakedAmount) > 0) {
      leaderboard.push({
        rank: 1,
        walletAddress: address || '0x18A85ad341b2D6A2bd67fbb104B4827B922a2A3c',
        farcasterUsername: user?.username || 'epicdylan',
        stakedAmount: parseFloat(contractStakedAmount),
        availableTipBalance: userClaimableTips, // Use backend data
        totalRewardsEarned: 0 // User hasn't received tips from others yet
      });
    }
    setTopStakers(leaderboard);
  }, [contractTotalStaked, claimedEarnings, contractStakedAmount, address, user, userClaimableTips]);

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
    setLoading(true);
    
    // Refresh contract data - the useEffect will handle updating the UI
    refetchData();
    
    setLoading(false);
  };

  // Function to handle tip sending via backend API
  const handleTipSent = async (recipientFid: number, recipientUsername: string, tipAmount: number, castHash?: string, castUrl?: string, message?: string) => {
    if (!address) {
      console.error('Wallet not connected');
      return;
    }

    try {
      const response = await tippingApi.sendTip({
        tipperWalletAddress: address,
        recipientFid,
        recipientUsername,
        tipAmount,
        castHash,
        castUrl,
        message
      });

      if (response.data.success) {
        // Update local state immediately
        setUserAllowanceBalance(prev => Math.max(0, prev - tipAmount));
        setBackendUserPosition(prev => prev ? {
          ...prev,
          remainingDailyAllowance: Math.max(0, prev.remainingDailyAllowance - tipAmount),
          availableTipBalance: Math.max(0, prev.availableTipBalance - tipAmount) // Keep both for compatibility
        } : null);
        
        console.log(`💰 Tip sent successfully: ${tipAmount} $STEAK to @${recipientUsername}`);
        
        // Refresh user position from backend
        setTimeout(async () => {
          try {
            const positionResponse = await stakingApi.getPosition(address);
            if (positionResponse.data.success) {
              setBackendUserPosition(positionResponse.data.data);
            }
          } catch (error) {
            console.warn('Failed to refresh user position after tip:', error);
          }
        }, 1000);
        
        return response.data;
      } else {
        throw new Error(response.data.error || 'Failed to send tip');
      }
    } catch (error) {
      console.error('Error sending tip:', error);
      throw error;
    }
  };

  const renderContent = () => {
    switch (activeSection) {
      case 'stake':
        return (
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-center gap-3 mb-8">
              <h2 className="text-4xl font-bold bg-gradient-to-r from-red-600 to-orange-500 bg-clip-text text-transparent">
                Stake $STEAK
              </h2>
              <button 
                onClick={() => setShowStakeHelp(!showStakeHelp)}
                className="text-sm bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-full w-7 h-7 flex items-center justify-center font-medium transition-colors"
                title="Staking info"
              >
                ?
              </button>
            </div>
            
            {showStakeHelp && (
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-6 mb-8 shadow-sm">
                <h3 className="font-bold text-green-800 mb-3 text-lg">🥩 About Staking</h3>
                <div className="text-sm text-green-700 space-y-2">
                  <p className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">•</span>
                    <span>Stake $STEAK tokens to earn daily allowances</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">•</span>
                    <span>Allowances can only be tipped to others, never claimed</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">•</span>
                    <span>You can unstake your original tokens anytime</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">•</span>
                    <span>Longer stakes earn more tipping power</span>
                  </p>
                </div>
              </div>
            )}
            
            {isMiniApp && user ? (
              <>
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl p-6 border border-green-200 mb-8 text-center shadow-lg">
                  <div className="text-4xl mb-3">🎉</div>
                  <h3 className="text-2xl font-bold mb-3 text-green-800">Welcome @{user.username}!</h3>
                  <p className="text-green-600 mb-4 font-medium">Connected via Farcaster</p>
                  <div className="flex justify-center gap-6 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-green-500">🎯</span>
                      <span className="text-green-700">ID: {user.fid}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-green-500">💰</span>
                      <span className="text-green-700">Ready to stake!</span>
                    </div>
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
                      <div className="text-2xl font-bold text-purple-600">{userClaimableTips?.toFixed(2) || '0.00'}</div>
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

                {(parseFloat(contractStakedAmount || '0') > 0 || (userPosition?.stakedAmount || 0) > 0) && (
                  <div className="bg-white rounded-xl p-6 border mb-6">
                    <h3 className="text-xl font-bold mb-4">Unstake Tokens</h3>
                    <p className="text-gray-600 mb-4">Withdraw your staked $STEAK tokens (keeps your earned allowances).</p>
                    <div className="space-y-4">
                      <input 
                        type="number" 
                        placeholder="Amount to unstake"
                        max={contractStakedAmount || userPosition?.stakedAmount || 0}
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
                            const maxAmount = contractStakedAmount || userPosition?.stakedAmount?.toString() || '0';
                            if (parseFloat(maxAmount) > 0) handleUnstake(maxAmount);
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
                      <div className="text-2xl font-bold text-purple-600">{userClaimableTips?.toFixed(2) || '0.00'}</div>
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

                {(parseFloat(contractStakedAmount || '0') > 0 || (userPosition?.stakedAmount || 0) > 0) && (
                  <div className="bg-white rounded-xl p-6 border mb-6">
                    <h3 className="text-xl font-bold mb-4">Unstake Tokens</h3>
                    <p className="text-gray-600 mb-4">Withdraw your staked $STEAK tokens (keeps your earned allowances).</p>
                    <div className="space-y-4">
                      <input 
                        type="number" 
                        placeholder="Amount to unstake"
                        max={contractStakedAmount || userPosition?.stakedAmount || 0}
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
                            const maxAmount = contractStakedAmount || userPosition?.stakedAmount?.toString() || '0';
                            if (parseFloat(maxAmount) > 0) handleUnstake(maxAmount);
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
                <h3 className="font-bold text-purple-800 mb-2">How to Tip on Farcaster</h3>
                <div className="text-sm text-purple-700 space-y-1">
                  <p><strong>Reply to any cast with:</strong></p>
                  <p>• "@steaknstake 25 $STEAK" (must tag the bot)</p>
                  <p>• Tips processed daily at midnight UTC</p>
                  <p>• Recipients claim via the SteakNStake miniapp</p>
                  <p>• You can only tip up to your allowance balance</p>
                </div>
              </div>
            )}
            
            <div className="bg-white rounded-xl p-6 border mb-6">
              <h3 className="text-xl font-bold mb-4">🔥 Current Allowance</h3>
              <div className="text-center">
                <div className="text-4xl font-bold text-green-600 mb-2">
                  {userClaimableTips?.toFixed(2) || '0.00'}
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
                  <p>• <strong>Claim Full:</strong> 100% goes to your wallet</p>
                  <p>• <strong>Split 50/50:</strong> 50% to wallet, 50% auto-staked</p>
                  <p>• Auto-staked tokens start earning rewards immediately</p>
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
                  💰 Claim Full Amount to Wallet
                </button>
                <button className="w-full p-3 border-2 border-purple-500 text-purple-700 rounded-lg font-medium hover:bg-purple-50">
                  ⚖️ Split: 50% Wallet + 50% Auto-Stake
                </button>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-800">
                    💡 <strong>Smart tip:</strong> Split option lets you claim some and start earning rewards on the rest immediately!
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
            <div className="mb-6 flex justify-center">
              <div className="w-20 h-20 bg-gradient-to-br from-red-500 to-orange-500 rounded-2xl flex items-center justify-center shadow-xl">
                <span className="text-white text-3xl">🥩</span>
              </div>
            </div>
            <div className="flex items-center justify-center gap-3 mb-6">
              <h1 className="text-5xl md:text-7xl font-black bg-gradient-to-r from-red-600 to-orange-500 bg-clip-text text-transparent">
                SteakNStake
              </h1>
              <button 
                onClick={() => setShowHelp(!showHelp)}
                className="text-sm bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-full w-10 h-10 flex items-center justify-center transition-colors font-bold shadow-md"
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
                  <p><strong>Tips Available:</strong> Your allowance balance for tipping</p>
                  <p><strong>Tips Received:</strong> Tips others have sent you to claim</p>
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto mb-12">
              <button 
                onClick={() => router.push('/leaderboard')}
                className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl p-6 text-center border border-blue-200 shadow-lg hover:shadow-xl transition-all transform hover:scale-105 cursor-pointer"
              >
                <div className="text-3xl mb-3">👥</div>
                <div className="text-2xl font-bold text-blue-600 mb-1">{stakingStats.totalStakers}</div>
                <div className="text-sm text-blue-700 font-medium">Stakers</div>
                <div className="text-xs text-blue-500 mt-2">→ View Leaderboard</div>
              </button>
              
              <button 
                onClick={() => setActiveSection('stake')}
                className="bg-gradient-to-br from-green-50 to-emerald-100 rounded-2xl p-6 text-center border border-green-200 shadow-lg hover:shadow-xl transition-all transform hover:scale-105 cursor-pointer"
              >
                <div className="text-3xl mb-3">💰</div>
                <div className="text-2xl font-bold text-green-600 mb-1">{formatNumber(stakingStats.totalStaked)}</div>
                <div className="text-sm text-green-700 font-medium">$STEAK Staked</div>
                <div className="text-xs text-green-500 mt-2">→ Start Staking</div>
              </button>
              
              <button 
                onClick={() => setActiveSection('tip')}
                className="bg-gradient-to-br from-pink-50 to-rose-100 rounded-2xl p-6 text-center border border-pink-200 shadow-lg hover:shadow-xl transition-all transform hover:scale-105 cursor-pointer"
              >
                <div className="text-3xl mb-3">💝</div>
                <div className="text-2xl font-bold text-pink-600 mb-1">{formatNumber(stakingStats.tipsAvailable)}</div>
                <div className="text-sm text-pink-700 font-medium">Tips Available</div>
                <div className="text-xs text-pink-500 mt-2">→ Learn Tipping</div>
              </button>

              <button 
                onClick={() => setActiveSection('claim')}
                className="bg-gradient-to-br from-green-50 to-emerald-100 rounded-2xl p-6 text-center border border-green-200 shadow-lg hover:shadow-xl transition-all transform hover:scale-105 cursor-pointer"
              >
                <div className="text-3xl mb-3">🎁</div>
                <div className="text-2xl font-bold text-green-600 mb-1">{formatNumber(unclaimedAmount)}</div>
                <div className="text-sm text-green-700 font-medium">Tips Received</div>
                <div className="text-xs text-green-500 mt-2">→ Claim Tips</div>
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button 
                onClick={() => setActiveSection('stake')}
                className="bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white px-8 py-4 rounded-2xl font-bold text-lg shadow-lg hover:shadow-xl transition-all transform hover:scale-105"
              >
                🥩 Start Staking
              </button>
              <button 
                onClick={() => setActiveSection('tip')}
                className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white px-8 py-4 rounded-2xl font-bold text-lg shadow-lg hover:shadow-xl transition-all transform hover:scale-105"
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
                onClick={() => router.push('/leaderboard')}
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
                  onClick={() => { router.push('/leaderboard'); setMobileMenuOpen(false); }}
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