const express = require('express');
const router = express.Router();

// Mock treasury data
const mockTreasuryData = {
  currentBalance: '18.3 ETH',
  currentBalanceUSD: '$73,200',
  dailyDistribution: '6.1 ETH',
  distributionPercentage: 33.33,
  nextDistribution: new Date(Date.now() + 6 * 60 * 60 * 1000),
  totalDistributed: '234.7 ETH',
  averageDaily: '5.8 ETH',
  fundingSources: {
    tradingFees: '3%',
    entryFees: '1%',
    penaltyFees: '5%',
    manualTopUps: 'As needed'
  }
};

// Mock recent distributions
const generateRecentDistributions = () => {
  const distributions = [];
  for (let i = 0; i < 14; i++) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    distributions.push({
      date: date.toISOString(),
      amount: `${(Math.random() * 3 + 4).toFixed(2)} ETH`,
      amountUSD: `$${(Math.random() * 12000 + 16000).toFixed(0)}`,
      recipients: 10,
      treasuryBalanceBefore: `${(Math.random() * 5 + 18).toFixed(2)} ETH`,
      treasuryBalanceAfter: `${(Math.random() * 5 + 12).toFixed(2)} ETH`,
      transactionHash: '0x' + Math.random().toString(16).substring(2, 66)
    });
  }
  return distributions;
};

// Mock funding sources with recent deposits
const generateFundingData = () => {
  const recentDeposits = [];
  for (let i = 0; i < 10; i++) {
    const hoursAgo = Math.floor(Math.random() * 48) + 1;
    const sources = ['Trading Fees', 'Entry Fees', 'Penalty Fees', 'Manual Top-up'];
    const source = sources[Math.floor(Math.random() * sources.length)];
    
    recentDeposits.push({
      date: new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString(),
      amount: `${(Math.random() * 0.5 + 0.1).toFixed(3)} ETH`,
      source,
      transactionHash: '0x' + Math.random().toString(16).substring(2, 66)
    });
  }
  
  return recentDeposits.sort((a, b) => new Date(b.date) - new Date(a.date));
};

// GET /api/treasury - Get current treasury status
router.get('/', (req, res) => {
  try {
    res.json({
      success: true,
      data: mockTreasuryData
    });
  } catch (error) {
    console.error('Error fetching treasury data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch treasury data'
    });
  }
});

// GET /api/treasury/balance - Get current balance only
router.get('/balance', (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        balance: mockTreasuryData.currentBalance,
        balanceUSD: mockTreasuryData.currentBalanceUSD,
        lastUpdate: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching treasury balance:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch treasury balance'
    });
  }
});

// GET /api/treasury/distribution/next - Get next distribution info
router.get('/distribution/next', (req, res) => {
  try {
    const nextAmount = parseFloat(mockTreasuryData.currentBalance.split(' ')[0]) / 3;
    
    res.json({
      success: true,
      data: {
        scheduledAt: mockTreasuryData.nextDistribution.toISOString(),
        estimatedAmount: `${nextAmount.toFixed(2)} ETH`,
        estimatedAmountUSD: `$${(nextAmount * 4000).toFixed(0)}`,
        recipients: 10,
        timeRemaining: mockTreasuryData.nextDistribution.getTime() - Date.now(),
        percentage: mockTreasuryData.distributionPercentage,
        breakdown: [
          { rank: 1, percentage: 25, amount: `${(nextAmount * 0.25).toFixed(2)} ETH` },
          { rank: 2, percentage: 17, amount: `${(nextAmount * 0.17).toFixed(2)} ETH` },
          { rank: 3, percentage: 14, amount: `${(nextAmount * 0.14).toFixed(2)} ETH` },
          { rank: '4-10', percentage: 44, amount: `${(nextAmount * 0.44).toFixed(2)} ETH` }
        ]
      }
    });
  } catch (error) {
    console.error('Error fetching next distribution:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch next distribution info'
    });
  }
});

