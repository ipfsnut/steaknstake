-- Migration: Allow null wallet addresses for Farcaster-only users
-- Date: 2025-10-29
-- Purpose: Support tipping to users who haven't connected wallets yet

-- Remove NOT NULL constraint from wallet_address
ALTER TABLE users ALTER COLUMN wallet_address DROP NOT NULL;

-- Add comment for clarity
COMMENT ON COLUMN users.wallet_address IS 'Wallet address - null for Farcaster-only users who haven\'t connected wallet yet';