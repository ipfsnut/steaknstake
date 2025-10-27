const { ethers } = require("ethers");

async function main() {
  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");
  const tipnAddress = "0x2e4379103324ec28525c1f0776ce404e612d41a4";
  
  console.log("🔍 Checking if TipN is a proxy contract...");
  
  // Check for EIP-1967 proxy storage slots
  const slots = {
    implementation: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
    admin: "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103",
    beacon: "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50"
  };
  
  for (const [name, slot] of Object.entries(slots)) {
    try {
      const value = await provider.getStorage(tipnAddress, slot);
      if (value !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
        console.log(`✅ ${name.toUpperCase()} PROXY DETECTED`);
        if (name === "implementation") {
          const implAddress = "0x" + value.slice(-40);
          console.log(`📍 Implementation: ${implAddress}`);
          
          // Check implementation code
          const implCode = await provider.getCode(implAddress);
          console.log(`📏 Implementation code length: ${implCode.length}`);
        }
        if (name === "admin") {
          const adminAddress = "0x" + value.slice(-40);
          console.log(`👑 Admin: ${adminAddress}`);
        }
      }
    } catch (error) {
      console.log(`❌ Error checking ${name}:`, error.message);
    }
  }
  
  // Also check for older proxy patterns
  try {
    // Check for simple delegatecall proxy
    const code = await provider.getCode(tipnAddress);
    if (code.includes("delegatecall")) {
      console.log("🔄 Contains delegatecall - likely a proxy");
    }
    
    // Check bytecode size - proxies are usually very small
    if (code.length < 1000) {
      console.log(`📦 Small bytecode (${code.length} chars) - likely a proxy`);
    }
  } catch (error) {
    console.log("❌ Error checking proxy patterns:", error.message);
  }
}

main().catch(console.error);