-- $STEAK Database Schema
-- Social tipping system with staking rewards

-- Users table - tracks wallet addresses and basic info
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(42) UNIQUE NOT NULL,
    farcaster_fid INTEGER,
    farcaster_username VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Staking positions - tracks user's staked STEAK
CREATE TABLE IF NOT EXISTS staking_positions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    staked_amount DECIMAL(18, 8) NOT NULL DEFAULT 0,
    staked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_reward_calculated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    total_rewards_earned DECIMAL(18, 8) NOT NULL DEFAULT 0,
    available_tip_balance DECIMAL(18, 8) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Staking transactions - all stake/unstake events
CREATE TABLE IF NOT EXISTS staking_transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    transaction_type VARCHAR(20) NOT NULL, -- 'STAKE' or 'UNSTAKE'
    amount DECIMAL(18, 8) NOT NULL,
    transaction_hash VARCHAR(66),
    block_number INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Farcaster tips - tracks all tips sent via Farcaster
CREATE TABLE IF NOT EXISTS farcaster_tips (
    id SERIAL PRIMARY KEY,
    tipper_user_id INTEGER REFERENCES users(id),
    recipient_fid INTEGER NOT NULL,
    recipient_username VARCHAR(100),
    tip_amount DECIMAL(18, 8) NOT NULL,
    cast_hash VARCHAR(100), -- Farcaster cast identifier
    cast_url VARCHAR(500),
    message TEXT,
    status VARCHAR(20) DEFAULT 'PENDING', -- 'PENDING', 'SENT', 'FAILED'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP
);

-- Tip claims - when recipients claim their tips
CREATE TABLE IF NOT EXISTS tip_claims (
    id SERIAL PRIMARY KEY,
    tip_id INTEGER REFERENCES farcaster_tips(id),
    recipient_user_id INTEGER REFERENCES users(id),
    claimed_amount DECIMAL(18, 8) NOT NULL,
    claim_type VARCHAR(20) NOT NULL, -- 'WITHDRAW' or 'STAKE'
    transaction_hash VARCHAR(66),
    claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Reward calculations - tracks daily reward calculations
CREATE TABLE IF NOT EXISTS reward_calculations (
    id SERIAL PRIMARY KEY,
    calculation_date DATE NOT NULL,
    total_staked DECIMAL(18, 8) NOT NULL,
    daily_reward_rate DECIMAL(8, 6) NOT NULL, -- percentage
    total_rewards_distributed DECIMAL(18, 8) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- System settings
CREATE TABLE IF NOT EXISTS system_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address);
CREATE INDEX IF NOT EXISTS idx_users_fid ON users(farcaster_fid);
CREATE INDEX IF NOT EXISTS idx_staking_positions_user ON staking_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_staking_transactions_user ON staking_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_farcaster_tips_tipper ON farcaster_tips(tipper_user_id);
CREATE INDEX IF NOT EXISTS idx_farcaster_tips_recipient ON farcaster_tips(recipient_fid);
CREATE INDEX IF NOT EXISTS idx_tip_claims_tip ON tip_claims(tip_id);
CREATE INDEX IF NOT EXISTS idx_tip_claims_recipient ON tip_claims(recipient_user_id);

-- Insert default system settings
INSERT INTO system_settings (setting_key, setting_value) VALUES
('daily_reward_rate', '0.001'), -- 0.1% daily rewards
('min_stake_amount', '1'),
('min_tip_amount', '0.1'),
('max_tip_amount', '1000'),
('steak_token_address', ''), -- STEAK token contract address (to be filled after Clanker deployment)
('steaknstake_contract_address', ''), -- SteakNStake contract address (to be filled after deployment)
('chain_id', '8453'), -- Base network chain ID
('farcaster_bot_fid', '1401302'), -- Farcaster bot FID
('farcaster_bot_username', 'steaknstake') -- Farcaster bot username
ON CONFLICT (setting_key) DO NOTHING;