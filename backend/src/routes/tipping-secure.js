const express = require('express');
const router = express.Router();
const db = require('../services/database');
const winston = require('winston');
const { generateFarcasterTipHash, generateDirectTipHash, isValidTipHash } = require('../utils/tipHash');
const { ethers } = require('ethers');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()]
});

// Contract configuration (will be updated after deployment)
const STEAKNSTAKE_CONTRACT_ADDRESS = process.env.STEAKNSTAKE_CONTRACT_ADDRESS;
const STEAKNSTAKE_ABI = [
  // Key functions for tip allocation and claiming
  {
    "inputs": [
      {"name": "recipient", "type": "address"},
      {"name": "amount", "type": "uint256"},
      {"name": "tipHash", "type": "bytes32"}
    ],
    "name": "allocateTip",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "recipient", "type": "address"},
      {"name": "amount", "type": "uint256"},
      {"name": "tipHash", "type": "bytes32"}
    ],
    "name": "claimTip",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"name": "user", "type": "address"}],
    "name": "getAvailableTipAllowance",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }
];

// Initialize ethers provider and contract (backend acts as distributor)
const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
const distributorWallet = process.env.PROTOCOL_WALLET_PRIVATE_KEY && process.env.PROTOCOL_WALLET_PRIVATE_KEY !== 'your_protocol_wallet_private_key_here' 
  ? new ethers.Wallet(process.env.PROTOCOL_WALLET_PRIVATE_KEY, provider)
  : null;
const steakNStakeContract = distributorWallet 
  ? new ethers.Contract(STEAKNSTAKE_CONTRACT_ADDRESS, STEAKNSTAKE_ABI, distributorWallet)
  : null;

