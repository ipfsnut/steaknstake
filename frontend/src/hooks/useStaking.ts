'use client';

import { useState, useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { CONTRACTS, ERC20_ABI, STEAKNSTAKE_ABI } from '@/lib/contracts';

export function useStaking() {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const [currentStep, setCurrentStep] = useState<'approve' | 'stake' | 'completed'>('approve');
  const [isProcessing, setIsProcessing] = useState(false);

  // Check allowance for SteakNStake contract
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: CONTRACTS.STEAK_TOKEN as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && CONTRACTS.STEAKNSTAKE ? [address, CONTRACTS.STEAKNSTAKE as `0x${string}`] : undefined,
  });

  // Check user's STEAK balance
  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: CONTRACTS.STEAK_TOKEN as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
  });

  // Check user's staked amount
  const { data: stakedAmount, refetch: refetchStaked } = useReadContract({
    address: CONTRACTS.STEAKNSTAKE as `0x${string}`,
    abi: STEAKNSTAKE_ABI,
    functionName: 'stakedAmounts',
    args: address ? [address] : undefined,
  });

  // Wait for transaction confirmation
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  // Update step based on allowance
  useEffect(() => {
    if (allowance && allowance > BigInt(0)) {
      setCurrentStep('stake');
    } else {
      setCurrentStep('approve');
    }
  }, [allowance]);

  // Handle transaction confirmation
  useEffect(() => {
    if (isConfirmed) {
      setIsProcessing(false);
      refetchAllowance();
      refetchBalance();
      refetchStaked();
      
      if (currentStep === 'stake') {
        setCurrentStep('completed');
        // Reset to approve step after a delay
        setTimeout(() => setCurrentStep('approve'), 3000);
      }
    }
  }, [isConfirmed, currentStep, refetchAllowance, refetchBalance, refetchStaked]);

  const approveSteak = async (amount: string) => {
    if (!address) return;

    try {
      setIsProcessing(true);
      const amountWei = parseEther(amount);
      
      writeContract({
        address: CONTRACTS.STEAK_TOKEN as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [CONTRACTS.STEAKNSTAKE as `0x${string}`, amountWei],
      });
    } catch (err) {
      console.error('Approve failed:', err);
      setIsProcessing(false);
    }
  };

  const stakeTokens = async (amount: string) => {
    if (!address) return;

    try {
      setIsProcessing(true);
      const amountWei = parseEther(amount);
      
      writeContract({
        address: CONTRACTS.STEAKNSTAKE as `0x${string}`,
        abi: STEAKNSTAKE_ABI,
        functionName: 'stake',
        args: [amountWei],
      });
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