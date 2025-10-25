'use client';

import { useEffect, useState } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { useFarcasterMiniApp } from './useFarcasterMiniApp';

/**
 * Bridge between Farcaster miniapp context and Wagmi wallet connection
 */
export function useFarcasterWallet() {
  const { user, isMiniApp, isReady } = useFarcasterMiniApp();
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-connect in Farcaster miniapp context
  useEffect(() => {
    const autoConnect = async () => {
      if (!isMiniApp || !isReady || !user || isConnected || isConnecting) return;

      try {
        setIsConnecting(true);
        setError(null);

        // Look for injected connector first (Coinbase, MetaMask, etc)
        const injectedConnector = connectors.find(
          connector => connector.id === 'injected' && connector.ready
        );

        if (injectedConnector) {
          console.log('🔌 Connecting Farcaster wallet via injected connector...');
          await connect({ connector: injectedConnector });
        } else {
          // Fallback to WalletConnect if no injected wallet
          const walletConnectConnector = connectors.find(
            connector => connector.id === 'walletConnect'
          );
          
          if (walletConnectConnector) {
            console.log('🔌 Connecting Farcaster wallet via WalletConnect...');
            await connect({ connector: walletConnectConnector });
          } else {
            setError('No wallet connector available in Farcaster miniapp');
          }
        }
      } catch (err) {
        console.error('Failed to connect Farcaster wallet:', err);
        setError(err instanceof Error ? err.message : 'Failed to connect wallet');
      } finally {
        setIsConnecting(false);
      }
    };

    // Small delay to ensure SDK is ready
    const timer = setTimeout(autoConnect, 500);
    return () => clearTimeout(timer);
  }, [isMiniApp, isReady, user, isConnected, isConnecting, connect, connectors]);

  const connectFarcasterWallet = async () => {
    if (!isMiniApp) {
      setError('Not in Farcaster miniapp context');
      return false;
    }

    if (!user) {
      setError('Farcaster user not authenticated');
      return false;
    }

    try {
      setIsConnecting(true);
      setError(null);

      // Try injected connector first
      const injectedConnector = connectors.find(
        connector => connector.id === 'injected' && connector.ready
      );

      if (injectedConnector) {
        await connect({ connector: injectedConnector });
        return true;
      }

      // Fallback to WalletConnect
      const walletConnectConnector = connectors.find(
        connector => connector.id === 'walletConnect'
      );

      if (walletConnectConnector) {
        await connect({ connector: walletConnectConnector });
        return true;
      }

      setError('No suitable wallet connector found');
      return false;
    } catch (err) {
      console.error('Manual wallet connection failed:', err);
      setError(err instanceof Error ? err.message : 'Connection failed');
      return false;
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectFarcasterWallet = async () => {
    try {
      await disconnect();
      setError(null);
    } catch (err) {
      console.error('Failed to disconnect wallet:', err);
      setError(err instanceof Error ? err.message : 'Disconnect failed');
    }
  };

  return {
    // State
    isFarcasterContext: isMiniApp,
    farcasterUser: user,
    isWalletConnected: isConnected && !!address,
    walletAddress: address,
    isConnecting,
    error,
    
    // Actions
    connectFarcasterWallet,
    disconnectFarcasterWallet,
    
    // Utils
    clearError: () => setError(null),
  };
}