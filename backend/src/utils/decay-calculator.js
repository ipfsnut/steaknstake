/**
 * Time-based staking decay system
 * Encourages active gameplay and prevents "set and forget" strategies
 */

// Decay configuration
const DECAY_CONFIG = {
  // Week 0 (new stakes): 1.2x multiplier
  week0: { multiplier: 1.2, label: '🔥 Fresh Stake Boost' },
  
  // Week 1: 1.0x multiplier (baseline)
  week1: { multiplier: 1.0, label: '⚖️ Standard Rate' },
  
  // Week 2: 0.9x multiplier
  week2: { multiplier: 0.9, label: '📉 Early Decay' },
  
  // Week 3: 0.8x multiplier  
  week3: { multiplier: 0.8, label: '⚠️ Moderate Decay' },
  
  // Week 4: 0.7x multiplier
  week4: { multiplier: 0.7, label: '🔻 Heavy Decay' },
  
  // Week 5+: 0.6x multiplier (floor)
  week5Plus: { multiplier: 0.6, label: '💀 Maximum Decay' }
};

/**
 * Calculate the decay multiplier based on stake age
 * @param {Date} stakeDate - When the stake was created
 * @returns {Object} - { multiplier, weekNumber, label, daysStaked }
 */
function calculateDecayMultiplier(stakeDate) {
  const now = new Date();
  const stakeTime = new Date(stakeDate);
  const daysStaked = Math.floor((now.getTime() - stakeTime.getTime()) / (1000 * 60 * 60 * 24));
  const weekNumber = Math.floor(daysStaked / 7);
  
  let config;
  
  if (weekNumber === 0) {
    config = DECAY_CONFIG.week0;
  } else if (weekNumber === 1) {
    config = DECAY_CONFIG.week1;
  } else if (weekNumber === 2) {
    config = DECAY_CONFIG.week2;
  } else if (weekNumber === 3) {
    config = DECAY_CONFIG.week3;
  } else if (weekNumber === 4) {
    config = DECAY_CONFIG.week4;
  } else {
    config = DECAY_CONFIG.week5Plus;
  }
  
  return {
    multiplier: config.multiplier,
    weekNumber,
    label: config.label,
    daysStaked,
    isDecaying: config.multiplier < 1.0,
    isBoosted: config.multiplier > 1.0
  };
}

/**
 * Calculate effective staked amount with decay applied
 * @param {number} rawAmount - Original staked amount
 * @param {Date} stakeDate - When the stake was created
 * @returns {Object} - { effectiveAmount, rawAmount, decay }
 */
function calculateEffectiveStake(rawAmount, stakeDate) {
  const decay = calculateDecayMultiplier(stakeDate);
  const effectiveAmount = Math.floor(rawAmount * decay.multiplier);
  
  return {
    effectiveAmount,
    rawAmount,
    decay,
    difference: effectiveAmount - rawAmount,
    percentageChange: ((decay.multiplier - 1) * 100).toFixed(1)
  };
}

/**
 * Calculate when a stake will hit the next decay threshold
 * @param {Date} stakeDate - When the stake was created
 * @returns {Object} - Next decay event info
 */
