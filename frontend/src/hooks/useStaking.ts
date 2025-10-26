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

  // Check allowance for SteakNStake contract - skip in Farcaster context if no address
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: CONTRACTS.STEAK_TOKEN as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && CONTRACTS.STEAKNSTAKE ? [address, CONTRACTS.STEAKNSTAKE as `0x${string}`] : undefined,
    query: {
      enabled: !isFarcasterContext || !!address // Only run if not Farcaster context OR we have an address
    }
  });

  // Check user's STEAK balance - skip in Farcaster context if no address
  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: CONTRACTS.STEAK_TOKEN as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !isFarcasterContext || !!address // Only run if not Farcaster context OR we have an address
    }
  });

  // Check user's staked amount - skip in Farcaster context if no address
  const { data: stakedAmount, refetch: refetchStaked } = useReadContract({
    address: CONTRACTS.STEAKNSTAKE as `0x${string}`,
    abi: STEAKNSTAKE_ABI,
    functionName: 'stakedAmounts',
    args: address ? [address] : undefined,
    query: {
      enabled: !isFarcasterContext || !!address // Only run if not Farcaster context OR we have an address
    }
  });

  // Wait for transaction confirmation
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
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
      isPending
    });
    
    if (isConfirmed) {
      console.log('✅ Transaction confirmed! Refetching data...');
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
      if (isFarcasterContext && !address) {
        console.log('🔌 Farcaster context - proceeding with transaction, Farcaster will handle wallet');
      }
      
      if (isFarcasterContext && sdk) {
        // Use Farcaster wallet provider for transactions in miniapp
        console.log('📝 Using Farcaster wallet provider for approval transaction...');
        
        try {
          // Get the Ethereum provider from Farcaster
          const provider = await sdk.wallet.getEthereumProvider();
          if (!provider) {
            console.error('❌ No Farcaster wallet provider available');
            setIsProcessing(false);
            return;
          }

          // Encode approval function call data
          const approveCalldata = `0x095ea7b3${CONTRACTS.STEAKNSTAKE.slice(2).padStart(64, '0')}${amountWei.toString(16).padStart(64, '0')}`;
          
          console.log('📝 Submitting transaction to Farcaster wallet...');
          console.log('🔍 Provider details:', {
            hasProvider: !!provider,
            providerType: typeof provider,
            providerMethods: Object.getOwnPropertyNames(provider)
          });
          
          // Check if provider.request is actually a function
          if (!provider.request || typeof provider.request !== 'function') {
            throw new Error('Farcaster provider.request is not a function. Provider may not be properly initialized.');
          }
          
          console.log('📋 Transaction params:', {
            to: CONTRACTS.STEAK_TOKEN,
            data: approveCalldata,
            value: '0x0'
          });
          
          const txHash = await provider.request({
            method: 'eth_sendTransaction',
            params: [{
              to: CONTRACTS.STEAK_TOKEN as `0x${string}`,
              data: approveCalldata as `0x${string}`,
              value: '0x0',
            }]
          }) as string;
          
          if (!txHash) {
            throw new Error('Farcaster wallet returned empty transaction hash. Transaction may have been rejected.');
          }
          
          if (!txHash.startsWith('0x')) {
            throw new Error(`Farcaster wallet returned invalid transaction hash format: ${txHash}`);
          }
          
          console.log('✅ Farcaster approval transaction submitted:', txHash);
          
          // Transaction submitted successfully - refetch data and unlock UI
          setTimeout(() => {
            refetchAllowance();
            refetchBalance();
            setIsProcessing(false);
          }, 3000);
        } catch (sdkError) {
          console.error('❌ Farcaster wallet provider error:', sdkError);
          
          // Check if user canceled or if it's a timeout
          const errorMessage = (sdkError as Error)?.message || '';
          if (errorMessage.includes('timeout')) {
            console.log('⏰ Transaction request timed out - user may have canceled');
          } else if (errorMessage.includes('rejected') || errorMessage.includes('denied')) {
            console.log('❌ User rejected the transaction');
          } else {
            console.log('🔄 Unknown error, trying to refetch data anyway...');
            // Still try to refetch in case transaction succeeded
            setTimeout(() => {
              refetchAllowance();
              refetchBalance();
            }, 2000);
          }
          
          setIsProcessing(false);
        }
      } else if (address) {
        // Use wagmi for regular web context
        console.log('📝 Calling writeContract for approval...');
        await writeContract({
          address: CONTRACTS.STEAK_TOKEN as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [CONTRACTS.STEAKNSTAKE as `0x${string}`, amountWei],
        });
        console.log('✅ Approve transaction submitted');
      } else {
        console.error('No wallet connection available');
        setIsProcessing(false);
      }
    } catch (err) {
      console.error('Approve failed:', err);
      setIsProcessing(false);
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

      // In Farcaster context, let the transaction proceed - Farcaster will handle wallet prompting
      if (isFarcasterContext && !address) {
        console.log('🔌 Farcaster context - proceeding with transaction, Farcaster will handle wallet');
      }
      
      if (isFarcasterContext && sdk) {
        // Use Farcaster wallet provider for transactions in miniapp
        console.log('📝 Using Farcaster wallet provider for stake transaction...');
        
        try {
          // Get the Ethereum provider from Farcaster
          const provider = await sdk.wallet.getEthereumProvider();
          if (!provider) {
            console.error('❌ No Farcaster wallet provider available');
            setIsProcessing(false);
            return;
          }

          // Encode stake function call data: stake(uint256)
          const stakeCalldata = `0xa694fc3a${amountWei.toString(16).padStart(64, '0')}`;
          
          console.log('📝 Submitting stake transaction to Farcaster wallet...');
          
          // Check if provider.request is actually a function
          if (!provider.request || typeof provider.request !== 'function') {
            throw new Error('Farcaster provider.request is not a function. Provider may not be properly initialized.');
          }
          
          console.log('📋 Stake transaction params:', {
            to: CONTRACTS.STEAKNSTAKE,
            data: stakeCalldata,
            value: '0x0'
          });
          
          const txHash = await provider.request({
            method: 'eth_sendTransaction',
            params: [{
              to: CONTRACTS.STEAKNSTAKE as `0x${string}`,
              data: stakeCalldata as `0x${string}`,
              value: '0x0',
            }]
          }) as string;
          
          if (!txHash) {
            throw new Error('Farcaster wallet returned empty transaction hash. Transaction may have been rejected.');
          }
          
          if (!txHash.startsWith('0x')) {
            throw new Error(`Farcaster wallet returned invalid transaction hash format: ${txHash}`);
          }
          
          console.log('✅ Farcaster stake transaction submitted:', txHash);
          
          // Transaction submitted successfully - refetch data and unlock UI
          setTimeout(() => {
            refetchAllowance();
            refetchBalance();
            refetchStaked();
            setIsProcessing(false);
          }, 3000);
        } catch (sdkError) {
          console.error('❌ Farcaster wallet provider error:', sdkError);
          
          // Check if user canceled or if it's a timeout
          const errorMessage = (sdkError as Error)?.message || '';
          if (errorMessage.includes('timeout')) {
            console.log('⏰ Transaction request timed out - user may have canceled');
          } else if (errorMessage.includes('rejected') || errorMessage.includes('denied')) {
            console.log('❌ User rejected the transaction');
          } else {
            console.log('🔄 Unknown error, trying to refetch data anyway...');
            // Still try to refetch in case transaction succeeded
            setTimeout(() => {
              refetchAllowance();
              refetchBalance();
              refetchStaked();
            }, 2000);
          }
          
          setIsProcessing(false);
        }
      } else if (address) {
        // Use wagmi for regular web context
        console.log('📝 Calling writeContract for staking...');
        await writeContract({
          address: CONTRACTS.STEAKNSTAKE as `0x${string}`,
          abi: STEAKNSTAKE_ABI,
          functionName: 'stake',
          args: [amountWei],
        });
        console.log('✅ Stake transaction submitted');
      } else {
        console.error('No wallet connection available');
        setIsProcessing(false);
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