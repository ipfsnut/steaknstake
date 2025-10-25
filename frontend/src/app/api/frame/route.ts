import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-static'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    
    // Verify the frame interaction
    const { trustedData, untrustedData } = body
    
    // For now, just redirect to the main app
    return NextResponse.json({
      type: 'frame',
      frameData: {
        buttons: [
          {
            label: 'Open SteakNStake',
            action: 'link',
            target: 'https://steak.epicdylan.com'
          }
        ],
        image: 'https://steak.epicdylan.com/SteakNStake.png',
        input: {
          text: 'Enter amount to stake'
        },
        postUrl: 'https://steak.epicdylan.com/api/frame'
      }
    })
  } catch (error) {
    console.error('Frame API error:', error)
    return NextResponse.json({ error: 'Invalid frame request' }, { status: 400 })
  }
}

export async function GET() {
  // Return frame metadata for GET requests
  return NextResponse.json({
    name: 'SteakNStake',
    description: 'Social staking meets Farcaster tipping',
    image: 'https://steak.epicdylan.com/SteakNStake.png',
    url: 'https://steak.epicdylan.com'
  })
}