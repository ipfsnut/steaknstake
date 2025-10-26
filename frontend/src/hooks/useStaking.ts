'use client';

import { useState, useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { CONTRACTS, ERC20_ABI, STEAKNSTAKE_ABI } from '@/lib/contracts';
import { useFarcasterWallet } from './useFarcasterWallet';
import { useFarcasterMiniApp } from './useFarcasterMiniApp';

export function useStaking() {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending, error } = useWriteContract();
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
    console.log('🚀 Starting approve flow...', { amount, address, isFarcasterContext });
    
    try {
      setIsProcessing(true);
      const amountWei = parseEther(amount);
      
      console.log('💰 Approving STEAK tokens:', {
        amount,
        amountWei: amountWei.toString(),
        tokenAddress: CONTRACTS.STEAK_TOKEN,
        spenderAddress: CONTRACTS.STEAKNSTAKE,
        userAddress: address,
        context: isFarcasterContext ? 'Farcaster' : 'Web'
      });

      // In Farcaster context, let the transaction proceed - Farcaster will handle wallet prompting
      console.log('📝 Using wagmi writeContract for approval (works in both web and Farcaster contexts)...');
      
      // Use wagmi writeContract - this should work with Farcaster connector
      writeContract({
        address: CONTRACTS.STEAK_TOKEN as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [CONTRACTS.STEAKNSTAKE as `0x${string}`, amountWei],
      });
      
      console.log('✅ Approve transaction submitted via wagmi');
      
      // In Farcaster context without address, we can't wait for confirmation normally
      // The useWaitForTransactionReceipt hook should still work with the hash
      if (isFarcasterContext && !address) {
        console.log('💫 Farcaster context: Approval submitted, will wait for confirmation via hash');
      }
      
    } catch (err) {
      console.error('❌ Approve failed:', err);
      setIsProcessing(false);
      throw err; // Re-throw so the UI can handle it
    }
  };

  const stakeTokens = async (amount: string) => {
    console.log('🚀 Starting stake flow...', { amount, address, isFarcasterContext });
    
    try {
      setIsProcessing(true);
      const amountWei = parseEther(amount);
      
      console.log('🥩 Staking STEAK tokens:', {
        amount,
        amountWei: amountWei.toString(),
        contractAddress: CONTRACTS.STEAKNSTAKE,
        userAddress: address,
        context: isFarcasterContext ? 'Farcaster' : 'Web'
      });

      console.log('📝 Using wagmi writeContract for staking (works in both web and Farcaster contexts)...');
      
      // Use wagmi writeContract - this should work with Farcaster connector
      writeContract({
        address: CONTRACTS.STEAKNSTAKE as `0x${string}`,
        abi: STEAKNSTAKE_ABI,
        functionName: 'stake',
        args: [amountWei],
      });
      console.log('✅ Stake transaction submitted via wagmi');
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
    isProcessing: isProcessing || isPending || isConfirming,
    error,
    
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