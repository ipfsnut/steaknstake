'use client'

import { sdk } from '@farcaster/miniapp-sdk'
import { parseEther, encodeFunctionData } from 'viem'
import { CONTRACTS, ERC20_ABI, STEAKNSTAKE_ABI } from './contracts'

export class FarcasterTransactionError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message)
    this.name = 'FarcasterTransactionError'
  }
}

export async function sendFarcasterTransaction(params: {
  to: string
  data: string
  value?: string
}) {
  try {
    console.log('🚀 Sending Farcaster transaction:', params)
    
    // Check if we're in a Farcaster context
    const context = await sdk.context
    if (!context) {
      throw new FarcasterTransactionError('Not in Farcaster miniapp context')
    }

    // Get the Ethereum provider from Farcaster
    const provider = await sdk.wallet.ethProvider.request({
      method: 'eth_sendTransaction',
      params: [{
        to: params.to as `0x${string}`,
        data: params.data as `0x${string}`,
        value: (params.value || '0x0') as `0x${string}`,
      }]
    })
    
    console.log('✅ Transaction sent via eth_sendTransaction:', provider)
    return provider

  } catch (error) {
    console.error('❌ Farcaster transaction failed:', error)
    throw new FarcasterTransactionError(
      `Transaction failed: ${error instanceof Error ? error.message : String(error)}`,
      error
    )
  }
}

export async function approveTokens(amount: string) {
  try {
    const amountWei = parseEther(amount)
    
    const data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [CONTRACTS.STEAKNSTAKE as `0x${string}`, amountWei],
    })
    
    return await sendFarcasterTransaction({
      to: CONTRACTS.STEAK_TOKEN,
      data,
    })
  } catch (error) {
    throw new FarcasterTransactionError('Failed to approve tokens', error)
  }
}

export async function stakeTokens(amount: string) {
  try {
    const amountWei = parseEther(amount)
    
    const data = encodeFunctionData({
      abi: STEAKNSTAKE_ABI,
      functionName: 'stake',
      args: [amountWei],
    })
    
    return await sendFarcasterTransaction({
      to: CONTRACTS.STEAKNSTAKE,
      data,
    })
  } catch (error) {
    throw new FarcasterTransactionError('Failed to stake tokens', error)
  }
}