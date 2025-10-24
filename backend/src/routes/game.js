const express = require('express');
const router = express.Router();

// Mock game statistics
const mockGameStats = {
  totalPlayers: 157,
  treasuryBalance: '18.3 ETH',
  treasuryBalanceUSD: '$73,200',
  dailyDistribution: '6.1 ETH',
  nextDistribution: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(), // 6 hours from now
  totalDistributed: '234.7 ETH',
  averageDaily: '5.8 ETH',
  topTenEarning: 10,
  availableSpots: 0
};

// Mock top players for game overview
const generateTopPlayers = (count = 5) => {
  const topPlayers = [];
  const names = ['steaklord.eth', 'stakequeen.eth', 'cowhero.eth', 'meatking.eth', 'steakboss.eth'];
  
  for (let i = 1; i <= count; i++) {
    const daysAgo = Math.floor(Math.random() * 30) + 1;
    topPlayers.push({
      rank: i,
      address: `0x${i.toString().padStart(4, '0')}${'0'.repeat(36)}`,
      ensName: i <= names.length ? names[i-1] : null,
      stakedAmount: (150000 - (i-1) * 8000).toLocaleString(),
      stakedAmountRaw: 150000 - (i-1) * 8000,
      lockExpiry: new Date(Date.now() + (3 + i) * 24 * 60 * 60 * 1000).toISOString(),
      stakeDate: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
      estimatedDailyReward: `${(1.5 - (i-1) * 0.2).toFixed(2)} ETH`,
      totalEarned: `${((1.5 - (i-1) * 0.2) * daysAgo).toFixed(2)} ETH`,
      isActive: true
    });
  }
  
  return topPlayers;
};

// Mock recent game events
const generateRecentEvents = () => {
  const events = [];
  const eventTypes = ['stake', 'unstake', 'reward', 'rank_change'];
  const messages = {
    stake: 'staked tokens and joined the competition',
    unstake: 'unstaked tokens and left the game',
    reward: 'received daily rewards',
    rank_change: 'climbed in the rankings'
  };
  
  for (let i = 0; i < 8; i++) {
    const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
    const hoursAgo = Math.floor(Math.random() * 24) + 1;
    
    events.push({
      id: `event_${i}`,
      type: eventType,
      player: `0x${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}...${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
      message: messages[eventType],
      amount: eventType === 'stake' ? `${Math.floor(Math.random() * 50000) + 10000} STEAK` : 
              eventType === 'reward' ? `${(Math.random() * 2).toFixed(2)} ETH` : null,
      timestamp: new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString(),
      icon: eventType === 'stake' ? '🥩' : 
            eventType === 'unstake' ? '🔓' : 
            eventType === 'reward' ? '💰' : '📈'
    });
  }
  
  return events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
};

// GET /api/game/overview - Get game overview with stats and top players
router.get('/overview', (req, res) => {
  try {
    const topPlayers = generateTopPlayers(5);
    const recentEvents = generateRecentEvents();
    
    const mockOverview = {
      stats: mockGameStats,
      topPlayers,
      recentEvents,
      availableSpots: Math.max(0, 10 - topPlayers.length),
      competition: {
        status: 'active',
        season: 1,
        weekNumber: 3,
        daysRemaining: 4
      }
    };
    
    res.json({
      success: true,
      data: mockOverview
    });
  } catch (error) {
    console.error('Error fetching game overview:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch game overview'
    });
  }
});

// GET /api/game/stats - Get current game statistics
router.get('/stats', (req, res) => {
  try {
    res.json({
      success: true,
      data: mockGameStats
    });
  } catch (error) {
    console.error('Error fetching game stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch game statistics'
    });
  }
});

// GET /api/game/events - Get recent game events
router.get('/events', (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const events = generateRecentEvents().slice(0, parseInt(limit));
    
    res.json({
      success: true,
      data: {
        events,
        total: events.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching game events:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch game events'
    });
  }
});

// GET /api/game/competition - Get competition status
router.get('/competition', (req, res) => {
  try {
    const competition = {
      status: 'active',
      season: 1,
      startDate: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      weekNumber: 3,
      daysRemaining: 7,
      totalParticipants: mockGameStats.totalPlayers,
      totalPrizePool: '234.7 ETH',
      currentLeader: 'steaklord.eth',
      rules: {
        minStake: '1,000 STEAK',
        lockPeriod: '7 days',
        earlyUnstakePenalty: '5%',
        distributionTime: 'UTC Midnight',
        maxPlayers: 'Unlimited',
        topEarners: 10
      }
    };
    
    res.json({
      success: true,
      data: competition
    });
  } catch (error) {
    console.error('Error fetching competition info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch competition information'
    });
  }
});

// GET /api/game/prizes - Get prize distribution information
router.get('/prizes', (req, res) => {
  try {
    const prizes = {
      dailyDistribution: mockGameStats.dailyDistribution,
      treasuryPercentage: 33.33,
      distribution: [
        { rank: 1, percentage: 25, icon: '👑', title: 'Champion' },
        { rank: 2, percentage: 17, icon: '🥈', title: 'Runner-up' },
        { rank: 3, percentage: 14, icon: '🥉', title: 'Third Place' },
        { rank: 4, percentage: 12, icon: '🏅', title: 'Top Performer' },
        { rank: 5, percentage: 10, icon: '🏅', title: 'Top Performer' },
        { rank: 6, percentage: 8, icon: '🏅', title: 'Top Performer' },
        { rank: 7, percentage: 6, icon: '🏅', title: 'Top Performer' },
        { rank: 8, percentage: 4, icon: '🏅', title: 'Top Performer' },
        { rank: 9, percentage: 2, icon: '🏅', title: 'Top Performer' },
        { rank: 10, percentage: 2, icon: '🏅', title: 'Top Performer' }
      ],
      examples: {
        currentPool: mockGameStats.dailyDistribution,
        rank1Reward: (parseFloat(mockGameStats.dailyDistribution) * 0.25).toFixed(2) + ' ETH',
        rank2Reward: (parseFloat(mockGameStats.dailyDistribution) * 0.17).toFixed(2) + ' ETH',
        rank3Reward: (parseFloat(mockGameStats.dailyDistribution) * 0.14).toFixed(2) + ' ETH'
      }
    };
    
    res.json({
      success: true,
      data: prizes
    });
  } catch (error) {
    console.error('Error fetching prize info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch prize information'
    });
  }
});

module.exports = router;