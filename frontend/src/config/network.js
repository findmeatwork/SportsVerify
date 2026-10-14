const networks = {
  sepolia: {
    chainId: 11155111,
    chainName: "Sepolia",
    rpcUrl: null,
    blockExplorerUrl: "https://sepolia.etherscan.io",
  },
  localhost: {
    chainId: 31337,
    chainName: "Localhost",
    rpcUrl: "http://127.0.0.1:8545",
    blockExplorerUrl: null,
  },
};

const viteTargetNetwork = import.meta.env?.VITE_TARGET_CHAIN;
const nodeTargetNetwork = typeof process !== "undefined" ? process.env.VITE_TARGET_CHAIN : null;

export const targetNetwork = viteTargetNetwork || nodeTargetNetwork || "sepolia";
const selectedNetwork = networks[targetNetwork];

if (!selectedNetwork) {
  throw new Error(`Unsupported VITE_TARGET_CHAIN "${targetNetwork}". Use "sepolia" or "localhost".`);
}

export const chainId = selectedNetwork.chainId;
export const chainName = selectedNetwork.chainName;
export const chainIdHex = `0x${chainId.toString(16)}`;
export const rpcUrl = selectedNetwork.rpcUrl;
export const blockExplorerUrl = selectedNetwork.blockExplorerUrl;