function getNextDecayEvent(stakeDate) {
  const decay = calculateDecayMultiplier(stakeDate);
  const daysUntilNextWeek = 7 - (decay.daysStaked % 7);
  const nextWeekNumber = decay.weekNumber + 1;
  
  let nextMultiplier;
  let nextLabel;
  
  if (nextWeekNumber === 1) {
    nextMultiplier = DECAY_CONFIG.week1.multiplier;
    nextLabel = DECAY_CONFIG.week1.label;
  } else if (nextWeekNumber === 2) {
    nextMultiplier = DECAY_CONFIG.week2.multiplier;
    nextLabel = DECAY_CONFIG.week2.label;
  } else if (nextWeekNumber === 3) {
    nextMultiplier = DECAY_CONFIG.week3.multiplier;
    nextLabel = DECAY_CONFIG.week3.label;
  } else if (nextWeekNumber === 4) {
    nextMultiplier = DECAY_CONFIG.week4.multiplier;
    nextLabel = DECAY_CONFIG.week4.label;
  } else {
    nextMultiplier = DECAY_CONFIG.week5Plus.multiplier;
    nextLabel = DECAY_CONFIG.week5Plus.label;
  }
  
  const nextEventDate = new Date(stakeDate);
  nextEventDate.setDate(nextEventDate.getDate() + decay.daysStaked + daysUntilNextWeek);
  
  return {
    daysUntilNext: daysUntilNextWeek,
    nextMultiplier,
    nextLabel,
    nextEventDate,
    willDegrade: nextMultiplier < decay.multiplier,
    impact: nextMultiplier - decay.multiplier
  };
}

/**
 * Get decay schedule for a stake
 * @param {Date} stakeDate - When the stake was created
 * @returns {Array} - Complete decay schedule
 */
function getDecaySchedule(stakeDate) {
  const schedule = [];
  const baseDate = new Date(stakeDate);
  
  Object.entries(DECAY_CONFIG).forEach(([weekKey, config], index) => {
    const weekStart = new Date(baseDate);
    weekStart.setDate(baseDate.getDate() + (index * 7));
    
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    
    schedule.push({
      week: index,
      weekKey,
      multiplier: config.multiplier,
      label: config.label,
      startDate: weekStart.toISOString(),
      endDate: weekEnd.toISOString(),
      isActive: index === Math.floor((Date.now() - baseDate.getTime()) / (1000 * 60 * 60 * 24 * 7))
    });
  });
  
  return schedule;
}

/**
 * Sort leaderboard by effective stake amounts
 * @param {Array} players - Array of player objects with rawAmount and stakeDate
 * @returns {Array} - Sorted leaderboard with decay calculations
 */
function calculateLeaderboardWithDecay(players) {
  return players
    .map(player => {
      const effective = calculateEffectiveStake(player.stakedAmountRaw, player.stakeDate);
      const nextEvent = getNextDecayEvent(player.stakeDate);
      
      return {
        ...player,
        effectiveStake: effective,
        nextDecayEvent: nextEvent,
        sortValue: effective.effectiveAmount
      };
    })
    .sort((a, b) => b.sortValue - a.sortValue)
    .map((player, index) => ({
      ...player,
      rank: index + 1,
      isTopTen: index < 10
    }));
}

/**
 * Get decay system rules and configuration
 * @returns {Object} - Complete decay system info
 */
function getDecaySystemInfo() {
  return {
    config: DECAY_CONFIG,
    rules: {
      title: "Time-Based Ranking Decay",
      description: "Stake amounts are multiplied by time-based factors to encourage active gameplay",
      purpose: "Prevents 'set and forget' strategies and creates dynamic competition",
      weeklySchedule: [
        "Week 0 (Days 0-6): 1.2x Fresh Stake Boost",
        "Week 1 (Days 7-13): 1.0x Standard Rate", 
        "Week 2 (Days 14-20): 0.9x Early Decay",
        "Week 3 (Days 21-27): 0.8x Moderate Decay",
        "Week 4 (Days 28-34): 0.7x Heavy Decay",
        "Week 5+ (Days 35+): 0.6x Maximum Decay"
      ],
      strategy: [
        "New stakes get a temporary boost to climb rankings",
        "Stakes naturally decay over time to maintain competition",
        "Players must re-stake periodically to maintain top positions",
        "Encourages active gameplay over passive holding"
      ]
    }
  };
}

module.exports = {
  calculateDecayMultiplier,
  calculateEffectiveStake,
  getNextDecayEvent,
  getDecaySchedule,
  calculateLeaderboardWithDecay,
  getDecaySystemInfo,
  DECAY_CONFIG
};