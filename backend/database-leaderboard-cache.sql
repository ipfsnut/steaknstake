-- Leaderboard Cache Table
-- Secondary table for leaderboard calculations without modifying original staking data

CREATE TABLE IF NOT EXISTS leaderboard_cache (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(42) NOT NULL,
    rank INTEGER NOT NULL,
    staked_amount DECIMAL(18, 8) NOT NULL,
    total_tips_sent DECIMAL(18, 8) NOT NULL DEFAULT 0,
    total_tips_received DECIMAL(18, 8) NOT NULL DEFAULT 0,
    leaderboard_score DECIMAL(18, 8) NOT NULL, -- Same as staked_amount for now
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_leaderboard_cache_wallet ON leaderboard_cache(wallet_address);
CREATE INDEX IF NOT EXISTS idx_leaderboard_cache_rank ON leaderboard_cache(rank);
CREATE INDEX IF NOT EXISTS idx_leaderboard_cache_score ON leaderboard_cache(leaderboard_score DESC);

-- Function to refresh leaderboard cache
CREATE OR REPLACE FUNCTION refresh_leaderboard_cache() RETURNS void AS $$
BEGIN
    -- Clear existing cache
    TRUNCATE leaderboard_cache;
    
    -- Insert fresh leaderboard data
    INSERT INTO leaderboard_cache (
        wallet_address,
        rank,
        staked_amount,
        total_tips_sent,
        total_tips_received,
        leaderboard_score,
        last_updated
    )
    SELECT 
        u.wallet_address,
        ROW_NUMBER() OVER (ORDER BY sp.staked_amount DESC) as rank,
        sp.staked_amount,
        COALESCE(tip_sent.total_sent, 0) as total_tips_sent,
        COALESCE(tip_received.total_received, 0) as total_tips_received,
        sp.staked_amount as leaderboard_score, -- Score = staked amount for now
        CURRENT_TIMESTAMP as last_updated
    FROM staking_positions sp
    JOIN users u ON sp.user_id = u.id
    LEFT JOIN (
        SELECT 
            tipper_user_id,
            SUM(tip_amount) as total_sent
        FROM farcaster_tips 
        WHERE status = 'SENT'
        GROUP BY tipper_user_id
    ) tip_sent ON u.id = tip_sent.tipper_user_id
    LEFT JOIN (
        SELECT 
            recipient_wallet_address,
            SUM(tip_amount) as total_received
        FROM farcaster_tips 
        WHERE status = 'SENT' AND recipient_wallet_address IS NOT NULL
        GROUP BY recipient_wallet_address
    ) tip_received ON u.wallet_address = tip_received.recipient_wallet_address
    WHERE sp.staked_amount > 0
    ORDER BY sp.staked_amount DESC;
    
END;
$$ LANGUAGE plpgsql;