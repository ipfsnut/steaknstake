import { BigInt, Address, log } from "@graphprotocol/graph-ts"
import {
  Staked,
  Unstaked,
  TipsAllocated,
  TipsClaimed
} from "../generated/SteakNStake/SteakNStake"
import {
  User,
  StakeEvent,
  TipAllocation,
  ClaimEvent,
  LeaderboardEntry,
  GlobalStats
} from "../generated/schema"

// Helper function to get or create user
function getOrCreateUser(address: Address): User {
  let user = User.load(address.toHexString())
  if (user == null) {
    user = new User(address.toHexString())
    user.stakedAmount = BigInt.fromI32(0)
    user.totalStaked = BigInt.fromI32(0)
    user.totalUnstaked = BigInt.fromI32(0)
    user.tipsReceived = BigInt.fromI32(0)
    user.tipsClaimed = BigInt.fromI32(0)
    user.tipsAvailable = BigInt.fromI32(0)
    user.firstStakeTimestamp = BigInt.fromI32(0)
    user.lastStakeTimestamp = BigInt.fromI32(0)
    user.save()
  }
  return user
}

// Helper function to get or create global stats
function getOrCreateGlobalStats(): GlobalStats {
  let stats = GlobalStats.load("global")
  if (stats == null) {
    stats = new GlobalStats("global")
    stats.totalStaked = BigInt.fromI32(0)
    stats.totalUsers = 0
    stats.totalTipsAllocated = BigInt.fromI32(0)
    stats.totalTipsClaimed = BigInt.fromI32(0)
    stats.lastUpdated = BigInt.fromI32(0)
    stats.save()
  }
  return stats
}

// Helper function to update leaderboard entry
function updateLeaderboardEntry(user: User): void {
  let entry = LeaderboardEntry.load(user.id)
  if (entry == null) {
    entry = new LeaderboardEntry(user.id)
    entry.user = user.id
  }
  
  entry.stakedAmount = user.stakedAmount
  entry.tipsReceived = user.tipsReceived
  // Score = staked amount + tips received (can be customized)
  entry.score = user.stakedAmount.plus(user.tipsReceived)
  entry.lastUpdated = user.lastStakeTimestamp
  entry.save()
}

export function handleStaked(event: Staked): void {
  let user = getOrCreateUser(event.params.user)
  let stats = getOrCreateGlobalStats()
  
  // Update user data
  let wasNewUser = user.stakedAmount.equals(BigInt.fromI32(0))
  user.stakedAmount = user.stakedAmount.plus(event.params.amount)
  user.totalStaked = user.totalStaked.plus(event.params.amount)
  
  if (user.firstStakeTimestamp.equals(BigInt.fromI32(0))) {
    user.firstStakeTimestamp = event.block.timestamp
  }
  user.lastStakeTimestamp = event.block.timestamp
  user.save()
  
  // Create stake event
  let stakeEvent = new StakeEvent(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  )
  stakeEvent.user = user.id
  stakeEvent.amount = event.params.amount
  stakeEvent.type = "STAKE"
  stakeEvent.timestamp = event.block.timestamp
  stakeEvent.blockNumber = event.block.number
  stakeEvent.transactionHash = event.transaction.hash
  stakeEvent.newTotal = user.stakedAmount
  stakeEvent.save()
  
  // Update global stats
  stats.totalStaked = stats.totalStaked.plus(event.params.amount)
  if (wasNewUser) {
    stats.totalUsers = stats.totalUsers + 1
  }
  stats.lastUpdated = event.block.timestamp
  stats.save()
  
  // Update leaderboard
  updateLeaderboardEntry(user)
  
  log.info("Staked: user={}, amount={}, newTotal={}", [
    user.id,
    event.params.amount.toString(),
    user.stakedAmount.toString()
  ])
}

export function handleUnstaked(event: Unstaked): void {
  let user = getOrCreateUser(event.params.user)
  let stats = getOrCreateGlobalStats()
  
  // Update user data
  user.stakedAmount = user.stakedAmount.minus(event.params.amount)
  user.totalUnstaked = user.totalUnstaked.plus(event.params.amount)
  user.lastStakeTimestamp = event.block.timestamp
  user.save()
  
  // Create unstake event
  let stakeEvent = new StakeEvent(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  )
  stakeEvent.user = user.id
  stakeEvent.amount = event.params.amount
  stakeEvent.type = "UNSTAKE"
  stakeEvent.timestamp = event.block.timestamp
  stakeEvent.blockNumber = event.block.number
  stakeEvent.transactionHash = event.transaction.hash
  stakeEvent.newTotal = user.stakedAmount
  stakeEvent.save()
  
  // Update global stats
  stats.totalStaked = stats.totalStaked.minus(event.params.amount)
  stats.lastUpdated = event.block.timestamp
  stats.save()
  
  // Update leaderboard
  updateLeaderboardEntry(user)
  
  log.info("Unstaked: user={}, amount={}, newTotal={}", [
    user.id,
    event.params.amount.toString(),
    user.stakedAmount.toString()
  ])
}

export function handleTipsAllocated(event: TipsAllocated): void {
  let user = getOrCreateUser(event.params.user)
  let stats = getOrCreateGlobalStats()
  
  // Update user data
  user.tipsReceived = user.tipsReceived.plus(event.params.amount)
  user.tipsAvailable = user.tipsAvailable.plus(event.params.amount)
  user.save()
  
  // Create tip allocation
  let tipAllocation = new TipAllocation(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  )
  tipAllocation.user = user.id
  tipAllocation.amount = event.params.amount
  tipAllocation.timestamp = event.block.timestamp
  tipAllocation.blockNumber = event.block.number
  tipAllocation.transactionHash = event.transaction.hash
  tipAllocation.save()
  
  // Update global stats
  stats.totalTipsAllocated = stats.totalTipsAllocated.plus(event.params.amount)
  stats.lastUpdated = event.block.timestamp
  stats.save()
  
  // Update leaderboard
  updateLeaderboardEntry(user)
  
  log.info("Tips Allocated: user={}, amount={}, newAvailable={}", [
    user.id,
    event.params.amount.toString(),
    user.tipsAvailable.toString()
  ])
}

export function handleTipsClaimed(event: TipsClaimed): void {
  let user = getOrCreateUser(event.params.user)
  let stats = getOrCreateGlobalStats()
  
  // Update user data
  user.tipsClaimed = user.tipsClaimed.plus(event.params.amount)
  user.tipsAvailable = user.tipsAvailable.minus(event.params.amount)
  user.save()
  
  // Create claim event
  let claimEvent = new ClaimEvent(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  )
  claimEvent.user = user.id
  claimEvent.amount = event.params.amount
  // Map the action enum
  claimEvent.action = event.params.action == 0 ? "TO_WALLET" : "SPLIT_HALF"
  claimEvent.timestamp = event.block.timestamp
  claimEvent.blockNumber = event.block.number
  claimEvent.transactionHash = event.transaction.hash
  claimEvent.save()
  
  // Update global stats
  stats.totalTipsClaimed = stats.totalTipsClaimed.plus(event.params.amount)
  stats.lastUpdated = event.block.timestamp
  stats.save()
  
  // Update leaderboard
  updateLeaderboardEntry(user)
  
  log.info("Tips Claimed: user={}, amount={}, action={}, newAvailable={}", [
    user.id,
    event.params.amount.toString(),
    claimEvent.action,
    user.tipsAvailable.toString()
  ])
}