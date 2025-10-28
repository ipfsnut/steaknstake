const { ethers } = require('ethers');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()]
});

// Contract addresses and configuration
const CONTRACTS = {
  STEAK_TOKEN: '0x1C96D434DEb1fF21Fc5406186Eef1f970fAF3B07',
  STEAKNSTAKE: '0xdA9BD5c259Ae90e99158f45f00238d1BaDb3694D'
};

const PROTOCOL_WALLET = '0xD31C0C3BdDAcc482Aa5fE64d27cDDBaB72864733';

// ERC20 ABI for approvals
const ERC20_ABI = [
  {
    "inputs": [
      {"internalType": "address", "name": "spender", "type": "address"},
      {"internalType": "uint256", "name": "amount", "type": "uint256"}
    ],
    "name": "approve",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "address", "name": "owner", "type": "address"},
      {"internalType": "address", "name": "spender", "type": "address"}
    ],
    "name": "allowance",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }
];

// SteakNStake contract ABI (tip claiming functions)
const STEAKNSTAKE_ABI = [
  {
    "inputs": [
      {"internalType": "address", "name": "recipient", "type": "address"},
      {"internalType": "uint256", "name": "amount", "type": "uint256"},
      {"internalType": "bytes32", "name": "tipHash", "type": "bytes32"}
    ],
    "name": "claimTip",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "rewardQuantity", "type": "uint256"}],
    "name": "split",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "amount", "type": "uint256"}],
    "name": "fundContract",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

// Initialize provider and contract
function getProvider() {
  const rpcUrl = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
  return new ethers.JsonRpcProvider(rpcUrl);
}

function getSigner() {
  const provider = getProvider();
  const privateKey = process.env.PROTOCOL_WALLET_PRIVATE_KEY;
  
  if (!privateKey || privateKey === 'your_protocol_wallet_private_key_here') {
    throw new Error('PROTOCOL_WALLET_PRIVATE_KEY environment variable not set');
  }
  
  return new ethers.Wallet(privateKey, provider);
}

function getContract() {
  const signer = getSigner();
  return new ethers.Contract(CONTRACTS.STEAKNSTAKE, STEAKNSTAKE_ABI, signer);
}

// Call the smart contract split() function to distribute rewards
async function callContractSplit(rewardAmountSteak) {
  try {
    logger.info(`🔗 Calling contract split() for ${rewardAmountSteak} STEAK`);
    
    // Convert STEAK amount to wei (18 decimals)
    const rewardAmountWei = ethers.parseEther(rewardAmountSteak.toString());
    
    logger.info(`📊 Contract call details:`, {
      contractAddress: CONTRACTS.STEAKNSTAKE,
      protocolWallet: PROTOCOL_WALLET,
      rewardAmount: rewardAmountSteak,
      rewardAmountWei: rewardAmountWei.toString()
    });
    
    // Get contract instance
    const contract = getContract();
    
    // Estimate gas first
    const gasEstimate = await contract.split.estimateGas(rewardAmountWei);
    logger.info(`⛽ Estimated gas: ${gasEstimate.toString()}`);
    
    // Call split function
    const tx = await contract.split(rewardAmountWei, {
      gasLimit: gasEstimate + BigInt(50000), // Add 50k gas buffer
    });
    
    logger.info(`📝 Transaction submitted: ${tx.hash}`);
    
    // Wait for confirmation
    const receipt = await tx.wait();
    
    logger.info(`✅ Split transaction confirmed:`, {
      hash: tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      status: receipt.status
    });
    
    return {
      success: true,
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString()
    };
    
  } catch (error) {
    logger.error('❌ Contract split failed:', error);
    
    if (error.code === 'INSUFFICIENT_FUNDS') {
      throw new Error('Insufficient ETH for gas fees in protocol wallet');
    } else if (error.reason) {
      throw new Error(`Contract error: ${error.reason}`);
    } else {
      throw new Error(`Split transaction failed: ${error.message}`);
    }
  }
}

// Test contract connection
async function testContractConnection() {
  try {
    const provider = getProvider();
    const network = await provider.getNetwork();
    logger.info(`🌐 Connected to network: ${network.name} (chainId: ${network.chainId})`);
    
    const signer = getSigner();
    const address = await signer.getAddress();
    const balance = await provider.getBalance(address);
    
    logger.info(`💰 Protocol wallet: ${address}`);
    logger.info(`💰 ETH balance: ${ethers.formatEther(balance)} ETH`);
    
    return {
      connected: true,
      network: network.name,
      chainId: network.chainId.toString(),
      protocolWallet: address,
      ethBalance: ethers.formatEther(balance)
    };
    
  } catch (error) {
    logger.error('❌ Contract connection test failed:', error);
    return {
      connected: false,
      error: error.message
    };
  }
}

