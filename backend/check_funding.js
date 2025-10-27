const { ethers } = require('ethers');

const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
const contractAddress = '0xdA9BD5c259Ae90e99158f45f00238d1BaDb3694D';
const steakTokenAddress = '0x1C96D434DEb1fF21Fc5406186Eef1f970fAF3B07';

async function checkFunding() {
  try {
    console.log('🔍 Analyzing token funding...');
    
    // Get the latest block number
    const latestBlock = await provider.getBlockNumber();
    console.log(`📦 Latest block: ${latestBlock}`);
    
    // Check events from the last 10000 blocks to see how tokens arrived
    const fromBlock = latestBlock - 10000;
    
    // ERC20 Transfer event signature
    const transferTopic = ethers.id("Transfer(address,address,uint256)");
    
    const filter = {
      address: steakTokenAddress,
      topics: [
        transferTopic,
        null, // from (any address)
        ethers.zeroPadValue(contractAddress, 32) // to our contract
      ],
      fromBlock: fromBlock,
      toBlock: latestBlock
    };
    
    console.log('🔍 Looking for STEAK transfers to contract...');
    const logs = await provider.getLogs(filter);
    
    console.log(`📥 Found ${logs.length} STEAK transfers to contract:`);
    
    for (const log of logs) {
      const decoded = {
        from: '0x' + log.topics[1].slice(26),
        to: '0x' + log.topics[2].slice(26), 
        amount: ethers.formatEther(log.data)
      };
      
      console.log(`  📨 ${decoded.amount} STEAK from ${decoded.from} (tx: ${log.transactionHash})`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkFunding();