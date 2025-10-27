const { ethers } = require('ethers');
const crypto = require('crypto');

/**
 * Secure tipHash generation utility
 * Prevents replay attacks and ensures cryptographic security
 */

/**
 * Generate a cryptographically secure tipHash
 * @param {Object} params - Tip parameters
 * @param {string} params.tipper - Tipper wallet address  
 * @param {string} params.recipient - Recipient wallet address
 * @param {string} params.amount - Tip amount in wei (string to avoid precision issues)
 * @param {number} params.timestamp - Unix timestamp
 * @param {string} params.castHash - Optional Farcaster cast hash
 * @param {string} params.message - Optional tip message
 * @returns {string} Secure 32-byte tipHash
 */
function generateTipHash({ tipper, recipient, amount, timestamp, castHash = '', message = '' }) {
  // Validate required parameters
  if (!tipper || !recipient || !amount || !timestamp) {
    throw new Error('Missing required parameters: tipper, recipient, amount, timestamp');
  }

  // Validate addresses
  if (!ethers.isAddress(tipper)) {
    throw new Error(`Invalid tipper address: ${tipper}`);
  }
  if (!ethers.isAddress(recipient)) {
    throw new Error(`Invalid recipient address: ${recipient}`);
  }

  // Generate cryptographically secure random nonce
  const randomNonce = crypto.randomBytes(32);
  
  // Convert amount to BigInt to ensure consistent encoding
  let amountBigInt;
  try {
    amountBigInt = BigInt(amount);
  } catch (error) {
    throw new Error(`Invalid amount format: ${amount}`);
  }

  // Encode all parameters using ethers ABI encoding for consistency
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    [
      'address',  // tipper
      'address',  // recipient  
      'uint256',  // amount
      'uint256',  // timestamp
      'string',   // castHash (empty string if not provided)
      'string',   // message (empty string if not provided)
      'bytes32'   // randomNonce
    ],
    [
      tipper.toLowerCase(),
      recipient.toLowerCase(), 
      amountBigInt,
      BigInt(timestamp),
      castHash,
      message,
      randomNonce
    ]
  );

  // Generate final hash using keccak256
  const tipHash = ethers.keccak256(encoded);
  
  return tipHash;
}

/**
 * Validate tipHash format
 * @param {string} tipHash - Hash to validate
 * @returns {boolean} True if valid format
 */
function isValidTipHash(tipHash) {
  // Check if it's a valid 32-byte hex string with 0x prefix
  return typeof tipHash === 'string' && 
         /^0x[a-fA-F0-9]{64}$/.test(tipHash);
}

/**
 * Generate tipHash specifically for Farcaster tips
 * @param {Object} params - Farcaster tip parameters
 * @param {string} params.tipperWalletAddress - Tipper wallet
 * @param {string} params.recipientWalletAddress - Recipient wallet  
 * @param {number} params.tipAmount - Amount in STEAK tokens (will be converted to wei)
 * @param {string} params.castHash - Farcaster cast hash
 * @param {string} params.message - Optional message
 * @returns {Object} { tipHash, tipData }
 */
function generateFarcasterTipHash({ 
  tipperWalletAddress, 
  recipientWalletAddress, 
  tipAmount, 
  castHash, 
  message = '' 
}) {
  // Convert tip amount from STEAK tokens to wei
  const amountWei = ethers.parseEther(tipAmount.toString()).toString();
  
  // Current timestamp
  const timestamp = Math.floor(Date.now() / 1000);
  
  // Generate secure tipHash
  const tipHash = generateTipHash({
    tipper: tipperWalletAddress,
    recipient: recipientWalletAddress,
    amount: amountWei,
    timestamp,
    castHash,
    message
  });

  // Return both hash and the data used to generate it (for verification)
  return {
    tipHash,
    tipData: {
      tipper: tipperWalletAddress.toLowerCase(),
      recipient: recipientWalletAddress.toLowerCase(),
      amount: amountWei,
      timestamp,
      castHash,
      message
    }
  };
}

/**
 * Generate tipHash for direct wallet-to-wallet tips
 * @param {Object} params - Direct tip parameters
 * @param {string} params.tipperWalletAddress - Tipper wallet
 * @param {string} params.recipientWalletAddress - Recipient wallet
 * @param {number} params.tipAmount - Amount in STEAK tokens
 * @param {string} params.message - Optional message
 * @returns {Object} { tipHash, tipData }
 */
function generateDirectTipHash({ 
  tipperWalletAddress, 
  recipientWalletAddress, 
  tipAmount, 
  message = '' 
}) {
  // Convert tip amount from STEAK tokens to wei
  const amountWei = ethers.parseEther(tipAmount.toString()).toString();
  
  // Current timestamp
  const timestamp = Math.floor(Date.now() / 1000);
  
  // Generate secure tipHash (no castHash for direct tips)
  const tipHash = generateTipHash({
    tipper: tipperWalletAddress,
    recipient: recipientWalletAddress,
    amount: amountWei,
    timestamp,
    castHash: '',
    message
  });

  return {
    tipHash,
    tipData: {
      tipper: tipperWalletAddress.toLowerCase(),
      recipient: recipientWalletAddress.toLowerCase(),
      amount: amountWei,
      timestamp,
      castHash: '',
      message
    }
  };
}

/**
 * Verify if a tipHash was generated correctly (for debugging)
 * @param {string} tipHash - Hash to verify
 * @param {Object} originalData - Original data used to generate hash
 * @returns {boolean} True if hash matches
 */
function verifyTipHash(tipHash, originalData) {
  try {
    const regeneratedHash = generateTipHash(originalData);
    return regeneratedHash === tipHash;
  } catch (error) {
    console.error('Error verifying tipHash:', error);
    return false;
  }
}

module.exports = {
  generateTipHash,
  generateFarcasterTipHash,
  generateDirectTipHash,
  isValidTipHash,
  verifyTipHash
};