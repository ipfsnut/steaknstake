const express = require('express');
const router = express.Router();
const { calculateLeaderboardWithDecay, calculateEffectiveStake, getDecaySystemInfo } = require('../utils/decay-calculator');

// Mock leaderboard data with varied stake ages for decay demonstration
const generateMockLeaderboard = () => {
  const players = [];
  const baseNames = ['steaklord', 'stakequeen', 'cowhero', 'meatking', 'steakboss'];
  
  // Create players with different stake ages to show decay effects
  const stakeAges = [2, 8, 15, 22, 29, 36, 12, 5, 18, 25, 10, 32, 3, 14, 28]; // Days ago
  
  for (let i = 1; i <= 15; i++) {
    const daysAgo = stakeAges[i-1];
    players.push({
      address: `0x${i.toString().padStart(4, '0')}${'0'.repeat(36)}`,
      ensName: i <= 5 ? `${baseNames[i-1]}.eth` : null,
      stakedAmount: (125000 - (i-1) * 7500).toLocaleString(),
      stakedAmountRaw: 125000 - (i-1) * 7500,
      lockExpiry: new Date(Date.now() + (2 + i) * 24 * 60 * 60 * 1000).toISOString(),
      stakeDate: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
      totalEarned: `${((1.35 - (i-1) * 0.1) * (5 + i)).toFixed(2)} ETH`
    });
  }
  
  // Apply decay calculations and re-rank
  return calculateLeaderboardWithDecay(players);
};

// Mock distribution history
const generateMockDistributions = () => {
  const distributions = [];
  for (let i = 0; i < 10; i++) {
    distributions.push({
      date: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
      rank: Math.floor(Math.random() * 10) + 1,
      reward: `${(Math.random() * 1.5 + 0.3).toFixed(2)} ETH`,
      address: `0x${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}...${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
      totalDistributed: `${(Math.random() * 2 + 8).toFixed(2)} ETH`
    });
  }
  return distributions.sort((a, b) => new Date(b.date) - new Date(a.date));
};

// GET /api/leaderboard - Get full leaderboard
router.get('/', (req, res) => {
  try {
    const { filter, sort, limit } = req.query;
    let leaderboard = generateMockLeaderboard();
    
    // Apply filters
    if (filter === 'top10') {
      leaderboard = leaderboard.filter(p => p.rank <= 10);
    } else if (filter === 'active') {
      leaderboard = leaderboard.filter(p => new Date(p.lockExpiry) > new Date());
    } else if (filter === 'earning') {
      leaderboard = leaderboard.filter(p => p.isTopTen);
    }
    
    // Apply sorting
    if (sort === 'amount') {
      leaderboard.sort((a, b) => b.stakedAmountRaw - a.stakedAmountRaw);
    } else if (sort === 'earnings') {
      leaderboard.sort((a, b) => parseFloat(b.totalEarned) - parseFloat(a.totalEarned));
    } else if (sort === 'recent') {
      leaderboard.sort((a, b) => new Date(b.stakeDate) - new Date(a.stakeDate));
    }
    // Default is rank order (already sorted)
    
    // Apply limit
    if (limit) {
      leaderboard = leaderboard.slice(0, parseInt(limit));
    }
    
    const stats = {
      totalPlayers: 15,
      activeStakers: leaderboard.filter(p => new Date(p.lockExpiry) > new Date()).length,
      earningPlayers: leaderboard.filter(p => p.isTopTen).length,
      totalStaked: leaderboard.reduce((sum, p) => sum + p.stakedAmountRaw, 0).toLocaleString()
    };
    
    res.json({
      success: true,
      data: {
        leaderboard,
        stats,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch leaderboard'
    });
  }
});

// GET /api/leaderboard/top/:count - Get top N players
router.get('/top/:count', (req, res) => {
  try {
    const count = Math.min(parseInt(req.params.count) || 10, 15);
    const leaderboard = generateMockLeaderboard().slice(0, count);
    
    res.json({
      success: true,
      data: leaderboard
    });
  } catch (error) {
    console.error('Error fetching top players:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch top players'
    });
  }
});

// GET /api/leaderboard/player/:address - Get specific player position
router.get('/player/:address', (req, res) => {
  try {
    const { address } = req.params;
    const leaderboard = generateMockLeaderboard();
    
    // Mock player lookup (in real implementation, query by address)
    const player = leaderboard.find(p => 
      p.address.toLowerCase() === address.toLowerCase()
    ) || {
      rank: null,
      address: address,
      stakedAmount: '0',
      stakedAmountRaw: 0,
      lockExpiry: null,
      stakeDate: null,
      dailyReward: '0 ETH',
      totalEarned: '0 ETH',
      isTopTen: false
    };
    
    // Add context about nearby players if ranked
    let context = null;
    if (player.rank) {
      const above = leaderboard.find(p => p.rank === player.rank - 1);
      const below = leaderboard.find(p => p.rank === player.rank + 1);
      context = { above, below };
    }
    
    res.json({
      success: true,
      data: {
        player,
        context,
        needToClimb: player.rank ? player.rank - 1 : 'Need to stake',
        stakeDifference: player.rank && player.rank > 1 ? 
          leaderboard[0].stakedAmountRaw - player.stakedAmountRaw : 0
      }
    });
  } catch (error) {
    console.error('Error fetching player position:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch player position'
    });
  }
});

// GET /api/leaderboard/history - Get recent distribution history
router.get('/history', (req, res) => {
  try {
    const { days = 7 } = req.query;
    const distributions = generateMockDistributions().slice(0, parseInt(days));
    
    res.json({
      success: true,
      data: {
        distributions,
        totalDistributed: distributions.reduce((sum, d) => 
          sum + parseFloat(d.totalDistributed), 0
        ).toFixed(2) + ' ETH',
        averageDaily: (distributions.reduce((sum, d) => 
          sum + parseFloat(d.totalDistributed), 0
        ) / distributions.length).toFixed(2) + ' ETH',
        period: `Last ${days} days`
      }
    });
  } catch (error) {
    console.error('Error fetching distribution history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch distribution history'
    });
  }
});

// GET /api/leaderboard/decay-info - Get decay system information
router.get('/decay-info', (req, res) => {
  try {
    const decayInfo = getDecaySystemInfo();
    res.json({
      success: true,
      data: decayInfo
    });
  } catch (error) {
    console.error('Error fetching decay info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch decay information'
    });
  }
});

module.exports = router;