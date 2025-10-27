# STEAKNSTAKE WHITEPAPER
## Social Staking Meets Farcaster Tipping
### Version 3.0 - October 2025

---

## EXECUTIVE SUMMARY

SteakNStake is a revolutionary social staking protocol that bridges DeFi staking with Farcaster's social ecosystem. Inspired by the proven success of **$DEGEN** and **$TIPN**, we've adopted a battle-tested reward distribution model where users stake $STEAK tokens and receive proportional shares of distributed rewards via a `split()` + `claim()` mechanism.

**Key Innovation:** Following TipN's proven architecture, rewards are distributed proportionally to all stakers based on their stake percentage, creating sustainable value distribution while maintaining security and simplicity through audited patterns.

---

## SOLUTION OVERVIEW

SteakNStake solves these problems through a unique "Social Staking" model:

🥩 **STAKE:** Lock $STEAK tokens to receive proportional shares of distributed rewards  
💰 **SPLIT:** Protocol distributes rewards proportionally to all current stakers  
🎁 **CLAIM:** Stakers claim their accumulated rewards anytime

This creates a sustainable economy where:
- Stakers earn proportional rewards based on their stake percentage
- Protocol can distribute tips, fees, or any revenue to all stakers fairly
- Simple TipN-style architecture ensures security and auditability
- Token utility drives long-term holding for reward distribution

---

## TECHNICAL ARCHITECTURE

### Blockchain Infrastructure:
- **Network:** Base (Ethereum Layer 2)
- **Smart Contracts:** ERC-20 ($STEAK) + Custom Staking Contract
- **Contract Address:** `0xdA9BD5c259Ae90e99158f45f00238d1BaDb3694D` (v3.0.0-tipn-tipping)
- **Token Address:** `0x1C96D434DEb1fF21Fc5406186Eef1f970fAF3B07`

### Core Components:

#### 1. SMART CONTRACTS (Solidity)
- **SteakNStake.sol:** TipN-style staking and reward distribution
- **Functions:** `stake()`, `unstake()`, `split()`, `claim()`, `claimToWallet()`
- **Architecture:** Inspired by TipN's proven proportional distribution model
- **Security:** Non-reentrant, role-based access control, UUPS upgradeable

#### 2. FRONTEND (Next.js)
- Farcaster Miniapp integration via SDK
- Wagmi v2 for Web3 interactions
- Real-time balance updates
- Mobile-first responsive design

#### 3. BACKEND (Node.js + PostgreSQL)
- Tip detection via Neynar webhooks
- Real-time balance tracking
- Claim processing and validation
- Railway cloud deployment

#### 4. DATABASE SCHEMA
- **users:** Wallet addresses linked to Farcaster profiles
- **staking_positions:** User stakes and available tip balances  
- **farcaster_tips:** Tip records with claim status
- **tip_claims:** Claim history (WITHDRAW vs STAKE options)

#### 5. INDEXING (The Graph Protocol)
- Real-time event indexing for leaderboards
- Efficient querying of staking and tipping history
- Subgraph deployment for decentralized data access

---

## USER FLOW WALKTHROUGH

### Step 1: Connect & Stake
- User connects Farcaster wallet to SteakNStake
- Stakes $STEAK tokens through miniapp interface
- Becomes eligible for proportional reward distributions

### Step 2: Reward Distribution
- Protocol distributes tips via `split()` function


### Step 3: Claim Rewards
- Stakers visit SteakNStake to claim accumulated rewards
- Simple `claim()` function transfers earned rewards
- Rewards continue accumulating while staked

### Step 4: Community Building
- Leaderboards show top stakers and tippers
- Social recognition for supporting creators
- Network effects as more users join the tipping economy

---

## TOKENOMICS & ECONOMIC MODEL

### $STEAK Token Utility:
1. **Staking:** Lock tokens to earn tip allowances
2. **Tipping:** Only way to use earned allowances 
3. **Claiming:** Recipients get liquid $STEAK tokens

### TipN-Style Reward Mechanics:
- **Proportional distribution:** `(user_stake / total_stake) × allocation_amount`
- **Simple and transparent:** rewards based on exact stake percentage
- **Proven architecture** from successful protocols like TipN and DEGEN

### Economic Incentives:
- **Stakers:** Social capital, community recognition, platform influence
- **Creators:** Direct monetization of quality content

### Sustainable Design:
- No inflation (fixed supply model)

---

