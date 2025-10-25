import type { Metadata } from 'next';
import './globals.css';
import { WalletProvider } from '@/components/WalletProvider';
import { FarcasterGate } from '@/components/FarcasterGate';

export const metadata: Metadata = {
  metadataBase: new URL('https://steak.epicdylan.com'),
  title: 'SteakNStake - Social Staking meets Farcaster Tipping',
  description: 'Stake $STEAK tokens, earn rewards, and tip your favorite Farcaster creators. Your rewards can only be given away - not claimed!',
  keywords: ['staking', 'farcaster', 'social', 'tipping', 'web3', 'crypto', 'rewards'],
  authors: [{ name: 'SteakNStake Team' }],
  icons: {
    icon: '/SteakNStake.png',
    shortcut: '/SteakNStake.png',
    apple: '/SteakNStake.png',
  },
  manifest: '/manifest.json',
  openGraph: {
    title: 'SteakNStake - Social Staking meets Farcaster Tipping',
    description: 'Stake $STEAK tokens, earn rewards, and tip your favorite Farcaster creators. Your rewards can only be given away - not claimed!',
    url: 'https://steak.epicdylan.com',
    siteName: 'SteakNStake',
    images: [
      {
        url: '/SteakNStake.png',
        width: 800,
        height: 600,
        alt: 'SteakNStake Logo',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SteakNStake - Social Staking meets Farcaster Tipping',
    description: 'Stake $STEAK tokens, earn rewards, and tip your favorite Farcaster creators.',
    images: ['/SteakNStake.png'],
  },
  other: {
    // Farcaster Frame metadata
    'fc:frame': 'vNext',
    'fc:frame:image': 'https://steak.epicdylan.com/SteakNStake.png',
    'fc:frame:image:aspect_ratio': '1.91:1',
    'fc:frame:button:1': 'Open SteakNStake',
    'fc:frame:button:1:action': 'link',
    'fc:frame:button:1:target': 'https://steak.epicdylan.com',
    'fc:frame:post_url': 'https://steak.epicdylan.com/api/frame',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <WalletProvider>
          <FarcasterGate>
            {children}
          </FarcasterGate>
        </WalletProvider>
      </body>
    </html>
  );
}