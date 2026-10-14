const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
require("@nomicfoundation/hardhat-toolbox");

const networks = {
  hardhat: {},
  localhost: {
    url: "http://127.0.0.1:8545",
  },
  sepolia: {
    url: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
    chainId: 11155111,
  },
};

if (process.env.PRIVATE_KEY) {
  networks.sepolia.accounts = [process.env.PRIVATE_KEY];
}

module.exports = {
  solidity: "0.8.24",
  networks,
};