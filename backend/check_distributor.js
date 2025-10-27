const { ethers } = require('ethers');

const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
const contractAddress = '0xdA9BD5c259Ae90e99158f45f00238d1BaDb3694D';
const protocolWallet = '0xD31C0C3BdDAcc482Aa5fE64d27cDDBaB72864733';

const contractABI = [
  {
    "inputs": [{"internalType": "address", "name": "account", "type": "address"}],
    "name": "isDistributor",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [{"internalType": "address", "name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
  }
];

async function checkDistributor() {
  try {
    console.log('🔍 Checking distributor status...');
    
    const contract = new ethers.Contract(contractAddress, contractABI, provider);
    
    // Check if protocol wallet is distributor
    const isDistributor = await contract.isDistributor(protocolWallet);
    console.log(`🎯 Is protocol wallet distributor? ${isDistributor}`);
    
    // Check contract owner
    const owner = await contract.owner();
    console.log(`👑 Contract owner: ${owner}`);
    console.log(`🔑 Protocol wallet: ${protocolWallet}`);
    console.log(`✅ Is protocol wallet the owner? ${owner.toLowerCase() === protocolWallet.toLowerCase()}`);
    
    // The modifier says: distributors[msg.sender] || msg.sender == owner()
    // So either distributor OR owner can call split
    const canCallSplit = isDistributor || (owner.toLowerCase() === protocolWallet.toLowerCase());
    console.log(`🎯 Can call split() function? ${canCallSplit}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkDistributor();