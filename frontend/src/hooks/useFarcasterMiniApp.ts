'use client';

import { useEffect, useState } from 'react';
import { sdk } from '@farcaster/miniapp-sdk'

export function useFarcasterMiniApp() {
  const [isReady, setIsReady] = useState(false)
  const [isMiniApp, setIsMiniApp] = useState(false)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const initializeMiniApp = async () => {
      console.log('🚀 Initializing Farcaster miniapp...')
      
      try {
        console.log('📱 Checking SDK context...')
        const context = await sdk.context
        console.log('🔍 SDK context result:', context)
        
        setIsMiniApp(!!context)
        
        if (context) {
          console.log('✅ In Farcaster context! User:', context.user)
          setUser(context.user)
          
          // Call ready() to hide splash screen and show content
          console.log('📞 Calling sdk.actions.ready()...')
          await sdk.actions.ready()
          console.log('✅ Ready callback completed!')
          setIsReady(true)
        } else {
          console.log('❌ Not in Farcaster context, running as regular web app')
          // Not in miniapp context, still set ready for regular web
          setIsReady(true)
        }
      } catch (error) {
        console.error('💥 Failed to initialize Farcaster miniapp:', error)
        console.error('Error details:', error instanceof Error ? error.message : String(error))
        // Fallback: set ready anyway
        console.log('🔄 Setting ready as fallback...')
        setIsReady(true)
      }
    }

    initializeMiniApp()
  }, [])

  const openUrl = async (url: string) => {
    if (isMiniApp) {
      try {
        await sdk.actions.openUrl(url)
      } catch (error) {
        console.error('Failed to open URL in miniapp:', error)
        window.open(url, '_blank')
      }
    } else {
      window.open(url, '_blank')
    }
  }

  const close = async () => {
    if (isMiniApp) {
      try {
        await sdk.actions.close()
      } catch (error) {
        console.error('Failed to close miniapp:', error)
      }
    }
  }

  return {
    isReady,
    isMiniApp,
    user,
    openUrl,
    close,
    sdk: isMiniApp ? sdk : null
  }
}