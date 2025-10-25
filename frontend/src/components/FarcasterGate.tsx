'use client'

import { useEffect, useState } from 'react'

interface FarcasterGateProps {
  children: React.ReactNode
}

export function FarcasterGate({ children }: FarcasterGateProps) {
  const [isFarcaster, setIsFarcaster] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Check if we're in a Farcaster frame or mobile app
    const checkFarcasterContext = () => {
      // Check for Farcaster frame context
      const isFrame = window?.parent !== window
      
      // Check for Farcaster mobile app user agent
      const userAgent = navigator.userAgent.toLowerCase()
      const isFarcasterApp = userAgent.includes('farcaster') || userAgent.includes('warpcast')
      
      // Check for frame postMessage API
      const hasFrameAPI = typeof window !== 'undefined' && window.parent !== window
      
      // For development, allow localhost and pages.dev
      const isDev = window.location.hostname === 'localhost' || 
                   window.location.hostname === '127.0.0.1' ||
                   window.location.hostname.includes('pages.dev')
      
      // Check URL parameters that might indicate Farcaster context
      const urlParams = new URLSearchParams(window.location.search)
      const hasFarcasterParams = urlParams.has('fc_frame') || urlParams.has('farcaster')
      
      return isFrame || isFarcasterApp || hasFrameAPI || isDev || hasFarcasterParams
    }

    setIsFarcaster(checkFarcasterContext())
    setIsLoading(false)
  }, [])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-500 rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-2xl">🥩</span>
          </div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isFarcaster) {
    return <ComingSoonPage />
  }

  return <>{children}</>
}

function ComingSoonPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-4">
      <div className="max-w-md mx-auto text-center">
        {/* Logo */}
        <div className="w-24 h-24 bg-red-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
          <span className="text-white text-4xl">🥩</span>
        </div>
        
        {/* Title */}
        <h1 className="text-4xl font-black text-red-600 mb-4">
          SteakNStake
        </h1>
        
        {/* Subtitle */}
        <p className="text-xl text-gray-700 mb-6">
          Social Staking meets Farcaster Tipping
        </p>
        
        {/* Coming Soon Message */}
        <div className="bg-white rounded-xl p-6 shadow-lg mb-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-3">
            🚀 Coming Soon
          </h2>
          <p className="text-gray-600 mb-4">
            SteakNStake is exclusively available within the Farcaster ecosystem.
          </p>
          <p className="text-sm text-gray-500">
            Access SteakNStake through Warpcast or other Farcaster clients to stake $STEAK and tip your favorite creators!
          </p>
        </div>
        
        {/* Call to Action */}
        <div className="space-y-3">
          <a 
            href="https://warpcast.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="block w-full bg-purple-500 hover:bg-purple-600 text-white font-bold py-3 px-6 rounded-lg transition-colors"
          >
            📱 Get Warpcast
          </a>
          <a 
            href="https://farcaster.xyz" 
            target="_blank" 
            rel="noopener noreferrer"
            className="block w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-lg transition-colors"
          >
            🌐 Learn about Farcaster
          </a>
        </div>
        
        {/* Footer */}
        <div className="mt-8 text-xs text-gray-500">
          <p>Built for the Farcaster community</p>
          <p className="mt-1">🥩 Stake, Earn, Tip, Repeat</p>
        </div>
      </div>
    </div>
  )
}