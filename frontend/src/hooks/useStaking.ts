'use client';

import { useEffect, useState } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { CONTRACTS, ERC20_ABI, STEAKNSTAKE_ABI } from '@/lib/contracts';

export function useStaking() {
  const { address, isConnected } = useAccount();
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const [currentStep, setCurrentStep] = useState<'approve' | 'stake' | 'completed'>('approve');
  const [isProcessing, setIsProcessing] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
    functionName: 'stakedAmounts',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address
    }
  });

  // Wait for transaction confirmation
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
    query: {
      enabled: !!hash, // Only try to watch for receipt if we have a hash
    }
  });

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
      } else if (currentStep === 'stake') {
        setSuccessMessage('STEAK tokens staked successfully!');
        setCurrentStep('completed');
        // Reset to approve step after a delay
        setTimeout(() => {
          setCurrentStep('approve');
          setSuccessMessage(null);
        }, 3000);
      }
    }
    
    // Handle transaction errors
    if (error && !isPending && !isConfirming) {
      console.error('💥 Transaction error detected:', error);
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
  }, [isConfirmed, currentStep, refetchAllowance, refetchBalance, refetchStaked, address, error, isPending, isConfirming]);

  const approveSteak = async (amount: string) => {
    console.log('🚀 Starting approve flow...', { amount, address, isConnected });
    
    try {
      setIsProcessing(true);
      setUserError(null);
      setSuccessMessage(null);
      
      const amountWei = parseEther(amount);
      
      console.log('💰 Approving STEAK tokens:', {
        amount,
        amountWei: amountWei.toString(),
        tokenAddress: CONTRACTS.STEAK_TOKEN,
        spenderAddress: CONTRACTS.STEAKNSTAKE,
        userAddress: address,
        isConnected
      });

      writeContract({
        address: CONTRACTS.STEAK_TOKEN as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [CONTRACTS.STEAKNSTAKE as `0x${string}`, amountWei],
      });
      
      console.log('✅ Approve transaction submitted');
      
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
      
      const amountWei = parseEther(amount);
      
      console.log('🥩 Staking STEAK tokens:', {
        amount,
        amountWei: amountWei.toString(),
        contractAddress: CONTRACTS.STEAKNSTAKE,
        userAddress: address,
        isConnected
      });

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
      } else {
        setUserError(`Failed to stake tokens: ${err?.message || 'Unknown error'}`);
      }
    }
  };

  const unstakeTokens = async (amount: string) => {
    if (!address) return;

    try {
      setIsProcessing(true);
      setUserError(null);
      setSuccessMessage(null);
      
      const amountWei = parseEther(amount);
      
      writeContract({
        address: CONTRACTS.STEAKNSTAKE as `0x${string}`,
        abi: STEAKNSTAKE_ABI,
        functionName: 'unstake',
        args: [amountWei],
      });
    } catch (err: any) {
      console.error('Unstake failed:', err);
      setIsProcessing(false);
      
      if (err?.message?.includes('User rejected')) {
        setUserError('Transaction was rejected. Please try again.');
      } else if (err?.message?.includes('insufficient')) {
        setUserError('Insufficient staked balance for unstaking.');
      } else if (err?.message?.includes('network')) {
        setUserError('Network error. Please check your connection.');
      } else {
        setUserError('Failed to unstake tokens. Please try again.');
      }
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