// POST /api/tipping/send-secure - Send a Farcaster tip with secure tipHash
router.post('/send-secure', async (req, res) => {
  try {
    const { 
      tipperWalletAddress,
      recipientFid,
      recipientUsername,
      tipAmount,
      castHash,
      castUrl,
      message 
    } = req.body;
    
    // Validate required parameters
    if (!tipperWalletAddress || !recipientFid || !tipAmount || tipAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Tipper wallet, recipient FID, and positive tip amount required'
      });
    }

    if (!castHash) {
      return res.status(400).json({
        success: false,
        error: 'Cast hash required for Farcaster tips'
      });
    }

    // Validate wallet address format
    if (!ethers.isAddress(tipperWalletAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid tipper wallet address'
      });
    }

    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Get tipper user
      const tipperResult = await client.query(
        'SELECT * FROM users WHERE wallet_address = $1',
        [tipperWalletAddress.toLowerCase()]
      );
      
      if (tipperResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          error: 'Tipper not found. Please connect your wallet first.'
        });
      }
      
      const tipper = tipperResult.rows[0];
      
      // CRITICAL: Prevent self-tipping
      if (tipper.farcaster_fid && parseInt(tipper.farcaster_fid) === parseInt(recipientFid)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: 'You cannot tip yourself! Tip allowances can only be given to others.'
        });
      }

      // Get or create recipient user
      let recipientResult = await client.query(
        'SELECT * FROM users WHERE farcaster_fid = $1',
        [recipientFid]
      );

      let recipient;
      if (recipientResult.rows.length === 0) {
        // Auto-register recipient by fetching their wallet address from Farcaster
        let recipientWalletAddress = null;
        
        try {
          logger.info('Fetching wallet address for recipient FID:', recipientFid);
          const axios = require('axios');
          const userResponse = await axios.get(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${recipientFid}`, {
            headers: {
              'accept': 'application/json',
              'api_key': process.env.NEYNAR_API_KEY || '67AA399D-B5BA-4EA3-9A4D-315D151D7BBC'
            }
          });
          
          if (userResponse.data?.users?.[0]?.verifications?.[0]) {
            recipientWalletAddress = userResponse.data.users[0].verifications[0];
            logger.info('Found wallet address for recipient:', { recipientFid, recipientWalletAddress });
          } else {
            logger.info('No verified wallet found for recipient FID:', recipientFid);
          }
        } catch (error) {
          logger.error('Failed to fetch recipient wallet from Farcaster:', error.message);
        }
        
        // Only create user if we found their wallet address
        if (!recipientWalletAddress) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            error: `Recipient @${recipientUsername} needs to connect their wallet at steak.epicdylan.com first to receive tips.`
          });
        }

        // Create recipient user with their wallet address
        const insertResult = await client.query(
          'INSERT INTO users (farcaster_fid, farcaster_username, wallet_address) VALUES ($1, $2, $3) RETURNING *',
          [recipientFid, recipientUsername, recipientWalletAddress.toLowerCase()]
        );
        recipient = insertResult.rows[0];
        
        logger.info('Created new recipient user', { 
          recipientFid, 
          recipientUsername, 
          hasWallet: !!recipientWalletAddress,
          walletAddress: recipientWalletAddress 
        });
      } else {
        recipient = recipientResult.rows[0];
      }

      // Check tip amount limits
      const minTip = 0.1; // 0.1 STEAK minimum
      const maxTip = 1000; // 1000 STEAK maximum
      
      if (tipAmount < minTip) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: `Minimum tip amount is ${minTip} STEAK`
        });
      }
      
      if (tipAmount > maxTip) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: `Maximum tip amount is ${maxTip} STEAK`
        });
      }

      // Check tipper's tip allowance on-chain
      let availableAllowance;
      try {
        const allowanceWei = await steakNStakeContract.getAvailableTipAllowance(tipperWalletAddress);
        availableAllowance = parseFloat(ethers.formatEther(allowanceWei));
      } catch (contractError) {
        logger.error('Error checking tip allowance:', contractError);
        await client.query('ROLLBACK');
        return res.status(500).json({
          success: false,
          error: 'Unable to check tip allowance. Please try again.'
        });
      }

      if (availableAllowance < tipAmount) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: `Insufficient tip allowance. Available: ${availableAllowance.toFixed(2)} STEAK, Required: ${tipAmount} STEAK`
        });
      }

      // Generate secure tipHash (recipient wallet address TBD - will be null for now)
      const recipientWalletAddress = recipient.wallet_address || ethers.ZeroAddress;
      
      const { tipHash, tipData } = generateFarcasterTipHash({
        tipperWalletAddress,
        recipientWalletAddress,
        tipAmount,
        castHash,
        message: message || ''
      });

      logger.info('Generated secure tipHash', { 
        tipHash, 
        tipper: tipperWalletAddress,
        recipient: recipientWalletAddress,
        amount: tipAmount 
      });

      // Store tip in database
      const tipResult = await client.query(
        `INSERT INTO farcaster_tips (
          tipper_user_id, recipient_fid, recipient_username, tip_amount, 
          cast_hash, cast_url, message, status, tip_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'ALLOCATED', $8) RETURNING *`,
        [
          tipper.id,
          recipientFid,
          recipientUsername,
          tipAmount,
          castHash,
          castUrl,
          message || '',
          tipHash
        ]
      );

      const tip = tipResult.rows[0];

      // Call contract allocateTip function (this will validate tip allowance on-chain)
      let allocateTxHash;
      try {
        const amountWei = ethers.parseEther(tipAmount.toString());
        
        logger.info('Calling contract allocateTip', {
          recipient: recipientWalletAddress,
          amount: amountWei.toString(),
          tipHash
        });

        const tx = await steakNStakeContract.allocateTip(
          recipientWalletAddress,
          amountWei,
          tipHash
        );
        
        allocateTxHash = tx.hash;
        logger.info('allocateTip transaction sent', { txHash: allocateTxHash });
        
        // Wait for confirmation
        await tx.wait();
        logger.info('allocateTip transaction confirmed', { txHash: allocateTxHash });

      } catch (contractError) {
        logger.error('Contract allocateTip failed:', contractError);
        await client.query('ROLLBACK');
        
        // Parse contract error for user-friendly message
        let errorMessage = 'Failed to allocate tip on blockchain';
        if (contractError.message?.includes('Insufficient tip allowance')) {
          errorMessage = 'Insufficient tip allowance. You may need to wait for more rewards or stake more STEAK.';
        } else if (contractError.message?.includes('Cannot tip yourself')) {
          errorMessage = 'You cannot tip yourself.';
        } else if (contractError.message?.includes('Tip already processed')) {
          errorMessage = 'This tip has already been processed.';
        }
        
        return res.status(400).json({
          success: false,
          error: errorMessage,
          details: contractError.message
        });
      }

      // Update tip with transaction hash
      await client.query(
        'UPDATE farcaster_tips SET allocation_tx_hash = $1, status = $2 WHERE id = $3',
        [allocateTxHash, 'ALLOCATED', tip.id]
      );

      await client.query('COMMIT');

      logger.info('Secure tip sent successfully', {
        tipId: tip.id,
        tipHash,
        allocateTxHash,
        tipper: tipperWalletAddress,
        recipientFid,
        amount: tipAmount
      });

      res.json({
        success: true,
        tip: {
          id: tip.id,
          tipHash,
          amount: tipAmount,
          recipient: {
            fid: recipientFid,
            username: recipientUsername
          },
          castHash,
          allocateTxHash,
          status: 'ALLOCATED',
          message: 'Tip allocated successfully! Recipient can claim when they connect their wallet.'
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    logger.error('Error in send-secure:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

// POST /api/tipping/claim-secure - Claim an allocated tip
router.post('/claim-secure', async (req, res) => {
  try {
    const {
      recipientWalletAddress,
      recipientFid,
      tipHash
    } = req.body;

    // Validate parameters
    if (!recipientWalletAddress || !recipientFid || !tipHash) {
      return res.status(400).json({
        success: false,
        error: 'Recipient wallet address, FID, and tipHash required'
      });
    }

    if (!ethers.isAddress(recipientWalletAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid recipient wallet address'
      });
    }

    if (!isValidTipHash(tipHash)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid tipHash format'
      });
    }

    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // Find the tip by hash and recipient FID
      const tipResult = await client.query(
        `SELECT ft.*, u.farcaster_username as tipper_username 
         FROM farcaster_tips ft 
         JOIN users u ON ft.tipper_user_id = u.id 
         WHERE ft.tip_hash = $1 AND ft.recipient_fid = $2 AND ft.status = 'ALLOCATED'`,
        [tipHash, recipientFid]
      );

      if (tipResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          error: 'Tip not found or already claimed'
        });
      }

      const tip = tipResult.rows[0];

      // Update or create recipient user with wallet address
      await client.query(
        `UPDATE users SET wallet_address = $1 WHERE farcaster_fid = $2`,
        [recipientWalletAddress.toLowerCase(), recipientFid]
      );

      // Call contract claimTip function
      let claimTxHash;
      try {
        const amountWei = ethers.parseEther(tip.tip_amount.toString());
        
        logger.info('Calling contract claimTip', {
          recipient: recipientWalletAddress,
          amount: amountWei.toString(),
          tipHash
        });

        const tx = await steakNStakeContract.claimTip(
          recipientWalletAddress,
          amountWei,
          tipHash
        );
        
        claimTxHash = tx.hash;
        logger.info('claimTip transaction sent', { txHash: claimTxHash });
        
        // Wait for confirmation
        await tx.wait();
        logger.info('claimTip transaction confirmed', { txHash: claimTxHash });

      } catch (contractError) {
        logger.error('Contract claimTip failed:', contractError);
        await client.query('ROLLBACK');
        
        let errorMessage = 'Failed to claim tip from blockchain';
        if (contractError.message?.includes('Tip not found')) {
          errorMessage = 'Tip not found on blockchain or already claimed.';
        } else if (contractError.message?.includes('Amount mismatch')) {
          errorMessage = 'Tip amount mismatch. Please contact support.';
        }
        
        return res.status(400).json({
          success: false,
          error: errorMessage,
          details: contractError.message
        });
      }

      // Update tip status to claimed
      await client.query(
        'UPDATE farcaster_tips SET status = $1, claim_tx_hash = $2, claimed_at = NOW() WHERE id = $3',
        ['CLAIMED', claimTxHash, tip.id]
      );

      // Record the claim
      await client.query(
        `INSERT INTO tip_claims (tip_id, recipient_user_id, claimed_amount, claim_type, transaction_hash)
         VALUES ($1, (SELECT id FROM users WHERE wallet_address = $2), $3, 'WITHDRAW', $4)`,
        [tip.id, recipientWalletAddress.toLowerCase(), tip.tip_amount, claimTxHash]
      );

      await client.query('COMMIT');

      logger.info('Tip claimed successfully', {
        tipId: tip.id,
        tipHash,
        claimTxHash,
        recipient: recipientWalletAddress,
        amount: tip.tip_amount
      });

      res.json({
        success: true,
        claim: {
          tipId: tip.id,
          amount: tip.tip_amount,
          claimTxHash,
          message: `Successfully claimed ${tip.tip_amount} STEAK from @${tip.tipper_username}!`
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    logger.error('Error in claim-secure:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

// GET /api/tipping/pending/:fid - Get pending tips for a Farcaster user
router.get('/pending/:fid', async (req, res) => {
  try {
    const { fid } = req.params;
    
    const client = await db.getClient();
    
    const result = await client.query(
      `SELECT ft.*, u.farcaster_username as tipper_username, u.wallet_address as tipper_wallet
       FROM farcaster_tips ft 
       JOIN users u ON ft.tipper_user_id = u.id 
       WHERE ft.recipient_fid = $1 AND ft.status = 'ALLOCATED' 
       ORDER BY ft.created_at DESC`,
      [fid]
    );

    client.release();

    const pendingTips = result.rows.map(tip => ({
      id: tip.id,
      tipHash: tip.tip_hash,
      amount: parseFloat(tip.tip_amount),
      tipper: {
        username: tip.tipper_username,
        wallet: tip.tipper_wallet
      },
      castHash: tip.cast_hash,
      castUrl: tip.cast_url,
      message: tip.message,
      createdAt: tip.created_at,
      allocationTxHash: tip.allocation_tx_hash
    }));

    res.json({
      success: true,
      pendingTips,
      totalAmount: pendingTips.reduce((sum, tip) => sum + tip.amount, 0)
    });

  } catch (error) {
    logger.error('Error getting pending tips:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pending tips'
    });
  }
});

module.exports = router;