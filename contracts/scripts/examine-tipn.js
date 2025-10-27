const { ethers } = require("hardhat");

async function main() {
  const tipnAddress = "0x2e4379103324ec28525c1f0776ce404e612d41a4";
  
  console.log("🔍 Examining TipN contract at:", tipnAddress);
  
  // Get basic contract info
  const provider = ethers.provider;
  const code = await provider.getCode(tipnAddress);
  
  if (code === "0x") {
    console.log("❌ No contract found at this address");
    return;
  }
  
  console.log("✅ Contract exists");
  console.log("📏 Bytecode length:", code.length);
  
  // Try to get the contract interface by looking for common function signatures
  const commonFunctions = [
    "balanceOf(address)",
    "allowance(address,address)", 
    "transfer(address,uint256)",
    "approve(address,uint256)",
    "stake(uint256)",
    "unstake(uint256)",
    "claimTips()",
    "sendTip(address,uint256)",
    "updateAllowance(address)",
    "getAllowance(address)",
    "getBalance(address)",
    "tipBalance(address)",
    "claimableAmount(address)",
    "allocateTips(address,uint256)",
    "batchAllocate(address[],uint256[])",
    "owner()",
    "paused()",
    "version()"
  ];
  
  // Check which functions exist by calling them
  console.log("\n🔧 Checking for common functions:");
  
  for (const funcSig of commonFunctions) {
    try {
      const iface = new ethers.Interface([`function ${funcSig} view returns (uint256)`]);
      const data = iface.encodeFunctionData(funcSig.split('(')[0], 
        funcSig.includes('address') ? ['0x0000000000000000000000000000000000000000'] : []
      );
      
      const result = await provider.call({
        to: tipnAddress,
        data: data
      });
      
      if (result !== "0x") {
        console.log(`✅ ${funcSig} - exists`);
      }
    } catch (error) {
      // Function might not exist or might revert
    }
  }
  
  // Try to detect if it's an ERC20
  try {
    const erc20Interface = new ethers.Interface([
      "function name() view returns (string)",
      "function symbol() view returns (string)", 
      "function decimals() view returns (uint8)",
      "function totalSupply() view returns (uint256)"
    ]);
    
    const nameData = erc20Interface.encodeFunctionData("name");
    const nameResult = await provider.call({ to: tipnAddress, data: nameData });
    
    if (nameResult !== "0x") {
      const name = erc20Interface.decodeFunctionResult("name", nameResult)[0];
      console.log(`\n📛 Token Name: ${name}`);
      
      const symbolData = erc20Interface.encodeFunctionData("symbol");
      const symbolResult = await provider.call({ to: tipnAddress, data: symbolData });
      const symbol = erc20Interface.decodeFunctionResult("symbol", symbolResult)[0];
      console.log(`🏷️  Token Symbol: ${symbol}`);
      
      const decimalsData = erc20Interface.encodeFunctionData("decimals");
      const decimalsResult = await provider.call({ to: tipnAddress, data: decimalsData });
      const decimals = erc20Interface.decodeFunctionResult("decimals", decimalsResult)[0];
      console.log(`🔢 Decimals: ${decimals}`);
      
      const supplyData = erc20Interface.encodeFunctionData("totalSupply");
      const supplyResult = await provider.call({ to: tipnAddress, data: supplyData });
      const totalSupply = erc20Interface.decodeFunctionResult("totalSupply", supplyResult)[0];
      console.log(`💰 Total Supply: ${ethers.formatUnits(totalSupply, decimals)}`);
    }
  } catch (error) {
    console.log("❌ Not a standard ERC20 token");
  }
}

main().catch(console.error);