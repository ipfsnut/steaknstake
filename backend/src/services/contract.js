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

// Contract configuration
const STEAKNSTAKE_CONTRACT_ADDRESS = process.env.STEAKNSTAKE_CONTRACT_ADDRESS;
const STEAK_TOKEN_ADDRESS = process.env.STEAK_TOKEN_ADDRESS || '0x1C96D434DEb1fF21Fc5406186Eef1f970fAF3B07';
const BASE_RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';

// Complete ABI for SteakNStake contract v3.0.0-tipn-tipping
const STEAKNSTAKE_ABI = [
  // View functions
  {
    "inputs": [{"name": "user", "type": "address"}],
    "name": "getAvailableTipAllowance",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "user", "type": "address"}],
    "name": "getStakedAmount",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "user", "type": "address"}],
    "name": "getTippedOut",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "user", "type": "address"}],
    "name": "getTotalEarnedAllowances",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalStaked",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalRewardsDistributed",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalTipsSent",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "version",
    "outputs": [{"name": "", "type": "string"}],
    "stateMutability": "pure",
    "type": "function"
  },
  // Distributor functions (backend acts as distributor)
  {
    "inputs": [{"name": "rewardQuantity", "type": "uint256"}],
    "name": "split",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "recipient", "type": "address"},
      {"name": "amount", "type": "uint256"},
      {"name": "tipHash", "type": "bytes32"}
    ],
    "name": "allocateTip",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "recipient", "type": "address"},
      {"name": "amount", "type": "uint256"},
      {"name": "tipHash", "type": "bytes32"}
    ],
    "name": "claimTip",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // Events
  {
    "anonymous": false,
    "inputs": [
      {"indexed": false, "name": "amount", "type": "uint256"},
      {"indexed": true, "name": "distributor", "type": "address"}
    ],
    "name": "RewardsSplit",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "tipper", "type": "address"},
      {"indexed": true, "name": "recipient", "type": "address"},
      {"indexed": false, "name": "amount", "type": "uint256"},
      {"indexed": true, "name": "tipHash", "type": "bytes32"}
    ],
    "name": "TipSent",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "recipient", "type": "address"},
      {"indexed": false, "name": "amount", "type": "uint256"},
      {"indexed": true, "name": "tipHash", "type": "bytes32"}
    ],
    "name": "TipClaimed",
    "type": "event"
  }
];

// ERC20 ABI for STEAK token operations
const ERC20_ABI = [
  {
    "inputs": [{"name": "account", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "spender", "type": "address"},
      {"name": "amount", "type": "uint256"}
    ],
    "name": "approve",
    "outputs": [{"name": "", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "owner", "type": "address"},
      {"name": "spender", "type": "address"}
    ],
    "name": "allowance",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }
];

class ContractService {
  constructor() {
    if (!STEAKNSTAKE_CONTRACT_ADDRESS) {
      logger.warn('STEAKNSTAKE_CONTRACT_ADDRESS not set, contract operations will fail');
    }
    
    // Initialize provider
    this.provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
    
    // Initialize distributor wallet (backend signs transactions)
    if (process.env.DISTRIBUTOR_PRIVATE_KEY) {
      this.distributorWallet = new ethers.Wallet(process.env.DISTRIBUTOR_PRIVATE_KEY, this.provider);
      logger.info('Distributor wallet initialized', { address: this.distributorWallet.address });
    } else {
      logger.warn('DISTRIBUTOR_PRIVATE_KEY not set, write operations will fail');
    }
    
    // Initialize contracts
    this.steakContract = new ethers.Contract(STEAK_TOKEN_ADDRESS, ERC20_ABI, this.provider);
    
    if (STEAKNSTAKE_CONTRACT_ADDRESS && this.distributorWallet) {
      this.steakNStakeContract = new ethers.Contract(
        STEAKNSTAKE_CONTRACT_ADDRESS, 
        STEAKNSTAKE_ABI, 
        this.distributorWallet
      );
      this.steakNStakeReadOnly = new ethers.Contract(
        STEAKNSTAKE_CONTRACT_ADDRESS, 
        STEAKNSTAKE_ABI, 
        this.provider
      );
    }
  }

