'use client';

import { useState } from 'react';
import { useFarcasterMiniApp } from './useFarcasterMiniApp';

/**
 * Simplified Farcaster context handler - no external wallet connection needed
 * In Farcaster miniapps, we use the SDK for transactions, not wagmi
 */
export function useFarcasterWallet() {
  const { user, isMiniApp, isReady, sdk } = useFarcasterMiniApp();
  const [error, setError] = useState<string | null>(null);

  // In Farcaster miniapp, user is already authenticated through the context
  const isUserAuthenticated = isMiniApp && isReady && !!user;

  const getEthereumProvider = async () => {
    if (!isMiniApp || !sdk) {
      setError('Not in Farcaster miniapp context');
      return null;
    }

    try {
      // Check if wallet provider is available
      const capabilities = await sdk.getCapabilities();
      if (!capabilities.includes('wallet.getEthereumProvider')) {
        setError('Ethereum provider not available in this Farcaster client');
        return null;
      }

      // Get the Ethereum provider from Farcaster
      const provider = await sdk.wallet.getEthereumProvider();
      console.log('✅ Got Farcaster Ethereum provider:', provider);
      return provider;
    } catch (err) {
      console.error('Failed to get Ethereum provider:', err);
      setError(err instanceof Error ? err.message : 'Failed to get provider');
      return null;
    }
  };

  return {
    // State
    isFarcasterContext: isMiniApp,
    farcasterUser: user,
    isWalletConnected: isUserAuthenticated, // User is "connected" if authenticated in Farcaster
    walletAddress: user?.fid ? `farcaster:${user.fid}` : null, // Use FID as identifier
    isConnecting: false, // No connection process needed
    error,
    
    // Actions - simplified for Farcaster context
    connectFarcasterWallet: async () => {
      // No actual connection needed - user is already authenticated
      return isUserAuthenticated;
    },
    disconnectFarcasterWallet: async () => {
      // Can't disconnect from Farcaster context
      setError('Cannot disconnect from Farcaster context');
    },
    getEthereumProvider,
    
    // Utils
    clearError: () => setError(null),
  };
}