'use client';

import { useState, useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useConnect, useSendCalls } from 'wagmi';
import { parseEther, formatEther, encodeFunctionData } from 'viem';
import { CONTRACTS, ERC20_ABI, STEAKNSTAKE_ABI } from '@/lib/contracts';
import { useFarcasterWallet } from './useFarcasterWallet';
import { useFarcasterMiniApp } from './useFarcasterMiniApp';

export function useStaking() {
  const { address, isConnected } = useAccount();
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { sendCalls, data: callsData, isPending: callsPending, error: callsError } = useSendCalls();
  const { connectors } = useConnect();
  const { isFarcasterContext, isWalletConnected, getEthereumProvider } = useFarcasterWallet();
  const { user, isMiniApp, sdk } = useFarcasterMiniApp();
  const [currentStep, setCurrentStep] = useState<'approve' | 'stake' | 'completed'>('approve');
  const [isProcessing, setIsProcessing] = useState(false);

  // In Farcaster context, we might not have an address immediately, but transactions can still work
  const effectiveAddress = address || (isFarcasterContext && user ? 'farcaster-context' : undefined);

  // Check allowance for SteakNStake contract - in Farcaster context, skip allowance checks
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: CONTRACTS.STEAK_TOKEN as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && CONTRACTS.STEAKNSTAKE ? [address, CONTRACTS.STEAKNSTAKE as `0x${string}`] : undefined,
    query: {
      enabled: !!address && !!CONTRACTS.STEAKNSTAKE // Only run if we have a real address
    }
  });

  // Check user's STEAK balance - in Farcaster context, skip balance checks  
  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: CONTRACTS.STEAK_TOKEN as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address // Only run if we have a real address
    }
  });

  // Check user's staked amount - in Farcaster context, skip staked amount checks
  const { data: stakedAmount, refetch: refetchStaked } = useReadContract({
    address: CONTRACTS.STEAKNSTAKE as `0x${string}`,
    abi: STEAKNSTAKE_ABI,
    functionName: 'stakedAmounts',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address // Only run if we have a real address
    }
  });

  // Wait for transaction confirmation
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
    query: {
      enabled: !!hash, // Only try to watch for receipt if we have a hash
    }
  });

  // Update step based on allowance - in Farcaster context, always start with approve
  useEffect(() => {
    console.log('🔍 Allowance check:', {
      allowance: allowance?.toString(),
      hasAllowance: allowance && allowance > BigInt(0),
      currentStep,
      address,
      isFarcasterContext,
      contracts: CONTRACTS
    });
    
    // In Farcaster context without address, we can't check allowance, so always start with approve
    if (isFarcasterContext && !address) {
      console.log('💫 Farcaster context without address - starting with approve step');
      setCurrentStep('approve');
      return;
    }
    
    if (allowance && allowance > BigInt(0)) {
      setCurrentStep('stake');
    } else {
      setCurrentStep('approve');
    }
  }, [allowance, address, isFarcasterContext]);

  // Handle transaction confirmation
  useEffect(() => {
    console.log('📄 Transaction confirmation:', {
      isConfirmed,
      isConfirming,
      hash: hash?.toString(),
      currentStep,
      isPending,
      isFarcasterContext,
      address,
      error: error?.message
    });
    
    if (isConfirmed) {
      console.log('✅ Transaction confirmed! Refetching data...');
      setIsProcessing(false);
      
      // Only refetch if we have an address (not in Farcaster context without address)
      if (address) {
        refetchAllowance();
        refetchBalance();
        refetchStaked();
      }
      
      if (currentStep === 'approve' && isFarcasterContext && !address) {
        // In Farcaster context, assume approval succeeded and move to stake step
        console.log('💫 Farcaster context: Moving from approve to stake step');
        setCurrentStep('stake');
      } else if (currentStep === 'stake') {
        setCurrentStep('completed');
        // Reset to approve step after a delay
        setTimeout(() => setCurrentStep('approve'), 3000);
      }
    }
    
    // Handle transaction errors
    if (error && !isPending && !isConfirming) {
      console.error('💥 Transaction error detected:', error);
      setIsProcessing(false);
    }
  }, [isConfirmed, currentStep, refetchAllowance, refetchBalance, refetchStaked, isFarcasterContext, address, error, isPending, isConfirming]);

  const approveSteak = async (amount: string) => {
    console.log('🚀 Starting approve flow...', { amount, address, isFarcasterContext, isConnected });
    
    try {
      setIsProcessing(true);
      const amountWei = parseEther(amount);
      
      // Check if we're in Farcaster miniapp context
      if (isMiniApp && isFarcasterContext) {
        console.log('🔌 Farcaster miniapp context - using sendCalls for batch transaction');
        
        // Use sendCalls for Farcaster miniapp - this supports batching
        sendCalls({
          calls: [
            {
              to: CONTRACTS.STEAK_TOKEN as `0x${string}`,
              data: encodeFunctionData({
                abi: ERC20_ABI,
                functionName: 'approve',
                args: [CONTRACTS.STEAKNSTAKE as `0x${string}`, amountWei],
              }),
            }
          ]
        });
        
        console.log('✅ Approve transaction submitted via sendCalls');
      } else {
        console.log('📝 Regular web context - using writeContract');
        
        // Use regular writeContract for web
        writeContract({
          address: CONTRACTS.STEAK_TOKEN as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [CONTRACTS.STEAKNSTAKE as `0x${string}`, amountWei],
        });
        
        console.log('✅ Approve transaction submitted via writeContract');
      }
      
    } catch (err) {
      console.error('❌ Approve failed:', err);
      setIsProcessing(false);
      throw err;
    }
  };

  const stakeTokens = async (amount: string) => {
    console.log('🚀 Starting stake flow...', { amount, address, isFarcasterContext, isConnected });
    
    try {
      setIsProcessing(true);
      const amountWei = parseEther(amount);
      
      // Check if we're in Farcaster miniapp context
      if (isMiniApp && isFarcasterContext) {
        console.log('🔌 Farcaster miniapp context - using sendCalls');
        
        // Use sendCalls for Farcaster miniapp
        sendCalls({
          calls: [
            {
              to: CONTRACTS.STEAKNSTAKE as `0x${string}`,
              data: encodeFunctionData({
                abi: STEAKNSTAKE_ABI,
                functionName: 'stake',
                args: [amountWei],
              }),
            }
          ]
        });
        
        console.log('✅ Stake transaction submitted via sendCalls');
      } else {
        console.log('📝 Regular web context - using writeContract');
        
        // Use regular writeContract for web
        writeContract({
          address: CONTRACTS.STEAKNSTAKE as `0x${string}`,
          abi: STEAKNSTAKE_ABI,
          functionName: 'stake',
          args: [amountWei],
        });
        
        console.log('✅ Stake transaction submitted via writeContract');
      }
    } catch (err) {
      console.error('Stake failed:', err);
      setIsProcessing(false);
    }
  };

  const unstakeTokens = async (amount: string) => {
    if (!address) return;

    try {
      setIsProcessing(true);
      const amountWei = parseEther(amount);
      
      writeContract({
        address: CONTRACTS.STEAKNSTAKE as `0x${string}`,
        abi: STEAKNSTAKE_ABI,
        functionName: 'unstake',
        args: [amountWei],
      });
    } catch (err) {
      console.error('Unstake failed:', err);
      setIsProcessing(false);
    }
  };

  return {
    // State
    currentStep,
    isProcessing: isProcessing || isPending || isConfirming || callsPending,
    error: error || callsError,
    
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
    }
  };
}