  // View functions (read-only, no gas required)
  async getAvailableTipAllowance(userAddress) {
    try {
      const allowanceWei = await this.steakNStakeReadOnly.getAvailableTipAllowance(userAddress);
      return ethers.formatEther(allowanceWei);
    } catch (error) {
      logger.error('Error getting tip allowance:', error);
      throw new Error(`Failed to get tip allowance: ${error.message}`);
    }
  }

  async getStakedAmount(userAddress) {
    try {
      const stakedWei = await this.steakNStakeReadOnly.getStakedAmount(userAddress);
      return ethers.formatEther(stakedWei);
    } catch (error) {
      logger.error('Error getting staked amount:', error);
      throw new Error(`Failed to get staked amount: ${error.message}`);
    }
  }

  async getTippedOut(userAddress) {
    try {
      const tippedWei = await this.steakNStakeReadOnly.getTippedOut(userAddress);
      return ethers.formatEther(tippedWei);
    } catch (error) {
      logger.error('Error getting tipped out amount:', error);
      throw new Error(`Failed to get tipped out amount: ${error.message}`);
    }
  }

  async getContractStats() {
    try {
      const [totalStaked, totalRewardsDistributed, totalTipsSent, version] = await Promise.all([
        this.steakNStakeReadOnly.totalStaked(),
        this.steakNStakeReadOnly.totalRewardsDistributed(),
        this.steakNStakeReadOnly.totalTipsSent(),
        this.steakNStakeReadOnly.version()
      ]);

      return {
        totalStaked: ethers.formatEther(totalStaked),
        totalRewardsDistributed: ethers.formatEther(totalRewardsDistributed),
        totalTipsSent: ethers.formatEther(totalTipsSent),
        version
      };
    } catch (error) {
      logger.error('Error getting contract stats:', error);
      throw new Error(`Failed to get contract stats: ${error.message}`);
    }
  }

  // Distributor functions (require gas, backend signs)
  async allocateTip(recipientAddress, amountInSteak, tipHash) {
    try {
      if (!this.steakNStakeContract) {
        throw new Error('Contract not initialized - missing address or private key');
      }

      const amountWei = ethers.parseEther(amountInSteak.toString());
      
      logger.info('Calling allocateTip', {
        recipient: recipientAddress,
        amount: amountInSteak,
        amountWei: amountWei.toString(),
        tipHash
      });

      // Estimate gas first
      const gasEstimate = await this.steakNStakeContract.allocateTip.estimateGas(
        recipientAddress,
        amountWei,
        tipHash
      );

      logger.info('Gas estimate for allocateTip:', { gasEstimate: gasEstimate.toString() });

      // Send transaction with gas limit buffer
      const tx = await this.steakNStakeContract.allocateTip(
        recipientAddress,
        amountWei,
        tipHash,
        { gasLimit: gasEstimate * 120n / 100n } // 20% buffer
      );

      logger.info('allocateTip transaction sent', { 
        txHash: tx.hash,
        gasLimit: tx.gasLimit?.toString(),
        gasPrice: tx.gasPrice?.toString()
      });

      return {
        hash: tx.hash,
        transaction: tx
      };

    } catch (error) {
      logger.error('Error in allocateTip:', error);
      
      // Parse contract revert reasons
      if (error.message?.includes('Insufficient tip allowance')) {
        throw new Error('Insufficient tip allowance. You may need to wait for more rewards or stake more STEAK.');
      } else if (error.message?.includes('Cannot tip yourself')) {
        throw new Error('You cannot tip yourself.');
      } else if (error.message?.includes('Tip already processed')) {
        throw new Error('This tip has already been processed.');
      }
      
      throw new Error(`Failed to allocate tip: ${error.message}`);
    }
  }

