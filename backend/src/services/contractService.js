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

// SteakNStake contract ABI (split and fund functions)
const STEAKNSTAKE_ABI = [
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

module.exports = {
  callContractSplit,
  callFundContract,
  testContractConnection
};