## TECHNICAL SPECIFICATIONS

### Frontend Stack:
- **Framework:** Next.js 14 with App Router
- **Styling:** Tailwind CSS for responsive design
- **Web3:** Wagmi v2.18.2 + Viem for blockchain interactions
- **State:** React hooks with optimistic updates
- **Farcaster:** Official SDK for miniapp functionality

### Backend Stack:
- **Runtime:** Node.js with Express.js framework
- **Database:** PostgreSQL with connection pooling
- **ORM:** Raw SQL queries for performance
- **Webhooks:** Neynar integration for real-time events
- **Deployment:** Railway cloud platform

### Blockchain Stack:
- **Network:** Base (Chain ID: 8453)
- **RPC:** Reliable third-party providers
- **Indexing:** The Graph Protocol subgraph
- **Events:** Comprehensive event emission for tracking
- **Gas:** Optimized for Base's low-cost environment

### API Architecture:
- RESTful endpoints for all operations
- Real-time updates via webhook processing
- Rate limiting and error handling
- Comprehensive logging and monitoring
- CORS configuration for security

### Security Architecture:
- Environment variable management
- Input validation and sanitization
- SQL injection prevention
- XSS protection headers
- Secure webhook validation

---

## INSPIRATIONS & ACKNOWLEDGMENTS

SteakNStake v3.0 is built on the shoulders of giants, particularly inspired by:

**$DEGEN** - The pioneering Farcaster-native token that proved social tokens can create real value and community. DEGEN's success in connecting social activity with economic rewards laid the foundation for social finance on Farcaster.

**$TIPN** - The elegant reward distribution protocol whose `split()` + `claim()` architecture we've adopted for security and simplicity. TipN's proportional distribution model has been battle-tested and audited, providing a proven foundation for sustainable reward systems.

By combining DEGEN's social innovation with TipN's technical excellence and a few tweaks, SteakNStake v3.0 offers a robust and scalable platform for social staking.

---

## CONCLUSION

SteakNStake represents a fundamental shift in how we think about DeFi rewards and social value creation. By connecting staking yields to social tipping, we create a positive-sum economy where financial incentives align with community building and creator support.

The protocol addresses real problems in both DeFi (mercenary capital) and social platforms (creator monetization) through an elegant solution that benefits all participants. Stakers earn social capital, creators receive economic value, and the community grows stronger through meaningful interactions.

Our technical implementation prioritizes security, scalability, and user experience while maintaining the decentralized principles that make web3 powerful. The Farcaster integration provides immediate utility and a clear path to adoption within an existing, engaged community.

As we move forward, SteakNStake will continue evolving based on community feedback and market needs. Our goal is not just to build a successful protocol, but to pioneer new models of social finance that can be replicated and adapted across the broader web3 ecosystem.

The future of social platforms is economic. SteakNStake is building that future today.

---

## LEGAL DISCLAIMER

This whitepaper is for informational purposes only and does not constitute financial, legal, or investment advice. The SteakNStake protocol and $STEAK token involve significant risks including but not limited to:

- Smart contract vulnerabilities and potential exploits
- Regulatory uncertainty in various jurisdictions  
- Token price volatility and potential loss of value
- Technical risks including bugs and network failures
- Market risks including low liquidity and adoption

Users should conduct their own research and consult with qualified professionals before participating in the protocol. The development team makes no guarantees about future performance or outcomes.

Past performance does not indicate future results. Cryptocurrency investments carry high risk and may not be suitable for all investors. Only invest what you can afford to lose.

This document may be updated periodically to reflect protocol changes and improvements. Users are responsible for staying informed about current terms and conditions.

---

## CONTACT INFORMATION

**Project Lead:** [@epicdylan](https://warpcast.com/epicdylan) (Farcaster)  
**Website:** https://epicdylan.com  
**GitHub:** https://github.com/epicdylan/steaknstake  

### Community:
- **Discord:** https://discord.gg/steaknstake
- **Farcaster:** [@steaknstake](https://warpcast.com/steaknstake)

### Technical Support:
- **GitHub Issues:** Bug reports and feature requests
- **Community Discord:** Real-time help and discussion

### Business Inquiries:
- **General:** thomas.dylan.daniel@gmail.com

---

**Document Version:** 3.0 (Secure TipN-Tipping Architecture)  
**Last Updated:** October 27, 2025  
**Next Review:** November 2025  

© 2025 EpicDylan. All rights reserved.