  async claimTip(recipientAddress, amountInSteak, tipHash) {
    try {
      if (!this.steakNStakeContract) {
        throw new Error('Contract not initialized - missing address or private key');
      }

      const amountWei = ethers.parseEther(amountInSteak.toString());
      
      logger.info('Calling claimTip', {
        recipient: recipientAddress,
        amount: amountInSteak,
        amountWei: amountWei.toString(),
        tipHash
      });

      // Estimate gas first
      const gasEstimate = await this.steakNStakeContract.claimTip.estimateGas(
        recipientAddress,
        amountWei,
        tipHash
      );

      logger.info('Gas estimate for claimTip:', { gasEstimate: gasEstimate.toString() });

      // Send transaction
      const tx = await this.steakNStakeContract.claimTip(
        recipientAddress,
        amountWei,
        tipHash,
        { gasLimit: gasEstimate * 120n / 100n } // 20% buffer
      );

      logger.info('claimTip transaction sent', { 
        txHash: tx.hash,
        gasLimit: tx.gasLimit?.toString(),
        gasPrice: tx.gasPrice?.toString()
      });

      return {
        hash: tx.hash,
        transaction: tx
      };

    } catch (error) {
      logger.error('Error in claimTip:', error);
      
      // Parse contract revert reasons
      if (error.message?.includes('Tip not found')) {
        throw new Error('Tip not found on blockchain or already claimed.');
      } else if (error.message?.includes('Amount mismatch')) {
        throw new Error('Tip amount mismatch. Please contact support.');
      }
      
      throw new Error(`Failed to claim tip: ${error.message}`);
    }
  }

  async splitRewards(amountInSteak) {
    try {
      if (!this.steakNStakeContract) {
        throw new Error('Contract not initialized - missing address or private key');
      }

      const amountWei = ethers.parseEther(amountInSteak.toString());
      
      logger.info('Calling split (reward distribution)', {
        amount: amountInSteak,
        amountWei: amountWei.toString(),
        distributor: this.distributorWallet.address
      });

      // Estimate gas first
      const gasEstimate = await this.steakNStakeContract.split.estimateGas(amountWei);
      logger.info('Gas estimate for split:', { gasEstimate: gasEstimate.toString() });

      // Send transaction
      const tx = await this.steakNStakeContract.split(
        amountWei,
        { gasLimit: gasEstimate * 120n / 100n } // 20% buffer
      );

      logger.info('split transaction sent', { 
        txHash: tx.hash,
        gasLimit: tx.gasLimit?.toString(),
        gasPrice: tx.gasPrice?.toString()
      });

      return {
        hash: tx.hash,
        transaction: tx
      };

    } catch (error) {
      logger.error('Error in split:', error);
      throw new Error(`Failed to split rewards: ${error.message}`);
    }
  }

  // Utility functions
  async waitForTransaction(txHash, confirmations = 1) {
    try {
      logger.info('Waiting for transaction confirmation', { txHash, confirmations });
      const receipt = await this.provider.waitForTransaction(txHash, confirmations);
      logger.info('Transaction confirmed', { 
        txHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed?.toString(),
        status: receipt.status
      });
      return receipt;
    } catch (error) {
      logger.error('Error waiting for transaction:', error);
      throw new Error(`Transaction failed: ${error.message}`);
    }
  }

  // Check if backend is authorized as distributor
  async isAuthorizedDistributor() {
    try {
      if (!this.steakNStakeReadOnly || !this.distributorWallet) {
        return false;
      }
      
      const isDistributor = await this.steakNStakeReadOnly.isDistributor(this.distributorWallet.address);
      logger.info('Distributor authorization check', { 
        address: this.distributorWallet.address,
        isDistributor 
      });
      
      return isDistributor;
    } catch (error) {
      logger.error('Error checking distributor authorization:', error);
      return false;
    }
  }
}

// Export singleton instance
const contractService = new ContractService();
module.exports = contractService;