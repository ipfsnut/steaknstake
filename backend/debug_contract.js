const { ethers } = require('ethers');

const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
const contractAddress = '0xdA9BD5c259Ae90e99158f45f00238d1BaDb3694D';
const protocolWallet = '0xD31C0C3BdDAcc482Aa5fE64d27cDDBaB72864733';

// Add owner function to ABI
const contractABI = [
  {
    "inputs": [],
    "name": "owner",
    "outputs": [{"internalType": "address", "name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "rewardQuantity", "type": "uint256"}],
    "name": "split",
    "outputs": [],
    "stateMutability": "nonpayable", 
    "type": "function"
  }
];

async function debugContract() {
  try {
    console.log('🔍 Debugging contract access...');
    
    const contract = new ethers.Contract(contractAddress, contractABI, provider);
    
    // Check contract owner
    try {
      const owner = await contract.owner();
      console.log(`👑 Contract owner: ${owner}`);
      console.log(`🔑 Protocol wallet: ${protocolWallet}`);
      console.log(`✅ Is protocol wallet the owner? ${owner.toLowerCase() === protocolWallet.toLowerCase()}`);
    } catch (e) {
      console.log('❌ No owner() function or error:', e.message);
    }
    
    // Try to get more contract info
    console.log(`📍 Contract: ${contractAddress}`);
    console.log(`💼 Caller: ${protocolWallet}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

debugContract();