// Call the smart contract fundContract() function to register rewards
async function callFundContract(rewardAmountSteak) {
  try {
    logger.info(`💰 Calling fundContract() for ${rewardAmountSteak} STEAK`);
    
    // Convert STEAK amount to wei (18 decimals)
    const rewardAmountWei = ethers.parseEther(rewardAmountSteak.toString());
    
    logger.info(`📊 Fund contract call details:`, {
      contractAddress: CONTRACTS.STEAKNSTAKE,
      protocolWallet: PROTOCOL_WALLET,
      rewardAmount: rewardAmountSteak,
      rewardAmountWei: rewardAmountWei.toString()
    });
    
    // Get contract instance
    const contract = getContract();
    
    // Estimate gas first
    const gasEstimate = await contract.fundContract.estimateGas(rewardAmountWei);
    logger.info(`⛽ Estimated gas: ${gasEstimate.toString()}`);
    
    // Call fundContract function
    const tx = await contract.fundContract(rewardAmountWei, {
      gasLimit: gasEstimate + BigInt(50000), // Add 50k gas buffer
    });
    
    logger.info(`📝 Fund transaction submitted: ${tx.hash}`);
    
    // Wait for confirmation
    const receipt = await tx.wait();
    
    logger.info(`✅ Fund transaction confirmed:`, {
      hash: tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      status: receipt.status
    });
    
    return {
      success: true,
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString()
    };
    
  } catch (error) {
    logger.error('❌ Contract funding failed:', error);
    
    if (error.code === 'INSUFFICIENT_FUNDS') {
      throw new Error('Insufficient ETH for gas fees in protocol wallet');
    } else if (error.reason) {
      throw new Error(`Contract error: ${error.reason}`);
    } else {
      throw new Error(`Fund transaction failed: ${error.message}`);
    }
  }
}

// Approve the SteakNStake contract to spend STEAK tokens from protocol wallet
async function approveContractSpending(amount) {
  try {
    logger.info(`🔓 Approving SteakNStake contract to spend ${amount} STEAK tokens`);
    
    const amountWei = ethers.parseEther(amount.toString());
    const signer = getSigner();
    
    // Create STEAK token contract instance
    const steakToken = new ethers.Contract(CONTRACTS.STEAK_TOKEN, ERC20_ABI, signer);
    
    // Approve the SteakNStake contract to spend tokens from protocol wallet
    logger.info(`📋 Approving ${CONTRACTS.STEAKNSTAKE} to spend ${amount} STEAK`);
    
    const gasEstimate = await steakToken.approve.estimateGas(CONTRACTS.STEAKNSTAKE, amountWei);
    logger.info(`⛽ Estimated gas: ${gasEstimate.toString()}`);
    
    const tx = await steakToken.approve(CONTRACTS.STEAKNSTAKE, amountWei, {
      gasLimit: gasEstimate + BigInt(50000)
    });
    
    logger.info(`📝 Approval transaction submitted: ${tx.hash}`);
    
    const receipt = await tx.wait();
    
    logger.info(`✅ Approval confirmed:`, {
      hash: tx.hash,
      blockNumber: receipt.blockNumber,
      approved: ethers.formatEther(amountWei) + ' STEAK'
    });
    
    return {
      success: true,
      transactionHash: tx.hash,
      approvedAmount: amount
    };
    
  } catch (error) {
    logger.error('❌ Approval failed:', error);
    throw new Error(`Approval failed: ${error.message}`);
  }
}

// Call the smart contract claimTip() function to make tips claimable
async function callContractClaimTip(recipientAddress, tipAmountSteak, castHash) {
  try {
    logger.info(`🎁 Making tip claimable: ${tipAmountSteak} STEAK for ${recipientAddress}`);
    
    // Convert STEAK amount to wei (18 decimals)
    const tipAmountWei = ethers.parseEther(tipAmountSteak.toString());
    
    // Convert cast hash to bytes32
    const tipHash = ethers.id(castHash); // keccak256 hash of cast hash
    
    logger.info(`📊 Contract claimTip call:`, {
      contractAddress: CONTRACTS.STEAKNSTAKE,
      recipient: recipientAddress,
      amount: tipAmountSteak,
      amountWei: tipAmountWei.toString(),
      castHash: castHash,
      tipHash: tipHash
    });
    
    // Get contract instance
    const contract = getContract();
    
    // Estimate gas first
    const gasEstimate = await contract.claimTip.estimateGas(recipientAddress, tipAmountWei, tipHash);
    logger.info(`⛽ Estimated gas: ${gasEstimate.toString()}`);
    
    // Call claimTip function
    const tx = await contract.claimTip(recipientAddress, tipAmountWei, tipHash, {
      gasLimit: gasEstimate + BigInt(50000), // Add 50k gas buffer
    });
    
    logger.info(`📝 ClaimTip transaction submitted: ${tx.hash}`);
    
    // Wait for confirmation
    const receipt = await tx.wait();
    
    logger.info(`✅ ClaimTip transaction confirmed:`, {
      hash: tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      status: receipt.status
    });
    
    return {
      success: true,
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString()
    };
    
  } catch (error) {
    logger.error('❌ Contract claimTip failed:', error);
    
    if (error.code === 'INSUFFICIENT_FUNDS') {
      throw new Error('Insufficient ETH for gas fees in protocol wallet');
    } else if (error.reason) {
      throw new Error(`Contract error: ${error.reason}`);
    } else {
      throw new Error(`ClaimTip transaction failed: ${error.message}`);
    }
  }
}

module.exports = {
  callContractSplit,
  callFundContract,
  callContractClaimTip,
  approveContractSpending,
  testContractConnection
};