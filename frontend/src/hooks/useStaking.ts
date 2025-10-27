'use client';

import { useEffect, useState } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSimulateContract } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { CONTRACTS, ERC20_ABI, STEAKNSTAKE_ABI } from '@/lib/contracts';
import { stakingApi } from '@/lib/api';

export function useStaking(farcasterUser?: any) {
  const { address, isConnected } = useAccount();
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const [currentStep, setCurrentStep] = useState<'approve' | 'stake' | 'completed'>('approve');
  const [isProcessing, setIsProcessing] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pendingTransaction, setPendingTransaction] = useState<{
    type: 'approve' | 'stake' | 'unstake';
    amount: string;
  } | null>(null);

  // Check allowance for SteakNStake contract
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: CONTRACTS.STEAK_TOKEN as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && CONTRACTS.STEAKNSTAKE ? [address, CONTRACTS.STEAKNSTAKE as `0x${string}`] : undefined,
    query: {
      enabled: !!address && !!CONTRACTS.STEAKNSTAKE
    }
  });

  // Check user's STEAK balance
  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: CONTRACTS.STEAK_TOKEN as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address
    }
  });

  // Check user's staked amount
  const { data: stakedAmount, refetch: refetchStaked } = useReadContract({
    address: CONTRACTS.STEAKNSTAKE as `0x${string}`,
    abi: STEAKNSTAKE_ABI,
    functionName: 'getStakedAmount',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address
    }
  });

  // Removed direct contract reading for tip allowance - using backend sync instead

  // Wait for transaction confirmation
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
    query: {
      enabled: !!hash, // Only try to watch for receipt if we have a hash
    }
  });

  // Add a fallback timer to check transaction status if connector fails
  useEffect(() => {
    if (hash && !isConfirmed && !isConfirming && error) {
      console.log('🔄 Setting up fallback transaction confirmation check...');
      const checkInterval = setInterval(async () => {
        try {
          // Try to refetch contract data to see if transaction went through
          refetchAllowance();
          refetchBalance();
          refetchStaked();
        } catch (err) {
          console.warn('Fallback check failed:', err);
        }
      }, 3000);

      // Clear interval after 30 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
      }, 30000);

      return () => clearInterval(checkInterval);
    }
  }, [hash, isConfirmed, isConfirming, error, refetchAllowance, refetchBalance, refetchStaked]);

  // Update step based on allowance
  useEffect(() => {
    console.log('🔍 Allowance check:', {
      allowance: allowance?.toString(),
      hasAllowance: allowance && allowance > BigInt(0),
      currentStep,
      address,
      contracts: CONTRACTS
    });
    
    if (allowance && allowance > BigInt(0)) {
      setCurrentStep('stake');
    } else {
      setCurrentStep('approve');
    }
  }, [allowance, address]);

  // Handle transaction confirmation
  useEffect(() => {
    console.log('📄 Transaction confirmation:', {
      isConfirmed,
      isConfirming,
      hash: hash?.toString(),
      currentStep,
      isPending,
      address,
      error: error?.message
    });
    
    if (isConfirmed) {
      console.log('✅ Transaction confirmed! Refetching data...');
      setIsProcessing(false);
      
      if (address) {
        refetchAllowance();
        refetchBalance();
        refetchStaked();
      }
      
      if (currentStep === 'approve') {
        setSuccessMessage('STEAK tokens approved successfully!');
      } else if (currentStep === 'stake' && pendingTransaction?.type === 'stake') {
        // Call backend API to record the stake
        handleStakeBackendUpdate(pendingTransaction.amount, hash, farcasterUser);
        setSuccessMessage('STEAK tokens staked successfully!');
        setCurrentStep('completed');
        // Reset to correct step after a delay based on allowance
        setTimeout(() => {
          setSuccessMessage(null);
          // Don't reset currentStep here - let the allowance useEffect handle it
        }, 3000);
      } else if (pendingTransaction?.type === 'unstake') {
        // Call backend API to record the unstake
        handleUnstakeBackendUpdate(pendingTransaction.amount, hash);
        setSuccessMessage('STEAK tokens unstaked successfully!');
        setTimeout(() => {
          setSuccessMessage(null);
        }, 3000);
      }
      
      // Clear pending transaction
      setPendingTransaction(null);
    }
    
    // Handle transaction errors  
    if (error && !isPending && !isConfirming) {
      console.error('💥 Transaction error detected:', error);
      
      // Don't show UI error for getChainId issues - these are connector-level problems
      if (error?.message?.includes('getChainId')) {
        console.warn('⚠️ getChainId error detected - this is a connector issue, not a transaction failure');
        // Don't set processing to false or show error to user for this specific case
        return;
      }
      
      setIsProcessing(false);
      
      if (error?.message?.includes('User rejected')) {
        setUserError('Transaction was rejected. Please try again.');
      } else if (error?.message?.includes('insufficient funds')) {
        setUserError('Insufficient ETH for transaction fees.');
      } else if (error?.message?.includes('network')) {
        setUserError('Network error. Please check your connection.');
      } else {
        setUserError('Transaction failed. Please try again.');
      }
    }
  }, [isConfirmed, currentStep, refetchAllowance, refetchBalance, refetchStaked, address, error, isPending, isConfirming, pendingTransaction, hash]);

  // Handle backend API call for stake transactions
  const handleStakeBackendUpdate = async (amount: string, transactionHash: `0x${string}` | undefined, farcasterUser?: any) => {
    if (!address || !transactionHash) return;
    
    try {
      console.log('📡 Calling backend to record stake...', {
        walletAddress: address,
        amount: parseFloat(amount),
        transactionHash,
        farcasterUser
      });
      
      const response = await stakingApi.stake({
        walletAddress: address,
        amount: parseFloat(amount),
        transactionHash,
        farcasterFid: farcasterUser?.fid,
        farcasterUsername: farcasterUser?.username,
        // TODO: Add block number if needed
      });
      
      console.log('📡 Backend response:', response);
    } catch (error) {
      console.error('❌ Failed to update backend:', error);
    }
  };

  // Handle backend API call for unstake transactions
  const handleUnstakeBackendUpdate = async (amount: string, transactionHash: `0x${string}` | undefined) => {
    if (!address || !transactionHash) return;
    
    try {
      console.log('📡 Calling backend to record unstake...', {
        walletAddress: address,
        amount: parseFloat(amount),
        transactionHash
      });
      
      const response = await stakingApi.unstake({
        walletAddress: address,
        amount: parseFloat(amount),
        transactionHash,
        // TODO: Add block number if needed
      });
      
      console.log('📡 Backend unstake response:', response);
    } catch (error) {
      console.error('❌ Failed to update backend for unstake:', error);
    }
  };

  const approveSteak = async (amount: string) => {
    console.log('🚀 Starting approve flow...', { amount, address, isConnected });
    
    try {
      setIsProcessing(true);
      setUserError(null);
      setSuccessMessage(null);
      setPendingTransaction({ type: 'approve', amount });
      
      const amountWei = parseEther(amount);
      
      console.log('💰 Approving STEAK tokens:', {
        amount,
        amountWei: amountWei.toString(),
        tokenAddress: CONTRACTS.STEAK_TOKEN,
        spenderAddress: CONTRACTS.STEAKNSTAKE,
        userAddress: address,
        isConnected
      });

      // Use 2025 best practice - no explicit chainId for Farcaster miniapps
      writeContract({
        address: CONTRACTS.STEAK_TOKEN as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [CONTRACTS.STEAKNSTAKE as `0x${string}`, amountWei],
      });
      
    } catch (err: any) {
      console.error('❌ Approve failed:', err);
      console.error('❌ Error details:', {
        message: err?.message,
        code: err?.code,
        data: err?.data,
        cause: err?.cause,
        stack: err?.stack
      });
      setIsProcessing(false);
      
      if (err?.message?.includes('User rejected') || err?.code === 'ACTION_REJECTED') {
        setUserError('Transaction was rejected. Please try again.');
      } else if (err?.message?.includes('insufficient funds')) {
        setUserError('Insufficient ETH for transaction fees.');
      } else if (err?.message?.includes('network')) {
        setUserError('Network error. Please check your connection.');
      } else if (err?.message?.includes('getChainId')) {
        setUserError('Wallet chain detection error. Please try again.');
      } else {
        setUserError(`Failed to approve tokens: ${err?.message || 'Unknown error'}`);
      }
      
      throw err;
    }
  };

  const stakeTokens = async (amount: string) => {
    console.log('🚀 Starting stake flow...', { amount, address, isConnected });
    
    try {
      setIsProcessing(true);
      setUserError(null);
      setSuccessMessage(null);
      setPendingTransaction({ type: 'stake', amount });
      
      const amountWei = parseEther(amount);
      
      console.log('🥩 Staking STEAK tokens:', {
        amount,
        amountWei: amountWei.toString(),
        contractAddress: CONTRACTS.STEAKNSTAKE,
        userAddress: address,
        isConnected
      });

      // Use 2025 best practice - no explicit chainId for Farcaster miniapps
      writeContract({
        address: CONTRACTS.STEAKNSTAKE as `0x${string}`,
        abi: STEAKNSTAKE_ABI,
        functionName: 'stake',
        args: [amountWei],
      });
      
      console.log('✅ Stake transaction submitted');
    } catch (err: any) {
      console.error('❌ Stake failed:', err);
      console.error('❌ Error details:', {
        message: err?.message,
        code: err?.code,
        data: err?.data,
        cause: err?.cause,
        stack: err?.stack
      });
      setIsProcessing(false);
      
      if (err?.message?.includes('User rejected') || err?.code === 'ACTION_REJECTED') {
        setUserError('Transaction was rejected. Please try again.');
      } else if (err?.message?.includes('insufficient funds')) {
        setUserError('Insufficient STEAK balance for staking.');
      } else if (err?.message?.includes('allowance')) {
        setUserError('Please approve STEAK tokens first.');
      } else if (err?.message?.includes('network')) {
        setUserError('Network error. Please check your connection.');
      } else if (err?.message?.includes('getChainId')) {
        setUserError('Wallet chain detection error. Please try again.');
      } else {
        setUserError(`Failed to stake tokens: ${err?.message || 'Unknown error'}`);
      }
    }
  };

  const unstakeTokens = async (amount: string) => {
    console.log('🚀 Starting unstake flow...', { amount, address, isConnected });
    
    try {
      setIsProcessing(true);
      setUserError(null);
      setSuccessMessage(null);
      setPendingTransaction({ type: 'unstake', amount });
      
      const amountWei = parseEther(amount);
      
      console.log('🥩 Unstaking STEAK tokens:', {
        amount,
        amountWei: amountWei.toString(),
        contractAddress: CONTRACTS.STEAKNSTAKE,
        userAddress: address,
        isConnected
      });

      // Use 2025 best practice - no explicit chainId for Farcaster miniapps
      writeContract({
        address: CONTRACTS.STEAKNSTAKE as `0x${string}`,
        abi: STEAKNSTAKE_ABI,
        functionName: 'unstake',
        args: [amountWei],
      });
      
      console.log('✅ Unstake transaction submitted');
    } catch (err: any) {
      console.error('❌ Unstake failed:', err);
      console.error('❌ Error details:', {
        message: err?.message,
        code: err?.code,
        data: err?.data,
        cause: err?.cause,
        stack: err?.stack
      });
      setIsProcessing(false);
      
      if (err?.message?.includes('User rejected') || err?.code === 'ACTION_REJECTED') {
        setUserError('Transaction was rejected. Please try again.');
      } else if (err?.message?.includes('insufficient')) {
        setUserError('Insufficient staked balance for unstaking.');
      } else if (err?.message?.includes('network')) {
        setUserError('Network error. Please check your connection.');
      } else if (err?.message?.includes('getChainId')) {
        setUserError('Wallet chain detection error. Please try again.');
      } else {
        setUserError(`Failed to unstake tokens: ${err?.message || 'Unknown error'}`);
      }
      
      throw err;
    }
  };

  return {
    // State
    currentStep,
    isProcessing: isProcessing || isPending || isConfirming,
    error,
    userError,
    successMessage,
    
    // Data
    allowance: allowance ? formatEther(allowance) : '0',
    balance: balance ? formatEther(balance) : '0',
    stakedAmount: stakedAmount ? formatEther(stakedAmount) : '0',
    
    // Actions
    approveSteak,
    stakeTokens,
    unstakeTokens,
    
    // Utils
    refetchData: () => {
      refetchAllowance();
      refetchBalance();
      refetchStaked();
    },
    clearError: () => setUserError(null),
    clearSuccess: () => setSuccessMessage(null)
  };
}