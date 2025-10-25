'use client'

import { useConnect, useAccount, useDisconnect } from 'wagmi'
import { useSignIn, useProfile } from '@farcaster/auth-kit'
import { useState, useEffect } from 'react'
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

  const connectWallet = async () => {
    try {
      // Use Farcaster wallet connection in miniapp context
      if (isFarcasterContext) {
        console.log('🔌 Using Farcaster wallet connection...')
        return await connectFarcasterWallet()
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
      // Connect wallet first
      await connectWallet()
      // Then sign in with Farcaster
      await connectFarcaster()
    } catch (error) {
      console.error('Error connecting both:', error)
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