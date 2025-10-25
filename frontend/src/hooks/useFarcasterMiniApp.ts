'use client'

import { useEffect, useState } from 'react'
import { sdk } from '@farcaster/miniapp-sdk'

export function useFarcasterMiniApp() {
  const [isReady, setIsReady] = useState(false)
  const [isMiniApp, setIsMiniApp] = useState(false)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const initializeMiniApp = async () => {
      try {
        // Check if we're in a Farcaster context
        const context = await sdk.context
        setIsMiniApp(!!context)
        
        if (context) {
          setUser(context.user)
          
          // Call ready() to hide splash screen and show content
          await sdk.actions.ready()
          setIsReady(true)
        } else {
          // Not in miniapp context, still set ready for regular web
          setIsReady(true)
        }
      } catch (error) {
        console.error('Failed to initialize Farcaster miniapp:', error)
        // Fallback: set ready anyway
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