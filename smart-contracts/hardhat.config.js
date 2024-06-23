require("@nomicfoundation/hardhat-toolbox");
require("hardhat-deploy");
require('@nomicfoundation/hardhat-verify');
require('dotenv').config();

const { INFURA_API_KEY, ALCHEMY_API_KEY, SEPOLIA_PRIVATE_KEY, SEPOLIA_MNEMONIC, ETHERSCAN_API_KEY } = process.env;

if (!(SEPOLIA_PRIVATE_KEY || SEPOLIA_MNEMONIC)) {
  throw new Error("Set SEPOLIA_PRIVATE_KEY or SEPOLIA_MNEMONIC in .env");
}

if (!(INFURA_API_KEY || ALCHEMY_API_KEY)) {
  throw new Error("Set INFURA_API_KEY or ALCHEMY_API_KEY in .env");
}

if (!ETHERSCAN_API_KEY) {
  throw new Error("Set ETHERSCAN_API_KEY in .env");
}

const sepoliaUrl = INFURA_API_KEY
  ? `https://sepolia.infura.io/v3/${INFURA_API_KEY}`
  : `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;

const sepoliaAccounts = SEPOLIA_PRIVATE_KEY
  ? [SEPOLIA_PRIVATE_KEY]
  : { mnemonic: SEPOLIA_MNEMONIC };

const sepolia = {
  url: sepoliaUrl,
  accounts: sepoliaAccounts,
};

const hardhat = {
  chainId: 31337
}; 
const localhost = {
  url: "http://127.0.0.1:8545"
};

const etherscan = {
  apiKey: {
    sepolia: ETHERSCAN_API_KEY
  }
};


/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version:"0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
      //viaIR: true,
    }
  },
  networks: {
    sepolia, hardhat, localhost
  },
  namedAccounts: {
    deployer: {
        default: 0,
    },
  },
  etherscan
};
