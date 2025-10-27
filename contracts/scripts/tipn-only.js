const { ethers } = require("ethers");

async function main() {
  // Connect directly to Base RPC without Hardhat
  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");
  
  const tipnAddress = "0x2e4379103324ec28525c1f0776ce404e612d41a4";
  
  console.log("🔍 Examining TipN contract at:", tipnAddress);
  
  // Get basic contract info
  const code = await provider.getCode(tipnAddress);
  
  if (code === "0x") {
    console.log("❌ No contract found at this address");
    return;
  }
  
  console.log("✅ Contract exists");
  console.log("📏 Bytecode length:", code.length);
  
  // Try common function signatures
  const functions = [
    { sig: "name()", desc: "Token Name" },
    { sig: "symbol()", desc: "Token Symbol" },
    { sig: "decimals()", desc: "Decimals" },
    { sig: "totalSupply()", desc: "Total Supply" },
    { sig: "balanceOf(address)", desc: "Balance Of" },
    { sig: "allowance(address,address)", desc: "Allowance" },
    { sig: "stake(uint256)", desc: "Stake" },
    { sig: "unstake(uint256)", desc: "Unstake" },
    { sig: "tipBalance(address)", desc: "Tip Balance" },
    { sig: "claimTips()", desc: "Claim Tips" },
    { sig: "sendTip(address,uint256)", desc: "Send Tip" },
    { sig: "owner()", desc: "Owner" },
    { sig: "paused()", desc: "Paused" }
  ];
  
  console.log("\n🔧 Checking for functions:");
  
  for (const func of functions) {
    try {
      const iface = new ethers.Interface([`function ${func.sig} view returns (uint256)`]);
      
      let params = [];
      if (func.sig.includes('address')) {
        params = ['0x0000000000000000000000000000000000000000'];
        if (func.sig.includes(',address')) params.push('0x0000000000000000000000000000000000000000');
      }
      
      const data = iface.encodeFunctionData(func.sig.split('(')[0], params);
      
      const result = await provider.call({
        to: tipnAddress,
        data: data
      });
      
      if (result !== "0x") {
        console.log(`✅ ${func.desc} (${func.sig})`);
        
        // Try to decode result for simple functions
        if (func.sig === "name()" || func.sig === "symbol()") {
          try {
            const decoded = iface.decodeFunctionResult(func.sig.split('(')[0], result)[0];
            console.log(`   → ${decoded}`);
          } catch (e) {}
        }
      }
    } catch (error) {
      // Function doesn't exist or reverts
    }
  }
}

main().catch(console.error);