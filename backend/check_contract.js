const { ethers } = require('ethers');

// Contract setup
const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
const contractAddress = '0xdA9BD5c259Ae90e99158f45f00238d1BaDb3694D';
const steakTokenAddress = '0x1C96D434DEb1fF21Fc5406186Eef1f970fAF3B07';

// ABIs
const steakABI = [
  {
    "inputs": [{"internalType": "address", "name": "account", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }
];

const contractABI = [
  {
    "inputs": [],
    "name": "totalStaked",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalRewardsDistributed",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }
];

async function checkContract() {
  try {
    console.log('🔍 Checking contract state...');
    
    // Get contract instances
    const steakToken = new ethers.Contract(steakTokenAddress, steakABI, provider);
    const contract = new ethers.Contract(contractAddress, contractABI, provider);
    
    // Check STEAK balance in contract
    const steakBalance = await steakToken.balanceOf(contractAddress);
    console.log(`💰 STEAK balance in contract: ${ethers.formatEther(steakBalance)} STEAK`);
    
    // Check total staked
    const totalStaked = await contract.totalStaked();
    console.log(`🥩 Total staked: ${ethers.formatEther(totalStaked)} STEAK`);
    
    // Check total rewards distributed  
    const totalRewards = await contract.totalRewardsDistributed();
    console.log(`🎁 Total rewards distributed: ${ethers.formatEther(totalRewards)} STEAK`);
    
    // Calculate available for rewards (balance - staked amount)
    const availableForRewards = steakBalance - totalStaked;
    console.log(`✨ Available for rewards: ${ethers.formatEther(availableForRewards)} STEAK`);
    
  } catch (error) {
    console.error('❌ Error checking contract:', error.message);
  }
}

checkContract();