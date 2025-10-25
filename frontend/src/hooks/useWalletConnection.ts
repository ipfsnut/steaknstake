'use client'

import { useConnect, useAccount, useDisconnect } from 'wagmi'
import { useSignIn, useProfile } from '@farcaster/auth-kit'
import { useState, useEffect } from 'react'

export function useWalletConnection() {
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  
  // Farcaster auth
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

  const connectWallet = async () => {
    try {
      // First try to connect a wallet
      const injectedConnector = connectors.find(c => c.id === 'injected')
      if (injectedConnector) {
        await connect({ connector: injectedConnector })
      }
    } catch (error) {
      console.error('Error connecting wallet:', error)
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
      // Connect wallet first
      await connectWallet()
      // Then sign in with Farcaster
      await connectFarcaster()
    } catch (error) {
      console.error('Error connecting both:', error)
    }
  }

  const disconnectAll = () => {
    disconnect()
    // Farcaster disconnect is handled automatically
    setFarcasterProfile(null)
  }

  return {
    // Wallet state
    walletAddress,
    isWalletConnected: isConnected,
    
    // Farcaster state
    farcasterProfile,
    isFarcasterSignedIn,
    isFarcasterLoading,
    
    // Connection functions
    connectWallet,
    connectFarcaster,
    connectBoth,
    disconnectAll,
    
    // Combined state
    isFullyConnected: isConnected && isFarcasterSignedIn,
  }
}