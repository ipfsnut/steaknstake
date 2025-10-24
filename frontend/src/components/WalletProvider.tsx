'use client'

import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { config } from '@/lib/wagmi'
import { AuthKitProvider } from '@farcaster/auth-kit'

const queryClient = new QueryClient()

const authKitConfig = {
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org',
  domain: process.env.NEXT_PUBLIC_DOMAIN || 'steak.epicdylan.com',
  siweUri: process.env.NEXT_PUBLIC_SIWE_URI || 'https://steak.epicdylan.com',
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <AuthKitProvider config={authKitConfig}>
          {children}
        </AuthKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}