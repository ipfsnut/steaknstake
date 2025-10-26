'use client';

import { useConnect, useAccount, useDisconnect } from 'wagmi';
import { useSignIn, useProfile } from '@farcaster/auth-kit';
import { useEffect, useState } from 'react';
import { useFarcasterWallet } from './useFarcasterWallet'

export function useWalletConnection() {
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  
  // Farcaster wallet integration for miniapp context
  const { 
    isFarcasterContext, 
    isWalletConnected: isFarcasterWalletConnected, 
    connectFarcasterWallet,
    disconnectFarcasterWallet,
    farcasterUser
  } = useFarcasterWallet()
  
  // Farcaster auth (for non-miniapp context)
  const { signIn, isSuccess: isFarcasterSignedIn, isError: isFarcasterError } = useSignIn({
    nonce: crypto.randomUUID(),
    notBefore: new Date().toISOString(),
    expirationTime: new Date(Date.now() + 60000).toISOString(),
  })
  const { profile } = useProfile()
  const [isFarcasterLoading, setIsFarcasterLoading] = useState(false)
  
  const [walletAddress, setWalletAddress] = useState<string>('')
  const [farcasterProfile, setFarcasterProfile] = useState<any>(null)

  useEffect(() => {
    if (isConnected && address) {
      setWalletAddress(address)
    } else {
      setWalletAddress('')
    }
  }, [isConnected, address])

  useEffect(() => {
    if (profile) {
      setFarcasterProfile(profile)
    }
  }, [profile])

  // Auto-connect Farcaster wallet in miniapp context
  useEffect(() => {
    const autoConnectFarcaster = async () => {
      if (isFarcasterContext && !isConnected) {
        console.log('🔄 Auto-connecting Farcaster wallet...')
        // Try multiple possible connector IDs for Farcaster
        const possibleIds = ['farcasterMiniApp', 'farcaster', 'miniapp', 'embedded'];
        let farcasterConnector = null;
        
        for (const id of possibleIds) {
          farcasterConnector = connectors.find(c => c.id === id);
          if (farcasterConnector) break;
        }
        
        // If no exact match, try finding by name or type
        if (!farcasterConnector) {
          farcasterConnector = connectors.find(c => 
            c.name?.toLowerCase().includes('farcaster') ||
            c.type?.toLowerCase().includes('farcaster') ||
            c.type?.toLowerCase().includes('miniapp')
          );
        }
        if (farcasterConnector) {
          try {
            await connect({ connector: farcasterConnector })
            console.log('✅ Farcaster wallet auto-connected')
          } catch (error) {
            console.log('⚠️ Farcaster auto-connect failed:', error)
          }
        }
      }
    }

    // Small delay to ensure connectors are ready
    const timer = setTimeout(autoConnectFarcaster, 500)
    return () => clearTimeout(timer)
  }, [isFarcasterContext, isConnected, connectors, connect])

  const connectWallet = async () => {
    try {
      // Use Farcaster connector in miniapp context
      if (isFarcasterContext) {
        console.log('🔌 Using Farcaster wagmi connector...')
        // Try multiple possible connector IDs for Farcaster
        const possibleIds = ['farcasterMiniApp', 'farcaster', 'miniapp', 'embedded'];
        let farcasterConnector = null;
        
        for (const id of possibleIds) {
          farcasterConnector = connectors.find(c => c.id === id);
          if (farcasterConnector) break;
        }
        
        // If no exact match, try finding by name or type
        if (!farcasterConnector) {
          farcasterConnector = connectors.find(c => 
            c.name?.toLowerCase().includes('farcaster') ||
            c.type?.toLowerCase().includes('farcaster') ||
            c.type?.toLowerCase().includes('miniapp')
          );
        }
        if (farcasterConnector) {
          await connect({ connector: farcasterConnector })
          return true
        } else {
          console.log('🔄 Fallback: Using Farcaster wallet connection...')
          return await connectFarcasterWallet()
        }
      } else {
        // Regular wallet connection for web
        console.log('🔌 Using regular wallet connection...')
        const injectedConnector = connectors.find(c => c.id === 'injected')
        if (injectedConnector) {
          await connect({ connector: injectedConnector })
          return true
        }
        return false
      }
    } catch (error) {
      console.error('Error connecting wallet:', error)
      return false
    }
  }

  const connectFarcaster = async () => {
    try {
      setIsFarcasterLoading(true)
      signIn() // Note: signIn might not be async in this version
    } catch (error) {
      console.error('Error connecting Farcaster:', error)
    } finally {
      setIsFarcasterLoading(false)
    }
  }

  const connectBoth = async () => {
    try {
      // Just connect wallet - don't force Farcaster unless in miniapp
      if (isFarcasterContext) {
        await connectWallet()
        await connectFarcaster()
      } else {
        await connectWallet()
      }
    } catch (error) {
      console.error('Error connecting:', error)
    }
  }

  const disconnectAll = () => {
    if (isFarcasterContext) {
      disconnectFarcasterWallet()
    } else {
      disconnect()
    }
    // Farcaster disconnect is handled automatically
    setFarcasterProfile(null)
  }

  return {
    // Wallet state (unified for both contexts)
    walletAddress,
    isWalletConnected: isFarcasterContext ? isFarcasterWalletConnected : isConnected,
    
    // Farcaster state
    farcasterProfile: isFarcasterContext ? farcasterUser : profile,
    isFarcasterSignedIn: isFarcasterContext ? !!farcasterUser : isFarcasterSignedIn,
    isFarcasterLoading,
    
    // Context detection
    isFarcasterContext,
    
    // Connection functions
    connectWallet,
    connectFarcaster,
    connectBoth,
    disconnectAll,
    
    // Combined state
    isFullyConnected: isFarcasterContext 
      ? isFarcasterWalletConnected && !!farcasterUser
      : isConnected && isFarcasterSignedIn,
  }
}