// GET /api/treasury/history - Get distribution history
router.get('/history', (req, res) => {
  try {
    const { days = 14 } = req.query;
    const distributions = generateRecentDistributions().slice(0, parseInt(days));
    
    const stats = {
      totalDistributed: distributions.reduce((sum, d) => 
        sum + parseFloat(d.amount.split(' ')[0]), 0
      ).toFixed(2) + ' ETH',
      averageDaily: (distributions.reduce((sum, d) => 
        sum + parseFloat(d.amount.split(' ')[0]), 0
      ) / distributions.length).toFixed(2) + ' ETH',
      totalRecipients: distributions.reduce((sum, d) => sum + d.recipients, 0),
      period: `Last ${days} days`,
      largestDistribution: Math.max(...distributions.map(d => parseFloat(d.amount.split(' ')[0]))).toFixed(2) + ' ETH',
      smallestDistribution: Math.min(...distributions.map(d => parseFloat(d.amount.split(' ')[0]))).toFixed(2) + ' ETH'
    };
    
    res.json({
      success: true,
      data: {
        distributions,
        stats
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

// GET /api/treasury/funding - Get funding sources breakdown
router.get('/funding', (req, res) => {
  try {
    const recentDeposits = generateFundingData();
    
    const fundingBreakdown = {
      sources: mockTreasuryData.fundingSources,
      recentDeposits: recentDeposits.slice(0, 8),
      weeklyAverage: '2.4 ETH',
      monthlyAverage: '10.2 ETH',
      sourceBreakdown: {
        tradingFees: `${(Math.random() * 2 + 1).toFixed(2)} ETH/week`,
        entryFees: `${(Math.random() * 0.5 + 0.2).toFixed(2)} ETH/week`,
        penaltyFees: `${(Math.random() * 1 + 0.5).toFixed(2)} ETH/week`,
        manualTopUps: `${(Math.random() * 3 + 2).toFixed(2)} ETH/month`
      }
    };
    
    res.json({
      success: true,
      data: fundingBreakdown
    });
  } catch (error) {
    console.error('Error fetching funding data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch funding data'
    });
  }
});

// GET /api/treasury/projections - Get treasury projections
router.get('/projections', (req, res) => {
  try {
    const currentBalance = parseFloat(mockTreasuryData.currentBalance.split(' ')[0]);
    const dailyDistribution = currentBalance / 3;
    const dailyInflow = 2.4; // Average daily funding
    
    const projections = {
      sustainability: {
        daysRemaining: Math.floor(currentBalance / Math.max(dailyDistribution - dailyInflow, 0.1)),
        weeklyChange: ((dailyInflow - dailyDistribution) * 7).toFixed(2) + ' ETH',
        monthlyChange: ((dailyInflow - dailyDistribution) * 30).toFixed(2) + ' ETH',
        burnRate: (dailyDistribution - dailyInflow).toFixed(2) + ' ETH/day'
      },
      scenarios: {
        conservative: {
          description: 'Current funding rate',
          dailyInflow: '2.4 ETH',
          balanceIn30Days: Math.max(0, currentBalance + (dailyInflow - dailyDistribution) * 30).toFixed(2) + ' ETH',
          sustainability: 'Moderate'
        },
        optimistic: {
          description: 'Increased player activity',
          dailyInflow: '5.0 ETH',
          balanceIn30Days: (currentBalance + (5.0 - dailyDistribution) * 30).toFixed(2) + ' ETH',
          sustainability: 'Excellent'
        },
        pessimistic: {
          description: 'Reduced activity',
          dailyInflow: '1.5 ETH',
          balanceIn30Days: Math.max(0, currentBalance + (1.5 - dailyDistribution) * 30).toFixed(2) + ' ETH',
          sustainability: 'At Risk'
        }
      },
      recommendations: [
        'Monitor trading volume to optimize fee collection',
        'Consider adjusting distribution percentage if needed',
        'Encourage more players to maintain funding levels',
        'Track penalty fees as indicator of early unstaking'
      ]
    };
    
    res.json({
      success: true,
      data: projections
    });
  } catch (error) {
    console.error('Error calculating projections:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate treasury projections'
    });
  }
});

// GET /api/treasury/analytics - Get detailed treasury analytics
router.get('/analytics', (req, res) => {
  try {
    const analytics = {
      efficiency: {
        distributionToInflow: '2.54:1',
        averagePlayerReward: '0.61 ETH',
        costPerPlayer: '0.39 ETH',
        retentionRate: '73%'
      },
      trends: {
        weeklyGrowth: '+12.3%',
        monthlyGrowth: '+45.7%',
        playerGrowth: '+28 players this week',
        stakingGrowth: '+125,000 STEAK this week'
      },
      distribution: {
        totalDistributions: 67,
        averageDistribution: '5.8 ETH',
        largestDistribution: '8.2 ETH',
        totalBeneficiaries: 284,
        uniquePlayers: 89
      },
      health: {
        score: 85,
        status: 'Healthy',
        factors: {
          balance: 'Good',
          inflow: 'Stable',
          distribution: 'Optimal',
          growth: 'Strong'
        }
      }
    };
    
    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch treasury analytics'
    });
  }
});

module.exports = router;