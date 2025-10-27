const { ethers } = require('ethers');

const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
const protocolWallet = '0xD31C0C3BdDAcc482Aa5fE64d27cDDBaB72864733';
const steakTokenAddress = '0x1C96D434DEb1fF21Fc5406186Eef1f970fAF3B07';

const steakABI = [
  {
    "inputs": [{"internalType": "address", "name": "account", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }
];

async function checkProtocolBalance() {
  try {
    console.log('🔍 Checking protocol wallet STEAK balance...');
    
    const steakToken = new ethers.Contract(steakTokenAddress, steakABI, provider);
    const balance = await steakToken.balanceOf(protocolWallet);
    
    console.log(`💰 Protocol wallet (${protocolWallet})`);
    console.log(`💰 STEAK balance: ${ethers.formatEther(balance)} STEAK`);
    
    if (balance > 0) {
      console.log('✅ Protocol wallet has STEAK! Ready to call split() function.');
    } else {
      console.log('❌ Protocol wallet has no STEAK tokens.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkProtocolBalance();