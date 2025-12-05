require("@nomiclabs/hardhat-ethers");
require("@nomicfoundation/hardhat-verify");
require("dotenv").config();
require("@nomiclabs/hardhat-waffle");
require("solidity-coverage");


module.exports = {
  solidity: "0.8.20",
  networks: {
    polygon_amoy: {
      url: process.env.POLYGON_AMOY_RPC_URL, // Alchemy or official Amoy RPC
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 80002,
    },
  },
  etherscan: {
    // Single API key for verification (V2 endpoint if supported)
    apiKey: process.env.POLYGONSCAN_API_KEY || "",
    customChains: [
      {
        network: "polygon_amoy",
        chainId: 80002,
        urls: {
          apiURL: "https://api-amoy.polygonscan.com/api", // check if V2 supported
          browserURL: "https://amoy.polygonscan.com/",
        },
      },
    ],
  },
  sourcify: {
    enabled: true, // fallback verification if Etherscan fails
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
